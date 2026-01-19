import * as React from "react";
import { cn } from "@/app/lib/utils";

interface IntegrationCardProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  description: string;
  logo?: React.ReactNode;
  href?: string;
}

const IntegrationCard = React.forwardRef<HTMLDivElement, IntegrationCardProps>(
  ({ className, name, description, logo, href, ...props }, ref) => {
    const Wrapper = href ? "a" : "div";
    const wrapperProps = href ? { href, target: "_blank", rel: "noopener noreferrer" } : {};

    return (
      <Wrapper
        {...wrapperProps}
        className={cn(
          "group flex flex-col gap-4 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition-all duration-200 hover-shimmer hover:bg-white/10",
          href && "cursor-pointer",
          className
        )}
      >
        <div
          ref={ref}
          {...props}
        >
          {logo && (
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
              {logo}
            </div>
          )}
          <h3 className="text-lg font-semibold text-white">{name}</h3>
          <p className="mt-2 text-sm text-white/60 leading-relaxed">{description}</p>
        </div>
      </Wrapper>
    );
  }
);
IntegrationCard.displayName = "IntegrationCard";

export { IntegrationCard };
