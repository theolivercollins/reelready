import "@/v2/styles/v2.css";
import { Hero } from "@/v2/components/landing/Hero";
import { Process } from "@/v2/components/landing/Process";
import { MarketComparison } from "@/v2/components/landing/MarketComparison";
import { SelectedWork } from "@/v2/components/landing/SelectedWork";
import { Pricing } from "@/v2/components/landing/Pricing";
import { FounderOffer } from "@/v2/components/landing/FounderOffer";
import { FAQ } from "@/v2/components/landing/FAQ";
import { FinalCTA } from "@/v2/components/landing/FinalCTA";
import { Footer } from "@/v2/components/landing/Footer";
import { V2ThemeProvider, useV2Theme } from "@/v2/lib/theme-context";

function LandingShell() {
  const { theme } = useV2Theme();
  // The landing is a sustained dark editorial surface. The root holds a
  // solid midnight base so every section inherits the dark palette without
  // needing its own background. The Hero sets its own full-bleed photo on
  // top of this base; all other sections sit directly on midnight.
  return (
    <div
      data-testid="v2-landing-root"
      data-v2-root
      className="le-root"
      data-theme={theme}
      style={{
        minHeight: "100vh",
        background: "var(--le-bg)",
        position: "relative",
      }}
    >
      <Hero />
      <Process />
      <MarketComparison />
      <SelectedWork />
      <Pricing />
      <FounderOffer />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}

export default function Landing() {
  return (
    <V2ThemeProvider>
      <LandingShell />
    </V2ThemeProvider>
  );
}
