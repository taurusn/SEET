"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";
import { Bot, User, MessageSquare, UserCheck, Send } from "lucide-react";

interface Message {
  id: string;
  direction: string;
  content: string;
  sender_type: string | null;
  status: string;
  created_at: string;
}

interface ConversationThreadProps {
  conversationId: string;
  conversationStatus?: string;
}

export function ConversationThread({ conversationId, conversationStatus }: ConversationThreadProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(() => {
    api
      .get<Message[]>(
        `/api/v1/shop/conversations/${conversationId}/messages?limit=100`
      )
      .then(setMessages)
      .catch(() => setMessages([]));
  }, [conversationId]);

  useEffect(() => {
    setLoading(true);
    api
      .get<Message[]>(
        `/api/v1/shop/conversations/${conversationId}/messages?limit=100`
      )
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, [conversationId]);

  useEffect(() => {
    if (!loading && endRef.current) {
      endRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [loading, messages]);

  async function handleSendReply() {
    const text = replyText.trim();
    if (!text || sending) return;

    setSending(true);
    try {
      await api.post(`/api/v1/shop/conversations/${conversationId}/reply`, {
        message: text,
      });
      setReplyText("");
      fetchMessages();
    } finally {
      setSending(false);
    }
  }

  // Intercept copy to prepend sender labels (العميل / الموظف)
  const handleCopy = useCallback((e: React.ClipboardEvent) => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;

    const container = containerRef.current;
    if (!container) return;

    const bubbles = container.querySelectorAll("[data-sender]");
    const lines: string[] = [];

    bubbles.forEach((bubble) => {
      if (selection.containsNode(bubble, true)) {
        const sender = bubble.getAttribute("data-sender");
        const text = bubble.textContent?.trim();
        if (text) {
          lines.push(`${sender}: ${text}`);
        }
      }
    });

    if (lines.length > 0) {
      e.preventDefault();
      e.clipboardData?.setData("text/plain", lines.join("\n"));
    }
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-muted-foreground">جاري تحميل الرسائل...</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
          <MessageSquare className="w-7 h-7 opacity-50" />
        </div>
        <p className="font-medium text-foreground/60">لا توجد رسائل</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div ref={containerRef} onCopy={handleCopy} className="space-y-3 p-4 flex-1">
        {messages.map((msg, i) => {
          const isCustomer = msg.direction === "inbound";
          const isHuman = msg.sender_type === "human";
          const showTime =
            i === 0 ||
            new Date(msg.created_at).getTime() -
              new Date(messages[i - 1].created_at).getTime() >
              600000;

          return (
            <div key={msg.id}>
              {showTime && (
                <p className="text-center text-[11px] text-muted-foreground my-3">
                  {timeAgo(msg.created_at)}
                </p>
              )}
              <div
                className={cn(
                  "flex gap-2 max-w-[80%]",
                  isCustomer ? "mr-auto flex-row-reverse" : "ml-auto"
                )}
              >
                <div
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1",
                    isCustomer
                      ? "bg-muted text-muted-foreground"
                      : isHuman
                        ? "bg-warning/10 text-warning"
                        : "bg-primary/10 text-primary"
                  )}
                >
                  {isCustomer ? (
                    <User className="w-3.5 h-3.5" />
                  ) : isHuman ? (
                    <UserCheck className="w-3.5 h-3.5" />
                  ) : (
                    <Bot className="w-3.5 h-3.5" />
                  )}
                </div>
                <div>
                  {isHuman && (
                    <p className="text-[10px] text-warning font-medium mb-0.5 text-left">المسؤول</p>
                  )}
                  <div
                    data-sender={isCustomer ? "العميل" : isHuman ? "المسؤول" : "الموظف"}
                    className={cn(
                      "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                      isCustomer
                        ? "bg-muted text-foreground rounded-br-sm"
                        : isHuman
                          ? "bg-warning/10 text-foreground border border-warning/20 rounded-bl-sm"
                          : "bg-primary text-primary-foreground rounded-bl-sm"
                    )}
                  >
                    {msg.content}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Owner reply input — only shown when conversation is in human mode */}
      {conversationStatus === "human" && (
        <div className="border-t border-border p-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendReply();
                }
              }}
              placeholder="اكتب رد للعميل..."
              className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              disabled={sending}
            />
            <button
              onClick={handleSendReply}
              disabled={sending || !replyText.trim()}
              className="px-4 py-2.5 rounded-xl bg-warning text-warning-foreground font-medium text-sm hover:bg-warning/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              إرسال
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
