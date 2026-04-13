import type { VercelRequest, VercelResponse } from '@vercel/node';

export const maxDuration = 300;

// Backstop poller for scenes that were submitted to a provider but never
// had their completed clip collected (e.g. because the pipeline function
// hit maxDuration mid-poll). Runs on a Vercel Cron every minute. Each
// call picks up scenes that have provider_task_id set and clip_url still
// null, polls the provider for each, downloads completed clips, and
// flips the owning property to complete / needs_review when all scenes
// have settled.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow manual invocation for debugging; Vercel Cron sends GET by default.
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { getSupabase, updatePropertyStatus, recordCostEvent, log } = await import('../../lib/db.js');
    const { selectProvider } = await import('../../lib/providers/router.js');

    const supabase = getSupabase();

    // Pick up any scene that's been submitted to a provider but doesn't
    // yet have a stored clip. Limit batch size to avoid function timeout.
    const { data: pending, error: pendingErr } = await supabase
      .from('scenes')
      .select('id, property_id, photo_id, scene_number, provider, provider_task_id, duration_seconds, attempt_count, submitted_at')
      .not('provider_task_id', 'is', null)
      .is('clip_url', null)
      .order('submitted_at', { ascending: true })
      .limit(30);

    if (pendingErr) throw pendingErr;
    if (!pending || pending.length === 0) {
      return res.status(200).json({ polled: 0, completed: 0, failed: 0, processing: 0 });
    }

    let completedCount = 0;
    let failedCount = 0;
    let processingCount = 0;
    const affectedProperties = new Set<string>();

    for (const scene of pending) {
      affectedProperties.add(scene.property_id);
      try {
        // Reconstruct provider instance. Pass empty room type + no preference —
        // selectProvider will return an instance of whatever scene.provider is
        // if it's still enabled. We don't need the routing logic here, just an
        // IVideoProvider matching scene.provider.
        if (!scene.provider) {
          failedCount++;
          continue;
        }
        // We use selectProvider to get the cached provider instance. Passing
        // the provider name as preference guarantees we get that exact one
        // (or fall through if disabled).
        const provider = selectProvider('other', scene.provider as any, []);
        if (provider.name !== scene.provider) {
          // Provider was disabled between submission and polling. Mark stuck.
          await supabase.from('scenes').update({ status: 'needs_review' }).eq('id', scene.id);
          await log(scene.property_id, 'generation', 'error',
            `Scene ${scene.scene_number}: provider ${scene.provider} no longer available for polling`, undefined, scene.id);
          failedCount++;
          continue;
        }

        const status = await provider.checkStatus(scene.provider_task_id as string);

        if (status.status === 'processing') {
          processingCount++;
          continue;
        }

        if (status.status === 'failed' || !status.videoUrl) {
          await supabase.from('scenes').update({ status: 'needs_review' }).eq('id', scene.id);
          await log(scene.property_id, 'generation', 'error',
            `Scene ${scene.scene_number}: ${scene.provider} task ${scene.provider_task_id} failed: ${status.error ?? 'unknown'}`, undefined, scene.id);
          failedCount++;
          continue;
        }

        // Complete — download + store.
        const clipBuffer = await provider.downloadClip(status.videoUrl);
        const clipPath = `${scene.property_id}/clips/scene_${scene.scene_number}_v${scene.attempt_count ?? 1}.mp4`;
        const { error: uploadErr } = await supabase.storage
          .from('property-videos')
          .upload(clipPath, clipBuffer, { contentType: 'video/mp4', upsert: true });
        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage.from('property-videos').getPublicUrl(clipPath);
        const costCents = status.costCents ?? 0;
        const genTimeMs = scene.submitted_at ? Date.now() - new Date(scene.submitted_at).getTime() : null;

        await supabase.from('scenes').update({
          status: 'qc_pass',
          clip_url: urlData.publicUrl,
          generation_cost_cents: costCents,
          generation_time_ms: genTimeMs,
          qc_verdict: 'auto_pass',
          qc_confidence: 1.0,
        }).eq('id', scene.id);

        await recordCostEvent({
          propertyId: scene.property_id,
          sceneId: scene.id,
          stage: 'generation',
          provider: provider.name,
          unitsConsumed: status.providerUnits,
          unitType: status.providerUnitType ?? null,
          costCents,
          metadata: {
            scene_number: scene.scene_number,
            duration_seconds: scene.duration_seconds,
            generation_time_ms: genTimeMs,
            source: 'cron',
          },
        });
        await log(scene.property_id, 'generation', 'info',
          `Scene ${scene.scene_number}: recovered by cron from ${scene.provider}`, { costCents, providerUnits: status.providerUnits }, scene.id);

        completedCount++;
      } catch (err) {
        failedCount++;
        const msg = err instanceof Error ? err.message : String(err);
        await log(scene.property_id, 'generation', 'warn',
          `Cron poll failed for scene ${scene.scene_number}: ${msg}`, undefined, scene.id);
      }
    }

    // For every property we touched, check if all its scenes have settled
    // (either passed or needs_review with no pending task). If so, finalize.
    for (const propertyId of affectedProperties) {
      const { data: scenes } = await supabase
        .from('scenes')
        .select('status, clip_url, provider_task_id')
        .eq('property_id', propertyId);

      if (!scenes) continue;
      const stillPending = scenes.some(s => s.provider_task_id && !s.clip_url && s.status !== 'needs_review');
      if (stillPending) continue;

      const passed = scenes.filter(s => s.status === 'qc_pass').length;
      const needsReview = scenes.filter(s => s.status === 'needs_review').length;
      const finalStatus = needsReview > 0 && passed < 6 ? 'needs_review' : 'complete';

      // Only flip if the property is still in a non-terminal state — don't
      // clobber an already-completed property.
      const { data: prop } = await supabase
        .from('properties')
        .select('status, created_at')
        .eq('id', propertyId)
        .single();
      if (!prop) continue;
      const terminal = prop.status === 'complete' || prop.status === 'failed';
      if (terminal) continue;

      const processingTimeMs = Date.now() - new Date(prop.created_at).getTime();
      await updatePropertyStatus(propertyId, finalStatus, {
        processing_time_ms: processingTimeMs,
        thumbnail_url: scenes.find(s => s.clip_url)?.clip_url ?? null,
      });
      await log(propertyId, 'delivery', 'info',
        `Pipeline finalized by cron: ${passed}/${scenes.length} clips ready`);
    }

    return res.status(200).json({
      polled: pending.length,
      completed: completedCount,
      failed: failedCount,
      processing: processingCount,
      propertiesChecked: affectedProperties.size,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: 'Cron failed', detail: msg });
  }
}
