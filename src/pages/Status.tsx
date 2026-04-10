import { useParams, Link } from "react-router-dom";
import { CheckCircle2, Circle, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { allProperties } from "@/lib/mock-data";

const stages = [
  { key: "uploaded", label: "Uploaded" },
  { key: "analyzing", label: "Analyzing Photos" },
  { key: "scripting", label: "Planning Shots" },
  { key: "generating", label: "Generating Video" },
  { key: "qc", label: "Quality Check" },
  { key: "complete", label: "Complete" },
];

const statusToStage: Record<string, number> = {
  queued: 0,
  analyzing: 1,
  scripting: 2,
  generating: 3,
  qc: 4,
  assembling: 4,
  complete: 5,
  failed: -1,
  needs_review: 4,
};

const Status = () => {
  const { id } = useParams();
  // Try finding by ID or just show the first complete property for demo
  const property = allProperties.find(p => p.id === id) || allProperties.find(p => p.status === "complete") || allProperties[0];
  const currentStage = statusToStage[property.status] ?? 0;
  const isComplete = property.status === "complete";

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
              <h1 className="text-xl font-bold">{property.address}</h1>
              <p className="text-sm text-muted-foreground font-mono">
                {property.bedrooms} bed • {property.bathrooms} bath • ${property.price.toLocaleString()}
              </p>
            </div>

            {/* Stepper */}
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

            {!isComplete && (
              <div className="text-center space-y-1">
                <p className="text-sm text-muted-foreground">Estimated time remaining</p>
                <p className="font-mono text-lg font-semibold">~2 minutes</p>
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
                  <Button variant="outline" className="gap-2">
                    <Download className="h-4 w-4" /> Download 16:9
                  </Button>
                  <Button variant="outline" className="gap-2">
                    <Download className="h-4 w-4" /> Download 9:16
                  </Button>
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
