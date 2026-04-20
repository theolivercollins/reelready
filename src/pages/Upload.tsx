import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, X } from "lucide-react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getPresets, savePreset, type Preset } from "@/lib/presets";
import { createProperty } from "@/lib/api";
import { LEIcon, LELogoMark } from "@/components/le";

interface UploadedFile {
  file: File;
  preview: string;
  id: string;
}

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const stepFade: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
  exit: { opacity: 0, y: -24, transition: { duration: 0.4, ease: EASE } },
};

const STEPS = ["Style", "Add-ons", "Property", "Photos"] as const;
type StepId = 0 | 1 | 2 | 3;

const PACKAGES = [
  { id: "just_listed", name: "Just Listed", desc: "New to market" },
  { id: "just_pended", name: "Just Pended", desc: "Under contract" },
  { id: "just_closed", name: "Just Closed", desc: "Successful close" },
  { id: "life_cycle", name: "Life Cycle", desc: "Three-video series", badge: "Best value" },
];

const DURATIONS = [
  { id: "15s", label: "15", price: 75, lifeCyclePrice: 90 },
  { id: "30s", label: "30", price: 125, lifeCyclePrice: 140 },
  { id: "60s", label: "60", price: 175, lifeCyclePrice: 190 },
];

const ORIENTATIONS = [
  { id: "vertical", label: "Vertical", dim: "9 : 16", sub: "Reels, TikTok, Shorts", extra: 0 },
  { id: "horizontal", label: "Horizontal", dim: "16 : 9", sub: "YouTube, web, email", extra: 0 },
  { id: "both", label: "Both", dim: "16:9 + 9:16", sub: "Cross-platform delivery", extra: 10 },
];

const sectionStyle: React.CSSProperties = {};
const eyebrow: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: "var(--le-text-faint)",
  fontFamily: "var(--le-font-mono)",
  fontWeight: 500,
};

function SectionHeader({
  n,
  title,
  aside,
}: {
  n: string;
  title: string;
  aside?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
        <span style={{ ...eyebrow, fontSize: 11 }}>{n}</span>
        <h2
          style={{
            fontSize: 22,
            margin: 0,
            fontWeight: 500,
            letterSpacing: "-0.015em",
            color: "var(--le-text)",
            fontFamily: "var(--le-font-sans)",
          }}
        >
          {title}
        </h2>
      </div>
      {aside}
    </div>
  );
}

function SelectTile({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        cursor: "pointer",
        textAlign: "left",
        padding: "22px 22px 24px",
        background: active ? "var(--le-bg-sunken)" : "var(--le-bg)",
        border: `1px solid ${active ? "var(--le-text)" : "var(--le-border-strong)"}`,
        color: "var(--le-text)",
        fontFamily: "var(--le-font-sans)",
        transition: "all 0.18s ease",
        width: "100%",
      }}
    >
      {children}
    </button>
  );
}

