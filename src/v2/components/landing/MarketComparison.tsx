import { useEffect, useState } from "react";
import { getMarketStats, type MarketStatRow } from "@/v2/data/marketStats";
import { AnimatedBar } from "@/v2/components/primitives/AnimatedBar";
import { AnimatedNumber } from "@/v2/components/primitives/AnimatedNumber";
import { useInViewOnce } from "@/v2/hooks/useInViewOnce";
import { usePrefersReducedMotion } from "@/v2/hooks/usePrefersReducedMotion";

export function MarketComparison() {
  const [rows, setRows] = useState<MarketStatRow[]>([]);

  useEffect(() => {
    getMarketStats().then(setRows);
  }, []);

  return (
    <section
      id="compare"
      style={{
        background: "var(--le-bg)",
        color: "var(--le-text)",
        padding: "140px 48px",
        maxWidth: 1440,
        margin: "0 auto",
      }}
      data-theme="light"
    >
      <div className="le-eyebrow" style={{ marginBottom: 24 }}>— HOW WE COMPARE</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 80, gap: 48 }}>
        <h2 className="le-display" style={{ fontSize: "clamp(48px, 6vw, 96px)", lineHeight: 1, margin: 0, maxWidth: 800 }}>
          The market average,
          <br />
          and then us.
        </h2>
        <p style={{ maxWidth: 360, fontSize: 14, color: "var(--le-text-muted)", lineHeight: 1.6, fontFamily: "var(--le-font-sans)" }}>
          Every number independently sourced. We'll replace these with your numbers the day you run a listing with us.
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        {rows.map((row, i) => (
          <MarketComparisonRow key={row.id} row={row} index={i} />
        ))}
      </div>
    </section>
  );
}

function MarketComparisonRow({ row, index }: { row: MarketStatRow; index: number }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const reducedMotion = usePrefersReducedMotion();
  const animate = inView && !reducedMotion;

  const max = Math.max(row.market.numericMax ?? 0, row.elevate.numericMax ?? 0, 1);
  const marketPct = ((row.market.numericMax ?? 0) / max) * 100;
  const elevatePct = ((row.elevate.numericMax ?? 0) / max) * 100;

  return (
    <div
      ref={ref}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(220px, 1fr) 2fr auto",
        gap: 32,
        alignItems: "center",
        paddingBottom: 32,
        borderBottom: "1px solid var(--le-border)",
      }}
    >
      <div>
        <div className="le-eyebrow" style={{ marginBottom: 8 }}>0{index + 1}</div>
        <h3 className="le-display" style={{ fontSize: 22, margin: 0 }}>{row.dimension}</h3>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span className="le-mono" style={{ fontSize: 11, color: "var(--le-text-muted)", width: 80, textTransform: "uppercase", letterSpacing: "0.14em" }}>
            Market
          </span>
          <AnimatedBar fillPercent={marketPct} animate={animate} variant="market" label={`Market ${row.dimension}`} />
          <span style={{ fontSize: 14, color: "var(--le-text-muted)", width: 180, textAlign: "right" }}>
            <AnimatedNumber value={row.market.numericMax ?? 0} label={row.market.label} animate={animate} />
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span className="le-mono" style={{ fontSize: 11, color: "var(--le-text)", width: 80, textTransform: "uppercase", letterSpacing: "0.14em" }}>
            Elevate
          </span>
          <AnimatedBar fillPercent={elevatePct} animate={animate} variant="elevate" label={`Elevate ${row.dimension}`} delayMs={150} />
          <span style={{ fontSize: 14, color: "var(--le-text)", width: 180, textAlign: "right", fontWeight: 500 }}>
            <AnimatedNumber value={row.elevate.numericMax ?? 0} label={row.elevate.label} animate={animate} delayMs={150} />
          </span>
        </div>
      </div>
      <a
        href={row.source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="le-mono"
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "var(--le-text-faint)",
          maxWidth: 180,
          textAlign: "right",
          textDecoration: "none",
          lineHeight: 1.4,
        }}
      >
        Source: {row.source.label} ↗
      </a>
    </div>
  );
}
