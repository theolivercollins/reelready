import { Link } from "react-router-dom";

interface WordmarkProps {
  to?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "full" | "mark";
}

const sizeMap = {
  sm: { mark: "h-5 w-5", text: "text-sm", gap: "gap-2" },
  md: { mark: "h-6 w-6", text: "text-base", gap: "gap-2.5" },
  lg: { mark: "h-8 w-8", text: "text-xl", gap: "gap-3" },
};

/**
 * Listing Elevate wordmark.
 * Mark: a stacked geometric stair ("elevate") inside a square.
 * Wordmark: two semibold words divided by an accent period.
 */
export function Wordmark({ to = "/", className = "", size = "md", variant = "full" }: WordmarkProps) {
  const s = sizeMap[size];
  const inner = (
    <span className={`inline-flex items-center ${s.gap} ${className}`}>
      <span className={`relative inline-block ${s.mark}`} aria-hidden>
        <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="1" y="1" width="22" height="22" stroke="currentColor" strokeWidth="1.5" />
          <rect x="5" y="14" width="3" height="5" fill="currentColor" />
          <rect x="10.5" y="10" width="3" height="9" fill="currentColor" />
          <rect x="16" y="6" width="3" height="13" fill="currentColor" />
        </svg>
      </span>
      {variant === "full" && (
        <span className={`font-semibold tracking-[-0.01em] ${s.text} leading-none`}>
          Listing<span className="text-accent">.</span>Elevate
        </span>
      )}
    </span>
  );

  if (to) {
    return (
      <Link to={to} className="inline-flex items-center text-foreground transition-opacity hover:opacity-80">
        {inner}
      </Link>
    );
  }
  return inner;
}
