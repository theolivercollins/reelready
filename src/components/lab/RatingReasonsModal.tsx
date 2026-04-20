import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const POSITIVE_REASONS = [
  "good_pacing", "clean_motion", "on_brand", "excellent_composition", "accurate_to_photo", "cinematic_energy",
] as const;

export const NEGATIVE_REASONS = [
  "camera_shake", "too_fast", "too_slow", "boring_motion",
  "hallucinated_geometry", "hallucinated_objects", "warped_text", "flicker",
  "jumpy", "overexposed", "underexposed", "color_cast",
  "bad_framing", "subject_drift", "end_frame_lurch",
] as const;

const LABELS: Record<string, string> = {
  good_pacing: "Good pacing", clean_motion: "Clean motion", on_brand: "On-brand",
  excellent_composition: "Excellent composition", accurate_to_photo: "Accurate to photo", cinematic_energy: "Cinematic energy",
  camera_shake: "Camera shake", too_fast: "Too fast", too_slow: "Too slow", boring_motion: "Boring motion",
  hallucinated_geometry: "Hallucinated geometry", hallucinated_objects: "Hallucinated objects",
  warped_text: "Warped text", flicker: "Flicker", jumpy: "Jumpy / stutter",
  overexposed: "Overexposed", underexposed: "Underexposed", color_cast: "Color cast",
  bad_framing: "Bad framing", subject_drift: "Subject drifts out of frame",
  end_frame_lurch: "End-frame lurch / interpolation", other: "Other (see comment)",
};

interface RatingReasonsModalProps {
  rating: number;
  initialReasons: string[];
  initialComment: string;
  onSave: (reasons: string[], comment: string) => Promise<void>;
  onClose: () => void;
}

export function RatingReasonsModal({ rating, initialReasons, initialComment, onSave, onClose }: RatingReasonsModalProps) {
  const [reasons, setReasons] = useState<string[]>(initialReasons);
  const [comment, setComment] = useState(initialComment);
  const [saving, setSaving] = useState(false);

  const showPositive = rating >= 4;
  const showNegative = rating <= 3;
  const list = showPositive ? POSITIVE_REASONS : showNegative ? NEGATIVE_REASONS : [];

  function toggle(r: string) {
    setReasons((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(reasons, comment);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md border border-border bg-background p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <span className="label text-muted-foreground">
              Why {rating}★?
            </span>
            <p className="mt-1 text-xs text-muted-foreground">
              {showPositive ? "What worked? Pick all that apply." : showNegative ? "What went wrong? Pick all that apply." : "Add a reason"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {list.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => toggle(r)}
              className={`border px-2 py-1 text-[11px] uppercase tracking-wider ${
                reasons.includes(r)
                  ? showPositive
                    ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-700"
                    : "border-red-400/60 bg-red-400/10 text-red-700"
                  : "border-border bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {LABELS[r]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => toggle("other")}
            className={`border px-2 py-1 text-[11px] uppercase tracking-wider ${
              reasons.includes("other")
                ? "border-foreground bg-muted text-foreground"
                : "border-border bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Other
          </button>
        </div>

        <div className="mt-4">
          <span className="label text-muted-foreground">Comment (optional)</span>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add detail — especially if 'Other' is selected."
            className="mt-1 min-h-[64px] text-xs"
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>Skip</Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save rating"}
          </Button>
        </div>
      </div>
    </div>
  );
}
