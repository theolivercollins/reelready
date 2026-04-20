import { Link } from "react-router-dom";

export function FounderOffer() {
  return (
    <section
      data-theme="light"
      style={{
        background: "var(--le-bg-sunken)",
        color: "var(--le-text)",
        padding: "24px 48px",
        borderTop: "1px solid var(--le-border)",
        borderBottom: "1px solid var(--le-border)",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span className="le-mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: "var(--le-text-muted)" }}>
            Founding agents
          </span>
          <span style={{ fontFamily: "var(--le-font-sans)", fontSize: 15 }}>
            50% off your first three videos. First 50 signups.
          </span>
        </div>
        <Link to="/upload" className="le-btn le-btn-primary" style={{ padding: "8px 16px", fontSize: 13 }}>
          Claim spot →
        </Link>
      </div>
    </section>
  );
}
