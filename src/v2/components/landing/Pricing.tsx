import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPricingTiers, type PricingTier } from "@/v2/data/pricing";

export function Pricing() {
  const [tiers, setTiers] = useState<PricingTier[]>([]);

  useEffect(() => {
    getPricingTiers().then(setTiers);
  }, []);

  return (
    <section
      id="pricing"
      data-theme="light"
      style={{ background: "var(--le-bg)", color: "var(--le-text)", padding: "140px 48px" }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div className="le-eyebrow" style={{ marginBottom: 24 }}>— PRICING</div>
        <h2 className="le-display" style={{ fontSize: "clamp(48px, 6vw, 96px)", lineHeight: 1, margin: "0 0 64px" }}>
          Priced per listing.
        </h2>
        <div className="le-pricing-grid">
          {tiers.map(t => (
            <div
              key={t.id}
              className="le-card"
              style={{
                padding: 32,
                borderColor: t.isLead ? "var(--le-text)" : undefined,
                borderWidth: t.isLead ? 1.5 : 1,
              }}
            >
              <div className="le-eyebrow" style={{ marginBottom: 12 }}>{t.name}</div>
              <div className="le-display" style={{ fontSize: 56, lineHeight: 1, marginBottom: 8 }}>
                {t.priceUsd > 0 ? `$${t.priceUsd.toLocaleString()}` : "Talk"}
              </div>
              <div style={{ fontSize: 14, color: "var(--le-text-muted)", marginBottom: 24 }}>{t.tagline}</div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px", display: "flex", flexDirection: "column", gap: 8 }}>
                {t.features.map(f => (
                  <li key={f} style={{ fontSize: 14, color: "var(--le-text-muted)", fontFamily: "var(--le-font-sans)" }}>
                    — {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/upload"
                className={`le-btn ${t.isLead ? "le-btn-primary" : "le-btn-ghost"}`}
                style={{ width: "100%", padding: "10px 16px", fontSize: 13 }}
              >
                {t.priceUsd > 0 ? "Get started →" : "Contact sales →"}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
