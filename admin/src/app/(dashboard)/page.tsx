"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { StatsCard } from "@/components/stats-card";
import {
  Store,
  MessageSquare,
  MessagesSquare,
  AlertTriangle,
  Ticket,
  CheckCircle,
} from "lucide-react";

interface PlatformStats {
  total_shops: number;
  active_shops: number;
  total_conversations: number;
  total_messages: number;
  active_handoffs: number;
  total_vouchers: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<PlatformStats>("/api/v1/admin/stats")
      .then(setStats)
      .catch((e) => setError(e.message || "Failed to load stats"));
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-danger text-sm">
        {error}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatsCard label="Total Shops" value={stats.total_shops} icon={Store} />
        <StatsCard label="Active Shops" value={stats.active_shops} icon={CheckCircle} />
        <StatsCard label="Conversations" value={stats.total_conversations} icon={MessagesSquare} />
        <StatsCard label="Messages" value={stats.total_messages} icon={MessageSquare} />
        <StatsCard label="Active Handoffs" value={stats.active_handoffs} icon={AlertTriangle} />
        <StatsCard label="Vouchers Issued" value={stats.total_vouchers} icon={Ticket} />
      </div>
    </div>
  );
}
