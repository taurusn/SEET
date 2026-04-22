"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { token, shop, loading: authLoading, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !token) {
      router.replace("/login");
    }
  }, [authLoading, token, router]);

  if (authLoading || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const forced = !!shop?.must_change_password;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const fd = new FormData(e.currentTarget);
    const current_password = (fd.get("current_password") as string) || "";
    const new_password = fd.get("new_password") as string;
    const confirm_password = fd.get("confirm_password") as string;

    if (new_password.length < 8) {
      setError("كلمة المرور لازم ٨ أحرف على الأقل");
      setLoading(false);
      return;
    }
    if (!/[A-Za-z]/.test(new_password) || !/\d/.test(new_password)) {
      setError("كلمة المرور لازم تحتوي حرف ورقم");
      setLoading(false);
      return;
    }
    if (new_password !== confirm_password) {
      setError("كلمة المرور والتأكيد غير متطابقين");
      setLoading(false);
      return;
    }

    try {
      await api.post("/api/v1/shop/password", {
        current_password: forced ? undefined : current_password,
        new_password,
      });
      // Backend revokes the current token on success — force a clean
      // re-login rather than juggling stale state.
      await logout();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Current password")) {
        setError("كلمة المرور الحالية غير صحيحة");
      } else if (msg.includes("least") || msg.includes("letter") || msg.includes("digit")) {
        setError("كلمة المرور الجديدة ضعيفة جدًا");
      } else {
        setError("تعذر تغيير كلمة المرور");
      }
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Image
            src="/seet-mark.svg"
            alt="SEET"
            width={48}
            height={48}
            className="mx-auto mb-4"
            priority
            unoptimized
          />
          <h1 className="text-2xl font-bold text-foreground mb-1">
            {forced ? "حدّث كلمة المرور" : "تغيير كلمة المرور"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {forced
              ? "لازم تغيّر كلمة المرور المؤقتة قبل متابعة استخدام النظام"
              : "استخدم كلمة مرور قوية — ٨ أحرف على الأقل، حرف ورقم"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {!forced && (
            <div>
              <label className="block text-sm font-medium mb-2 text-foreground">
                كلمة المرور الحالية
              </label>
              <input
                name="current_password"
                type="password"
                autoComplete="current-password"
                required
                dir="ltr"
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2 text-foreground">
              كلمة المرور الجديدة
            </label>
            <input
              name="new_password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              dir="ltr"
              className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-foreground">
              تأكيد كلمة المرور
            </label>
            <input
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              dir="ltr"
              className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-foreground text-background font-semibold hover:bg-foreground/90 transition-colors disabled:opacity-50"
          >
            {loading ? "جاري الحفظ..." : "حفظ وإعادة الدخول"}
          </button>

          {!forced && (
            <button
              type="button"
              onClick={() => router.back()}
              className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              رجوع
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
