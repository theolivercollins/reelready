import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createProperty,
  getSupabase,
  updatePropertyStatus,
  insertPhotos,
} from '../../lib/db.js';
// Dynamic import to avoid loading heavy pipeline deps for GET requests
async function loadPipeline() {
  const mod = await import('../../lib/pipeline.js');
  return mod.runPipeline;
}

export const maxDuration = 300;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return handleGet(req, res);
  }
  if (req.method === 'POST') {
    return handlePost(req, res);
  }
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  try {
    const page = parseInt((req.query.page as string) ?? '1', 10);
    const limit = parseInt((req.query.limit as string) ?? '25', 10);
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const offset = (page - 1) * limit;

    let query = getSupabase()
      .from('properties')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (search) query = query.ilike('address', `%${search}%`);

    const { data, count, error } = await query;
    if (error) throw error;

    return res.status(200).json({
      properties: data,
      total: count,
      page,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to list properties' });
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  try {
    const { address, price, bedrooms, bathrooms, listing_agent, brokerage, tempId, photoPaths } = req.body;

    if (!address || !price || !bedrooms || !bathrooms || !listing_agent) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Create property record
    const property = await createProperty({
      address,
      price: parseInt(price, 10),
      bedrooms: parseInt(bedrooms, 10),
      bathrooms: parseFloat(bathrooms),
      listing_agent,
      brokerage: brokerage || undefined,
    });

    // Photos were already uploaded to Supabase Storage by the frontend
    // under tempId/raw/. Move references to the property record.
    const supabase = getSupabase();
    const photoRecords: Array<{ property_id: string; file_url: string; file_name: string }> = [];

    if (photoPaths && Array.isArray(photoPaths)) {
      for (const storagePath of photoPaths) {
        const fileName = storagePath.split('/').pop() || 'unknown.jpg';
        const { data: urlData } = supabase.storage
          .from('property-photos')
          .getPublicUrl(storagePath);

        photoRecords.push({
          property_id: property.id,
          file_url: urlData.publicUrl,
          file_name: fileName,
        });
      }
    }

    if (photoRecords.length > 0) {
      await insertPhotos(photoRecords);
      await getSupabase()
        .from('properties')
        .update({ photo_count: photoRecords.length })
        .eq('id', property.id);
    }

    // Start pipeline in background (non-blocking)
    const runPipeline = await loadPipeline();
    runPipeline(property.id).catch(async (err: unknown) => {
      console.error('Pipeline error:', err);
    });

    return res.status(201).json({
      id: property.id,
      status: 'queued',
      photoCount: photoRecords.length,
      message: 'Video generation started',
    });
  } catch (err) {
    console.error('Error creating property:', err);
    return res.status(500).json({ error: 'Failed to create property' });
  }
}
