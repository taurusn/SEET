"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Image from "next/image";

/* ── Showcase slides ── */
const slides = [
  {
    title: "لوحة تحكم ذكية",
    desc: "تابع محادثاتك وأداء الذكاء الاصطناعي بنظرة واحدة",
    mockup: "dashboard",
  },
  {
    title: "محادثات مباشرة",
    desc: "شاهد رسائل عملائك والردود الذكية لحظة بلحظة",
    mockup: "conversations",
  },
  {
    title: "تحليلات وإحصائيات",
    desc: "تقارير مفصّلة عن رضا العملاء وأداء المحل",
    mockup: "analytics",
  },
];

/* ── Mock dashboard screenshot ── */
function MockDashboard({ type }: { type: string }) {
  if (type === "dashboard") {
    return (
      <div className="p-4 space-y-4 text-[11px]" dir="rtl">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "المحادثات", value: "١٢٤", color: "bg-teal-500/20 text-teal-300" },
            { label: "الرسائل", value: "٢,٤٨٠", color: "bg-blue-500/20 text-blue-300" },
            { label: "التحويلات", value: "٨", color: "bg-amber-500/20 text-amber-300" },
            { label: "القسائم", value: "٣٢", color: "bg-purple-500/20 text-purple-300" },
          ].map((s) => (
            <div key={s.label} className="bg-white/5 rounded-lg p-2.5 text-center">
              <div className={`text-base font-bold ${s.color.split(" ")[1]}`}>{s.value}</div>
              <div className="text-white/40 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
        {/* AI performance */}
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-white/60 mb-2 font-medium">أداء الذكاء الاصطناعي</div>
          <div className="flex items-center gap-3">
            <div className="relative w-14 h-14">
              <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
                <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                <circle cx="18" cy="18" r="14" fill="none" stroke="#2dd4bf" strokeWidth="3" strokeDasharray="79.6 88" strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-accent font-bold text-xs">٩٠٪</span>
            </div>
            <div className="flex-1 space-y-1.5">
              <div className="flex justify-between"><span className="text-white/40">نسبة الرد الآلي</span><span className="text-accent">٩٠٪</span></div>
              <div className="flex justify-between"><span className="text-white/40">متوسط وقت الرد</span><span className="text-white/70">١.٢ ثانية</span></div>
            </div>
          </div>
        </div>
        {/* Recent conversations */}
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-white/60 mb-2 font-medium">آخر المحادثات</div>
          <div className="space-y-1.5">
            {["أحمد - انستقرام", "سارة - واتساب", "محمد - انستقرام"].map((c, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[9px] text-white/60">{c[0]}</div>
                  <span className="text-white/70">{c}</span>
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${i === 1 ? "bg-amber-500/20 text-amber-300" : "bg-teal-500/20 text-teal-300"}`}>
                  {i === 1 ? "محوّل" : "نشط"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (type === "conversations") {
    return (
      <div className="flex h-full text-[11px]" dir="rtl">
        {/* Conversation list */}
        <div className="w-[40%] border-l border-white/10 p-2.5 space-y-1.5">
          {[
            { name: "أحمد العلي", msg: "كم سعر القهوة المختصة؟", time: "٢ د", active: true },
            { name: "سارة محمد", msg: "هل عندكم توصيل؟", time: "١٥ د", active: false },
            { name: "خالد الحربي", msg: "أبي أحجز طاولة", time: "٣٠ د", active: false },
            { name: "نورة أحمد", msg: "شكراً لكم!", time: "١ س", active: false },
          ].map((c, i) => (
            <div key={i} className={`p-2 rounded-lg ${c.active ? "bg-white/10" : "hover:bg-white/5"} cursor-pointer`}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[9px] text-white/60 shrink-0">{c.name[0]}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between items-center">
                    <span className="text-white/90 font-medium truncate">{c.name}</span>
                    <span className="text-white/30 text-[9px] shrink-0">{c.time}</span>
                  </div>
                  <p className="text-white/40 truncate">{c.msg}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Chat thread */}
        <div className="flex-1 flex flex-col p-3">
          <div className="text-white/70 font-medium mb-3 pb-2 border-b border-white/10">أحمد العلي — انستقرام</div>
          <div className="flex-1 space-y-2">
            <div className="flex justify-start"><div className="bg-white/10 rounded-xl rounded-tr-sm px-3 py-1.5 max-w-[80%] text-white/80">كم سعر القهوة المختصة؟</div></div>
            <div className="flex justify-end"><div className="bg-teal-600/40 rounded-xl rounded-tl-sm px-3 py-1.5 max-w-[80%] text-white/90">أهلاً أحمد! قهوتنا المختصة تبدأ من ٢٥ ريال ☕</div></div>
            <div className="flex justify-start"><div className="bg-white/10 rounded-xl rounded-tr-sm px-3 py-1.5 max-w-[80%] text-white/80">وش الأنواع اللي عندكم؟</div></div>
            <div className="flex justify-end"><div className="bg-teal-600/40 rounded-xl rounded-tl-sm px-3 py-1.5 max-w-[80%] text-white/90">عندنا V60 وكيمكس وإيروبرس 🤩</div></div>
          </div>
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/10">
            <div className="flex-1 bg-white/5 rounded-lg px-3 py-1.5 text-white/30">اكتب رد...</div>
            <div className="w-6 h-6 bg-teal-600 rounded-lg flex items-center justify-center text-white text-[10px]">↑</div>
          </div>
        </div>
      </div>
    );
  }

  // Analytics
  return (
    <div className="p-4 space-y-4 text-[11px]" dir="rtl">
      <div className="text-white/60 font-medium">تحليلات آخر ٧ أيام</div>
      {/* Chart mock */}
      <div className="bg-white/5 rounded-lg p-3">
        <div className="flex justify-between mb-2">
          <span className="text-white/50">الرسائل اليومية</span>
          <span className="text-accent font-medium">+٢٣٪</span>
        </div>
        <div className="flex items-end gap-1.5 h-20">
          {[40, 65, 45, 80, 60, 90, 75].map((h, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full rounded-sm bg-accent/40" style={{ height: `${h}%` }} />
              <span className="text-white/30 text-[8px]">{["سبت", "أحد", "اثن", "ثلا", "أرب", "خمي", "جمع"][i]}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Sentiment */}
      <div className="bg-white/5 rounded-lg p-3">
        <div className="text-white/50 mb-2">رضا العملاء</div>
        <div className="space-y-2">
          {[
            { label: "إيجابي", pct: 72, color: "bg-green-400" },
            { label: "محايد", pct: 20, color: "bg-gray-400" },
            { label: "سلبي", pct: 8, color: "bg-red-400" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <span className="text-white/50 w-10">{s.label}</span>
              <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                <div className={`h-full ${s.color} rounded-full`} style={{ width: `${s.pct}%` }} />
              </div>
              <span className="text-white/60 w-8 text-left">{s.pct}٪</span>
            </div>
          ))}
        </div>
      </div>
      {/* Top metrics */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white/5 rounded-lg p-2.5 text-center">
          <div className="text-accent font-bold text-lg">١.٢ ث</div>
          <div className="text-white/40">متوسط الرد</div>
        </div>
        <div className="bg-white/5 rounded-lg p-2.5 text-center">
          <div className="text-blue-300 font-bold text-lg">٩٤٪</div>
          <div className="text-white/40">دقة الذكاء</div>
        </div>
      </div>
    </div>
  );
}

/* ── Browser frame wrapper ── */
function BrowserFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0d1f1f] shadow-2xl">
      {/* Title bar */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border-b border-white/10">
        <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
        <div className="flex-1 mx-3">
          <div className="bg-white/5 rounded-md px-3 py-0.5 text-[10px] text-white/30 text-center max-w-[200px] mx-auto">
            app.seet.sa
          </div>
        </div>
      </div>
      {/* Content */}
      <div className="h-[320px] overflow-hidden">{children}</div>
    </div>
  );
}

/* ── Login Page ── */
export default function LoginPage() {
  const router = useRouter();
  const { login, token, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    if (!authLoading && token) {
      router.replace("/");
    }
  }, [authLoading, token, router]);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % slides.length);
    }, 5000);
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
    const shopId = form.get("shop_id") as string;

    try {
      const res = await api.post<{
        access_token: string;
        shop_id: string;
      }>("/api/v1/auth/login", { name: shopId });
      await login(res.shop_id, res.access_token);
      router.replace("/");
    } catch {
      setError("اسم المحل غير موجود");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left side — showcase with screenshots */}
      <div className="hidden md:flex md:w-1/2 relative overflow-hidden bg-[#0a2a2a] items-center justify-center p-10 lg:p-16">
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-accent/15 rounded-full blur-[100px]" />

        <div className="relative z-10 w-full max-w-lg">
          {/* Screenshot carousel */}
          <div className="mb-8">
            <BrowserFrame>
              <div key={activeSlide} className="animate-fade-in h-full">
                <MockDashboard type={slides[activeSlide].mockup} />
              </div>
            </BrowserFrame>
          </div>

          {/* Feature text */}
          <div className="text-center min-h-[70px]" dir="rtl">
            <div key={activeSlide} className="animate-fade-in">
              <h2 className="text-xl font-bold text-white mb-2">
                {slides[activeSlide].title}
              </h2>
              <p className="text-white/50 text-sm">
                {slides[activeSlide].desc}
              </p>
            </div>
          </div>

          {/* Carousel dots */}
          <div className="flex items-center justify-center gap-2 mt-6">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveSlide(i)}
                className={`rounded-full transition-all duration-300 ${
                  i === activeSlide
                    ? "w-6 h-2 bg-accent"
                    : "w-2 h-2 bg-white/30 hover:bg-white/50"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Right side — login form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 bg-background">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="md:hidden text-center mb-8">
            <Image
              src="/seet-s.png"
              alt="SEET"
              width={48}
              height={48}
              className="mx-auto mb-3"
              priority
            />
          </div>

          {/* Desktop icon */}
          <div className="hidden md:block mb-2">
            <Image
              src="/seet-s.png"
              alt="SEET"
              width={48}
              height={48}
              className="mb-6"
              priority
            />
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-1">
            مرحبًا بك مجددًا 👋
          </h1>
          <p className="text-muted-foreground mb-8">
            سجل دخولك لإدارة محلك
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2 text-foreground">
                اسم المحل
              </label>
              <input
                name="shop_id"
                type="text"
                required
                placeholder="أدخل اسم المحل"
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>

            {error && (
              <p className="text-sm text-danger">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-foreground text-background font-semibold hover:bg-foreground/90 transition-colors disabled:opacity-50"
            >
              {loading ? "جاري الدخول..." : "تسجيل الدخول"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            ما عندك حساب؟{" "}
            <Link href="/register" className="text-primary hover:underline font-semibold">
              سجل الآن
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
