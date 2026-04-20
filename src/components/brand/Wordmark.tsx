import { Link } from "react-router-dom";

interface WordmarkProps {
  to?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "full" | "mark";
}

const sizeMap = {
  sm: { mark: 16, text: 14, gap: 8 },
  md: { mark: 20, text: 17, gap: 10 },
  lg: { mark: 28, text: 22, gap: 12 },
};

/**
 * Listing Elevate wordmark — v3 editorial.
 * Mark: stacked geometric stair ("elevate") inside a square.
 * Wordmark: "Listing" in LE sans, italic serif "Elevate" in accent.
 */
export function Wordmark({ to = "/", className = "", size = "md", variant = "full" }: WordmarkProps) {
  const s = sizeMap[size];
  const inner = (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: s.gap,
        color: "var(--le-text)",
      }}
    >
      <span
        aria-hidden
        style={{ position: "relative", display: "inline-block", width: s.mark, height: s.mark, color: "var(--le-accent)" }}
      >
        <svg viewBox="0 0 24 24" style={{ width: "100%", height: "100%" }} fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="1" y="1" width="22" height="22" stroke="currentColor" strokeWidth="1.5" />
          <rect x="5" y="14" width="3" height="5" fill="currentColor" />
          <rect x="10.5" y="10" width="3" height="9" fill="currentColor" />
          <rect x="16" y="6" width="3" height="13" fill="currentColor" />
        </svg>
      </span>
      {variant === "full" && (
        <span
          style={{
            fontFamily: "var(--le-font-display)",
            fontSize: s.text,
            letterSpacing: "-0.02em",
            fontWeight: 400,
            lineHeight: 1,
          }}
        >
          Listing{" "}
          <em style={{ color: "var(--le-accent)", fontStyle: "italic" }}>Elevate</em>
        </span>
      )}
    </span>
  );

  if (to) {
    return (
      <Link
        to={to}
        style={{
          display: "inline-flex",
          alignItems: "center",
          textDecoration: "none",
          color: "var(--le-text)",
        }}
      >
        {inner}
      </Link>
    );
  }
  return inner;
}
