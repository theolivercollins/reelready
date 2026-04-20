import * as React from "react";

export type LEBadgeTone = "neutral" | "accent" | "success" | "warn" | "danger" | "info";

type Props = {
  tone?: LEBadgeTone;
  dot?: boolean;
  style?: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
};

const TONE_MAP: Record<
  LEBadgeTone,
  { bg: string; fg: string; dot: string }
> = {
  neutral: { bg: "var(--le-bg-sunken)", fg: "var(--le-text-muted)", dot: "var(--le-text-muted)" },
  accent: { bg: "var(--le-accent-soft)", fg: "var(--le-accent-text)", dot: "var(--le-accent)" },
  success: { bg: "var(--le-success-soft)", fg: "var(--le-success)", dot: "var(--le-success)" },
  warn: { bg: "var(--le-warn-soft)", fg: "var(--le-warn)", dot: "var(--le-warn)" },
  danger: { bg: "var(--le-danger-soft)", fg: "var(--le-danger)", dot: "var(--le-danger)" },
  info: { bg: "var(--le-info-soft)", fg: "var(--le-info)", dot: "var(--le-info)" },
};

export function LEBadge({ tone = "neutral", dot = false, style, className, children }: Props) {
  const t = TONE_MAP[tone];
  return (
    <span
      className={`le-badge${className ? ` ${className}` : ""}`}
      style={{ background: t.bg, color: t.fg, ...style }}
    >
      {dot && <span className="le-badge-dot" style={{ background: t.dot }} />}
      {children}
    </span>
  );
}

export type StatusPillKind = "pass" | "review" | "generating" | "queued";

const STATUS_MAP: Record<StatusPillKind, { c: string; l: string }> = {
  pass: { c: "oklch(0.6 0.15 155)", l: "QC Pass" },
  review: { c: "oklch(0.62 0.2 25)", l: "Needs review" },
  generating: { c: "oklch(0.62 0.15 240)", l: "Generating" },
  queued: { c: "var(--le-text-faint)", l: "Queued" },
};

export function StatusPill({
  status,
  label,
}: {
  status: StatusPillKind;
  label?: string;
}) {
  const m = STATUS_MAP[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 10,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        fontWeight: 500,
        color: m.c,
      }}
    >
      <span
        className={status === "generating" ? "le-pulse" : ""}
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: m.c,
        }}
      />
      {label ?? m.l}
    </span>
  );
}
