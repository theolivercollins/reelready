import { useState } from "react";
import { Loader2, Star, Play, Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PairVisualization } from "./PairVisualization";
import {
  renderListing,
  rateIteration,
  refineScenePrompt,
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

  async function handleRate(iterId: string, rating: number) {
    await rateIteration(listingId, iterId, { rating });
    onReload();
  }

  async function handleRefine() {
    if (promptDraft === scene.director_prompt) { setEditing(false); return; }
    await refineScenePrompt(listingId, scene.id, promptDraft);
    setEditing(false);
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
          endImageUrl={scene.end_image_url}
          isPaired={Boolean(endPhoto)}
        />
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
          <div key={iter.id} className="border border-border p-3">
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
              <Stars value={iter.rating} onChange={(n) => handleRate(iter.id, n)} disabled={!iter.clip_url} />
            </div>
            {iter.clip_url && (
              <video controls src={iter.clip_url} className="mt-2 aspect-video w-full bg-black" preload="metadata" />
            )}
            {iter.render_error && (
              <p className="mt-2 text-[11px] text-destructive">Error: {iter.render_error}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
