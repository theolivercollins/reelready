import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createProperty,
  getSupabase,
  updatePropertyStatus,
  insertPhotos,
} from '../../lib/db.js';
import { runPipeline } from '../../lib/pipeline.js';

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
    const { address, price, bedrooms, bathrooms, listing_agent, brokerage, photos: photoDataUrls } = req.body;

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

    // If photos are provided as base64 data URLs, upload them
    const supabase = getSupabase();
    const photoRecords: Array<{ property_id: string; file_url: string; file_name: string }> = [];

    if (photoDataUrls && Array.isArray(photoDataUrls)) {
      for (let i = 0; i < photoDataUrls.length; i++) {
        const photoData = photoDataUrls[i];
        const fileName = `${Date.now()}_photo_${i}.jpg`;
        const storagePath = `${property.id}/raw/${fileName}`;

        // Handle base64 data URL
        const base64Match = photoData.match(/^data:(.+);base64,(.+)$/);
        if (base64Match) {
          const contentType = base64Match[1];
          const buffer = Buffer.from(base64Match[2], 'base64');

          const { error: uploadError } = await supabase.storage
            .from('property-photos')
            .upload(storagePath, buffer, { contentType });

          if (!uploadError) {
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
    runPipeline(property.id).catch(async (err) => {
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
