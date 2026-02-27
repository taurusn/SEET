"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { api } from "./api";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface AuthState {
  token: string | null;
  admin: AdminUser | null;
  loading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    admin: null,
    loading: true,
  });

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    const adminStr = localStorage.getItem("admin");

    if (token && adminStr) {
      try {
        const admin = JSON.parse(adminStr);
        setState({ token, admin, loading: false });
      } catch {
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin");
        setState({ token: null, admin: null, loading: false });
      }
    } else {
      setState({ token: null, admin: null, loading: false });
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<{
      access_token: string;
      admin_id: string;
      name: string;
    }>("/api/v1/admin/login", { email, password });

    localStorage.setItem("admin_token", res.access_token);

    const admin = await api.get<AdminUser>("/api/v1/admin/me");
    localStorage.setItem("admin", JSON.stringify(admin));
    setState({ token: res.access_token, admin, loading: false });
  };

  const logout = () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin");
    setState({ token: null, admin: null, loading: false });
    window.location.href = "/admin/login";
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAdmin must be used within AdminAuthProvider");
  return context;
}
