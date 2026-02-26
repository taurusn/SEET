"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      router.push("/");
    } catch {
      setError("اسم المحل غير موجود");
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
            width={200}
            height={77}
            className="mx-auto mb-4 h-16 w-auto"
            priority
          />
          <p className="text-muted-foreground mt-1">سجل دخولك لإدارة محلك</p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                اسم المحل
              </label>
              <input
                name="shop_id"
                type="text"
                required
                placeholder="أدخل اسم المحل"
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            {error && (
              <p className="text-sm text-danger">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "جاري الدخول..." : "دخول"}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            ما عندك حساب؟{" "}
            <Link href="/register" className="text-primary hover:underline font-medium">
              سجل الآن
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
