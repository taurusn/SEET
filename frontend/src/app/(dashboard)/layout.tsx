"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Dock } from "@/components/sidebar";
import { SplashScreen } from "@/components/splash-screen";
import { StaticLogo } from "@/components/static-logo";
import { useSSE, notifyHandoff, SSEEvent } from "@/lib/sse";
import { generateTheme, applyTheme, clearTheme } from "@/lib/theme";
import Image from "next/image";
import { AlertTriangle } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { token, shop, loading } = useAuth();
  const router = useRouter();
  const [showSplash, setShowSplash] = useState(false);
  const [reauthBanner, setReauthBanner] = useState<{
    platform: string;
    reason: string;
  } | null>(null);
  const [aiDegraded, setAiDegraded] = useState(false);

  // White-label theme: apply cached palette immediately to prevent flash
  useLayoutEffect(() => {
    const cached = localStorage.getItem("seet_theme");
    if (cached) {
      try {
        applyTheme(JSON.parse(cached));
      } catch { /* invalid cache, ignore */ }
    }
    return () => clearTheme();
  }, []);

  // White-label theme: generate and apply when shop loads
  useEffect(() => {
    if (shop?.brand_color) {
      const palette = generateTheme(shop.brand_color);
      applyTheme(palette);
      localStorage.setItem("seet_theme", JSON.stringify(palette));
    } else if (shop) {
      // No brand color — clear any stale overrides, use CSS defaults (SEET teal)
      clearTheme();
      localStorage.removeItem("seet_theme");
    }
  }, [shop]);

  useEffect(() => {
    if (!loading && !token) {
      localStorage.removeItem("seet_theme");
      clearTheme();
      router.push("/login");
    }
  }, [token, loading, router]);

  // Force password rotation when the shop is flagged (admin-issued temp
  // credentials). Blocks access to every dashboard route until resolved.
  useEffect(() => {
    if (!loading && token && shop?.must_change_password) {
      router.push("/change-password");
    }
  }, [loading, token, shop, router]);

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

    if (event.type === "shop_deactivated") {
      const d = event.data as { platform?: string; reason?: string };
      setReauthBanner({
        platform: d.platform || "unknown",
        reason: d.reason || "unknown",
      });
    }

    if (event.type === "ai_degraded") {
      setAiDegraded(true);
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
  // Forced-change pending — don't render dashboard; the effect above
  // has already pushed to /change-password.
  if (shop?.must_change_password) return null;

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
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-14 flex items-center justify-between">
          {shop?.logo_url ? (
            <StaticLogo
              src={shop.logo_url}
              alt={shop.name}
              className="h-10 w-auto"
            />
          ) : (
            <Image
              src="/seet-mark.svg"
              alt="SEET"
              width={40}
              height={40}
              className="h-10 w-10"
              priority
              unoptimized
            />
          )}
          {shop && (
            <span className="text-sm text-muted-foreground">
              {shop.name}
            </span>
          )}
        </div>
      </header>

      {reauthBanner && (
        <div className="bg-danger/10 border-b border-danger/20">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex items-start gap-3">
            <AlertTriangle
              className="w-5 h-5 text-danger shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="flex-1 text-sm">
              <p className="font-medium text-danger">
                الربط مع {reauthBanner.platform === "instagram" ? "إنستغرام" : reauthBanner.platform === "whatsapp" ? "واتساب" : "Meta"} انتهى
              </p>
              <p className="text-muted-foreground mt-0.5">
                الردود الآلية متوقفة مؤقتًا. تواصل مع المسؤول لتجديد الاعتماد.
              </p>
            </div>
            <button
              onClick={() => setReauthBanner(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
              aria-label="إخفاء"
            >
              إخفاء
            </button>
          </div>
        </div>
      )}

      {aiDegraded && (
        <div className="bg-warning/10 border-b border-warning/20">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex items-start gap-3">
            <AlertTriangle
              className="w-5 h-5 text-warning shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="flex-1 text-sm">
              <p className="font-medium text-warning">
                الذكاء الاصطناعي يعمل بوضع محدود
              </p>
              <p className="text-muted-foreground mt-0.5">
                الردود الآلية ترجع برسائل عامة مؤقتًا. يُنصح بتولي المحادثات يدويًا حتى تعود الخدمة.
              </p>
            </div>
            <button
              onClick={() => setAiDegraded(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
              aria-label="إخفاء"
            >
              إخفاء
            </button>
          </div>
        </div>
      )}

      <Dock />
      <main className="min-h-[calc(100vh-3.5rem)] pb-28">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
