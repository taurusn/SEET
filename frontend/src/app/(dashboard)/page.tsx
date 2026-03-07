"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { StatsCard } from "@/components/stats-card";
import { MessageSquare, Users, Bell, Ticket, Bot, Clock } from "lucide-react";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";

interface Stats {
  total_conversations: number;
  total_messages: number;
  active_handoffs: number;
  active_vouchers: number;
}

interface MiniAnalytics {
  ai_handled_pct: number;
  avg_response_time_ms: number;
  total_messages: number;
}

interface Conversation {
  id: string;
  platform: string;
  customer_id: string;
  status: string;
  created_at: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Conversation[]>([]);
  const [analytics, setAnalytics] = useState<MiniAnalytics | null>(null);

  useEffect(() => {
    api.get<Stats>("/api/v1/shop/stats").then(setStats);
    api
      .get<Conversation[]>("/api/v1/shop/conversations?limit=5")
      .then(setRecent);
    api
      .get<MiniAnalytics>("/api/v1/shop/analytics?period=7d")
      .then(setAnalytics)
      .catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">لوحة التحكم</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard
          label="إجمالي الرسائل"
          value={stats?.total_messages ?? "—"}
          icon={MessageSquare}
        />
        <StatsCard
          label="المحادثات"
          value={stats?.total_conversations ?? "—"}
          icon={Users}
          variant="success"
        />
        <StatsCard
          label="تحويلات معلّقة"
          value={stats?.active_handoffs ?? "—"}
          icon={Bell}
          variant={
            stats && stats.active_handoffs > 0 ? "warning" : "default"
          }
        />
        <StatsCard
          label="قسائم فعّالة"
          value={stats?.active_vouchers ?? "—"}
          icon={Ticket}
        />
      </div>

      {/* Handoff alert */}
      {stats && stats.active_handoffs > 0 && (
        <Link
          href="/handoffs"
          className="block mb-6 p-4 rounded-2xl bg-warning/10 border border-warning/20 text-warning hover:bg-warning/15 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5" />
            <p className="font-medium">
              {stats.active_handoffs} عملاء ينتظرون رد بشري
            </p>
          </div>
        </Link>
      )}

      {/* AI Performance mini summary */}
      {analytics && analytics.total_messages > 0 && (
        <Link
          href="/analytics"
          className="block mb-6 p-4 rounded-2xl bg-card border border-border shadow-sm hover:border-primary/30 transition-colors"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 md:gap-4 flex-wrap min-w-0">
              <div className="flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-sm font-medium">
                  {analytics.ai_handled_pct}% تعامل الذكاء الاصطناعي
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-success flex-shrink-0" />
                <span className="text-sm font-medium">
                  {analytics.avg_response_time_ms < 1000
                    ? `${analytics.avg_response_time_ms}ms`
                    : `${(analytics.avg_response_time_ms / 1000).toFixed(1)}s`}{" "}
                  متوسط الرد
                </span>
              </div>
            </div>
            <span className="text-xs text-muted-foreground flex-shrink-0 hidden sm:inline">آخر ٧ أيام →</span>
          </div>
        </Link>
      )}

      {/* Recent conversations */}
      <div className="bg-card rounded-2xl border border-border shadow-sm">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-bold">آخر المحادثات</h2>
          <Link
            href="/conversations"
            className="text-sm text-primary hover:underline"
          >
            عرض الكل
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <MessageSquare className="w-6 h-6 opacity-50" />
            </div>
            <p className="text-sm font-medium text-foreground/60">لا توجد محادثات بعد</p>
            <p className="text-xs mt-1">المحادثات الجديدة ستظهر هنا</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recent.map((convo) => (
              <Link
                key={convo.id}
                href="/conversations"
                className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{convo.customer_id}</p>
                    <p className="text-xs text-muted-foreground">
                      {convo.platform === "instagram" ? "انستقرام" : "واتساب"}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {timeAgo(convo.created_at)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
