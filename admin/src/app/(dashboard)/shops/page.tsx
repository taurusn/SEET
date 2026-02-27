"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Search } from "lucide-react";

interface ShopItem {
  id: string;
  name: string;
  ig_page_id?: string;
  wa_phone_number_id?: string;
  is_active: boolean;
  logo_url?: string;
  created_at: string;
  total_conversations: number;
  active_handoffs: number;
}

export default function ShopsPage() {
  const [shops, setShops] = useState<ShopItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    api
      .get<ShopItem[]>(`/api/v1/admin/shops${params}`)
      .then(setShops)
      .finally(() => setLoading(false));
  }, [search]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Shops</h1>
        <button
          onClick={() => router.push("/shops/onboard")}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + New Shop
        </button>
      </div>

      <div className="relative mb-4">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          placeholder="Search shops..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Shop
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Platforms
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Status
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Conversations
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {shops.map((shop) => (
                <tr
                  key={shop.id}
                  onClick={() => router.push(`/shops/${shop.id}`)}
                  className="border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {shop.logo_url ? (
                        <img
                          src={shop.logo_url}
                          alt=""
                          className="w-8 h-8 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                          {shop.name[0]}
                        </div>
                      )}
                      <span className="font-medium">{shop.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      {shop.ig_page_id && (
                        <span className="px-2 py-0.5 rounded bg-pink-100 text-pink-700 text-xs font-medium">
                          IG
                        </span>
                      )}
                      {shop.wa_phone_number_id && (
                        <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs font-medium">
                          WA
                        </span>
                      )}
                      {!shop.ig_page_id && !shop.wa_phone_number_id && (
                        <span className="text-xs text-muted-foreground">
                          None
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        shop.is_active
                          ? "bg-success/10 text-success"
                          : "bg-danger/10 text-danger"
                      }`}
                    >
                      {shop.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {shop.total_conversations}
                    {shop.active_handoffs > 0 && (
                      <span className="ml-1 text-warning">
                        ({shop.active_handoffs} handoffs)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(shop.created_at)}
                  </td>
                </tr>
              ))}
              {shops.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    No shops found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
