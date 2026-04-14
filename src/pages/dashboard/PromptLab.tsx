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
  updateSession,
  analyzeSession,
  refineIteration,
  renderIteration,
  rateIteration,
  type LabSession,
  type LabIteration,
} from "@/lib/promptLabApi";
import { promoteRecipe } from "@/lib/recipesApi";

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
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchLabel, setBatchLabel] = useState("");
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const navigate = useNavigate();

  async function reload() {
    try {
      const r = await listSessions();
      setSessions(r.sessions);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    reload();
  }, []);

  // Auto-refresh every 15s while any session has an active render or a
  // clip waiting to be rated. Only when the tab is visible.
  useEffect(() => {
    if (!sessions) return;
    const anyActive = sessions.some((s) => s.pending_render || s.ready_for_approval);
    if (!anyActive) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 15000);
    return () => clearInterval(timer);
  }, [sessions]);

  async function handleUpload(files: FileList) {
    if (!files.length) return;
    setUploading(true);
    setError(null);
    setUploadProgress({ done: 0, total: files.length });
    const batch = batchLabel.trim() || null;
    const createdIds: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const { url, path } = await uploadLabImage(f);
        const session = await createSession({
          image_url: url,
          image_path: path,
          label: f.name.replace(/\.[^.]+$/, ""),
          batch_label: batch ?? undefined,
        });
        createdIds.push(session.id);
        setUploadProgress({ done: i + 1, total: files.length });
      }

      if (autoAnalyze) {
        // Kick off analyses in parallel, don't wait — user can watch progress in list.
        await Promise.allSettled(createdIds.map((id) => analyzeSession(id)));
      }

      await reload();

      // If only one uploaded, jump into its detail view.
      if (createdIds.length === 1) {
        navigate(`/dashboard/development/prompt-lab/${createdIds[0]}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      setUploadProgress(null);
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

      <FileDropZone
        uploading={uploading}
        uploadProgress={uploadProgress}
        batchLabel={batchLabel}
        setBatchLabel={setBatchLabel}
        autoAnalyze={autoAnalyze}
        setAutoAnalyze={setAutoAnalyze}
        onFiles={handleUpload}
        error={error}
      />

      {sessions === null ? (
        <div className="py-20 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No sessions yet. Upload an image above to start.
        </div>
      ) : (
        <BatchGroups sessions={sessions} onReload={reload} />
      )}
    </div>
  );
}

// ─── File dropzone with batch + auto-analyze controls ───

function FileDropZone({
  uploading,
  uploadProgress,
  batchLabel,
  setBatchLabel,
  autoAnalyze,
  setAutoAnalyze,
  onFiles,
  error,
}: {
  uploading: boolean;
  uploadProgress: { done: number; total: number } | null;
  batchLabel: string;
  setBatchLabel: (s: string) => void;
  autoAnalyze: boolean;
  setAutoAnalyze: (b: boolean) => void;
  onFiles: (files: FileList) => void;
  error: string | null;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      className={`border bg-background p-6 transition ${dragOver ? "border-foreground bg-accent/40" : "border-border"}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (e.dataTransfer.files?.length) {
          e.preventDefault();
          setDragOver(false);
          onFiles(e.dataTransfer.files);
        }
      }}
    >
      <div className="label text-muted-foreground">New session(s)</div>
      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Batch label (groups these uploads together)</label>
          <Input
            value={batchLabel}
            onChange={(e) => setBatchLabel(e.target.value)}
            placeholder="e.g. Smith property · Kitchen study #2"
            className="mt-1"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={autoAnalyze} onChange={(e) => setAutoAnalyze(e.target.checked)} disabled={uploading} />
          Auto-analyze on upload
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 border border-border bg-background px-4 py-2 text-sm hover:bg-accent">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span>
            {uploading
              ? uploadProgress
                ? `Uploading ${uploadProgress.done}/${uploadProgress.total}…`
                : "Uploading…"
              : "Upload images"}
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) onFiles(e.target.files);
            }}
            disabled={uploading}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Drag files from your desktop onto this panel, or click &quot;Upload images&quot;. One session per image. With auto-analyze, the director runs on each in parallel. You can drag session cards between batches after they&apos;re created.
      </p>
      {error && (
        <div className="mt-3 flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

// ─── Batch groups with drag-drop + rename ───

type ShotStatus = "not_started" | "in_progress" | "completed";

function statusOf(s: LabSession): ShotStatus {
  if (s.completed) return "completed";
  if ((s.iteration_count ?? 0) === 0) return "not_started";
  return "in_progress";
}

function BatchGroups({ sessions, onReload }: { sessions: LabSession[]; onReload: () => void }) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, "all" | ShotStatus>>({});

  const groups = new Map<string, LabSession[]>();
  for (const s of sessions) {
    const key = s.batch_label?.trim() || "Unbatched";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  const ordered = Array.from(groups.entries()).sort((a, b) => {
    if (a[0] === "Unbatched") return -1;
    if (b[0] === "Unbatched") return 1;
    const aNewest = Math.max(...a[1].map((s) => new Date(s.created_at).getTime()));
    const bNewest = Math.max(...b[1].map((s) => new Date(s.created_at).getTime()));
    return bNewest - aNewest;
  });

  async function moveSession(sessionId: string, newLabel: string | null) {
    try {
      await updateSession(sessionId, { batch_label: newLabel });
      onReload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function renameBatch(oldLabel: string, newLabel: string) {
    const target = newLabel.trim() || null;
    if (oldLabel === "Unbatched" && !target) return;
    try {
      const affected = sessions.filter((s) => (s.batch_label?.trim() || "Unbatched") === oldLabel);
      await Promise.all(affected.map((s) => updateSession(s.id, { batch_label: target })));
      onReload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function createBatchFromDrop(sessionId: string) {
    const name = prompt("Name this new batch");
    if (!name?.trim()) return;
    await moveSession(sessionId, name.trim());
  }

  return (
    <div className="space-y-10">
      {ordered.map(([batch, items]) => {
        const rated = items.filter((i) => typeof i.best_rating === "number");
        const avgRating = rated.length > 0 ? rated.reduce((s, i) => s + (i.best_rating ?? 0), 0) / rated.length : null;
        const isTarget = dropTarget === batch;

        const counts = {
          all: items.length,
          not_started: items.filter((i) => statusOf(i) === "not_started").length,
          in_progress: items.filter((i) => statusOf(i) === "in_progress").length,
          completed: items.filter((i) => statusOf(i) === "completed").length,
        };
        const filter = filters[batch] ?? "all";
        const visible = filter === "all" ? items : items.filter((i) => statusOf(i) === filter);

        return (
          <div
            key={batch}
            className={`rounded-sm border-2 border-dashed p-3 transition ${isTarget ? "border-foreground bg-accent/30" : "border-transparent"}`}
            onDragOver={(e) => {
              if (draggingId) {
                e.preventDefault();
                setDropTarget(batch);
              }
            }}
            onDragLeave={() => setDropTarget((prev) => (prev === batch ? null : prev))}
            onDrop={(e) => {
              if (draggingId) {
                e.preventDefault();
                const newLabel = batch === "Unbatched" ? null : batch;
                moveSession(draggingId, newLabel);
                setDraggingId(null);
                setDropTarget(null);
              }
            }}
          >
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <BatchTitle label={batch} onRename={(v) => renameBatch(batch, v)} />
              <span className="shrink-0 text-xs text-muted-foreground">
                {counts.completed}/{counts.all} completed
                {avgRating ? ` · avg ${avgRating.toFixed(1)}★` : ""}
              </span>
            </div>

            <div className="mb-3 flex flex-wrap gap-1">
              {(
                [
                  ["all", `All (${counts.all})`],
                  ["not_started", `Need to start (${counts.not_started})`],
                  ["in_progress", `In progress (${counts.in_progress})`],
                  ["completed", `Completed (${counts.completed})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilters((prev) => ({ ...prev, [batch]: key }))}
                  className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-wider transition ${
                    filter === key ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {visible.length === 0 ? (
              <div className="rounded border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                No sessions in this filter.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visible.map((s) => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    isDragging={draggingId === s.id}
                    onDragStart={() => setDraggingId(s.id)}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDropTarget(null);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Drop-here-to-create-new-batch zone */}
      <div
        className={`rounded-sm border-2 border-dashed p-6 text-center text-xs transition ${
          draggingId ? "border-foreground text-foreground bg-accent/20" : "border-border text-muted-foreground"
        }`}
        onDragOver={(e) => {
          if (draggingId) e.preventDefault();
        }}
        onDrop={(e) => {
          if (draggingId) {
            e.preventDefault();
            const id = draggingId;
            setDraggingId(null);
            createBatchFromDrop(id);
          }
        }}
      >
        Drop a session here to create a new batch
      </div>
    </div>
  );
}

function BatchTitle({ label, onRename }: { label: string; onRename: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label === "Unbatched" ? "" : label);

  useEffect(() => {
    setDraft(label === "Unbatched" ? "" : label);
  }, [label]);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft.trim() !== (label === "Unbatched" ? "" : label)) onRename(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(label === "Unbatched" ? "" : label);
            setEditing(false);
          }
        }}
        placeholder={label === "Unbatched" ? "Name this batch…" : ""}
        className="bg-transparent text-lg font-semibold tracking-tight outline-none border-b border-border focus:border-foreground min-w-0"
      />
    );
  }
  return (
    <h3
      onClick={() => setEditing(true)}
      className="text-lg font-semibold tracking-tight cursor-text hover:opacity-70"
      title="Click to rename (renames all sessions in this batch)"
    >
      {label}
    </h3>
  );
}

function SessionCard({
  session,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  session: LabSession;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <Link
      to={`/dashboard/development/prompt-lab/${session.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/session-id", session.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`relative border border-border bg-background transition hover:border-foreground ${isDragging ? "opacity-40" : ""} ${session.completed ? "border-emerald-500/50" : ""}`}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        <img src={session.image_url} alt={session.label ?? "session"} className="h-full w-full object-cover pointer-events-none" />
        {session.pending_render && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="inline-flex items-center gap-2 rounded bg-amber-500/90 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-white shadow-lg">
              <Loader2 className="h-3 w-3 animate-spin" />
              Rendering
            </div>
          </div>
        )}
        {session.completed && (
          <div className="absolute top-2 right-2 inline-flex items-center gap-1 rounded bg-emerald-500 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white shadow-sm">
            ✓ Completed
          </div>
        )}
        {!session.completed && !session.pending_render && session.ready_for_approval && (
          <div className="absolute bottom-0 inset-x-0 bg-sky-500 px-2 py-1 text-center text-[10px] font-medium uppercase tracking-wider text-white">
            Ready for approval
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="text-xs font-medium truncate">{session.label || session.archetype || "Untitled"}</div>
        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{session.iteration_count ?? 0} iter{session.iteration_count === 1 ? "" : "s"}</span>
          {typeof session.best_rating === "number" && (
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3 fill-foreground text-foreground" />
              {session.best_rating}
            </span>
          )}
        </div>
      </div>
    </Link>
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

  // Auto-refresh every 10s while any iteration has an in-flight render.
  useEffect(() => {
    if (!data) return;
    const anyPending = data.iterations.some(
      (it) => it.provider_task_id && !it.clip_url && !it.render_error
    );
    if (!anyPending) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 10000);
    return () => clearInterval(timer);
  }, [data, reload]);

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
    navigate("/dashboard/development/prompt-lab");
  }

  async function handleRender(iterationId: string, provider?: "kling" | "runway" | null) {
    setBusy(`render-${iterationId}`);
    setError(null);
    try {
      const result = await renderIteration(iterationId, provider ?? null);
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

  async function handleRate(iterationId: string, payload: {
    rating: number | null;
    tags: string[];
    comment: string;
  }) {
    setBusy(`rate-${iterationId}`);
    setError(null);
    try {
      const result = await rateIteration({
        iteration_id: iterationId,
        rating: payload.rating,
        tags: payload.tags.length ? payload.tags : null,
        comment: payload.comment || null,
      });
      if (result.auto_promoted) {
        setError(`✓ Saved. Auto-promoted to recipe "${result.auto_promoted.archetype}"`);
      }
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
          <Link to="/dashboard/development/prompt-lab" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <span className="label text-muted-foreground">— Prompt Lab session</span>
            <EditableLabel
              value={session.label}
              placeholder="Untitled session"
              onSave={async (v) => {
                await updateSession(sessionId, { label: v });
                reload();
              }}
            />
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
                  onRender={(provider) => handleRender(it.id, provider)}
                  onRefine={(p) => handleRefine(it.id, p)}
                  onRate={(p) => handleRate(it.id, p)}
                />
              ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Editable label (click-to-edit) ───

function EditableLabel({
  value,
  placeholder,
  onSave,
}: {
  value: string | null;
  placeholder: string;
  onSave: (v: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={async () => {
          setEditing(false);
          if (draft.trim() !== (value ?? "").trim()) await onSave(draft.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
        className="mt-1 w-full bg-transparent text-2xl font-semibold tracking-[-0.02em] outline-none border-b border-border focus:border-foreground"
      />
    );
  }
  return (
    <h2
      onClick={() => setEditing(true)}
      className="mt-1 text-2xl font-semibold tracking-[-0.02em] cursor-text hover:opacity-70"
      title="Click to edit"
    >
      {value || <span className="text-muted-foreground/60">{placeholder}</span>}
    </h2>
  );
}

// ─── Promote iteration to recipe ───

function PromoteRecipeControl({
  iteration,
  director,
}: {
  iteration: LabIteration;
  director: NonNullable<LabIteration["director_output_json"]>;
}) {
  const [open, setOpen] = useState(false);
  const [archetype, setArchetype] = useState("");
  const [tmpl, setTmpl] = useState(director.prompt);
  const [busy, setBusy] = useState(false);
  const [promoted, setPromoted] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (promoted) {
    return (
      <div className="mt-4 inline-flex items-center gap-2 rounded bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-400">
        ✓ Promoted to recipe library
      </div>
    );
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="mt-4" onClick={() => setOpen(true)}>
        <Sparkles className="mr-2 h-3 w-3" /> Promote to recipe
      </Button>
    );
  }

  async function submit() {
    if (!archetype.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await promoteRecipe({ iteration_id: iteration.id, archetype: archetype.trim(), prompt_template: tmpl.trim() });
      setPromoted(true);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border border-border bg-muted/30 p-4 space-y-3">
      <div className="label text-muted-foreground">Promote to recipe library</div>
      <div>
        <label className="text-xs text-muted-foreground">Archetype name</label>
        <Input
          value={archetype}
          onChange={(e) => setArchetype(e.target.value)}
          placeholder="e.g. kitchen_island_centered"
          className="mt-1 font-mono text-xs"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Prompt template (use this verbatim on similar photos)</label>
        <Textarea
          value={tmpl}
          onChange={(e) => setTmpl(e.target.value)}
          className="mt-1 min-h-[60px] font-mono text-xs"
        />
      </div>
      {err && <div className="text-xs text-destructive">{err}</div>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={!archetype.trim() || busy}>
          {busy ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
          Promote
        </Button>
      </div>
    </div>
  );
}

// ─── Retrieval chips (few-shot + recipe indicators) ───

function RetrievalChips({ metadata }: { metadata: LabIteration["retrieval_metadata"] }) {
  if (!metadata) return null;
  const exemplars = metadata.exemplars ?? [];
  const recipe = metadata.recipe;
  if (exemplars.length === 0 && !recipe) return null;
  return (
    <>
      {exemplars.length > 0 && (
        <span
          className="rounded bg-foreground/10 px-2 py-0.5 text-[10px] uppercase tracking-wider"
          title={exemplars.map((e) => `${e.rating}★ · ${e.camera_movement} · d=${e.distance.toFixed(3)}\n   ${e.prompt}`).join("\n\n")}
        >
          Based on {exemplars.length} similar {exemplars.length === 1 ? "win" : "wins"}
        </span>
      )}
      {recipe && (
        <span
          className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400"
          title={`${recipe.prompt_template}\n\ndistance ${recipe.distance.toFixed(3)}`}
        >
          Recipe · {recipe.archetype}
        </span>
      )}
    </>
  );
}

// ─── One iteration card ───

function IterationCard({
  iteration,
  isLatest,
  busy,
  onRender,
  onRefine,
  onRate,
}: {
  iteration: LabIteration;
  isLatest: boolean;
  busy: string | null;
  onRender: (provider: "kling" | "runway" | null) => void;
  onRefine: (payload: { rating: number | null; tags: string[]; comment: string; chatInstruction: string }) => void;
  onRate: (payload: { rating: number | null; tags: string[]; comment: string }) => void;
}) {
  const [rating, setRating] = useState<number | null>(iteration.rating);
  const [tags, setTags] = useState<string[]>(iteration.tags ?? []);
  const [comment, setComment] = useState(iteration.user_comment ?? "");
  const [chat, setChat] = useState("");
  const [renderForReal, setRenderForReal] = useState(false);
  const [providerChoice, setProviderChoice] = useState<"auto" | "kling" | "runway">("auto");

  const director = iteration.director_output_json;
  const analysis = iteration.analysis_json as Record<string, unknown> | null;

  function toggleTag(t: string) {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  const rendering = busy === `render-${iteration.id}`;
  const refining = busy === `refine-${iteration.id}`;
  const rating_saving = busy === `rate-${iteration.id}`;

  return (
    <div className="border border-border bg-background p-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label text-muted-foreground">Iteration {iteration.iteration_number}</span>
          {iteration.provider && (
            <span className="rounded bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider">{iteration.provider}</span>
          )}
          <RetrievalChips metadata={iteration.retrieval_metadata} />
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

      {/* Pending render indicator */}
      {!iteration.clip_url && iteration.provider_task_id && !iteration.render_error && (
        <div className="mt-5 inline-flex items-center gap-2 rounded bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Rendering on {iteration.provider}
          {iteration.render_submitted_at && (
            <span className="text-amber-700/70 dark:text-amber-400/70">
              · submitted {new Date(iteration.render_submitted_at).toLocaleTimeString()}
            </span>
          )}
          <span className="text-amber-700/70 dark:text-amber-400/70">
            · cron finalizes (safe to leave this page)
          </span>
        </div>
      )}

      {/* Render error */}
      {iteration.render_error && !iteration.clip_url && (
        <div className="mt-5 rounded bg-destructive/10 p-3 text-xs text-destructive">
          <div className="font-medium">Render failed</div>
          <div className="mt-1 text-destructive/80">{iteration.render_error}</div>
        </div>
      )}

      {/* Clip player */}
      {iteration.clip_url && (
        <div className="mt-5 space-y-2">
          <video
            key={iteration.clip_url}
            src={iteration.clip_url}
            controls
            playsInline
            preload="metadata"
            className="w-full max-w-md border border-border"
          />
          <a
            href={iteration.clip_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-muted-foreground hover:text-foreground underline"
          >
            Open clip in new tab ↗
          </a>
        </div>
      )}

      {/* Promote to recipe (on 5★ iterations) */}
      {iteration.rating === 5 && director && (
        <PromoteRecipeControl iteration={iteration} director={director} />
      )}

      {/* Render controls (latest only, not currently rendering) */}
      {isLatest && !iteration.clip_url && !iteration.provider_task_id && director && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={renderForReal}
              onChange={(e) => setRenderForReal(e.target.checked)}
            />
            Render for real (~$0.05–$0.15)
          </label>
          <select
            value={providerChoice}
            onChange={(e) => setProviderChoice(e.target.value as "auto" | "kling" | "runway")}
            className="border border-border bg-background px-2 py-1 text-xs"
            disabled={!renderForReal || rendering}
          >
            <option value="auto">Auto (by motion)</option>
            <option value="kling">Kling</option>
            <option value="runway">Runway</option>
          </select>
          <Button
            size="sm"
            variant={renderForReal ? "default" : "outline"}
            disabled={!renderForReal || rendering}
            onClick={() => onRender(providerChoice === "auto" ? null : providerChoice)}
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

          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRate({ rating, tags, comment })}
              disabled={rating_saving || (rating === null && tags.length === 0 && !comment.trim())}
            >
              {rating_saving ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Star className="mr-2 h-3 w-3" />}
              Save rating
            </Button>
          </div>

          <div>
            <span className="label text-muted-foreground">What should change? (optional — only if refining)</span>
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
