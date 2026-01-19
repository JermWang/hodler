import * as React from "react";
import { cn } from "@/app/lib/utils";
import { LucideIcon } from "lucide-react";

interface FeatureCardProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title: string;
  description: string;
  iconBgColor?: string;
}

const FeatureCard = React.forwardRef<HTMLDivElement, FeatureCardProps>(
  ({ className, icon: Icon, title, description, iconBgColor = "bg-amplifi-blue/10", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "group flex flex-col gap-4 rounded-xl border border-border bg-card p-6 transition-all duration-200 hover:shadow-card-hover hover:-translate-y-1",
          className
        )}
        {...props}
      >
        {Icon && (
          <div className={cn(
            "flex h-12 w-12 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110",
            iconBgColor
          )}>
            <Icon className="h-6 w-6 text-amplifi-blue" />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <h3 className="text-heading-4 font-semibold">{title}</h3>
          <p className="text-body text-foreground-muted leading-relaxed">{description}</p>
        </div>
      </div>
    );
  }
);
FeatureCard.displayName = "FeatureCard";

export { FeatureCard };
