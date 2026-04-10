import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getProperty, getPhotosForProperty, getScenesForProperty } from '../../lib/db.js';

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

    return res.status(200).json({ ...property, photos, scenes });
  } catch {
    return res.status(404).json({ error: 'Property not found' });
  }
}
