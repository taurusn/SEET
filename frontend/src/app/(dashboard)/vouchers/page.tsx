"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { VoucherTable } from "@/components/voucher-table";
import { cn } from "@/lib/utils";

interface Voucher {
  id: string;
  code: string;
  customer_id: string;
  platform: string;
  status: string;
  issued_at: string;
  expires_at: string;
  redeemed_at: string | null;
}

interface VoucherStats {
  total_issued: number;
  total_redeemed: number;
  total_expired: number;
  total_active: number;
  budget_spent_sar: number;
}

const tabs = [
  { value: "", label: "الكل" },
  { value: "issued", label: "فعّال" },
  { value: "redeemed", label: "مستخدم" },
  { value: "expired", label: "منتهي" },
];

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [stats, setStats] = useState<VoucherStats | null>(null);
  const [tab, setTab] = useState("");
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | undefined>();

  function fetchData() {
    setLoading(true);
    const params = tab ? `?status=${tab}` : "";
    Promise.all([
      api.get<Voucher[]>(`/api/v1/shop/vouchers${params}`),
      api.get<VoucherStats>("/api/v1/shop/voucher-stats"),
    ])
      .then(([v, s]) => {
        setVouchers(v);
        setStats(s);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchData();
  }, [tab]);

  async function handleRedeem(id: string) {
    setRedeeming(id);
    try {
      await api.post(`/api/v1/shop/vouchers/${id}/redeem`);
      fetchData();
    } finally {
      setRedeeming(undefined);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">القسائم</h1>

      {/* Monthly stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-card rounded-xl border border-border p-4 text-center">
            <p className="text-2xl font-bold">{stats.total_issued}</p>
            <p className="text-xs text-muted-foreground mt-1">صدرت هذا الشهر</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4 text-center">
            <p className="text-2xl font-bold text-success">
              {stats.total_redeemed}
            </p>
            <p className="text-xs text-muted-foreground mt-1">تم استخدامها</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4 text-center">
            <p className="text-2xl font-bold text-primary">
              {stats.total_active}
            </p>
            <p className="text-xs text-muted-foreground mt-1">فعّالة الآن</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4 text-center">
            <p className="text-2xl font-bold">
              {stats.budget_spent_sar}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ريال
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              تكلفة المستخدمة
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-muted rounded-xl p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              tab === t.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <VoucherTable
            vouchers={vouchers}
            onRedeem={handleRedeem}
            redeeming={redeeming}
          />
        )}
      </div>
    </div>
  );
}
