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
    const url = Deno.env.get("SUPABASE_URL");
    const publishable = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    const userClient = createClient(url || "", publishable, {
      global: { headers: { Authorization: auth } }, auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return respond({ ok: false, error: "Your session is invalid. Sign in again." }, 401);

    const key = Deno.env.get("FAL_KEY");
    if (!key) return respond({ ok: false, error: "FAL_KEY is missing from Supabase Edge Function secrets." }, 503);

    // An empty payload deliberately validates authentication and model routing only.
    // Fal should reject it as an input-validation error; no generation is submitted.
    const probe = await fetch("https://queue.fal.run/fal-ai/kling-video/v2.1/master/image-to-video", {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const bodyText = await probe.text();
    let providerBody: Record<string, unknown> = {};
    try { providerBody = JSON.parse(bodyText); } catch { /* keep provider response private */ }

    if (probe.status === 401 || probe.status === 403) {
      return respond({ ok: false, connected: false, error: "Fal.ai rejected the key. Check that FAL_KEY is correct." }, 200);
    }
    if (probe.status === 404) {
      return respond({ ok: false, connected: false, error: "Fal.ai key was accepted, but the selected video model route was not found." }, 200);
    }
    if (probe.status >= 500) {
      return respond({ ok: false, connected: false, error: "Fal.ai is temporarily unavailable. Try the connection check again later." }, 200);
    }

    return respond({
      ok: true,
      connected: true,
      provider: "fal.ai",
      model: "fal-ai/kling-video/v2.1/master/image-to-video",
      validationStatus: probe.status,
      message: "Fal.ai authenticated successfully and the Kling image-to-video route responded. No video was generated during this check.",
      checkedAt: new Date().toISOString(),
    });
  } catch (_error) {
    return respond({ ok: false, error: "Could not complete the Fal.ai connection check." }, 500);
  }
});