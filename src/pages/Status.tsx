import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Check,
  Circle,
  Download,
  Loader2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { motion, type Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { fetchPropertyStatus } from "@/lib/api";

const stages = [
  { key: "uploaded", label: "Uploaded" },
  { key: "analyzing", label: "Analyzing photos" },
  { key: "scripting", label: "Planning shots" },
  { key: "generating", label: "Generating video" },
  { key: "qc", label: "Quality check" },
  { key: "complete", label: "Complete" },
];

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 1.1, delay: i * 0.08, ease: EASE },
  }),
};

const stagger: Variants = {
  visible: { transition: { staggerChildren: 0.1 } },
};

function relativeTime(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (minutes < 60) return remSec ? `${minutes}m ${remSec}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin ? `${hours}h ${remMin}m` : `${hours}h`;
}

const Status = () => {
  const { id } = useParams();
  const [data, setData] = useState<{
    id: string;
    address: string;
    status: string;
    currentStage: number;
    totalStages: number;
    clipsCompleted: number;
    clipsTotal: number;
    horizontalVideoUrl: string | null;
    verticalVideoUrl: string | null;
    createdAt: string;
    processingTimeMs: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const result = await fetchPropertyStatus(id);
        if (cancelled) return;
        setData(result);
        setError(null);
        setLoading(false);
        if (result.status !== "complete" && result.status !== "failed") {
          timer = setTimeout(poll, 5000);
        }
      } catch (err: any) {
        if (cancelled) return;
        setError(err.message || "Failed to load status");
        setLoading(false);
      }
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-72px)] items-center justify-center bg-background px-8 md:px-12">
        <div className="flex flex-col items-center gap-5 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="label">— Loading status</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[calc(100vh-72px)] items-center justify-center bg-background px-8 py-20 md:px-12">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="mx-auto flex max-w-xl flex-col items-start"
        >
          <motion.span variants={fadeUp} className="label text-muted-foreground">
            — We couldn't find that
          </motion.span>
          <motion.h1 variants={fadeUp} className="display-md mt-6 text-foreground">
            Property not found.
          </motion.h1>
          <motion.p
            variants={fadeUp}
            className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground"
          >
            {error || "We couldn't load this listing. The link may have expired or been removed."}
          </motion.p>
          <motion.div variants={fadeUp} className="mt-12">
            <Link
              to="/"
              className="group inline-flex items-center gap-2 text-foreground transition-colors"
            >
              <span className="label">— Return home</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  const currentStage = data.currentStage;
  const isComplete = data.status === "complete";
  const isFailed = data.status === "failed";
  const progressPct = Math.max(
    0,
    Math.min(100, (currentStage / (stages.length - 1)) * 100),
  );

  const primaryVideoUrl = data.horizontalVideoUrl || data.verticalVideoUrl;

  return (
    <div className="min-h-[calc(100vh-72px)] bg-background">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={stagger}
        className="mx-auto max-w-4xl px-8 py-20 md:px-12"
      >
        {/* Header */}
        <motion.div variants={fadeUp}>
          <span className="label text-muted-foreground">— Status</span>
        </motion.div>
        <motion.h1 variants={fadeUp} className="display-md mt-6 text-foreground">
          {data.address}
        </motion.h1>
        <motion.div
          variants={fadeUp}
          className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground"
        >
          <span className="font-mono tabular">
            ID <span className="text-foreground">{data.id.slice(0, 8)}</span>
          </span>
          <span className="text-muted-foreground/40">/</span>
          <span className="font-mono tabular">{relativeTime(data.createdAt)}</span>
          {isComplete && data.processingTimeMs != null && (
            <>
              <span className="text-muted-foreground/40">/</span>
              <span className="font-mono tabular">
                {formatDuration(data.processingTimeMs)} processing
              </span>
            </>
          )}
        </motion.div>

        {/* Failed state */}
        {isFailed && (
          <motion.div
            variants={fadeUp}
            className="mt-16 flex items-start gap-5 border border-destructive/30 bg-destructive/5 p-8"
          >
            <AlertTriangle className="mt-1 h-5 w-5 text-destructive" />
            <div className="flex-1 space-y-3">
              <span className="label text-destructive">— Processing failed</span>
              <h3 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
                We couldn't finish this video.
              </h3>
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                Our team has been notified. You won't be charged for failed
                deliveries — try submitting another listing or reach out to
                support.
              </p>
            </div>
          </motion.div>
        )}

        {/* Stepper */}
        {!isFailed && (
          <motion.div variants={fadeUp} className="mt-20">
            <div className="relative">
              {/* Track */}
              <div className="absolute left-0 right-0 top-[11px] h-[2px] bg-border" />
              <motion.div
                className="absolute left-0 top-[11px] h-[2px] bg-accent"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 1.1, ease: EASE }}
              />

              {/* Nodes */}
              <div className="relative flex items-start justify-between">
                {stages.map((stage, i) => {
                  const done = i < currentStage || (isComplete && i === currentStage);
                  const active = i === currentStage && !isComplete;
                  return (
                    <div
                      key={stage.key}
                      className="relative z-10 flex w-[16%] flex-col items-center"
                    >
                      {done ? (
                        <motion.div
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.6, delay: i * 0.08, ease: EASE }}
                          className="flex h-6 w-6 items-center justify-center border border-accent bg-accent text-accent-foreground"
                        >
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </motion.div>
                      ) : active ? (
                        <motion.div
                          animate={{ scale: [1, 1.12, 1] }}
                          transition={{
                            repeat: Infinity,
                            duration: 2.4,
                            ease: EASE,
                          }}
                          className="flex h-6 w-6 items-center justify-center border border-accent bg-background text-accent"
                        >
                          <Loader2 className="h-3 w-3 animate-spin" />
                        </motion.div>
                      ) : (
                        <div className="flex h-6 w-6 items-center justify-center border border-border bg-background text-muted-foreground/40">
                          <Circle className="h-2 w-2" fill="currentColor" />
                        </div>
                      )}
                      <span
                        className={`mt-5 max-w-[90px] break-words text-center text-[11px] font-medium uppercase leading-tight tracking-[0.15em] ${
                          done || active
                            ? "text-foreground"
                            : "text-muted-foreground/60"
                        }`}
                      >
                        {stage.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {!isComplete && (
              <motion.div
                variants={fadeUp}
                className="mt-12 flex items-center justify-between border-t border-border pt-6 text-xs text-muted-foreground"
              >
                <span className="label">— In progress</span>
                <span className="font-mono tabular">
                  {data.clipsTotal > 0
                    ? `${data.clipsCompleted} / ${data.clipsTotal} clips`
                    : "Processing"}
                </span>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Complete: video preview + downloads */}
        {isComplete && (
          <motion.div variants={fadeUp} className="mt-20 space-y-12">
            {primaryVideoUrl ? (
              <div className="relative overflow-hidden border border-border bg-black">
                <video
                  controls
                  className="h-full w-full"
                  poster={undefined}
                  src={primaryVideoUrl}
                />
              </div>
            ) : (
              <div className="flex aspect-video items-center justify-center border border-border bg-secondary/50">
                <span className="label text-muted-foreground">
                  — Video preview unavailable
                </span>
              </div>
            )}

            <div>
              <span className="label text-muted-foreground">— Downloads</span>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {data.horizontalVideoUrl && (
                  <Button asChild variant="outline" size="lg" className="justify-between">
                    <a href={data.horizontalVideoUrl} download>
                      <span className="flex items-center gap-2">
                        <Download className="h-4 w-4" />
                        Download 16:9
                      </span>
                      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        Horizontal
                      </span>
                    </a>
                  </Button>
                )}
                {data.verticalVideoUrl && (
                  <Button asChild variant="outline" size="lg" className="justify-between">
                    <a href={data.verticalVideoUrl} download>
                      <span className="flex items-center gap-2">
                        <Download className="h-4 w-4" />
                        Download 9:16
                      </span>
                      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        Vertical
                      </span>
                    </a>
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-10 gap-y-4 border-t border-border pt-10">
              <Link
                to="/upload"
                className="group inline-flex items-center gap-2 text-foreground"
              >
                <span className="label">— Submit another listing</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/"
                className="group inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
                <span className="label">Back to home</span>
              </Link>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default Status;
