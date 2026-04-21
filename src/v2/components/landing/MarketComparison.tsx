import CostComparison from "@/v2/components/landing/market/CostComparison";
import MarketGap from "@/v2/components/landing/market/MarketGap";
import TurnaroundSpeed from "@/v2/components/landing/market/TurnaroundSpeed";
import ConsumerDemand from "@/v2/components/landing/market/ConsumerDemand";
import MarketDomination from "@/v2/components/landing/market/MarketDomination";
import PricingCalculator from "@/v2/components/landing/market/PricingCalculator";
import { motion } from "framer-motion";

/**
 * MarketComparison — Win / Retain / Sell / Math data-visualization stack.
 *
 * Structure ported from the Manus "Market Intelligence" design bundle.
 * Five stat visualizations organized into three pitch prongs (Win more
 * listings · Retain every client · Sell faster) plus an interactive
 * pricing calculator. Each visualization is scroll-triggered and uses
 * our v2 midnight palette.
 */

const LINE = "oklch(1 0 0 / 9%)";
const WHITE = "oklch(0.97 0.005 240)";
const DIM = "oklch(0.45 0.01 240)";

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-6 sm:px-12 py-6 flex items-center gap-3">
      <div className="w-2 h-2" style={{ background: WHITE }} />
      <span
        className="text-[12px] uppercase font-semibold"
        style={{ color: WHITE, letterSpacing: "0.2em" }}
      >
        {label}
      </span>
      <div className="flex-1 h-px ml-2" style={{ background: LINE }} />
    </div>
  );
}

export function MarketComparison() {
  return (
    <section id="compare" style={{ background: "var(--le-bg)", color: "#fff" }}>
      {/* Intro headline */}
      <div
        className="px-6 sm:px-12 pt-20 sm:pt-28 pb-12 sm:pb-16"
        style={{ borderBottom: `1px solid ${LINE}` }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-4xl"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-5 h-px" style={{ background: WHITE }} />
            <span
              className="text-[11px] uppercase"
              style={{ color: DIM, letterSpacing: "0.22em" }}
            >
              The data
            </span>
          </div>
          <h2
            className="font-bold leading-[0.94] mb-6"
            style={{
              fontFamily: "var(--le-font-sans)",
              fontSize: "clamp(2.6rem, 7vw, 5.2rem)",
              color: WHITE,
              letterSpacing: "-0.035em",
            }}
          >
            Why agents who use Listing Elevate<br />
            dominate their markets.
          </h2>
          <p
            className="text-[15px] sm:text-[17px] max-w-2xl"
            style={{ color: DIM, lineHeight: 1.6 }}
          >
            Five stats from independent industry sources — and what they mean for your listings.
          </p>
        </motion.div>
      </div>

      {/* Win */}
      <div style={{ borderBottom: `1px solid ${LINE}` }}>
        <SectionHeader label="Win more listings" />
        <CostComparison />
        <MarketGap />
      </div>

      {/* Retain */}
      <div style={{ borderBottom: `1px solid ${LINE}` }}>
        <SectionHeader label="Retain every client" />
        <TurnaroundSpeed />
        <ConsumerDemand />
      </div>

      {/* Sell */}
      <div style={{ borderBottom: `1px solid ${LINE}` }}>
        <SectionHeader label="Sell faster" />
        <MarketDomination />
      </div>

      {/* The math */}
      <div>
        <SectionHeader label="The math" />
        <div className="px-6 sm:px-12 pb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            <h3
              className="font-bold leading-none mb-3"
              style={{
                fontFamily: "var(--le-font-sans)",
                fontSize: "clamp(2.2rem, 6vw, 4.4rem)",
                color: WHITE,
                letterSpacing: "-0.035em",
              }}
            >
              Run the numbers.
            </h3>
            <p
              className="text-[15px] sm:text-[17px] max-w-xl"
              style={{ color: DIM, lineHeight: 1.6 }}
            >
              See exactly what Listing Elevate costs relative to your commission — then decide.
            </p>
          </motion.div>
        </div>
        <PricingCalculator />
      </div>
    </section>
  );
}
