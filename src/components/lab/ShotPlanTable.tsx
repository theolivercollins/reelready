import { Star } from "lucide-react";
import type { LabListingScene, LabListingIteration, LabListingPhoto } from "@/lib/labListingsApi";

interface ShotPlanTableProps {
  scenes: LabListingScene[];
  iterations: LabListingIteration[];
  photos: LabListingPhoto[];
  selectedSceneId: string | null;
  onSelect: (sceneId: string) => void;
}

export function ShotPlanTable({ scenes, iterations, photos, selectedSceneId, onSelect }: ShotPlanTableProps) {
  const photoById = new Map(photos.map((p) => [p.id, p]));

  return (
    <div className="border border-border">
      <div className="grid grid-cols-[60px_40px_1fr_120px_80px_80px_80px_110px] items-center gap-3 border-b border-border bg-muted/50 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span />
        <span>#</span>
        <span>Scene</span>
        <span>Movement</span>
        <span className="text-right">Iters</span>
        <span className="text-right">Best</span>
        <span className="text-right">Cost</span>
        <span className="text-right">Status</span>
      </div>
      {scenes.map((s) => {
        const photo = photoById.get(s.photo_id);
        const sceneIters = iterations.filter((i) => i.scene_id === s.id);
        const visibleIters = sceneIters.filter((i) => !i.archived);
        const bestRating = sceneIters.reduce<number | null>((best, i) => {
          if (i.rating === null) return best;
          return best === null || i.rating > best ? i.rating : best;
        }, null);
        const cost = sceneIters.reduce((sum, i) => sum + (i.cost_cents ?? 0), 0);
        const latestStatus = sceneIters.length === 0
          ? "planned"
          : sceneIters.some((i) => i.status === "rendering" || i.status === "submitting")
          ? "rendering"
          : sceneIters.some((i) => i.status === "rendered" || i.status === "rated")
          ? "rendered"
          : sceneIters.some((i) => i.status === "failed")
          ? "failed"
          : sceneIters[0].status;
        const statusColor =
          latestStatus === "rendered" || latestStatus === "rated"
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
            : latestStatus === "rendering" || latestStatus === "submitting"
            ? "border-amber-400/40 bg-amber-400/10 text-amber-700"
            : latestStatus === "failed"
            ? "border-red-400/40 bg-red-400/10 text-red-700"
            : "border-border bg-muted text-muted-foreground";
        const selected = selectedSceneId === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            className={`grid w-full grid-cols-[60px_40px_1fr_120px_80px_80px_80px_110px] items-center gap-3 border-b border-border px-3 py-2 text-left text-xs transition-colors last:border-b-0 ${
              selected ? "bg-foreground/5" : "hover:bg-muted/40"
            }`}
          >
            <div className="relative h-9 w-14 overflow-hidden border border-border bg-muted">
              {photo && <img src={photo.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />}
            </div>
            <span className="font-mono text-muted-foreground">{String(s.scene_number).padStart(2, "0")}</span>
            <div className="min-w-0">
              <div className="truncate font-medium text-foreground">{s.room_type}</div>
              <div className="truncate text-[10px] text-muted-foreground">{s.director_prompt.slice(0, 80)}</div>
            </div>
            <span className="truncate text-muted-foreground">{s.camera_movement}</span>
            <span className="text-right tabular-nums text-muted-foreground">
              {visibleIters.length}{sceneIters.length !== visibleIters.length && <span className="text-[10px]">/{sceneIters.length}</span>}
            </span>
            <span className="text-right tabular-nums">
              {bestRating !== null ? (
                <span className="inline-flex items-center gap-0.5">
                  {bestRating}<Star className="h-2.5 w-2.5 fill-foreground" />
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
            <span className="text-right tabular-nums text-muted-foreground">
              {cost > 0 ? `$${(cost / 100).toFixed(2)}` : "—"}
            </span>
            <span className="text-right">
              <span className={`inline-block border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${statusColor}`}>
                {latestStatus}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
