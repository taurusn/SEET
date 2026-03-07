"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ContextEditor } from "@/components/context-editor";
import { CompensationTierForm } from "@/components/compensation-tier-form";
import { BusinessHoursEditor } from "@/components/business-hours-editor";
import { cn } from "@/lib/utils";
import { Instagram, MessageCircle, CheckCircle, XCircle } from "lucide-react";

interface ShopContext {
  id: string;
  context_type: string;
  content: string;
  updated_at: string;
}

interface Tier {
  id: string;
  label: string;
  description: string | null;
  value_sar: number;
  validity_days: number;
  tier_order: number;
  is_active: boolean;
}

const tabs = [
  { value: "profile", label: "الملف الشخصي" },
  { value: "context", label: "سياق الذكاء" },
  { value: "hours", label: "ساعات العمل" },
  { value: "compensation", label: "التعويضات" },
];

export default function SettingsPage() {
  const { shop } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const [contexts, setContexts] = useState<ShopContext[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "",
    ig_page_id: "",
    wa_phone_number_id: "",
  });

  useEffect(() => {
    if (shop) {
      setProfileForm({
        name: shop.name,
        ig_page_id: shop.ig_page_id || "",
        wa_phone_number_id: shop.wa_phone_number_id || "",
      });
    }
  }, [shop]);

  function fetchContexts() {
    api.get<ShopContext[]>("/api/v1/shop/context").then(setContexts);
  }

  function fetchTiers() {
    api.get<Tier[]>("/api/v1/shop/compensation-tiers").then(setTiers);
  }

  useEffect(() => {
    fetchContexts();
    fetchTiers();
  }, []);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch("/api/v1/shop", profileForm);
      // Update local storage
      const shopData = JSON.parse(localStorage.getItem("shop") || "{}");
      Object.assign(shopData, profileForm);
      localStorage.setItem("shop", JSON.stringify(shopData));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">الإعدادات</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-muted rounded-xl p-1 w-fit max-w-full overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setActiveTab(t.value)}
            className={cn(
              "px-3 md:px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
              activeTab === t.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === "profile" && (
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm max-w-2xl">
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                اسم المحل
              </label>
              <input
                value={profileForm.name}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, name: e.target.value })
                }
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                تغيير اسم المحل سيغير بيانات الدخول
              </p>
            </div>

            {/* Platform connections */}
            <div className="pt-4 border-t border-border space-y-4">
              <h3 className="font-medium">الحسابات المرتبطة</h3>

              <div className="flex items-center gap-3 p-4 rounded-xl border border-border">
                <Instagram className="w-5 h-5 text-[#E4405F]" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Instagram</p>
                  <input
                    value={profileForm.ig_page_id}
                    onChange={(e) =>
                      setProfileForm({
                        ...profileForm,
                        ig_page_id: e.target.value,
                      })
                    }
                    placeholder="Page ID"
                    className="mt-1 w-full px-3 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                {shop?.ig_page_id ? (
                  <CheckCircle className="w-5 h-5 text-success" />
                ) : (
                  <XCircle className="w-5 h-5 text-muted-foreground" />
                )}
              </div>

              <div className="flex items-center gap-3 p-4 rounded-xl border border-border">
                <MessageCircle className="w-5 h-5 text-[#25D366]" />
                <div className="flex-1">
                  <p className="text-sm font-medium">WhatsApp</p>
                  <input
                    value={profileForm.wa_phone_number_id}
                    onChange={(e) =>
                      setProfileForm({
                        ...profileForm,
                        wa_phone_number_id: e.target.value,
                      })
                    }
                    placeholder="Phone Number ID"
                    className="mt-1 w-full px-3 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                {shop?.wa_phone_number_id ? (
                  <CheckCircle className="w-5 h-5 text-success" />
                ) : (
                  <XCircle className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? "جاري الحفظ..." : "حفظ التغييرات"}
              </button>
              {saved && (
                <span className="text-sm text-success font-medium animate-toast flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4" />
                  تم الحفظ
                </span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* AI Context Tab */}
      {activeTab === "context" && (
        <div className="max-w-2xl">
          <p className="text-sm text-muted-foreground mb-4">
            هنا تعلّم الذكاء الاصطناعي عن محلك — القائمة، الأوقات، الأسئلة
            الشائعة، وأسلوب الرد.
          </p>
          <ContextEditor contexts={contexts.filter(c => c.context_type !== "business_hours")} onUpdate={fetchContexts} />
        </div>
      )}

      {/* Business Hours Tab */}
      {activeTab === "hours" && (
        <div className="max-w-2xl">
          <BusinessHoursEditor contexts={contexts} onUpdate={fetchContexts} />
        </div>
      )}

      {/* Compensation Tiers Tab */}
      {activeTab === "compensation" && (
        <div className="max-w-2xl">
          <p className="text-sm text-muted-foreground mb-4">
            حدد أنواع التعويضات اللي تبي تقدمها لعملائك عند حدوث مشكلة. كل
            تعويض يصدر بكود فريد يقدمه العميل بالمحل.
          </p>
          <CompensationTierForm tiers={tiers} onUpdate={fetchTiers} />
        </div>
      )}
    </div>
  );
}
