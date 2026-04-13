import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getProperty, getPhotosForProperty, getScenesForProperty, getSupabase } from '../../lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const id = req.query.id as string;
    const property = await getProperty(id);
    const photos = await getPhotosForProperty(id);
    const scenes = await getScenesForProperty(id);
    const supabase = getSupabase();
    const [{ data: costEvents }, { data: allocationDecisions }] = await Promise.all([
      supabase
        .from('cost_events')
        .select('id, scene_id, stage, provider, units_consumed, unit_type, cost_cents, metadata, created_at')
        .eq('property_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('allocation_decisions')
        .select()
        .eq('property_id', id)
        .order('room_type'),
    ]);

    return res.status(200).json({
      ...property,
      photos,
      scenes,
      costEvents: costEvents ?? [],
      allocationDecisions: allocationDecisions ?? [],
    });
  } catch {
    return res.status(404).json({ error: 'Property not found' });
  }
}
