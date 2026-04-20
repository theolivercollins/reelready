import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, RefreshCw, Play, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SceneCard } from "@/components/lab/SceneCard";
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

  if (loading && !listing) return <div className="p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!listing) return <p className="p-8 text-sm text-muted-foreground">Listing not found.</p>;

  return (
    <div className="space-y-10">
      <div>
        <Link to="/dashboard/development/lab" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> back to listings
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.02em]">{listing.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="border border-border px-2 py-0.5 uppercase tracking-wider">{listing.status}</span>
              <span className="border border-border px-2 py-0.5 uppercase tracking-wider">{listing.model_name}</span>
              <span>{photos.length} photos</span>
              <span>{scenes.length} scenes</span>
              <span>${(listing.total_cost_cents / 100).toFixed(2)} spent</span>
            </div>
            {listing.notes && <p className="mt-2 text-sm text-muted-foreground">{listing.notes}</p>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={reload}>
              <RefreshCw className="mr-1 h-3 w-3" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={rerunDirector} disabled={actionLoading === "direct"}>
              {actionLoading === "direct" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Re-direct
            </Button>
            <Button size="sm" onClick={renderAllUnrendered} disabled={actionLoading === "render-all"}>
              {actionLoading === "render-all" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}
              Render all
            </Button>
            <Button variant="ghost" size="sm" onClick={archive}><Archive className="h-3 w-3" /></Button>
          </div>
        </div>
      </div>

      {error && <div className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      <section>
        <span className="label text-muted-foreground">Photos</span>
        <div className="mt-3 grid grid-cols-4 gap-2 md:grid-cols-6 lg:grid-cols-8">
          {photos.map((p) => (
            <div key={p.id} className="relative aspect-video overflow-hidden border border-border bg-muted">
              <img src={p.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
              <span className="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-white">
                {p.photo_index} · {(p.analysis_json as { room_type?: string } | null)?.room_type ?? "—"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <span className="label text-muted-foreground">Scenes</span>
        <div className="mt-3 space-y-4">
          {scenes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {listing.status === "analyzing" || listing.status === "directing"
                ? "Director is planning scenes…"
                : "No scenes yet. Click Re-direct to run the director."}
            </p>
          )}
          {scenes.map((s) => (
            <SceneCard
              key={s.id}
              listingId={id}
              scene={s}
              iterations={iterations.filter((i) => i.scene_id === s.id).sort((a, b) => a.iteration_number - b.iteration_number)}
              photos={photos}
              defaultModel={listing.model_name}
              onReload={reload}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
