import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Preset, getPresets, deletePreset } from "@/lib/presets";
import { Trash2, Play, BookmarkCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const packageLabels: Record<string, string> = {
  just_listed: "🏠 Just Listed",
  just_pended: "🔥 Just Pended",
  just_closed: "🎉 Just Closed",
  life_cycle: "✨ Life Cycle",
};

const Presets = () => {
  const [presets, setPresets] = useState<Preset[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    getPresets().then(setPresets);
  }, []);

  const handleDelete = async (id: string) => {
    await deletePreset(id);
    setPresets(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border px-6 py-4 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold tracking-tight">
          <span className="font-display text-gradient-gold">Key</span>
          <span className="font-display text-foreground ml-1">Frame</span>
        </Link>
        <Button variant="outline" size="sm" onClick={() => navigate("/upload")}>
          New Order
        </Button>
      </nav>
      <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Saved Presets</h1>
          <p className="text-sm text-muted-foreground mt-1">Apply a preset when creating a new order to auto-fill your settings.</p>
        </div>

        {presets.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <BookmarkCheck className="h-12 w-12 text-muted-foreground mx-auto" />
              <div>
                <h3 className="font-semibold">No presets yet</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Save a preset from the upload form to quickly reuse your favorite settings.
                </p>
              </div>
              <Button variant="outline" onClick={() => navigate("/upload")}>
                Go to Upload
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            <AnimatePresence>
              {presets.map(preset => (
                <motion.div
                  key={preset.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  layout
                >
                  <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{preset.name}</h3>
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          {preset.selectedPackage && (
                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                              {packageLabels[preset.selectedPackage] || preset.selectedPackage}
                            </span>
                          )}
                          {preset.selectedDuration && (
                            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                              {preset.selectedDuration}
                            </span>
                          )}
                          {preset.selectedOrientation && (
                            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                              {preset.selectedOrientation === "vertical" ? "Vertical" : preset.selectedOrientation === "horizontal" ? "Horizontal" : "Both"}
                            </span>
                          )}
                          {preset.addVoiceover && (
                            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">AI Voiceover</span>
                          )}
                          {preset.addVoiceClone && (
                            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Voice Clone</span>
                          )}
                          {preset.addCustomRequest && (
                            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Custom Request</span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Created {new Date(preset.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => navigate(`/upload?preset=${preset.id}`)}
                        >
                          <Play className="h-3.5 w-3.5 mr-1" />
                          Use
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(preset.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};

export default Presets;
