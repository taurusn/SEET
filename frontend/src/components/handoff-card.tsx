"use client";

import Link from "next/link";
import { timeAgo } from "@/lib/utils";
import { AlertTriangle, MessageSquare } from "lucide-react";

interface HandoffRequest {
  id: string;
  conversation_id: string;
  reason: string | null;
  notified: boolean;
  resolved_at: string | null;
  created_at: string;
}

interface HandoffCardProps {
  handoff: HandoffRequest;
  onResolve: (id: string) => void;
  onIssueVoucher: (handoff: HandoffRequest) => void;
  resolving?: boolean;
}

export function HandoffCard({
  handoff,
  onResolve,
  onIssueVoucher,
  resolving,
}: HandoffCardProps) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-warning" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium">
              محادثة #{handoff.conversation_id.slice(0, 8)}
            </p>
            <span className="text-xs text-muted-foreground">
              {timeAgo(handoff.created_at)}
            </span>
          </div>
          {handoff.reason && (
            <p className="text-sm text-muted-foreground mb-3">
              السبب: {handoff.reason}
            </p>
          )}
          <div className="flex gap-2 flex-wrap">
            <Link
              href={`/conversations?id=${handoff.conversation_id}`}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors flex items-center gap-1"
            >
              <MessageSquare className="w-3 h-3" />
              عرض المحادثة
            </Link>
            <button
              onClick={() => onResolve(handoff.id)}
              disabled={resolving}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors disabled:opacity-50"
            >
              تم الحل
            </button>
            <button
              onClick={() => onIssueVoucher(handoff)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              إصدار قسيمة
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
