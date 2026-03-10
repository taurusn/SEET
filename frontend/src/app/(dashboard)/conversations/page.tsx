"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import type { SSEEvent } from "@/lib/sse";
import { ConversationList } from "@/components/conversation-list";
import { ConversationThread } from "@/components/conversation-thread";
import { MessageSquare, XCircle, Search, Download, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  platform: string;
  customer_id: string;
  status: string;
  initial_sentiment?: string | null;
  current_sentiment?: string | null;
  created_at: string;
}

interface CustomerProfile {
  display_name?: string;
  notes?: string | null;
  total_conversations: number;
  first_seen_at: string;
}

interface Visit {
  id: string;
  visit_number: number;
  initial_sentiment?: string | null;
  current_sentiment?: string | null;
  message_count: number;
  started_at: string;
  ended_at?: string | null;
}

export default function ConversationsPage() {
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("id"));
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ platform: "", status: "" });
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [customerNotes, setCustomerNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const [visits, setVisits] = useState<Visit[]>([]);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchConversations = useCallback(() => {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (filter.platform) params.set("platform", filter.platform);
    if (filter.status) params.set("status", filter.status);
    if (searchDebounced) params.set("search", searchDebounced);

    return api
      .get<Conversation[]>(`/api/v1/shop/conversations?${params}`)
      .then((data) => {
        setConversations(data);
        // Auto-select first conversation only on desktop (md: 768px+)
        if (data.length > 0 && !selectedIdRef.current && window.innerWidth >= 768) {
          setSelectedId(data[0].id);
        }
      });
  }, [filter, searchDebounced]);

  useEffect(() => {
    setLoading(true);
    fetchConversations().finally(() => setLoading(false));
  }, [fetchConversations]);

  // Listen for SSE events dispatched from layout
  useEffect(() => {
    function handleSSE(e: Event) {
      const { type, data } = (e as CustomEvent<SSEEvent>).detail;
      const convoId = data.conversation_id as string | undefined;

      if (type === "new_message") {
        // Refresh thread if it's the active conversation
        if (convoId && convoId === selectedIdRef.current) {
          setRefreshKey((k) => k + 1);
        }
        // Refresh conversation list to update order/preview
        fetchConversations();
      }

      if (type === "handoff_triggered" || type === "conversation_updated") {
        fetchConversations();
        if (convoId && convoId === selectedIdRef.current) {
          setRefreshKey((k) => k + 1);
        }
      }
    }

    window.addEventListener("sse", handleSSE);
    return () => window.removeEventListener("sse", handleSSE);
  }, [fetchConversations]);

  useEffect(() => {
    if (!selectedId) {
      setCustomerProfile(null);
      setCustomerNotes("");
      setVisits([]);
      return;
    }
    const convo = conversations.find((c) => c.id === selectedId);
    if (convo && convo.platform !== "playground") {
      api
        .get<CustomerProfile>(`/api/v1/shop/customers/${convo.platform}/${convo.customer_id}`)
        .then((p) => {
          setCustomerProfile(p);
          setCustomerNotes(p.notes || "");
        })
        .catch(() => {
          setCustomerProfile(null);
          setCustomerNotes("");
        });
    } else {
      setCustomerProfile(null);
      setCustomerNotes("");
    }
    // Fetch visit history
    api
      .get<Visit[]>(`/api/v1/shop/conversations/${selectedId}/visits`)
      .then(setVisits)
      .catch(() => setVisits([]));
  }, [selectedId]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">المحادثات</h1>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="بحث عن عميل أو محتوى..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pr-9 pl-4 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={filter.platform}
          onChange={(e) => setFilter({ ...filter, platform: e.target.value })}
          className="px-3 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">كل المنصات</option>
          <option value="instagram">انستقرام</option>
          <option value="whatsapp">واتساب</option>
        </select>
        <select
          value={filter.status}
          onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          className="px-3 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">كل الحالات</option>
          <option value="ai">ذكاء اصطناعي</option>
          <option value="human">بشري</option>
          <option value="closed">مغلق</option>
        </select>
      </div>

      {/* Split pane */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Conversation list — hidden on mobile when a thread is selected */}
        <div className={cn(
          "md:col-span-1 bg-card rounded-2xl border border-border shadow-sm overflow-hidden max-h-[70vh] overflow-y-auto",
          selectedId ? "hidden md:block" : "block"
        )}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <ConversationList
              conversations={conversations}
              selectedId={selectedId ?? undefined}
              onSelect={setSelectedId}
            />
          )}
        </div>

        {/* Thread — hidden on mobile when no thread is selected */}
        <div className={cn(
          "md:col-span-2 bg-card rounded-2xl border border-border shadow-sm max-h-[70vh] overflow-y-auto",
          selectedId ? "block" : "hidden md:block"
        )}>
          {selectedId ? (
            <div>
              <div className="p-4 border-b border-border">
                {/* Mobile back button */}
                <button
                  onClick={() => setSelectedId(null)}
                  className="md:hidden flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-2 -mt-1"
                >
                  <ArrowRight className="w-4 h-4" />
                  العودة للقائمة
                </button>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">
                        {customerProfile?.display_name || conversations.find((c) => c.id === selectedId)?.customer_id}
                      </p>
                      {customerProfile && customerProfile.total_conversations > 1 && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary whitespace-nowrap">
                          عميل عائد ({customerProfile.total_conversations} محادثات)
                        </span>
                      )}
                      {(() => {
                        const convo = conversations.find((c) => c.id === selectedId);
                        if (convo?.initial_sentiment && convo?.current_sentiment && convo.initial_sentiment !== convo.current_sentiment) {
                          const colors: Record<string, string> = { positive: "text-green-500", neutral: "text-gray-400", negative: "text-red-500" };
                          const labels: Record<string, string> = { positive: "ايجابي", neutral: "محايد", negative: "سلبي" };
                          return (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted whitespace-nowrap">
                              <span className={colors[convo.initial_sentiment] || ""}>{labels[convo.initial_sentiment] || convo.initial_sentiment}</span>
                              {" → "}
                              <span className={colors[convo.current_sentiment] || ""}>{labels[convo.current_sentiment] || convo.current_sentiment}</span>
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {conversations.find((c) => c.id === selectedId)?.platform ===
                      "instagram"
                        ? "انستقرام"
                        : conversations.find((c) => c.id === selectedId)?.platform === "playground"
                          ? "ساحة التجربة"
                          : "واتساب"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={async () => {
                        try {
                          const token = localStorage.getItem("token");
                          const res = await fetch(`/api/v1/shop/conversations/${selectedId}/export?format=txt`, {
                            headers: { Authorization: `Bearer ${token}` },
                          });
                          if (!res.ok) return;
                          const blob = await res.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `conversation-${selectedId}.txt`;
                          a.click();
                          URL.revokeObjectURL(url);
                        } catch { /* network error — silent */ }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">تصدير</span>
                    </button>
                    {conversations.find((c) => c.id === selectedId)?.status !== "closed" && (
                      <button
                        onClick={async () => {
                          try {
                            await api.post(`/api/v1/shop/conversations/${selectedId}/close`, {});
                            fetchConversations();
                            setRefreshKey((k) => k + 1);
                          } catch { /* error handled by api client */ }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">إغلاق</span>
                      </button>
                    )}
                  </div>
                </div>
                {/* Customer notes (S-33) */}
                {customerProfile && (
                  <div className="pb-3 pt-1">
                    <textarea
                      value={customerNotes}
                      onChange={(e) => { setCustomerNotes(e.target.value); setNotesSaved(false); }}
                      onBlur={async () => {
                        const convo = conversations.find((c) => c.id === selectedId);
                        if (!convo) return;
                        try {
                          await api.patch(`/api/v1/shop/customers/${convo.platform}/${convo.customer_id}`, { notes: customerNotes });
                          setNotesSaved(true);
                          setTimeout(() => setNotesSaved(false), 2000);
                        } catch {}
                      }}
                      placeholder="أضف ملاحظات عن هذا العميل..."
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                      rows={2}
                    />
                    {notesSaved && <p className="text-[10px] text-success mt-0.5">تم الحفظ</p>}
                  </div>
                )}
                {/* Visit History (Phase 11) */}
                {visits.length > 0 && (
                  <div className="pb-3">
                    <details className="group">
                      <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                        سجل الزيارات ({visits.length} زيارة سابقة)
                      </summary>
                      <div className="mt-2 space-y-1.5">
                        {visits.map((v) => {
                          const colors: Record<string, string> = { positive: "text-green-500", neutral: "text-gray-400", negative: "text-red-500" };
                          const resolved = v.initial_sentiment === "negative" && v.current_sentiment === "positive";
                          const worsened = v.initial_sentiment === "positive" && v.current_sentiment === "negative";
                          return (
                            <div key={v.id} className="flex items-center gap-2 text-xs bg-muted/50 rounded-lg px-3 py-1.5">
                              <span className="font-medium">زيارة {v.visit_number}</span>
                              <span className="text-muted-foreground">{v.started_at.slice(0, 10)}</span>
                              <span className="text-muted-foreground">({v.message_count} رسائل)</span>
                              {v.initial_sentiment && v.current_sentiment && (
                                <span>
                                  <span className={colors[v.initial_sentiment] || ""}>{v.initial_sentiment}</span>
                                  {" → "}
                                  <span className={colors[v.current_sentiment] || ""}>{v.current_sentiment}</span>
                                  {resolved && " ✓"}
                                  {worsened && " ✗"}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  </div>
                )}
              </div>
              <ConversationThread
                conversationId={selectedId}
                conversationStatus={conversations.find((c) => c.id === selectedId)?.status}
                refreshKey={refreshKey}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
                <MessageSquare className="w-7 h-7 opacity-50" />
              </div>
              <p className="font-medium text-foreground/60">اختر محادثة لعرضها</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
