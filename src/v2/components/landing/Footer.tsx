export function Footer() {
  return (
    <footer
      data-theme="light"
      style={{
        background: "var(--le-bg)",
        color: "var(--le-text-muted)",
        padding: "40px 48px",
        borderTop: "1px solid var(--le-border)",
        fontSize: 13,
        fontFamily: "var(--le-font-sans)",
      }}
    >
      <div style={{ maxWidth: 1440, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
        <div className="le-display" style={{ fontSize: 18, color: "var(--le-text)" }}>
          Listing <em>Elevate</em>
        </div>
        <nav style={{ display: "flex", gap: 24 }}>
          <a href="#process">Process</a>
          <a href="#showcase">Showcase</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
        </nav>
        <div>© 2026 Listing Elevate, Inc.</div>
      </div>
    </footer>
  );
}
