import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/app/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-hodlr-blue text-white hover:bg-hodlr-blue-dark hover:scale-[1.02] hover:shadow-glow active:scale-[0.98]",
        secondary:
          "bg-hodlr-navy text-white hover:bg-opacity-90 hover:scale-[1.02] active:scale-[0.98]",
        accent:
          "bg-hodlr-orange text-white hover:bg-hodlr-orange-dark hover:scale-[1.02] hover:shadow-glow-accent active:scale-[0.98]",
        lime:
          "bg-[#0B0C0E] border border-[#C6FF3A] text-[#C6FF3A] hover:bg-[#C6FF3A]/10 hover:scale-[1.02] hover:shadow-glow-lime active:scale-[0.98]",
        outline:
          "border border-border bg-transparent hover:bg-muted hover:scale-[1.02] active:scale-[0.98]",
        ghost:
          "hover:bg-muted hover:text-foreground",
        link:
          "text-hodlr-blue underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-6 py-2",
        sm: "h-9 px-4 text-xs",
        lg: "h-14 px-8 text-base",
        xl: "h-16 px-10 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
