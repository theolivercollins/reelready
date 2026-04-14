import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { type Preset, getPresets, deletePreset } from "@/lib/presets";
import { Trash2, ArrowRight, BookmarkPlus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const packageLabels: Record<string, string> = {
  just_listed: "Just Listed",
  just_pended: "Just Pended",
  just_closed: "Just Closed",
  life_cycle: "Life Cycle",
};

const orientationLabels: Record<string, string> = {
  vertical: "Vertical",
  horizontal: "Horizontal",
  both: "Both",
};

const Presets = () => {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getPresets().then(setPresets);
  }, []);

  const handleDelete = async (id: string) => {
    await deletePreset(id);
    setPresets((prev) => prev.filter((p) => p.id !== id));
    setConfirmId(null);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-[1080px] items-end justify-between gap-6 px-8 py-12 md:px-12">
          <div>
            <span className="label text-muted-foreground">— Library</span>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] md:text-4xl">Saved presets</h1>
            <p className="mt-3 max-w-md text-sm text-muted-foreground">
              Reuse your favorite configurations. Apply a preset on the new-listing form to skip straight to property details.
            </p>
          </div>
          <Button asChild size="sm">
            <Link to="/upload">
              New listing
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1080px] flex-1 px-8 py-16 md:px-12 md:py-24">
        {presets.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE }}
            className="border border-dashed border-border bg-secondary/30 px-12 py-20 text-center"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center border border-border text-muted-foreground">
              <BookmarkPlus className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <h2 className="mt-8 text-2xl font-semibold tracking-[-0.02em]">No presets yet.</h2>
            <p className="mx-auto mt-4 max-w-sm text-sm text-muted-foreground">
              Save a preset from the Style step on the new-listing form. It'll show up here for one-tap reuse.
            </p>
            <Button asChild className="mt-10">
              <Link to="/upload">
                Create your first listing
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </motion.div>
        ) : (
          <ul className="grid gap-px bg-border">
            <AnimatePresence>
              {presets.map((preset, i) => (
                <motion.li
                  key={preset.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.6, delay: i * 0.04, ease: EASE }}
                  layout
                  className="group relative bg-background"
                >
                  <div className="flex items-center gap-8 px-6 py-6 md:px-10">
                    <div className="hidden w-12 shrink-0 md:block">
                      <span className="tabular text-xs font-medium text-muted-foreground/60">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-semibold tracking-[-0.01em]">{preset.name}</h3>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                        {preset.selectedPackage && (
                          <span className="label text-foreground">
                            {packageLabels[preset.selectedPackage] || preset.selectedPackage}
                          </span>
                        )}
                        {preset.selectedDuration && (
                          <span className="label text-muted-foreground">{preset.selectedDuration}</span>
                        )}
                        {preset.selectedOrientation && (
                          <span className="label text-muted-foreground">
                            {orientationLabels[preset.selectedOrientation] || preset.selectedOrientation}
                          </span>
                        )}
                        {preset.addVoiceover && <span className="label text-accent">AI voiceover</span>}
                        {preset.addVoiceClone && <span className="label text-accent">Voice clone</span>}
                        {preset.addCustomRequest && <span className="label text-accent">Custom request</span>}
                      </div>
                      <p className="tabular mt-3 text-[11px] text-muted-foreground/60">
                        Saved {new Date(preset.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/upload?preset=${preset.id}`}>
                          Apply
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      {confirmId === preset.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDelete(preset.id)}
                            className="label text-destructive transition-colors hover:text-destructive/80"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmId(null)}
                            className="label text-muted-foreground transition-colors hover:text-foreground"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmId(preset.id)}
                          aria-label="Delete preset"
                          className="flex h-9 w-9 items-center justify-center border border-border text-muted-foreground transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
};

export default Presets;
