import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const [analysis, director, qc] = await Promise.all([
    import('../../lib/prompts/photo-analysis.js'),
    import('../../lib/prompts/director.js'),
    import('../../lib/prompts/qc-evaluator.js'),
  ]);

  return res.status(200).json({
    analysis: analysis.PHOTO_ANALYSIS_SYSTEM,
    director: director.DIRECTOR_SYSTEM,
    qc: qc.QC_SYSTEM,
  });
}
