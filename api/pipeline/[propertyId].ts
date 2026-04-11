import type { VercelRequest, VercelResponse } from '@vercel/node';

export const maxDuration = 300;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const propertyId = req.query.propertyId as string;
  if (!propertyId) {
    return res.status(400).json({ error: 'Missing propertyId' });
  }

  try {
    // Dynamic import to load pipeline only when needed
    const { runPipeline } = await import('../../lib/pipeline.js');

    // Run the pipeline synchronously — this function stays alive for up to 300s
    await runPipeline(propertyId);

    return res.status(200).json({ status: 'complete', propertyId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Pipeline failed for ${propertyId}:`, msg);
    return res.status(500).json({ status: 'failed', propertyId, error: msg });
  }
}
