import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";

interface AuthUser {
  id: string;
  email: string;
  plan?: "free" | "pro" | string | null;
  threadsAccessToken?: string | null;
  threadsUsername?: string | null;
  threadsProfilePicUrl?: string | null;
  threadsFollowerCount?: number | null;
  defaultTopic?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasThreadsConnected: boolean;
  signin: (email: string, password: string) => Promise<void>;
  signout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("tf_token"));
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const t = localStorage.getItem("tf_token");
    if (!t) { setUser(null); setIsLoading(false); return; }
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) throw new Error("invalid token");
      const data = await res.json();
      setUser(data);
    } catch {
      localStorage.removeItem("tf_token");
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const signin = async (email: string, password: string) => {
    const res = await fetch("/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Sign in failed");
    }
    const { token: t, user: u } = await res.json();
    localStorage.setItem("tf_token", t);
    setToken(t);
    setUser(u);
  };

  const signout = () => {
    localStorage.removeItem("tf_token");
    setToken(null);
    setUser(null);
    queryClient.clear();
  };

  return (
    <AuthContext.Provider value={{
      user, token, isLoading,
      isAuthenticated: !!user,
      hasThreadsConnected: !!user?.threadsAccessToken,
      signin, signout, refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
