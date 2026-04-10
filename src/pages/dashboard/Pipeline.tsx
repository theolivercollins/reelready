import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, AlertTriangle, Check, RotateCcw, SkipForward, Loader2 } from "lucide-react";
import { statusStages, getStatusColor, getRelativeTime } from "@/lib/types";
import type { Property, Scene } from "@/lib/types";
import { fetchProperties, fetchProperty, approveScene, retryScene, skipScene } from "@/lib/api";

const Pipeline = () => {
  const [propertiesByStatus, setPropertiesByStatus] = useState<Record<string, Property[]>>({});
  const [reviewScenes, setReviewScenes] = useState<(Scene & { propertyAddress?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        // Fetch properties for each pipeline stage
        const stagePromises = statusStages.map(stage =>
          fetchProperties({ status: stage.key, limit: 50 })
        );
        const stageResults = await Promise.all(stagePromises);
        if (cancelled) return;

        const byStatus: Record<string, Property[]> = {};
        statusStages.forEach((stage, i) => {
          byStatus[stage.key] = stageResults[i].properties;
        });
        setPropertiesByStatus(byStatus);

        // Fetch needs_review properties and their scenes
        const reviewRes = await fetchProperties({ status: "needs_review", limit: 20 });
        if (cancelled) return;

        const scenesWithAddress: (Scene & { propertyAddress?: string })[] = [];
        for (const prop of reviewRes.properties) {
          try {
            const detail = await fetchProperty(prop.id);
            if (cancelled) return;
            const failedScenes = detail.scenes.filter(s =>
              s.status === "qc_hard_reject" || s.status === "qc_soft_reject" || s.status === "needs_review"
            );
            failedScenes.forEach(s => scenesWithAddress.push({ ...s, propertyAddress: prop.address }));
          } catch {
            // Skip if we can't fetch detail
          }
        }
        setReviewScenes(scenesWithAddress);
        setError(null);
      } catch (err: any) {
        if (cancelled) return;
        setError(err.message || "Failed to load pipeline data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const handleApprove = async (sceneId: string) => {
    setActionLoading(prev => ({ ...prev, [sceneId]: true }));
    try {
      await approveScene(sceneId);
      setReviewScenes(prev => prev.filter(s => s.id !== sceneId));
    } catch (err: any) {
      alert(`Failed to approve: ${err.message}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [sceneId]: false }));
    }
  };

  const handleRetry = async (sceneId: string, prompt: string) => {
    setActionLoading(prev => ({ ...prev, [sceneId]: true }));
    try {
      await retryScene(sceneId, prompt);
      setReviewScenes(prev => prev.filter(s => s.id !== sceneId));
    } catch (err: any) {
      alert(`Failed to retry: ${err.message}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [sceneId]: false }));
    }
  };

  const handleSkip = async (sceneId: string) => {
    setActionLoading(prev => ({ ...prev, [sceneId]: true }));
    try {
      await skipScene(sceneId);
      setReviewScenes(prev => prev.filter(s => s.id !== sceneId));
    } catch (err: any) {
      alert(`Failed to skip: ${err.message}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [sceneId]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-2">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Kanban */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statusStages.map(stage => {
          const props = propertiesByStatus[stage.key] || [];
          return (
            <div key={stage.key} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stage.label}</span>
                <Badge variant="secondary" className="text-[10px] h-5">{props.length}</Badge>
              </div>
              <div className="space-y-2 min-h-[200px]">
                {props.length === 0 && (
                  <div className="border border-dashed border-border rounded-lg p-4 text-center">
                    <p className="text-xs text-muted-foreground">No items</p>
                  </div>
                )}
                {props.map(prop => (
                  <Card key={prop.id} className="hover:border-primary/30 transition-colors cursor-pointer">
                    <CardContent className="p-3 space-y-2">
                      <p className="text-xs font-medium truncate">{prop.address}</p>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                        <Clock className="h-3 w-3" />
                        {getRelativeTime(prop.created_at)}
                      </div>
                      {stage.key === "generating" && (
                        <div className="text-[10px] font-mono text-info">
                          {prop.selected_photo_count > 0
                            ? `${Math.floor(prop.selected_photo_count * 0.4)}/${prop.selected_photo_count} clips`
                            : "Starting..."}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Needs Review */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h3 className="text-sm font-medium">Needs Review</h3>
            <Badge className="bg-warning text-warning-foreground text-[10px] h-5">
              {reviewScenes.length}
            </Badge>
          </div>
          {reviewScenes.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No scenes need review</p>
          )}
          <div className="space-y-3">
            {reviewScenes.map(scene => (
              <div key={scene.id} className="border border-border rounded-lg p-4 flex flex-col md:flex-row gap-4">
                <div className="w-full md:w-40 aspect-video bg-muted rounded flex items-center justify-center text-xs text-muted-foreground shrink-0">
                  Clip Preview
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Scene {scene.scene_number}</span>
                    <Badge className={getStatusColor(scene.status)} variant="secondary">{scene.status.replace(/_/g, " ")}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      Confidence: {(scene.qc_confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{scene.prompt}</p>
                  {scene.qc_issues?.issues && (
                    <ul className="space-y-1">
                      {scene.qc_issues.issues.map((issue: string, i: number) => (
                        <li key={i} className="text-xs text-destructive flex items-start gap-1">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                          {issue}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm" variant="outline" className="h-7 text-xs gap-1"
                      disabled={actionLoading[scene.id]}
                      onClick={() => handleApprove(scene.id)}
                    >
                      <Check className="h-3 w-3" /> Approve
                    </Button>
                    <Button
                      size="sm" variant="outline" className="h-7 text-xs gap-1"
                      disabled={actionLoading[scene.id]}
                      onClick={() => handleRetry(scene.id, scene.prompt)}
                    >
                      <RotateCcw className="h-3 w-3" /> Retry
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground"
                      disabled={actionLoading[scene.id]}
                      onClick={() => handleSkip(scene.id)}
                    >
                      <SkipForward className="h-3 w-3" /> Skip
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Pipeline;
