import * as React from "react";
import { cn } from "@/app/lib/utils";

interface StatBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string | number;
  label: string;
  prefix?: string;
  suffix?: string;
  variant?: "default" | "light" | "dark";
}

const StatBlock = React.forwardRef<HTMLDivElement, StatBlockProps>(
  ({ className, value, label, prefix, suffix, variant = "default", ...props }, ref) => {
    const variantStyles = {
      default: "text-foreground",
      light: "text-foreground",
      dark: "text-white",
    };

    return (
      <div
        ref={ref}
        className={cn("flex flex-col gap-1", variantStyles[variant], className)}
        {...props}
      >
        <div className="text-heading-2 font-bold tabular-nums">
          {prefix && <span className="text-foreground-muted">{prefix}</span>}
          {value}
          {suffix && <span className="text-foreground-muted text-heading-4">{suffix}</span>}
        </div>
        <div className={cn(
          "text-caption uppercase tracking-wider",
          variant === "dark" ? "text-white/60" : "text-foreground-muted"
        )}>
          {label}
        </div>
      </div>
    );
  }
);
StatBlock.displayName = "StatBlock";

export { StatBlock };
