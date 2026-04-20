import type { HTMLAttributes, ReactNode } from "react";

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "light" | "dark";
  children: ReactNode;
}

export function GlassPanel({ variant = "light", className = "", children, ...rest }: GlassPanelProps) {
  const base = variant === "dark" ? "le-glass-dark" : "le-glass";
  return (
    <div className={`${base} ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}
