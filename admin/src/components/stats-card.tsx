import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  className?: string;
}

export function StatsCard({ label, value, icon: Icon, className }: StatsCardProps) {
  return (
    <div
      className={cn(
        "bg-card border border-border rounded-xl p-5 flex items-center gap-4",
        className
      )}
    >
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
