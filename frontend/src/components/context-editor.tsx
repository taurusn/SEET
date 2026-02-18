"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Plus, Trash2 } from "lucide-react";

interface ShopContext {
  id: string;
  context_type: string;
  content: string;
  updated_at: string;
}

interface ContextEditorProps {
  contexts: ShopContext[];
  onUpdate: () => void;
}

const contextTypeLabels: Record<string, string> = {
  menu: "القائمة",
  hours: "ساعات العمل",
  faq: "الأسئلة الشائعة",
  tone: "أسلوب الرد",
};

const contextTypePlaceholders: Record<string, string> = {
  menu: "لاتيه - ١٨ ريال\nكابتشينو - ٢٠ ريال\nقهوة مختصة - ٢٥ ريال",
  hours: "السبت-الخميس: ٧ ص - ١١ م\nالجمعة: ٢ م - ١١ م",
  faq: "س: عندكم توصيل؟\nج: ايه نوصل عن طريق جاهز ومرسول",
  tone: "ودود وعفوي بلهجة سعودية نجدية",
};

export function ContextEditor({ contexts, onUpdate }: ContextEditorProps) {
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState("menu");
  const [newContent, setNewContent] = useState("");

  const existingTypes = new Set(contexts.map((c) => c.context_type));

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    await api.post("/api/v1/shop/context", {
      context_type: newType,
      content: newContent,
    });
    setNewContent("");
    setAdding(false);
    onUpdate();
  }

  async function handleDelete(id: string) {
    await api.delete(`/api/v1/shop/context/${id}`);
    onUpdate();
  }

  return (
    <div className="space-y-4">
      {contexts.map((ctx) => (
        <div
          key={ctx.id}
          className="bg-card rounded-xl border border-border p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-sm">
              {contextTypeLabels[ctx.context_type] || ctx.context_type}
            </h4>
            <button
              onClick={() => handleDelete(ctx.id)}
              className="p-1.5 rounded-lg hover:bg-danger/10 text-muted-foreground hover:text-danger transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-[inherit]">
            {ctx.content}
          </pre>
        </div>
      ))}

      {adding ? (
        <form
          onSubmit={handleAdd}
          className="bg-card rounded-xl border border-primary/30 p-4 space-y-3"
        >
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {Object.entries(contextTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder={contextTypePlaceholders[newType] || "المحتوى..."}
            required
            rows={4}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
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
          إضافة محتوى
        </button>
      )}
    </div>
  );
}
