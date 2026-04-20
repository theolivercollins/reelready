import { useMemo, useState } from "react";
import { Loader2, Star, Play, Sparkles, RotateCcw, MessageSquare, X, Copy, Trash2, ChevronDown, ChevronRight, Archive, ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PairVisualization } from "./PairVisualization";
import { ChatPanel } from "./ChatPanel";
import { RatingReasonsModal } from "./RatingReasonsModal";
import {
  renderListing,
  rateIteration,
  refineScenePrompt,
  chatIterationStream,
  chatSceneStream,
  clearIterationChat,
  clearSceneChat,
  pinChatMessage,
  pinSceneInstruction,
  setSceneRefinementNotes,
  setSceneUseEndFrame,
  deleteIteration,
  regenerateFromIteration,
  type LabListingScene,
  type LabListingIteration,
  type LabListingPhoto,
} from "@/lib/labListingsApi";

interface SceneCardProps {
  listingId: string;
  scene: LabListingScene;
  iterations: LabListingIteration[];
  photos: LabListingPhoto[];
  defaultModel: string;
  onReload: () => void;
}

function Stars({ value, onChange, disabled }: { value: number | null; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          className="p-0.5 disabled:opacity-50"
        >
          <Star className={`h-4 w-4 ${value !== null && n <= value ? "fill-foreground text-foreground" : "text-muted-foreground/40 hover:text-foreground"}`} />
        </button>
      ))}
    </div>
  );
}

