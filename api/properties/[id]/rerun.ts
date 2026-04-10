import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getProperty, updatePropertyStatus } from '../../../lib/db.js';
async function loadPipeline() {
  const mod = await import('../../../lib/pipeline.js');
  return mod.runPipeline;
}

export const maxDuration = 300;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const id = req.query.id as string;
    await getProperty(id); // verify exists
    await updatePropertyStatus(id, 'queued');

    const runPipeline = await loadPipeline();
    runPipeline(id).catch((err: unknown) => console.error('Rerun error:', err));

    return res.status(200).json({ message: 'Pipeline restarted', status: 'queued' });
  } catch {
    return res.status(500).json({ error: 'Failed to rerun' });
  }
}
