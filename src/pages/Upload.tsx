import { useState, useCallback, useRef, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, CheckCircle2, Loader2, Check, Mic, Bookmark, BookmarkCheck, RotateCcw, ArrowRight, Camera, Sparkles, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getPresets, savePreset, Preset } from "@/lib/presets";
import { createProperty } from "@/lib/api";

interface UploadedFile {
  file: File;
  preview: string;
  id: string;
}

// Photos are uploaded directly to Supabase Storage (no base64 conversion needed)

const Upload = () => {
  const [address, setAddress] = useState("");
  const [price, setPrice] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [agent, setAgent] = useState("");
  const [daysOnMarket, setDaysOnMarket] = useState("");
  const [soldPrice, setSoldPrice] = useState("");
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<string | null>(null);
  const [selectedOrientation, setSelectedOrientation] = useState<string | null>(null);
  const [addVoiceover, setAddVoiceover] = useState(false);
  const [addCustomRequest, setAddCustomRequest] = useState(false);
  const [customRequestText, setCustomRequestText] = useState("");
  const [addVoiceClone, setAddVoiceClone] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [trackingId, setTrackingId] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetSaved, setPresetSaved] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const applyPreset = (preset: Preset) => {
    setSelectedPackage(preset.selectedPackage);
    setSelectedDuration(preset.selectedDuration);
    setSelectedOrientation(preset.selectedOrientation);
    setAddVoiceover(preset.addVoiceover);
    setAddVoiceClone(preset.addVoiceClone);
    setAddCustomRequest(preset.addCustomRequest);
    setCustomRequestText(preset.customRequestText);
  };

  useEffect(() => {
    const presetId = searchParams.get("preset");
    if (presetId) {
      const presets = getPresets();
      const preset = presets.find(p => p.id === presetId);
      if (preset) applyPreset(preset);
    }
  }, [searchParams]);

  const handleUseLastPreset = () => {
    const presets = getPresets();
    if (presets.length > 0) applyPreset(presets[presets.length - 1]);
  };

  const hasPresets = getPresets().length > 0;

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    savePreset({
      name: presetName.trim(),
      selectedPackage,
      selectedDuration,
      selectedOrientation,
      addVoiceover,
      addVoiceClone,
      addCustomRequest,
      customRequestText,
    });
    setPresetSaved(true);
    setTimeout(() => { setShowSavePreset(false); setPresetName(""); setPresetSaved(false); }, 1200);
  };

  const packages = [
    { id: "just_listed", name: "Just Listed", icon: "🏠", desc: "New listing showcase" },
    { id: "just_pended", name: "Just Pended", icon: "🔥", desc: "Under contract" },
    { id: "just_closed", name: "Just Closed", icon: "🎉", desc: "Successful close" },
    { id: "life_cycle", name: "Life Cycle", icon: "✨", desc: "All 3 videos", badge: "Best Value" },
  ];

  const durations = [
    { id: "15s", label: "15s", price: 75, lifeCyclePrice: 90 },
    { id: "30s", label: "30s", price: 125, lifeCyclePrice: 140 },
    { id: "60s", label: "60s", price: 175, lifeCyclePrice: 190 },
  ];

  const orientations = [
    { id: "vertical", label: "Vertical", ratio: "9:16", extra: 0 },
    { id: "horizontal", label: "Horizontal", ratio: "16:9", extra: 0 },
    { id: "both", label: "Both", ratio: "9:16 + 16:9", extra: 10 },
  ];

  const selectedDur = durations.find(d => d.id === selectedDuration);
  const isLifeCycle = selectedPackage === "life_cycle";
  const basePrice = selectedDur ? (isLifeCycle ? selectedDur.lifeCyclePrice : selectedDur.price) : 0;
  const orientationExtra = isLifeCycle ? 0 : (orientations.find(o => o.id === selectedOrientation)?.extra || 0);
  const voiceoverExtra = addVoiceover ? 15 : 0;
  const customExtra = addCustomRequest ? 15 : 0;
  const voiceCloneExtra = addVoiceClone ? 15 : 0;
  const totalPrice = basePrice + orientationExtra + voiceoverExtra + customExtra + voiceCloneExtra;

  const needsDaysOnMarket = selectedPackage === "just_pended" || selectedPackage === "just_closed";
  const needsSoldPrice = selectedPackage === "just_closed";
  const isValid = address && price && bedrooms && bathrooms && agent && selectedPackage && selectedDuration && selectedOrientation && files.length >= 10
    && (!needsDaysOnMarket || daysOnMarket)
    && (!needsSoldPrice || soldPrice);

  const handleFiles = useCallback((newFiles: FileList | File[]) => {
    const accepted = Array.from(newFiles).filter(f => /\.(jpg|jpeg|png|heic|webp)$/i.test(f.name));
    const remaining = 60 - files.length;
    const toAdd = accepted.slice(0, remaining);
    const mapped = toAdd.map(f => ({ file: f, preview: URL.createObjectURL(f), id: crypto.randomUUID() }));
    setFiles(prev => [...prev, ...mapped]);
  }, [files.length]);

  const removeFile = (id: string) => {
    setFiles(prev => {
      const removed = prev.find(f => f.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return prev.filter(f => f.id !== id);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await createProperty({
        address,
        price: Number(price),
        bedrooms: Number(bedrooms),
        bathrooms: Number(bathrooms),
        listing_agent: agent,
        brokerage: "",
        photos: files.map(f => f.file),
      });
      setTrackingId(result.id);
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to submit property");
    } finally {
      setSubmitting(false);
    }
  };

  const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);
  const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  // Success state
  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <nav className="border-b border-border px-8 md:px-16 py-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-1.5">
            <span className="font-display text-xl font-semibold tracking-wide text-foreground">KEY</span>
            <div className="h-5 w-px bg-foreground/30 mx-1" />
            <span className="font-display text-xl font-semibold tracking-wide text-foreground">FRAME</span>
          </Link>
        </nav>
        <div className="flex-1 flex items-center justify-center p-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full text-center space-y-8">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring", stiffness: 200 }}>
              <div className="h-20 w-20 rounded-full bg-accent/10 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-10 w-10 text-accent" />
              </div>
            </motion.div>
            <div>
              <h2 className="font-display text-3xl font-semibold text-foreground">Video in Production</h2>
              <p className="text-muted-foreground mt-2 text-sm">{files.length} photos submitted • Est. 72 hour delivery</p>
            </div>
            <div className="border border-border p-5 space-y-3 text-left">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tracking ID</span>
                <span className="font-mono font-semibold text-accent">{trackingId}</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-mono font-semibold">${totalPrice}</span>
              </div>
            </div>
            <Button variant="outline" className="w-full rounded-none h-11 tracking-[0.15em] uppercase text-[11px]" onClick={() => navigate(`/status/${trackingId}`)}>
              Track Your Order <ArrowRight className="ml-2 h-3.5 w-3.5" />
            </Button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Clean nav */}
      <nav className="border-b border-border px-8 md:px-16 py-5 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-1.5">
            <span className="font-display text-xl font-semibold tracking-wide text-foreground">KEY</span>
            <div className="h-5 w-px bg-foreground/30 mx-1" />
            <span className="font-display text-xl font-semibold tracking-wide text-foreground">FRAME</span>
          </Link>
          <div className="h-4 w-px bg-border" />
          <span className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-medium">New Video</span>
        </div>
        <div className="flex items-center gap-3">
          {hasPresets && (
            <Button variant="ghost" size="sm" onClick={handleUseLastPreset} className="text-muted-foreground hover:text-foreground tracking-[0.1em] uppercase text-[10px]">
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Last Preset
            </Button>
          )}
          <Link to="/presets" className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 font-medium">
            <BookmarkCheck className="h-3.5 w-3.5" /> Presets
          </Link>
        </div>
      </nav>

      <div className="flex-1 py-8 md:py-12 px-6">
        <form onSubmit={handleSubmit} className="max-w-xl mx-auto space-y-8">

          {/* Package selection — 2x2 grid */}
          <section>
            <Label className="text-[11px] tracking-[0.15em] uppercase font-medium text-muted-foreground mb-3 block">Video Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {packages.map(pkg => (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => setSelectedPackage(pkg.id)}
                  className={`relative border p-4 text-left transition-all flex items-center gap-3 ${
                    selectedPackage === pkg.id
                      ? "border-foreground bg-foreground/[0.03]"
                      : "border-border hover:border-foreground/30"
                  }`}
                >
                  {pkg.badge && (
                    <span className="absolute -top-2 right-3 bg-foreground text-background text-[8px] tracking-[0.1em] uppercase font-semibold px-2 py-px">
                      {pkg.badge}
                    </span>
                  )}
                  <span className="text-xl">{pkg.icon}</span>
                  <div>
                    <div className="text-sm font-semibold">{pkg.name}</div>
                    <div className="text-[11px] text-muted-foreground">{pkg.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Duration + Format — side by side, equal weight */}
          <section className="grid grid-cols-2 gap-6">
            <div>
              <Label className="text-[11px] tracking-[0.15em] uppercase font-medium text-muted-foreground mb-3 block">Duration</Label>
              <div className="space-y-2">
                {durations.map(dur => (
                  <button
                    key={dur.id}
                    type="button"
                    onClick={() => setSelectedDuration(dur.id)}
                    className={`w-full border p-3 text-left transition-all flex items-center justify-between ${
                      selectedDuration === dur.id ? "border-foreground bg-foreground/[0.03]" : "border-border hover:border-foreground/30"
                    }`}
                  >
                    <span className="font-mono text-sm font-bold">{dur.label}</span>
                    <div className="text-right">
                      <span className="font-mono text-sm font-semibold">${isLifeCycle ? dur.lifeCyclePrice : dur.price}</span>
                      {isLifeCycle && (
                        <div className="flex items-center gap-1 justify-end">
                          <span className="text-[9px] line-through text-muted-foreground">${dur.lifeCyclePrice + 25}</span>
                          <span className="text-[9px] bg-accent/20 text-accent px-1 py-px font-semibold">SAVE $25</span>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-[11px] tracking-[0.15em] uppercase font-medium text-muted-foreground mb-3 block">Format</Label>
              <div className="space-y-2">
                {orientations.map(ori => (
                  <button
                    key={ori.id}
                    type="button"
                    onClick={() => setSelectedOrientation(ori.id)}
                    className={`w-full border p-3 text-left transition-all flex items-center justify-between ${
                      selectedOrientation === ori.id ? "border-foreground bg-foreground/[0.03]" : "border-border hover:border-foreground/30"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-end">
                        {ori.id === "vertical" && <div className="w-3 h-5 border-2 border-current rounded-[1px]" />}
                        {ori.id === "horizontal" && <div className="w-6 h-3.5 border-2 border-current rounded-[1px]" />}
                        {ori.id === "both" && <div className="flex items-end gap-0.5"><div className="w-2.5 h-4 border-2 border-current rounded-[1px]" /><div className="w-5 h-3 border-2 border-current rounded-[1px]" /></div>}
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{ori.label}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{ori.ratio}</div>
                      </div>
                    </div>
                    {ori.extra > 0 && !isLifeCycle && (
                      <span className="font-mono text-xs text-foreground">+${ori.extra}</span>
                    )}
                    {ori.extra > 0 && isLifeCycle && (
                      <div className="font-mono text-[10px]">
                        <span className="line-through text-muted-foreground mr-0.5">+${ori.extra}</span>
                        <span className="text-accent font-semibold">FREE</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section>
            <Label className="text-[11px] tracking-[0.15em] uppercase font-medium text-muted-foreground mb-3 block">Add-ons</Label>
            <div className="space-y-2">
              {[
                { active: addVoiceover, toggle: () => { setAddVoiceover(!addVoiceover); if (!addVoiceover) setAddVoiceClone(false); }, icon: <Mic className="h-4 w-4" />, label: "AI Voiceover", desc: "Professional narration", price: "+$15" },
                { active: addVoiceClone, toggle: () => { setAddVoiceClone(!addVoiceClone); if (!addVoiceClone) setAddVoiceover(false); }, icon: <span className="text-sm">🎙️</span>, label: "Voice Clone", desc: "Use your own voice", price: "+$15" },
                { active: addCustomRequest, toggle: () => setAddCustomRequest(!addCustomRequest), icon: <Sparkles className="h-4 w-4" />, label: "Custom Request", desc: "Special instructions", price: "+$15" },
              ].map(addon => (
                <button
                  key={addon.label}
                  type="button"
                  onClick={addon.toggle}
                  className={`w-full border p-3 text-left transition-all flex items-center gap-3 ${
                    addon.active ? "border-foreground bg-foreground/[0.03]" : "border-border hover:border-foreground/30"
                  }`}
                >
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-all ${addon.active ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
                    {addon.icon}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{addon.label}</div>
                    <div className="text-[11px] text-muted-foreground">{addon.desc}</div>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{addon.price}</span>
                </button>
              ))}
            </div>
            <AnimatePresence>
              {addCustomRequest && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <textarea
                    value={customRequestText}
                    onChange={e => setCustomRequestText(e.target.value)}
                    placeholder="Describe your custom request..."
                    className="w-full mt-2 min-h-[80px] bg-background border border-border p-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground resize-y"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Property Details */}
          <section>
            <Label className="text-[11px] tracking-[0.15em] uppercase font-medium text-muted-foreground mb-3 block">Property Details</Label>
            <div className="space-y-3">
              <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Property address *" className="rounded-none h-11" />
              <div className="grid grid-cols-3 gap-3">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">$</span>
                  <Input type="number" className="pl-7 font-mono rounded-none h-11" value={price} onChange={e => setPrice(e.target.value)} placeholder="Price *" />
                </div>
                <Input type="number" min={0} value={bedrooms} onChange={e => setBedrooms(e.target.value)} placeholder="Beds *" className="rounded-none h-11" />
                <Input type="number" min={0} step={0.5} value={bathrooms} onChange={e => setBathrooms(e.target.value)} placeholder="Baths *" className="rounded-none h-11" />
              </div>
              <Input value={agent} onChange={e => setAgent(e.target.value)} placeholder="Listing agent *" className="rounded-none h-11" />
              {needsDaysOnMarket && (
                <div className="grid grid-cols-2 gap-3">
                  <Input type="number" min={0} value={daysOnMarket} onChange={e => setDaysOnMarket(e.target.value)} placeholder="Days on market *" className="rounded-none h-11" />
                  {needsSoldPrice && (
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">$</span>
                      <Input type="number" className="pl-7 font-mono rounded-none h-11" value={soldPrice} onChange={e => setSoldPrice(e.target.value)} placeholder="Sold price *" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Photos */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-[11px] tracking-[0.15em] uppercase font-medium text-muted-foreground">Photos</Label>
              {files.length > 0 && (
                <span className="text-[11px] text-muted-foreground font-mono">{files.length}/60 • {formatSize(totalSize)}</span>
              )}
            </div>

            <div
              className={`border-2 border-dashed rounded-none p-10 text-center cursor-pointer transition-all ${
                isDragging ? "border-foreground bg-foreground/[0.03]" : "border-border hover:border-foreground/30"
              }`}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" multiple accept=".jpg,.jpeg,.png,.heic,.webp" className="hidden" onChange={e => e.target.files && handleFiles(e.target.files)} />
              <Camera className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">Drop photos here or click to browse</p>
              <p className="text-[11px] text-muted-foreground mt-1">JPG, PNG, HEIC, WebP • 10–60 photos required</p>
            </div>

            {files.length > 0 && (
              <div className="mt-4 space-y-3">
                {files.length < 10 && (
                  <div className="flex items-center gap-2">
                    <div className="h-1 flex-1 bg-muted rounded-full overflow-hidden">
                      <motion.div className="h-full bg-foreground" animate={{ width: `${(files.length / 10) * 100}%` }} />
                    </div>
                    <span className="text-[11px] text-accent font-mono font-medium">{10 - files.length} more</span>
                  </div>
                )}
                <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5 max-h-48 overflow-y-auto">
                  <AnimatePresence>
                    {files.map(f => (
                      <motion.div
                        key={f.id}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="relative group aspect-square overflow-hidden bg-muted"
                      >
                        <img src={f.preview} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); removeFile(f.id); }}
                          className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3 text-white" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </section>

          {/* Order Summary + Submit */}
          <section className="border border-border p-6 space-y-3">
            <h3 className="text-[11px] tracking-[0.25em] uppercase text-muted-foreground font-medium mb-3">Order Summary</h3>
            {selectedPackage && selectedDur && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {packages.find(p => p.id === selectedPackage)?.name} — {selectedDur.label}
                  {isLifeCycle && " (3 videos)"}
                </span>
                <span className="font-mono font-medium">${basePrice}</span>
              </div>
            )}
            {isLifeCycle && selectedOrientation === "both" && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Both Formats</span>
                <span className="font-mono text-accent font-medium">FREE</span>
              </div>
            )}
            {orientationExtra > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Both Formats</span>
                <span className="font-mono font-medium">+${orientationExtra}</span>
              </div>
            )}
            {addVoiceover && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">AI Voiceover</span>
                <span className="font-mono font-medium">+$15</span>
              </div>
            )}
            {addVoiceClone && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Voice Clone</span>
                <span className="font-mono font-medium">+$15</span>
              </div>
            )}
            {addCustomRequest && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Custom Request</span>
                <span className="font-mono font-medium">+$15</span>
              </div>
            )}
            {totalPrice > 0 && (
              <>
                <div className="h-px bg-border" />
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-semibold">Total</span>
                  <span className="font-mono text-xl font-bold">${totalPrice}</span>
                </div>
              </>
            )}
            {submitError && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded">
                {submitError}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="h-12 px-5 rounded-none tracking-[0.1em] uppercase text-[11px]"
                onClick={() => setShowSavePreset(true)}
                disabled={!selectedPackage}
              >
                <Bookmark className="h-4 w-4 mr-1.5" /> Save
              </Button>
              <Button type="submit" className="flex-1 h-12 text-sm rounded-none tracking-[0.15em] uppercase font-medium" disabled={!isValid || submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {submitting ? "Processing..." : "Generate Video"}
                {!submitting && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </div>
          </section>
        </form>
      </div>

      {/* Save Preset Dialog */}
      <Dialog open={showSavePreset} onOpenChange={setShowSavePreset}>
        <DialogContent className="max-w-sm rounded-none">
          <DialogHeader>
            <DialogTitle className="font-display">{presetSaved ? "Saved!" : "Save Preset"}</DialogTitle>
          </DialogHeader>
          {presetSaved ? (
            <div className="flex flex-col items-center py-4 gap-2">
              <CheckCircle2 className="h-10 w-10 text-accent" />
            </div>
          ) : (
            <>
              <Input value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="Preset name" autoFocus onKeyDown={e => e.key === "Enter" && handleSavePreset()} className="rounded-none" />
              <DialogFooter>
                <Button onClick={handleSavePreset} disabled={!presetName.trim()} className="rounded-none tracking-[0.1em] uppercase text-[11px]">Save</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Upload;
