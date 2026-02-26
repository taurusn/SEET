"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Dock } from "@/components/sidebar";
import Image from "next/image";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { token, shop, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !token) {
      router.push("/login");
    }
  }, [token, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!token) return null;

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 md:px-8 h-14 flex items-center justify-between">
          <Image
            src="/seet-logo.png"
            alt="SEET"
            width={72}
            height={28}
            className="h-7 w-auto"
            priority
          />
          {shop && (
            <span className="text-sm text-muted-foreground">
              {shop.name}
            </span>
          )}
        </div>
      </header>

      <Dock />
      <main className="min-h-[calc(100vh-3.5rem)] pb-28">
        <div className="p-6 md:p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
