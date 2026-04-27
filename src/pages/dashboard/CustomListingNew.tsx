import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ExternalLink, Copy, Download, ChevronDown, ChevronUp, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { listClients, type Client } from "@/lib/clientsApi";
import {
  scrapeListing,
  createListing,
  MOCK_SCRAPED_LISTING,
  type ScrapedListing,
} from "@/lib/customListingsApi";

// ────────────────────────────────────────────────────────────
// Publish result modal
// ────────────────────────────────────────────────────────────

interface PublishResult {
  id: string;
  url: string;
  qr_url: string;
  sierra_page_url: string;
}

function PublishModal({
  result,
  onClose,
}: {
  result: PublishResult;
  onClose: () => void;
}) {
  function copyUrl() {
    navigator.clipboard.writeText(result.url).then(() => {
      toast.success("URL copied to clipboard.");
    });
  }

  function downloadQr() {
    const a = document.createElement("a");
    a.href = result.qr_url;
    a.download = "listing-qr.png";
    a.click();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Listing page published</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Landing page URL</p>
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 break-all text-sm underline-offset-2 hover:underline"
            >
              {result.url}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>

          {result.sierra_page_url && (
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Sierra page</p>
              <a
                href={result.sierra_page_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 break-all text-sm underline-offset-2 hover:underline"
              >
                {result.sierra_page_url}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </div>
          )}

          {result.qr_url && (
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">QR code</p>
              <img
                src={result.qr_url}
                alt="QR code"
                className="h-32 w-32 border border-border"
              />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button onClick={copyUrl} variant="outline" size="sm">
              <Copy className="mr-2 h-3.5 w-3.5" /> Copy URL
            </Button>
            {result.qr_url && (
              <Button onClick={downloadQr} variant="outline" size="sm">
                <Download className="mr-2 h-3.5 w-3.5" /> Download QR
              </Button>
            )}
            <Button onClick={onClose} size="sm">
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────
// Mini preview of the landing page
// ────────────────────────────────────────────────────────────

function ListingPreview({
  scraped,
  videoUrl,
  agentScheduleUrl,
}: {
  scraped: ScrapedListing;
  videoUrl: string;
  agentScheduleUrl?: string;
}) {
  const [descExpanded, setDescExpanded] = useState(false);

  return (
    <div className="border border-border bg-background overflow-hidden">
      {/* Video placeholder */}
      <div className="relative aspect-video w-full bg-neutral-900 flex items-center justify-center">
        {videoUrl ? (
          <iframe
            src={videoUrl}
            className="absolute inset-0 h-full w-full"
            allow="autoplay; fullscreen"
            allowFullScreen
            title="Listing video"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-neutral-500">
            <Film className="h-10 w-10" />
            <span className="text-xs">Video will appear here</span>
          </div>
        )}
      </div>

      {/* Address + price strip */}
      <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border">
        <div>
          <h3 className="font-semibold text-lg leading-tight">{scraped.address}</h3>
          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {scraped.beds && <span>{scraped.beds} BD</span>}
            {scraped.baths && <span>{scraped.baths} BA</span>}
            {scraped.sqft && <span>{scraped.sqft} sqft</span>}
            {scraped.property_type && <span>{scraped.property_type}</span>}
            {scraped.year_built && <span>Built {scraped.year_built}</span>}
          </div>
        </div>
        {scraped.price && (
          <div className="text-xl font-bold tabular-nums shrink-0">{scraped.price}</div>
        )}
      </div>

      {/* Description */}
      {scraped.description && (
        <div className="px-5 py-4 border-b border-border">
          <p className={`text-sm text-muted-foreground leading-relaxed ${!descExpanded ? "line-clamp-4" : ""}`}>
            {scraped.description}
          </p>
          {scraped.description.length > 200 && (
            <button
              type="button"
              className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setDescExpanded((v) => !v)}
            >
              {descExpanded ? (
                <><ChevronUp className="h-3 w-3" /> Show less</>
              ) : (
                <><ChevronDown className="h-3 w-3" /> Read more</>
              )}
            </button>
          )}
        </div>
      )}

      {/* Photo + detail link row */}
      <div className="flex items-center gap-4 px-5 py-4 border-b border-border">
        {scraped.photo_url && (
          <img
            src={scraped.photo_url}
            alt="Property"
            className="h-20 w-32 object-cover border border-border shrink-0"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        )}
        {scraped.detail_url && (
          <a
            href={scraped.detail_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm underline-offset-2 hover:underline text-muted-foreground"
          >
            View full listing <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* CTA */}
      <div className="px-5 py-5">
        <a
          href={agentScheduleUrl || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors"
        >
          Schedule a Call
        </a>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────────────────────

export default function CustomListingNew() {
  const navigate = useNavigate();

  // Section A state
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [address, setAddress] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [mlsOverride, setMlsOverride] = useState("");

  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  // Section B state
  const [scraped, setScraped] = useState<ScrapedListing | null>(null);

  // Publish state
  const [publishing, setPublishing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);

  useEffect(() => {
    listClients()
      .then(setClients)
      .catch(() => {
        // Silently fall back — we set mock clients from listClients already
      });
  }, []);

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  async function handleFetch() {
    if (!clientId) { setScrapeError("Select a client first."); return; }
    if (!address) { setScrapeError("Enter an address."); return; }

    setScrapeError(null);
    setScraping(true);
    setScraped(null);

    try {
      const data = await scrapeListing({
        client_id: clientId,
        address,
        mls: mlsOverride || undefined,
      });
      setScraped(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Backend not ready — use mock
      if (msg.startsWith("404") || msg.includes("not ready") || msg.includes("404")) {
        toast.warning("Backend not ready yet, using mock data.");
        setScraped(MOCK_SCRAPED_LISTING);
      } else {
        setScrapeError(
          "Couldn't find a listing matching that address. Try the full address or paste an MLS# directly."
        );
      }
    } finally {
      setScraping(false);
    }
  }

  async function handlePublish(publish: boolean) {
    if (!scraped || !clientId) return;

    const setter = publish ? setPublishing : setSavingDraft;
    setter(true);

    try {
      const result = await createListing({
        client_id: clientId,
        address,
        video_url: videoUrl,
        mls: mlsOverride || scraped.mls || undefined,
        scraped_data: scraped,
        publish,
      });

      if (publish) {
        toast.success("Listing page published to Sierra.");
        setPublishResult(result);
      } else {
        toast.success("Draft saved.");
        navigate("/dashboard/clients");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || "Something went wrong.");
    } finally {
      setter(false);
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <span className="label text-muted-foreground">— Custom Listings</span>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em]">New listing page</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Fetch listing details from Sierra, attach a video, and publish a custom landing page.
        </p>
      </div>

      {/* ── Section A — Inputs ─────────────────────── */}
      <section className="max-w-2xl space-y-5">
        <h3 className="text-xs uppercase tracking-wider font-medium text-muted-foreground border-b border-border pb-2">
          Listing details
        </h3>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Client <span className="text-destructive">*</span>
          </label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a client…" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Address <span className="text-destructive">*</span>
          </label>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="193 Santa Fe St, Port Charlotte, FL 33953"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Video URL
          </label>
          <Input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="Bunny.net iframe URL, Supabase signed URL, YouTube, or any embeddable URL"
          />
          <p className="text-[11px] text-muted-foreground">
            Paste a Bunny.net iframe URL, Supabase signed URL, YouTube, or any embeddable video URL.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            MLS# override <span className="opacity-50">(optional)</span>
          </label>
          <Input
            value={mlsOverride}
            onChange={(e) => setMlsOverride(e.target.value)}
            placeholder="C7523121"
            className="max-w-[180px]"
          />
          <p className="text-[11px] text-muted-foreground">
            Usually auto-detected from address. Paste an MLS# to override.
          </p>
        </div>

        {scrapeError && (
          <p className="text-xs text-destructive">{scrapeError}</p>
        )}

        <Button onClick={handleFetch} disabled={scraping} size="default">
          {scraping ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Fetching listing…
            </>
          ) : (
            "Fetch Listing Details"
          )}
        </Button>
      </section>

      {/* ── Section B — Preview ─────────────────────── */}
      {scraped && (
        <section className="space-y-5">
          <h3 className="text-xs uppercase tracking-wider font-medium text-muted-foreground border-b border-border pb-2">
            Preview
          </h3>

          {/* Scraped data summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 max-w-2xl">
            {[
              { label: "Address", value: scraped.address },
              { label: "Price", value: scraped.price },
              { label: "Beds", value: scraped.beds },
              { label: "Baths", value: scraped.baths },
              { label: "Sq Ft", value: scraped.sqft },
              { label: "Property type", value: scraped.property_type },
              { label: "Year built", value: scraped.year_built },
              { label: "MLS#", value: scraped.mls },
            ]
              .filter((item) => item.value)
              .map((item) => (
                <div key={item.label} className="border border-border px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</div>
                  <div className="mt-0.5 text-sm font-medium truncate">{item.value}</div>
                </div>
              ))}
          </div>

          {/* Landing page preview */}
          <div className="max-w-2xl">
            <p className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">
              Landing page preview
            </p>
            <ListingPreview
              scraped={scraped}
              videoUrl={videoUrl}
              agentScheduleUrl={selectedClient?.agent_schedule_url}
            />
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              onClick={() => handlePublish(true)}
              disabled={publishing || savingDraft}
              size="default"
            >
              {publishing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Publishing…
                </>
              ) : (
                "Publish to Sierra"
              )}
            </Button>
            <Button
              onClick={() => handlePublish(false)}
              disabled={publishing || savingDraft}
              variant="outline"
              size="default"
            >
              {savingDraft ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save Draft"
              )}
            </Button>
          </div>
        </section>
      )}

      {/* Publish result modal */}
      {publishResult && (
        <PublishModal
          result={publishResult}
          onClose={() => setPublishResult(null)}
        />
      )}
    </div>
  );
}
