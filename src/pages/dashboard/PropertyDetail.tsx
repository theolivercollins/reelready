import { useParams, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Download, RotateCcw, Camera, Clock, DollarSign, ChevronDown, ChevronUp, Loader2, AlertTriangle } from "lucide-react";
import { getStatusColor, formatCents, formatDuration, getRelativeTime } from "@/lib/types";
import type { Property, Photo, Scene, PipelineLog } from "@/lib/types";
import { fetchProperty, fetchLogs, rerunProperty } from "@/lib/api";

const PropertyDetail = () => {
  const { id } = useParams();
  const [property, setProperty] = useState<(Property & { photos: Photo[]; scenes: Scene[] }) | null>(null);
  const [logs, setLogs] = useState<(PipelineLog & { properties?: { address: string } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [expandedScene, setExpandedScene] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);

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
      // Reload property data
      const propData = await fetchProperty(id);
      setProperty(propData);
    } catch (err: any) {
      alert(`Failed to rerun: ${err.message}`);
    } finally {
      setRerunning(false);
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
  const displayPhotos = showSelectedOnly ? photos.filter(p => p.selected) : photos;

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      {/* Back + Header */}
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

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Cost", value: formatCents(property.total_cost_cents), icon: DollarSign },
          { label: "Processing Time", value: property.processing_time_ms > 0 ? formatDuration(property.processing_time_ms) : "In progress", icon: Clock },
          { label: "Photos", value: `${property.selected_photo_count}/${property.photo_count} selected`, icon: Camera },
          { label: "Brokerage", value: property.brokerage || "—", icon: null },
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

      {/* Deliverables — individual clips produced by the pipeline */}
      {(() => {
        const deliverables = scenes.filter(s => s.clip_url);
        if (deliverables.length === 0) return null;
        return (
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
        );
      })()}

      <Tabs defaultValue="photos">
        <TabsList>
          <TabsTrigger value="photos">Photos</TabsTrigger>
          <TabsTrigger value="shots">Shot Plan</TabsTrigger>
          <TabsTrigger value="logs">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="photos" className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{displayPhotos.length} photos</span>
            <Button variant="ghost" size="sm" onClick={() => setShowSelectedOnly(!showSelectedOnly)}>
              {showSelectedOnly ? "Show All" : "Selected Only"}
            </Button>
          </div>
          {displayPhotos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No photos</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {displayPhotos.map(photo => (
                <div
                  key={photo.id}
                  className={`relative aspect-square rounded-md overflow-hidden border-2 transition-all ${
                    photo.selected ? "border-primary" : "border-transparent opacity-50"
                  }`}
                >
                  <div className="w-full h-full bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
                    {photo.room_type.replace(/_/g, " ")}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-background/80 px-1 py-0.5 flex gap-1">
                    <Badge variant="secondary" className="text-[8px] h-4 px-1">Q:{photo.quality_score}</Badge>
                    <Badge variant="secondary" className="text-[8px] h-4 px-1">A:{photo.aesthetic_score}</Badge>
                  </div>
                  {photo.discard_reason && (
                    <div className="absolute top-1 right-1">
                      <Badge className="bg-destructive text-destructive-foreground text-[8px] h-4 px-1">{photo.discard_reason}</Badge>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="shots" className="space-y-2">
          {scenes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No scenes yet</p>
          ) : (
            scenes.map(scene => (
              <Card key={scene.id}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpandedScene(expandedScene === scene.id ? null : scene.id)}>
                    <span className="font-mono text-xs text-muted-foreground w-6">#{scene.scene_number}</span>
                    <div className="w-16 h-10 bg-muted rounded flex items-center justify-center text-[10px] text-muted-foreground shrink-0">
                      Thumb
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{scene.camera_movement.replace(/_/g, " ")}</span>
                        <Badge variant="secondary" className={`text-[10px] h-4 ${getStatusColor(scene.status)}`}>
                          {scene.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{scene.prompt}</p>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{scene.duration_seconds}s</span>
                    {expandedScene === scene.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                  {expandedScene === scene.id && (
                    <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div><span className="text-muted-foreground">Provider</span><p className="font-mono">{scene.provider}</p></div>
                      <div><span className="text-muted-foreground">Gen Time</span><p className="font-mono">{formatDuration(scene.generation_time_ms)}</p></div>
                      <div><span className="text-muted-foreground">Cost</span><p className="font-mono">{formatCents(scene.generation_cost_cents)}</p></div>
                      <div><span className="text-muted-foreground">QC Confidence</span><p className="font-mono">{(scene.qc_confidence * 100).toFixed(0)}%</p></div>
                      <div><span className="text-muted-foreground">Attempts</span><p className="font-mono">{scene.attempt_count}</p></div>
                      <div><span className="text-muted-foreground">Verdict</span><p className="font-mono">{scene.qc_verdict || "—"}</p></div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="logs" className="space-y-1">
          <div className="bg-card border border-border rounded-lg p-3 max-h-[500px] overflow-y-auto font-mono text-xs space-y-1">
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
                <span className={log.level === "error" ? "text-destructive" : log.level === "warn" ? "text-warning" : "text-foreground"}>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PropertyDetail;
