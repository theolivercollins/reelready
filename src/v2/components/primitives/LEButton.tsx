import { type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";

type Variant = "primary" | "ghost";
type Size = "sm" | "md" | "lg";

const SIZE_STYLE: Record<Size, CSSProperties> = {
  sm: { padding: "8px 16px", fontSize: 13 },
  md: { padding: "12px 20px", fontSize: 14 },
  lg: { padding: "14px 24px", fontSize: 14 },
};

function base(variant: Variant): CSSProperties {
  return {
    borderRadius: 4,
    fontWeight: 500,
    letterSpacing: "-0.005em",
    fontFamily: "var(--le-font-sans)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    cursor: "pointer",
    textDecoration: "none",
    background: variant === "primary" ? "#fff" : "transparent",
    color: variant === "primary" ? "#07080c" : "#fff",
    border: variant === "primary" ? "none" : "1px solid rgba(220,230,255,0.18)",
  };
}

export interface LEButtonStyleProps {
  variant?: Variant;
  size?: Size;
  style?: CSSProperties;
}

export function leButtonStyle({ variant = "primary", size = "md", style }: LEButtonStyleProps = {}): CSSProperties {
  return { ...base(variant), ...SIZE_STYLE[size], ...style };
}

type BaseProps = LEButtonStyleProps & { children: ReactNode };

type LinkProps = BaseProps & { to: string } & Omit<ComponentProps<typeof Link>, "to" | "style" | "children">;
export function LEButtonLink({ variant, size, style, to, children, ...rest }: LinkProps) {
  return <Link to={to} style={leButtonStyle({ variant, size, style })} {...rest}>{children}</Link>;
}

type ButtonProps = BaseProps & Omit<ComponentProps<"button">, "style" | "children">;
export function LEButton({ variant, size, style, children, ...rest }: ButtonProps) {
  const computed = leButtonStyle({ variant, size, style });
  // Honour disabled visual affordance
  const finalStyle: CSSProperties = rest.disabled
    ? { ...computed, background: variant === "ghost" ? "transparent" : "rgba(255,255,255,0.3)", color: variant === "ghost" ? "rgba(255,255,255,0.35)" : "#07080c", cursor: "not-allowed" }
    : computed;
  return <button style={finalStyle} {...rest}>{children}</button>;
}
