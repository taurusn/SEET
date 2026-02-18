"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { api } from "./api";

interface Shop {
  id: string;
  name: string;
  ig_page_id?: string;
  wa_phone_number_id?: string;
  wa_waba_id?: string;
  is_active: boolean;
  created_at: string;
}

interface AuthState {
  token: string | null;
  shop: Shop | null;
  loading: boolean;
}

interface AuthContextType extends AuthState {
  login: (shopId: string, token: string) => Promise<void>;
  register: (data: {
    name: string;
    ig_page_id?: string;
    ig_access_token?: string;
    wa_phone_number_id?: string;
    wa_waba_id?: string;
    wa_access_token?: string;
  }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    shop: null,
    loading: true,
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    const shopStr = localStorage.getItem("shop");

    if (token && shopStr) {
      try {
        const shop = JSON.parse(shopStr);
        setState({ token, shop, loading: false });
      } catch {
        localStorage.removeItem("token");
        localStorage.removeItem("shop");
        setState({ token: null, shop: null, loading: false });
      }
    } else {
      setState({ token: null, shop: null, loading: false });
    }
  }, []);

  const login = async (shopId: string, token: string) => {
    localStorage.setItem("token", token);
    const shop = await api.get<Shop>("/api/v1/shop");
    localStorage.setItem("shop", JSON.stringify(shop));
    setState({ token, shop, loading: false });
  };

  const register = async (data: {
    name: string;
    ig_page_id?: string;
    ig_access_token?: string;
    wa_phone_number_id?: string;
    wa_waba_id?: string;
    wa_access_token?: string;
  }) => {
    const res = await api.post<{
      access_token: string;
      shop_id: string;
    }>("/api/v1/shops", data);
    await login(res.shop_id, res.access_token);
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("shop");
    setState({ token: null, shop: null, loading: false });
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
