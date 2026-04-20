import { Loader2, Play, Star, RefreshCw, Wrench, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NextAction } from "@/lib/labNextAction";

interface NextActionBannerProps {
  action: NextAction;
  busy?: boolean;
  onRate: (sceneId: string) => void;
  onRenderBatch: (sceneIds: string[]) => void;
  onRetry: (sceneId: string) => void;
  onIterate: (sceneId: string) => void;
}

const KIND_STYLE: Record<NextAction["kind"], string> = {
  rate: "border-teal-500/40 bg-teal-500/10 text-teal-700",
  render_batch: "border-sky-500/40 bg-sky-500/10 text-sky-700",
  retry_failed: "border-red-500/40 bg-red-500/10 text-red-700",
  iterate: "border-violet-500/40 bg-violet-500/10 text-violet-700",
  waiting: "border-amber-400/40 bg-amber-400/10 text-amber-700",
  all_done: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
};

export function NextActionBanner({ action, busy, onRate, onRenderBatch, onRetry, onIterate }: NextActionBannerProps) {
  const Icon = busy
    ? Loader2
    : action.kind === "rate"
    ? Star
    : action.kind === "render_batch"
    ? Play
    : action.kind === "retry_failed"
    ? RefreshCw
    : action.kind === "iterate"
    ? Wrench
    : action.kind === "all_done"
    ? Check
    : Loader2;

  function handleClick() {
    if (action.kind === "rate") onRate(action.sceneId);
    else if (action.kind === "render_batch") onRenderBatch(action.sceneIds);
    else if (action.kind === "retry_failed") onRetry(action.sceneId);
    else if (action.kind === "iterate") onIterate(action.sceneId);
  }

  const actionable = action.kind === "rate" || action.kind === "render_batch" || action.kind === "retry_failed" || action.kind === "iterate";

  return (
    <div className={`flex items-center justify-between gap-3 border px-4 py-3 ${KIND_STYLE[action.kind]}`}>
      <div className="flex min-w-0 items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${busy || action.kind === "waiting" ? "animate-spin" : ""}`} />
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider opacity-70">Next action</div>
          <div className="truncate text-sm font-medium">{action.cta}</div>
        </div>
      </div>
      {actionable && (
        <Button size="sm" onClick={handleClick} disabled={busy}>
          {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
          Go
        </Button>
      )}
    </div>
  );
}
