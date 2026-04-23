"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ChevronLeft, ChevronRight, Check, X, Loader2, Copy } from "lucide-react";

// Meta App step landed between Branding and Platforms: admins configure
// the app-level credentials (App ID / Secret / Verify Token) before
// wiring the platform-specific assets that live under the app.
const STEPS = [
  "Shop Info",   // 0
  "Branding",    // 1
  "Meta App",    // 2
  "Platforms",   // 3
  "AI Context",  // 4
  "Review",      // 5
  "Verify",      // 6
];

function randomToken(length = 32): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const rng = typeof window !== "undefined" && window.crypto
    ? (n: number) => {
        const b = new Uint8Array(n);
        window.crypto.getRandomValues(b);
        return b;
      }
    : (n: number) => {
        const b = new Uint8Array(n);
        for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
        return b;
      };
  const bytes = rng(length);
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

type VerifyCheck = { name: string; ok: boolean; detail?: string };
type VerifyPlatformResult = {
  platform: string;
  ok: boolean;
  checks: VerifyCheck[];
};
type VerifyResponse = {
  shop_id: string;
  ok: boolean;
  results: VerifyPlatformResult[];
};

export default function OnboardPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    brand_color: "",
    splash_text: "",
    meta_app_id: "",
    meta_app_secret: "",
    meta_verify_token: "",
    ig_page_id: "",
    ig_access_token: "",
    wa_phone_number_id: "",
    wa_waba_id: "",
    wa_access_token: "",
  });
  const [copiedWh, setCopiedWh] = useState<string | null>(null);

  const copyText = (text: string, key: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedWh(key);
        setTimeout(() => setCopiedWh((c) => (c === key ? null : c)), 1500);
      })
      .catch(() => {});
  };
  const [contexts, setContexts] = useState<
    { context_type: string; content: string }[]
  >([]);
  const [newCtx, setNewCtx] = useState({ context_type: "menu", content: "" });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  const [createdShopId, setCreatedShopId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [accepting, setAccepting] = useState(false);

  const addContext = () => {
    if (!newCtx.content.trim()) return;
    setContexts([...contexts, { ...newCtx }]);
    setNewCtx({ context_type: "menu", content: "" });
  };

  const removeContext = (i: number) => {
    setContexts(contexts.filter((_, idx) => idx !== i));
  };

  const runVerify = async (shopId: string) => {
    setVerifying(true);
    setError("");
    try {
      const res = await api.post<VerifyResponse>(
        `/api/v1/admin/shops/${shopId}/verify`,
      );
      setVerifyResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Verification call failed");
    } finally {
      setVerifying(false);
    }
  };

  // Create shop + upload logo + add contexts, then advance to Verify step.
  const handleCreateAndAdvance = async () => {
    setSaving(true);
    setError("");
    try {
      const shopData: Record<string, string> = { name: form.name };
      if (form.brand_color) shopData.brand_color = form.brand_color;
      if (form.splash_text) shopData.splash_text = form.splash_text;
      if (form.meta_app_id) shopData.meta_app_id = form.meta_app_id;
      if (form.meta_app_secret) shopData.meta_app_secret = form.meta_app_secret;
      if (form.meta_verify_token)
        shopData.meta_verify_token = form.meta_verify_token;
      if (form.ig_page_id) shopData.ig_page_id = form.ig_page_id;
      if (form.ig_access_token)
        shopData.ig_access_token = form.ig_access_token;
      if (form.wa_phone_number_id)
        shopData.wa_phone_number_id = form.wa_phone_number_id;
      if (form.wa_waba_id) shopData.wa_waba_id = form.wa_waba_id;
      if (form.wa_access_token)
        shopData.wa_access_token = form.wa_access_token;

      const shop = await api.post<{ id: string }>(
        "/api/v1/admin/shops",
        shopData,
      );
      setCreatedShopId(shop.id);

      if (logoFile) {
        try {
          const fd = new FormData();
          fd.append("file", logoFile);
          await api.upload(`/api/v1/admin/shops/${shop.id}/logo`, fd);
        } catch {
          // Logo upload failed but shop was created — continue
        }
      }

      for (const ctx of contexts) {
        try {
          await api.post(`/api/v1/admin/shops/${shop.id}/context`, ctx);
        } catch {
          // Context failed but shop was created — continue
        }
      }

      setStep(6);
      await runVerify(shop.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create shop");
    } finally {
      setSaving(false);
    }
  };

  const handleAccept = async () => {
    if (!createdShopId) return;
    setAccepting(true);
    setError("");
    try {
      await api.post(`/api/v1/admin/shops/${createdShopId}/accept`);
      router.push(`/shops/${createdShopId}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Activation failed");
    } finally {
      setAccepting(false);
    }
  };

  const handleFinishInactive = () => {
    if (createdShopId) router.push(`/shops/${createdShopId}`);
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Onboard New Shop</h1>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                i < step
                  ? "bg-success text-white"
                  : i === step
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {i < step ? <Check size={14} /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`w-8 h-0.5 ${
                  i < step ? "bg-success" : "bg-border"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 0: Shop Info */}
      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Shop Name *
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Brew & Blend"
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
      )}

      {/* Step 1: Branding */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Logo</label>
            <label className="flex items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-xl cursor-pointer hover:bg-muted/20 transition-colors">
              {logoFile ? (
                <span className="text-sm text-muted-foreground">
                  {logoFile.name}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Click to upload logo
                </span>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>
          </div>
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
              placeholder="Welcome to our shop!"
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
      )}

      {/* Step 2: Meta App */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-muted/40 border border-border rounded-lg p-3 text-xs text-muted-foreground">
            This shop&apos;s Meta App lives in the shop owner&apos;s own
            Meta Business Portfolio. Get the App ID + Secret from{" "}
            <span className="font-mono">Settings → Basic</span> in their
            app&apos;s dashboard. Verify Token is any string you pick —
            you&apos;ll paste it here and into the same app&apos;s webhook
            config later.
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Meta App ID
            </label>
            <input
              value={form.meta_app_id}
              onChange={(e) => setForm({ ...form, meta_app_id: e.target.value })}
              placeholder="1234567890123456"
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              App Secret
            </label>
            <input
              type="password"
              value={form.meta_app_secret}
              onChange={(e) =>
                setForm({ ...form, meta_app_secret: e.target.value })
              }
              placeholder="Long random string from Settings → Basic"
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Encrypted at rest. Never logged, never shown after save.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium">
                Verify Token
              </label>
              <button
                type="button"
                onClick={() =>
                  setForm({ ...form, meta_verify_token: randomToken(32) })
                }
                className="text-xs text-primary hover:underline"
              >
                Generate one for me
              </button>
            </div>
            <input
              value={form.meta_verify_token}
              onChange={(e) =>
                setForm({ ...form, meta_verify_token: e.target.value })
              }
              placeholder="Any random string — 16+ chars"
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              You&apos;ll paste this same value into Meta App → Webhooks
              → Verify Token when configuring the subscription later.
            </p>
          </div>
        </div>
      )}

      {/* Step 3: Platforms */}
      {step === 3 && (
        <div className="space-y-4">
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
            placeholder="Access Token"
            type="password"
            className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />

          <h3 className="text-sm font-medium text-muted-foreground mt-4">
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
            placeholder="Access Token"
            type="password"
            className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      )}

      {/* Step 4: AI Context */}
      {step === 4 && (
        <div className="space-y-4">
          {contexts.map((ctx, i) => (
            <div
              key={i}
              className="bg-card border border-border rounded-lg p-3 flex justify-between items-start"
            >
              <div>
                <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
                  {ctx.context_type}
                </span>
                <p className="text-sm mt-1 whitespace-pre-wrap">
                  {ctx.content}
                </p>
              </div>
              <button
                onClick={() => removeContext(i)}
                className="text-muted-foreground hover:text-danger ml-2"
              >
                &times;
              </button>
            </div>
          ))}

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
            rows={3}
            placeholder="Enter context..."
            className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
          <button
            onClick={addContext}
            className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
          >
            + Add Context
          </button>
        </div>
      )}

      {/* Step 5: Review */}
      {step === 5 && (
        <div className="space-y-4 text-sm">
          <div className="bg-card border border-border rounded-lg p-4 space-y-2">
            <p>
              <strong>Name:</strong> {form.name}
            </p>
            {form.brand_color && (
              <p className="flex items-center gap-2">
                <strong>Brand Color:</strong>
                <span
                  className="w-4 h-4 rounded inline-block"
                  style={{ backgroundColor: form.brand_color }}
                />
                {form.brand_color}
              </p>
            )}
            {form.splash_text && (
              <p>
                <strong>Splash:</strong> {form.splash_text}
              </p>
            )}
            {logoFile && (
              <p>
                <strong>Logo:</strong> {logoFile.name}
              </p>
            )}
            <p>
              <strong>Meta App:</strong>{" "}
              {form.meta_app_id
                ? `App ID ${form.meta_app_id} — secret ${
                    form.meta_app_secret ? "set" : "missing"
                  }, verify token ${form.meta_verify_token ? "set" : "missing"}`
                : "Not configured"}
            </p>
            <p>
              <strong>Instagram:</strong>{" "}
              {form.ig_page_id || "Not configured"}
            </p>
            <p>
              <strong>WhatsApp:</strong>{" "}
              {form.wa_phone_number_id || "Not configured"}
            </p>
            <p>
              <strong>Context items:</strong> {contexts.length}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            The shop will be created inactive. Next step verifies the Meta
            credentials before you activate it.
          </p>
        </div>
      )}

      {/* Step 6: Verify */}
      {step === 6 && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">Meta credential checks</h3>
              {createdShopId && (
                <button
                  onClick={() => runVerify(createdShopId)}
                  disabled={verifying}
                  className="text-xs text-primary hover:underline disabled:opacity-50"
                >
                  {verifying ? "Running..." : "Re-run"}
                </button>
              )}
            </div>

            {verifying && !verifyResult && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                Calling Meta Graph API…
              </div>
            )}

            {verifyResult && (
              <div className="space-y-4">
                {verifyResult.results.map((platform) => (
                  <div key={platform.platform}>
                    <div className="flex items-center gap-2 text-sm font-medium mb-2">
                      <span className="capitalize">{platform.platform}</span>
                      {platform.ok ? (
                        <span className="text-success inline-flex items-center gap-1">
                          <Check size={14} /> passed
                        </span>
                      ) : (
                        <span className="text-danger inline-flex items-center gap-1">
                          <X size={14} /> failed
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
                            <X
                              size={12}
                              className="text-danger mt-0.5 shrink-0"
                            />
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
            )}
          </div>

          {verifyResult && !verifyResult.ok && (
            <p className="text-xs text-muted-foreground">
              Fix the credentials in the shop detail page, then re-run. The
              shop stays inactive until all checks pass.
            </p>
          )}

          {/* Webhook URLs — copy these into the shop's Meta App config */}
          {createdShopId && (() => {
            const base =
              typeof window !== "undefined"
                ? window.location.origin
                : "https://seet.cloud";
            const igUrl = `${base}/webhook/instagram/${createdShopId}`;
            const waUrl = `${base}/webhook/whatsapp/${createdShopId}`;
            return (
              <div className="bg-card border border-border rounded-lg p-4">
                <h3 className="text-sm font-medium mb-1">
                  Webhook URLs for Meta App configuration
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Paste these into the shop&apos;s Meta App → Webhooks page
                  (Instagram and WhatsApp products), using the Verify Token
                  you entered earlier. Meta will call GET on each URL to
                  confirm ownership before delivering messages.
                </p>
                <div className="space-y-2">
                  {[
                    { label: "Instagram", url: igUrl, key: "onboard-ig" },
                    { label: "WhatsApp", url: waUrl, key: "onboard-wa" },
                  ].map((w) => (
                    <div
                      key={w.key}
                      className="bg-muted/30 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          {w.label}
                        </span>
                        <button
                          onClick={() => copyText(w.url, w.key)}
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          {copiedWh === w.key ? (
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
                      <div className="font-mono text-[11px] break-all">
                        {w.url}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {error && (
        <div className="mt-4 px-4 py-2 rounded-lg bg-danger/10 text-danger text-sm">
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        <button
          onClick={() => setStep(step - 1)}
          disabled={step === 0 || step === 6}
          className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
        >
          <ChevronLeft size={16} /> Back
        </button>

        {step < 5 && (
          <button
            onClick={() => setStep(step + 1)}
            disabled={step === 0 && !form.name.trim()}
            className="flex items-center gap-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Next <ChevronRight size={16} />
          </button>
        )}

        {step === 5 && (
          <button
            onClick={handleCreateAndAdvance}
            disabled={saving}
            className="flex items-center gap-1 px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? "Creating..." : "Create & Verify"}
            <ChevronRight size={16} />
          </button>
        )}

        {step === 6 && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleFinishInactive}
              disabled={accepting || !createdShopId}
              className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              Save inactive
            </button>
            <button
              onClick={handleAccept}
              disabled={
                accepting ||
                verifying ||
                !verifyResult?.ok ||
                !createdShopId
              }
              className="flex items-center gap-1 px-6 py-2 rounded-lg bg-success text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {accepting ? "Activating..." : "Accept & Activate"}
              <Check size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
