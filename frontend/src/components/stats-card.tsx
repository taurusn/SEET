import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  variant?: "default" | "warning" | "success" | "danger";
}

const variants = {
  default: "bg-primary/10 text-primary",
  warning: "bg-warning/10 text-warning",
  success: "bg-success/10 text-success",
  danger: "bg-danger/10 text-danger",
};

export function StatsCard({ label, value, icon: Icon, variant = "default" }: StatsCardProps) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 md:p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs md:text-sm text-muted-foreground truncate">{label}</p>
          <p className="text-xl md:text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className={cn("w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center flex-shrink-0", variants[variant])}>
          <Icon className="w-5 h-5 md:w-6 md:h-6" />
        </div>
      </div>
    </div>
  );
}
