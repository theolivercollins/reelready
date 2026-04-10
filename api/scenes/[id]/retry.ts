import type { VercelRequest, VercelResponse } from '@vercel/node';
import { updateScene, log, getSupabase } from '../../../lib/db';

export const maxDuration = 300;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const id = req.query.id as string;
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const { data: scene } = await getSupabase()
      .from('scenes')
      .select('property_id, scene_number')
      .eq('id', id)
      .single();

    if (!scene) {
      return res.status(404).json({ error: 'Scene not found' });
    }

    await updateScene(id, { prompt, status: 'pending' });
    await log(scene.property_id, 'generation', 'info',
      `Scene ${scene.scene_number} retried with new prompt`, { newPrompt: prompt }, id);

    // TODO: trigger single-scene regeneration

    return res.status(200).json({ message: 'Scene queued for retry' });
  } catch {
    return res.status(500).json({ error: 'Failed to retry' });
  }
}
