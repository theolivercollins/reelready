import type { Property, Photo, Scene, PipelineLog, DailyStat } from './types';
import { supabase } from './supabase';

const API_BASE = '';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${text || res.statusText}`);
  }
  // Handle 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function fetchProperties(params?: {
  page?: number; limit?: number; status?: string; search?: string;
}): Promise<{ properties: Property[]; total: number; page: number; totalPages: number }> {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', String(params.page));
  if (params?.limit) sp.set('limit', String(params.limit));
  if (params?.status) sp.set('status', params.status);
  if (params?.search) sp.set('search', params.search);
  const qs = sp.toString();
  return apiFetch(`/api/properties${qs ? `?${qs}` : ''}`);
}

export async function fetchProperty(id: string): Promise<Property & { photos: Photo[]; scenes: Scene[] }> {
  return apiFetch(`/api/properties/${id}`);
}

export async function fetchPropertyStatus(id: string): Promise<{
  id: string; address: string; status: string; currentStage: number; totalStages: number;
  clipsCompleted: number; clipsTotal: number; horizontalVideoUrl: string | null;
  verticalVideoUrl: string | null; createdAt: string; processingTimeMs: number | null;
}> {
  return apiFetch(`/api/properties/${id}/status`);
}

export async function createProperty(
  data: {
    address: string; price: number; bedrooms: number; bathrooms: number;
    listing_agent: string; brokerage: string; photos: File[];
  },
  onProgress?: (uploaded: number, total: number) => void,
): Promise<{ id: string; status: string; photoCount: number }> {
  const tempId = crypto.randomUUID();
  const total = data.photos.length;
  let uploaded = 0;

  // Upload photos in parallel batches of 5 for speed
  const BATCH_SIZE = 5;
  const uploadedPaths: string[] = [];

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = data.photos.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (file, j) => {
        const fileName = `${Date.now()}_${i + j}_${file.name}`;
        const storagePath = `${tempId}/raw/${fileName}`;
        const { error } = await supabase.storage
          .from('property-photos')
          .upload(storagePath, file, { contentType: file.type });
        uploaded++;
        onProgress?.(uploaded, total);
        if (error) {
          console.error(`Failed to upload ${file.name}:`, error.message);
          return null;
        }
        return storagePath;
      })
    );
    uploadedPaths.push(...results.filter((p): p is string => p !== null));
  }

  if (uploadedPaths.length === 0) {
    throw new Error(`All ${total} photo uploads failed. Check browser console for details.`);
  }

  // API call is instant — just sends paths + metadata
  const result = await apiFetch<{ id: string; status: string; photoCount: number }>('/api/properties', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: data.address,
      price: data.price,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      listing_agent: data.listing_agent,
      brokerage: data.brokerage,
      tempId,
      photoPaths: uploadedPaths,
    }),
  });

  // Trigger pipeline in a separate long-running function (fire-and-forget)
  triggerPipeline(result.id);

  return result;
}

export async function createPropertyFromDrive(data: {
  address: string; price: number; bedrooms: number; bathrooms: number;
  listing_agent: string; brokerage: string; driveLink: string;
}): Promise<{ id: string; status: string; photoCount: number }> {
  const result = await apiFetch<{ id: string; status: string; photoCount: number }>('/api/properties', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: data.address,
      price: data.price,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      listing_agent: data.listing_agent,
      brokerage: data.brokerage,
      driveLink: data.driveLink,
    }),
  });

  // Trigger pipeline in a separate long-running function (fire-and-forget)
  triggerPipeline(result.id);

  return result;
}

// Fire-and-forget: triggers the pipeline in a separate 300s function
function triggerPipeline(propertyId: string) {
  fetch(`/api/pipeline/${propertyId}`, { method: 'POST' }).catch(() => {});
}

export async function rerunProperty(id: string): Promise<void> {
  await apiFetch(`/api/properties/${id}/rerun`, { method: 'POST' });
  triggerPipeline(id);
}

export async function fetchLogs(params?: {
  page?: number; limit?: number; stage?: string; level?: string; property_id?: string;
}): Promise<{ logs: (PipelineLog & { properties?: { address: string } })[]; total: number; page: number; totalPages: number }> {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', String(params.page));
  if (params?.limit) sp.set('limit', String(params.limit));
  if (params?.stage) sp.set('stage', params.stage);
  if (params?.level) sp.set('level', params.level);
  if (params?.property_id) sp.set('property_id', params.property_id);
  const qs = sp.toString();
  return apiFetch(`/api/logs${qs ? `?${qs}` : ''}`);
}

export async function fetchStatsOverview(): Promise<{
  completedToday: number; submittedToday: number; inPipeline: number; needsReview: number;
  avgProcessingMs: number; totalCostTodayCents: number; avgCostPerVideoCents: number; successRate: number;
}> {
  return apiFetch('/api/stats/overview');
}

export async function fetchDailyStats(days?: number): Promise<{ stats: DailyStat[] }> {
  const qs = days ? `?days=${days}` : '';
  return apiFetch(`/api/stats/daily${qs}`);
}

export async function approveScene(id: string): Promise<void> {
  return apiFetch(`/api/scenes/${id}/approve`, { method: 'POST' });
}

export async function retryScene(id: string, prompt: string): Promise<void> {
  return apiFetch(`/api/scenes/${id}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
}

export async function skipScene(id: string): Promise<void> {
  return apiFetch(`/api/scenes/${id}/skip`, { method: 'POST' });
}
