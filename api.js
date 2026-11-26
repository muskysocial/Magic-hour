import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Magic Hour browser client. Keep Supabase sessions in this origin's localStorage
// so a reload restores the signed-in user on the same site origin.
export const SUPABASE_URL = "https://uhlxjbnzjxmvepqqiblb.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_8w4Mjwha6bANdd6dbotf8w_7qZeGHUL";
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: window.localStorage,
    storageKey: "sb-uhlxjbnzjxmvepqqiblb-auth-token",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
