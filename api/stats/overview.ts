import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../../lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabase();
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    const [
      { count: completedToday },
      { count: submittedToday },
      { count: inPipeline },
      { count: needsReview },
      { data: completedData },
      { count: totalCompleted },
      { count: totalFailed },
    ] = await Promise.all([
      supabase.from('properties').select('*', { count: 'exact', head: true })
        .eq('status', 'complete').gte('updated_at', `${today}T00:00:00`),
      supabase.from('properties').select('*', { count: 'exact', head: true })
        .gte('created_at', `${today}T00:00:00`),
      supabase.from('properties').select('*', { count: 'exact', head: true })
        .in('status', ['queued', 'analyzing', 'scripting', 'generating', 'qc', 'assembling']),
      supabase.from('properties').select('*', { count: 'exact', head: true })
        .eq('status', 'needs_review'),
      supabase.from('properties').select('processing_time_ms, total_cost_cents')
        .eq('status', 'complete').gte('updated_at', `${today}T00:00:00`),
      supabase.from('properties').select('*', { count: 'exact', head: true })
        .eq('status', 'complete').gte('created_at', `${weekAgo}T00:00:00`),
      supabase.from('properties').select('*', { count: 'exact', head: true })
        .in('status', ['failed', 'needs_review']).gte('created_at', `${weekAgo}T00:00:00`),
    ]);

    const avgProcessingMs = completedData?.length
      ? completedData.reduce((s: number, p: any) => s + (p.processing_time_ms ?? 0), 0) / completedData.length
      : 0;
    const totalCostToday = completedData?.reduce((s: number, p: any) => s + (p.total_cost_cents ?? 0), 0) ?? 0;
    const avgCost = completedData?.length ? totalCostToday / completedData.length : 0;
    const total = (totalCompleted ?? 0) + (totalFailed ?? 0);
    const successRate = total > 0 ? ((totalCompleted ?? 0) / total) * 100 : 100;

    return res.status(200).json({
      completedToday: completedToday ?? 0,
      submittedToday: submittedToday ?? 0,
      inPipeline: inPipeline ?? 0,
      needsReview: needsReview ?? 0,
      avgProcessingMs: Math.round(avgProcessingMs),
      totalCostTodayCents: totalCostToday,
      avgCostPerVideoCents: Math.round(avgCost),
      successRate: Math.round(successRate * 10) / 10,
    });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
}
