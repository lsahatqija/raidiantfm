import { useCallback, useEffect, useRef, useState } from "react";
import { SERVER_BASE } from "../utils/constants";
import { getStoredRefreshToken, loadAuthTokens, saveAuthTokens } from "../utils/authStorage";

export function useAuth() {
  const [accessToken, setAccessToken] = useState(() => {
    if (typeof window === "undefined") return null;
    return loadAuthTokens()?.accessToken ?? null;
  });

  const refreshTimerRef = useRef(null);

  const scheduleTokenRefresh = useCallback(function schedule(expiresAt) {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const delay = expiresAt - Date.now() - 60_000;
    if (delay <= 0) return;
    refreshTimerRef.current = setTimeout(async () => {
      const storedRefreshToken = getStoredRefreshToken();
      if (!storedRefreshToken) {
        setAccessToken(null);
        return;
      }
      try {
        const res = await fetch(`${SERVER_BASE}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: storedRefreshToken }),
        });
        if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
        const data = await res.json();
        const ttl = data.expiresIn ?? 3600;
        saveAuthTokens(data.accessToken, storedRefreshToken, ttl);
        setAccessToken(data.accessToken);
        schedule(Date.now() + ttl * 1000);
      } catch (err) {
        console.error("Silent token refresh failed:", err);
        setAccessToken(null);
      }
    }, delay);
  }, []);

  const handleLogin = useCallback(() => {
    const width = 450;
    const height = 700;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;
    const popup = window.open(
      `${SERVER_BASE}/auth/login`,
      "Spotify Login",
      `width=${width},height=${height},left=${left},top=${top}`
    );

    const checkClosed = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(checkClosed);
        fetch(`${SERVER_BASE}/auth/token`)
          .then((res) => res.json())
          .then((data) => {
            if (data.accessToken) {
              const ttl = data.expiresIn ?? 3600;
              saveAuthTokens(data.accessToken, data.refreshToken ?? "", ttl);
              setAccessToken(data.accessToken);
              scheduleTokenRefresh(Date.now() + ttl * 1000);
            }
          })
          .catch((err) => console.error("Failed to fetch token:", err));
      }
    }, 500);
  }, [scheduleTokenRefresh]);

  // On mount, rehydrate the refresh timer if we already have a valid stored token.
  useEffect(() => {
    const stored = loadAuthTokens();
    if (stored?.expiresAt) {
      scheduleTokenRefresh(stored.expiresAt);
    }
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [scheduleTokenRefresh]);

  useEffect(() => {
    const onMessage = (event) => {
      if (event.data?.accessToken) {
        const { accessToken: token, refreshToken, expiresIn } = event.data;
        const ttl = expiresIn ?? 3600;
        saveAuthTokens(token, refreshToken ?? "", ttl);
        setAccessToken(token);
        scheduleTokenRefresh(Date.now() + ttl * 1000);
      }
    };

    console.log("Adding message event listener for auth response");
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [scheduleTokenRefresh]);

  return { accessToken, setAccessToken, handleLogin };
}