const Upload = () => {
  // ─── form state ───
  const [step, setStep] = useState<StepId>(0);
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
  const [addVoiceClone, setAddVoiceClone] = useState(false);
  const [addCustomRequest, setAddCustomRequest] = useState(false);
  const [customRequestText, setCustomRequestText] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);

  // ─── flow state ───
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [trackingId, setTrackingId] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ uploaded: number; total: number } | null>(null);

  // ─── presets ───
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetSaved, setPresetSaved] = useState(false);
  const [hasPresets, setHasPresets] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
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
      getPresets().then((presets) => {
        const preset = presets.find((p) => p.id === presetId);
        if (preset) applyPreset(preset);
      });
    }
    getPresets().then((presets) => setHasPresets(presets.length > 0));
  }, [searchParams]);

  const handleUseLastPreset = async () => {
    const presets = await getPresets();
    if (presets.length > 0) applyPreset(presets[presets.length - 1]);
  };

  const handleSavePreset = async () => {
    if (!presetName.trim()) return;
    await savePreset({
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
    setTimeout(() => {
      setShowSavePreset(false);
      setPresetName("");
      setPresetSaved(false);
    }, 1200);
  };

  const selectedDur = DURATIONS.find((d) => d.id === selectedDuration);
  const isLifeCycle = selectedPackage === "life_cycle";
  const basePrice = selectedDur ? (isLifeCycle ? selectedDur.lifeCyclePrice : selectedDur.price) : 0;
  const orientationExtra = isLifeCycle ? 0 : ORIENTATIONS.find((o) => o.id === selectedOrientation)?.extra || 0;
  const voiceoverExtra = addVoiceover ? 15 : 0;
  const customExtra = addCustomRequest ? 15 : 0;
  const voiceCloneExtra = addVoiceClone ? 15 : 0;
  const totalPrice = basePrice + orientationExtra + voiceoverExtra + customExtra + voiceCloneExtra;

  const needsDaysOnMarket = selectedPackage === "just_pended" || selectedPackage === "just_closed";
  const needsSoldPrice = selectedPackage === "just_closed";

  const step0Valid = !!(selectedPackage && selectedDuration && selectedOrientation);
  const step1Valid = !addCustomRequest || customRequestText.trim().length > 0;
  const step2Valid = !!(
    address &&
    price &&
    bedrooms &&
    bathrooms &&
    agent &&
    (!needsDaysOnMarket || daysOnMarket) &&
    (!needsSoldPrice || soldPrice)
  );
  const step3Valid = files.length >= 10;
  const stepValidity = [step0Valid, step1Valid, step2Valid, step3Valid] as const;
  const canAdvance = stepValidity[step];
  const canSubmit = stepValidity.every(Boolean);

  const handleFiles = useCallback(
    (newFiles: FileList | File[]) => {
      const accepted = Array.from(newFiles).filter((f) => /\.(jpg|jpeg|png|heic|webp)$/i.test(f.name));
      const remaining = 60 - files.length;
      const toAdd = accepted.slice(0, remaining);
      const mapped = toAdd.map((f) => ({ file: f, preview: URL.createObjectURL(f), id: crypto.randomUUID() }));
      setFiles((prev) => [...prev, ...mapped]);
    },
    [files.length]
  );

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const removed = prev.find((f) => f.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return prev.filter((f) => f.id !== id);
    });
  };

  const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);
  const formatSize = (bytes: number) =>
    bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await createProperty(
        {
          address,
          price: Number(price),
          bedrooms: Number(bedrooms),
          bathrooms: Number(bathrooms),
          listing_agent: agent,
          brokerage: "",
          photos: files.map((f) => f.file),
        },
        (uploaded, total) => setUploadProgress({ uploaded, total })
      );
      setTrackingId(result.id);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit property");
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    if (step < 3 && canAdvance) setStep((s) => (s + 1) as StepId);
  };
  const back = () => {
    if (step > 0) setStep((s) => (s - 1) as StepId);
  };

  // ─── success ───
  if (submitted) {
    return (
      <div
        className="le-root"
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          background: "var(--le-bg)",
          color: "var(--le-text)",
        }}
      >
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "96px 24px" }}>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE }}
            style={{ width: "100%", maxWidth: 480, textAlign: "center" }}
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.8, ease: EASE }}
              style={{
                margin: "0 auto 40px",
                display: "flex",
                width: 80,
                height: 80,
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid var(--le-text)",
                color: "var(--le-text)",
              }}
            >
              <CheckCircle2 className="h-9 w-9" strokeWidth={1.5} />
            </motion.div>
            <span className="le-eyebrow">— In production</span>
            <h1
              className="le-display"
              style={{
                fontSize: 54,
                marginTop: 18,
                lineHeight: 1,
                fontWeight: 500,
                letterSpacing: "-0.03em",
                fontFamily: "var(--le-font-sans)",
              }}
            >
              Your video
              <br />
              is in motion.
            </h1>
            <p style={{ marginTop: 24, fontSize: 14, lineHeight: 1.6, color: "var(--le-text-muted)" }}>
              {files.length} photos received. Estimated delivery in 72 hours. We'll email you when it's ready.
            </p>
            <div style={{ marginTop: 48, border: "1px solid var(--le-border)" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "1px solid var(--le-border)",
                  padding: "16px 22px",
                }}
              >
                <span className="le-eyebrow">Tracking</span>
                <span style={{ fontFamily: "var(--le-font-mono)", fontSize: 13, fontWeight: 500 }}>
                  {trackingId.slice(0, 8).toUpperCase()}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 22px" }}>
                <span className="le-eyebrow">Total</span>
                <span style={{ fontFamily: "var(--le-font-sans)", fontSize: 18, fontWeight: 500 }}>${totalPrice}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/status/${trackingId}`)}
              className="le-btn le-btn-primary"
              style={{ marginTop: 32, width: "100%", padding: "14px 18px", fontSize: 14, borderRadius: 2 }}
            >
              Track production <LEIcon name="arrow" size={14} color="var(--le-accent-fg)" />
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginTop: 20,
                fontSize: 12,
                color: "var(--le-text-muted)",
                textDecoration: "underline",
                textUnderlineOffset: 4,
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              Submit another listing
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  // ─── main ───
  return (
    <div
      className="le-root"
      style={{
        display: "flex",
        minHeight: "100vh",
        flexDirection: "column",
        background: "var(--le-bg)",
        color: "var(--le-text)",
      }}
    >
      {/* NAV */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 48px",
          borderBottom: "1px solid var(--le-border)",
        }}
      >
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 14, color: "var(--le-text)", textDecoration: "none" }}>
          <LELogoMark size={15} color="var(--le-text)" />
          <span
            style={{
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--le-text-faint)",
              fontFamily: "var(--le-font-mono)",
            }}
          >
            / Agent portal
          </span>
        </Link>
        <div
          className="hidden md:flex"
          style={{
            gap: 28,
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--le-text-muted)",
          }}
        >
          <span style={{ color: "var(--le-text)", fontWeight: 500 }}>New submission</span>
          <Link to="/account/properties" style={{ color: "inherit", textDecoration: "none" }}>History</Link>
          <Link to="/presets" style={{ color: "inherit", textDecoration: "none" }}>Presets</Link>
          <Link to="/account" style={{ color: "inherit", textDecoration: "none" }}>Account</Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {hasPresets && (
            <button
              type="button"
              onClick={handleUseLastPreset}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--le-text-muted)",
                fontFamily: "var(--le-font-mono)",
                background: "transparent",
                border: "1px solid var(--le-border-strong)",
                padding: "8px 12px",
                cursor: "pointer",
                borderRadius: 2,
              }}
            >
              Use last preset
            </button>
          )}
        </div>
      </nav>

      {/* HEADER */}
      <div style={{ padding: "72px 48px 48px" }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--le-text-faint)",
            fontFamily: "var(--le-font-mono)",
            fontWeight: 500,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ width: 14, height: 1, background: "var(--le-border-strong)" }} />
          New submission · Step {step + 1} of {STEPS.length}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 48, flexWrap: "wrap" }}>
          <h1
            className="le-display"
            style={{
              fontSize: "clamp(2.25rem, 5vw, 4.5rem)",
              lineHeight: 0.98,
              margin: 0,
              fontWeight: 500,
              letterSpacing: "-0.035em",
              maxWidth: 920,
              fontFamily: "var(--le-font-sans)",
            }}
          >
            {step === 0 && "Define the cut."}
            {step === 1 && "Refine with add-ons."}
            {step === 2 && "Tell us about the property."}
            {step === 3 && "Upload your photography."}
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--le-text-muted)", maxWidth: 300, marginBottom: 8 }}>
            Fill in the listing. Drop in 10–60 photos. You'll have cuts in roughly 72 hours.
          </p>
        </div>

        {/* Step rail */}
        <div style={{ marginTop: 48, display: "flex", gap: 12 }}>
          {STEPS.map((label, i) => {
            const active = i === step;
            const done = i < step;
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  if (i < step || (i === step + 1 && canAdvance)) setStep(i as StepId);
                }}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  textAlign: "left",
                  cursor: i < step ? "pointer" : "default",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span
                    style={{
                      fontFamily: "var(--le-font-mono)",
                      fontSize: 10,
                      color: active || done ? "var(--le-text)" : "var(--le-text-faint)",
                    }}
                  >
                    0{i + 1}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: active ? "var(--le-text)" : done ? "var(--le-text-muted)" : "var(--le-text-faint)",
                      fontWeight: active ? 500 : 400,
                    }}
                  >
                    {label}
                  </span>
                  {done && <LEIcon name="check" size={10} color="var(--le-text)" strokeWidth={2.4} />}
                </div>
                <div
                  style={{
                    height: 1,
                    background: active ? "var(--le-text)" : done ? "var(--le-text-muted)" : "var(--le-border)",
                    transition: "background 0.4s ease",
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP BODY */}
      <div style={{ flex: 1, padding: "24px 48px 48px", overflow: "auto" }}>
        <AnimatePresence mode="wait">
          {/* Step 0 — Style */}
          {step === 0 && (
            <motion.div
              key="step-0"
              variants={stepFade}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{ display: "flex", flexDirection: "column", gap: 64 }}
            >
              <section style={sectionStyle}>
                <SectionHeader n="01" title="Package" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
                  {PACKAGES.map((pkg) => (
                    <SelectTile
                      key={pkg.id}
                      active={selectedPackage === pkg.id}
                      onClick={() => setSelectedPackage(pkg.id)}
                    >
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.01em" }}>{pkg.name}</div>
                        {pkg.badge && (
                          <span
                            style={{
                              fontFamily: "var(--le-font-mono)",
                              fontSize: 10,
                              letterSpacing: "0.16em",
                              textTransform: "uppercase",
                              color: "var(--le-accent)",
                            }}
                          >
                            — {pkg.badge}
                          </span>
                        )}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, color: "var(--le-text-muted)" }}>{pkg.desc}</div>
                    </SelectTile>
                  ))}
                </div>
              </section>

              <section style={sectionStyle}>
                <SectionHeader n="02" title="Duration" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  {DURATIONS.map((d) => {
                    const p = isLifeCycle ? d.lifeCyclePrice : d.price;
                    return (
                      <SelectTile
                        key={d.id}
                        active={selectedDuration === d.id}
                        onClick={() => setSelectedDuration(d.id)}
                      >
                        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                              <span
                                style={{
                                  fontSize: 44,
                                  fontWeight: 500,
                                  letterSpacing: "-0.03em",
                                  lineHeight: 1,
                                  fontFamily: "var(--le-font-sans)",
                                }}
                              >
                                {d.label}
                              </span>
                              <span style={{ fontSize: 11, color: "var(--le-text-muted)" }}>sec</span>
                            </div>
                            {isLifeCycle && (
                              <span
                                style={{
                                  marginTop: 12,
                                  display: "inline-block",
                                  fontSize: 10,
                                  letterSpacing: "0.16em",
                                  textTransform: "uppercase",
                                  color: "var(--le-accent)",
                                  fontFamily: "var(--le-font-mono)",
                                }}
                              >
                                — Bundle save $25
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: 16, fontWeight: 500, letterSpacing: "-0.01em" }}>${p}</span>
                        </div>
                      </SelectTile>
                    );
                  })}
                </div>
              </section>

              <section style={sectionStyle}>
                <SectionHeader n="03" title="Output format" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
                  {ORIENTATIONS.map((o) => (
                    <SelectTile
                      key={o.id}
                      active={selectedOrientation === o.id}
                      onClick={() => setSelectedOrientation(o.id)}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
                        <span
                          style={{
                            fontFamily: "var(--le-font-display)",
                            fontSize: 26,
                            fontStyle: "italic",
                            letterSpacing: "-0.02em",
                            lineHeight: 1,
                          }}
                        >
                          {o.label}
                        </span>
                        <span style={{ fontFamily: "var(--le-font-mono)", fontSize: 11, color: "var(--le-text-muted)" }}>
                          {o.dim}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: "var(--le-text-muted)" }}>{o.sub}</span>
                        {o.extra > 0 && !isLifeCycle && (
                          <span style={{ fontFamily: "var(--le-font-mono)", fontSize: 11, color: "var(--le-text-muted)" }}>+${o.extra}</span>
                        )}
                        {o.extra > 0 && isLifeCycle && (
                          <span
                            style={{
                              fontFamily: "var(--le-font-mono)",
                              fontSize: 10,
                              letterSpacing: "0.16em",
                              textTransform: "uppercase",
                              color: "var(--le-accent)",
                            }}
                          >
                            Included
                          </span>
                        )}
                      </div>
                    </SelectTile>
                  ))}
                </div>
              </section>
            </motion.div>
          )}

          {/* Step 1 — Add-ons */}
          {step === 1 && (
            <motion.div
              key="step-1"
              variants={stepFade}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{ display: "flex", flexDirection: "column", gap: 32 }}
            >
              <section>
                <SectionHeader n="04" title="Refine the experience" />
                <p style={{ fontSize: 13, color: "var(--le-text-muted)", maxWidth: 480, marginTop: -12, marginBottom: 20 }}>
                  Each add-on is optional. Voice clone and AI voiceover are mutually exclusive — pick one or neither.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    {
                      active: addVoiceover,
                      toggle: () => {
                        setAddVoiceover(!addVoiceover);
                        if (!addVoiceover) setAddVoiceClone(false);
                      },
                      label: "AI voiceover",
                      desc: "Studio-quality narration generated from a script tailored to the listing.",
                    },
                    {
                      active: addVoiceClone,
                      toggle: () => {
                        setAddVoiceClone(!addVoiceClone);
                        if (!addVoiceClone) setAddVoiceover(false);
                      },
                      label: "Voice clone",
                      desc: "Use a sample of your own voice. Setup happens after submission.",
                    },
                    {
                      active: addCustomRequest,
                      toggle: () => setAddCustomRequest(!addCustomRequest),
                      label: "Custom request",
                      desc: "Specific shots, music, or pacing notes for the production team.",
                    },
                  ].map((addon) => (
                    <button
                      key={addon.label}
                      type="button"
                      onClick={addon.toggle}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "18px 22px",
                        border: `1px solid ${addon.active ? "var(--le-text)" : "var(--le-border-strong)"}`,
                        background: addon.active ? "var(--le-bg-sunken)" : "var(--le-bg)",
                        cursor: "pointer",
                        textAlign: "left",
                        color: "var(--le-text)",
                        fontFamily: "var(--le-font-sans)",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.005em" }}>{addon.label}</div>
                        <div style={{ fontSize: 12, color: "var(--le-text-muted)", marginTop: 4, maxWidth: 560 }}>
                          {addon.desc}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <span style={{ fontFamily: "var(--le-font-mono)", fontSize: 11, color: "var(--le-text-muted)" }}>+ $15</span>
                        <div
                          style={{
                            width: 32,
                            height: 18,
                            borderRadius: 999,
                            background: addon.active ? "var(--le-text)" : "var(--le-border-strong)",
                            position: "relative",
                            transition: "all .2s",
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              top: 2,
                              left: addon.active ? 16 : 2,
                              width: 14,
                              height: 14,
                              borderRadius: "50%",
                              background: addon.active ? "var(--le-bg)" : "var(--le-bg)",
                              transition: "all .2s",
                            }}
                          />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                <AnimatePresence>
                  {addCustomRequest && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.5, ease: EASE }}
                      style={{ overflow: "hidden" }}
                    >
                      <div style={{ marginTop: 16 }}>
                        <Label className="le-eyebrow">Custom notes</Label>
                        <textarea
                          value={customRequestText}
                          onChange={(e) => setCustomRequestText(e.target.value)}
                          placeholder="Specific shots, music style, pacing preferences, brand language…"
                          rows={5}
                          style={{
                            marginTop: 10,
                            width: "100%",
                            padding: "12px 14px",
                            minHeight: 120,
                            border: "1px solid var(--le-border-strong)",
                            background: "var(--le-bg)",
                            color: "var(--le-text)",
                            fontFamily: "var(--le-font-sans)",
                            fontSize: 14,
                            resize: "vertical",
                            borderRadius: 2,
                          }}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            </motion.div>
          )}

          {/* Step 2 — Property */}
          {step === 2 && (
            <motion.div key="step-2" variants={stepFade} initial="hidden" animate="visible" exit="exit">
              <SectionHeader n="05" title="Listing details" />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  columnGap: 28,
                  rowGap: 28,
                  marginTop: 8,
                }}
              >
                <FormField label="Property address" full>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="208 Berry Street, Brooklyn, NY"
                  />
                </FormField>
                <FormField label="Listing price">
                  <Input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="2400000"
                  />
                </FormField>
                <FormField label="Bedrooms">
                  <Input
                    type="number"
                    min={0}
                    value={bedrooms}
                    onChange={(e) => setBedrooms(e.target.value)}
                    placeholder="3"
                  />
                </FormField>
                <FormField label="Bathrooms">
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={bathrooms}
                    onChange={(e) => setBathrooms(e.target.value)}
                    placeholder="2.5"
                  />
                </FormField>
                <FormField label="Listing agent">
                  <Input value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="Jane Smith" />
                </FormField>
                {needsDaysOnMarket && (
                  <FormField label="Days on market">
                    <Input
                      type="number"
                      min={0}
                      value={daysOnMarket}
                      onChange={(e) => setDaysOnMarket(e.target.value)}
                      placeholder="14"
                    />
                  </FormField>
                )}
                {needsSoldPrice && (
                  <FormField label="Sold price">
                    <Input
                      type="number"
                      value={soldPrice}
                      onChange={(e) => setSoldPrice(e.target.value)}
                      placeholder="2500000"
                    />
                  </FormField>
                )}
              </div>
            </motion.div>
          )}

          {/* Step 3 — Photos */}
          {step === 3 && (
            <motion.div
              key="step-3"
              variants={stepFade}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{ display: "flex", flexDirection: "column", gap: 24 }}
            >
              <SectionHeader
                n="06"
                title="Photos"
                aside={
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
                    <span style={{ fontFamily: "var(--le-font-mono)", fontSize: 12, color: "var(--le-text-muted)" }}>
                      {files.length} / 60
                    </span>
                    {files.length >= 10 && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 11,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          color: "oklch(0.55 0.15 155)",
                          fontWeight: 500,
                        }}
                      >
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "oklch(0.6 0.15 155)" }} />
                        Minimum met
                      </span>
                    )}
                    {files.length > 0 && (
                      <span style={{ fontFamily: "var(--le-font-mono)", fontSize: 11, color: "var(--le-text-muted)" }}>
                        {formatSize(totalSize)}
                      </span>
                    )}
                  </span>
                }
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleFiles(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  aspectRatio: "16/7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  border: `1.5px dashed ${isDragging ? "var(--le-text)" : "var(--le-border-strong)"}`,
                  background: isDragging ? "var(--le-bg-sunken)" : "var(--le-bg)",
                  cursor: "pointer",
                  transition: "all 0.4s ease",
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.heic,.webp"
                  style={{ display: "none" }}
                  onChange={(e) => e.target.files && handleFiles(e.target.files)}
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  {...({ webkitdirectory: "", directory: "" } as React.HTMLAttributes<HTMLInputElement>)}
                  style={{ display: "none" }}
                  onChange={(e) => e.target.files && handleFiles(e.target.files)}
                />
                <div>
                  <LEIcon name="upload" size={28} color="var(--le-text-muted)" />
                  <p style={{ marginTop: 20, fontSize: 16, fontWeight: 500, letterSpacing: "-0.01em" }}>
                    Drop photos to upload
                  </p>
                  <p style={{ marginTop: 4, fontSize: 12, color: "var(--le-text-muted)" }}>or click to browse files</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      folderInputRef.current?.click();
                    }}
                    style={{
                      marginTop: 20,
                      fontSize: 11,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: "var(--le-text)",
                      textDecoration: "underline",
                      textUnderlineOffset: 4,
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "var(--le-font-mono)",
                    }}
                  >
                    Or import an entire folder
                  </button>
                </div>
              </div>

              {files.length > 0 && files.length < 10 && (
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ flex: 1, height: 1, background: "var(--le-border)" }}>
                    <motion.div
                      style={{ height: "100%", background: "var(--le-text)" }}
                      animate={{ width: `${(files.length / 10) * 100}%` }}
                      transition={{ duration: 0.5, ease: EASE }}
                    />
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--le-font-mono)",
                      fontSize: 11,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--le-text)",
                    }}
                  >
                    {10 - files.length} more required
                  </span>
                </div>
              )}

              {files.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
                  <AnimatePresence>
                    {files.map((f) => (
                      <motion.div
                        key={f.id}
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.85 }}
                        transition={{ duration: 0.4, ease: EASE }}
                        style={{
                          position: "relative",
                          aspectRatio: "4/3",
                          overflow: "hidden",
                          background: "var(--le-bg-sunken)",
                        }}
                      >
                        <img src={f.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(f.id);
                          }}
                          style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "rgba(0,0,0,0.7)",
                            opacity: 0,
                            transition: "opacity 0.3s ease",
                            border: "none",
                            cursor: "pointer",
                            color: "#fff",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                          aria-label="Remove photo"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {submitError && (
                <div
                  style={{
                    padding: "14px 18px",
                    border: `1px solid var(--le-danger)`,
                    background: "var(--le-danger-soft)",
                    color: "var(--le-danger)",
                    fontSize: 12,
                  }}
                >
                  {submitError}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* STICKY SUBMIT BAR */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "var(--le-bg)",
          borderTop: "1px solid var(--le-border)",
          padding: "18px 48px",
          zIndex: 30,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", gap: 40, alignItems: "center", flexWrap: "wrap" }}>
          <MetaPair l="Total" v={`$${totalPrice}`} />
          {selectedDur && <MetaPair l="Duration" v={`${selectedDur.label}s`} />}
          {step === 0 && step0Valid && (
            <button
              type="button"
              onClick={() => setShowSavePreset(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--le-text-muted)",
                fontFamily: "var(--le-font-mono)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              Save as preset
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {step > 0 && (
            <button
              type="button"
              onClick={back}
              disabled={submitting}
              className="le-btn le-btn-ghost"
              style={{ padding: "12px 18px", fontSize: 13, borderRadius: 2 }}
            >
              <LEIcon name="arrow" size={13} /> Back
            </button>
          )}
          {step < 3 ? (
            <button
              type="button"
              onClick={next}
              disabled={!canAdvance}
              className="le-btn le-btn-primary"
              style={{ padding: "12px 20px", fontSize: 13, borderRadius: 2, opacity: canAdvance ? 1 : 0.4 }}
            >
              Continue <LEIcon name="arrow" size={13} color="var(--le-accent-fg)" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="le-btn le-btn-primary"
              style={{ padding: "14px 22px", fontSize: 13, borderRadius: 2, opacity: canSubmit && !submitting ? 1 : 0.4 }}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {uploadProgress ? `${uploadProgress.uploaded} / ${uploadProgress.total}` : "Submitting…"}
                </>
              ) : (
                <>
                  Generate video <LEIcon name="arrow" size={13} color="var(--le-accent-fg)" />
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Save preset dialog */}
      <Dialog open={showSavePreset} onOpenChange={setShowSavePreset}>
        <DialogContent className="max-w-sm rounded-none">
          <DialogHeader>
            <DialogTitle
              className="text-lg font-medium tracking-[-0.01em]"
              style={{ fontFamily: "var(--le-font-sans)" }}
            >
              {presetSaved ? "Saved." : "Save as preset"}
            </DialogTitle>
          </DialogHeader>
          {presetSaved ? (
            <div className="flex flex-col items-center gap-4 py-6">
              <div
                className="flex h-12 w-12 items-center justify-center"
                style={{ border: "1px solid var(--le-border-strong)", color: "var(--le-text)" }}
              >
                <CheckCircle2 className="h-5 w-5" strokeWidth={1.5} />
              </div>
            </div>
          ) : (
            <>
              <Input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="My weekday listings"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
              />
              <DialogFooter>
                <button
                  type="button"
                  onClick={handleSavePreset}
                  disabled={!presetName.trim()}
                  className="le-btn le-btn-primary"
                  style={{ padding: "10px 18px", fontSize: 13, borderRadius: 2, opacity: presetName.trim() ? 1 : 0.4 }}
                >
                  Save preset
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

function FormField({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ gridColumn: full ? "span 4" : undefined }}>
      <div style={eyebrow}>{label}</div>
      <div
        style={{
          marginTop: 10,
          paddingBottom: 2,
          borderBottom: "1px solid var(--le-border-strong)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function MetaPair({ l, v }: { l: string; v: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--le-text-faint)",
          fontFamily: "var(--le-font-mono)",
          fontWeight: 500,
        }}
      >
        {l}
      </div>
      <div style={{ fontSize: 18, fontWeight: 500, marginTop: 4, letterSpacing: "-0.01em" }}>{v}</div>
    </div>
  );
}

export default Upload;
