import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle2, Circle, Download, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { fetchPropertyStatus } from "@/lib/api";

const stages = [
  { key: "uploaded", label: "Uploaded" },
  { key: "analyzing", label: "Analyzing Photos" },
  { key: "scripting", label: "Planning Shots" },
  { key: "generating", label: "Generating Video" },
  { key: "qc", label: "Quality Check" },
  { key: "complete", label: "Complete" },
];

const Status = () => {
  const { id } = useParams();
  const [data, setData] = useState<{
    id: string; address: string; status: string; currentStage: number; totalStages: number;
    clipsCompleted: number; clipsTotal: number; horizontalVideoUrl: string | null;
    verticalVideoUrl: string | null; createdAt: string; processingTimeMs: number | null;
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
    return () => { cancelled = true; clearTimeout(timer); };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <nav className="border-b border-border px-6 py-4">
          <Link to="/" className="text-xl font-bold tracking-tight">
            <span className="font-display text-gradient-gold">Key</span>
            <span className="font-display text-foreground ml-1">Frame</span>
          </Link>
        </nav>
        <div className="flex-1 flex items-center justify-center p-6">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <nav className="border-b border-border px-6 py-4">
          <Link to="/" className="text-xl font-bold tracking-tight">
            <span className="font-display text-gradient-gold">Key</span>
            <span className="font-display text-foreground ml-1">Frame</span>
          </Link>
        </nav>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-sm text-destructive">{error || "Property not found"}</p>
          </div>
        </div>
      </div>
    );
  }

  const currentStage = data.currentStage;
  const isComplete = data.status === "complete";
  const isFailed = data.status === "failed";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border px-6 py-4">
        <Link to="/" className="text-xl font-bold tracking-tight">
          <span className="font-display text-gradient-gold">Key</span>
          <span className="font-display text-foreground ml-1">Frame</span>
        </Link>
      </nav>
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full">
          <CardContent className="pt-8 pb-8 space-y-8">
            <div className="text-center space-y-2">
              <h1 className="text-xl font-bold">{data.address}</h1>
              <p className="text-sm text-muted-foreground font-mono">
                ID: {data.id}
              </p>
            </div>

            {isFailed && (
              <div className="text-center p-4 border border-destructive/30 bg-destructive/5 rounded-lg">
                <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
                <p className="text-sm text-destructive font-medium">Processing failed</p>
              </div>
            )}

            {/* Stepper */}
            {!isFailed && (
              <div className="relative">
                <div className="flex items-center justify-between relative">
                  {/* Line behind */}
                  <div className="absolute top-4 left-0 right-0 h-0.5 bg-border" />
                  <div
                    className="absolute top-4 left-0 h-0.5 bg-primary transition-all duration-700"
                    style={{ width: `${Math.max(0, (currentStage / (stages.length - 1)) * 100)}%` }}
                  />
                  {stages.map((stage, i) => (
                    <div key={stage.key} className="relative flex flex-col items-center z-10">
                      {i < currentStage ? (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.1 }}>
                          <CheckCircle2 className="h-8 w-8 text-primary" />
                        </motion.div>
                      ) : i === currentStage && !isComplete ? (
                        <motion.div
                          animate={{ scale: [1, 1.15, 1] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                          className="h-8 w-8 rounded-full bg-info flex items-center justify-center"
                        >
                          <Loader2 className="h-4 w-4 text-info-foreground animate-spin" />
                        </motion.div>
                      ) : i === currentStage && isComplete ? (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                          <CheckCircle2 className="h-8 w-8 text-primary" />
                        </motion.div>
                      ) : (
                        <Circle className="h-8 w-8 text-muted-foreground/30" />
                      )}
                      <span className={`text-xs mt-2 text-center max-w-[80px] ${
                        i <= currentStage ? "text-foreground font-medium" : "text-muted-foreground"
                      }`}>
                        {stage.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isComplete && !isFailed && (
              <div className="text-center space-y-1">
                <p className="text-sm text-muted-foreground">
                  {data.clipsTotal > 0
                    ? `${data.clipsCompleted}/${data.clipsTotal} clips generated`
                    : "Processing..."}
                </p>
              </div>
            )}

            {isComplete && (
              <div className="space-y-4">
                <div className="aspect-video bg-muted rounded-lg flex items-center justify-center border border-border">
                  <div className="text-center space-y-2">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                      <span className="text-primary text-xl">▶</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Video Preview</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {data.horizontalVideoUrl && (
                    <Button variant="outline" className="gap-2" asChild>
                      <a href={data.horizontalVideoUrl} download>
                        <Download className="h-4 w-4" /> Download 16:9
                      </a>
                    </Button>
                  )}
                  {data.verticalVideoUrl && (
                    <Button variant="outline" className="gap-2" asChild>
                      <a href={data.verticalVideoUrl} download>
                        <Download className="h-4 w-4" /> Download 9:16
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Status;
