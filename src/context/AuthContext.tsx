import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { OAuthErrorDialog } from "../components/OAuthErrorDialog";
import type { OauthErrorPayload } from "../components/OAuthErrorDialog";
import type { TokenPayload } from "../types/models";
import { isAccessTokenExpired } from "../auth/jwt";

type AuthContextValue = {
  user: TokenPayload | null;
  loading: boolean;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
  setUserFromPayload: (p: TokenPayload) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<TokenPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [oauthError, setOauthError] = useState<OauthErrorPayload | null>(null);

  const refreshSession = useCallback(async () => {
    const current = await invoke<TokenPayload | null>("session_get");
    if (!current?.accessToken) {
      setUser(null);
      return;
    }
    if (isAccessTokenExpired(current.accessToken)) {
      try {
        const refreshed = await invoke<TokenPayload>("session_refresh");
        setUser(refreshed);
      } catch {
        setUser(null);
      }
    } else {
      setUser(current);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const initTimeoutMs = 30_000;
    (async () => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          refreshSession(),
          new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(() => {
              reject(new Error("auth init timeout"));
            }, initTimeoutMs);
          }),
        ]);
      } catch {
        setUser(null);
      } finally {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSession]);

  useEffect(() => {
    const un = listen("oauth-complete", () => {
      void refreshSession();
    });
    const un2 = listen("session-ended", () => {
      setUser(null);
    });
    const un3 = listen<OauthErrorPayload>("oauth-error", (e) => {
      setOauthError(e.payload);
    });
    return () => {
      void un.then((f) => f());
      void un2.then((f) => f());
      void un3.then((f) => f());
    };
  }, [refreshSession]);

  const logout = useCallback(async () => {
    await invoke("session_logout");
    setUser(null);
  }, []);

  const setUserFromPayload = useCallback((p: TokenPayload) => {
    setUser(p);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      refreshSession,
      logout,
      setUserFromPayload,
    }),
    [user, loading, refreshSession, logout, setUserFromPayload],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {oauthError ? (
        <OAuthErrorDialog
          payload={oauthError}
          onDismiss={() => setOauthError(null)}
        />
      ) : null}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const c = useContext(AuthContext);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
