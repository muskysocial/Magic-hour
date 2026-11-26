import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return respond({ ok: false, error: "Method not allowed." }, 405);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return respond({ ok: false, error: "Sign in is required." }, 401);
    const url = Deno.env.get("SUPABASE_URL") || "";
    const publishable = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    const userClient = createClient(url, publishable, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data, error } = await userClient.auth.getUser();
    if (error || !data.user) return respond({ ok: false, error: "Your session is invalid. Sign in again." }, 401);

    const key = Deno.env.get("PIAPI_API_KEY")?.trim();
    if (!key) return respond({ ok: false, connected: false, error: "PIAPI_API_KEY is missing from Supabase Edge Function secrets." }, 503);

    // Empty task payload is deliberately invalid: it tests authentication without creating billable work.
    const probe = await fetch("https://api.piapi.ai/api/v1/task", {
      method: "POST",
      headers: { "X-API-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const raw = await probe.text();
    let details = "";
    try {
      const parsed = JSON.parse(raw);
      details = typeof parsed?.message === "string" ? parsed.message : typeof parsed?.error === "string" ? parsed.error : "";
    } catch { /* provider response is intentionally not returned */ }

    if (probe.status === 401 || probe.status === 403) {
      return respond({ ok: false, connected: false, error: "PiAPI rejected the key. Check that PIAPI_API_KEY is the API key from your PiAPI dashboard." });
    }
    if (probe.status === 429) {
      return respond({ ok: false, connected: false, error: "PiAPI accepted the request but rate-limited the test. Check your account quota and try again." });
    }
    if (probe.status >= 500) {
      return respond({ ok: false, connected: false, error: "PiAPI is temporarily unavailable. Try again shortly." });
    }
    return respond({
      ok: true,
      connected: true,
      provider: "PiAPI",
      validationStatus: probe.status,
      message: "PiAPI authentication succeeded. The empty test payload was not a generation request, so no video was created or charged.",
      ...(details ? { validationMessage: details.slice(0, 180) } : {}),
      checkedAt: new Date().toISOString(),
    });
  } catch (_error) {
    return respond({ ok: false, connected: false, error: "Could not reach PiAPI. Check the Supabase function logs and try again." }, 500);
  }
});