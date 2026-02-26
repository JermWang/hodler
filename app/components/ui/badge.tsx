import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/app/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-hodlr-blue/10 text-hodlr-blue",
        secondary:
          "bg-hodlr-navy/10 text-hodlr-navy",
        accent:
          "bg-hodlr-orange/10 text-hodlr-orange",
        success:
          "bg-hodlr-lime/10 text-hodlr-lime",
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
