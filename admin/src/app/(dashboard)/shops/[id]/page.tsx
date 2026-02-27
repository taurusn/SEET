"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Upload,
  Trash2,
  Plus,
  MessageSquare,
  ArrowUpRight,
  CheckCircle,
  Clock,
  Download,
} from "lucide-react";

interface ShopDetail {
  id: string;
  name: string;
  ig_page_id?: string;
  wa_phone_number_id?: string;
  wa_waba_id?: string;
  is_active: boolean;
  logo_url?: string;
  brand_color?: string;
  splash_text?: string;
  created_at: string;
  total_conversations: number;
  active_handoffs: number;
}

interface ContextItem {
  id: string;
  shop_id: string;
  context_type: string;
  content: string;
  updated_at: string;
}

interface Analytics {
  total_messages: number;
  total_escalations: number;
  ai_handled_pct: number;
  avg_response_time_ms: number;
  messages_by_hour: number[];
  messages_by_day: { date: string; messages: number; escalations: number }[];
  sentiment_breakdown: { positive: number; neutral: number; negative: number };
}

interface ConvoItem {
  id: string;
  platform: string;
  customer_id: string;
  status: string;
  sentiment?: string | null;
  created_at: string;
}

interface MessageItem {
  id: string;
  direction: string;
  sender_type: string;
  content: string;
  created_at: string;
}

const periods = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
];

