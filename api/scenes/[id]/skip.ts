import type { VercelRequest, VercelResponse } from '@vercel/node';
import { updateScene, log, getSupabase } from '../../../lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const id = req.query.id as string;

    const { data: scene } = await getSupabase()
      .from('scenes')
      .select('property_id, scene_number')
      .eq('id', id)
      .single();

    if (!scene) {
      return res.status(404).json({ error: 'Scene not found' });
    }

    await updateScene(id, { status: 'qc_pass', clip_url: null });
    await log(scene.property_id, 'qc', 'info',
      `Scene ${scene.scene_number} skipped`, undefined, id);

    return res.status(200).json({ message: 'Scene skipped' });
  } catch {
    return res.status(500).json({ error: 'Failed to skip' });
  }
}
