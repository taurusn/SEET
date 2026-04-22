"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/lib/auth";
import { api } from "@/lib/api";
import {
  LayoutDashboard,
  Store,
  PlusCircle,
  Settings,
  LogOut,
  Inbox,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/shops", label: "Shops", icon: Store },
  { href: "/shops/onboard", label: "New Shop", icon: PlusCircle },
  { href: "/moderation", label: "Moderation", icon: Inbox, showBadge: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

const PENDING_POLL_MS = 10_000;

export function AdminSidebar() {
  const pathname = usePathname();
  const { admin, logout } = useAdmin();
  const [pendingCount, setPendingCount] = useState(0);

  // Poll the moderation queue size for the badge. Cheap server-side (an
  // indexed count) and 10s feels responsive without hammering the API.
  useEffect(() => {
    let cancelled = false;

    const tick = () => {
      api
        .get<{ count: number }>("/api/v1/admin/messages/pending/count")
        .then((data) => {
          if (!cancelled) setPendingCount(data.count);
        })
        .catch(() => {
          // Silent — this is decorative telemetry, not critical path.
        });
    };

    tick();
    const interval = setInterval(tick, PENDING_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-56 bg-sidebar text-sidebar-foreground flex-col">
      <div className="p-4 border-b border-white/10">
        <h2 className="text-lg font-bold">SEET Admin</h2>
        {admin && (
          <p className="text-xs text-sidebar-foreground/60 mt-0.5 truncate">
            {admin.name}
          </p>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/" || pathname === ""
              : pathname.startsWith(item.href);
          const showBadge =
            "showBadge" in item && item.showBadge && pendingCount > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-active text-white"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-white/5"
              )}
            >
              <item.icon size={18} />
              <span className="flex-1">{item.label}</span>
              {showBadge && (
                <span
                  className="px-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-warning text-white text-[10px] font-bold leading-none"
                  aria-label={`${pendingCount} pending`}
                >
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/10">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-white/5 transition-colors w-full"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </aside>
  );
}
