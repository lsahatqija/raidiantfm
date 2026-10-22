import { AUTH_STORAGE_KEY } from "./constants";

export function saveAuthTokens(accessToken, refreshToken, expiresIn) {
  try {
    const expiresAt = Date.now() + expiresIn * 1000;
    window.sessionStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ accessToken, refreshToken, expiresAt })
    );
  } catch (err) {
    console.error("Failed to save auth tokens:", err);
  }
}

export function loadAuthTokens() {
  try {
    const raw = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.accessToken || !parsed?.refreshToken || !parsed?.expiresAt) {
      window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    if (Date.now() >= parsed.expiresAt) {
      // Keep the entry so the refreshToken stays available for a silent refresh.
      return null;
    }
    return parsed;
  } catch (err) {
    console.error("Failed to load auth tokens:", err);
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

/**
 * Returns the stored refreshToken regardless of whether the access token has
 * expired. Returns null if no entry exists or the token is missing.
 */
export function getStoredRefreshToken() {
  try {
    const raw = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.refreshToken ?? null;
  } catch {
    return null;
  }
}
