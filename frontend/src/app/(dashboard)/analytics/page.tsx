"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Bot,
  Clock,
  MessageSquare,
  ArrowUpRight,
  TrendingUp,
  Download,
} from "lucide-react";

interface Analytics {
  total_messages: number;
  total_escalations: number;
  ai_handled_pct: number;
  avg_response_time_ms: number;
  messages_by_hour: number[];
  messages_by_day: { date: string; messages: number; escalations: number }[];
  sentiment_breakdown: { positive: number; neutral: number; negative: number };
}

const periods = [
  { value: "today", label: "اليوم" },
  { value: "7d", label: "٧ أيام" },
  { value: "30d", label: "٣٠ يوم" },
];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("7d");
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<Analytics>(`/api/v1/shop/analytics?period=${period}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [period]);

  function formatTime(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  const sentimentTotal = data
    ? data.sentiment_breakdown.positive +
      data.sentiment_breakdown.neutral +
      data.sentiment_breakdown.negative
    : 0;

  function sentimentPct(val: number): number {
    return sentimentTotal > 0 ? Math.round((val / sentimentTotal) * 100) : 0;
  }

  const maxHourly = data ? Math.max(...data.messages_by_hour, 1) : 1;
  const maxDaily = data
    ? Math.max(...data.messages_by_day.map((d) => d.messages), 1)
    : 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">التحليلات</h1>

        <div className="flex items-center gap-3">
          {/* Export CSV */}
          <button
            onClick={async () => {
              try {
                const token = localStorage.getItem("token");
                const res = await fetch(`/api/v1/shop/analytics/export?period=${period}`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `analytics-${period}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              } catch { /* network error — silent */ }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            تصدير CSV
          </button>
          {/* Period selector */}
          <div className="flex gap-1 bg-muted rounded-xl p-1">
            {periods.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                  period === p.value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center shadow-sm">
          <p className="text-muted-foreground">لا توجد بيانات</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-primary" />
                </div>
              </div>
              <p className="text-2xl font-bold">{data.ai_handled_pct}%</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                تعامل الذكاء الاصطناعي
              </p>
            </div>

            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-xl bg-success/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-success" />
                </div>
              </div>
              <p className="text-2xl font-bold">
                {formatTime(data.avg_response_time_ms)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                متوسط وقت الرد
              </p>
            </div>

            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-muted-foreground" />
                </div>
              </div>
              <p className="text-2xl font-bold">{data.total_messages}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                إجمالي الرسائل
              </p>
            </div>

            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-xl bg-warning/10 flex items-center justify-center">
                  <ArrowUpRight className="w-5 h-5 text-warning" />
                </div>
              </div>
              <p className="text-2xl font-bold">{data.total_escalations}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                تحويلات بشرية
              </p>
            </div>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Hourly distribution */}
            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
              <h3 className="font-bold text-sm mb-4">توزيع الرسائل بالساعة</h3>
              <div className="flex items-end gap-[3px] h-32">
                {data.messages_by_hour.map((count, h) => (
                  <div
                    key={h}
                    className="flex-1 group relative"
                    title={`${h}:00 — ${count} رسائل`}
                  >
                    <div
                      className="w-full bg-primary/20 hover:bg-primary/40 rounded-t transition-colors"
                      style={{
                        height: `${Math.max((count / maxHourly) * 100, 2)}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                <span>00</span>
                <span>06</span>
                <span>12</span>
                <span>18</span>
                <span>23</span>
              </div>
            </div>

            {/* Daily trend */}
            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
              <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                الرسائل اليومية
              </h3>
              <div className="flex items-end gap-1 h-32">
                {data.messages_by_day.map((day) => (
                  <div
                    key={day.date}
                    className="flex-1 group relative"
                    title={`${day.date} — ${day.messages} رسائل`}
                  >
                    <div
                      className="w-full bg-success/20 hover:bg-success/40 rounded-t transition-colors"
                      style={{
                        height: `${Math.max(
                          (day.messages / maxDaily) * 100,
                          2
                        )}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
              {data.messages_by_day.length > 1 && (
                <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                  <span>
                    {data.messages_by_day[0]?.date.slice(5)}
                  </span>
                  <span>
                    {data.messages_by_day[data.messages_by_day.length - 1]?.date.slice(5)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Sentiment breakdown */}
          <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
            <h3 className="font-bold text-sm mb-4">تحليل المشاعر</h3>
            {sentimentTotal === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد بيانات مشاعر بعد</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm">إيجابي</span>
                    <span className="text-sm font-medium text-green-500">
                      {sentimentPct(data.sentiment_breakdown.positive)}%
                    </span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{
                        width: `${sentimentPct(data.sentiment_breakdown.positive)}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm">محايد</span>
                    <span className="text-sm font-medium text-gray-400">
                      {sentimentPct(data.sentiment_breakdown.neutral)}%
                    </span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gray-400 rounded-full transition-all"
                      style={{
                        width: `${sentimentPct(data.sentiment_breakdown.neutral)}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm">سلبي</span>
                    <span className="text-sm font-medium text-red-500">
                      {sentimentPct(data.sentiment_breakdown.negative)}%
                    </span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full transition-all"
                      style={{
                        width: `${sentimentPct(data.sentiment_breakdown.negative)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
