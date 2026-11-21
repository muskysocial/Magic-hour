import { createClient } from "npm:@supabase/supabase-js@2";

const OWNER_EMAIL = "ugohjeremiah16@gmail.com";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

async function identify(req: Request) {
  const header = req.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  return error || !data.user ? null : data.user;
}
async function requireAdmin(req: Request) {
  const user = await identify(req);
  if (!user) throw new Error("Sign in required.");
  if ((user.email || "").toLowerCase() !== OWNER_EMAIL) throw new Error("Admin access denied.");
  const { data, error } = await admin.from("admin_users").select("role").eq("user_id", user.id).maybeSingle();
  if (error || !data || !["admin", "owner", "super_admin"].includes(data.role)) throw new Error("Admin access denied.");
  return user;
}
function validDate(value: unknown) {
  if (value === null || value === "") return null;
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid campaign date.");
  return date.toISOString();
}
async function publicCampaigns() {
  const now = new Date().toISOString();
  const { data, error } = await admin.from("mh_site_campaigns")
    .select("id,title,message,asset_id,link_url,placements,starts_at,ends_at,priority,mh_assets!inner(file_name,mime_type,storage_path)")
    .eq("status", "active").lte("starts_at", now)
    .or("ends_at.is.null,ends_at.gt." + now)
    .order("priority", { ascending: false }).order("created_at", { ascending: false }).limit(20);
  if (error) throw error;
  const campaigns = await Promise.all((data || []).map(async (row: any) => {
    const asset = Array.isArray(row.mh_assets) ? row.mh_assets[0] : row.mh_assets;
    if (!asset || !["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/quicktime"].includes(asset.mime_type)) return null;
    const { data: signed, error: signError } = await admin.storage.from("magic-hour-assets").createSignedUrl(asset.storage_path, 3600);
    if (signError || !signed?.signedUrl) return null;
    return { id: row.id, title: row.title, message: row.message, link_url: row.link_url,
      placements: row.placements, media_type: asset.mime_type, media_url: signed.signedUrl };
  }));
  return campaigns.filter(Boolean);
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    if (action === "list_public") return json({ campaigns: await publicCampaigns() });
    const user = await requireAdmin(req);
    if (action === "list_admin") {
      const { data, error } = await admin.from("mh_site_campaigns")
        .select("*,mh_assets!inner(id,file_name,mime_type,size_bytes)")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return json({ campaigns: data || [] });
    }
    if (action === "save") {
      const id = body.id ? String(body.id) : null;
      const title = String(body.title || "").trim().slice(0, 120);
      const message = String(body.message || "").trim().slice(0, 500);
      const assetId = String(body.asset_id || "");
      const placements: string[] = Array.isArray(body.placements) ? Array.from(new Set((body.placements as unknown[]).map((p: unknown) => String(p)))) : [];
      if (!title || !/^[0-9a-f-]{36}$/i.test(assetId)) return json({ error: "Campaign title and media are required." }, 400);
      if (!placements.length || placements.some((p: string) => !["welcome","homepage"].includes(p))) return json({ error: "Choose a valid campaign placement." }, 400);
      const { data: asset, error: assetError } = await admin.from("mh_assets")
        .select("id,user_id,mime_type,storage_path").eq("id", assetId).eq("user_id", user.id).maybeSingle();
      if (assetError || !asset || !asset.storage_path?.startsWith(user.id + "/site-media/")) return json({ error: "Choose a media file from the Site Uploads library." }, 400);
      if (!["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/quicktime"].includes(asset.mime_type)) return json({ error: "Campaign media must be an image or video." }, 400);
      const startsAt = validDate(body.starts_at) || new Date().toISOString();
      const endsAt = validDate(body.ends_at);
      if (endsAt && new Date(endsAt) <= new Date(startsAt)) return json({ error: "End date must be after the start date." }, 400);
      const link = String(body.link_url || "").trim();
      if (link && !/^https:\/\//i.test(link)) return json({ error: "Campaign links must use HTTPS." }, 400);
      if (id && !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid campaign identifier." }, 400);
      const record = { title, message, asset_id: assetId, link_url: link || null, placements,
        starts_at: startsAt, ends_at: endsAt,
        priority: Math.max(0, Math.min(1000, Number(body.priority) || 0)), updated_at: new Date().toISOString() };
      const result = id
        ? await admin.from("mh_site_campaigns").update(record).eq("id", id).select("*").single()
        : await admin.from("mh_site_campaigns").insert({ ...record, status: "draft", created_by: user.id }).select("*").single();
      if (result.error) throw result.error;
      await admin.from("mh_admin_audit_log").insert({ actor_user_id: user.id, actor_email: OWNER_EMAIL, action: id ? "campaign.update" : "campaign.create", target: result.data.id, details: title });
      return json({ campaign: result.data });
    }
    if (action === "set_status") {
      const id = String(body.id || "");
      const status = String(body.status || "");
      if (!/^[0-9a-f-]{36}$/i.test(id) || !["draft","active","paused","archived"].includes(status)) return json({ error: "Invalid campaign status." }, 400);
      const { data, error } = await admin.from("mh_site_campaigns").update({ status, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
      if (error) throw error;
      await admin.from("mh_admin_audit_log").insert({ actor_user_id: user.id, actor_email: OWNER_EMAIL, action: "campaign.status", target: id, details: status });
      return json({ campaign: data });
    }
    if (action === "delete") {
      const id = String(body.id || "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid campaign." }, 400);
      const { error } = await admin.from("mh_site_campaigns").delete().eq("id", id);
      if (error) throw error;
      await admin.from("mh_admin_audit_log").insert({ actor_user_id: user.id, actor_email: OWNER_EMAIL, action: "campaign.delete", target: id, details: "Deleted campaign" });
      return json({ ok: true });
    }
    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Campaign request failed.";
    const status = message.includes("Admin access denied") ? 403 : message.includes("Sign in required") ? 401 : 500;
    return json({ error: message }, status);
  }
});
