"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";
import { Bot, User, MessageSquare } from "lucide-react";

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
}

export function ConversationThread({ conversationId }: ConversationThreadProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

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
    <div className="space-y-3 p-4">
      {messages.map((msg, i) => {
        const isCustomer = msg.direction === "inbound";
        // Show timestamp if first message or 10+ min gap from previous
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
                    : "bg-primary/10 text-primary"
                )}
              >
                {isCustomer ? (
                  <User className="w-3.5 h-3.5" />
                ) : (
                  <Bot className="w-3.5 h-3.5" />
                )}
              </div>
              <div
                className={cn(
                  "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  isCustomer
                    ? "bg-muted text-foreground rounded-br-sm"
                    : "bg-primary text-primary-foreground rounded-bl-sm"
                )}
              >
                {msg.content}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
