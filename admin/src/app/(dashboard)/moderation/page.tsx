"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Check, X, Inbox, Loader2, Instagram, Phone } from "lucide-react";

interface PendingMessage {
  id: string;
  shop_id: string;
  shop_name: string;
  conversation_id: string;
  platform: string;
  customer_id: string;
  content: string;
  created_at: string;
}

const POLL_MS = 10_000;
const FRESH_MS = 5 * 60_000;   // < 5min = green
const STALE_MS = 30 * 60_000;  // 5-30min = amber; >30min = red

type Urgency = "fresh" | "warming" | "stale";

function urgencyFor(createdAt: string): Urgency {
  const age = Date.now() - new Date(createdAt).getTime();
  if (age < FRESH_MS) return "fresh";
  if (age < STALE_MS) return "warming";
  return "stale";
}

function formatAge(createdAt: string): string {
  const seconds = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function shopInitial(name: string): string {
  return (name[0] || "?").toUpperCase();
}

export default function ModerationPage() {
  const [messages, setMessages] = useState<PendingMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  // Re-render every 30s so urgency colors and age labels stay accurate
  // without waiting for the 10s poll.
  const [, setTick] = useState(0);

  const fetchPending = useCallback(async () => {
    try {
      const data = await api.get<PendingMessage[]>(
        "/api/v1/admin/messages/pending?limit=200",
      );
      setMessages(data);
      setError("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
    const poll = setInterval(fetchPending, POLL_MS);
    const clock = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [fetchPending]);

  const act = async (id: string, action: "approve" | "reject") => {
    setActingId(id);
    setError("");
    // Optimistic removal — server is the truth on next poll
    const prev = messages;
    setMessages((m) => m.filter((msg) => msg.id !== id));
    try {
      await api.post(`/api/v1/admin/messages/${id}/${action}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : `Failed to ${action}`);
      setMessages(prev);
    } finally {
      setActingId(null);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Moderation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Customer messages waiting on admin approval. Shops in
          <span className="mx-1 px-1.5 py-0.5 rounded bg-muted text-foreground text-xs font-mono">
            Review
          </span>
          mode queue here; shops in
          <span className="mx-1 px-1.5 py-0.5 rounded bg-muted text-foreground text-xs font-mono">
            Auto
          </span>
          mode don&apos;t.
        </p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-danger/10 text-danger text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : messages.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <Inbox className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">
            No pending messages
          </p>
          <p className="text-xs text-muted-foreground max-w-xs">
            When a shop in Review mode receives a DM, it shows up here for
            approval.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((msg) => {
            const urgency = urgencyFor(msg.created_at);
            const acting = actingId === msg.id;
            const isIG = msg.platform === "instagram";
            return (
              <div
                key={msg.id}
                className={cn(
                  "relative bg-card border border-border rounded-xl overflow-hidden transition-opacity",
                  acting && "opacity-60",
                )}
              >
                {/* Platform-colored left accent bar */}
                <div
                  className={cn(
                    "absolute top-0 bottom-0 left-0 w-1",
                    isIG ? "bg-pink-400" : "bg-green-500",
                  )}
                />

                <div className="pl-5 pr-4 py-4">
                  <div className="flex items-start gap-3">
                    {/* Shop avatar */}
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                      {shopInitial(msg.shop_name)}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Header: shop + platform + age */}
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {msg.shop_name}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium",
                            isIG
                              ? "bg-pink-100 text-pink-700"
                              : "bg-green-100 text-green-700",
                          )}
                        >
                          {isIG ? (
                            <Instagram size={10} />
                          ) : (
                            <Phone size={10} />
                          )}
                          {isIG ? "IG" : "WA"}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              urgency === "fresh" && "bg-success",
                              urgency === "warming" && "bg-warning",
                              urgency === "stale" && "bg-danger animate-pulse",
                            )}
                            aria-hidden
                          />
                          <span
                            className={cn(
                              urgency === "stale" &&
                                "text-danger font-medium",
                            )}
                          >
                            {formatAge(msg.created_at)}
                          </span>
                        </div>
                      </div>

                      {/* Customer id */}
                      <p className="text-xs text-muted-foreground font-mono truncate mb-2">
                        {msg.customer_id}
                      </p>

                      {/* Message body */}
                      <p
                        className="text-sm text-foreground whitespace-pre-wrap break-words mb-3"
                        dir="auto"
                      >
                        {msg.content}
                      </p>

                      {/* Actions */}
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => act(msg.id, "reject")}
                          disabled={acting}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-danger hover:border-danger/40 hover:bg-danger/5 disabled:opacity-50 transition-colors"
                        >
                          {acting ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <X size={12} />
                          )}
                          Reject
                        </button>
                        <button
                          onClick={() => act(msg.id, "approve")}
                          disabled={acting}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                        >
                          {acting ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} />
                          )}
                          Approve &amp; send
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
