import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { fetchPropertyStatus } from "@/lib/api";
import { LEIcon, LELogoMark, LETypewriter } from "@/components/le";
import heroBg from "@/assets/hero-bg.jpg";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

type Stage = { key: string; label: string };
const STAGES: Stage[] = [
  { key: "uploaded", label: "Received" },
  { key: "analyzing", label: "Analyzing" },
  { key: "scripting", label: "Directing" },
  { key: "generating", label: "Generating" },
  { key: "qc", label: "Quality check" },
  { key: "complete", label: "Complete" },
];

const TYPEWRITER_PHRASES = [
  "is getting its closeup.",
  "is rehearsing its lines.",
  "is finding its best angle.",
  "is in hair and makeup.",
  "is walking the red carpet.",
  "is waiting for its Oscar.",
];

interface StatusData {
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
}

function formatDuration(ms: number | null) {
  if (!ms || ms < 0) return "—";
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function formatTimeOfDay(iso: string | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "—";
  }
}

const Status = () => {
  const { id } = useParams();
  const [data, setData] = useState<StatusData | null>(null);
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
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load status");
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
      <div
        className="le-root"
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--le-bg)",
        }}
      >
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--le-text-muted)" }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="le-root"
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          padding: "24px 96px",
          background: "var(--le-bg)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            height: 56,
            width: 56,
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--le-danger)",
            background: "var(--le-danger-soft)",
            color: "var(--le-danger)",
          }}
        >
          <AlertTriangle className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <div>
          <span className="le-eyebrow">— Not found</span>
          <h1 className="le-display" style={{ marginTop: 12, fontSize: 44, fontWeight: 500 }}>
            Video unavailable.
          </h1>
          <p style={{ maxWidth: 480, marginTop: 16, fontSize: 14, color: "var(--le-text-muted)" }}>
            {error || "We can't find a video at this tracking ID. Check the link in your confirmation email."}
          </p>
        </div>
        <Link
          to="/"
          className="le-btn le-btn-ghost"
          style={{ padding: "8px 14px", fontSize: 13, borderRadius: 999 }}
        >
          <LEIcon name="arrow" size={14} /> Back to home
        </Link>
      </div>
    );
  }

  const currentStage = data.currentStage;
  const isComplete = data.status === "complete";
  const isFailed = data.status === "failed";
  const percent = Math.round(
    Math.max(0, Math.min(1, currentStage / Math.max(1, STAGES.length - 1))) * 100
  );
  const elapsed = data.processingTimeMs;
  const remainingMs =
    !isComplete && !isFailed && elapsed !== null && elapsed > 0
      ? Math.max(30_000, Math.round(elapsed * ((STAGES.length - 1) / Math.max(1, currentStage) - 1)))
      : null;
  const trackingId = data.id.slice(0, 8).toUpperCase();

  return (
    <div
      className="le-root"
      style={{
        background: "var(--le-bg)",
        color: "var(--le-text)",
        minHeight: "100vh",
        fontFamily: "var(--le-font-sans)",
      }}
    >
      {/* ============ HERO ============ */}
      <section style={{ position: "relative", height: 560, overflow: "hidden", background: "#000" }}>
        <img
          src={heroBg}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "brightness(0.55)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(5,7,14,0.85) 0%, rgba(5,7,14,0.25) 30%, rgba(5,7,14,0) 55%, rgba(5,7,14,0.6) 100%)",
          }}
        />

        <nav
          style={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "26px 48px",
            color: "#fff",
          }}
        >
          <Link to="/" style={{ display: "inline-flex", alignItems: "center", color: "#fff" }}>
            <LELogoMark size={18} color="#fff" />
          </Link>
          <div
            style={{
              padding: "7px 14px",
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(20px) saturate(1.4)",
              WebkitBackdropFilter: "blur(20px) saturate(1.4)",
              color: "#fff",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 999,
            }}
          >
            <span
              className="le-badge-dot le-pulse"
              style={{ background: "#fff" }}
            />
            Tracking · {trackingId}
          </div>
        </nav>

        <div style={{ position: "absolute", left: 48, right: 48, bottom: 60, zIndex: 2, color: "#fff" }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.7)",
              marginBottom: 24,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ width: 18, height: 1, background: "rgba(255,255,255,0.5)" }} />
            Submitted {formatTimeOfDay(data.createdAt)}
          </div>
          <h1
            style={{
              fontSize: "clamp(2.5rem, 7vw, 6rem)",
              lineHeight: 0.96,
              margin: 0,
              fontWeight: 500,
              letterSpacing: "-0.035em",
              maxWidth: 1100,
            }}
          >
            {data.address}
            {!isComplete && !isFailed && (
              <>
                <br />
                <span style={{ color: "rgba(255,255,255,0.55)" }}>
                  <LETypewriter phrases={TYPEWRITER_PHRASES} />
                </span>
              </>
            )}
            {isComplete && (
              <>
                <br />
                <span style={{ color: "rgba(255,255,255,0.55)" }}>is ready.</span>
              </>
            )}
            {isFailed && (
              <>
                <br />
                <span style={{ color: "rgba(255,255,255,0.55)" }}>hit a snag.</span>
              </>
            )}
          </h1>
        </div>
      </section>

      {/* ============ FAILED BANNER ============ */}
      {isFailed && (
        <section className="le-midnight-wash" style={{ padding: "60px 48px", color: "#fff" }}>
          <div style={{ position: "relative", zIndex: 2, maxWidth: 720 }}>
            <div className="le-eyebrow" style={{ color: "rgba(255,255,255,0.55)", marginBottom: 16 }}>
              — Failed
            </div>
            <h2 style={{ fontSize: 40, margin: 0, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1 }}>
              Production stopped.
            </h2>
            <p style={{ marginTop: 20, fontSize: 14, color: "rgba(255,255,255,0.7)", maxWidth: 520, lineHeight: 1.6 }}>
              Something interrupted the pipeline. We're notified and will reach out shortly. You can also email{" "}
              <a
                href="mailto:help@listingelevate.com"
                style={{ color: "#fff", textDecoration: "underline", textUnderlineOffset: 3 }}
              >
                help@listingelevate.com
              </a>
              .
            </p>
          </div>
        </section>
      )}

      {/* ============ ETA BAND ============ */}
      {!isFailed && !isComplete && (
        <section
          className="le-midnight-wash"
          style={{ padding: "80px 48px", color: "#fff", position: "relative" }}
        >
          <div
            style={{
              position: "relative",
              zIndex: 2,
              display: "grid",
              gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)",
              gap: 80,
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.24em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.5)",
                  marginBottom: 22,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span className="le-badge-dot le-pulse" style={{ background: "#fff" }} />
                {STAGES[Math.min(currentStage, STAGES.length - 1)].label} —{" "}
                {data.clipsCompleted} of {Math.max(1, data.clipsTotal)} scenes rendered
              </div>
              <div style={{ fontSize: 72, lineHeight: 1, fontWeight: 500, letterSpacing: "-0.035em" }}>
                {remainingMs !== null ? (
                  <>
                    About <span style={{ fontWeight: 500 }}>{formatDuration(remainingMs)}</span> remaining
                  </>
                ) : (
                  <>Working on your film.</>
                )}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.6)",
                  marginTop: 20,
                  maxWidth: 520,
                  lineHeight: 1.6,
                }}
              >
                Don't refresh — we'll email you the moment it's ready. You can close this page safely.
              </div>
            </div>

            <div className="le-glass" style={{ padding: 32, borderRadius: 2, position: "relative", overflow: "hidden" }}>
              <div className="le-specular" />
              <div style={{ position: "relative", zIndex: 2 }}>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.6)",
                    marginBottom: 14,
                  }}
                >
                  Overall
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <div style={{ fontSize: 96, fontWeight: 500, letterSpacing: "-0.045em", lineHeight: 1 }}>
                    {percent}
                  </div>
                  <div
                    style={{
                      fontSize: 32,
                      fontWeight: 500,
                      letterSpacing: "-0.02em",
                      color: "rgba(255,255,255,0.6)",
                    }}
                  >
                    %
                  </div>
                </div>
                <div
                  style={{
                    height: 2,
                    background: "rgba(255,255,255,0.15)",
                    marginTop: 22,
                    overflow: "hidden",
                  }}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    transition={{ duration: 1, ease: EASE }}
                    style={{ height: "100%", background: "#fff" }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 12,
                    fontSize: 11,
                    fontFamily: "var(--le-font-mono)",
                    color: "rgba(255,255,255,0.55)",
                    letterSpacing: "0.08em",
                  }}
                >
                  <span>STARTED {formatTimeOfDay(data.createdAt).toUpperCase()}</span>
                  <span>ELAPSED {formatDuration(elapsed)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ============ PIPELINE ============ */}
      <section style={{ padding: "96px 48px 80px", background: "var(--le-bg)" }}>
        <div className="le-eyebrow" style={{ marginBottom: 20 }}>— Pipeline</div>
        <h2
          style={{
            fontSize: 48,
            margin: "0 0 64px",
            fontWeight: 500,
            letterSpacing: "-0.03em",
            lineHeight: 1,
            color: "var(--le-text)",
          }}
        >
          Six stages.
        </h2>

        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 0 }}>
          <div
            style={{
              position: "absolute",
              top: 19,
              left: "8%",
              right: "8%",
              height: 1,
              background: "var(--le-border-strong)",
            }}
          />
          <motion.div
            initial={{ width: 0 }}
            animate={{
              width: `${Math.max(
                0,
                Math.min(
                  84,
                  8 + (Math.min(currentStage, STAGES.length - 1) / (STAGES.length - 1)) * 84
                )
              )}%`,
            }}
            transition={{ duration: 1, ease: EASE }}
            style={{ position: "absolute", top: 19, left: 0, height: 1, background: "var(--le-text)" }}
          />
          {STAGES.map((s, i) => {
            const done = i < currentStage || (i === currentStage && isComplete);
            const active = i === currentStage && !isComplete && !isFailed;
            return (
              <div key={s.key} style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
                <div
                  className={active ? "le-pulse" : ""}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    margin: "0 auto",
                    background: done ? "var(--le-text)" : "var(--le-bg)",
                    border: active
                      ? "1.5px solid var(--le-text)"
                      : done
                      ? "none"
                      : "1px solid var(--le-border-strong)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: done ? "var(--le-bg)" : "var(--le-text-muted)",
                    boxShadow: active ? "0 0 0 6px rgba(10,12,20,0.06)" : "none",
                  }}
                >
                  {done ? (
                    <LEIcon name="check" size={14} color="var(--le-bg)" strokeWidth={2.4} />
                  ) : (
                    <span style={{ fontFamily: "var(--le-font-mono)", fontSize: 11 }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    marginTop: 16,
                    letterSpacing: "-0.005em",
                    color: done || active ? "var(--le-text)" : "var(--le-text-faint)",
                  }}
                >
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ============ SCENE GRID ============ */}
      {data.clipsTotal > 0 && (
        <section style={{ padding: "0 48px 96px", background: "var(--le-bg)" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginBottom: 28,
              flexWrap: "wrap",
              gap: 16,
            }}
          >
            <div>
              <div className="le-eyebrow" style={{ marginBottom: 14 }}>— Scenes</div>
              <h2
                style={{
                  fontSize: 40,
                  margin: 0,
                  fontWeight: 500,
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                  color: "var(--le-text)",
                }}
              >
                {data.clipsCompleted} rendered,{" "}
                {Math.max(0, data.clipsTotal - data.clipsCompleted)} remaining.
              </h2>
            </div>
            <span
              style={{
                fontFamily: "var(--le-font-mono)",
                fontSize: 11,
                color: "var(--le-text-faint)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Runway · Kling · Luma
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(Math.max(data.clipsTotal, 4), 12)}, 1fr)`,
              gap: 6,
            }}
          >
            {Array.from({ length: data.clipsTotal }).map((_, i) => {
              const done = i < data.clipsCompleted;
              const active = i === data.clipsCompleted && !isComplete && !isFailed;
              return (
                <div
                  key={i}
                  style={{
                    aspectRatio: "3/4",
                    border: active ? "1.5px solid var(--le-text)" : "1px solid var(--le-border)",
                    background: done
                      ? "var(--le-text)"
                      : active
                      ? "var(--le-bg)"
                      : "var(--le-bg-sunken)",
                    color: done ? "var(--le-bg)" : "var(--le-text)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: 10,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--le-font-mono)",
                      fontSize: 10,
                      opacity: done ? 0.6 : 0.5,
                      letterSpacing: "0.06em",
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    {done && <LEIcon name="check" size={14} color="var(--le-bg)" strokeWidth={2.2} />}
                    {active && (
                      <span
                        className="le-badge-dot le-pulse"
                        style={{ background: "var(--le-text)", width: 7, height: 7 }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ============ DELIVERY ============ */}
      {isComplete && (data.horizontalVideoUrl || data.verticalVideoUrl) && (
        <section
          style={{
            padding: "0 48px 96px",
            background: "var(--le-bg)",
          }}
        >
          <div className="le-eyebrow" style={{ marginBottom: 14 }}>— Delivery</div>
          <h2
            style={{
              fontSize: 48,
              margin: 0,
              fontWeight: 500,
              letterSpacing: "-0.03em",
              lineHeight: 1,
              color: "var(--le-text)",
            }}
          >
            Your video is ready.
          </h2>

          <div style={{ marginTop: 40, display: "grid", gap: 4, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            {data.horizontalVideoUrl && (
              <DeliveryTile url={data.horizontalVideoUrl} label="Horizontal — 16:9" ratio="16/9" />
            )}
            {data.verticalVideoUrl && (
              <DeliveryTile url={data.verticalVideoUrl} label="Vertical — 9:16" ratio="9/16" />
            )}
          </div>

          <div style={{ marginTop: 40, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <Link
              to="/upload"
              className="le-btn le-btn-primary"
              style={{ padding: "12px 18px", fontSize: 13, borderRadius: 2 }}
            >
              Submit another listing <LEIcon name="arrow" size={13} color="var(--le-accent-fg)" />
            </Link>
            <Link
              to="/account/properties"
              className="le-btn le-btn-ghost"
              style={{ padding: "12px 18px", fontSize: 13, borderRadius: 2 }}
            >
              View all videos
            </Link>
          </div>
        </section>
      )}

      {/* ============ FOOTER ============ */}
      <footer
        style={{
          padding: "40px 48px",
          borderTop: "1px solid var(--le-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 12,
          color: "var(--le-text-muted)",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <LELogoMark size={14} color="var(--le-text)" />
        <span>
          Questions?{" "}
          <a
            href="mailto:support@listingelevate.com"
            style={{
              color: "var(--le-text)",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            support@listingelevate.com
          </a>
        </span>
        <span style={{ fontFamily: "var(--le-font-mono)", fontSize: 11 }}>© 2026 Listing Elevate, Inc.</span>
      </footer>
    </div>
  );
};

function DeliveryTile({
  url,
  label,
  ratio,
}: {
  url: string;
  label: string;
  ratio: "16/9" | "9/16";
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        position: "relative",
        display: "block",
        aspectRatio: ratio,
        overflow: "hidden",
        border: "1px solid var(--le-border)",
        background: "var(--le-bg-sunken)",
        textDecoration: "none",
        color: "#fff",
      }}
    >
      <video
        src={url}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        muted
        loop
        playsInline
      />
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          className="le-btn-glass"
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <LEIcon name="play" size={22} color="#fff" />
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          inset: "auto 0 0 0",
          padding: "14px 18px",
          background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.8))",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontFamily: "var(--le-font-mono)",
          }}
        >
          {label}
        </span>
        <LEIcon name="download" size={14} color="#fff" />
      </div>
    </a>
  );
}

export default Status;
