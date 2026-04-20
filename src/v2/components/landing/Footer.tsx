export function Footer() {
  return (
    <footer
      style={{
        background: "transparent",
        color: "rgba(255,255,255,0.62)",
        padding: "40px 48px",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        fontSize: 13,
        fontFamily: "var(--le-font-sans)",
      }}
    >
      <div style={{ maxWidth: 1440, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
        <div className="le-display" style={{ fontSize: 18, color: "#fff" }}>
          Listing <em>Elevate</em>
        </div>
        <nav style={{ display: "flex", gap: 24 }}>
          <a href="#process" style={{ color: "rgba(255,255,255,0.62)" }}>Process</a>
          <a href="#showcase" style={{ color: "rgba(255,255,255,0.62)" }}>Showcase</a>
          <a href="#pricing" style={{ color: "rgba(255,255,255,0.62)" }}>Pricing</a>
          <a href="#faq" style={{ color: "rgba(255,255,255,0.62)" }}>FAQ</a>
        </nav>
        <div>© 2026 Listing Elevate, Inc.</div>
      </div>
    </footer>
  );
}
