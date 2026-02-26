"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  MessageSquare,
  Bell,
  Ticket,
  Settings,
  LogOut,
  FlaskConical,
} from "lucide-react";
import { useRef, useState, useCallback, useEffect } from "react";
import { api } from "@/lib/api";

const navItems = [
  { href: "/", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/conversations", label: "المحادثات", icon: MessageSquare },
  { href: "/playground", label: "ملعب الذكاء", icon: FlaskConical },
  { href: "/handoffs", label: "التحويلات", icon: Bell },
  { href: "/vouchers", label: "القسائم", icon: Ticket },
  { href: "/settings", label: "الإعدادات", icon: Settings },
];

export function Dock() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const [mouseX, setMouseX] = useState<number | null>(null);
  const [handoffCount, setHandoffCount] = useState(0);
  const dockRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  // Fetch active handoff count
  useEffect(() => {
    const fetchHandoffs = () => {
      api
        .get<{ active_handoffs: number }>("/api/v1/shop/stats")
        .then((data) => setHandoffCount(data.active_handoffs))
        .catch(() => {});
    };

    fetchHandoffs();
    const interval = setInterval(fetchHandoffs, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMouseX(e.clientX);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setMouseX(null);
  }, []);

  // On touch, auto-reset scale after 2 seconds since there's no mouseLeave
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (touchTimer.current) clearTimeout(touchTimer.current);
    const touch = e.touches[0];
    if (touch) setMouseX(touch.clientX);
    touchTimer.current = setTimeout(() => {
      setMouseX(null);
      touchTimer.current = null;
    }, 1000);
  }, []);

  const getScale = useCallback(
    (index: number) => {
      if (mouseX === null) return 1;
      const el = itemRefs.current[index];
      if (!el) return 1;

      const rect = el.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const distance = Math.abs(mouseX - center);
      const maxDist = 150;

      if (distance >= maxDist) return 1;
      return 1 + 0.2 * Math.cos((distance / maxDist) * (Math.PI / 2));
    },
    [mouseX]
  );

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50">
      <div
        ref={dockRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        className="dock-glass flex items-end gap-1 px-2.5 pb-2 pt-2 rounded-[22px]"
      >
        {navItems.map((item, i) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          const scale = getScale(i);
          const Icon = item.icon;
          const showBadge = item.href === "/handoffs" && handoffCount > 0;

          return (
            <div
              key={item.href}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              className="dock-item group relative flex flex-col items-center"
            >
              <span className="dock-tooltip">{item.label}</span>
              <Link href={item.href} className="block">
                <div
                  className={cn(
                    "dock-icon w-11 h-11 md:w-12 md:h-12 rounded-[13px] flex items-center justify-center relative",
                    isActive
                      ? "bg-primary text-white dock-icon-active"
                      : "bg-white/[0.08] text-white/60 hover:bg-white/[0.15] hover:text-white/90"
                  )}
                  style={{
                    transform: `scale(${scale})`,
                    transformOrigin: "bottom center",
                    transition:
                      mouseX !== null
                        ? "transform 0.15s cubic-bezier(0.33,1,0.68,1), background-color 0.2s, color 0.2s"
                        : "transform 0.3s cubic-bezier(0.33,1,0.68,1), background-color 0.2s, color 0.2s",
                  }}
                >
                  <Icon className="w-[22px] h-[22px]" />
                  {showBadge && (
                    <span className="dock-badge">
                      {handoffCount > 9 ? "9+" : handoffCount}
                    </span>
                  )}
                </div>
              </Link>
              <div
                className={cn(
                  "dock-active-dot",
                  isActive && "dock-active-dot-visible"
                )}
              />
            </div>
          );
        })}

        {/* Separator */}
        <div className="w-px h-8 bg-white/[0.12] mx-1 mb-1 self-center" />

        {/* Logout */}
        <div
          ref={(el) => {
            itemRefs.current[navItems.length] = el;
          }}
          className="dock-item group relative flex flex-col items-center"
        >
          <span className="dock-tooltip">تسجيل خروج</span>
          <button onClick={logout} className="block">
            <div
              className="dock-icon w-11 h-11 md:w-12 md:h-12 rounded-[13px] flex items-center justify-center bg-white/[0.08] text-white/60 hover:bg-danger/20 hover:text-danger"
              style={{
                transform: `scale(${getScale(navItems.length)})`,
                transformOrigin: "bottom center",
                transition:
                  mouseX !== null
                    ? "transform 0.15s cubic-bezier(0.33,1,0.68,1), background-color 0.2s, color 0.2s"
                    : "transform 0.3s cubic-bezier(0.33,1,0.68,1), background-color 0.2s, color 0.2s",
              }}
            >
              <LogOut className="w-[22px] h-[22px]" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
