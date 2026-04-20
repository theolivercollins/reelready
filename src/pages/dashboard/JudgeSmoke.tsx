import { useEffect, useState } from "react";
import { Loader2, Gavel, Star, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

type RunState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: unknown; elapsedMs: number }
  | { status: "error"; message: string };

interface GalleryItem {
  id: string;
  session_id: string;
  session_label: string | null;
  session_image_url: string | null;
  iteration_number: number | null;
  rating: number | null;
  provider: string | null;
  clip_url: string | null;
  room_type: string | null;
  camera_movement: string | null;
  created_at: string;
  judge_score: number | null;
  judge_confidence: number | null;
}

type FilterKey = "rated" | "fives" | "losers" | "all" | "unrated";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "rated", label: "Rated" },
  { key: "fives", label: "5★ only" },
  { key: "losers", label: "≤2★" },
  { key: "unrated", label: "Unrated" },
  { key: "all", label: "All" },
];

async function callJson(path: string, init?: RequestInit): Promise<{ data: unknown; elapsedMs: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (init?.body) headers["Content-Type"] = "application/json";
  if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;

  const t0 = performance.now();
  const res = await fetch(path, { ...init, headers });
  const elapsedMs = Math.round(performance.now() - t0);
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = data && typeof data === "object" && "error" in data && typeof (data as { error?: unknown }).error === "string"
      ? (data as { error: string }).error
      : `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return { data, elapsedMs };
}

function JsonView({ value }: { value: unknown }) {
  return (
    <pre className="mt-3 max-h-[480px] overflow-auto border border-border bg-muted/30 p-4 text-[11px] leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="border border-border bg-background p-6">
      <div className="mb-4 flex items-start justify-between gap-6">
        <div>
          <span className="label text-muted-foreground">{title}</span>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-[11px] text-muted-foreground">unrated</span>;
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3 w-3 ${n <= rating ? "fill-foreground text-foreground" : "text-muted-foreground/30"}`}
        />
      ))}
    </span>
  );
}

function GalleryCard({
  item,
  onScore,
  scoring,
}: {
  item: GalleryItem;
  onScore: (id: string) => void;
  scoring: boolean;
}) {
  const thumb = item.session_image_url;
  return (
    <div className="group relative flex flex-col border border-border bg-background overflow-hidden">
      <div className="aspect-video bg-muted">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">no image</div>
        )}
        {item.clip_url && (
          <span className="absolute top-2 left-2 bg-black/70 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white">
            {item.provider ?? "clip"}
          </span>
        )}
        {item.judge_score !== null && (
          <span className="absolute top-2 right-2 bg-emerald-600/90 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white">
            judged {item.judge_score.toFixed(2)}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5 p-3">
        <div className="flex items-center justify-between">
          <Stars rating={item.rating} />
          <span className="text-[10px] text-muted-foreground">#{item.iteration_number ?? "?"}</span>
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          {[item.room_type, item.camera_movement].filter(Boolean).join(" · ") || "—"}
        </div>
        <div className="truncate text-[10px] text-muted-foreground/70">
          {item.session_label ?? item.session_id.slice(0, 8)}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="mt-1 h-7 text-xs"
          onClick={() => onScore(item.id)}
          disabled={scoring}
        >
          {scoring ? <Loader2 className="h-3 w-3 animate-spin" /> : "Score"}
        </Button>
      </div>
    </div>
  );
}

