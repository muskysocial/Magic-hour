import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const BUCKET = "magic-hour-assets";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Sign in is required." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    const secretKeys = secretKeysRaw ? JSON.parse(secretKeysRaw) : {};
    const serviceKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const apiKey = Deno.env.get("REMOVE_BG_API_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "Supabase server configuration is incomplete." }, 500);
    if (!apiKey) return json({ error: "REMOVE_BG_API_KEY is not configured in Supabase secrets." }, 503);

    const userClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "",
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Your session is invalid. Please sign in again." }, 401);
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const input = await req.json();
    const storagePath = String(input.storagePath || "");
    const projectId = String(input.projectId || "");
    if (!storagePath || !projectId || !storagePath.startsWith(userId + "/" + projectId + "/")) {
      return json({ error: "Invalid image or project." }, 400);
    }

    const { data: project, error: projectError } = await admin
      .from("mh_projects").select("id,user_id").eq("id", projectId).eq("user_id", userId).maybeSingle();
    if (projectError || !project) return json({ error: "Project not found." }, 404);

    const { data: asset, error: assetError } = await admin
      .from("mh_assets").select("id,storage_path,file_name,mime_type,size_bytes")
      .eq("user_id", userId).eq("project_id", projectId).eq("storage_path", storagePath).maybeSingle();
    if (assetError || !asset) return json({ error: "Uploaded image not found in this project." }, 404);
    if (!["image/jpeg", "image/png", "image/webp"].includes(asset.mime_type || "")) {
      return json({ error: "Please upload a JPG, PNG or WebP image." }, 400);
    }
    if (Number(asset.size_bytes || 0) > 12 * 1024 * 1024) {
      return json({ error: "This image exceeds the 12 MB processing limit. Please use a smaller image." }, 413);
    }

    const { data: source, error: downloadError } = await admin.storage.from(BUCKET).download(storagePath);
    if (downloadError || !source) return json({ error: "Could not read the uploaded image from private storage." }, 500);

    const form = new FormData();
    form.append("image_file", source, asset.file_name || "image.png");
    form.append("size", "auto");
    form.append("format", "png");

    const response = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": apiKey },
      body: form,
    });

    if (!response.ok) {
      const providerMessage = (await response.text()).slice(0, 1200);
      console.error("remove.bg error", response.status, providerMessage);
      const message = response.status === 402
        ? "Your remove.bg account has no processing credits remaining."
        : response.status === 403
        ? "The remove.bg API key was rejected or does not have API access."
        : response.status === 429
        ? "The remove.bg rate limit was reached. Please try again shortly."
        : "remove.bg could not process this image. Please try another image.";
      return json({ error: message, providerStatus: response.status }, response.status === 429 ? 429 : 502);
    }

    const outputBlob = await response.blob();
    if (!outputBlob.size || outputBlob.size > 25 * 1024 * 1024) {
      return json({ error: "The background-removal result was empty or too large." }, 502);
    }
    const outputPath = userId + "/" + projectId + "/" + crypto.randomUUID() + "-background-removed.png";
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(outputPath, outputBlob, {
      contentType: "image/png", upsert: false, cacheControl: "3600",
    });
    if (uploadError) throw uploadError;

    const { data: savedAsset, error: saveError } = await admin.from("mh_assets").insert({
      user_id: userId,
      project_id: projectId,
      storage_path: outputPath,
      file_name: (asset.file_name || "image").replace(/\.[^.]+$/, "") + "-background-removed.png",
      mime_type: "image/png",
      size_bytes: outputBlob.size,
    }).select("id,storage_path,file_name,mime_type,size_bytes,created_at").single();
    if (saveError) {
      await admin.storage.from(BUCKET).remove([outputPath]);
      throw saveError;
    }

    await admin.from("mh_projects").update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", projectId).eq("user_id", userId);
    const { data: signed, error: signedError } = await admin.storage.from(BUCKET).createSignedUrl(outputPath, 3600);
    if (signedError) throw signedError;
    return json({ ok: true, asset: savedAsset, signedUrl: signed?.signedUrl || null });
  } catch (error) {
    console.error("remove-background error:", error);
    return json({ error: error instanceof Error ? error.message : "Background removal failed." }, 500);
  }
});