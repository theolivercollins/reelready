import { useState, type CSSProperties } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Loader2, Upload as UploadIcon, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { createListing } from "@/lib/labListingsApi";
import "@/v2/styles/v2.css";

const EYEBROW: CSSProperties = {
  fontFamily: "var(--le-font-mono)",
  fontSize: 10,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.45)",
};
const PAGE_H1: CSSProperties = {
  fontFamily: "var(--le-font-sans)",
  fontSize: "clamp(28px, 4vw, 44px)",
  fontWeight: 500,
  letterSpacing: "-0.035em",
  lineHeight: 0.98,
  color: "#fff",
  margin: 0,
};
const PRIMARY_BTN: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 500,
  background: "#fff",
  color: "#07080c",
  border: "none",
  borderRadius: 2,
  cursor: "pointer",
  fontFamily: "var(--le-font-sans)",
};

export default function LabListingNew() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [model, setModel] = useState<"kling-v3-pro" | "wan-2.7">("kling-v3-pro");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ total: number; done: number }>({ total: 0, done: 0 });
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    if (files.length === 0) { setError("Select at least one photo"); return; }
    setUploading(true);
    setProgress({ total: files.length, done: 0 });
    try {
      const uploaded: Array<{ image_url: string; image_path: string }> = [];
      for (const file of files) {
        const path = `lab-listings/${crypto.randomUUID()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("property-photos").upload(path, file, { upsert: false });
        if (upErr) throw new Error(`Upload ${file.name}: ${upErr.message}`);
        const { data: pub } = supabase.storage.from("property-photos").getPublicUrl(path);
        uploaded.push({ image_url: pub.publicUrl, image_path: path });
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }

      const { listing_id } = await createListing({
        name: name || `Listing ${new Date().toISOString().slice(0, 16)}`,
        model_name: model,
        notes: notes || null,
        photos: uploaded,
      });
      navigate(`/dashboard/development/lab/${listing_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <Link to="/dashboard/development/lab" className="inline-flex items-center gap-1 hover:text-foreground" style={EYEBROW}>
          <ArrowLeft className="h-3 w-3" /> back to listings
        </Link>
        <h2 className="mt-3" style={PAGE_H1}>Create listing</h2>
      </div>

      <div className="max-w-2xl space-y-5">
        <div className="space-y-2">
          <label style={EYEBROW}>Name (optional)</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Miami waterfront test" />
        </div>

        <div className="space-y-2">
          <label style={EYEBROW}>Model</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setModel("kling-v3-pro")}
              className={`border px-4 py-2 text-sm ${model === "kling-v3-pro" ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground"}`}
            >
              Kling 3.0 Pro ($0.095/clip)
            </button>
            <button
              type="button"
              onClick={() => setModel("wan-2.7")}
              className={`border px-4 py-2 text-sm ${model === "wan-2.7" ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground"}`}
            >
              Wan 2.7 ($0.10/clip)
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label style={EYEBROW}>Notes</label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What are you testing?" className="min-h-24" />
        </div>

        <div className="space-y-2">
          <label style={EYEBROW}>Photos (10-30 recommended)</label>
          <Input
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          {files.length > 0 && (
            <p className="text-[11px] text-muted-foreground">{files.length} selected</p>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <button
          type="button"
          onClick={handleCreate}
          disabled={uploading || files.length === 0}
          style={{ ...PRIMARY_BTN, padding: "10px 18px", fontSize: 13, opacity: uploading || files.length === 0 ? 0.5 : 1 }}
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading {progress.done}/{progress.total}
            </>
          ) : (
            <>
              <UploadIcon className="h-4 w-4" /> Upload &amp; Analyze
            </>
          )}
        </button>
      </div>
    </div>
  );
}
