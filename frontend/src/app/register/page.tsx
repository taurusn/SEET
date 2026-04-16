"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import Image from "next/image";

const features = [
  {
    title: "ردود ذكية بالذكاء الاصطناعي",
    desc: "رد تلقائي على رسائل عملائك في انستقرام وواتساب على مدار الساعة",
  },
  {
    title: "تحويل للموظف عند الحاجة",
    desc: "النظام يكتشف تلقائياً متى العميل يحتاج تدخل بشري ويحوّل المحادثة",
  },
  {
    title: "تحليلات وإحصائيات",
    desc: "تابع أداء محلك ورضا العملاء بلوحة تحكم سهلة وواضحة",
  },
];

export default function RegisterPage() {
  const router = useRouter();
  const { register, token, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeFeature, setActiveFeature] = useState(0);

  useEffect(() => {
    if (!authLoading && token) {
      router.replace("/");
    }
  }, [authLoading, token, router]);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % features.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

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
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left side — showcase */}
      <div className="hidden md:flex md:w-1/2 relative overflow-hidden bg-[#0a2a2a] items-center justify-center p-12">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-accent/15 rounded-full blur-[100px]" />

        <div className="relative z-10 max-w-md text-center">
          <Image
            src="/seet-logo.png"
            alt="SEET"
            width={280}
            height={120}
            className="mx-auto mb-10 w-52 brightness-0 invert"
            priority
          />

          <div className="min-h-[140px] flex items-center justify-center">
            <div key={activeFeature} className="animate-fade-in">
              <h2 className="text-2xl font-bold text-white mb-3">
                {features[activeFeature].title}
              </h2>
              <p className="text-white/60 text-base leading-relaxed">
                {features[activeFeature].desc}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 mt-8">
            {features.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveFeature(i)}
                className={`rounded-full transition-all duration-300 ${
                  i === activeFeature
                    ? "w-6 h-2 bg-accent"
                    : "w-2 h-2 bg-white/30 hover:bg-white/50"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Right side — register form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 bg-background overflow-y-auto">
        <div className="w-full max-w-sm">
          <div className="md:hidden text-center mb-8">
            <Image
              src="/seet-mark.png"
              alt="SEET"
              width={48}
              height={48}
              className="mx-auto mb-3"
              priority
            />
          </div>

          <div className="hidden md:block mb-2">
            <Image
              src="/seet-mark.png"
              alt="SEET"
              width={48}
              height={48}
              className="mb-6"
              priority
            />
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-1">
            سجّل محلك الآن
          </h1>
          <p className="text-muted-foreground mb-8">
            سجل محلك وابدأ بالردود الذكية
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2 text-foreground">
                اسم المحل *
              </label>
              <input
                name="name"
                type="text"
                required
                placeholder="مثال: كافيه الرياض"
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>

            <div className="pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground mb-4">
                ربط الحسابات (اختياري)
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">
                    Instagram Page ID
                  </label>
                  <input
                    name="ig_page_id"
                    type="text"
                    placeholder="معرّف صفحة انستقرام"
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">
                    Instagram Access Token
                  </label>
                  <input
                    name="ig_access_token"
                    type="password"
                    placeholder="توكن انستقرام"
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">
                    WhatsApp Phone Number ID
                  </label>
                  <input
                    name="wa_phone_number_id"
                    type="text"
                    placeholder="معرّف رقم واتساب"
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">
                    WhatsApp Access Token
                  </label>
                  <input
                    name="wa_access_token"
                    type="password"
                    placeholder="توكن واتساب"
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  />
                </div>
              </div>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-foreground text-background font-semibold hover:bg-foreground/90 transition-colors disabled:opacity-50"
            >
              {loading ? "جاري التسجيل..." : "تسجيل المحل"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            عندك حساب؟{" "}
            <Link href="/login" className="text-primary hover:underline font-semibold">
              سجل دخول
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
