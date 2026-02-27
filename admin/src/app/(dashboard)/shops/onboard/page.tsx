"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";

const STEPS = ["Shop Info", "Branding", "Platforms", "AI Context", "Review"];

export default function OnboardPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    brand_color: "",
    splash_text: "",
    ig_page_id: "",
    ig_access_token: "",
    wa_phone_number_id: "",
    wa_waba_id: "",
    wa_access_token: "",
  });
  const [contexts, setContexts] = useState<
    { context_type: string; content: string }[]
  >([]);
  const [newCtx, setNewCtx] = useState({ context_type: "menu", content: "" });
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const addContext = () => {
    if (!newCtx.content.trim()) return;
    setContexts([...contexts, { ...newCtx }]);
    setNewCtx({ context_type: "menu", content: "" });
  };

  const removeContext = (i: number) => {
    setContexts(contexts.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const shopData: Record<string, string> = { name: form.name };
      if (form.brand_color) shopData.brand_color = form.brand_color;
      if (form.splash_text) shopData.splash_text = form.splash_text;
      if (form.ig_page_id) shopData.ig_page_id = form.ig_page_id;
      if (form.ig_access_token)
        shopData.ig_access_token = form.ig_access_token;
      if (form.wa_phone_number_id)
        shopData.wa_phone_number_id = form.wa_phone_number_id;
      if (form.wa_waba_id) shopData.wa_waba_id = form.wa_waba_id;
      if (form.wa_access_token)
        shopData.wa_access_token = form.wa_access_token;

      const shop = await api.post<{ id: string }>("/api/v1/admin/shops", shopData);

      // Upload logo
      if (logoFile) {
        const fd = new FormData();
        fd.append("file", logoFile);
        await api.upload(`/api/v1/admin/shops/${shop.id}/logo`, fd);
      }

      // Add context items
      for (const ctx of contexts) {
        await api.post(`/api/v1/admin/shops/${shop.id}/context`, ctx);
      }

      router.push(`/shops/${shop.id}`);
    } finally {
      setSaving(false);
    }
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

      {/* Step 2: Platforms */}
      {step === 2 && (
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

      {/* Step 3: AI Context */}
      {step === 3 && (
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

      {/* Step 4: Review */}
      {step === 4 && (
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
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        <button
          onClick={() => setStep(step - 1)}
          disabled={step === 0}
          className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
        >
          <ChevronLeft size={16} /> Back
        </button>

        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={step === 0 && !form.name.trim()}
            className="flex items-center gap-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Next <ChevronRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-1 px-6 py-2 rounded-lg bg-success text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? "Creating..." : "Create Shop"}
            <Check size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
