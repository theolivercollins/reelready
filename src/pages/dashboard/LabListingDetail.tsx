import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, RefreshCw, Play, Archive, Images } from "lucide-react";
import "@/v2/styles/v2.css";
import { SceneCard } from "@/components/lab/SceneCard";
import { ShotPlanTable } from "@/components/lab/ShotPlanTable";
import {
  getListing,
  directListing,
  renderListing,
  patchListing,
  type LabListing,
  type LabListingPhoto,
  type LabListingScene,
  type LabListingIteration,
} from "@/lib/labListingsApi";

export default function LabListingDetail() {
  const { id = "" } = useParams();
  const [listing, setListing] = useState<LabListing | null>(null);
  const [photos, setPhotos] = useState<LabListingPhoto[]>([]);
  const [scenes, setScenes] = useState<LabListingScene[]>([]);
  const [iterations, setIterations] = useState<LabListingIteration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [photosOpen, setPhotosOpen] = useState(false);

  async function reload() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getListing(id);
      setListing(data.listing);
      setPhotos(data.photos);
      setScenes(data.scenes);
      setIterations(data.iterations);
      if (!selectedSceneId && data.scenes.length > 0) {
        setSelectedSceneId(data.scenes[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    const interval = setInterval(() => {
      if (listing && ["analyzing", "directing", "rendering"].includes(listing.status)) {
        reload();
      }
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, listing?.status]);

  async function renderAllUnrendered() {
    if (!id) return;
    setActionLoading("render-all");
    try {
      const renderedSceneIds = new Set(iterations.map((i) => i.scene_id));
      const unrendered = scenes.filter((s) => !renderedSceneIds.has(s.id)).map((s) => s.id);
      if (unrendered.length === 0) return;
      const confirmed = window.confirm(
        `Render ${unrendered.length} scenes at $0.095 each = $${(unrendered.length * 0.095).toFixed(2)}?`,
      );
      if (!confirmed) return;
      await renderListing(id, { scene_ids: unrendered });
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function rerunDirector() {
    if (!id) return;
    setActionLoading("direct");
    try {
      await directListing(id);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function archive() {
    if (!id) return;
    const confirmed = window.confirm("Archive this listing? It'll be hidden from the list but kept.");
    if (!confirmed) return;
    await patchListing(id, { archived: true });
    window.location.href = "/dashboard/development/lab";
  }

  const stats = useMemo(() => {
    const rendered = scenes.filter((s) =>
      iterations.some((i) => i.scene_id === s.id && (i.status === "rendered" || i.status === "rated"))
    ).length;
    const totalCents = iterations.reduce((sum, i) => sum + (i.cost_cents ?? 0), 0);
    const byModel = iterations.reduce<Record<string, number>>((acc, i) => {
      acc[i.model_used] = (acc[i.model_used] ?? 0) + (i.cost_cents ?? 0);
      return acc;
    }, {});
    return { rendered, totalCents, byModel };
  }, [scenes, iterations]);

  const selectedScene = scenes.find((s) => s.id === selectedSceneId) ?? null;
  const selectedIterations = selectedScene
    ? iterations.filter((i) => i.scene_id === selectedScene.id).sort((a, b) => a.iteration_number - b.iteration_number)
    : [];

  if (loading && !listing) return <div className="p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!listing) return <p className="p-8 text-sm text-muted-foreground">Listing not found.</p>;

  return (
    <div className="space-y-5">
      <div>
        <Link to="/dashboard/development/lab" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> back to listings
        </Link>
      </div>

      <div className="border border-border bg-background" style={{ background: "var(--le-bg-elev, #0b0f1c)", border: "1px solid rgba(220,230,255,0.09)" }}>
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-semibold tracking-[-0.02em]" style={{ fontWeight: 500, letterSpacing: "-0.035em", fontFamily: "var(--le-font-sans)" }}>{listing.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="border border-border px-2 py-0.5 uppercase tracking-wider" style={{ borderRadius: 0, fontFamily: "var(--le-font-mono)", fontSize: 9, letterSpacing: "0.18em" }}>{listing.status}</span>
              <span className="border border-border px-2 py-0.5 uppercase tracking-wider" style={{ borderRadius: 0, fontFamily: "var(--le-font-mono)", fontSize: 9, letterSpacing: "0.18em" }}>{listing.model_name}</span>
              {listing.notes && <span className="truncate italic">{listing.notes}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 10px", fontSize: 11, fontWeight: 500, background: "transparent", color: "#fff", border: "1px solid rgba(220,230,255,0.18)", borderRadius: 2, cursor: "pointer", fontFamily: "var(--le-font-sans)" }} onClick={reload}>
              <RefreshCw className="mr-1 h-3 w-3" /> Refresh
            </button>
            <button type="button" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 10px", fontSize: 11, fontWeight: 500, background: "transparent", color: "#fff", border: "1px solid rgba(220,230,255,0.18)", borderRadius: 2, cursor: actionLoading === "direct" ? "not-allowed" : "pointer", opacity: actionLoading === "direct" ? 0.5 : 1, fontFamily: "var(--le-font-sans)" }} onClick={rerunDirector} disabled={actionLoading === "direct"}>
              {actionLoading === "direct" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Re-direct
            </button>
            <button type="button" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 10px", fontSize: 11, fontWeight: 500, background: "#fff", color: "#07080c", border: "none", borderRadius: 2, cursor: actionLoading === "render-all" ? "not-allowed" : "pointer", opacity: actionLoading === "render-all" ? 0.5 : 1, fontFamily: "var(--le-font-sans)" }} onClick={renderAllUnrendered} disabled={actionLoading === "render-all"}>
              {actionLoading === "render-all" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}
              Render all
            </button>
            <button type="button" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, background: "transparent", border: "none", borderRadius: 2, color: "rgba(255,255,255,0.45)", cursor: "pointer" }} onClick={archive}><Archive className="h-3 w-3" /></button>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-border text-xs sm:grid-cols-4 lg:grid-cols-5">
          <Stat label="Scenes" value={`${stats.rendered} / ${scenes.length}`} sub="rendered" />
          <Stat label="Iterations" value={String(iterations.filter((i) => !i.archived).length)} sub={iterations.length !== iterations.filter((i) => !i.archived).length ? `${iterations.length} total` : undefined} />
          <Stat label="Cost" value={`$${(stats.totalCents / 100).toFixed(2)}`} sub={Object.entries(stats.byModel).map(([m, c]) => `${m}: $${(c / 100).toFixed(2)}`).join(" • ") || undefined} />
          <Stat label="Photos" value={String(photos.length)} sub={
            <button type="button" onClick={() => setPhotosOpen((o) => !o)} className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
              <Images className="h-3 w-3" /> {photosOpen ? "hide" : "show"}
            </button>
          } />
          <Stat label="Created" value={new Date(listing.created_at).toLocaleDateString()} sub={new Date(listing.created_at).toLocaleTimeString()} />
        </div>
        {photosOpen && (
          <div className="border-t border-border px-5 py-3">
            <div className="grid grid-cols-6 gap-1 md:grid-cols-10 lg:grid-cols-12">
              {photos.map((p) => (
                <div key={p.id} className="relative aspect-video overflow-hidden border border-border bg-muted">
                  <img src={p.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  <span className="absolute bottom-0.5 left-0.5 bg-black/60 px-1 py-0.5 text-[8px] uppercase tracking-wider text-white">
                    {p.photo_index}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && <div className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      {scenes.length === 0 ? (
        <div className="border border-border bg-background p-8 text-center text-sm text-muted-foreground">
          {listing.status === "analyzing" || listing.status === "directing"
            ? "Director is planning scenes…"
            : "No scenes yet. Click Re-direct to run the director."}
        </div>
      ) : (
        <>
          <ShotPlanTable
            scenes={scenes}
            iterations={iterations}
            photos={photos}
            selectedSceneId={selectedSceneId}
            onSelect={setSelectedSceneId}
          />

          {selectedScene && (
            <SceneCard
              listingId={id}
              scene={selectedScene}
              iterations={selectedIterations}
              photos={photos}
              defaultModel={listing.model_name}
              onReload={reload}
            />
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div style={{ borderRight: "1px solid rgba(220,230,255,0.09)", padding: "12px 20px" }} className="last:border-r-0">
      <div style={{ fontFamily: "var(--le-font-mono)", fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)" }}>{label}</div>
      <div style={{ fontFamily: "var(--le-font-mono)", fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em", color: "#fff", marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontFamily: "var(--le-font-mono)", fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
