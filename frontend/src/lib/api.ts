// When behind nginx proxy, use relative paths (empty string).
// Falls back to explicit URL for direct development without proxy.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

class ApiClient {
  private getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token");
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      if (typeof window !== "undefined" && !window.location.pathname.endsWith("/login")) {
        localStorage.removeItem("token");
        localStorage.removeItem("shop");
        window.location.href = "/login";
      }
      throw new Error("Unauthorized");
    }

    if (res.status === 204) {
      return undefined as T;
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: "Request failed" }));
      throw new Error(error.detail || "Request failed");
    }

    return res.json();
  }

  get<T>(path: string) {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(path: string, body: unknown) {
    return this.request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  delete(path: string) {
    return this.request(path, { method: "DELETE" });
  }
}

export const api = new ApiClient();
