import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/app/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-amplifi-blue/10 text-amplifi-blue",
        secondary:
          "bg-amplifi-navy/10 text-amplifi-navy",
        accent:
          "bg-amplifi-orange/10 text-amplifi-orange",
        success:
          "bg-green-500/10 text-green-600",
        warning:
          "bg-yellow-500/10 text-yellow-600",
        destructive:
          "bg-red-500/10 text-red-600",
        outline:
          "border border-border text-foreground-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
