import { Link } from "react-router-dom";

export function FinalCTA() {
  return (
    <section
      className="le-midnight-wash"
      data-theme="dark"
      style={{
        padding: "140px 48px",
        color: "#fff",
        textAlign: "center",
      }}
    >
      <h2 className="le-display" style={{ fontSize: "clamp(56px, 7vw, 112px)", lineHeight: 1, margin: "0 0 40px" }}>
        Elevate your next listing.
      </h2>
      <Link to="/upload" className="le-btn le-btn-primary" style={{ padding: "14px 28px", fontSize: 15 }}>
        Start a video →
      </Link>
    </section>
  );
}