export default function ShopDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [shop, setShop] = useState<ShopDetail | null>(null);
  const [contexts, setContexts] = useState<ContextItem[]>([]);
  const [tab, setTab] = useState<"profile" | "context" | "stats" | "conversations">("profile");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    ig_page_id: "",
    ig_access_token: "",
    wa_phone_number_id: "",
    wa_waba_id: "",
    wa_access_token: "",
    brand_color: "",
    splash_text: "",
  });
  const [newCtx, setNewCtx] = useState({ context_type: "menu", content: "" });
  const [error, setError] = useState("");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsPeriod, setAnalyticsPeriod] = useState("7d");
  const [convos, setConvos] = useState<ConvoItem[]>([]);
  const [convosLoading, setConvosLoading] = useState(false);
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const loadShop = useCallback(async () => {
    try {
      const data = await api.get<ShopDetail>(`/api/v1/admin/shops/${id}`);
      setShop(data);
      setForm({
        name: data.name,
        ig_page_id: data.ig_page_id || "",
        ig_access_token: "",
        wa_phone_number_id: data.wa_phone_number_id || "",
        wa_waba_id: data.wa_waba_id || "",
        wa_access_token: "",
        brand_color: data.brand_color || "",
        splash_text: data.splash_text || "",
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load shop");
    }
  }, [id]);

  const loadContexts = useCallback(async () => {
    try {
      const data = await api.get<ContextItem[]>(`/api/v1/admin/shops/${id}/context`);
      setContexts(data);
    } catch {
      // Non-critical: context list fails silently
    }
  }, [id]);

  useEffect(() => {
    loadShop();
    loadContexts();
  }, [loadShop, loadContexts]);

  useEffect(() => {
    if (tab === "stats") {
      api
        .get<Analytics>(`/api/v1/admin/shops/${id}/analytics?period=${analyticsPeriod}`)
        .then(setAnalytics)
        .catch(() => setAnalytics(null));
    }
  }, [id, tab, analyticsPeriod]);

  useEffect(() => {
    if (tab === "conversations") {
      setConvosLoading(true);
      api
        .get<ConvoItem[]>(`/api/v1/admin/shops/${id}/conversations?limit=100`)
        .then((data) => {
          setConvos(data);
          if (data.length > 0 && !selectedConvoId) setSelectedConvoId(data[0].id);
        })
        .catch(() => setConvos([]))
        .finally(() => setConvosLoading(false));
    }
  }, [id, tab]);

  useEffect(() => {
    if (selectedConvoId && tab === "conversations") {
      setMessagesLoading(true);
      api
        .get<MessageItem[]>(`/api/v1/admin/shops/${id}/conversations/${selectedConvoId}/messages`)
        .then(setMessages)
        .catch(() => setMessages([]))
        .finally(() => setMessagesLoading(false));
    }
  }, [id, selectedConvoId, tab]);

  const saveProfile = async () => {
    setSaving(true);
    setError("");
    try {
      const body: Record<string, string> = {};
      if (form.name !== shop?.name) body.name = form.name;
      if (form.ig_page_id !== (shop?.ig_page_id || ""))
        body.ig_page_id = form.ig_page_id;
      if (form.ig_access_token) body.ig_access_token = form.ig_access_token;
      if (form.wa_phone_number_id !== (shop?.wa_phone_number_id || ""))
        body.wa_phone_number_id = form.wa_phone_number_id;
      if (form.wa_waba_id !== (shop?.wa_waba_id || ""))
        body.wa_waba_id = form.wa_waba_id;
      if (form.wa_access_token) body.wa_access_token = form.wa_access_token;
      if (form.brand_color !== (shop?.brand_color || ""))
        body.brand_color = form.brand_color;
      if (form.splash_text !== (shop?.splash_text || ""))
        body.splash_text = form.splash_text;

      if (Object.keys(body).length > 0) {
        await api.patch(`/api/v1/admin/shops/${id}`, body);
        await loadShop();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.upload(`/api/v1/admin/shops/${id}/logo`, formData);
      await loadShop();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to upload logo");
    }
  };

  const handleLogoDelete = async () => {
    setError("");
    try {
      await api.delete(`/api/v1/admin/shops/${id}/logo`);
      await loadShop();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete logo");
    }
  };

  const toggleActive = async () => {
    setError("");
    try {
      await api.post(`/api/v1/admin/shops/${id}/toggle`);
      await loadShop();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to toggle status");
    }
  };

  const addContext = async () => {
    if (!newCtx.content.trim()) return;
    setError("");
    try {
      await api.post(`/api/v1/admin/shops/${id}/context`, newCtx);
      setNewCtx({ context_type: "menu", content: "" });
      await loadContexts();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add context");
    }
  };

  const deleteContext = async (ctxId: string) => {
    setError("");
    try {
      await api.delete(`/api/v1/admin/shops/${id}/context/${ctxId}`);
      await loadContexts();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete context");
    }
  };

  if (!shop && error) {
    return (
      <div className="flex justify-center py-12 text-danger text-sm">
        {error}
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => router.push("/shops")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft size={16} /> Back to shops
      </button>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          {shop.logo_url ? (
            <img
              src={shop.logo_url}
              alt=""
              className="w-12 h-12 rounded-xl object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
              {shop.name[0]}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold">{shop.name}</h1>
            <p className="text-sm text-muted-foreground">
              Created {formatDate(shop.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              const token = localStorage.getItem("admin_token");
              const res = await fetch(`/api/v1/admin/shops/${id}/export?type=conversations`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${shop.name}-conversations.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export Conversations
          </button>
          <button
            onClick={async () => {
              const token = localStorage.getItem("admin_token");
              const res = await fetch(`/api/v1/admin/shops/${id}/export?type=analytics&period=30d`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${shop.name}-analytics.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export Analytics
          </button>
          <button
            onClick={toggleActive}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              shop.is_active
                ? "bg-danger/10 text-danger hover:bg-danger/20"
                : "bg-success/10 text-success hover:bg-success/20"
            } transition-colors`}
          >
            {shop.is_active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-danger/10 text-danger text-sm">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {(["profile", "context", "stats", "conversations"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {tab === "profile" && (
        <div className="space-y-6 max-w-lg">
          <div>
            <label className="block text-sm font-medium mb-1">Shop Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Logo */}
          <div>
            <label className="block text-sm font-medium mb-2">Logo</label>
            <div className="flex items-center gap-3">
              {shop.logo_url && (
                <img
                  src={shop.logo_url}
                  alt=""
                  className="w-16 h-16 rounded-xl object-cover"
                />
              )}
              <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm cursor-pointer hover:bg-muted/30 transition-colors">
                <Upload size={14} />
                Upload
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </label>
              {shop.logo_url && (
                <button
                  onClick={handleLogoDelete}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-danger/30 text-danger text-sm hover:bg-danger/5 transition-colors"
                >
                  <Trash2 size={14} />
                  Remove
                </button>
              )}
            </div>
          </div>

          {/* White-label */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Brand Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.brand_color || "#4338ca"}
                  onChange={(e) =>
                    setForm({ ...form, brand_color: e.target.value })
                  }
                  className="w-10 h-10 rounded-lg border border-border cursor-pointer"
                />
                <input
                  value={form.brand_color}
                  onChange={(e) =>
                    setForm({ ...form, brand_color: e.target.value })
                  }
                  placeholder="#4338ca"
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Splash Text
              </label>
              <input
                value={form.splash_text}
                onChange={(e) =>
                  setForm({ ...form, splash_text: e.target.value })
                }
                placeholder="Welcome message..."
                className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Platform IDs */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              Instagram
            </h3>
            <input
              value={form.ig_page_id}
              onChange={(e) =>
                setForm({ ...form, ig_page_id: e.target.value })
              }
              placeholder="Instagram Page ID"
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <input
              value={form.ig_access_token}
              onChange={(e) =>
                setForm({ ...form, ig_access_token: e.target.value })
              }
              placeholder="Access Token (leave empty to keep current)"
              type="password"
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              WhatsApp
            </h3>
            <input
              value={form.wa_phone_number_id}
              onChange={(e) =>
                setForm({ ...form, wa_phone_number_id: e.target.value })
              }
              placeholder="Phone Number ID"
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <input
              value={form.wa_waba_id}
              onChange={(e) =>
                setForm({ ...form, wa_waba_id: e.target.value })
              }
              placeholder="WABA ID"
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <input
              value={form.wa_access_token}
              onChange={(e) =>
                setForm({ ...form, wa_access_token: e.target.value })
              }
              placeholder="Access Token (leave empty to keep current)"
              type="password"
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <button
            onClick={saveProfile}
            disabled={saving}
            className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}

      {/* Context Tab */}
      {tab === "context" && (
        <div className="space-y-4 max-w-lg">
          {contexts.map((ctx) => (
            <div
              key={ctx.id}
              className="bg-card border border-border rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium">
                  {ctx.context_type}
                </span>
                <button
                  onClick={() => deleteContext(ctx.id)}
                  className="text-muted-foreground hover:text-danger transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <p className="text-sm whitespace-pre-wrap">{ctx.content}</p>
            </div>
          ))}

          <div className="bg-card border border-border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-medium">Add Context</h3>
            <select
              value={newCtx.context_type}
              onChange={(e) =>
                setNewCtx({ ...newCtx, context_type: e.target.value })
              }
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="menu">Menu</option>
              <option value="hours">Hours</option>
              <option value="faq">FAQ</option>
              <option value="tone">Tone</option>
              <option value="sales">Sales</option>
              <option value="business_hours">Business Hours (JSON)</option>
            </select>
            <textarea
              value={newCtx.content}
              onChange={(e) =>
                setNewCtx({ ...newCtx, content: e.target.value })
              }
              rows={4}
              placeholder="Enter context content..."
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
            <button
              onClick={addContext}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus size={14} /> Add
            </button>
          </div>
        </div>
      )}

      {/* Conversations Tab (A-38) */}
      {tab === "conversations" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Conversation list */}
          <div className="md:col-span-1 bg-card rounded-xl border border-border overflow-hidden max-h-[70vh] overflow-y-auto">
            {convosLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : convos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No conversations</p>
            ) : (
              <div className="divide-y divide-border">
                {convos.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedConvoId(c.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 text-sm transition-colors",
                      selectedConvoId === c.id ? "bg-primary/5" : "hover:bg-muted/30"
                    )}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-medium truncate">{c.customer_id}</span>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-medium",
                        c.status === "ai" ? "bg-primary/10 text-primary" :
                        c.status === "human" ? "bg-warning/10 text-warning" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {c.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{c.platform}</span>
                      <span>{c.created_at?.slice(0, 10)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Message thread (read-only) */}
          <div className="md:col-span-2 bg-card rounded-xl border border-border max-h-[70vh] overflow-y-auto">
            {!selectedConvoId ? (
              <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                <MessageSquare className="w-7 h-7 opacity-50 mb-2" />
                <p className="text-sm">Select a conversation</p>
              </div>
            ) : messagesLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No messages</p>
            ) : (
              <div className="p-4 space-y-3">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[80%] px-3 py-2 rounded-xl text-sm",
                      m.direction === "inbound"
                        ? "bg-muted mr-auto"
                        : "bg-primary/10 ml-auto"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">
                        {m.sender_type}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {m.created_at?.slice(11, 16)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats Tab (A-40) */}
      {tab === "stats" && (
        <div>
          {/* Period selector */}
          <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit mb-6">
            {periods.map((p) => (
              <button
                key={p.value}
                onClick={() => setAnalyticsPeriod(p.value)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                  analyticsPeriod === p.value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {!analytics ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    <span className="text-xs text-muted-foreground">Messages</span>
                  </div>
                  <p className="text-xl font-bold">{analytics.total_messages}</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowUpRight className="w-4 h-4 text-warning" />
                    <span className="text-xs text-muted-foreground">Escalations</span>
                  </div>
                  <p className="text-xl font-bold">{analytics.total_escalations}</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-success" />
                    <span className="text-xs text-muted-foreground">AI Handled</span>
                  </div>
                  <p className="text-xl font-bold">{analytics.ai_handled_pct}%</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Avg Response</span>
                  </div>
                  <p className="text-xl font-bold">
                    {analytics.avg_response_time_ms < 1000
                      ? `${analytics.avg_response_time_ms}ms`
                      : `${(analytics.avg_response_time_ms / 1000).toFixed(1)}s`}
                  </p>
                </div>
              </div>

              {/* Charts row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                {/* Hourly distribution */}
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold mb-3">Messages by Hour</h3>
                  <div className="flex items-end gap-[3px] h-24">
                    {analytics.messages_by_hour.map((v, i) => {
                      const max = Math.max(...analytics.messages_by_hour, 1);
                      return (
                        <div
                          key={i}
                          className="flex-1 bg-primary/20 hover:bg-primary/40 rounded-sm transition-colors"
                          style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? "4px" : "1px" }}
                          title={`${i}:00 — ${v} messages`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-muted-foreground">0:00</span>
                    <span className="text-[10px] text-muted-foreground">12:00</span>
                    <span className="text-[10px] text-muted-foreground">23:00</span>
                  </div>
                </div>

                {/* Sentiment breakdown */}
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold mb-3">Sentiment</h3>
                  {(() => {
                    const total =
                      analytics.sentiment_breakdown.positive +
                      analytics.sentiment_breakdown.neutral +
                      analytics.sentiment_breakdown.negative;
                    if (total === 0) {
                      return <p className="text-sm text-muted-foreground py-4 text-center">No sentiment data yet</p>;
                    }
                    return (
                      <div className="space-y-3">
                        {[
                          { label: "Positive", value: analytics.sentiment_breakdown.positive, color: "bg-success" },
                          { label: "Neutral", value: analytics.sentiment_breakdown.neutral, color: "bg-muted-foreground" },
                          { label: "Negative", value: analytics.sentiment_breakdown.negative, color: "bg-danger" },
                        ].map((s) => (
                          <div key={s.label}>
                            <div className="flex justify-between text-xs mb-1">
                              <span>{s.label}</span>
                              <span className="text-muted-foreground">
                                {s.value} ({Math.round((s.value / total) * 100)}%)
                              </span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full ${s.color} rounded-full transition-all`}
                                style={{ width: `${(s.value / total) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Daily trend */}
              {analytics.messages_by_day.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold mb-3">Daily Messages</h3>
                  <div className="flex items-end gap-1 h-24">
                    {analytics.messages_by_day.map((day) => {
                      const max = Math.max(...analytics.messages_by_day.map((d) => d.messages), 1);
                      return (
                        <div
                          key={day.date}
                          className="flex-1 bg-success/20 hover:bg-success/40 rounded-sm transition-colors"
                          style={{ height: `${(day.messages / max) * 100}%`, minHeight: day.messages > 0 ? "4px" : "1px" }}
                          title={`${day.date} — ${day.messages} messages`}
                        />
                      );
                    })}
                  </div>
                  {analytics.messages_by_day.length > 1 && (
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-muted-foreground">{analytics.messages_by_day[0]?.date.slice(5)}</span>
                      <span className="text-[10px] text-muted-foreground">{analytics.messages_by_day[analytics.messages_by_day.length - 1]?.date.slice(5)}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
