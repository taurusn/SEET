"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatDate, cn } from "@/lib/utils";
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
  ShieldCheck,
  Check,
  X,
  Loader2,
  KeyRound,
  Copy,
  AlertTriangle,
} from "lucide-react";

interface ShopDetail {
  id: string;
  name: string;
  ig_page_id?: string;
  wa_phone_number_id?: string;
  wa_waba_id?: string;
  is_active: boolean;
  moderation_mode: string;
  // Per-shop Meta App (nullable — populated once admin runs the Meta setup).
  meta_app_id?: string | null;
  has_meta_app_secret?: boolean;
  meta_verify_token?: string | null;
  logo_url?: string;
  brand_color?: string;
  splash_text?: string;
  created_at: string;
  total_conversations: number;
  active_handoffs: number;
}

type ProcessingMode = "auto" | "review" | "inactive";

function modeOf(shop: ShopDetail | null): ProcessingMode {
  if (!shop) return "inactive";
  if (!shop.is_active) return "inactive";
  return shop.moderation_mode === "pending" ? "review" : "auto";
}

const MODE_COPY: Record<ProcessingMode, string> = {
  auto: "AI replies to incoming messages automatically.",
  review:
    "New messages queue in the Moderation tab until an admin approves them.",
  inactive:
    "Shop is off. Incoming Meta events are dropped. No replies, no storage.",
};

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
  sentiment_transitions?: { resolved: number; worsened: number };
}

interface ConvoItem {
  id: string;
  platform: string;
  customer_id: string;
  status: string;
  initial_sentiment?: string | null;
  current_sentiment?: string | null;
  created_at: string;
}

interface MessageItem {
  id: string;
  direction: string;
  sender_type: string;
  content: string;
  created_at: string;
}

interface VisitItem {
  id: string;
  visit_number: number;
  initial_sentiment?: string | null;
  current_sentiment?: string | null;
  message_count: number;
  started_at: string;
  ended_at?: string | null;
}

interface VerifyCheck {
  name: string;
  ok: boolean;
  detail?: string;
}
interface VerifyPlatformResult {
  platform: string;
  ok: boolean;
  checks: VerifyCheck[];
}
interface VerifyResponse {
  shop_id: string;
  ok: boolean;
  results: VerifyPlatformResult[];
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
  const selectedConvoIdRef = useRef(selectedConvoId);
  selectedConvoIdRef.current = selectedConvoId;
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [visits, setVisits] = useState<VisitItem[]>([]);

  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [accepting, setAccepting] = useState(false);

  const [credsOpen, setCredsOpen] = useState(false);
  const [credsEmail, setCredsEmail] = useState("");
  const [credsPassword, setCredsPassword] = useState("");
  const [credsSaving, setCredsSaving] = useState(false);
  const [credsResult, setCredsResult] = useState<{
    email: string;
    temporary_password: string;
  } | null>(null);
  const [credsCopied, setCredsCopied] = useState(false);

