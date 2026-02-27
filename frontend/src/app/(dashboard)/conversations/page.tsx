"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import type { SSEEvent } from "@/lib/sse";
import { ConversationList } from "@/components/conversation-list";
import { ConversationThread } from "@/components/conversation-thread";
import { MessageSquare } from "lucide-react";

interface Conversation {
  id: string;
  platform: string;
  customer_id: string;
  status: string;
  sentiment?: string | null;
  created_at: string;
}

interface CustomerProfile {
  display_name?: string;
  total_conversations: number;
  first_seen_at: string;
}

export default function ConversationsPage() {
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("id"));
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ platform: "", status: "" });
  const [refreshKey, setRefreshKey] = useState(0);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const fetchConversations = useCallback(() => {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (filter.platform) params.set("platform", filter.platform);
    if (filter.status) params.set("status", filter.status);

    return api
      .get<Conversation[]>(`/api/v1/shop/conversations?${params}`)
      .then((data) => {
        setConversations(data);
        if (data.length > 0 && !selectedIdRef.current) {
          setSelectedId(data[0].id);
        }
      });
  }, [filter]);

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
      return;
    }
    const convo = conversations.find((c) => c.id === selectedId);
    if (convo && convo.platform !== "playground") {
      api
        .get<CustomerProfile>(`/api/v1/shop/customers/${convo.platform}/${convo.customer_id}`)
        .then(setCustomerProfile)
        .catch(() => setCustomerProfile(null));
    } else {
      setCustomerProfile(null);
    }
  }, [selectedId]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">المحادثات</h1>

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
        {/* Conversation list */}
        <div className="md:col-span-1 bg-card rounded-2xl border border-border shadow-sm overflow-hidden max-h-[70vh] overflow-y-auto">
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

        {/* Thread */}
        <div className="md:col-span-2 bg-card rounded-2xl border border-border shadow-sm max-h-[70vh] overflow-y-auto">
          {selectedId ? (
            <div>
              <div className="p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">
                    {customerProfile?.display_name || conversations.find((c) => c.id === selectedId)?.customer_id}
                  </p>
                  {customerProfile && customerProfile.total_conversations > 1 && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      عميل عائد ({customerProfile.total_conversations} محادثات)
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {conversations.find((c) => c.id === selectedId)?.platform ===
                  "instagram"
                    ? "انستقرام"
                    : "واتساب"}
                </p>
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
