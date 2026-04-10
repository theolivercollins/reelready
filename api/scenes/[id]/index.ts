import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../../../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const id = req.query.id as string;
    const supabase = getSupabase();

    const { data: scene, error } = await supabase
      .from('scenes')
      .select('*, photos(*)')
      .eq('id', id)
      .single();

    if (error) throw error;

    const { data: logs } = await supabase
      .from('pipeline_logs')
      .select()
      .eq('scene_id', id)
      .order('created_at', { ascending: true });

    return res.status(200).json({ ...scene, logs: logs ?? [] });
  } catch {
    return res.status(404).json({ error: 'Scene not found' });
  }
}
