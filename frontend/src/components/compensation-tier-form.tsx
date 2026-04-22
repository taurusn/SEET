"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Plus, Trash2, X, Check } from "lucide-react";

interface Tier {
  id: string;
  label: string;
  description: string | null;
  value_sar: number;
  validity_days: number;
  tier_order: number;
  is_active: boolean;
}

interface CompensationTierFormProps {
  tiers: Tier[];
  onUpdate: () => void;
}

export function CompensationTierForm({ tiers, onUpdate }: CompensationTierFormProps) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    label: "",
    description: "",
    value_sar: "",
    validity_days: "30",
  });

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    await api.post("/api/v1/shop/compensation-tiers", {
      label: form.label,
      description: form.description || null,
      value_sar: parseFloat(form.value_sar),
      validity_days: parseInt(form.validity_days),
      tier_order: tiers.length,
    });
    setForm({ label: "", description: "", value_sar: "", validity_days: "30" });
    setAdding(false);
    onUpdate();
  }

  async function handleDelete(id: string) {
    await api.delete(`/api/v1/shop/compensation-tiers/${id}`);
    onUpdate();
  }

  async function handleToggle(tier: Tier) {
    await api.patch(`/api/v1/shop/compensation-tiers/${tier.id}`, {
      is_active: !tier.is_active,
    });
    onUpdate();
  }

  return (
    <div className="space-y-3">
      {tiers.map((tier) => (
        <div
          key={tier.id}
          className="bg-card rounded-xl border border-border p-4 flex items-center justify-between"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-medium">{tier.label}</h4>
              {!tier.is_active && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  معطّل
                </span>
              )}
            </div>
            {tier.description && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {tier.description}
              </p>
            )}
            <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
              <span>{tier.value_sar} ريال</span>
              <span>صالح {tier.validity_days} يوم</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleToggle(tier)}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
              title={tier.is_active ? "تعطيل" : "تفعيل"}
            >
              {tier.is_active ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <X className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={() => handleDelete(tier.id)}
              className="p-2 rounded-lg hover:bg-danger/10 transition-colors text-muted-foreground hover:text-danger"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}

      {adding ? (
        <form
          onSubmit={handleAdd}
          className="bg-card rounded-xl border border-primary/30 p-4 space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="اسم التعويض (مثل: مشروب مجاني)"
                required
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="col-span-2">
              <input
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="وصف (اختياري)"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <input
                type="number"
                step="0.01"
                value={form.value_sar}
                onChange={(e) =>
                  setForm({ ...form, value_sar: e.target.value })
                }
                placeholder="القيمة (ريال)"
                required
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <input
                type="number"
                value={form.validity_days}
                onChange={(e) =>
                  setForm({ ...form, validity_days: e.target.value })
                }
                placeholder="صلاحية (أيام)"
                required
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              إضافة
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
            >
              إلغاء
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <Plus className="w-4 h-4" />
          إضافة تعويض
        </button>
      )}
    </div>
  );
}
