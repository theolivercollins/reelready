import { createClient } from '@supabase/supabase-js';
import type { Property, Photo, Scene, PipelineLog, DailyStat } from './types';

const API_BASE = '';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://vrhmaeywqsohlztoouxu.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyaG1hZXl3cXNvaGx6dG9vdXh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDIxOTIsImV4cCI6MjA5MTQxODE5Mn0.GaiexH5L24zAoLgvjOUiixbHdnQW8kUMXXbyjnM8cM4';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, options);
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

export async function createProperty(data: {
  address: string; price: number; bedrooms: number; bathrooms: number;
  listing_agent: string; brokerage: string; photos: File[];
}): Promise<{ id: string; status: string; photoCount: number }> {
  // Generate a temporary property ID for organizing uploads
  const tempId = crypto.randomUUID();

  // Upload photos directly to Supabase Storage (bypasses 4.5MB body limit)
  const uploadedPaths: string[] = [];
  for (let i = 0; i < data.photos.length; i++) {
    const file = data.photos[i];
    const fileName = `${Date.now()}_${i}_${file.name}`;
    const storagePath = `${tempId}/raw/${fileName}`;

    const { error } = await supabase.storage
      .from('property-photos')
      .upload(storagePath, file, { contentType: file.type });

    if (!error) {
      uploadedPaths.push(storagePath);
    }
  }

  // Send metadata + storage paths to API (small JSON payload)
  return apiFetch('/api/properties', {
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
}

export async function rerunProperty(id: string): Promise<void> {
  return apiFetch(`/api/properties/${id}/rerun`, { method: 'POST' });
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
