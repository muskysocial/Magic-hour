import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Restored magic hour Supabase project.
// This publishable key is designed for browser use with Row Level Security enabled.
// Never put a service-role or secret key in this file.
export const SUPABASE_URL = "https://uhlxjbnzjxmvepqqiblb.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_8w4Mjwha6bANdd6dbotf8w_7qZeGHUL";
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});