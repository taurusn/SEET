"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ConversationList } from "@/components/conversation-list";
import { ConversationThread } from "@/components/conversation-thread";
import { MessageSquare } from "lucide-react";

interface Conversation {
  id: string;
  platform: string;
  customer_id: string;
  status: string;
  created_at: string;
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ platform: "", status: "" });

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (filter.platform) params.set("platform", filter.platform);
    if (filter.status) params.set("status", filter.status);

    api
      .get<Conversation[]>(`/api/v1/shop/conversations?${params}`)
      .then((data) => {
        setConversations(data);
        if (data.length > 0 && !selectedId) {
          setSelectedId(data[0].id);
        }
      })
      .finally(() => setLoading(false));
  }, [filter]);

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
                <p className="text-sm font-medium">
                  {conversations.find((c) => c.id === selectedId)?.customer_id}
                </p>
                <p className="text-xs text-muted-foreground">
                  {conversations.find((c) => c.id === selectedId)?.platform ===
                  "instagram"
                    ? "انستقرام"
                    : "واتساب"}
                </p>
              </div>
              <ConversationThread conversationId={selectedId} />
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
