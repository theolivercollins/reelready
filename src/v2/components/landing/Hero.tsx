import { Link } from "react-router-dom";

export function Hero() {
  return (
    <section
      style={{
        position: "relative",
        minHeight: "72vh",
        padding: "120px 48px 80px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        maxWidth: 1440,
        margin: "0 auto",
        color: "#fff",
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
    </section>
  );
}
