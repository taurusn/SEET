"use client";

import { cn, timeAgo } from "@/lib/utils";
import { MessageSquare } from "lucide-react";

interface Conversation {
  id: string;
  platform: string;
  customer_id: string;
  status: string;
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

const platformLabels: Record<string, string> = {
  instagram: "IG",
  whatsapp: "WA",
};

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <MessageSquare className="w-10 h-10 mb-3 opacity-40" />
        <p>لا توجد محادثات</p>
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
            "w-full text-right p-4 hover:bg-muted/50 transition-colors",
            selectedId === convo.id && "bg-primary/5 border-r-2 border-primary"
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
          <p className="text-sm font-medium truncate">{convo.customer_id}</p>
        </button>
      ))}
    </div>
  );
}
