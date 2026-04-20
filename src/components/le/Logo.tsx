import * as React from "react";
import logoLight from "@/assets/le/logo.png";
import logoDark from "@/assets/le/logo-white.png";

type LogoMarkProps = {
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
};

export function LELogoMark({ size = 24, color = "currentColor", className, style }: LogoMarkProps) {
  const isLight =
    color === "#fff" ||
    (typeof color === "string" &&
      (color.toLowerCase() === "white" || color.startsWith("rgba(255")));
  const src = isLight ? logoDark : logoLight;
  const aspect = 2048 / 584;
  return (
    <img
      src={src}
      alt="Listing Elevate"
      className={className}
      style={{
        height: size * 1.1,
        width: size * 1.1 * aspect,
        display: "inline-block",
        verticalAlign: "middle",
        ...style,
      }}
    />
  );
}

type LogoProps = {
  size?: number;
  color?: string;
  showWord?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export function LELogo({ size = 16, color, showWord = true, className, style }: LogoProps) {
  const c = color || "var(--le-text)";
  const accent = "var(--le-accent)";
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, color: c, ...style }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="2" y="13" width="4" height="9" rx="1" fill={accent} />
        <rect x="8" y="8" width="4" height="14" rx="1" fill={accent} opacity="0.75" />
        <rect x="14" y="3" width="4" height="19" rx="1" fill={accent} opacity="0.5" />
        <path
          d="M20.5 3.5 L23 6 M20.5 3.5 L18 6 M20.5 3.5 V10"
          stroke={accent}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      {showWord && (
        <span
          style={{
            fontFamily: "var(--le-font-display)",
            fontSize: size * 1.15,
            letterSpacing: "-0.02em",
            color: c,
            fontWeight: 400,
          }}
        >
          Listing{" "}
          <em style={{ color: accent, fontStyle: "italic" }}>Elevate</em>
        </span>
      )}
    </span>
  );
}
