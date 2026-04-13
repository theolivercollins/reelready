import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Check, RotateCcw, SkipForward } from "lucide-react";
import { statusStages, getRelativeTime } from "@/lib/types";
import type { Property, Scene } from "@/lib/types";
import { fetchProperties, fetchProperty, approveScene, retryScene, skipScene } from "@/lib/api";

// Editorial dot+label status pill
const STATUS_TONE: Record<string, string> = {
  complete: "text-foreground",
  queued: "text-muted-foreground",
  analyzing: "text-accent",
  scripting: "text-accent",
  generating: "text-accent",
  qc: "text-accent",
  assembling: "text-accent",
  failed: "text-destructive",
  needs_review: "text-destructive",
  qc_hard_reject: "text-destructive",
  qc_soft_reject: "text-destructive",
};

const STATUS_DOT: Record<string, string> = {
  complete: "bg-foreground",
  queued: "bg-muted-foreground",
  analyzing: "bg-accent",
  scripting: "bg-accent",
  generating: "bg-accent",
  qc: "bg-accent",
  assembling: "bg-accent",
  failed: "bg-destructive",
  needs_review: "bg-destructive",
  qc_hard_reject: "bg-destructive",
  qc_soft_reject: "bg-destructive",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.15em] ${
        STATUS_TONE[status] ?? "text-muted-foreground"
      }`}
    >
      <span className={`h-1.5 w-1.5 ${STATUS_DOT[status] ?? "bg-muted-foreground"}`} />
      {status.replace(/_/g, " ")}
    </span>
  );
}

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
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-32">
        <AlertTriangle className="h-6 w-6 text-destructive" />
        <p className="label text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-20">
      {/* ─── Header ─── */}
      <header>
        <span className="label text-muted-foreground">— Operations / Pipeline</span>
        <h1 className="display-md mt-5 text-foreground">Pipeline.</h1>
      </header>

      {/* ─── Kanban — horizontally scrollable strip of stage columns ─── */}
      <section>
        <div className="mb-6 flex items-end justify-between">
          <span className="label text-muted-foreground">— Stages</span>
          <span className="label tabular text-muted-foreground">{statusStages.length} columns</span>
        </div>

        <div className="-mx-2 flex gap-px overflow-x-auto border border-border bg-border pb-px">
          {statusStages.map(stage => {
            const props = propertiesByStatus[stage.key] || [];
            return (
              <div
                key={stage.key}
                className="flex min-w-[260px] flex-1 flex-col bg-background"
              >
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <span className="label text-foreground">{stage.label}</span>
                  <span className="label tabular text-muted-foreground">{props.length}</span>
                </div>
                <div className="flex min-h-[260px] flex-col">
                  {props.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center px-4 py-10">
                      <span className="label text-muted-foreground/60">— Empty</span>
                    </div>
                  ) : (
                    props.map(prop => (
                      <div
                        key={prop.id}
                        className="group cursor-pointer border-b border-border px-4 py-4 transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-muted/40"
                      >
                        <p className="truncate text-[13px] font-medium text-foreground transition-colors group-hover:text-accent">
                          {prop.address}
                        </p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="font-mono tabular text-[10px] text-muted-foreground">
                            {getRelativeTime(prop.created_at)}
                          </span>
                          {stage.key === "generating" && prop.selected_photo_count > 0 && (
                            <span className="font-mono tabular text-[10px] text-accent">
                              {Math.floor(prop.selected_photo_count * 0.4)}/{prop.selected_photo_count}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Needs Review — editorial table treatment ─── */}
      <section>
        <div className="mb-6 flex items-end justify-between">
          <span className="label text-muted-foreground">— Needs review</span>
          <span className="label tabular text-muted-foreground">{reviewScenes.length} pending</span>
        </div>

        <div className="border-t border-border">
          <div className="hidden grid-cols-[80px_1fr_120px_100px_1fr] gap-6 border-b border-border py-3 md:grid">
            <span className="label text-muted-foreground">Scene</span>
            <span className="label text-muted-foreground">Address / Prompt</span>
            <span className="label text-muted-foreground">Status</span>
            <span className="label text-right text-muted-foreground">Confidence</span>
            <span className="label text-right text-muted-foreground">Actions</span>
          </div>

          {reviewScenes.length === 0 ? (
            <div className="border-b border-border py-12 text-center">
              <span className="label text-muted-foreground">No scenes need review</span>
            </div>
          ) : (
            reviewScenes.map(scene => (
              <div
                key={scene.id}
                className="grid grid-cols-1 gap-3 border-b border-border py-5 transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-muted/30 md:grid-cols-[80px_1fr_120px_100px_1fr] md:items-start md:gap-6"
              >
                <span className="font-mono tabular text-[11px] text-foreground">
                  #{scene.scene_number}
                </span>
                <div className="min-w-0 space-y-2">
                  {scene.propertyAddress && (
                    <p className="text-[13px] font-medium text-foreground">{scene.propertyAddress}</p>
                  )}
                  <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {scene.prompt}
                  </p>
                  {scene.qc_issues?.issues && scene.qc_issues.issues.length > 0 && (
                    <ul className="space-y-1 pt-1">
                      {scene.qc_issues.issues.map((issue: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-[11px] text-destructive">
                          <span className="mt-1 h-1 w-1 shrink-0 bg-destructive" />
                          {issue}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <StatusPill status={scene.status} />
                <span className="font-mono tabular text-[11px] text-foreground md:text-right">
                  {(scene.qc_confidence * 100).toFixed(0)}%
                </span>
                <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 px-3 text-[10px] font-medium uppercase tracking-[0.15em]"
                    disabled={actionLoading[scene.id]}
                    onClick={() => handleApprove(scene.id)}
                  >
                    <Check className="h-3 w-3" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 px-3 text-[10px] font-medium uppercase tracking-[0.15em]"
                    disabled={actionLoading[scene.id]}
                    onClick={() => handleRetry(scene.id, scene.prompt)}
                  >
                    <RotateCcw className="h-3 w-3" /> Retry
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1.5 px-3 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground"
                    disabled={actionLoading[scene.id]}
                    onClick={() => handleSkip(scene.id)}
                  >
                    <SkipForward className="h-3 w-3" /> Skip
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

export default Pipeline;
