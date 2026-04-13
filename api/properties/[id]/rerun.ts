import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getProperty, getSupabase, updatePropertyStatus } from '../../../lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const id = req.query.id as string;
    await getProperty(id); // verify exists

    // Wipe previous generation artifacts so a rerun is a clean slate.
    // The actual pipeline is launched by the client hitting /api/pipeline/[id]
    // exactly once after this endpoint returns.
    const supabase = getSupabase();
    await supabase.from('scenes').delete().eq('property_id', id);
    await supabase.from('pipeline_logs').delete().eq('property_id', id);
    await supabase
      .from('properties')
      .update({
        total_cost_cents: 0,
        processing_time_ms: 0,
        selected_photo_count: 0,
        thumbnail_url: null,
        horizontal_video_url: null,
        vertical_video_url: null,
      })
      .eq('id', id);
    await updatePropertyStatus(id, 'queued');

    return res.status(200).json({ message: 'Pipeline reset', status: 'queued' });
  } catch {
    return res.status(500).json({ error: 'Failed to rerun' });
  }
}