  // Meta App editor (per-shop architecture)
  const [metaAppOpen, setMetaAppOpen] = useState(false);
  const [metaApp, setMetaApp] = useState({
    meta_app_id: "",
    meta_app_secret: "",
    meta_verify_token: "",
  });
  const [metaAppSaving, setMetaAppSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
      })
      .catch(() => {});
  };

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
          if (data.length > 0 && !selectedConvoIdRef.current) setSelectedConvoId(data[0].id);
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
      api
        .get<VisitItem[]>(`/api/v1/admin/shops/${id}/conversations/${selectedConvoId}/visits`)
        .then(setVisits)
        .catch(() => setVisits([]));
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

  // Switch processing mode from the segmented control.
  //   auto     — is_active=true, moderation_mode="auto"
  //   review   — is_active=true, moderation_mode="pending"
  //   inactive — is_active=false (via bidirectional /toggle)
  //
  // Reactivation from inactive uses /toggle (now bidirectional) followed
  // by a PATCH to set the desired moderation_mode.
  const switchMode = async (next: ProcessingMode) => {
    if (!shop) return;
    const current = modeOf(shop);
    if (next === current) return;
    setError("");

    try {
      if (next === "inactive") {
        if (!shop.is_active) return;
        await api.post(`/api/v1/admin/shops/${id}/toggle`);
        await loadShop();
        return;
      }

      // Reactivating — flip is_active on via /toggle, then set mode.
      if (!shop.is_active) {
        await api.post(`/api/v1/admin/shops/${id}/toggle`);
      }

      // auto ↔ review (and the post-activation mode set) — PATCH mode.
      await api.patch(`/api/v1/admin/shops/${id}`, {
        moderation_mode: next === "review" ? "pending" : "auto",
      });
      await loadShop();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to change mode");
    }
  };

  const runVerify = async () => {
    setVerifying(true);
    setError("");
    try {
      const res = await api.post<VerifyResponse>(
        `/api/v1/admin/shops/${id}/verify`,
      );
      setVerifyResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Verification call failed");
    } finally {
      setVerifying(false);
    }
  };

  const submitCredentials = async () => {
    setCredsSaving(true);
    setError("");
    setCredsCopied(false);
    try {
      const body: Record<string, string> = { email: credsEmail.trim() };
      if (credsPassword.trim()) body.password = credsPassword.trim();
      const res = await api.post<{
        email: string;
        temporary_password: string;
      }>(`/api/v1/admin/shops/${id}/credentials`, body);
      setCredsResult({
        email: res.email,
        temporary_password: res.temporary_password,
      });
      setCredsPassword("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save credentials");
    } finally {
      setCredsSaving(false);
    }
  };

  const closeCredsModal = () => {
    setCredsOpen(false);
    setCredsResult(null);
    setCredsEmail("");
    setCredsPassword("");
    setCredsCopied(false);
  };

  const openMetaEditor = () => {
    setMetaApp({
      meta_app_id: shop?.meta_app_id || "",
      meta_app_secret: "", // never prefilled — enter to update
      meta_verify_token: shop?.meta_verify_token || "",
    });
    setMetaAppOpen(true);
  };

  const saveMetaApp = async () => {
    setMetaAppSaving(true);
    setError("");
    try {
      // PATCH only sends fields the admin actually touched so blank
      // meta_app_secret doesn't wipe the stored one.
      const body: Record<string, string> = {};
      const newId = metaApp.meta_app_id.trim();
      const newVerify = metaApp.meta_verify_token.trim();
      const newSecret = metaApp.meta_app_secret.trim();
      if (newId !== (shop?.meta_app_id || "")) body.meta_app_id = newId;
      if (newVerify !== (shop?.meta_verify_token || ""))
        body.meta_verify_token = newVerify;
      if (newSecret) body.meta_app_secret = newSecret;
      if (Object.keys(body).length > 0) {
        await api.patch(`/api/v1/admin/shops/${id}`, body);
      }
      await loadShop();
      setMetaAppOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save Meta App settings");
    } finally {
      setMetaAppSaving(false);
    }
  };

  const acceptShop = async () => {
    setAccepting(true);
    setError("");
    try {
      await api.post(`/api/v1/admin/shops/${id}/accept`);
      await loadShop();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Activation failed");
    } finally {
      setAccepting(false);
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
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{shop.name}</h1>
              {(() => {
                const current = modeOf(shop);
                return (
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide",
                      current === "auto" && "bg-success/10 text-success",
                      current === "review" && "bg-warning/10 text-warning",
                      current === "inactive" && "bg-muted text-muted-foreground",
                    )}
                  >
                    {current === "auto"
                      ? "Auto"
                      : current === "review"
                      ? "Review"
                      : "Inactive"}
                  </span>
                );
              })()}
            </div>
            <p className="text-sm text-muted-foreground">
              Created {formatDate(shop.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              try {
                const token = localStorage.getItem("admin_token");
                const res = await fetch(`/api/v1/admin/shops/${id}/export?type=conversations`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) { setError("Export failed"); return; }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${shop.name}-conversations.csv`;
                a.click();
                URL.revokeObjectURL(url);
              } catch { setError("Export failed"); }
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export Conversations
          </button>
          <button
            onClick={async () => {
              try {
                const token = localStorage.getItem("admin_token");
                const res = await fetch(`/api/v1/admin/shops/${id}/export?type=analytics&period=30d`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) { setError("Export failed"); return; }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${shop.name}-analytics.csv`;
                a.click();
                URL.revokeObjectURL(url);
              } catch { setError("Export failed"); }
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export Analytics
          </button>
          <button
            onClick={runVerify}
            disabled={verifying}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 disabled:opacity-50 transition-colors"
          >
            {verifying ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5" />
            )}
            {verifying ? "Verifying..." : "Run verification"}
          </button>
          <button
            onClick={() => {
              setCredsEmail("");
              setCredsPassword("");
              setCredsResult(null);
              setCredsOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5" />
            Set login credentials
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-danger/10 text-danger text-sm">
          {error}
        </div>
      )}

      {verifyResult && (
        <div className="mb-6 bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Meta credential checks</h3>
              {verifyResult.ok ? (
                <span className="inline-flex items-center gap-1 text-xs text-success font-medium">
                  <Check size={12} /> all passed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-danger font-medium">
                  <X size={12} /> checks failed
                </span>
              )}
            </div>
            <button
              onClick={() => setVerifyResult(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              Dismiss
            </button>
          </div>

          <div className="space-y-4">
            {verifyResult.results.map((platform) => (
              <div key={platform.platform}>
                <div className="flex items-center gap-2 text-sm font-medium mb-2">
                  <span className="capitalize">{platform.platform}</span>
                  {platform.ok ? (
                    <span className="inline-flex items-center gap-1 text-xs text-success">
                      <Check size={12} /> passed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-danger">
                      <X size={12} /> failed
                    </span>
                  )}
                </div>
                <ul className="space-y-1 text-xs pl-1">
                  {platform.checks.map((c, i) => (
                    <li key={i} className="flex items-start gap-2">
                      {c.ok ? (
                        <Check
                          size={12}
                          className="text-success mt-0.5 shrink-0"
                        />
                      ) : (
                        <X size={12} className="text-danger mt-0.5 shrink-0" />
                      )}
                      <span>
                        <span className="font-mono">{c.name}</span>
                        {c.detail && (
                          <span className="text-muted-foreground">
                            {" "}
                            — {c.detail}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {!shop.is_active && (
            <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {verifyResult.ok
                  ? "All checks passed. You can activate this shop now."
                  : "Fix the failing checks above, save, and re-run verification."}
              </p>
              <button
                onClick={acceptShop}
                disabled={accepting || !verifyResult.ok}
                className="flex items-center gap-1 px-4 py-2 rounded-lg bg-success text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {accepting ? "Activating..." : "Accept & Activate"}
                <Check size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Processing mode — three-state segmented control */}
      {(() => {
        const current = modeOf(shop);
        const OPTIONS: { value: ProcessingMode; label: string }[] = [
          { value: "auto", label: "Auto" },
          { value: "review", label: "Review" },
          { value: "inactive", label: "Inactive" },
        ];
        return (
          <div className="mb-6 bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Processing mode
                </h3>
                <p className="text-sm text-foreground">{MODE_COPY[current]}</p>
              </div>
              <div
                className="inline-flex rounded-lg border border-border bg-muted/40 p-1"
                role="radiogroup"
                aria-label="Processing mode"
              >
                {OPTIONS.map((opt) => {
                  const selected = current === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => switchMode(opt.value)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors min-w-[72px]",
                        selected
                          ? opt.value === "auto"
                            ? "bg-card text-success shadow-sm"
                            : opt.value === "review"
                            ? "bg-card text-warning shadow-sm"
                            : "bg-card text-muted-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Meta App / webhook configuration */}
      {(() => {
        const webhookBase =
          typeof window !== "undefined" ? window.location.origin : "https://seet.cloud";
        const igUrl = `${webhookBase}/webhook/instagram/${shop.id}`;
        const waUrl = `${webhookBase}/webhook/whatsapp/${shop.id}`;
        const configured = !!shop.meta_app_id && !!shop.has_meta_app_secret;
        return (
          <div className="mb-6 bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Meta App / Webhook configuration
                </h3>
                <p className="text-xs text-muted-foreground max-w-prose">
                  Each shop brings their own Meta App. Set the App ID +
                  Secret below, then copy the URLs and Verify Token into the
                  shop&apos;s Meta App webhook settings.
                </p>
              </div>
              <button
                onClick={openMetaEditor}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5" />
                {configured ? "Edit Meta App" : "Set Meta App"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {/* App ID */}
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-muted-foreground font-medium">Meta App ID</span>
                  {shop.meta_app_id && (
                    <a
                      href={`https://developers.facebook.com/apps/${shop.meta_app_id}/dashboard/`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-primary hover:underline"
                    >
                      Manage in Meta ↗
                    </a>
                  )}
                </div>
                <div className="font-mono break-all">
                  {shop.meta_app_id || (
                    <span className="text-muted-foreground italic">not set</span>
                  )}
                </div>
              </div>

              {/* App Secret (presence only) */}
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-muted-foreground font-medium">App Secret</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {shop.has_meta_app_secret ? (
                    <>
                      <Check size={12} className="text-success" />
                      <span className="font-mono">configured</span>
                    </>
                  ) : (
                    <>
                      <X size={12} className="text-danger" />
                      <span className="text-muted-foreground italic">not set</span>
                    </>
                  )}
                </div>
              </div>

              {/* Verify Token (copy for Meta dashboard) */}
              <div className="bg-muted/30 rounded-lg p-3 md:col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-muted-foreground font-medium">
                    Verify Token
                  </span>
                  {shop.meta_verify_token && (
                    <button
                      onClick={() =>
                        copyToClipboard(shop.meta_verify_token!, "verify")
                      }
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      {copied === "verify" ? (
                        <>
                          <Check size={12} /> copied
                        </>
                      ) : (
                        <>
                          <Copy size={12} /> copy
                        </>
                      )}
                    </button>
                  )}
                </div>
                <div className="font-mono break-all">
                  {shop.meta_verify_token || (
                    <span className="text-muted-foreground italic">not set</span>
                  )}
                </div>
              </div>

              {/* Webhook URLs */}
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-muted-foreground font-medium">
                    Instagram webhook URL
                  </span>
                  <button
                    onClick={() => copyToClipboard(igUrl, "ig-url")}
                    className="flex items-center gap-1 text-primary hover:underline"
                  >
                    {copied === "ig-url" ? (
                      <>
                        <Check size={12} /> copied
                      </>
                    ) : (
                      <>
                        <Copy size={12} /> copy
                      </>
                    )}
                  </button>
                </div>
                <div className="font-mono break-all text-[11px]">{igUrl}</div>
              </div>

              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-muted-foreground font-medium">
                    WhatsApp webhook URL
                  </span>
                  <button
                    onClick={() => copyToClipboard(waUrl, "wa-url")}
                    className="flex items-center gap-1 text-primary hover:underline"
                  >
                    {copied === "wa-url" ? (
                      <>
                        <Check size={12} /> copied
                      </>
                    ) : (
                      <>
                        <Copy size={12} /> copy
                      </>
                    )}
                  </button>
                </div>
                <div className="font-mono break-all text-[11px]">{waUrl}</div>
              </div>
            </div>
          </div>
        );
      })()}

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
                {visits.length > 0 && (
                  <details className="mb-3 group">
                    <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                      Visit History ({visits.length} past visits)
                    </summary>
                    <div className="mt-2 space-y-1">
                      {visits.map((v) => {
                        const resolved = v.initial_sentiment === "negative" && v.current_sentiment === "positive";
                        const worsened = v.initial_sentiment === "positive" && v.current_sentiment === "negative";
                        return (
                          <div key={v.id} className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1">
                            <span className="font-medium">Visit {v.visit_number}</span>
                            <span className="text-muted-foreground">{v.started_at?.slice(0, 10)}</span>
                            <span className="text-muted-foreground">({v.message_count} msgs)</span>
                            {v.initial_sentiment && v.current_sentiment && (
                              <span>
                                {v.initial_sentiment} → {v.current_sentiment}
                                {resolved && <span className="text-success ml-1">✓</span>}
                                {worsened && <span className="text-danger ml-1">✗</span>}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}
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
                    {(() => {
                      const max = Math.max(...analytics.messages_by_hour, 1);
                      return analytics.messages_by_hour.map((v, i) => (
                        <div
                          key={i}
                          className="flex-1 bg-primary/20 hover:bg-primary/40 rounded-sm transition-colors"
                          style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? "4px" : "1px" }}
                          title={`${i}:00 — ${v} messages`}
                        />
                      ));
                    })()}
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

                {/* AI Resolution — Sentiment Transitions */}
                {analytics.sentiment_transitions && (analytics.sentiment_transitions.resolved > 0 || analytics.sentiment_transitions.worsened > 0) && (
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-sm font-semibold mb-3">AI Resolution</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between text-xs">
                        <span>Resolved (neg &rarr; pos)</span>
                        <span className="text-success font-medium">{analytics.sentiment_transitions.resolved}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Worsened (pos &rarr; neg)</span>
                        <span className="text-danger font-medium">{analytics.sentiment_transitions.worsened}</span>
                      </div>
                      {(analytics.sentiment_transitions.resolved + analytics.sentiment_transitions.worsened) > 0 && (
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span>Resolution rate</span>
                            <span className="text-success font-medium">
                              {Math.round(
                                (analytics.sentiment_transitions.resolved /
                                  (analytics.sentiment_transitions.resolved + analytics.sentiment_transitions.worsened)) *
                                  100
                              )}%
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-success rounded-full transition-all"
                              style={{
                                width: `${(analytics.sentiment_transitions.resolved / (analytics.sentiment_transitions.resolved + analytics.sentiment_transitions.worsened)) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Daily trend */}
              {analytics.messages_by_day.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold mb-3">Daily Messages</h3>
                  <div className="flex items-end gap-1 h-24">
                    {(() => {
                      const max = Math.max(...analytics.messages_by_day.map((d) => d.messages), 1);
                      return analytics.messages_by_day.map((day) => (
                        <div
                          key={day.date}
                          className="flex-1 bg-success/20 hover:bg-success/40 rounded-sm transition-colors"
                          style={{ height: `${(day.messages / max) * 100}%`, minHeight: day.messages > 0 ? "4px" : "1px" }}
                          title={`${day.date} — ${day.messages} messages`}
                        />
                      ));
                    })()}
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

      {metaAppOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !metaAppSaving && setMetaAppOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <KeyRound className="w-4 h-4" />
                Meta App credentials
              </h3>
              <button
                onClick={() => setMetaAppOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                From the shop&apos;s Meta App dashboard: App ID + App
                Secret are on <span className="font-mono">Settings → Basic</span>.
                The Verify Token is whatever you type in the app&apos;s
                webhook config — pick a string and put it in both places.
              </p>

              <div>
                <label className="block text-xs font-medium mb-1">
                  App ID <span className="text-muted-foreground font-normal">(public, shown in Meta URLs)</span>
                </label>
                <input
                  type="text"
                  value={metaApp.meta_app_id}
                  onChange={(e) =>
                    setMetaApp({ ...metaApp, meta_app_id: e.target.value })
                  }
                  placeholder="1234567890123456"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  App Secret
                  {shop.has_meta_app_secret && (
                    <span className="ml-2 text-muted-foreground font-normal">
                      (leave blank to keep current)
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  value={metaApp.meta_app_secret}
                  onChange={(e) =>
                    setMetaApp({ ...metaApp, meta_app_secret: e.target.value })
                  }
                  placeholder={
                    shop.has_meta_app_secret
                      ? "••••••••••••••••••••••••••••••••"
                      : "Paste the app secret"
                  }
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Encrypted at rest with the ENCRYPTION_KEY.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  Verify Token <span className="text-muted-foreground font-normal">(shared with Meta webhook config)</span>
                </label>
                <input
                  type="text"
                  value={metaApp.meta_verify_token}
                  onChange={(e) =>
                    setMetaApp({ ...metaApp, meta_verify_token: e.target.value })
                  }
                  placeholder="anything random, 16+ chars"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setMetaAppOpen(false)}
                  disabled={metaAppSaving}
                  className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveMetaApp}
                  disabled={metaAppSaving}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {metaAppSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {credsOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={closeCredsModal}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <KeyRound className="w-4 h-4" />
                Set login credentials
              </h3>
              <button
                onClick={closeCredsModal}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {!credsResult ? (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  The shop owner will be required to change this password on
                  first login. Share both fields with them over a trusted
                  channel (WhatsApp DM, in-person).
                </p>

                <div>
                  <label className="block text-xs font-medium mb-1">Email</label>
                  <input
                    type="email"
                    value={credsEmail}
                    onChange={(e) => setCredsEmail(e.target.value)}
                    placeholder="owner@shop.com"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">
                    Password (leave blank to generate)
                  </label>
                  <input
                    type="text"
                    value={credsPassword}
                    onChange={(e) => setCredsPassword(e.target.value)}
                    placeholder="Auto-generate a 12-char password"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Min 8 chars, at least one letter and one digit.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={closeCredsModal}
                    className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitCredentials}
                    disabled={credsSaving || !credsEmail.trim()}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {credsSaving ? "Saving..." : "Generate & save"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-2 text-xs bg-warning/10 text-warning border border-warning/20 rounded-lg p-3">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>
                    Copy this now — the password is not stored in plaintext
                    anywhere and cannot be retrieved again.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">
                    Email
                  </label>
                  <div className="px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-mono break-all">
                    {credsResult.email}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">
                    Temporary password
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1 px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-mono break-all">
                      {credsResult.temporary_password}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard
                          .writeText(
                            `Email: ${credsResult.email}\nPassword: ${credsResult.temporary_password}`,
                          )
                          .then(() => {
                            setCredsCopied(true);
                            setTimeout(() => setCredsCopied(false), 2000);
                          });
                      }}
                      className="px-3 py-2 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors flex items-center gap-1.5"
                    >
                      {credsCopied ? (
                        <>
                          <Check size={12} className="text-success" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy size={12} />
                          Copy both
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={closeCredsModal}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
