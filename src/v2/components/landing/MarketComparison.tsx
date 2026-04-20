import { useEffect, useState } from "react";
import { getMarketStats, type MarketStatRow } from "@/v2/data/marketStats";
import { SavingsReveal } from "@/v2/components/primitives/SavingsReveal";
import { RadialGauge } from "@/v2/components/primitives/RadialGauge";
import { DonutStat } from "@/v2/components/primitives/DonutStat";
import { DotGrid } from "@/v2/components/primitives/DotGrid";
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
        background: "transparent",
        color: "#fff",
        padding: "140px 48px",
        maxWidth: 1440,
        margin: "0 auto",
      }}
    >
      <div className="le-eyebrow" style={{ marginBottom: 24 }}>— HOW WE COMPARE</div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 120,
          gap: 48,
        }}
      >
        <h2
          className="le-display"
          style={{
            fontSize: "clamp(48px, 6vw, 96px)",
            lineHeight: 1,
            margin: 0,
            maxWidth: 800,
            color: "#fff",
          }}
        >
          The market average,
          <br />
          and then us.
        </h2>
        <p
          style={{
            maxWidth: 360,
            fontSize: 14,
            color: "rgba(255,255,255,0.7)",
            lineHeight: 1.6,
            fontFamily: "var(--le-font-sans)",
          }}
        >
          Every number independently sourced. We'll replace these with your numbers the day you run a listing with us.
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 120 }}>
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

  return (
    <div
      ref={ref}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(220px, 320px) 1fr",
        gap: 64,
        alignItems: "center",
        paddingBottom: 64,
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="le-eyebrow">0{index + 1}</div>
        <h3
          className="le-display"
          style={{
            fontSize: 28,
            margin: 0,
            color: "#fff",
            lineHeight: 1.15,
          }}
        >
          {row.dimension}
        </h3>
        <a
          href={row.source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="le-mono"
          style={{
            marginTop: 8,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: "rgba(255,255,255,0.4)",
            textDecoration: "none",
            lineHeight: 1.4,
            maxWidth: 280,
          }}
        >
          Source: {row.source.label} ↗
        </a>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-start", minHeight: 280 }}>
        <RowViz row={row} animate={animate} />
      </div>
    </div>
  );
}

function RowViz({ row, animate }: { row: MarketStatRow; animate: boolean }) {
  switch (row.id) {
    case "cost":
      return (
        <SavingsReveal
          marketLabel={row.market.label}
          marketMax={row.market.numericMax ?? 0}
          elevateLabel={row.elevate.label}
          elevateValue={row.elevate.numericMax ?? 0}
          animate={animate}
        />
      );
    case "turnaround": {
      // numericMax on this row represents hours directly (72 / 24).
      const marketHours = row.market.numericMax ?? 0;
      const elevateHours = row.elevate.numericMax ?? 0;
      return (
        <RadialGauge
          marketHours={marketHours}
          marketLabel={row.market.label}
          elevateHours={elevateHours}
          elevateLabel={row.elevate.label}
          animate={animate}
        />
      );
    }
    case "preference":
      return (
        <DonutStat
          percent={row.market.numericMax ?? 0}
          label={row.market.label}
          counterPercent={row.counterStat?.pct}
          counterLabel={row.counterStat?.label}
          animate={animate}
        />
      );
    case "demand":
      return (
        <DotGrid
          filled={row.market.numericMax ?? 0}
          total={100}
          label={row.market.label}
          animate={animate}
        />
      );
    default:
      return null;
  }
}
