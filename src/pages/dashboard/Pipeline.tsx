import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, RotateCcw, SkipForward, Loader2, Clock } from "lucide-react";
import { statusStages, getRelativeTime } from "@/lib/types";
import type { Property, Scene } from "@/lib/types";
import { fetchProperties, fetchProperty, approveScene, retryScene, skipScene } from "@/lib/api";
import { motion } from "framer-motion";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

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
        const stagePromises = statusStages.map((stage) => fetchProperties({ status: stage.key, limit: 50 }));
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
            const failed = detail.scenes.filter(
              (s) => s.status === "qc_hard_reject" || s.status === "qc_soft_reject" || s.status === "needs_review",
            );
            failed.forEach((s) => scenesWithAddress.push({ ...s, propertyAddress: prop.address }));
          } catch {
            // skip
          }
        }
        setReviewScenes(scenesWithAddress);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load pipeline");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const wrap = async (sceneId: string, fn: () => Promise<void>) => {
    setActionLoading((p) => ({ ...p, [sceneId]: true }));
    try {
      await fn();
      setReviewScenes((prev) => prev.filter((s) => s.id !== sceneId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading((p) => ({ ...p, [sceneId]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-destructive/40 bg-destructive/5 p-10">
        <div className="flex items-start gap-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-destructive/40 bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <div>
            <span className="label text-destructive">— Error</span>
            <p className="mt-3 text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-20">
      {/* Stage columns */}
      <section>
        <span className="label text-muted-foreground">— Pipeline</span>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em]">By stage.</h2>

        <div className="mt-12 grid gap-px bg-border md:grid-cols-3 xl:grid-cols-6">
          {statusStages.map((stage, idx) => {
            const props = propertiesByStatus[stage.key] || [];
            return (
              <div key={stage.key} className="flex min-h-[260px] flex-col bg-background p-5">
                <div className="mb-5 flex items-center justify-between">
                  <span className="label text-foreground">
                    <span className="text-muted-foreground">0{idx + 1}</span> {stage.label}
                  </span>
                  <span className="tabular text-xs text-muted-foreground">{props.length}</span>
                </div>
                <div className="flex-1 space-y-2">
                  {props.length === 0 ? (
                    <div className="border border-dashed border-border py-6 text-center">
                      <p className="text-[11px] text-muted-foreground/60">Empty</p>
                    </div>
                  ) : (
                    props.map((p, i) => (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: i * 0.03, ease: EASE }}
                        className="group cursor-pointer border border-border bg-secondary/30 p-3 transition-colors duration-500 hover:border-foreground/40 hover:bg-secondary"
                      >
                        <p className="truncate text-xs font-semibold tracking-[-0.005em]">{p.address}</p>
                        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {getRelativeTime(p.created_at)}
                        </div>
                        {stage.key === "generating" && p.selected_photo_count > 0 && (
                          <p className="tabular mt-2 text-[10px] text-accent">
                            {Math.floor(p.selected_photo_count * 0.4)} / {p.selected_photo_count} clips
                          </p>
                        )}
                      </motion.div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Needs review */}
      <section>
        <div className="flex items-end justify-between">
          <div>
            <span className="label text-muted-foreground">— Manual review</span>
            <h3 className="mt-3 text-xl font-semibold tracking-[-0.01em]">
              {reviewScenes.length === 0 ? "All clear" : `${reviewScenes.length} scenes need a decision`}
            </h3>
          </div>
        </div>

        {reviewScenes.length === 0 ? (
          <div className="mt-10 border border-dashed border-border bg-secondary/30 py-16 text-center text-sm text-muted-foreground">
            Every clip passed automated QC.
          </div>
        ) : (
          <div className="mt-10 grid gap-px bg-border">
            {reviewScenes.map((scene, i) => (
              <motion.div
                key={scene.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.04, ease: EASE }}
                className="grid gap-6 bg-background p-6 md:grid-cols-[200px_1fr_auto]"
              >
                <div className="flex aspect-video items-center justify-center border border-border bg-secondary text-[10px] text-muted-foreground">
                  Clip preview
                </div>
                <div>
                  <div className="flex items-baseline gap-3">
                    <span className="tabular text-xs font-semibold">Scene {scene.scene_number}</span>
                    <span className="label text-destructive">{scene.status.replace(/_/g, " ")}</span>
                    <span className="tabular text-[11px] text-muted-foreground">
                      Confidence {(scene.qc_confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  {scene.propertyAddress && (
                    <p className="mt-1 text-xs text-muted-foreground">{scene.propertyAddress}</p>
                  )}
                  <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{scene.prompt}</p>
                  {scene.qc_issues?.issues && (
                    <ul className="mt-3 space-y-1.5">
                      {scene.qc_issues.issues.slice(0, 3).map((issue: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2 text-[11px] text-destructive">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.5} />
                          {issue}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex flex-row gap-2 md:flex-col">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionLoading[scene.id]}
                    onClick={() => wrap(scene.id, () => approveScene(scene.id))}
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionLoading[scene.id]}
                    onClick={() => wrap(scene.id, () => retryScene(scene.id, scene.prompt))}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Retry
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={actionLoading[scene.id]}
                    onClick={() => wrap(scene.id, () => skipScene(scene.id))}
                  >
                    <SkipForward className="h-3.5 w-3.5" /> Skip
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Pipeline;
