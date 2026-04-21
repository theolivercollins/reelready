import { Link, useNavigate } from "react-router-dom";
import { LELogoMark } from "@/v2/components/primitives/LELogoMark";
import { LEIcon } from "@/v2/components/primitives/LEIcon";
import { useAuth } from "@/lib/auth";
import { useLoginDialog } from "@/v2/components/auth/LoginDialogContext";

export interface SiteNavProps {
  /**
   * When true (default), show the anchor-link row (Process/Showcase/Pricing/FAQ).
   * Pages without those sections pass `false` to hide them.
   */
  showSectionLinks?: boolean;
}

const navLinkStyle = {
  color: "inherit",
  textDecoration: "none",
} as const;

/**
 * SiteNav — shared top navigation primitive.
 *
 * Fixed to the viewport top (zIndex 20), dark gradient scrim +
 * backdrop blur so it stays legible over any hero image. Left: logo
 * mark linking home. Center: optional section anchors. Right: sign-in
 * affordances (or account/dashboard/sign-out when authenticated) plus
 * a visual theme-toggle sun button (not wired).
 *
 * Extracted from the original inline HeroNav in landing/Hero.tsx.
 */
export function SiteNav({ showSectionLinks = true }: SiteNavProps) {
  const { user, profile, signOut } = useAuth();
  const { openLogin } = useLoginDialog();
  const navigate = useNavigate();

  const isAdmin = profile?.role === "admin";

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

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
        to="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          textDecoration: "none",
        }}
      >
        <LELogoMark size={38} variant="light" />
      </Link>

      {showSectionLinks ? (
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
      ) : (
        <span aria-hidden />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
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

        {user ? (
          <>
            <Link
              to="/account"
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.92)",
                textDecoration: "none",
                fontFamily: "var(--le-font-sans)",
              }}
            >
              Account
            </Link>
            {isAdmin && (
              <Link
                to="/dashboard"
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.92)",
                  textDecoration: "none",
                  fontFamily: "var(--le-font-sans)",
                }}
              >
                Dashboard
              </Link>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.65)",
                fontFamily: "var(--le-font-sans)",
              }}
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={openLogin}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontSize: 13,
                color: "rgba(255,255,255,0.85)",
                textDecoration: "none",
                fontFamily: "var(--le-font-sans)",
              }}
            >
              Sign in
            </button>
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
          </>
        )}
      </div>
    </nav>
  );
}
