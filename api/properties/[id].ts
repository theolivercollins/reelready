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
    const { data: costEvents } = await getSupabase()
      .from('cost_events')
      .select('id, scene_id, stage, provider, units_consumed, unit_type, cost_cents, metadata, created_at')
      .eq('property_id', id)
      .order('created_at', { ascending: true });

    return res.status(200).json({ ...property, photos, scenes, costEvents: costEvents ?? [] });
  } catch {
    return res.status(404).json({ error: 'Property not found' });
  }
}
