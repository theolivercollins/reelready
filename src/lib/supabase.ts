import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://vrhmaeywqsohlztoouxu.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyaG1hZXl3cXNvaGx6dG9vdXh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDIxOTIsImV4cCI6MjA5MTQxODE5Mn0.GaiexH5L24zAoLgvjOUiixbHdnQW8kUMXXbyjnM8cM4";

/**
 * Supabase auth — implicit flow with persistent localStorage sessions.
 *
 * `flowType: "implicit"` is critical. The default in supabase-js v2.40+ is
 * PKCE, which stores a `code_verifier` at the origin that *initiates* the
 * sign-in. If Supabase then redirects the magic link to a different origin
 * (because the dashboard's "Site URL" doesn't match), the verifier is
 * unreachable and the code exchange fails — the user gets bounced back to
 * the sign-in screen even though the link was valid. Implicit flow returns
 * the access token in the URL fragment instead, so any origin Supabase JS
 * lands on can extract it. Slightly less secure than PKCE in theory but
 * fine for this product and immune to cross-origin redirect mismatches.
 *
 * `persistSession` + `autoRefreshToken` keep the user signed in across
 * refreshes and silently roll the access token over before it expires.
 * `detectSessionInUrl` lets Supabase pick up the token fragment on any page.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "implicit",
  },
});

/**
 * Canonical magic-link callback URL.
 *
 * Uses the current origin on localhost and .vercel.app previews so magic-link
 * sign-in returns to the same URL it started from. The implicit flow above is
 * immune to cross-origin mismatch, so this is safe. Requires Supabase Auth →
 * URL Configuration → Redirect URLs to allow https://*.vercel.app/auth/callback
 * for preview deployments to succeed.
 */
export const AUTH_CALLBACK_URL =
  typeof window !== "undefined" &&
  (window.location.hostname.endsWith(".vercel.app") || window.location.hostname === "localhost")
    ? `${window.location.origin}/auth/callback`
    : "https://listingelevate.com/auth/callback";

