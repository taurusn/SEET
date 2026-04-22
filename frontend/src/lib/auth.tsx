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
  email?: string | null;
  must_change_password: boolean;
  ig_page_id?: string;
  wa_phone_number_id?: string;
  wa_waba_id?: string;
  is_active: boolean;
  logo_url?: string;
  brand_color?: string;
  splash_text?: string;
  created_at: string;
}

interface AuthState {
  token: string | null;
  shop: Shop | null;
  loading: boolean;
}

interface AuthContextType extends AuthState {
  login: (token: string) => Promise<Shop>;
  logout: () => Promise<void>;
  refreshShop: () => Promise<Shop | null>;
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

    if (!token) {
      setState({ token: null, shop: null, loading: false });
      return;
    }

    // Always revalidate the token against /shop on boot. Stored shop
    // blobs can go stale (must_change_password flip, deactivation, etc).
    api
      .get<Shop>("/api/v1/shop")
      .then((shop) => {
        localStorage.setItem("shop", JSON.stringify(shop));
        setState({ token, shop, loading: false });
      })
      .catch(() => {
        localStorage.removeItem("token");
        localStorage.removeItem("shop");
        setState({ token: null, shop: null, loading: false });
      });
  }, []);

  // Listen for mid-session 401s emitted by api.ts and clear auth state
  // so the dashboard layout redirects to /login.
  useEffect(() => {
    function onUnauthorized() {
      localStorage.removeItem("token");
      localStorage.removeItem("shop");
      localStorage.removeItem("seet_theme");
      setState({ token: null, shop: null, loading: false });
    }
    window.addEventListener("auth:unauthorized", onUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", onUnauthorized);
  }, []);

  const login = async (token: string): Promise<Shop> => {
    localStorage.setItem("token", token);
    try {
      const shop = await api.get<Shop>("/api/v1/shop");
      localStorage.setItem("shop", JSON.stringify(shop));
      setState({ token, shop, loading: false });
      return shop;
    } catch (e) {
      localStorage.removeItem("token");
      localStorage.removeItem("shop");
      throw e;
    }
  };

  const refreshShop = async (): Promise<Shop | null> => {
    if (!state.token) return null;
    try {
      const shop = await api.get<Shop>("/api/v1/shop");
      localStorage.setItem("shop", JSON.stringify(shop));
      setState((s) => ({ ...s, shop }));
      return shop;
    } catch {
      return null;
    }
  };

  const logout = async () => {
    // Best-effort server-side revocation — don't block UX on it.
    try {
      await api.post("/api/v1/auth/logout");
    } catch {
      // Token may already be invalid; clearing locally is what matters.
    }
    localStorage.removeItem("token");
    localStorage.removeItem("shop");
    localStorage.removeItem("seet_theme");
    setState({ token: null, shop: null, loading: false });
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshShop }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
