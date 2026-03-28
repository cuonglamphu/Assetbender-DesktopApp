import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "../context/AuthContext";
import { VITE_SOCKET_URL } from "../config/env";

/**
 * Socket.IO session mirroring [Master-Mouse/lib/core/services/auth/session_services.dart]:
 * auth via accessToken, listen for `account_status` -> deactivated => logout.
 */
export function useSessionSocket() {
  const { user, logout } = useAuth();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!user?.accessToken) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const s = io(VITE_SOCKET_URL, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 3000,
      timeout: 20_000,
      auth: { accessToken: user.accessToken },
    });

    socketRef.current = s;

    s.on("account_status", (data: unknown) => {
      try {
        const d = data as { status?: string };
        if (d?.status === "deactivated") {
          void logout();
        }
      } catch {
        /* ignore */
      }
    });

    s.connect();

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [user?.accessToken, logout]);
}
