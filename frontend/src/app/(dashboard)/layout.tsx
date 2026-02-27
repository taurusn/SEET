"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Dock } from "@/components/sidebar";
import { SplashScreen } from "@/components/splash-screen";
import { useSSE, notifyHandoff, SSEEvent } from "@/lib/sse";
import Image from "next/image";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { token, shop, loading } = useAuth();
  const router = useRouter();
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    if (!loading && !token) {
      router.push("/login");
    }
  }, [token, loading, router]);

  useEffect(() => {
    if (!loading && token && shop) {
      const splashKey = `splash_shown_${shop.id}`;
      if (!sessionStorage.getItem(splashKey)) {
        setShowSplash(true);
        sessionStorage.setItem(splashKey, "1");
      }
    }
  }, [loading, token, shop]);

  const handleSplashDone = useCallback(() => setShowSplash(false), []);

  // SSE: dispatch custom DOM events so child pages can listen
  const handleSSE = useCallback((event: SSEEvent) => {
    window.dispatchEvent(new CustomEvent("sse", { detail: event }));

    if (event.type === "handoff_triggered") {
      const d = event.data as { customer_id?: string; reason?: string };
      notifyHandoff(d.customer_id || "", d.reason);
    }
  }, []);

  useSSE(handleSSE);

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
      {showSplash && shop && (
        <SplashScreen
          logoUrl={shop.logo_url}
          brandColor={shop.brand_color}
          splashText={shop.splash_text}
          onDone={handleSplashDone}
        />
      )}

      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 md:px-8 h-14 flex items-center justify-between">
          {shop?.logo_url ? (
            <img
              src={shop.logo_url}
              alt={shop.name}
              className="h-10 w-auto object-contain"
            />
          ) : (
            <Image
              src="/seet-logo.png"
              alt="SEET"
              width={160}
              height={160}
              className="w-28"
              priority
            />
          )}
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
