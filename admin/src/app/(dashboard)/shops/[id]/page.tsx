"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, Upload, Trash2, Plus } from "lucide-react";

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

export default function ShopDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [shop, setShop] = useState<ShopDetail | null>(null);
  const [contexts, setContexts] = useState<ContextItem[]>([]);
  const [tab, setTab] = useState<"profile" | "context" | "stats">("profile");
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

  const loadShop = useCallback(async () => {
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
  }, [id]);

  const loadContexts = useCallback(async () => {
    const data = await api.get<ContextItem[]>(`/api/v1/admin/shops/${id}/context`);
    setContexts(data);
  }, [id]);

  useEffect(() => {
    loadShop();
    loadContexts();
  }, [loadShop, loadContexts]);

  const saveProfile = async () => {
    setSaving(true);
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
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    await api.upload(`/api/v1/admin/shops/${id}/logo`, formData);
    await loadShop();
  };

  const handleLogoDelete = async () => {
    await api.delete(`/api/v1/admin/shops/${id}/logo`);
    await loadShop();
  };

  const toggleActive = async () => {
    await api.post(`/api/v1/admin/shops/${id}/toggle`);
    await loadShop();
  };

  const addContext = async () => {
    if (!newCtx.content.trim()) return;
    await api.post(`/api/v1/admin/shops/${id}/context`, newCtx);
    setNewCtx({ context_type: "menu", content: "" });
    await loadContexts();
  };

  const deleteContext = async (ctxId: string) => {
    await api.delete(`/api/v1/admin/shops/${id}/context/${ctxId}`);
    await loadContexts();
  };

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

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {(["profile", "context", "stats"] as const).map((t) => (
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

      {/* Stats Tab */}
      {tab === "stats" && (
        <div className="grid grid-cols-2 gap-4 max-w-lg">
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-2xl font-bold">{shop.total_conversations}</p>
            <p className="text-sm text-muted-foreground">Conversations</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-2xl font-bold">{shop.active_handoffs}</p>
            <p className="text-sm text-muted-foreground">Active Handoffs</p>
          </div>
        </div>
      )}
    </div>
  );
}
