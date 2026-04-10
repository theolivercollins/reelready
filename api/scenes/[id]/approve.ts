import type { VercelRequest, VercelResponse } from '@vercel/node';
import { updateSceneStatus, log, getSupabase } from '../../../lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const id = req.query.id as string;
    await updateSceneStatus(id, 'qc_pass');

    const { data: scene } = await getSupabase()
      .from('scenes')
      .select('property_id, scene_number')
      .eq('id', id)
      .single();

    if (scene) {
      await log(scene.property_id, 'qc', 'info',
        `Scene ${scene.scene_number} manually approved`, undefined, id);
    }

    return res.status(200).json({ message: 'Scene approved' });
  } catch {
    return res.status(500).json({ error: 'Failed to approve' });
  }
}
