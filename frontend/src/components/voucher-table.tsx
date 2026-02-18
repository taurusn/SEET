"use client";

import { cn, formatDate } from "@/lib/utils";

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

interface VoucherTableProps {
  vouchers: Voucher[];
  onRedeem: (id: string) => void;
  redeeming?: string;
}

const statusBadge: Record<string, { label: string; className: string }> = {
  issued: { label: "فعّال", className: "bg-success/10 text-success" },
  redeemed: { label: "مستخدم", className: "bg-muted text-muted-foreground" },
  expired: { label: "منتهي", className: "bg-danger/10 text-danger" },
};

export function VoucherTable({ vouchers, onRedeem, redeeming }: VoucherTableProps) {
  if (vouchers.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        لا توجد قسائم
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="text-right py-3 px-4 font-medium">الكود</th>
            <th className="text-right py-3 px-4 font-medium">العميل</th>
            <th className="text-right py-3 px-4 font-medium">المنصة</th>
            <th className="text-right py-3 px-4 font-medium">تاريخ الإصدار</th>
            <th className="text-right py-3 px-4 font-medium">تاريخ الانتهاء</th>
            <th className="text-right py-3 px-4 font-medium">الحالة</th>
            <th className="text-right py-3 px-4 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {vouchers.map((v) => {
            const badge = statusBadge[v.status] || statusBadge.issued;
            return (
              <tr key={v.id} className="hover:bg-muted/30 transition-colors">
                <td className="py-3 px-4 font-mono font-medium text-primary">
                  {v.code}
                </td>
                <td className="py-3 px-4">{v.customer_id}</td>
                <td className="py-3 px-4">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {v.platform === "instagram" ? "IG" : "WA"}
                  </span>
                </td>
                <td className="py-3 px-4 text-muted-foreground">
                  {formatDate(v.issued_at)}
                </td>
                <td className="py-3 px-4 text-muted-foreground">
                  {formatDate(v.expires_at)}
                </td>
                <td className="py-3 px-4">
                  <span
                    className={cn(
                      "text-xs font-medium px-2 py-1 rounded-lg",
                      badge.className
                    )}
                  >
                    {badge.label}
                  </span>
                </td>
                <td className="py-3 px-4">
                  {v.status === "issued" && (
                    <button
                      onClick={() => onRedeem(v.id)}
                      disabled={redeeming === v.id}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                    >
                      {redeeming === v.id ? "..." : "تم الاستخدام"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
