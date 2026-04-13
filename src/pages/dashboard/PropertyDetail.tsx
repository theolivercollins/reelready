import { useParams, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Download, RotateCcw, Camera, Clock, DollarSign, Copy, Check, Loader2, AlertTriangle } from "lucide-react";
import { getStatusColor, formatCents, formatDuration } from "@/lib/types";
import type { Property, Photo, Scene, PipelineLog } from "@/lib/types";
import { fetchProperty, fetchLogs, rerunProperty, fetchSystemPrompts } from "@/lib/api";

const PropertyDetail = () => {
  const { id } = useParams();
  const [property, setProperty] = useState<(Property & { photos: Photo[]; scenes: Scene[] }) | null>(null);
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
      } catch (err: any) {
        if (cancelled) return;
        setError(err.message || "Failed to load property");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id]);

  const handleRerun = async () => {
    if (!id) return;
    setRerunning(true);
    try {
      await rerunProperty(id);
      const propData = await fetchProperty(id);
      setProperty(propData);
    } catch (err: any) {
      alert(`Failed to rerun: ${err.message}`);
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
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-2">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-sm text-destructive">{error || "Property not found"}</p>
        </div>
      </div>
    );
  }

  const photos = property.photos || [];
  const scenes = property.scenes || [];
  const photoById = new Map(photos.map(p => [p.id, p]));
  const deliverables = scenes.filter(s => s.clip_url);

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/dashboard/properties"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">{property.address}</h1>
          <p className="text-sm text-muted-foreground font-mono">
            {property.bedrooms} bed • {property.bathrooms} bath • ${property.price.toLocaleString()} • {property.listing_agent}
          </p>
        </div>
        <Badge className={getStatusColor(property.status)} variant="secondary">{property.status}</Badge>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Cost", value: formatCents(property.total_cost_cents), icon: DollarSign },
          { label: "Processing Time", value: property.processing_time_ms > 0 ? formatDuration(property.processing_time_ms) : "In progress", icon: Clock },
          { label: "Photos", value: `${property.selected_photo_count}/${property.photo_count} selected`, icon: Camera },
          { label: "Clips Delivered", value: `${deliverables.length}/${scenes.length}`, icon: null },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="font-mono text-sm font-semibold mt-1">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="gap-2" onClick={handleRerun} disabled={rerunning}>
          <RotateCcw className={`h-4 w-4 ${rerunning ? "animate-spin" : ""}`} /> Rerun Pipeline
        </Button>
      </div>

      {/* Deliverables */}
      {deliverables.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              Deliverables
              <Badge variant="secondary" className="text-[10px] h-4">{deliverables.length} clip{deliverables.length === 1 ? "" : "s"}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {deliverables.map(scene => (
                <div key={scene.id} className="border border-border rounded-md overflow-hidden bg-card">
                  <video
                    src={scene.clip_url!}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full aspect-video bg-black"
                  />
                  <div className="p-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">
                        Scene {scene.scene_number} · {scene.camera_movement.replace(/_/g, " ")}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {scene.provider ?? "—"} · {scene.duration_seconds}s
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1 shrink-0" asChild>
                      <a href={scene.clip_url!} download={`scene_${scene.scene_number}.mp4`}>
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Superview tabs */}
      <Tabs defaultValue="photos" onValueChange={(v) => { if (v === "prompts") loadPrompts(); }}>
        <TabsList>
          <TabsTrigger value="photos">Photos ({photos.length})</TabsTrigger>
          <TabsTrigger value="shots">Shot Plan ({scenes.length})</TabsTrigger>
          <TabsTrigger value="logs">Timeline</TabsTrigger>
          <TabsTrigger value="prompts">System Prompts</TabsTrigger>
        </TabsList>

        {/* ─── PHOTOS — Claude vision ratings overlaid on each image ─── */}
        <TabsContent value="photos" className="space-y-3">
          {photos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No photos</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {photos.map(photo => (
                <div
                  key={photo.id}
                  className={`border rounded-md overflow-hidden bg-card ${
                    photo.selected ? "border-primary" : "border-border opacity-70"
                  }`}
                >
                  <div className="relative aspect-[4/3] bg-muted">
                    <img
                      src={photo.file_url}
                      alt={photo.file_name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {photo.selected && (
                      <Badge className="absolute top-1.5 left-1.5 bg-primary text-primary-foreground text-[9px] h-4 px-1.5">
                        SELECTED
                      </Badge>
                    )}
                    {!photo.selected && photo.discard_reason && (
                      <Badge className="absolute top-1.5 left-1.5 bg-destructive text-destructive-foreground text-[9px] h-4 px-1.5">
                        {photo.discard_reason}
                      </Badge>
                    )}
                  </div>
                  <div className="p-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium capitalize">
                        {photo.room_type?.replace(/_/g, " ") ?? "—"}
                      </span>
                      <Badge variant="secondary" className="text-[9px] h-4 px-1">
                        depth: {photo.depth_rating ?? "—"}
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      <Badge variant="secondary" className="text-[9px] h-4 px-1 font-mono">
                        Q {photo.quality_score ?? "—"}
                      </Badge>
                      <Badge variant="secondary" className="text-[9px] h-4 px-1 font-mono">
                        A {photo.aesthetic_score ?? "—"}
                      </Badge>
                    </div>
                    {photo.key_features && photo.key_features.length > 0 && (
                      <p className="text-[10px] text-muted-foreground leading-tight line-clamp-2">
                        {photo.key_features.join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── SHOT PLAN — verbatim prompt + inline clip + full metadata ─── */}
        <TabsContent value="shots" className="space-y-3">
          {scenes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No scenes yet</p>
          ) : (
            scenes.map(scene => {
              const sourcePhoto = photoById.get(scene.photo_id);
              return (
                <Card key={scene.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      {sourcePhoto ? (
                        <img
                          src={sourcePhoto.file_url}
                          alt={sourcePhoto.file_name}
                          className="w-24 h-16 object-cover rounded bg-muted shrink-0"
                        />
                      ) : (
                        <div className="w-24 h-16 bg-muted rounded shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-semibold">#{scene.scene_number}</span>
                          <span className="text-xs font-medium capitalize">
                            {scene.camera_movement?.replace(/_/g, " ")}
                          </span>
                          <Badge variant="secondary" className={`text-[9px] h-4 px-1 ${getStatusColor(scene.status)}`}>
                            {scene.status?.replace(/_/g, " ")}
                          </Badge>
                          {scene.provider && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">
                              {scene.provider}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          source: {sourcePhoto?.file_name ?? "—"} · {sourcePhoto?.room_type?.replace(/_/g, " ") ?? "—"}
                        </p>
                      </div>
                    </div>

                    {/* Verbatim prompt */}
                    <div className="relative">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] tracking-wider uppercase text-muted-foreground font-semibold">
                          Prompt sent to {scene.provider ?? "provider"}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 gap-1 text-[10px]"
                          onClick={() => handleCopyPrompt(scene.id, scene.prompt)}
                        >
                          {copiedScene === scene.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {copiedScene === scene.id ? "Copied" : "Copy"}
                        </Button>
                      </div>
                      <pre className="bg-muted/50 border border-border rounded p-2 text-[11px] font-mono whitespace-pre-wrap leading-relaxed">
                        {scene.prompt}
                      </pre>
                    </div>

                    {/* Metadata grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-1 border-t border-border">
                      <div>
                        <p className="text-muted-foreground text-[10px]">Duration</p>
                        <p className="font-mono">{scene.duration_seconds}s</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-[10px]">Attempts</p>
                        <p className="font-mono">{scene.attempt_count ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-[10px]">Gen Time</p>
                        <p className="font-mono">{scene.generation_time_ms ? formatDuration(scene.generation_time_ms) : "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-[10px]">Cost</p>
                        <p className="font-mono">{scene.generation_cost_cents ? formatCents(scene.generation_cost_cents) : "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-[10px]">QC Verdict</p>
                        <p className="font-mono">{scene.qc_verdict ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-[10px]">QC Confidence</p>
                        <p className="font-mono">{scene.qc_confidence != null ? `${Math.round(scene.qc_confidence * 100)}%` : "—"}</p>
                      </div>
                    </div>

                    {/* Inline clip */}
                    {scene.clip_url && (
                      <div>
                        <p className="text-[10px] tracking-wider uppercase text-muted-foreground font-semibold mb-1">Output clip</p>
                        <video
                          src={scene.clip_url}
                          controls
                          playsInline
                          preload="metadata"
                          className="w-full max-w-md aspect-video bg-black rounded"
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* ─── TIMELINE — full chronological log with stage + level + metadata ─── */}
        <TabsContent value="logs">
          <div className="bg-card border border-border rounded-lg p-3 max-h-[600px] overflow-y-auto font-mono text-xs space-y-1">
            {logs.length === 0 && <p className="text-muted-foreground text-center py-8">No logs for this property</p>}
            {logs.map(log => (
              <div key={log.id} className="flex items-start gap-2">
                <span className="text-muted-foreground shrink-0 w-16">
                  {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                <Badge variant="secondary" className="text-[9px] h-4 px-1 shrink-0">{log.stage}</Badge>
                <Badge
                  variant="secondary"
                  className={`text-[9px] h-4 px-1 shrink-0 ${
                    log.level === "error" ? "bg-destructive text-destructive-foreground" :
                    log.level === "warn" ? "bg-warning text-warning-foreground" : ""
                  }`}
                >
                  {log.level}
                </Badge>
                <span className={`flex-1 ${log.level === "error" ? "text-destructive" : log.level === "warn" ? "text-warning" : "text-foreground"}`}>
                  {log.message}
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <span className="text-muted-foreground ml-1">{JSON.stringify(log.metadata)}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ─── SYSTEM PROMPTS — Claude's rulebook ─── */}
        <TabsContent value="prompts" className="space-y-4">
          {!prompts ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {[
                { label: "Photo Analysis", desc: "Used by Claude Sonnet to score every photo on quality, aesthetics, depth, and room type.", body: prompts.analysis },
                { label: "Director (Shot Planning)", desc: "Used by Claude Sonnet to turn selected photos into an ordered shot list.", body: prompts.director },
                { label: "QC Evaluator", desc: "Used by Claude Sonnet to judge generated clips. Currently auto-passing pending frame-extraction infra.", body: prompts.qc },
              ].map(p => (
                <Card key={p.label}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">{p.label}</CardTitle>
                    <p className="text-[11px] text-muted-foreground">{p.desc}</p>
                  </CardHeader>
                  <CardContent>
                    <pre className="bg-muted/50 border border-border rounded p-3 text-[11px] font-mono whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto">
                      {p.body}
                    </pre>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PropertyDetail;
