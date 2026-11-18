import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Existing MuskySocials Supabase project connection.
// Keep this publishable key client-side only; never place a service-role key here.
export const SUPABASE_URL = "https://jnsbttwyiwcqhuhveikq.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_LB_HC5TVIdKf7FX3c0q8Hg__81wa5F2";
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);