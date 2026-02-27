"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Clock, Save, CheckCircle } from "lucide-react";

interface DaySchedule {
  open: string;
  close: string;
}

interface BusinessHoursConfig {
  timezone: string;
  schedule: Record<string, DaySchedule>;
  closed_message: string;
}

const DAYS = [
  { key: "sat", label: "السبت" },
  { key: "sun", label: "الأحد" },
  { key: "mon", label: "الإثنين" },
  { key: "tue", label: "الثلاثاء" },
  { key: "wed", label: "الأربعاء" },
  { key: "thu", label: "الخميس" },
  { key: "fri", label: "الجمعة" },
];

const DEFAULT_CONFIG: BusinessHoursConfig = {
  timezone: "Asia/Riyadh",
  schedule: {
    sat: { open: "07:00", close: "23:00" },
    sun: { open: "07:00", close: "23:00" },
    mon: { open: "07:00", close: "23:00" },
    tue: { open: "07:00", close: "23:00" },
    wed: { open: "07:00", close: "23:00" },
    thu: { open: "07:00", close: "23:00" },
    fri: { open: "14:00", close: "23:00" },
  },
  closed_message:
    "أهلاً! نحن مقفلين حالياً. نسعد بخدمتك وقت الدوام!",
};

interface ShopContext {
  id: string;
  context_type: string;
  content: string;
  updated_at: string;
}

interface BusinessHoursEditorProps {
  contexts: ShopContext[];
  onUpdate: () => void;
}

export function BusinessHoursEditor({
  contexts,
  onUpdate,
}: BusinessHoursEditorProps) {
  const existing = contexts.find((c) => c.context_type === "business_hours");
  const [config, setConfig] = useState<BusinessHoursConfig>(DEFAULT_CONFIG);
  const [enabledDays, setEnabledDays] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (existing) {
      try {
        const parsed = JSON.parse(existing.content);
        setConfig(parsed);
        const enabled: Record<string, boolean> = {};
        for (const day of DAYS) {
          enabled[day.key] = !!parsed.schedule?.[day.key];
        }
        setEnabledDays(enabled);
      } catch {
        setEnabledDays(
          Object.fromEntries(DAYS.map((d) => [d.key, true]))
        );
      }
    } else {
      setEnabledDays(Object.fromEntries(DAYS.map((d) => [d.key, true])));
    }
  }, [existing]);

  function toggleDay(key: string) {
    setEnabledDays((prev) => ({ ...prev, [key]: !prev[key] }));
    if (enabledDays[key]) {
      // Removing day from schedule
      setConfig((prev) => {
        const schedule = { ...prev.schedule };
        delete schedule[key];
        return { ...prev, schedule };
      });
    } else {
      // Adding day back with defaults
      setConfig((prev) => ({
        ...prev,
        schedule: {
          ...prev.schedule,
          [key]: { open: "07:00", close: "23:00" },
        },
      }));
    }
  }

  function updateTime(day: string, field: "open" | "close", value: string) {
    setConfig((prev) => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        [day]: { ...prev.schedule[day], [field]: value },
      },
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const json = JSON.stringify(config);
      if (existing) {
        await api.delete(`/api/v1/shop/context/${existing.id}`);
      }
      await api.post("/api/v1/shop/context", {
        context_type: "business_hours",
        content: json,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      onUpdate();
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (existing) {
      await api.delete(`/api/v1/shop/context/${existing.id}`);
      onUpdate();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-5 h-5 text-primary" />
        <h3 className="font-medium">ساعات العمل</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        حدد أوقات عمل محلك. خارج هالأوقات، الذكاء الاصطناعي يرد تلقائي
        بدون استدعاء Gemini.
      </p>

      {/* Day schedule grid */}
      <div className="space-y-2">
        {DAYS.map((day) => (
          <div
            key={day.key}
            className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card"
          >
            <label className="flex items-center gap-2 min-w-[90px]">
              <input
                type="checkbox"
                checked={enabledDays[day.key] ?? true}
                onChange={() => toggleDay(day.key)}
                className="rounded border-border"
              />
              <span className="text-sm font-medium">{day.label}</span>
            </label>
            {enabledDays[day.key] ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="time"
                  value={config.schedule[day.key]?.open || "07:00"}
                  onChange={(e) =>
                    updateTime(day.key, "open", e.target.value)
                  }
                  className="px-2 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="text-xs text-muted-foreground">إلى</span>
                <input
                  type="time"
                  value={config.schedule[day.key]?.close || "23:00"}
                  onChange={(e) =>
                    updateTime(day.key, "close", e.target.value)
                  }
                  className="px-2 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">مغلق</span>
            )}
          </div>
        ))}
      </div>

      {/* Closed message */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          رسالة الإغلاق
        </label>
        <textarea
          value={config.closed_message}
          onChange={(e) =>
            setConfig({ ...config, closed_message: e.target.value })
          }
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? "جاري الحفظ..." : "حفظ"}
        </button>
        {existing && (
          <button
            onClick={handleRemove}
            className="px-4 py-2 rounded-xl border border-danger/30 text-danger text-sm font-medium hover:bg-danger/5 transition-colors"
          >
            إزالة ساعات العمل
          </button>
        )}
        {saved && (
          <span className="text-sm text-success font-medium flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4" />
            تم الحفظ
          </span>
        )}
      </div>
    </div>
  );
}
