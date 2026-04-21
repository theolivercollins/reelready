import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Loader2, Plus, Trash2, Sparkles, FlaskConical, ArrowRight, GitPullRequest, Map as MapIcon } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import "@/v2/styles/v2.css";

const EYEBROW: CSSProperties = { fontFamily: "var(--le-font-mono)", fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)" };
const PAGE_H1: CSSProperties = { fontFamily: "var(--le-font-sans)", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 500, letterSpacing: "-0.035em", lineHeight: 0.98, color: "#fff", margin: 0 };
const SECTION_H3: CSSProperties = { fontFamily: "var(--le-font-sans)", fontSize: 20, fontWeight: 500, letterSpacing: "-0.025em", color: "#fff", margin: 0 };
const PRIMARY_BTN: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", fontSize: 12, fontWeight: 500, background: "#fff", color: "#07080c", border: "none", borderRadius: 2, cursor: "pointer", fontFamily: "var(--le-font-sans)" };
const GHOST_BTN: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: 11, fontWeight: 500, background: "transparent", color: "#fff", border: "1px solid rgba(220,230,255,0.18)", borderRadius: 2, cursor: "pointer", fontFamily: "var(--le-font-sans)" };
import {
  listDevNotes,
  createDevNote,
  updateDevNote,
  deleteDevNote,
  type DevNote,
} from "@/lib/devApi";
import { fetchPromptRevisions } from "@/lib/api";
import type { PromptRevision } from "@/lib/types";