function IterationRow({ listingId, scene, iter, onReload }: {
  listingId: string;
  scene: LabListingScene;
  iter: LabListingIteration;
  onReload: () => void;
}) {
  const [comment, setComment] = useState(iter.user_comment ?? "");
  const [chatOpen, setChatOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ratingModalValue, setRatingModalValue] = useState<number | null>(null);

  async function handleRate(n: number) {
    // Persist the rating immediately; open the reasons modal right after
    // so the user can close the modal and still keep the star change.
    await rateIteration(listingId, iter.id, { rating: n });
    setRatingModalValue(n);
    onReload();
  }

  async function saveRatingReasons(reasons: string[], modalComment: string) {
    await rateIteration(listingId, iter.id, {
      reasons,
      comment: modalComment || null,
    });
    if (modalComment) setComment(modalComment);
    onReload();
  }

  async function saveComment() {
    if (comment === (iter.user_comment ?? "")) return;
    await rateIteration(listingId, iter.id, { comment: comment || null });
    onReload();
  }

  async function regenerate(modelOverride?: string) {
    setBusy(true);
    try {
      await regenerateFromIteration(listingId, iter.id, modelOverride);
      onReload();
    } finally {
      setBusy(false);
    }
  }

  async function copyPrompt() {
    try { await navigator.clipboard.writeText(iter.director_prompt); } catch { /* noop */ }
  }

  async function toggleArchived() {
    await rateIteration(listingId, iter.id, { archived: !iter.archived });
    onReload();
  }

  async function remove() {
    if (!confirm(`Permanently delete iteration #${iter.iteration_number}? (Use Archive to hide without losing the rating signal.)`)) return;
    await deleteIteration(listingId, iter.id);
    onReload();
  }

  async function pinMessage(idx: number, content: string) {
    await pinChatMessage(listingId, scene.id, iter.id, idx, content);
    onReload();
  }

  const otherModel = iter.model_used === "kling-v3-pro" ? "wan-2.7" : "kling-v3-pro";

  return (
    <div className={`border p-3 ${iter.archived ? "border-dashed border-border/60 bg-muted/30 opacity-70" : "border-border"}`}>
      {ratingModalValue !== null && (
        <RatingReasonsModal
          rating={ratingModalValue}
          initialReasons={iter.rating_reasons ?? []}
          initialComment={iter.user_comment ?? ""}
          onSave={saveRatingReasons}
          onClose={() => setRatingModalValue(null)}
        />
      )}

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono text-muted-foreground">#{iter.iteration_number}</span>
          <span className="border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">{iter.model_used}</span>
          <span className={`border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${
            iter.status === "rendered" || iter.status === "rated" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700" :
            iter.status === "failed" ? "border-red-400/40 bg-red-400/10 text-red-700" :
            "border-amber-400/40 bg-amber-400/10 text-amber-700"
          }`}>
            {iter.status}
          </span>
          {iter.archived && (
            <span className="border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">archived</span>
          )}
        </div>
        <Stars value={iter.rating} onChange={handleRate} disabled={!iter.clip_url} />
      </div>

      {iter.clip_url && (
        <video controls src={iter.clip_url} className="mt-2 aspect-video w-full bg-black" preload="metadata" />
      )}
      {iter.render_error && (
        <p className="mt-2 text-[11px] text-destructive">Error: {iter.render_error}</p>
      )}

      {iter.rating_reasons && iter.rating_reasons.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {iter.rating_reasons.map((r) => (
            <span
              key={r}
              className={`border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${
                (iter.rating ?? 0) >= 4
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                  : "border-red-400/40 bg-red-400/10 text-red-700"
              }`}
            >
              {r.replace(/_/g, " ")}
            </span>
          ))}
          {iter.rating && (
            <button type="button" onClick={() => setRatingModalValue(iter.rating!)} className="text-[9px] text-muted-foreground underline-offset-2 hover:underline">
              edit
            </button>
          )}
        </div>
      )}

      {iter.clip_url && (
        <>
          <div className="mt-3 flex flex-wrap gap-1">
            <Button size="sm" variant="outline" onClick={() => regenerate()} disabled={busy} title="Render another iteration with this exact prompt">
              {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RotateCcw className="mr-1 h-3 w-3" />}
              Regenerate
            </Button>
            <Button size="sm" variant="outline" onClick={() => regenerate(otherModel)} disabled={busy} title={`Render with ${otherModel}`}>
              Try {otherModel === "kling-v3-pro" ? "Kling" : "Wan"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPromptOpen((o) => !o)}>
              {promptOpen ? <ChevronDown className="mr-1 h-3 w-3" /> : <ChevronRight className="mr-1 h-3 w-3" />}
              Prompt
            </Button>
            <Button size="sm" variant="ghost" onClick={copyPrompt} title="Copy prompt to clipboard">
              <Copy className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" onClick={toggleArchived} title={iter.archived ? "Unarchive" : "Archive (keeps rating signal)"}>
              {iter.archived ? <ArchiveRestore className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={remove} title="Permanently delete" className="text-destructive hover:text-destructive">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>

          {promptOpen && (
            <pre className="mt-2 whitespace-pre-wrap rounded border border-border bg-muted p-2 font-mono text-[11px] text-foreground">{iter.director_prompt}</pre>
          )}

          <div className="mt-3">
            <span className="label text-muted-foreground">Comment</span>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onBlur={saveComment}
              placeholder="What did you think? (saved on blur)"
              className="mt-1 min-h-[52px] text-xs"
            />
          </div>

          <div className="mt-2">
            <Button size="sm" variant="ghost" onClick={() => setChatOpen((o) => !o)}>
              <MessageSquare className="mr-1 h-3 w-3" />
              {chatOpen ? "Hide chat" : (iter.chat_messages.length > 0 ? `Chat (${iter.chat_messages.length})` : "Chat")}
            </Button>
          </div>

          {chatOpen && (
            <div className="mt-3">
              <ChatPanel
                messages={iter.chat_messages}
                onSend={(m, cb) => chatIterationStream(listingId, iter.id, m, cb)}
                onClear={async () => { await clearIterationChat(listingId, iter.id); onReload(); }}
                onPinMessage={pinMessage}
                emptyHint="Ask about this iteration or tell the system what to change next time. Claude Haiku can save directives that influence future renders of this scene."
                placeholder="Ask or instruct... (Enter to send, Shift+Enter for newline)"
                headerLabel="Chat with this iteration"
              />
              {scene.refinement_notes && (
                <div className="mt-2 flex items-center justify-between border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-emerald-800">
                  <span>Instructions saved for future renders</span>
                  <Button size="sm" variant="outline" onClick={async () => { await renderListing(listingId, { scene_ids: [scene.id] }); onReload(); }} className="h-6 border-emerald-700 text-emerald-800 hover:bg-emerald-500/20">
                    <RotateCcw className="mr-1 h-3 w-3" /> Render with new instructions
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RefinementNotesPanel({ listingId, scene, onReload }: {
  listingId: string;
  scene: LabListingScene;
  onReload: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(scene.refinement_notes ?? "");
  const notes = scene.refinement_notes ?? "";

  async function save() {
    await setSceneRefinementNotes(listingId, scene.id, draft.trim() || null);
    setEditing(false);
    onReload();
  }

  async function clear() {
    await setSceneRefinementNotes(listingId, scene.id, null);
    setDraft("");
    setEditing(false);
    onReload();
  }

  if (!notes && !editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        + Add instructions for future renders
      </button>
    );
  }

  return (
    <div className="border border-amber-400/40 bg-amber-400/5 p-3">
      <div className="flex items-center justify-between">
        <span className="label text-amber-800">Future-render instructions</span>
        {!editing && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => { setDraft(notes); setEditing(true); }}>Edit</Button>
            <Button size="sm" variant="ghost" onClick={clear}><X className="h-3 w-3" /></Button>
          </div>
        )}
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="text-xs" />
          <div className="flex gap-2">
            <Button size="sm" onClick={save}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => { setEditing(false); setDraft(notes); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-foreground">{notes}</pre>
      )}
    </div>
  );
}

export function SceneCard({ listingId, scene, iterations, photos, defaultModel, onReload }: SceneCardProps) {
  const startPhoto = photos.find((p) => p.id === scene.photo_id);
  const endPhoto = scene.end_photo_id ? photos.find((p) => p.id === scene.end_photo_id) : null;
  const [rendering, setRendering] = useState(false);
  const [editing, setEditing] = useState(false);
  const [promptDraft, setPromptDraft] = useState(scene.director_prompt);
  const [showArchived, setShowArchived] = useState(false);
  const [sceneChatOpen, setSceneChatOpen] = useState(false);

  const { visibleIters, archivedCount } = useMemo(() => {
    const arch = iterations.filter((i) => i.archived).length;
    return {
      visibleIters: showArchived ? iterations : iterations.filter((i) => !i.archived),
      archivedCount: arch,
    };
  }, [iterations, showArchived]);

  async function submitRender(modelOverride?: string) {
    setRendering(true);
    try {
      await renderListing(listingId, { scene_ids: [scene.id], model_override: modelOverride });
      onReload();
    } finally {
      setRendering(false);
    }
  }

  async function handleRefine() {
    if (promptDraft === scene.director_prompt) { setEditing(false); return; }
    await refineScenePrompt(listingId, scene.id, promptDraft);
    setEditing(false);
    onReload();
  }

  async function toggleEndFrame() {
    await setSceneUseEndFrame(listingId, scene.id, !scene.use_end_frame);
    onReload();
  }

  async function pinSceneMessage(_idx: number, content: string) {
    await pinSceneInstruction(listingId, scene.id, content);
    onReload();
  }

  return (
    <div className="border border-border bg-background p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="label text-muted-foreground">Scene {scene.scene_number}</span>
          <div className="mt-1 flex gap-2">
            <span className="border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{scene.room_type}</span>
            <span className="border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{scene.camera_movement}</span>
            {endPhoto && (
              <span className="border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-700">paired</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <PairVisualization
          startImageUrl={startPhoto?.image_url ?? ""}
          endImageUrl={scene.use_end_frame ? scene.end_image_url : null}
          isPaired={Boolean(endPhoto) && scene.use_end_frame}
        />
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={toggleEndFrame}
            className={`border px-2 py-1 uppercase tracking-wider ${
              scene.use_end_frame
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                : "border-border bg-muted text-muted-foreground"
            }`}
          >
            End frame: {scene.use_end_frame ? "on" : "off"}
          </button>
          <span className="text-muted-foreground">
            {scene.use_end_frame
              ? "Clip will interpolate start → end."
              : "Clip renders from the start frame only (better for push-ins, closeups, top-downs)."}
          </span>
        </div>
      </div>

      <div className="mt-4">
        <span className="label text-muted-foreground">Director prompt</span>
        {editing ? (
          <div className="mt-2 space-y-2">
            <Textarea value={promptDraft} onChange={(e) => setPromptDraft(e.target.value)} className="text-sm" />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleRefine}>Save</Button>
              <Button size="sm" variant="outline" onClick={() => { setEditing(false); setPromptDraft(scene.director_prompt); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex items-start justify-between gap-4">
            <p className="flex-1 font-mono text-sm">{scene.director_prompt}</p>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Sparkles className="mr-1 h-3 w-3" /> Refine
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4">
        <RefinementNotesPanel listingId={listingId} scene={scene} onReload={onReload} />
      </div>

      <div className="mt-3">
        <Button size="sm" variant="ghost" onClick={() => setSceneChatOpen((o) => !o)}>
          <MessageSquare className="mr-1 h-3 w-3" />
          {sceneChatOpen ? "Hide scene chat" : (scene.chat_messages.length > 0 ? `Scene chat (${scene.chat_messages.length})` : "Scene chat — shape intent before first render")}
        </Button>
        {sceneChatOpen && (
          <div className="mt-2">
            <ChatPanel
              messages={scene.chat_messages}
              onSend={(m, cb) => chatSceneStream(listingId, scene.id, m, cb)}
              onClear={async () => { await clearSceneChat(listingId, scene.id); onReload(); }}
              onPinMessage={pinSceneMessage}
              emptyHint="No iterations yet. Tell the system what this scene should emphasize, what to avoid, how it should feel. Instructions get saved for the first render."
              placeholder="Describe what you want... (Enter to send, Shift+Enter for newline)"
              headerLabel="Chat with this scene"
            />
          </div>
        )}
      </div>

      <div className="mt-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="label text-muted-foreground">Iterations ({visibleIters.length}{archivedCount > 0 ? ` / ${iterations.length}` : ""})</span>
            {archivedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowArchived((s) => !s)}
                className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {showArchived ? `Hide archived (${archivedCount})` : `Show archived (${archivedCount})`}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => submitRender()} disabled={rendering}>
              {rendering ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}
              Render {defaultModel === "kling-v3-pro" ? "Kling" : "Wan"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => submitRender(defaultModel === "kling-v3-pro" ? "wan-2.7" : "kling-v3-pro")} disabled={rendering}>
              <RotateCcw className="mr-1 h-3 w-3" />
              Try {defaultModel === "kling-v3-pro" ? "Wan 2.7" : "Kling 3.0"}
            </Button>
          </div>
        </div>

        {visibleIters.length === 0 && (
          <p className="text-xs text-muted-foreground">No iterations yet. Click Render to generate the first clip.</p>
        )}

        {visibleIters.map((iter) => (
          <IterationRow key={iter.id} listingId={listingId} scene={scene} iter={iter} onReload={onReload} />
        ))}
      </div>
    </div>
  );
}
