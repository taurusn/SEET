"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { HandoffCard } from "@/components/handoff-card";
import { CheckCircle } from "lucide-react";

interface HandoffRequest {
  id: string;
  conversation_id: string;
  reason: string | null;
  notified: boolean;
  resolved_at: string | null;
  created_at: string;
}

interface Tier {
  id: string;
  label: string;
  value_sar: number;
  is_active: boolean;
}

interface Conversation {
  id: string;
  customer_id: string;
  platform: string;
}

export default function HandoffsPage() {
  const [handoffs, setHandoffs] = useState<HandoffRequest[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [voucherModal, setVoucherModal] = useState<HandoffRequest | null>(null);
  const [issuing, setIssuing] = useState(false);

  function fetchData() {
    setLoading(true);
    Promise.all([
      api.get<HandoffRequest[]>("/api/v1/shop/handoffs?pending_only=true"),
      api.get<Tier[]>("/api/v1/shop/compensation-tiers"),
    ])
      .then(([h, t]) => {
        setHandoffs(h);
        setTiers(t.filter((t) => t.is_active));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function handleResolve(id: string) {
    setResolving(id);
    try {
      await api.post(`/api/v1/shop/handoffs/${id}/resolve`);
      fetchData();
    } finally {
      setResolving(null);
    }
  }

  async function handleIssueVoucher(tierId: string) {
    if (!voucherModal) return;
    setIssuing(true);

    try {
      // We need the conversation details to get customer_id and platform
      const conversations = await api.get<Conversation[]>(
        `/api/v1/shop/conversations?limit=200`
      );
      const convo = conversations.find(
        (c) => c.id === voucherModal.conversation_id
      );
      if (!convo) return;

      await api.post("/api/v1/shop/vouchers", {
        tier_id: tierId,
        conversation_id: voucherModal.conversation_id,
        handoff_id: voucherModal.id,
        customer_id: convo.customer_id,
        platform: convo.platform,
      });

      setVoucherModal(null);
      fetchData();
    } finally {
      setIssuing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">التحويلات</h1>

      {handoffs.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center shadow-sm">
          <CheckCircle className="w-12 h-12 text-success mx-auto mb-3 opacity-60" />
          <p className="font-medium">لا توجد تحويلات معلّقة</p>
          <p className="text-sm text-muted-foreground mt-1">
            كل العملاء يتم خدمتهم بواسطة الذكاء الاصطناعي
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {handoffs.map((h) => (
            <HandoffCard
              key={h.id}
              handoff={h}
              onResolve={handleResolve}
              onIssueVoucher={setVoucherModal}
              resolving={resolving === h.id}
            />
          ))}
        </div>
      )}

      {/* Voucher issue modal */}
      {voucherModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-card rounded-2xl border border-border shadow-xl w-full max-w-md p-6 animate-scale-in">
            <h2 className="text-lg font-bold mb-1">إصدار قسيمة تعويض</h2>
            <p className="text-sm text-muted-foreground mb-4">
              اختر نوع التعويض للعميل
            </p>

            {tiers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                لم تُضف أي تعويضات بعد. أضفها من{" "}
                <span className="text-primary">الإعدادات</span>.
              </p>
            ) : (
              <div className="space-y-2">
                {tiers.map((tier) => (
                  <button
                    key={tier.id}
                    onClick={() => handleIssueVoucher(tier.id)}
                    disabled={issuing}
                    className="w-full text-right p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                  >
                    <p className="font-medium">{tier.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {tier.value_sar} ريال
                    </p>
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setVoucherModal(null)}
              className="w-full mt-4 py-2.5 text-sm font-medium rounded-xl bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
