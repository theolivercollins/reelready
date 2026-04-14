import { useParams, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, RotateCcw, Copy, Check, Loader2, AlertTriangle } from "lucide-react";
import { formatCents, formatDuration } from "@/lib/types";
import type { Property, Photo, Scene, PipelineLog, CostEvent } from "@/lib/types";
import { fetchProperty, fetchLogs, rerunProperty, fetchSystemPrompts } from "@/lib/api";

const statusTone: Record<string, string> = {
  complete: "text-accent",
  failed: "text-destructive",
  needs_review: "text-destructive",
};

const PropertyDetail = () => {
  const { id } = useParams();
  const [property, setProperty] = useState<(Property & { photos: Photo[]; scenes: Scene[]; costEvents: CostEvent[] }) | null>(null);
  const [logs, setLogs] = useState<(PipelineLog & { properties?: { address: string } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [prompts, setPrompts] = useState<{ analysis: string; director: string; qc: string } | null>(null);
  const [copiedScene, setCopiedScene] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [propData, logsData] = await Promise.all([
          fetchProperty(id),
          fetchLogs({ property_id: id, limit: 500 }),
        ]);
        if (cancelled) return;
        setProperty(propData);
        setLogs(logsData.logs);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load property");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleRerun = async () => {
    if (!id) return;
    setRerunning(true);
    try {
      await rerunProperty(id);
      const propData = await fetchProperty(id);
      setProperty(propData);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Rerun failed");
    } finally {
      setRerunning(false);
    }
  };

  const handleCopyPrompt = async (sceneId: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedScene(sceneId);
    setTimeout(() => setCopiedScene(null), 1500);
  };

  const loadPrompts = async () => {
    if (prompts) return;
    try {
      const data = await fetchSystemPrompts();
      setPrompts(data);
    } catch {
      // non-fatal
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="border border-destructive/40 bg-destructive/5 p-10">
        <div className="flex items-start gap-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-destructive/40 bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <div>
            <span className="label text-destructive">— Error</span>
            <p className="mt-3 text-sm text-muted-foreground">{error || "Property not found"}</p>
          </div>
        </div>
      </div>
    );
  }

  const photos = property.photos || [];
  const scenes = property.scenes || [];
  const costEvents = property.costEvents || [];
  const photoById = new Map(photos.map((p) => [p.id, p]));
  const deliverables = scenes.filter((s) => s.clip_url);
  const costTotalCents = costEvents.reduce((s, e) => s + (e.cost_cents ?? 0), 0);
  const tone = statusTone[property.status] || "text-foreground";

  return (
    <div className="space-y-16">
      {/* Header */}
      <div>
        <Link
          to="/dashboard/properties"
          className="label inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> All listings
        </Link>
        <div className="mt-6 flex items-end justify-between gap-6">
          <div>
            <span className={`label ${tone}`}>{property.status.replace("_", " ")}</span>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em]">{property.address}</h2>
            <p className="tabular mt-2 text-xs text-muted-foreground">
              {property.bedrooms}bd · {property.bathrooms}ba · ${property.price.toLocaleString()} · {property.listing_agent}
            </p>
          </div>
          <Button variant="outline" onClick={handleRerun} disabled={rerunning}>
            <RotateCcw className={`h-4 w-4 ${rerunning ? "animate-spin" : ""}`} /> Rerun pipeline
          </Button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid gap-px border border-border bg-border md:grid-cols-4">
        {[
          { label: "Total cost", value: formatCents(property.total_cost_cents) },
          {
            label: "Processing time",
            value: property.processing_time_ms > 0 ? formatDuration(property.processing_time_ms) : "—",
          },
          { label: "Photos", value: `${property.selected_photo_count} / ${property.photo_count}` },
          { label: "Clips delivered", value: `${deliverables.length} / ${scenes.length}` },
        ].map((s) => (
          <div key={s.label} className="bg-background p-6">
            <span className="label text-muted-foreground">{s.label}</span>
            <div className="tabular mt-4 text-2xl font-semibold tracking-[-0.02em]">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Deliverables */}
      {deliverables.length > 0 && (
        <section>
          <span className="label text-muted-foreground">— Deliverables</span>
          <h3 className="mt-3 text-xl font-semibold tracking-[-0.01em]">
            {deliverables.length} {deliverables.length === 1 ? "clip" : "clips"} ready
          </h3>
          <div className="mt-8 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {deliverables.map((scene) => (
              <div key={scene.id} className="border border-border bg-secondary/30">
                <video src={scene.clip_url!} controls playsInline preload="metadata" className="aspect-video w-full bg-black" />
                <div className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">
                      Scene {scene.scene_number} · {scene.camera_movement.replace(/_/g, " ")}
                    </p>
                    <p className="tabular mt-1 text-[10px] text-muted-foreground">
                      {scene.provider ?? "—"} · {scene.duration_seconds}s
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <a href={scene.clip_url!} download={`scene_${scene.scene_number}.mp4`}>
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Cost breakdown */}
      {costEvents.length > 0 && (
        <section>
          <span className="label text-muted-foreground">— Costs</span>
          <h3 className="mt-3 text-xl font-semibold tracking-[-0.01em]">
            Real per-call breakdown · <span className="text-muted-foreground">{formatCents(costTotalCents)}</span>
          </h3>
          <div className="mt-8 border-t border-border">
            <div className="grid grid-cols-[1.2fr_1fr_0.6fr_1fr_1fr] gap-6 border-b border-border py-4">
              <span className="label text-muted-foreground">Stage</span>
              <span className="label text-muted-foreground">Provider</span>
              <span className="label text-right text-muted-foreground">Scene</span>
              <span className="label text-right text-muted-foreground">Units</span>
              <span className="label text-right text-muted-foreground">Cost</span>
            </div>
            {costEvents.map((ev) => {
              const sceneNum = ev.scene_id ? scenes.find((s) => s.id === ev.scene_id)?.scene_number ?? "—" : "—";
              const unitsLabel =
                ev.units_consumed != null
                  ? `${Math.round(ev.units_consumed).toLocaleString()} ${ev.unit_type ?? ""}`.trim()
                  : "—";
              return (
                <div key={ev.id} className="grid grid-cols-[1.2fr_1fr_0.6fr_1fr_1fr] items-center gap-6 border-b border-border py-3 text-xs">
                  <span className="capitalize">{ev.stage}</span>
                  <span className="tabular">{ev.provider}</span>
                  <span className="tabular text-right text-muted-foreground">{sceneNum}</span>
                  <span className="tabular text-right">{unitsLabel}</span>
                  <span className="tabular text-right font-semibold">{formatCents(ev.cost_cents)}</span>
                </div>
              );
            })}
            <div className="grid grid-cols-[1.2fr_1fr_0.6fr_1fr_1fr] gap-6 py-5">
              <span className="label text-foreground">Total</span>
              <span /> <span /> <span />
              <span className="tabular text-right text-base font-semibold">{formatCents(costTotalCents)}</span>
            </div>
          </div>
        </section>
      )}

      {/* Tabs */}
      <Tabs defaultValue="photos" onValueChange={(v) => v === "prompts" && loadPrompts()}>
        <TabsList>
          <TabsTrigger value="photos">Photos · {photos.length}</TabsTrigger>
          <TabsTrigger value="shots">Shot plan · {scenes.length}</TabsTrigger>
          <TabsTrigger value="logs">Timeline</TabsTrigger>
          <TabsTrigger value="prompts">System prompts</TabsTrigger>
        </TabsList>

        {/* Photos */}
        <TabsContent value="photos" className="mt-10">
          {photos.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No photos</p>
          ) : (
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className={`border bg-secondary/30 ${photo.selected ? "border-foreground/60" : "border-border opacity-70"}`}
                >
                  <div className="relative aspect-[4/3] bg-secondary">
                    <img src={photo.file_url} alt={photo.file_name} className="h-full w-full object-cover" loading="lazy" />
                    <span
                      className={`label absolute left-2 top-2 px-2 py-1 ${
                        photo.selected ? "bg-foreground text-background" : "bg-destructive text-destructive-foreground"
                      }`}
                    >
                      {photo.selected ? "Selected" : "Discarded"}
                    </span>
                  </div>
                  <div className="space-y-2 p-3">
                    <div className="flex items-center justify-between">
                      <span className="label text-foreground">{photo.room_type?.replace(/_/g, " ") ?? "—"}</span>
                      <span className="tabular text-[10px] text-muted-foreground">depth {photo.depth_rating ?? "—"}</span>
                    </div>
                    <div className="tabular flex gap-3 text-[10px] text-muted-foreground">
                      <span>Q {photo.quality_score ?? "—"}</span>
                      <span>A {photo.aesthetic_score ?? "—"}</span>
                      {photo.video_viable === true && (
                        <span className="text-foreground">✓ video</span>
                      )}
                      {photo.video_viable === false && (
                        <span className="text-destructive">✕ video</span>
                      )}
                    </div>
                    {photo.video_viable && photo.suggested_motion && (
                      <p className="text-[10px] leading-tight text-muted-foreground">
                        <span className="tabular text-foreground">{photo.suggested_motion.replace(/_/g, " ")}</span>
                        {photo.motion_rationale && <span> · {photo.motion_rationale}</span>}
                      </p>
                    )}
                    {photo.key_features && photo.key_features.length > 0 && (
                      <p className="line-clamp-2 text-[10px] leading-tight text-muted-foreground">
                        {photo.key_features.join(" · ")}
                      </p>
                    )}
                    {!photo.selected && photo.discard_reason && (
                      <p className="border-t border-border/50 pt-2 text-[11px] leading-snug text-destructive">
                        {photo.discard_reason}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Shot plan */}
        <TabsContent value="shots" className="mt-10">
          {scenes.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No scenes yet</p>
          ) : (
            <div className="grid gap-px bg-border">
              {scenes.map((scene) => {
                const sourcePhoto = photoById.get(scene.photo_id);
                return (
                  <div key={scene.id} className="bg-background p-6">
                    <div className="flex items-start gap-4">
                      {sourcePhoto ? (
                        <img src={sourcePhoto.file_url} alt={sourcePhoto.file_name} className="h-16 w-24 shrink-0 object-cover" />
                      ) : (
                        <div className="h-16 w-24 shrink-0 bg-secondary" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="tabular text-sm font-semibold">#{scene.scene_number}</span>
                          <span className="text-xs font-medium capitalize">{scene.camera_movement?.replace(/_/g, " ")}</span>
                          <span className="label text-muted-foreground">{scene.status?.replace(/_/g, " ")}</span>
                          {scene.provider && <span className="label text-muted-foreground">{scene.provider}</span>}
                        </div>
                        <p className="tabular mt-1 text-[10px] text-muted-foreground">
                          source: {sourcePhoto?.file_name ?? "—"} · {sourcePhoto?.room_type?.replace(/_/g, " ") ?? "—"}
                        </p>
                      </div>
                    </div>

                    {/* Prompt */}
                    <div className="mt-5">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="label text-muted-foreground">Prompt sent to {scene.provider ?? "provider"}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyPrompt(scene.id, scene.prompt)}
                          className="label inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {copiedScene === scene.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {copiedScene === scene.id ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <pre className="whitespace-pre-wrap border border-border bg-secondary/30 p-4 text-[11px] leading-relaxed">
                        {scene.prompt}
                      </pre>
                    </div>

                    {/* Metadata */}
                    <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-5 md:grid-cols-3 lg:grid-cols-6">
                      {[
                        { l: "Duration", v: `${scene.duration_seconds}s` },
                        { l: "Attempts", v: scene.attempt_count ?? 0 },
                        { l: "Gen time", v: scene.generation_time_ms ? formatDuration(scene.generation_time_ms) : "—" },
                        { l: "Cost", v: scene.generation_cost_cents ? formatCents(scene.generation_cost_cents) : "—" },
                        { l: "QC verdict", v: scene.qc_verdict ?? "—" },
                        { l: "QC confidence", v: scene.qc_confidence != null ? `${Math.round(scene.qc_confidence * 100)}%` : "—" },
                      ].map((m) => (
                        <div key={m.l}>
                          <p className="label text-muted-foreground">{m.l}</p>
                          <p className="tabular mt-1.5 text-xs">{m.v}</p>
                        </div>
                      ))}
                    </div>

                    {/* Output clip */}
                    {scene.clip_url && (
                      <div className="mt-5">
                        <span className="label text-muted-foreground">Output clip</span>
                        <video
                          src={scene.clip_url}
                          controls
                          playsInline
                          preload="metadata"
                          className="mt-3 aspect-video w-full max-w-md bg-black"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Timeline */}
        <TabsContent value="logs" className="mt-10">
          <div className="max-h-[640px] overflow-y-auto border border-border bg-secondary/20">
            {logs.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">No logs for this property</p>
            ) : (
              <div className="divide-y divide-border/60">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="grid grid-cols-[80px_90px_60px_1fr] items-start gap-4 px-5 py-2.5 text-[11px] leading-relaxed"
                  >
                    <span className="tabular text-muted-foreground/60">
                      {new Date(log.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <span className="label text-muted-foreground">{log.stage}</span>
                    <span
                      className={`label ${
                        log.level === "error"
                          ? "text-destructive"
                          : log.level === "warn"
                          ? "text-accent"
                          : "text-muted-foreground"
                      }`}
                    >
                      {log.level}
                    </span>
                    <span
                      className={
                        log.level === "error"
                          ? "text-destructive"
                          : log.level === "warn"
                          ? "text-accent"
                          : "text-foreground"
                      }
                    >
                      {log.message}
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <span className="ml-2 text-muted-foreground">{JSON.stringify(log.metadata)}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* System prompts */}
        <TabsContent value="prompts" className="mt-10 space-y-12">
          {!prompts ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            [
              { label: "Photo analysis", desc: "Used by Claude Sonnet to score every photo on quality, aesthetics, depth, and room type.", body: prompts.analysis },
              { label: "Director (shot planning)", desc: "Used to turn selected photos into an ordered shot list.", body: prompts.director },
              { label: "QC evaluator", desc: "Used to judge generated clips. Currently auto-passing pending frame-extraction infra.", body: prompts.qc },
            ].map((p) => (
              <section key={p.label}>
                <span className="label text-muted-foreground">— {p.label}</span>
                <h3 className="mt-3 text-lg font-semibold tracking-[-0.01em]">{p.label}</h3>
                <p className="mt-2 text-xs text-muted-foreground">{p.desc}</p>
                <pre className="mt-6 max-h-[480px] overflow-y-auto whitespace-pre-wrap border border-border bg-secondary/30 p-5 text-[11px] leading-relaxed">
                  {p.body}
                </pre>
              </section>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PropertyDetail;
