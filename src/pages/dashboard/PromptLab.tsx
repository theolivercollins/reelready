import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Loader2,
  AlertTriangle,
  Upload,
  Star,
  Trash2,
  ArrowLeft,
  Play,
  Sparkles,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  uploadLabImage,
  listSessions,
  createSession,
  getSession,
  deleteSession,
  analyzeSession,
  refineIteration,
  renderIteration,
  type LabSession,
  type LabIteration,
} from "@/lib/promptLabApi";

const RATING_TAGS = [
  "clean motion",
  "cinematic",
  "perfect",
  "stayed in room",
  "hallucinated architecture",
  "wrong motion direction",
  "camera exited room",
  "warped geometry",
  "added people/objects",
  "too static",
  "too fast",
  "low quality",
];

const PromptLab = () => {
  const { sessionId } = useParams<{ sessionId?: string }>();
  if (sessionId) return <SessionDetail sessionId={sessionId} />;
  return <SessionList />;
};

// ─── List view ───

function SessionList() {
  const [sessions, setSessions] = useState<LabSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [label, setLabel] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    listSessions()
      .then((r) => setSessions(r.sessions))
      .catch((e) => setError(String(e)));
  }, []);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const { url, path } = await uploadLabImage(file);
      const session = await createSession({ image_url: url, image_path: path, label: label || undefined });
      navigate(`/dashboard/prompt-lab/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <span className="label text-muted-foreground">— Prompt Lab</span>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em]">Iterative prompt refinement</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload a test image, run it through photo-analysis + director, rate + refine via chat until the prompt is perfect. Optional real render via Kling/Runway.
        </p>
      </div>

      <div className="border border-border bg-background p-6">
        <div className="label text-muted-foreground">New session</div>
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Label (optional)</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="kitchen with waterfall island"
              className="mt-1"
            />
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 border border-border bg-background px-4 py-2 text-sm hover:bg-accent">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            <span>{uploading ? "Uploading…" : "Upload image"}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
              disabled={uploading}
            />
          </label>
        </div>
        {error && (
          <div className="mt-3 flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {sessions === null ? (
        <div className="py-20 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No sessions yet. Upload an image above to start.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sessions.map((s) => (
            <Link
              key={s.id}
              to={`/dashboard/prompt-lab/${s.id}`}
              className="border border-border bg-background transition hover:border-foreground"
            >
              <div className="aspect-video w-full overflow-hidden bg-muted">
                <img src={s.image_url} alt={s.label ?? "session"} className="h-full w-full object-cover" />
              </div>
              <div className="p-4">
                <div className="text-sm font-medium truncate">{s.label || s.archetype || "Untitled"}</div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{s.iteration_count ?? 0} iteration{s.iteration_count === 1 ? "" : "s"}</span>
                  {typeof s.best_rating === "number" && (
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3 w-3 fill-foreground text-foreground" />
                      {s.best_rating}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Detail view ───

function SessionDetail({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const [data, setData] = useState<{ session: LabSession; iterations: LabIteration[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const d = await getSession(sessionId);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sessionId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleAnalyze() {
    setBusy("analyze");
    setError(null);
    try {
      await analyzeSession(sessionId);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this session and all iterations?")) return;
    await deleteSession(sessionId);
    navigate("/dashboard/prompt-lab");
  }

  async function handleRender(iterationId: string) {
    setBusy(`render-${iterationId}`);
    setError(null);
    try {
      const result = await renderIteration(iterationId);
      if (result.renderError) setError(`Render failed: ${result.renderError}`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleRefine(iterationId: string, payload: {
    rating: number | null;
    tags: string[];
    comment: string;
    chatInstruction: string;
  }) {
    setBusy(`refine-${iterationId}`);
    setError(null);
    try {
      await refineIteration({
        iteration_id: iterationId,
        rating: payload.rating,
        tags: payload.tags.length ? payload.tags : null,
        comment: payload.comment || null,
        chat_instruction: payload.chatInstruction,
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { session, iterations } = data;
  const latest = iterations[iterations.length - 1];
  const totalCost = iterations.reduce((sum, it) => sum + (it.cost_cents ?? 0), 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/dashboard/prompt-lab" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <span className="label text-muted-foreground">— Prompt Lab session</span>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em]">
              {session.label || "Untitled session"}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            ${(totalCost / 100).toFixed(3)}
          </span>
          <button onClick={handleDelete} className="inline-flex items-center gap-1 hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
        {/* Source image column */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="overflow-hidden border border-border bg-muted">
            <img src={session.image_url} alt="source" className="w-full" />
          </div>
          {iterations.length === 0 && (
            <Button onClick={handleAnalyze} disabled={busy === "analyze"} className="w-full">
              {busy === "analyze" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Analyze + Direct
            </Button>
          )}
        </div>

        {/* Iteration stack */}
        <div className="space-y-6">
          {iterations.length === 0 ? (
            <div className="border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              No iterations yet. Click "Analyze + Direct" to generate the first one.
            </div>
          ) : (
            iterations
              .slice()
              .reverse()
              .map((it) => (
                <IterationCard
                  key={it.id}
                  iteration={it}
                  isLatest={it.id === latest?.id}
                  busy={busy}
                  onRender={() => handleRender(it.id)}
                  onRefine={(p) => handleRefine(it.id, p)}
                />
              ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── One iteration card ───

function IterationCard({
  iteration,
  isLatest,
  busy,
  onRender,
  onRefine,
}: {
  iteration: LabIteration;
  isLatest: boolean;
  busy: string | null;
  onRender: () => void;
  onRefine: (payload: { rating: number | null; tags: string[]; comment: string; chatInstruction: string }) => void;
}) {
  const [rating, setRating] = useState<number | null>(iteration.rating);
  const [tags, setTags] = useState<string[]>(iteration.tags ?? []);
  const [comment, setComment] = useState(iteration.user_comment ?? "");
  const [chat, setChat] = useState("");
  const [renderForReal, setRenderForReal] = useState(false);

  const director = iteration.director_output_json;
  const analysis = iteration.analysis_json as Record<string, unknown> | null;

  function toggleTag(t: string) {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  const rendering = busy === `render-${iteration.id}`;
  const refining = busy === `refine-${iteration.id}`;

  return (
    <div className="border border-border bg-background p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="label text-muted-foreground">Iteration {iteration.iteration_number}</span>
          {iteration.provider && (
            <span className="rounded bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider">{iteration.provider}</span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {new Date(iteration.created_at).toLocaleString()}
        </span>
      </div>

      {/* Analysis summary */}
      {analysis && (
        <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Room: </span>
            <span className="font-medium">{String(analysis.room_type)}</span>
            <span className="ml-3 text-muted-foreground">Depth: </span>
            <span className="font-medium">{String(analysis.depth_rating)}</span>
            <span className="ml-3 text-muted-foreground">Aesthetic: </span>
            <span className="font-medium">{String(analysis.aesthetic_score)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Suggested motion: </span>
            <span className="font-medium">{String(analysis.suggested_motion ?? "—")}</span>
          </div>
          {Array.isArray(analysis.key_features) && (
            <div className="md:col-span-2 text-muted-foreground">
              <span>Features: </span>
              <span className="text-foreground">{(analysis.key_features as string[]).join(" · ")}</span>
            </div>
          )}
          {typeof analysis.composition === "string" && (
            <div className="md:col-span-2 italic text-muted-foreground">{analysis.composition as string}</div>
          )}
        </div>
      )}

      {/* Director output */}
      {director && (
        <div className="mt-5 border-l-2 border-foreground/20 pl-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded bg-foreground px-2 py-0.5 text-[10px] uppercase tracking-wider text-background">
              {director.camera_movement}
            </span>
            <span className="text-muted-foreground">{director.duration_seconds}s</span>
          </div>
          <p className="mt-2 font-mono text-sm leading-relaxed">{director.prompt}</p>
        </div>
      )}

      {iteration.user_comment && iteration.user_comment.startsWith("[refiner rationale]") && (
        <div className="mt-3 rounded bg-muted/40 p-3 text-xs italic text-muted-foreground">
          {iteration.user_comment.replace("[refiner rationale] ", "Why: ")}
        </div>
      )}

      {/* Clip player */}
      {iteration.clip_url && (
        <video src={iteration.clip_url} controls className="mt-5 w-full max-w-md border border-border" />
      )}

      {/* Render controls (latest only) */}
      {isLatest && !iteration.clip_url && director && (
        <div className="mt-5 flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={renderForReal}
              onChange={(e) => setRenderForReal(e.target.checked)}
            />
            Render for real (~$0.05–$0.15)
          </label>
          <Button
            size="sm"
            variant={renderForReal ? "default" : "outline"}
            disabled={!renderForReal || rendering}
            onClick={onRender}
          >
            {rendering ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Play className="mr-2 h-3 w-3" />}
            {rendering ? "Rendering…" : "Render clip"}
          </Button>
        </div>
      )}

      {/* Feedback + refine (latest only) */}
      {isLatest && director && (
        <div className="mt-6 space-y-4 border-t border-border pt-5">
          <div>
            <span className="label text-muted-foreground">Rate this iteration</span>
            <div className="mt-2 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(rating === n ? null : n)}
                  className="p-1"
                  aria-label={`${n} stars`}
                >
                  <Star
                    className={`h-5 w-5 ${rating != null && n <= rating ? "fill-foreground text-foreground" : "text-muted-foreground/40"}`}
                    strokeWidth={1.5}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="label text-muted-foreground">Tags</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {RATING_TAGS.map((t) => {
                const active = tags.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleTag(t)}
                    className={`rounded-full border px-2.5 py-1 text-[10px] transition ${
                      active ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="label text-muted-foreground">Notes (optional)</span>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Anything you want to remember about this iteration"
              className="mt-2 min-h-[60px]"
            />
          </div>

          <div>
            <span className="label text-muted-foreground">What should change?</span>
            <Textarea
              value={chat}
              onChange={(e) => setChat(e.target.value)}
              placeholder="e.g. 'the dolly is too fast, make it slower' or 'use reveal past the island corner instead of push_in'"
              className="mt-2 min-h-[80px]"
            />
            <div className="mt-3 flex justify-end">
              <Button
                onClick={() =>
                  onRefine({ rating, tags, comment, chatInstruction: chat })
                }
                disabled={!chat.trim() || refining}
              >
                {refining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Refine → new iteration
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PromptLab;
