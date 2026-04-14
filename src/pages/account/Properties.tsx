import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Download, ArrowRight, Loader2, FileVideo } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const statusLabel: Record<string, string> = {
  queued: "Queued",
  ingesting: "Ingesting",
  analyzing: "Analyzing",
  scripting: "Directing",
  generating: "Generating",
  qc: "Quality control",
  assembling: "Assembling",
  complete: "Delivered",
  failed: "Failed",
  needs_review: "Needs review",
};

const statusTone: Record<string, string> = {
  complete: "text-accent",
  failed: "text-destructive",
  needs_review: "text-destructive",
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
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!properties?.length) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: EASE }}
        className="border border-dashed border-border bg-secondary/30 px-12 py-24 text-center"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center border border-border text-muted-foreground">
          <FileVideo className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <h2 className="mt-8 text-2xl font-semibold tracking-[-0.02em]">No listings yet.</h2>
        <p className="mx-auto mt-4 max-w-sm text-sm text-muted-foreground">
          Submit your first listing and your videos will appear here for download and tracking.
        </p>
        <Button asChild className="mt-10">
          <Link to="/upload">
            Create your first listing
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </motion.div>
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-6">
        <div>
          <span className="label text-muted-foreground">— Listings</span>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em]">
            {properties.length} {properties.length === 1 ? "video" : "videos"}
          </h2>
        </div>
        <Button asChild size="sm">
          <Link to="/upload">
            New listing
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Editorial table */}
      <div className="mt-12 border-t border-border">
        <div className="grid grid-cols-[3fr_1.5fr_0.7fr_1fr_1.4fr] gap-6 border-b border-border py-4">
          <span className="label text-muted-foreground">Property</span>
          <span className="label text-muted-foreground">Status</span>
          <span className="label text-right text-muted-foreground">Photos</span>
          <span className="label text-muted-foreground">Submitted</span>
          <span className="label text-right text-muted-foreground">Deliverables</span>
        </div>

        {properties.map((p, i) => {
          const tone = statusTone[p.status] || "text-foreground";
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: i * 0.04, ease: EASE }}
              className="group grid grid-cols-[3fr_1.5fr_0.7fr_1fr_1.4fr] items-center gap-6 border-b border-border py-6 transition-colors duration-500 hover:bg-secondary/40"
            >
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold tracking-[-0.01em]">{p.address}</h3>
                <p className="tabular mt-1 text-xs text-muted-foreground">
                  {p.bedrooms}bd · {p.bathrooms}ba · ${p.price?.toLocaleString()}
                </p>
              </div>
              <span className={`label ${tone}`}>{statusLabel[p.status] || p.status}</span>
              <span className="tabular text-right text-sm text-muted-foreground">{p.photo_count}</span>
              <span className="tabular text-xs text-muted-foreground">
                {new Date(p.created_at).toLocaleDateString()}
              </span>
              <div className="flex items-center justify-end gap-2">
                {p.status === "complete" ? (
                  <>
                    {p.horizontal_video_url && (
                      <Button asChild size="sm" variant="outline">
                        <a href={p.horizontal_video_url} target="_blank" rel="noopener noreferrer">
                          <Download className="h-3.5 w-3.5" /> 16:9
                        </a>
                      </Button>
                    )}
                    {p.vertical_video_url && (
                      <Button asChild size="sm" variant="outline">
                        <a href={p.vertical_video_url} target="_blank" rel="noopener noreferrer">
                          <Download className="h-3.5 w-3.5" /> 9:16
                        </a>
                      </Button>
                    )}
                  </>
                ) : (
                  <Button asChild size="sm" variant="ghost">
                    <Link to={`/status/${p.id}`}>
                      Track
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
