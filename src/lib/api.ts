import type { Property, Photo, Scene, PipelineLog, DailyStat } from './types';

const API_BASE = '';

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
  listing_agent: string; brokerage: string; photos: string[];
}): Promise<{ id: string; status: string; photoCount: number }> {
  return apiFetch('/api/properties', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
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
