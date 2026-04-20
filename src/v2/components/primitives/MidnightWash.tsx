import type { HTMLAttributes, ReactNode } from "react";

interface MidnightWashProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function MidnightWash({ className = "", children, ...rest }: MidnightWashProps) {
  return (
    <div className={`le-midnight-wash ${className}`.trim()} data-theme="dark" {...rest}>
      {children}
    </div>
  );
}
