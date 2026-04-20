import { Link, useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Loader2, CheckCircle } from "lucide-react";
import { motion, type Variants } from "framer-motion";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { supabase, AUTH_CALLBACK_URL } from "@/lib/supabase";
import { LECyclingWord, LELogoMark, LEIcon } from "@/components/le";
import heroVideo from "@/assets/hero-video-loop.mp4.asset.json";
import heroBg from "@/assets/hero-bg.jpg";
import interior1 from "@/assets/interior-1.jpg";
import exterior1 from "@/assets/exterior-1.jpg";
import kitchen1 from "@/assets/kitchen-1.jpg";
import aerial1 from "@/assets/aerial-1.jpg";
import showcaseInterior from "@/assets/showcase-interior.mp4.asset.json";
import showcaseKitchen from "@/assets/showcase-kitchen.mp4.asset.json";
import showcaseExterior from "@/assets/showcase-exterior.mp4.asset.json";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 1.1, delay: i * 0.08, ease: EASE },
  }),
};
const stagger: Variants = { visible: { transition: { staggerChildren: 0.12 } } };

const TRUSTED = ["Compass", "Douglas Elliman", "Sotheby's Intl.", "Corcoran", "The Agency", "Engel & Völkers"];

const PROCESS_STEPS = [
  { n: "01", t: "Upload", d: "Drop 20–60 photos. We handle exposure, orientation, and metadata. Takes a minute.", img: kitchen1 },
  { n: "02", t: "Direct", d: "Our model scripts the shot plan — camera work, room order, voice, and mood.", img: interior1 },
  { n: "03", t: "Deliver", d: "A human editor reviews. You receive 16:9 and 9:16 cuts, ready to broadcast.", img: aerial1 },
];

const NUMBERS: [string, string][] = [
  ["4,280+", "Listings elevated"],
  ["72h", "Guaranteed turnaround"],
  ["$75", "Starting per video"],
  ["94.2%", "Accepted first cut"],
];

