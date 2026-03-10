"use client";

import { cn, timeAgo } from "@/lib/utils";
import { MessageSquare } from "lucide-react";

interface Conversation {
  id: string;
  platform: string;
  customer_id: string;
  status: string;
  initial_sentiment?: string | null;
  current_sentiment?: string | null;
  created_at: string;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

const statusColors: Record<string, string> = {
  ai: "bg-success",
  human: "bg-warning",
  closed: "bg-muted-foreground",
};

const sentimentColors: Record<string, string> = {
  positive: "bg-green-500",
  neutral: "bg-gray-400",
  negative: "bg-red-500",
};

const platformLabels: Record<string, string> = {
  instagram: "انستقرام",
  whatsapp: "واتساب",
};

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
          <MessageSquare className="w-7 h-7 opacity-50" />
        </div>
        <p className="font-medium text-foreground/60">لا توجد محادثات</p>
        <p className="text-xs mt-1">المحادثات الجديدة ستظهر هنا</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {conversations.map((convo) => (
        <button
          key={convo.id}
          onClick={() => onSelect(convo.id)}
          className={cn(
            "w-full text-right p-4 transition-colors",
            selectedId === convo.id
              ? "bg-primary/10 border-r-2 border-primary"
              : "hover:bg-muted/50"
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">
              {timeAgo(convo.created_at)}
            </span>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "w-2 h-2 rounded-full",
                  statusColors[convo.status] || "bg-muted-foreground"
                )}
              />
              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {platformLabels[convo.platform] || convo.platform}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {convo.current_sentiment && (
              <span
                className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  sentimentColors[convo.current_sentiment] || "bg-gray-400"
                )}
                title={
                  convo.initial_sentiment && convo.current_sentiment && convo.initial_sentiment !== convo.current_sentiment
                    ? `${convo.initial_sentiment} → ${convo.current_sentiment}`
                    : convo.current_sentiment
                }
              />
            )}
            <p className="text-sm font-medium truncate">{convo.customer_id}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