export default function JudgeSmoke() {
  const [filter, setFilter] = useState<FilterKey>("rated");
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [galleryLoading, setGalleryLoading] = useState(false);

  const [cellKey, setCellKey] = useState("kitchen-push_in");
  const [sampleCap, setSampleCap] = useState("10");

  const [scoringId, setScoringId] = useState<string | null>(null);
  const [scoreState, setScoreState] = useState<RunState>({ status: "idle" });
  const [calibrateState, setCalibrateState] = useState<RunState>({ status: "idle" });
  const [statusState, setStatusState] = useState<RunState>({ status: "idle" });

  async function loadGallery(f: FilterKey = filter) {
    setGalleryLoading(true);
    setGalleryError(null);
    try {
      const { data } = await callJson(`/api/admin/judge/iterations?filter=${f}&limit=60`);
      const parsed = data as { iterations: GalleryItem[] };
      setItems(parsed.iterations);
    } catch (err) {
      setGalleryError(err instanceof Error ? err.message : String(err));
    } finally {
      setGalleryLoading(false);
    }
  }

  useEffect(() => {
    loadGallery(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function runScore(id: string) {
    setScoringId(id);
    setScoreState({ status: "loading" });
    try {
      const { data, elapsedMs } = await callJson("/api/admin/judge/score", {
        method: "POST",
        body: JSON.stringify({ iteration_id: id }),
      });
      setScoreState({ status: "ok", data, elapsedMs });
      // Refresh gallery so the "judged" badge appears on the scored card.
      loadGallery(filter);
    } catch (err) {
      setScoreState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setScoringId(null);
    }
  }

  async function runCalibrate() {
    if (!cellKey.trim()) return;
    setCalibrateState({ status: "loading" });
    try {
      const cap = Number(sampleCap);
      const { data, elapsedMs } = await callJson("/api/admin/judge/calibrate", {
        method: "POST",
        body: JSON.stringify({
          cell_keys: [cellKey.trim()],
          per_cell_sample_cap: Number.isFinite(cap) && cap > 0 ? cap : 10,
        }),
      });
      setCalibrateState({ status: "ok", data, elapsedMs });
    } catch (err) {
      setCalibrateState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function runStatus() {
    setStatusState({ status: "loading" });
    try {
      const { data, elapsedMs } = await callJson("/api/admin/judge/status");
      setStatusState({ status: "ok", data, elapsedMs });
    } catch (err) {
      setStatusState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <span className="label text-muted-foreground">— Judge smoke test</span>
        <h2 className="mt-3 flex items-center gap-3 text-3xl font-semibold tracking-[-0.02em]">
          <Gavel className="h-6 w-6 text-muted-foreground" />
          Phase 1 Claude rubric judge
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Click any iteration below to run the Claude rubric judge on it. See how the judge scores your existing ratings — 4-axis rubric, composite score, confidence, rationale, and suggested failure tags.
        </p>
      </div>

      <Section
        title="1. Score an iteration"
        description="Click any card to run scoreIteration. Each call costs ~$0.01–0.03 of Claude. Idempotent — re-scoring overwrites the last result."
      >
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`border px-3 py-1 text-[11px] uppercase tracking-[0.14em] transition-colors ${
                filter === f.key
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 text-xs"
            onClick={() => loadGallery(filter)}
            disabled={galleryLoading}
          >
            {galleryLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
            Refresh
          </Button>
        </div>

        {galleryError && <p className="mt-4 text-xs text-destructive">Error loading gallery: {galleryError}</p>}

        {items && items.length === 0 && !galleryLoading && (
          <p className="mt-6 text-sm text-muted-foreground">No iterations match this filter.</p>
        )}

        {items && items.length > 0 && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <GalleryCard
                key={item.id}
                item={item}
                onScore={runScore}
                scoring={scoringId === item.id}
              />
            ))}
          </div>
        )}

        {scoreState.status === "error" && (
          <p className="mt-4 text-xs text-destructive">Score error: {scoreState.message}</p>
        )}
        {scoreState.status === "ok" && (
          <div className="mt-4">
            <p className="text-[11px] text-muted-foreground">Last score: {scoreState.elapsedMs}ms</p>
            <JsonView value={scoreState.data} />
          </div>
        )}
      </Section>

      <Section
        title="2. Calibrate one cell"
        description="Runs the judge across all human-rated iterations in the chosen cell (up to the sample cap). Writes a snapshot to lab_judge_calibrations. Keep to one cell at a time — Vercel serverless functions time out at 60s."
      >
        <div className="grid gap-3 md:grid-cols-[1fr_120px_auto] md:items-end">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Cell key</label>
            <Input
              value={cellKey}
              onChange={(e) => setCellKey(e.target.value)}
              placeholder="e.g. kitchen-push_in"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Sample cap</label>
            <Input
              value={sampleCap}
              onChange={(e) => setSampleCap(e.target.value)}
              type="number"
              min={1}
              max={30}
              className="font-mono text-xs"
            />
          </div>
          <Button onClick={runCalibrate} disabled={calibrateState.status === "loading" || !cellKey.trim()}>
            {calibrateState.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Calibrate"}
          </Button>
        </div>
        {calibrateState.status === "error" && (
          <p className="mt-3 text-xs text-destructive">Error: {calibrateState.message}</p>
        )}
        {calibrateState.status === "ok" && (
          <>
            <p className="mt-3 text-[11px] text-muted-foreground">{calibrateState.elapsedMs}ms</p>
            <JsonView value={calibrateState.data} />
          </>
        )}
      </Section>

      <Section
        title="3. Read calibration status"
        description="Pulls v_judge_calibration_status — the latest calibration snapshot per cell, plus aggregate summary (sample-weighted within-one-star agreement, cells in auto vs advisory mode)."
      >
        <Button onClick={runStatus} disabled={statusState.status === "loading"}>
          {statusState.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Status"}
        </Button>
        {statusState.status === "error" && (
          <p className="mt-3 text-xs text-destructive">Error: {statusState.message}</p>
        )}
        {statusState.status === "ok" && (
          <>
            <p className="mt-3 text-[11px] text-muted-foreground">{statusState.elapsedMs}ms</p>
            <JsonView value={statusState.data} />
          </>
        )}
      </Section>
    </div>
  );
}