const Index = () => {
  const { user, profile } = useAuth();
  const accountHref = profile?.role === "admin" ? "/dashboard" : "/account";
  const accountLabel = profile?.role === "admin" ? "Dashboard" : "Account";
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useTheme();

  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authFirst, setAuthFirst] = useState("");
  const [authLast, setAuthLast] = useState("");
  const [authBrokerage, setAuthBrokerage] = useState("");
  const [authSent, setAuthSent] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const openAuth = (tab: "signin" | "signup") => {
    setAuthTab(tab);
    setAuthEmail("");
    setAuthPassword("");
    setAuthFirst("");
    setAuthLast("");
    setAuthBrokerage("");
    setAuthSent(false);
    setAuthError("");
    setAuthOpen(true);
  };

  const handleGetStarted = () => {
    if (user) navigate("/upload");
    else openAuth("signup");
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      // Signin + password → direct login; any other combo → magic link.
      if (authTab === "signin" && authPassword) {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        setAuthOpen(false);
        return;
      }
      const metadata =
        authTab === "signup"
          ? { first_name: authFirst, last_name: authLast, brokerage: authBrokerage }
          : undefined;
      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail,
        options: { emailRedirectTo: AUTH_CALLBACK_URL, data: metadata },
      });
      if (error) throw error;
      setAuthSent(true);
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="le-root" style={{ background: "var(--le-bg)", color: "var(--le-text)", minHeight: "100vh" }}>
      {/* ============ HERO ============ */}
      <section style={{ position: "relative", height: "min(820px, 100vh)", minHeight: 640, overflow: "hidden", background: "#000" }}>
        <video
          autoPlay
          loop
          muted
          playsInline
          poster={heroBg}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.62) saturate(1.05)" }}
        >
          <source src={heroVideo.url} type="video/mp4" />
        </video>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(5,7,14,0.85) 0%, rgba(5,7,14,0.15) 22%, rgba(5,7,14,0) 45%, rgba(5,7,14,0.35) 75%, rgba(5,7,14,0.7) 100%)",
          }}
        />

        {/* NAV */}
        <nav
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "26px 48px",
            color: "#fff",
            zIndex: 2,
          }}
        >
          <Link to="/" style={{ display: "flex", alignItems: "center", color: "#fff" }}>
            <LELogoMark size={20} color="#fff" />
          </Link>
          <div
            className="hidden md:flex"
            style={{
              gap: 44,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.82)",
            }}
          >
            <a href="#process" style={{ color: "inherit" }}>Process</a>
            <a href="#showcase" style={{ color: "inherit" }}>Showcase</a>
            <a href="#numbers" style={{ color: "inherit" }}>Numbers</a>
            <a href="#faq" style={{ color: "inherit" }}>FAQ</a>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              type="button"
              aria-label="Toggle theme"
              onClick={toggleTheme}
              style={{
                width: 34,
                height: 34,
                border: "1px solid rgba(255,255,255,0.22)",
                borderRadius: 6,
                background: "transparent",
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <LEIcon name={theme === "dark" ? "sun" : "moon"} size={14} color="#fff" />
            </button>
            {user ? (
              <Link
                to={accountHref}
                style={{
                  background: "#fff",
                  color: "#07080c",
                  padding: "8px 16px",
                  borderRadius: 4,
                  fontSize: 13,
                  fontWeight: 500,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  letterSpacing: "-0.005em",
                  textDecoration: "none",
                }}
              >
                {accountLabel} <LEIcon name="arrow" size={12} color="#07080c" />
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => openAuth("signin")}
                  style={{ background: "transparent", border: "none", fontSize: 13, color: "rgba(255,255,255,0.85)", cursor: "pointer" }}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={handleGetStarted}
                  style={{
                    background: "#fff",
                    color: "#07080c",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: 4,
                    fontSize: 13,
                    fontWeight: 500,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    letterSpacing: "-0.005em",
                  }}
                >
                  Get started <LEIcon name="arrow" size={12} color="#07080c" />
                </button>
              </>
            )}
          </div>
        </nav>

        {/* HERO COPY */}
        <div
          style={{
            position: "absolute",
            left: 48,
            bottom: 80,
            right: 48,
            color: "#fff",
            zIndex: 2,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.75)",
              marginBottom: 28,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ width: 18, height: 1, background: "rgba(255,255,255,0.5)" }} />
            Listing Elevate · Cinematic · On demand
          </div>
          <h1
            style={{
              fontSize: "clamp(2.5rem, 8vw, 6.5rem)",
              lineHeight: 0.96,
              margin: 0,
              fontWeight: 500,
              letterSpacing: "-0.035em",
              maxWidth: 1100,
            }}
          >
            <LECyclingWord words={["Take", "Sell", "Retain"]} kind="cascade" /> more listings.
          </h1>
          <p
            style={{
              fontSize: 18,
              lineHeight: 1.5,
              maxWidth: 520,
              marginTop: 28,
              color: "rgba(255,255,255,0.78)",
              fontWeight: 400,
            }}
          >
            Upload photos. Receive a directed, edited, cinematic listing video within 72&nbsp;hours. No crew, no scheduling,
            no post-production.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 28, marginTop: 40, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleGetStarted}
              style={{
                background: "#fff",
                color: "#07080c",
                border: "none",
                padding: "16px 22px",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                letterSpacing: "-0.005em",
                borderRadius: 2,
              }}
            >
              Start a video <LEIcon name="arrow" size={14} color="#07080c" />
            </button>
            {!user && (
              <button
                type="button"
                onClick={() => openAuth("signin")}
                style={{
                  fontSize: 14,
                  color: "#fff",
                  textDecoration: "underline",
                  textUnderlineOffset: 4,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  background: "transparent",
                  border: "none",
                }}
              >
                Sign in to your account <LEIcon name="arrowUpRight" size={12} color="#fff" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ============ LOGO STRIP ============ */}
      <section
        style={{
          padding: "28px 48px",
          borderBottom: "1px solid var(--le-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 32,
          background: "var(--le-bg)",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--le-text-faint)",
            fontWeight: 500,
          }}
        >
          — Trusted by
        </span>
        {TRUSTED.map((n) => (
          <span
            key={n}
            style={{
              fontSize: 16,
              color: "var(--le-text-muted)",
              fontWeight: 500,
              letterSpacing: "-0.01em",
              opacity: 0.55,
            }}
          >
            {n}
          </span>
        ))}
      </section>

      {/* ============ PROCESS ============ */}
      <section id="process" style={{ padding: "140px 48px 120px", background: "var(--le-bg)" }}>
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-120px" }}
          variants={stagger}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 88, flexWrap: "wrap", gap: 24 }}
        >
          <motion.div variants={fadeUp}>
            <div className="le-eyebrow" style={{ marginBottom: 20 }}>— The Process</div>
            <h2
              className="le-display"
              style={{
                fontSize: "clamp(2.5rem, 6vw, 4.75rem)",
                lineHeight: 0.98,
                margin: 0,
                fontWeight: 500,
                letterSpacing: "-0.035em",
                maxWidth: 800,
                fontFamily: "var(--le-font-sans)",
              }}
            >
              Three steps.
              <br />Seventy-two hours.
            </h2>
          </motion.div>
          <motion.p
            variants={fadeUp}
            custom={1}
            style={{ maxWidth: 320, color: "var(--le-text-muted)", fontSize: 14, lineHeight: 1.6, marginBottom: 6 }}
          >
            Every frame directed by our model. Every cut approved by a human editor. No templates, no stock, no crew.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 1,
            background: "var(--le-border)",
          }}
        >
          {PROCESS_STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              variants={fadeUp}
              custom={i}
              style={{
                padding: "44px 40px 48px",
                background: "var(--le-bg)",
                display: "flex",
                flexDirection: "column",
                gap: 32,
                minHeight: 520,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <span
                  style={{
                    fontFamily: "var(--le-font-mono)",
                    fontSize: 11,
                    letterSpacing: "0.18em",
                    color: "var(--le-text-faint)",
                  }}
                >
                  {s.n} / 03
                </span>
                <LEIcon name="arrowUpRight" size={14} color="var(--le-text-faint)" />
              </div>

              <div style={{ width: "100%", aspectRatio: "4/3", overflow: "hidden", background: "#000" }}>
                <img
                  src={s.img}
                  alt={s.t}
                  style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.9)" }}
                />
              </div>

              <div>
                <h3
                  style={{
                    fontSize: 34,
                    margin: 0,
                    fontWeight: 500,
                    letterSpacing: "-0.025em",
                    lineHeight: 1,
                  }}
                >
                  {s.t}
                </h3>
                <p
                  style={{
                    marginTop: 14,
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: "var(--le-text-muted)",
                    maxWidth: 360,
                  }}
                >
                  {s.d}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ============ SHOWCASE — midnight wash ============ */}
      <section
        id="showcase"
        className="le-midnight-wash"
        style={{ padding: "140px 48px", color: "#fff", position: "relative", overflow: "hidden" }}
      >
        <div style={{ position: "relative", zIndex: 2 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginBottom: 72,
              flexWrap: "wrap",
              gap: 24,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.5)",
                  fontWeight: 500,
                  marginBottom: 20,
                }}
              >
                — Showcase
              </div>
              <h2
                style={{
                  fontSize: "clamp(2.5rem, 6vw, 4.75rem)",
                  lineHeight: 0.98,
                  margin: 0,
                  fontWeight: 500,
                  letterSpacing: "-0.035em",
                }}
              >
                Selected work.
              </h2>
            </div>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", textDecoration: "underline", textUnderlineOffset: 4 }}>
              View the reel →
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: 20 }}>
            <ShowcaseCard
              video={showcaseInterior.url}
              poster={interior1}
              title="812 Alta Mesa Drive"
              meta="Austin · $2.45M · 4 BD · 3.5 BA"
              duration="0:38"
              big
            />
            <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 20 }}>
              <ShowcaseCard
                video={showcaseKitchen.url}
                poster={kitchen1}
                title="115 Meridian Court"
                meta="San Diego · $4.8M · 5 BD · 6 BA"
                duration="0:42"
              />
              <ShowcaseCard
                video={showcaseExterior.url}
                poster={exterior1}
                title="27 Laurel Heights"
                meta="Aspen · $11.2M · 6 BD · 7 BA"
                duration="0:51"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ============ NUMBERS + QUOTE ============ */}
      <section
        id="numbers"
        style={{
          padding: "140px 48px",
          background: "var(--le-bg)",
          display: "grid",
          gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr)",
          gap: 96,
          alignItems: "center",
        }}
      >
        <div>
          <div className="le-eyebrow" style={{ marginBottom: 32 }}>— By the numbers</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "60px 48px",
            }}
          >
            {NUMBERS.map(([n, l]) => (
              <div key={l} style={{ borderTop: "1px solid var(--le-border-strong)", paddingTop: 20 }}>
                <div
                  style={{
                    fontSize: 60,
                    fontWeight: 500,
                    letterSpacing: "-0.035em",
                    lineHeight: 1,
                    fontFamily: "var(--le-font-sans)",
                  }}
                >
                  {n}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--le-text-muted)",
                    marginTop: 10,
                    letterSpacing: "0.02em",
                  }}
                >
                  {l}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p
            className="le-display"
            style={{
              fontSize: 44,
              lineHeight: 1.15,
              margin: 0,
              fontStyle: "italic",
              letterSpacing: "-0.02em",
              fontWeight: 400,
            }}
          >
            "We cut reels for eleven listings last weekend — on a Sunday, from my daughter's soccer game."
          </p>
          <div style={{ marginTop: 32, display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #e2d3c0, #8a7560)",
              }}
            />
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Mara Kowalski</div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--le-text-muted)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginTop: 2,
                }}
              >
                Principal · Cresthaven Realty · Austin
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="le-midnight-wash" style={{ padding: "120px 48px", color: "#fff", textAlign: "center", position: "relative" }}>
        <div style={{ position: "relative", zIndex: 2, maxWidth: 760, margin: "0 auto" }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.6)",
              marginBottom: 24,
            }}
          >
            — The next step
          </div>
          <h2
            style={{
              fontSize: "clamp(2.5rem, 6vw, 5rem)",
              lineHeight: 1,
              margin: 0,
              fontWeight: 500,
              letterSpacing: "-0.035em",
            }}
          >
            Your next listing, elevated.
          </h2>
          <button
            type="button"
            onClick={handleGetStarted}
            style={{
              marginTop: 40,
              background: "#fff",
              color: "#07080c",
              border: "none",
              padding: "16px 24px",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              letterSpacing: "-0.005em",
              borderRadius: 2,
            }}
          >
            Start your first video <LEIcon name="arrow" size={14} color="#07080c" />
          </button>
        </div>
      </section>

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
          background: "var(--le-bg)",
        }}
      >
        <LELogoMark size={14} color="var(--le-text)" />
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          <a href="#process" style={{ color: "inherit" }}>Process</a>
          <a href="#showcase" style={{ color: "inherit" }}>Showcase</a>
          <a href="#numbers" style={{ color: "inherit" }}>Numbers</a>
          <a href="#faq" style={{ color: "inherit" }}>FAQ</a>
          <Link to="/upload" style={{ color: "inherit", textDecoration: "none" }}>Start</Link>
          <a href="mailto:help@listingelevate.com" style={{ color: "inherit" }}>help@listingelevate.com</a>
        </div>
        <span style={{ fontFamily: "var(--le-font-mono)", fontSize: 11 }}>© 2026 Listing Elevate, Inc.</span>
      </footer>

      {/* ============ AUTH MODAL ============ */}
      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="max-w-md gap-0 overflow-hidden rounded-none p-0">
          {authSent ? (
            <div className="space-y-5 p-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center border border-[var(--le-border-strong)] bg-[var(--le-bg-sunken)] text-[var(--le-text)]">
                <CheckCircle className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-medium tracking-[-0.02em]" style={{ fontFamily: "var(--le-font-sans)" }}>
                Check your email.
              </h2>
              <p className="text-sm" style={{ color: "var(--le-text-muted)" }}>
                Magic link sent to <span className="font-medium" style={{ color: "var(--le-text)" }}>{authEmail}</span>.
              </p>
              <button
                type="button"
                onClick={() => {
                  setAuthSent(false);
                  setAuthEmail("");
                }}
                className="text-xs underline underline-offset-4"
                style={{ color: "var(--le-text-muted)" }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <div className="flex border-b" style={{ borderColor: "var(--le-border)" }}>
                {(["signin", "signup"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAuthTab(t)}
                    className="relative flex-1 py-4 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors"
                    style={{ color: authTab === t ? "var(--le-text)" : "var(--le-text-muted)" }}
                  >
                    {t === "signin" ? "Sign in" : "Create account"}
                    {authTab === t && (
                      <motion.span
                        layoutId="auth-tab-underline"
                        className="absolute inset-x-0 bottom-[-1px] h-[2px]"
                        style={{ background: "var(--le-text)" }}
                        transition={{ duration: 0.4, ease: EASE }}
                      />
                    )}
                  </button>
                ))}
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-5 p-8">
                {authTab === "signup" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="le-eyebrow">First name</Label>
                        <Input value={authFirst} onChange={(e) => setAuthFirst(e.target.value)} placeholder="Jane" required />
                      </div>
                      <div className="space-y-2">
                        <Label className="le-eyebrow">Last name</Label>
                        <Input value={authLast} onChange={(e) => setAuthLast(e.target.value)} placeholder="Smith" required />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="le-eyebrow">Brokerage</Label>
                      <Input value={authBrokerage} onChange={(e) => setAuthBrokerage(e.target.value)} placeholder="Compass, Keller Williams…" required />
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label className="le-eyebrow">Email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--le-text-faint)" }} />
                    <Input
                      type="email"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="you@brokerage.com"
                      required
                      autoFocus
                      className="pl-11"
                    />
                  </div>
                </div>

                {authTab === "signin" && (
                  <div className="space-y-2">
                    <Label className="le-eyebrow">
                      Password{" "}
                      <span style={{ color: "var(--le-text-faint)", letterSpacing: "normal", textTransform: "none" }}>
                        — optional, blank sends magic link
                      </span>
                    </Label>
                    <Input
                      type="password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                )}

                {authError && <p className="text-xs" style={{ color: "var(--le-danger)" }}>{authError}</p>}

                <button
                  type="submit"
                  disabled={authLoading || !authEmail}
                  className="le-btn le-btn-primary w-full"
                  style={{ padding: "12px 16px", borderRadius: 2, fontSize: 14 }}
                >
                  {authLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      {authTab === "signup"
                        ? "Create account"
                        : authPassword
                          ? "Sign in"
                          : "Send magic link"}
                      <LEIcon name="arrow" size={14} color="var(--le-accent-fg)" />
                    </>
                  )}
                </button>

                <p className="text-center text-xs" style={{ color: "var(--le-text-muted)" }}>
                  {authTab === "signin" ? (
                    <>
                      No account?{" "}
                      <button
                        type="button"
                        onClick={() => setAuthTab("signup")}
                        className="underline underline-offset-4"
                        style={{ color: "var(--le-text)" }}
                      >
                        Create one
                      </button>
                    </>
                  ) : (
                    <>
                      Already registered?{" "}
                      <button
                        type="button"
                        onClick={() => setAuthTab("signin")}
                        className="underline underline-offset-4"
                        style={{ color: "var(--le-text)" }}
                      >
                        Sign in
                      </button>
                    </>
                  )}
                </p>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

function ShowcaseCard({
  video,
  poster,
  title,
  meta,
  duration,
  big,
}: {
  video: string;
  poster: string;
  title: string;
  meta: string;
  duration: string;
  big?: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        background: "#000",
        aspectRatio: big ? "16/11" : "16/9",
        cursor: "pointer",
      }}
    >
      <video
        autoPlay
        loop
        muted
        playsInline
        poster={poster}
        style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.82)" }}
      >
        <source src={video} type="video/mp4" />
      </video>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,0.6) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 18,
          left: 18,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderRadius: 2,
          background: "rgba(255,255,255,0.12)",
          backdropFilter: "blur(14px) saturate(1.4)",
          WebkitBackdropFilter: "blur(14px) saturate(1.4)",
          border: "1px solid rgba(255,255,255,0.18)",
          color: "#fff",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        <LEIcon name="play" size={10} color="#fff" /> {duration}
      </div>
      <div style={{ position: "absolute", left: 22, bottom: 20, color: "#fff" }}>
        <div
          style={{
            fontSize: big ? 26 : 18,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.75)",
            marginTop: 6,
          }}
        >
          {meta}
        </div>
      </div>
    </div>
  );
}

export default Index;
