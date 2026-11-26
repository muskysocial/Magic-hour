import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405, headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: false, error: "Please sign in to check video access." }), { status: 401, headers: cors });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ ok: false, error: "Your session has expired. Please sign in again." }), { status: 401, headers: cors });
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ ok: false, configured: false, error: "GEMINI_API_KEY is not configured in Supabase Edge Function secrets." }), { status: 200, headers: cors });
    }

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", {
      headers: { "x-goog-api-key": apiKey },
    });
    if (!response.ok) {
      const status = response.status;
      let providerMessage = "";
      try {
        const body = await response.json();
        providerMessage = body?.error?.message || "";
      } catch { /* ignore provider response parse errors */ }
      const safeMessage = status === 400 || status === 401 || status === 403
        ? "Google rejected this API key or this key does not have access to the Gemini API. Check the key and its API restrictions."
        : status === 429
          ? "Google API quota or rate limit reached. Try again later or review the project's quota."
          : "Google model discovery failed. Please try again.";
      return new Response(JSON.stringify({ ok: false, configured: true, providerStatus: status, error: safeMessage, providerMessage: providerMessage.slice(0, 240) }), { status: 200, headers: cors });
    }

    const payload = await response.json();
    const models = (payload.models || []).map((m: any) => ({
      name: m.name,
      displayName: m.displayName,
      supportedGenerationMethods: m.supportedGenerationMethods || [],
    }));
    const videoModels = models.filter((m: any) =>
      /veo|video/i.test(m.name + " " + (m.displayName || "")) ||
      m.supportedGenerationMethods.some((method: string) => /video/i.test(method))
    );

    return new Response(JSON.stringify({
      ok: true,
      configured: true,
      totalModels: models.length,
      videoModels,
      hasVideoGeneration: videoModels.some((m: any) =>
        m.supportedGenerationMethods.some((method: string) => /generate|predict|video/i.test(method))
      ),
      checkedAt: new Date().toISOString(),
    }), { status: 200, headers: cors });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Unexpected diagnostic error." }), { status: 500, headers: cors });
  }
});
