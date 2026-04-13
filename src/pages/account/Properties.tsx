import { useQuery } from "@tanstack/react-query";
import { motion, type Variants } from "framer-motion";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { ArrowRight, Download, Loader2 } from "lucide-react";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 1.0, delay: i * 0.06, ease: EASE },
  }),
};

const stagger: Variants = {
  visible: { transition: { staggerChildren: 0.08 } },
};

type StatusKey =
  | "queued"
  | "analyzing"
  | "scripting"
  | "generating"
  | "qc"
  | "assembling"
  | "complete"
  | "failed"
  | "needs_review";

const statusConfig: Record<StatusKey, { label: string; tone: string }> = {
  queued: { label: "Queued", tone: "bg-muted-foreground" },
  analyzing: { label: "Analyzing", tone: "bg-accent" },
  scripting: { label: "Scripting", tone: "bg-accent" },
  generating: { label: "Generating", tone: "bg-accent" },
  qc: { label: "Quality check", tone: "bg-accent" },
  assembling: { label: "Assembling", tone: "bg-accent" },
  complete: { label: "Complete", tone: "bg-foreground" },
  failed: { label: "Failed", tone: "bg-destructive" },
  needs_review: { label: "Needs review", tone: "bg-destructive" },
};

export default function AccountProperties() {
  const { user } = useAuth();

  const { data: properties, isLoading } = useQuery({
    queryKey: ["account-properties", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("submitted_by", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-32">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="label text-muted-foreground">Loading…</span>
      </div>
    );
  }

  if (!properties?.length) {
    return (
      <motion.div
        initial="hidden"
        animate="visible"
        variants={stagger}
        className="flex flex-col items-start gap-8 py-24"
      >
        <motion.span variants={fadeUp} className="label text-muted-foreground">
          — Nothing yet.
        </motion.span>
        <motion.h1 variants={fadeUp} className="display-md font-display max-w-2xl">
          Submit your first listing.
        </motion.h1>
        <motion.div variants={fadeUp}>
          <Button asChild variant="outline" size="lg">
            <Link to="/upload">
              Begin a project
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="space-y-16"
    >
      {/* Title block */}
      <motion.div
        variants={fadeUp}
        className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between"
      >
        <div>
          <span className="label text-muted-foreground">— Your work</span>
          <h1 className="display-md font-display mt-5 text-foreground">Properties.</h1>
        </div>
        <Button asChild size="lg">
          <Link to="/upload">
            New project
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </motion.div>

      {/* Editorial table — flat border-y, hairline rows */}
      <motion.div variants={fadeUp} className="border-y border-border">
        {/* Header row */}
        <div className="hidden border-b border-border md:grid md:grid-cols-[2fr_1fr_0.6fr_0.8fr_1.4fr] md:gap-6 md:px-6 md:py-5">
          <span className="label text-muted-foreground">Address</span>
          <span className="label text-muted-foreground">Status</span>
          <span className="label text-muted-foreground">Photos</span>
          <span className="label text-muted-foreground">Submitted</span>
          <span className="label text-right text-muted-foreground">Deliverables</span>
        </div>

        {properties.map((property, i) => {
          const status =
            statusConfig[(property.status as StatusKey) ?? "queued"] ??
            statusConfig.queued;
          return (
            <motion.div
              key={property.id}
              variants={fadeUp}
              custom={i}
              className="group relative border-b border-border last:border-b-0 transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-foreground/[0.02]"
            >
              <Link
                to={`/status/${property.id}`}
                className="absolute inset-0 z-0"
                aria-label={`Open ${property.address}`}
              />
              <div className="relative z-10 grid grid-cols-1 gap-3 px-6 py-6 md:grid-cols-[2fr_1fr_0.6fr_0.8fr_1.4fr] md:items-center md:gap-6">
                {/* Address */}
                <div>
                  <p className="font-display text-base font-semibold tracking-[-0.01em] text-foreground transition-colors group-hover:text-accent">
                    {property.address}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {property.bedrooms}bd / {property.bathrooms}ba ·{" "}
                    ${property.price?.toLocaleString()}
                  </p>
                </div>

                {/* Status pill */}
                <div>
                  <span className="inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.15em] text-foreground">
                    <span className={`h-1.5 w-1.5 ${status.tone}`} aria-hidden />
                    {status.label}
                  </span>
                </div>

                {/* Photos */}
                <div className="font-mono text-[11px] text-muted-foreground">
                  {property.photo_count}
                </div>

                {/* Date */}
                <div className="font-mono text-[11px] text-muted-foreground">
                  {new Date(property.created_at).toLocaleDateString()}
                </div>

                {/* Deliverables */}
                <div className="relative z-20 flex items-center justify-start gap-5 md:justify-end">
                  {property.status === "complete" ? (
                    <>
                      {property.horizontal_video_url && (
                        <a
                          href={property.horizontal_video_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group/btn inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-accent"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download className="h-3 w-3" />
                          Landscape
                        </a>
                      )}
                      {property.vertical_video_url && (
                        <a
                          href={property.vertical_video_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-accent"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download className="h-3 w-3" />
                          Portrait
                        </a>
                      )}
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground transition-colors group-hover:text-accent">
                      Track →
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
