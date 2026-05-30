/**
 * CareerPilot — Auth Context
 * ============================
 * Provides authentication state and methods throughout the app.
 * Stores JWT token in localStorage and auto-restores session on load.
 * Redirects to /login if not authenticated.
 */

"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  loginUser,
  registerUser,
  getCurrentUser,
  setToken,
  removeToken,
  getToken,
  type UserInfo,
  type AuthResponse,
} from "@/lib/api";

interface AuthContextValue {
  user: UserInfo | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Restore session on mount
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
      // Redirect to login if not on login page
      if (pathname !== "/login") {
        router.replace("/login");
      }
      return;
    }

    // Validate token by calling /api/auth/me
    getCurrentUser()
      .then((userData) => {
        setUser(userData);
        // If on login page and already authenticated, redirect to dashboard
        if (pathname === "/login") {
          router.replace("/");
        }
      })
      .catch(() => {
        // Token is invalid/expired
        removeToken();
        if (pathname !== "/login") {
          router.replace("/login");
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(
    async (email: string, password: string) => {
      const response: AuthResponse = await loginUser(email, password);
      setToken(response.access_token);
      setUser(response.user);
      router.replace("/");
    },
    [router]
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const response: AuthResponse = await registerUser(name, email, password);
      setToken(response.access_token);
      setUser(response.user);
      router.replace("/");
    },
    [router]
  );

  const logout = useCallback(() => {
    removeToken();
    setUser(null);
    router.replace("/login");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
