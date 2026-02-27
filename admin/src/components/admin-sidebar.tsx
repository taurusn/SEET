"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/lib/auth";
import {
  LayoutDashboard,
  Store,
  PlusCircle,
  Settings,
  LogOut,
} from "lucide-react";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/shops", label: "Shops", icon: Store },
  { href: "/admin/shops/onboard", label: "New Shop", icon: PlusCircle },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { admin, logout } = useAdmin();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 w-56 bg-sidebar text-sidebar-foreground flex flex-col">
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
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);

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
              {item.label}
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
