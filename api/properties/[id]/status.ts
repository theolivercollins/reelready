import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getProperty, getScenesForProperty } from '../../../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const id = req.query.id as string;
    const property = await getProperty(id);
    const scenes = await getScenesForProperty(id);

    const stages = ['queued', 'analyzing', 'scripting', 'generating', 'qc', 'assembling', 'complete'];
    const currentStageIndex = stages.indexOf(property.status);
    const completedClips = scenes.filter((s: any) => s.status === 'qc_pass').length;

    return res.status(200).json({
      id: property.id,
      address: property.address,
      status: property.status,
      currentStage: currentStageIndex,
      totalStages: stages.length,
      clipsCompleted: completedClips,
      clipsTotal: scenes.length,
      horizontalVideoUrl: property.horizontal_video_url,
      verticalVideoUrl: property.vertical_video_url,
      createdAt: property.created_at,
      processingTimeMs: property.processing_time_ms,
    });
  } catch {
    return res.status(404).json({ error: 'Property not found' });
  }
}
