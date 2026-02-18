"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        لا توجد رسائل
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {messages.map((msg) => {
        const isCustomer = msg.direction === "inbound";
        return (
          <div
            key={msg.id}
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
                "rounded-2xl px-4 py-2.5 text-sm",
                isCustomer
                  ? "bg-muted text-foreground rounded-br-sm"
                  : "bg-primary text-primary-foreground rounded-bl-sm"
              )}
            >
              {msg.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
