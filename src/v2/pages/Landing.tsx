import "@/v2/styles/v2.css";
import { Nav } from "@/v2/components/landing/Nav";
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
  return (
    <div
      data-testid="v2-landing-root"
      data-v2-root
      className="le-root"
      data-theme={theme}
      style={{ minHeight: "100vh", background: "var(--le-bg)" }}
    >
      <div className="le-midnight-wash" data-theme="dark" style={{ position: "relative" }}>
        <Nav />
        <Hero />
      </div>
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
