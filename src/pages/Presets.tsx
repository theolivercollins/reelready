import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Preset, getPresets, deletePreset } from "@/lib/presets";
import { Trash2, ArrowRight, Check } from "lucide-react";
import { motion, AnimatePresence, type Variants } from "framer-motion";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 1, delay: i * 0.08, ease: EASE },
  }),
};

const stagger: Variants = {
  visible: { transition: { staggerChildren: 0.08 } },
};

const rowVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.9, delay: i * 0.06, ease: EASE },
  }),
};

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
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getPresets().then(setPresets);
  }, []);

  const handleDelete = async (id: string) => {
    if (confirmingId !== id) {
      setConfirmingId(id);
      return;
    }
    await deletePreset(id);
    setPresets((prev) => prev.filter((p) => p.id !== id));
    setConfirmingId(null);
  };

  const cancelConfirm = () => setConfirmingId(null);

  return (
    <div className="min-h-[calc(100vh-72px)] bg-background">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={stagger}
        className="mx-auto max-w-4xl px-8 py-16 md:px-12"
      >
        {/* Header */}
        <motion.div variants={fadeUp}>
          <span className="label text-muted-foreground">— Saved presets</span>
        </motion.div>
        <motion.div
          variants={fadeUp}
          className="mt-6 flex flex-col gap-6 md:flex-row md:items-end md:justify-between"
        >
          <div>
            <h1 className="display-md text-foreground">Your presets.</h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
              Reuse your favourite settings.
            </p>
          </div>
          <Button
            variant="outline"
            size="lg"
            onClick={() => navigate("/upload")}
            className="self-start md:self-auto"
          >
            New project
            <ArrowRight className="h-4 w-4" />
          </Button>
        </motion.div>

        {/* Body */}
        {presets.length === 0 ? (
          <motion.div
            variants={fadeUp}
            className="mt-20 border border-border bg-secondary/30 px-8 py-20 md:px-12 md:py-24"
          >
            <span className="label text-muted-foreground">— No presets yet.</span>
            <h2 className="display-md mt-6 max-w-2xl text-foreground">
              Save a preset from the upload form to reuse it later.
            </h2>
            <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
              Your duration, orientation, and add-on choices will be one click away
              the next time you start a video.
            </p>
            <div className="mt-10">
              <Button variant="outline" size="lg" onClick={() => navigate("/upload")}>
                Start a new video
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            variants={fadeUp}
            className="mt-20 border-t border-border"
          >
            <AnimatePresence initial={false}>
              {presets.map((preset, i) => {
                const isConfirming = confirmingId === preset.id;
                return (
                  <motion.div
                    key={preset.id}
                    custom={i}
                    variants={rowVariants}
                    initial="hidden"
                    animate="visible"
                    exit={{ opacity: 0, x: -20, transition: { duration: 0.4, ease: EASE } }}
                    layout
                    className="group flex flex-col gap-6 border-b border-border py-8 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-xl font-semibold tracking-[-0.02em] text-foreground md:text-2xl">
                        {preset.name}
                      </h3>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {preset.selectedPackage && (
                          <Badge variant="outline" className="border-border">
                            — {packageLabels[preset.selectedPackage] || preset.selectedPackage}
                          </Badge>
                        )}
                        {preset.selectedDuration && (
                          <Badge variant="outline" className="border-border text-muted-foreground">
                            {preset.selectedDuration}
                          </Badge>
                        )}
                        {preset.selectedOrientation && (
                          <Badge variant="outline" className="border-border text-muted-foreground">
                            {orientationLabels[preset.selectedOrientation] || preset.selectedOrientation}
                          </Badge>
                        )}
                        {preset.addVoiceover && (
                          <Badge variant="outline" className="border-border text-muted-foreground">
                            AI Voiceover
                          </Badge>
                        )}
                        {preset.addVoiceClone && (
                          <Badge variant="outline" className="border-border text-muted-foreground">
                            Voice Clone
                          </Badge>
                        )}
                        {preset.addCustomRequest && (
                          <Badge variant="outline" className="border-border text-muted-foreground">
                            Custom Request
                          </Badge>
                        )}
                      </div>
                      <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                        Created{" "}
                        <span className="text-foreground">
                          {new Date(preset.createdAt).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/upload?preset=${preset.id}`)}
                      >
                        Use
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                      {isConfirming ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDelete(preset.id)}
                            className="inline-flex h-9 items-center gap-1.5 border border-destructive/40 bg-destructive/5 px-3 text-[11px] font-medium uppercase tracking-[0.18em] text-destructive transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-destructive hover:bg-destructive/10"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={cancelConfirm}
                            className="label inline-flex h-9 items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDelete(preset.id)}
                          aria-label="Delete preset"
                          className="inline-flex h-9 w-9 items-center justify-center border border-border text-muted-foreground transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-destructive/60 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default Presets;