const Development = () => {
  const [notes, setNotes] = useState<DevNote[] | null>(null);
  const [revisions, setRevisions] = useState<Array<{ prompt_name: string; revisions: PromptRevision[] }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ objective: "", accomplishments: "", session_date: new Date().toISOString().slice(0, 10) });

  async function reload() {
    try {
      const [n, r] = await Promise.all([listDevNotes(), fetchPromptRevisions()]);
      setNotes(n.notes);
      setRevisions(r.prompts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleCreate() {
    if (!draft.objective.trim() && !draft.accomplishments.trim()) return;
    try {
      await createDevNote(draft);
      setDraft({ objective: "", accomplishments: "", session_date: new Date().toISOString().slice(0, 10) });
      setCreating(false);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-16">
      <div>
        <span style={EYEBROW}>— Development</span>
        <h2 className="mt-3" style={PAGE_H1}>Progress, schema, and plans</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Working log of session objectives and outcomes, the live prompt changelog, a pointer to the prompt lab and learning feedback, and a running reference for how the pipeline actually works today.
        </p>
      </div>

      {/* Quick links */}
      <div className="grid gap-4 md:grid-cols-2">
        <Link
          to="/dashboard/development/learning"
          className="group border border-border bg-background p-6 transition hover:border-foreground"
        >
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-muted-foreground group-hover:text-foreground" />
            <div className="label text-muted-foreground group-hover:text-foreground">Learning</div>
            <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground group-hover:text-foreground" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Aggregated ratings across every run — top winners, top losers, avg rating per (room × camera movement × provider), plus the prompt revision changelog.
          </p>
        </Link>
        <Link
          to="/dashboard/development/lab"
          className="group border border-border bg-background p-6 transition hover:border-foreground"
        >
          <div className="flex items-center gap-3">
            <FlaskConical className="h-5 w-5 text-muted-foreground group-hover:text-foreground" />
            <div className="label text-muted-foreground group-hover:text-foreground">Prompt Lab</div>
            <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground group-hover:text-foreground" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Upload a batch of photos as a &quot;listing&quot; (just like production). Director pairs photos into start+end keyframes, plans scenes with intent tags, and you render/rate each clip. Kling 3.0 default + Wan 2.7 toggle per scene.
          </p>
        </Link>
        <Link
          to="/dashboard/development/prompt-lab/recipes"
          className="group border border-border bg-background p-6 transition hover:border-foreground"
        >
          <div className="flex items-center gap-3">
            <FlaskConical className="h-5 w-5 text-muted-foreground group-hover:text-foreground" />
            <div className="label text-muted-foreground group-hover:text-foreground">Recipe library</div>
            <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground group-hover:text-foreground" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Validated director prompts keyed by archetype. Promoted from 5★ Lab iterations. When a new photo matches a recipe within distance threshold, the director is told to use the recipe verbatim.
          </p>
        </Link>
        <Link
          to="/dashboard/development/proposals"
          className="group border border-border bg-background p-6 transition hover:border-foreground"
        >
          <div className="flex items-center gap-3">
            <GitPullRequest className="h-5 w-5 text-muted-foreground group-hover:text-foreground" />
            <div className="label text-muted-foreground group-hover:text-foreground">Prompt proposals</div>
            <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground group-hover:text-foreground" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Rule mining across rated Lab iterations. Claude proposes specific edits to the DIRECTOR_SYSTEM grounded in winner/loser patterns. Admin approves per-change. Applied proposals become active lab_prompt_overrides (production unaffected).
          </p>
        </Link>
        <Link
          to="/dashboard/development/knowledge-map"
          className="group border border-border bg-background p-6 transition hover:border-foreground"
        >
          <div className="flex items-center gap-3">
            <MapIcon className="h-5 w-5 text-muted-foreground group-hover:text-foreground" />
            <div className="label text-muted-foreground group-hover:text-foreground">Knowledge map</div>
            <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground group-hover:text-foreground" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Every (room type × camera verb) cell colored by learning state. See at a glance which scenes the machine is great at (golden), okay at, weak at, and has never been tested in. Click any cell to drill into its iterations, recipes, overrides, and fail-tag patterns.
          </p>
        </Link>
      </div>

      <div className="mt-8 text-right">
        <Link to="/dashboard/development/prompt-lab" className="text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Legacy Prompt Lab (archived) →
        </Link>
      </div>

      {error && (
        <div className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
      )}

      {/* Session notes */}
      <section>
        <div className="flex items-center justify-between">
          <div>
            <span style={EYEBROW}>Session notes</span>
            <h3 className="mt-2" style={SECTION_H3}>Working log</h3>
          </div>
          {!creating && (
            <button onClick={() => setCreating(true)} style={PRIMARY_BTN}>
              <Plus className="mr-2 h-3.5 w-3.5" /> New session note
            </button>
          )}
        </div>

        {creating && (
          <div className="mt-6 border border-border bg-background p-6 space-y-4">
            <div>
              <label className="text-xs text-muted-foreground">Date</label>
              <Input
                type="date"
                value={draft.session_date}
                onChange={(e) => setDraft((d) => ({ ...d, session_date: e.target.value }))}
                className="mt-1 w-auto"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Objective</label>
              <Textarea
                value={draft.objective}
                onChange={(e) => setDraft((d) => ({ ...d, objective: e.target.value }))}
                placeholder="What did we set out to do this session?"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">What we accomplished</label>
              <Textarea
                value={draft.accomplishments}
                onChange={(e) => setDraft((d) => ({ ...d, accomplishments: e.target.value }))}
                placeholder="What actually shipped / changed / decided"
                className="mt-1 min-h-[120px]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setCreating(false);
                  setDraft({ objective: "", accomplishments: "", session_date: new Date().toISOString().slice(0, 10) });
                }}
                style={GHOST_BTN}
              >
                Cancel
              </button>
              <button onClick={handleCreate} style={PRIMARY_BTN}>Save note</button>
            </div>
          </div>
        )}

        <div className="mt-6">
          {notes === null ? (
            <div className="py-10 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : notes.length === 0 ? (
            <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No session notes yet. Click &quot;New session note&quot; to log what you worked on today.
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map((n) => (
                <NoteRow key={n.id} note={n} onUpdated={reload} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Prompt changelog */}
      <section>
        <span style={EYEBROW}>Prompt changelog</span>
        <h3 className="mt-2" style={SECTION_H3}>Director + analyzer prompt versions</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Every pipeline run hashes each system prompt and records a revision if the body changed. The full list with expandable bodies lives under{" "}
          <Link to="/dashboard/development/learning" className="underline">Learning → Changelog</Link>.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {revisions === null ? (
            <div className="col-span-2 py-10 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            revisions.map((p) => {
              const latest = p.revisions[0];
              return (
                <div key={p.prompt_name} className="border border-border bg-background p-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-medium">{p.prompt_name}</span>
                    <span className="text-muted-foreground">v{latest?.version ?? "—"}</span>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {p.revisions.length} revision{p.revisions.length === 1 ? "" : "s"}
                    {latest && <> · last {new Date(latest.created_at).toLocaleDateString()}</>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* How it works */}
      <section>
        <span style={EYEBROW}>How the product works</span>
        <h3 className="mt-2" style={SECTION_H3}>Pipeline + schema reference</h3>
        <div className="mt-6 space-y-6 text-sm">
          <div className="border border-border bg-background p-6">
            <div className="label text-muted-foreground">Pipeline (6 stages, fire-and-forget)</div>
            <ol className="mt-4 space-y-2 text-sm">
              <li><span className="font-medium">1. Intake</span> — agent uploads 10–60 photos; <code className="text-xs">POST /api/pipeline/:propertyId</code> fires the run.</li>
              <li><span className="font-medium">2. Analysis</span> — Claude vision per photo: room, quality/aesthetic, depth, video_viable, key_features, composition, suggested_motion.</li>
              <li><span className="font-medium">3. Style guide</span> — one extra vision pass across all selected photos; stored on <code className="text-xs">properties.style_guide</code> but NOT injected into the director.</li>
              <li><span className="font-medium">4. Scripting</span> — director picks 10–16 scenes from viable photos. PAST GENERATIONS (rated winners + losers from last 30d) appended as in-context learning.</li>
              <li><span className="font-medium">5. Generation (submit-only)</span> — parallel worker pool submits to Kling/Runway, persists task_id, exits. No polling in the pipeline function.</li>
              <li><span className="font-medium">6. Cron finalize</span> — <code className="text-xs">/api/cron/poll-scenes</code> every minute: downloads completed clips, records cost, flips property to complete. Shotstack assembly runs here if <code className="text-xs">SHOTSTACK_API_KEY</code> is set.</li>
            </ol>
          </div>

          <div className="border border-border bg-background p-6">
            <div className="label text-muted-foreground">Provider routing</div>
            <div className="mt-4 text-sm text-muted-foreground">
              Movement-first, room-type as tiebreaker. See <code className="text-xs">lib/providers/router.ts</code>.
            </div>
            <div className="mt-3 grid gap-1 text-xs font-mono">
              <div>push_in / pull_out / drone_* / top_down / feature_closeup → Runway</div>
              <div>orbit (interior) → Kling · orbit (exterior/aerial) → Runway</div>
              <div>dolly_* / parallax / reveal / low_angle_glide → Kling</div>
            </div>
          </div>

          <div className="border border-border bg-background p-6">
            <div className="label text-muted-foreground">Camera vocabulary (11 active verbs)</div>
            <div className="mt-3 font-mono text-xs">
              push_in · pull_out · orbit · parallax · dolly_left_to_right · dolly_right_to_left · reveal · drone_push_in · drone_pull_back · top_down · low_angle_glide · feature_closeup
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              Banned (not emitted by new runs): tilt_up, tilt_down, crane_up, crane_down, slow_pan, orbital_slow. Vertical-only motions don&apos;t map to real-estate shot types.
            </div>
          </div>

          <div className="border border-border bg-background p-6">
            <div className="label text-muted-foreground">Key tables</div>
            <div className="mt-3 grid gap-2 text-xs font-mono">
              <div><span className="text-muted-foreground">properties</span> — address, price, status, cost, horizontal/vertical video urls, style_guide jsonb, pipeline_started_at</div>
              <div><span className="text-muted-foreground">photos</span> — room_type, quality/aesthetic, depth_rating, key_features[], composition, video_viable, suggested_motion</div>
              <div><span className="text-muted-foreground">scenes</span> — prompt, camera_movement, provider, provider_task_id, clip_url, status</div>
              <div><span className="text-muted-foreground">scene_ratings</span> — rating 1–5, comment, tags[], rated_by</div>
              <div><span className="text-muted-foreground">prompt_revisions</span> — prompt_name, version, body, body_hash</div>
              <div><span className="text-muted-foreground">cost_events</span> — stage, provider, units, cost_cents, metadata</div>
              <div><span className="text-muted-foreground">prompt_lab_sessions / prompt_lab_iterations</span> — calibration loop data</div>
              <div><span className="text-muted-foreground">dev_session_notes</span> — this page</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

// ── One note row (inline edit + delete) ──

function NoteRow({ note, onUpdated }: { note: DevNote; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    session_date: note.session_date,
    objective: note.objective ?? "",
    accomplishments: note.accomplishments ?? "",
  });

  async function save() {
    await updateDevNote(note.id, draft);
    setEditing(false);
    onUpdated();
  }

  async function remove() {
    if (!confirm("Delete this session note?")) return;
    await deleteDevNote(note.id);
    onUpdated();
  }

  if (editing) {
    return (
      <div className="border border-border bg-background p-5 space-y-3">
        <Input type="date" value={draft.session_date} onChange={(e) => setDraft((d) => ({ ...d, session_date: e.target.value }))} className="w-auto" />
        <Textarea value={draft.objective} onChange={(e) => setDraft((d) => ({ ...d, objective: e.target.value }))} placeholder="Objective" />
        <Textarea value={draft.accomplishments} onChange={(e) => setDraft((d) => ({ ...d, accomplishments: e.target.value }))} placeholder="Accomplishments" className="min-h-[100px]" />
        <div className="flex justify-end gap-2">
          <button onClick={() => { setEditing(false); setDraft({ session_date: note.session_date, objective: note.objective ?? "", accomplishments: note.accomplishments ?? "" }); }} style={GHOST_BTN}>Cancel</button>
          <button onClick={save} style={PRIMARY_BTN}>Save</button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border bg-background p-5">
      <div className="flex items-start justify-between">
        <div className="label text-muted-foreground tabular">
          {new Date(note.session_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <button onClick={() => setEditing(true)} className="hover:text-foreground">Edit</button>
          <button onClick={remove} className="inline-flex items-center gap-1 hover:text-destructive">
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>
      </div>
      {note.objective && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Objective</div>
          <p className="mt-1 whitespace-pre-wrap text-sm">{note.objective}</p>
        </div>
      )}
      {note.accomplishments && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Accomplished</div>
          <p className="mt-1 whitespace-pre-wrap text-sm">{note.accomplishments}</p>
        </div>
      )}
    </div>
  );
}

export default Development;
