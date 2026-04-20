import { useState } from "react";
import { Loader2, Star, Play, Sparkles, RotateCcw, MessageSquare, Pin, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PairVisualization } from "./PairVisualization";
import {
  renderListing,
  rateIteration,
  refineScenePrompt,
  chatIteration,
  pinSceneInstruction,
  setSceneRefinementNotes,
  setSceneUseEndFrame,
  type LabListingScene,
  type LabListingIteration,
  type LabListingPhoto,
  type ChatMessage,
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

function IterationRow({ listingId, sceneId, iter, onReload }: {
  listingId: string;
  sceneId: string;
  iter: LabListingIteration;
  onReload: () => void;
}) {
  const [comment, setComment] = useState(iter.user_comment ?? "");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(iter.chat_messages ?? []);
  const [lastSaved, setLastSaved] = useState<string[]>([]);

  async function handleRate(n: number) {
    await rateIteration(listingId, iter.id, { rating: n });
    onReload();
  }

  async function saveComment() {
    if (comment === (iter.user_comment ?? "")) return;
    await rateIteration(listingId, iter.id, { comment: comment || null });
    onReload();
  }

  async function sendChat() {
    const msg = chatInput.trim();
    if (!msg || chatBusy) return;
    setChatBusy(true);
    const optimistic: ChatMessage = { role: "user", content: msg, ts: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    setChatInput("");
    try {
      const res = await chatIteration(listingId, iter.id, msg);
      setMessages(res.chat_messages);
      setLastSaved(res.saved_instructions);
      if (res.saved_instructions.length > 0) onReload();
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}`, ts: new Date().toISOString() }]);
    } finally {
      setChatBusy(false);
    }
  }

  async function pinUserMessage(content: string) {
    await pinSceneInstruction(listingId, sceneId, content);
    onReload();
  }

  return (
    <div className="border border-border p-3">
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
        </div>
        <Stars value={iter.rating} onChange={handleRate} disabled={!iter.clip_url} />
      </div>

      {iter.clip_url && (
        <video controls src={iter.clip_url} className="mt-2 aspect-video w-full bg-black" preload="metadata" />
      )}
      {iter.render_error && (
        <p className="mt-2 text-[11px] text-destructive">Error: {iter.render_error}</p>
      )}

      {iter.clip_url && (
        <>
          <div className="mt-3">
            <span className="label text-muted-foreground">Comment</span>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onBlur={saveComment}
              placeholder="What did you think? (saved on blur)"
              className="mt-1 min-h-[60px] text-xs"
            />
          </div>

          <div className="mt-3 flex items-center justify-between">
            <Button size="sm" variant="ghost" onClick={() => setChatOpen((o) => !o)}>
              <MessageSquare className="mr-1 h-3 w-3" />
              {chatOpen ? "Hide chat" : `Chat${messages.length > 0 ? ` (${messages.length})` : ""}`}
            </Button>
          </div>

          {chatOpen && (
            <div className="mt-2 border-t border-border pt-3">
              {messages.length === 0 && (
                <p className="text-[11px] text-muted-foreground italic">Ask about this iteration or tell the system what to change next time. The assistant can save instructions that influence future renders of this scene.</p>
              )}
              <div className="space-y-2">
                {messages.map((m, i) => (
                  <div key={i} className={`flex items-start gap-2 text-xs ${m.role === "user" ? "justify-end" : ""}`}>
                    {m.role === "assistant" && (
                      <span className="mt-0.5 shrink-0 rounded-full bg-foreground text-background px-1.5 py-0.5 text-[9px] uppercase tracking-wider">AI</span>
                    )}
                    <div className={`max-w-[80%] whitespace-pre-wrap rounded px-2 py-1.5 ${m.role === "user" ? "bg-foreground text-background" : "bg-muted"}`}>
                      {m.content}
                    </div>
                    {m.role === "user" && (
                      <button
                        type="button"
                        onClick={() => pinUserMessage(m.content)}
                        title="Pin as instruction for future renders"
                        className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <Pin className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {lastSaved.length > 0 && (
                <div className="mt-2 border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-700">
                  Saved for future renders: {lastSaved.join("; ")}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <Textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendChat(); } }}
                  placeholder="Ask or instruct... (Cmd/Ctrl+Enter to send)"
                  className="min-h-[40px] text-xs"
                />
                <Button size="sm" onClick={sendChat} disabled={chatBusy || !chatInput.trim()}>
                  {chatBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                </Button>
              </div>
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

      <div className="mt-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="label text-muted-foreground">Iterations ({iterations.length})</span>
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

        {iterations.length === 0 && (
          <p className="text-xs text-muted-foreground">No iterations yet. Click Render to generate the first clip.</p>
        )}

        {iterations.map((iter) => (
          <IterationRow key={iter.id} listingId={listingId} sceneId={scene.id} iter={iter} onReload={onReload} />
        ))}
      </div>
    </div>
  );
}
