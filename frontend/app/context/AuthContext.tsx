"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface User {
  id: number;
  username: string;
  email?: string;
  role: "user" | "admin";
  category_count?: number;
  avatar?: string | null; // Canonical avatar field
  avatar_version?: number; // Frontend-only cache busting property
}

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
  isInitialized: boolean; // True when auth state has been loaded from localStorage
  authLoading: boolean; // True while verifying token with backend
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Restore session from token on mount
  useEffect(() => {
    if (typeof window === "undefined") {
      setIsInitialized(true);
      setAuthLoading(false);
      return;
    }

    const restoreSession = async () => {
      try {
        const token = localStorage.getItem("token");
        
        if (!token) {
          // No token, clear any stale user data
          localStorage.removeItem("user");
          setUser(null);
          setIsInitialized(true);
          setAuthLoading(false);
          return;
        }

        // Token exists, verify with backend
        try {
          // Import apiGet dynamically to avoid circular dependency
          const { apiGet } = await import("../services/api");
          
          // Try /api/users/me first, fallback to /api/auth/me
          let userData;
          try {
            userData = await apiGet("/users/me", true, { silentStatuses: [404] });
          } catch (err: any) {
            // Handle network errors (status 0) gracefully - don't clear token
            if (err.status === 0 || err.isNetworkError) {
              console.warn("[AuthContext] Backend unreachable, restoring from localStorage:", err.message);
              // Restore from localStorage and continue - don't clear token
              const storedUser = localStorage.getItem("user");
              if (storedUser) {
                try {
                  const parsed = JSON.parse(storedUser);
                  const normalized: User = {
                    id: parsed.id,
                    username: parsed.username,
                    email: parsed.email,
                    role: parsed.role,
                    category_count: parsed.category_count ?? null,
                    avatar: parsed.avatar ?? parsed.avatar_url ?? null,
                    avatar_version: parsed.avatar_version,
                  };
                  setUser(normalized);
                  setIsInitialized(true);
                  setAuthLoading(false);
                  return; // Exit early - don't try fallback endpoint
                } catch (parseErr) {
                  console.error("[AuthContext] Failed to parse stored user:", parseErr);
                }
              }
              // If localStorage restore fails, fall through to try /auth/me
              // But if that also fails, we'll restore from localStorage in the outer catch
            }
            
            if (err.status === 404) {
              // Fallback to /api/auth/me
              userData = await apiGet("/auth/me", true, { silentStatuses: [404] });
            } else {
              throw err;
            }
          }
          
          if (userData && userData.id) {
            // Normalize to canonical avatar field only (remove avatar_url)
            const normalized: User = {
              id: userData.id,
              username: userData.username,
              email: userData.email,
              role: userData.role,
              category_count: userData.category_count ?? null,
              avatar: userData.avatar ?? userData.avatar_url ?? null, // Canonical field
            };
            // Valid token, set user with normalized avatar field
            setUser(normalized);
            localStorage.setItem("user", JSON.stringify(normalized));
          } else {
            // 404 or invalid response, clear session
            console.warn("[AuthContext] Auth verification returned invalid data, clearing session");
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            setUser(null);
          }
        } catch (err: any) {
          // Handle API errors
          if (err.status === 401 || err.status === 403) {
            // Token is invalid/expired, clear session
            console.log("[AuthContext] Token invalid or expired, clearing session");
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            setUser(null);
          } else if (err.status === 0 || err.isNetworkError) {
            // Network error (backend down, CORS issue, etc.) - restore from localStorage, DON'T clear token
            console.warn("[AuthContext] Backend unreachable during auth check, using cached user data:", err.message);
            try {
              const storedUser = localStorage.getItem("user");
              if (storedUser) {
                const parsed = JSON.parse(storedUser);
                const normalized: User = {
                  id: parsed.id,
                  username: parsed.username,
                  email: parsed.email,
                  role: parsed.role,
                  category_count: parsed.category_count ?? null,
                  avatar: parsed.avatar ?? parsed.avatar_url ?? null,
                  avatar_version: parsed.avatar_version,
                };
                setUser(normalized);
                // Keep token and user in localStorage - will retry on next page load
              } else {
                // No cached user, but keep token - maybe backend will be back
                setUser(null);
              }
            } catch (parseErr) {
              console.error("[AuthContext] Failed to parse stored user:", parseErr);
              setUser(null);
            }
          } else if (err.status === 404) {
            // Endpoint doesn't exist, log but don't clear token
            console.error("[AuthContext] Auth endpoint not found. Token kept but user not restored.");
            // Try to restore from localStorage as fallback
            try {
              const storedUser = localStorage.getItem("user");
              if (storedUser) {
                const parsed = JSON.parse(storedUser);
                const normalized: User = {
                  id: parsed.id,
                  username: parsed.username,
                  email: parsed.email,
                  role: parsed.role,
                  category_count: parsed.category_count ?? null,
                  avatar: parsed.avatar ?? parsed.avatar_url ?? null,
                  avatar_version: parsed.avatar_version,
                };
                setUser(normalized);
                localStorage.setItem("user", JSON.stringify(normalized));
              }
            } catch (parseErr) {
              console.error("[AuthContext] Failed to parse stored user:", parseErr);
            }
          } else {
            // Other errors (500, etc.) - don't clear token, restore from localStorage
            console.error("[AuthContext] Auth verification failed (non-auth error):", err.status, err.message);
            try {
              const storedUser = localStorage.getItem("user");
              if (storedUser) {
                const parsed = JSON.parse(storedUser);
                const normalized: User = {
                  id: parsed.id,
                  username: parsed.username,
                  email: parsed.email,
                  role: parsed.role,
                  category_count: parsed.category_count ?? null,
                  avatar: parsed.avatar ?? parsed.avatar_url ?? null,
                  avatar_version: parsed.avatar_version,
                };
                setUser(normalized);
                localStorage.setItem("user", JSON.stringify(normalized));
              }
            } catch (parseErr) {
              console.error("[AuthContext] Failed to parse stored user:", parseErr);
            }
          }
        }
      } catch (err) {
        console.error("Failed to restore session:", err);
        // Try to restore from localStorage as last resort
          try {
            const storedUser = localStorage.getItem("user");
            if (storedUser) {
              const parsed = JSON.parse(storedUser);
              // Normalize to canonical avatar field only, preserve avatar_version
              const normalized: User = {
                id: parsed.id,
                username: parsed.username,
                email: parsed.email,
                role: parsed.role,
                category_count: parsed.category_count ?? null,
                avatar: parsed.avatar ?? parsed.avatar_url ?? null, // Canonical field
                avatar_version: parsed.avatar_version, // Preserve frontend cache busting property
              };
              setUser(normalized);
              // Update localStorage with normalized version
              localStorage.setItem("user", JSON.stringify(normalized));
            } else {
              localStorage.removeItem("user");
              localStorage.removeItem("token");
              setUser(null);
            }
          } catch (parseErr) {
            console.error("Failed to parse stored user:", parseErr);
            localStorage.removeItem("user");
            localStorage.removeItem("token");
            setUser(null);
          }
      } finally {
        setIsInitialized(true);
        setAuthLoading(false);
      }
    };

    restoreSession();
  }, []);

  // Logout function
  const logout = () => {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setUser(null);
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, setUser, logout, isInitialized, authLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

