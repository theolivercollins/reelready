import { Link } from "react-router-dom";

// Modern dusk home — matches the cinematic reference screenshot
// (warm interior glow, pool in foreground, deep dusk sky).
const HERO_PHOTO_URL =
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=2400&q=80";

export function Hero() {
  return (
    <section
      style={{
        position: "relative",
        minHeight: "100vh",
        backgroundImage: `url(${HERO_PHOTO_URL})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        color: "#fff",
        overflow: "hidden",
      }}
    >
      {/* Gradient overlay — darkens bottom-left for legibility, keeps sky airy */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom, rgba(5,7,16,0.25) 0%, rgba(5,7,16,0.7) 60%, rgba(5,7,16,0.9) 100%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          minHeight: "100vh",
          padding: "120px 48px 80px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          maxWidth: 1440,
          margin: "0 auto",
        }}
      >
        <div className="le-eyebrow" style={{ marginBottom: 16 }}>
          LISTING ELEVATE · CINEMATIC · ON DEMAND
        </div>
        <h1
          className="le-display"
          style={{
            fontSize: "clamp(56px, 9vw, 128px)",
            lineHeight: 0.95,
            marginBottom: 24,
            maxWidth: 1100,
          }}
        >
          Retain more listings.
        </h1>
        <p
          style={{
            fontFamily: "var(--le-font-sans)",
            fontSize: 17,
            maxWidth: 520,
            color: "rgba(255,255,255,0.75)",
            marginBottom: 40,
            lineHeight: 1.55,
          }}
        >
          Upload photos. Receive a directed, edited, cinematic listing video in 24 hours. No crew, no scheduling, no post-production.
        </p>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Link to="/upload" className="le-btn le-btn-primary" style={{ padding: "12px 22px", fontSize: 14 }}>
            Start a video →
          </Link>
          <Link to="/login" style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, textDecoration: "underline", textUnderlineOffset: 6 }}>
            Sign in to your account →
          </Link>
        </div>
      </div>
    </section>
  );
}
