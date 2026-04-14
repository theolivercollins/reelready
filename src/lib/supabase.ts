import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://vrhmaeywqsohlztoouxu.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyaG1hZXl3cXNvaGx6dG9vdXh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDIxOTIsImV4cCI6MjA5MTQxODE5Mn0.GaiexH5L24zAoLgvjOUiixbHdnQW8kUMXXbyjnM8cM4";

/**
 * Hybrid storage adapter for Supabase auth.
 *
 * Persists the session in BOTH a long-lived cookie and localStorage so
 * returning visitors stay signed in.
 *  - Cookie: 1-year Max-Age, Path=/, SameSite=Lax, Secure on https.
 *    Survives new tabs and browser restarts and is sent on every request.
 *  - localStorage: belt-and-suspenders fallback for sessions that exceed
 *    the 4KB single-cookie limit, or environments where the cookie is
 *    blocked.
 *
 * Reads prefer the cookie; if a cookie is missing but localStorage still
 * has a session, the next setItem rehydrates the cookie automatically.
 */
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const isHttps =
  typeof window !== "undefined" && window.location.protocol === "https:";

function setCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  const secure = isHttps ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const target = `${name}=`;
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(target)) {
      try {
        return decodeURIComponent(part.slice(target.length));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  const secure = isHttps ? "; Secure" : "";
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
}

const hybridStorage = {
  getItem(key: string): string | null {
    const cookie = getCookie(key);
    if (cookie) return cookie;
    if (typeof localStorage !== "undefined") return localStorage.getItem(key);
    return null;
  },
  setItem(key: string, value: string): void {
    if (value.length < 4000) {
      setCookie(key, value);
    } else {
      // Session is too large for a single cookie — clear the cookie so it
      // can't go stale, and rely on localStorage only.
      deleteCookie(key);
    }
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  },
  removeItem(key: string): void {
    deleteCookie(key);
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    storage: hybridStorage,
    storageKey: "listing-elevate-auth",
  },
});
