"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { StatsCard } from "@/components/stats-card";
import {
  Store,
  MessageSquare,
  MessagesSquare,
  AlertTriangle,
  Ticket,
  CheckCircle,
  Plus,
  ArrowUpRight,
  Clock,
} from "lucide-react";
import { timeAgo } from "@/lib/utils";

interface PlatformStats {
  total_shops: number;
  active_shops: number;
  total_conversations: number;
  total_messages: number;
  active_handoffs: number;
  total_vouchers: number;
}

interface Analytics {
  total_messages: number;
  total_escalations: number;
  ai_handled_pct: number;
  avg_response_time_ms: number;
  messages_by_hour: number[];
  messages_by_day: { date: string; messages: number; escalations: number }[];
  sentiment_breakdown: { positive: number; neutral: number; negative: number };
  sentiment_transitions?: { resolved: number; worsened: number };
}

interface ActivityEvent {
  type: string;
  timestamp: string;
  shop_id: string;
  shop_name: string;
  detail: string;
}

const periods = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [period, setPeriod] = useState("7d");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<PlatformStats>("/api/v1/admin/stats")
      .then(setStats)
      .catch((e) => setError(e.message || "Failed to load stats"));
    api.get<ActivityEvent[]>("/api/v1/admin/activity?limit=15").then(setActivity).catch(() => {});
  }, []);

  useEffect(() => {
    api.get<Analytics>(`/api/v1/admin/analytics?period=${period}`).then(setAnalytics).catch(() => {});
  }, [period]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-danger text-sm">
        {error}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const maxHourly = analytics ? Math.max(...analytics.messages_by_hour, 1) : 1;
  const sentimentTotal = analytics
    ? analytics.sentiment_breakdown.positive + analytics.sentiment_breakdown.neutral + analytics.sentiment_breakdown.negative
    : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatsCard label="Total Shops" value={stats.total_shops} icon={Store} />
        <StatsCard label="Active Shops" value={stats.active_shops} icon={CheckCircle} />
        <StatsCard label="Conversations" value={stats.total_conversations} icon={MessagesSquare} />
        <StatsCard label="Messages" value={stats.total_messages} icon={MessageSquare} />
        <StatsCard label="Active Handoffs" value={stats.active_handoffs} icon={AlertTriangle} />
        <StatsCard label="Vouchers Issued" value={stats.total_vouchers} icon={Ticket} />
      </div>

      {/* Analytics section (A-12) */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Platform Analytics</h2>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-colors",
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

      {analytics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Messages</span>
            </div>
            <p className="text-xl font-bold">{analytics.total_messages}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpRight className="w-4 h-4 text-warning" />
              <span className="text-xs text-muted-foreground">Escalations</span>
            </div>
            <p className="text-xl font-bold">{analytics.total_escalations}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-success" />
              <span className="text-xs text-muted-foreground">AI Handled</span>
            </div>
            <p className="text-xl font-bold">{analytics.ai_handled_pct}%</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Avg Response</span>
            </div>
            <p className="text-xl font-bold">
              {analytics.avg_response_time_ms < 1000
                ? `${analytics.avg_response_time_ms}ms`
                : `${(analytics.avg_response_time_ms / 1000).toFixed(1)}s`}
            </p>
          </div>
        </div>
      )}

      {/* Hourly + Sentiment row */}
      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          {/* Hourly distribution */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-3">Messages by Hour</h3>
            <div className="flex items-end gap-[3px] h-24">
              {analytics.messages_by_hour.map((v, i) => (
                <div
                  key={i}
                  className="flex-1 bg-primary/20 hover:bg-primary/40 rounded-sm transition-colors"
                  style={{ height: `${(v / maxHourly) * 100}%`, minHeight: v > 0 ? "4px" : "1px" }}
                  title={`${i}:00 — ${v} messages`}
                />
              ))}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">0:00</span>
              <span className="text-[10px] text-muted-foreground">12:00</span>
              <span className="text-[10px] text-muted-foreground">23:00</span>
            </div>
          </div>

          {/* Sentiment breakdown */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-3">Sentiment</h3>
            {sentimentTotal === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No sentiment data yet</p>
            ) : (
              <div className="space-y-3">
                {[
                  { label: "Positive", value: analytics.sentiment_breakdown.positive, color: "bg-success" },
                  { label: "Neutral", value: analytics.sentiment_breakdown.neutral, color: "bg-muted-foreground" },
                  { label: "Negative", value: analytics.sentiment_breakdown.negative, color: "bg-danger" },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span>{s.label}</span>
                      <span className="text-muted-foreground">{s.value} ({Math.round((s.value / sentimentTotal) * 100)}%)</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${s.color} rounded-full transition-all`}
                        style={{ width: `${(s.value / sentimentTotal) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Resolution — Sentiment Transitions */}
          {analytics.sentiment_transitions && (analytics.sentiment_transitions.resolved > 0 || analytics.sentiment_transitions.worsened > 0) && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-3">AI Resolution</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-xs">
                  <span>Resolved (neg → pos)</span>
                  <span className="text-success font-medium">{analytics.sentiment_transitions.resolved}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Worsened (pos → neg)</span>
                  <span className="text-danger font-medium">{analytics.sentiment_transitions.worsened}</span>
                </div>
                {(analytics.sentiment_transitions.resolved + analytics.sentiment_transitions.worsened) > 0 && (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>Resolution rate</span>
                      <span className="text-success font-medium">
                        {Math.round(
                          (analytics.sentiment_transitions.resolved /
                            (analytics.sentiment_transitions.resolved + analytics.sentiment_transitions.worsened)) *
                            100
                        )}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-success rounded-full transition-all"
                        style={{
                          width: `${(analytics.sentiment_transitions.resolved / (analytics.sentiment_transitions.resolved + analytics.sentiment_transitions.worsened)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Activity Feed (A-13) */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Recent Activity</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No recent activity</p>
        ) : (
          <div className="space-y-3">
            {activity.map((event, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                  event.type === "shop_created" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                )}>
                  {event.type === "shop_created" ? (
                    <Plus className="w-3.5 h-3.5" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate">{event.detail}</p>
                  <p className="text-xs text-muted-foreground">
                    {event.shop_name} &middot; {timeAgo(event.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
