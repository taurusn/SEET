"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import Image from "next/image";

export default function RegisterPage() {
  const router = useRouter();
  const { register, token, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && token) {
      router.replace("/");
    }
  }, [authLoading, token, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (token) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);

    try {
      await register({
        name: form.get("name") as string,
        ig_page_id: (form.get("ig_page_id") as string) || undefined,
        ig_access_token: (form.get("ig_access_token") as string) || undefined,
        wa_phone_number_id:
          (form.get("wa_phone_number_id") as string) || undefined,
        wa_access_token:
          (form.get("wa_access_token") as string) || undefined,
      });
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ أثناء التسجيل");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image
            src="/seet-logo.png"
            alt="SEET"
            width={280}
            height={280}
            className="mx-auto mb-2 w-56"
            priority
          />
          <p className="text-muted-foreground mt-1">سجل محلك وابدأ بالردود الذكية</p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                اسم المحل *
              </label>
              <input
                name="name"
                type="text"
                required
                placeholder="مثال: كافيه الرياض"
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            <div className="pt-2 border-t border-border">
              <p className="text-sm text-muted-foreground mb-3">
                ربط الحسابات (اختياري)
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Instagram Page ID
                  </label>
                  <input
                    name="ig_page_id"
                    type="text"
                    placeholder="معرّف صفحة انستقرام"
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Instagram Access Token
                  </label>
                  <input
                    name="ig_access_token"
                    type="password"
                    placeholder="توكن انستقرام"
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    WhatsApp Phone Number ID
                  </label>
                  <input
                    name="wa_phone_number_id"
                    type="text"
                    placeholder="معرّف رقم واتساب"
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    WhatsApp Access Token
                  </label>
                  <input
                    name="wa_access_token"
                    type="password"
                    placeholder="توكن واتساب"
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              </div>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "جاري التسجيل..." : "تسجيل المحل"}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            عندك حساب؟{" "}
            <Link href="/login" className="text-primary hover:underline font-medium">
              سجل دخول
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
