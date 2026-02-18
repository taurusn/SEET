import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function timeAgo(date: string | Date) {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "الآن";
  if (diffMins < 60) return `${diffMins} د`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} س`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} ي`;
}
