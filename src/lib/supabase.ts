import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://vrhmaeywqsohlztoouxu.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyaG1hZXl3cXNvaGx6dG9vdXh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDIxOTIsImV4cCI6MjA5MTQxODE5Mn0.GaiexH5L24zAoLgvjOUiixbHdnQW8kUMXXbyjnM8cM4";

/**
 * Supabase auth persistence
 *
 * - `persistSession: true` writes the session to `localStorage` after every
 *   sign-in and reads it back on `createClient()`. This is browser-persistent
 *   across tabs and restarts (it's not a session-scoped store).
 * - `autoRefreshToken: true` silently rolls the access token over before it
 *   expires, so the user stays signed in until the refresh token's lifetime
 *   runs out (controlled in the Supabase dashboard, default is 1 week, can be
 *   bumped to up to 1 year).
 * - `detectSessionInUrl: true` is required for the magic-link callback flow.
 *
 * We deliberately use Supabase's default `localStorage` storage rather than a
 * custom cookie adapter — cookies have a 4KB-per-cookie limit that the PKCE
 * + JWT session can exceed, and the default storage is more reliable.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
