import { Link } from "react-router-dom";

export function Nav() {
  return (
    <nav
      className="le-glass-dark"
      style={{
        position: "sticky",
        top: 16,
        margin: "16px auto 0",
        maxWidth: 1200,
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        borderRadius: 999,
        zIndex: 20,
      }}
    >
      <Link to="/v2" className="le-display" style={{ fontSize: 20, color: "var(--le-text)" }}>
        Listing <em style={{ fontStyle: "italic" }}>Elevate</em>
      </Link>
      <div style={{ display: "flex", gap: 20, fontFamily: "var(--le-font-sans)", fontSize: 13, letterSpacing: "0.02em" }}>
        <a href="#process" style={{ color: "var(--le-text-muted)" }}>Process</a>
        <a href="#showcase" style={{ color: "var(--le-text-muted)" }}>Showcase</a>
        <a href="#pricing" style={{ color: "var(--le-text-muted)" }}>Pricing</a>
        <a href="#faq" style={{ color: "var(--le-text-muted)" }}>FAQ</a>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Link to="/login" className="le-btn le-btn-ghost" style={{ padding: "7px 14px", fontSize: 13 }}>
          Sign in
        </Link>
        <Link to="/upload" className="le-btn le-btn-primary" style={{ padding: "7px 14px", fontSize: 13 }}>
          Get started →
        </Link>
      </div>
    </nav>
  );
}
