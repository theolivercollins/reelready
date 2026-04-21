import { Link } from "react-router-dom";
import { LELogoMark } from "@/v2/components/primitives/LELogoMark";
import { LEIcon } from "@/v2/components/primitives/LEIcon";
import { LECyclingWord } from "@/v2/components/primitives/LECyclingWord";

// Full-bleed luxury-interior reference — matches landing.jsx line 7.
const HERO_IMAGE =
  "https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=2400&q=85";

/**
 * Hero — pixel-faithful port of landing.jsx lines 29-240.
 *
 * Nav is anchored to the viewport top with `position: fixed` so it
 * persists across the whole page (user request) while matching the
 * design's in-hero visual treatment (glass background, white text,
 * sharp-corner buttons). Hero is 820px tall and the nav sits on top of
 * the hero photo — 48px left/right gutter, 26px vertical padding.
 */
export function Hero() {
  return (
    <section
      style={{
        position: "relative",
        height: 574,
        overflow: "hidden",
        background: "#000",
      }}
    >
      {/* Background image */}
      <img
        src={HERO_IMAGE}
        alt=""
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "brightness(0.62) saturate(1.05)",
        }}
      />

      {/* Legibility gradient — darkens top for nav, mid-airy, bottom for copy */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(5,7,14,0.85) 0%, rgba(5,7,14,0.15) 22%, rgba(5,7,14,0) 45%, rgba(5,7,14,0.35) 75%, rgba(5,7,14,0.7) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* NAV — fixed at viewport top, persists through the whole page. */}
      <HeroNav />

      {/* HERO COPY — vertically centered within the section */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          paddingLeft: 48,
          paddingRight: 48,
          paddingTop: 96,
          paddingBottom: 48,
          color: "#fff",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.75)",
            marginBottom: 28,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{
              width: 18,
              height: 1,
              background: "rgba(255,255,255,0.5)",
              display: "inline-block",
            }}
          />
          Listing Elevate · Cinematic · On demand
        </div>
        <h1
          style={{
            fontSize: "clamp(56px, 9vw, 104px)",
            lineHeight: 0.96,
            margin: 0,
            fontWeight: 500,
            letterSpacing: "-0.035em",
            maxWidth: 1100,
            fontFamily: "var(--le-font-sans)",
          }}
        >
          <LECyclingWord words={["Take", "Sell", "Retain"]} /> more listings.
        </h1>
        <p
          style={{
            fontSize: 18,
            lineHeight: 1.5,
            maxWidth: 520,
            marginTop: 28,
            color: "rgba(255,255,255,0.78)",
            fontWeight: 400,
            fontFamily: "var(--le-font-sans)",
          }}
        >
          Upload photos. Receive a directed, edited, cinematic listing video
          within 24&nbsp;hours. No crew, no scheduling, no post-production.
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 28,
            marginTop: 40,
          }}
        >
          <Link
            to="/upload"
            style={{
              background: "#fff",
              color: "#07080c",
              border: "none",
              padding: "16px 22px",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              letterSpacing: "-0.005em",
              borderRadius: 4,
              textDecoration: "none",
              fontFamily: "var(--le-font-sans)",
            }}
          >
            Start a video <LEIcon name="arrow" size={14} color="#07080c" />
          </Link>
          <Link
            to="/login"
            style={{
              fontSize: 14,
              color: "#fff",
              textDecoration: "underline",
              textUnderlineOffset: 4,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--le-font-sans)",
            }}
          >
            Sign in to your account
            <LEIcon name="arrowUpRight" size={12} color="#fff" />
          </Link>
        </div>
      </div>

    </section>
  );
}

/**
 * Hero nav — fixed at the viewport top. Visual language mirrors the
 * design bundle (landing.jsx lines 53-127): logo mark left, uppercase
 * tracked link row center, sharp-corner theme button + Sign in link +
 * white Get started button on the right. Theme button is visual only
 * (landing page is dark-only by user request).
 */
function HeroNav() {
  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "26px 48px",
        color: "#fff",
        zIndex: 20,
        // Subtle scrim so the nav stays legible once scrolled past the hero
        background:
          "linear-gradient(180deg, rgba(5,7,16,0.82) 0%, rgba(5,7,16,0.55) 65%, rgba(5,7,16,0) 100%)",
        backdropFilter: "blur(14px) saturate(1.2)",
        WebkitBackdropFilter: "blur(14px) saturate(1.2)",
      }}
    >
      <Link
        to="/v2"
        style={{
          display: "inline-flex",
          alignItems: "center",
          textDecoration: "none",
        }}
      >
        <LELogoMark size={38} variant="light" />
      </Link>

      <div
        style={{
          display: "flex",
          gap: 44,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.82)",
          fontFamily: "var(--le-font-sans)",
        }}
      >
        <a href="#process" style={navLinkStyle}>
          Process
        </a>
        <a href="#showcase" style={navLinkStyle}>
          Showcase
        </a>
        <a href="#pricing" style={navLinkStyle}>
          Pricing
        </a>
        <a href="#faq" style={navLinkStyle}>
          FAQ
        </a>
      </div>

      <div
        style={{ display: "flex", alignItems: "center", gap: 14 }}
      >
        <button
          type="button"
          aria-label="Toggle theme"
          style={{
            width: 34,
            height: 34,
            border: "1px solid rgba(255,255,255,0.22)",
            borderRadius: 6,
            background: "transparent",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <LEIcon name="sun" size={14} color="#fff" />
        </button>
        <Link
          to="/login"
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.85)",
            textDecoration: "none",
            fontFamily: "var(--le-font-sans)",
          }}
        >
          Sign in
        </Link>
        <Link
          to="/upload"
          style={{
            background: "#fff",
            color: "#07080c",
            border: "none",
            padding: "8px 16px",
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 500,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            letterSpacing: "-0.005em",
            textDecoration: "none",
            fontFamily: "var(--le-font-sans)",
          }}
        >
          Get started <LEIcon name="arrow" size={12} color="#07080c" />
        </Link>
      </div>
    </nav>
  );
}

const navLinkStyle = {
  color: "inherit",
  textDecoration: "none",
} as const;
