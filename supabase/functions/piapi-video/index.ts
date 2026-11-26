import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const safeMessage = (value: unknown) => typeof value === "string" ? value.slice(0, 240) : "Video generation failed.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ ok: false, error: "Method not allowed." }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return reply({ ok: false, error: "Sign in is required." }, 401);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const piapiKey = Deno.env.get("PIAPI_API_KEY")?.trim() || "";
  if (!url || !anon || !serviceKey || !piapiKey) return reply({ ok: false, error: "Video service configuration is incomplete. Ask the site administrator to check Supabase secrets." }, 503);

  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData?.user;
  if (authError || !user) return reply({ ok: false, error: "Your session is invalid. Sign in again." }, 401);

  try {
    const body = await req.json();
    const action = body?.action;

    if (action === "start") {
      const storagePath = String(body?.storagePath || "");
      const projectId = String(body?.projectId || "");
      const prompt = String(body?.prompt || "").trim();
      const duration = Number(body?.durationSeconds);
      const aspectRatio = ["16:9", "9:16", "1:1"].includes(body?.aspectRatio) ? body.aspectRatio : "16:9";
      if (!storagePath.startsWith(user.id + "/") || !projectId || !prompt || prompt.length > 1200) return reply({ ok: false, error: "Choose an uploaded image and enter a motion prompt." }, 400);
      if (![5, 10].includes(duration)) return reply({ ok: false, error: "This video model currently supports the 5- or 10-second options in this workspace." }, 400);

      const { data: asset, error: assetError } = await admin.from("mh_assets").select("id,storage_path,mime_type").eq("user_id", user.id).eq("storage_path", storagePath).maybeSingle();
      if (assetError || !asset || !asset.mime_type?.startsWith("image/")) return reply({ ok: false, error: "The uploaded image could not be verified in your Library." }, 400);
      const { data: project } = await admin.from("mh_projects").select("id").eq("id", projectId).eq("user_id", user.id).maybeSingle();
      if (!project) return reply({ ok: false, error: "The selected project could not be found." }, 404);

      const cost = duration * 10;
      const { data: job, error: jobError } = await admin.from("mh_video_jobs").insert({
        user_id: user.id, project_id: projectId, source_asset_path: storagePath,
        duration_seconds: duration, credit_cost: cost, status: "queued",
      }).select("id").single();
      if (jobError || !job) return reply({ ok: false, error: "Could not create the video job. Please try again." }, 500);

      const { data: debit, error: debitError } = await admin.rpc("consume_mh_video_credits", {
        p_user_id: user.id, p_job_id: job.id, p_amount: cost,
      });
      const debitRow = Array.isArray(debit) ? debit[0] : debit;
      if (debitError || !debitRow?.ok) {
        await admin.from("mh_video_jobs").delete().eq("id", job.id).eq("user_id", user.id);
        return reply({ ok: false, error: debitError ? "Could not verify your daily credits. Please try again." : "You do not have enough daily video credits for this duration.", creditsRemaining: debitRow?.credits_remaining ?? null }, 402);
      }

      const { data: signed, error: signError } = await admin.storage.from("magic-hour-assets").createSignedUrl(storagePath, 3600);
      if (signError || !signed?.signedUrl) {
        await admin.rpc("refund_mh_video_credits", { p_user_id: user.id, p_job_id: job.id, p_amount: cost });
        await admin.from("mh_video_jobs").update({ status: "failed", error_message: "Could not prepare the source image." }).eq("id", job.id);
        return reply({ ok: false, error: "Could not prepare the uploaded image for the video provider. Your credits were returned." }, 500);
      }

      const providerResponse = await fetch("https://api.piapi.ai/api/v1/task", {
        method: "POST",
        headers: { "X-API-Key": piapiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "kling",
          task_type: "video_generation",
          input: {
            prompt,
            image_url: signed.signedUrl,
            duration,
            aspect_ratio: aspectRatio,
            version: "1.6",
            mode: "std",
          },
        }),
      });
      const providerText = await providerResponse.text();
      let providerData: any = {};
      try { providerData = JSON.parse(providerText); } catch { /* handled below */ }
      const taskId = providerData?.data?.task_id || providerData?.task_id;
      if (!providerResponse.ok || !taskId) {
        await admin.rpc("refund_mh_video_credits", { p_user_id: user.id, p_job_id: job.id, p_amount: cost });
        await admin.from("mh_video_jobs").update({
          status: "failed",
          error_message: safeMessage(providerData?.message || providerData?.error || "PiAPI did not accept the generation request."),
        }).eq("id", job.id);
        return reply({ ok: false, error: safeMessage(providerData?.message || providerData?.error || "PiAPI did not accept the generation request."), creditsRefunded: true }, 502);
      }
      await admin.from("mh_video_jobs").update({ piapi_task_id: String(taskId), status: "processing", updated_at: new Date().toISOString() }).eq("id", job.id);
      await admin.from("mh_projects").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", projectId).eq("user_id", user.id);
      return reply({ ok: true, jobId: job.id, taskId: String(taskId), status: "processing", creditsRemaining: debitRow.credits_remaining, creditCost: cost });
    }

    if (action === "status") {
      const jobId = String(body?.jobId || "");
      const { data: job, error: jobError } = await admin.from("mh_video_jobs").select("*").eq("id", jobId).eq("user_id", user.id).maybeSingle();
      if (jobError || !job) return reply({ ok: false, error: "Video job not found." }, 404);
      if (job.status === "completed" && job.output_storage_path) {
        const { data: signed } = await admin.storage.from("magic-hour-assets").createSignedUrl(job.output_storage_path, 3600);
        return reply({ ok: true, status: "completed", videoUrl: signed?.signedUrl || "", creditsRemaining: await getCredits(admin, user.id) });
      }
      if (job.status === "failed") return reply({ ok: false, status: "failed", error: job.error_message || "Video generation failed.", creditsRemaining: await getCredits(admin, user.id) });
      if (!job.piapi_task_id) return reply({ ok: true, status: "queued", creditsRemaining: await getCredits(admin, user.id) });

      const poll = await fetch("https://api.piapi.ai/api/v1/task/" + encodeURIComponent(job.piapi_task_id), {
        headers: { "X-API-Key": piapiKey },
      });
      const raw = await poll.text();
      let result: any = {};
      try { result = JSON.parse(raw); } catch { /* handled below */ }
      if (!poll.ok) return reply({ ok: false, error: "Could not check the video task with PiAPI. Try again shortly." }, 502);
      const data = result?.data || result;
      const state = String(data?.status || data?.task_status || "").toLowerCase();
      if (["failed", "error", "cancelled", "canceled"].includes(state)) {
        const reason = safeMessage(data?.error?.message || data?.error || result?.message || "PiAPI could not complete this video.");
        await admin.rpc("refund_mh_video_credits", { p_user_id: user.id, p_job_id: job.id, p_amount: job.credit_cost });
        await admin.from("mh_video_jobs").update({ status: "failed", error_message: reason, updated_at: new Date().toISOString() }).eq("id", job.id);
        await admin.from("mh_projects").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", job.project_id).eq("user_id", user.id);
        return reply({ ok: false, status: "failed", error: reason, creditsRefunded: true, creditsRemaining: await getCredits(admin, user.id) });
      }

      const output = data?.output || {};
      const videoUrl = output?.video_url || output?.works?.[0]?.video?.resource || output?.works?.[0]?.video?.resource_without_watermark || output?.works?.[0]?.video_url;
      if (["completed", "success", "succeeded"].includes(state) || videoUrl) {
        if (!videoUrl) return reply({ ok: true, status: "processing", creditsRemaining: await getCredits(admin, user.id) });
        const videoResponse = await fetch(videoUrl);
        if (!videoResponse.ok) return reply({ ok: true, status: "processing", note: "Video is ready; preparing it for your Library.", creditsRemaining: await getCredits(admin, user.id) });
        const videoBlob = await videoResponse.blob();
        const path = user.id + "/" + job.project_id + "/" + Date.now() + "-piapi-video.mp4";
        const { error: uploadError } = await admin.storage.from("magic-hour-assets").upload(path, videoBlob, { contentType: "video/mp4", upsert: false });
        if (uploadError) return reply({ ok: true, status: "processing", note: "Video is ready; saving it to your Library.", creditsRemaining: await getCredits(admin, user.id) });
        const { error: assetInsertError } = await admin.from("mh_assets").insert({
          user_id: user.id, project_id: job.project_id, storage_path: path,
          file_name: "AI Video " + new Date().toISOString().slice(0, 10) + ".mp4",
          mime_type: "video/mp4", size_bytes: videoBlob.size,
        });
        if (assetInsertError) {
          await admin.storage.from("magic-hour-assets").remove([path]);
          return reply({ ok: true, status: "processing", note: "Video is ready; saving it to your Library.", creditsRemaining: await getCredits(admin, user.id) });
        }
        await admin.from("mh_video_jobs").update({ status: "completed", output_storage_path: path, updated_at: new Date().toISOString() }).eq("id", job.id);
        await admin.from("mh_projects").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", job.project_id).eq("user_id", user.id);
        const { data: signed } = await admin.storage.from("magic-hour-assets").createSignedUrl(path, 3600);
        return reply({ ok: true, status: "completed", videoUrl: signed?.signedUrl || "", creditsRemaining: await getCredits(admin, user.id) });
      }
      await admin.from("mh_video_jobs").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", job.id);
      return reply({ ok: true, status: "processing", creditsRemaining: await getCredits(admin, user.id) });
    }

    return reply({ ok: false, error: "Unknown video action." }, 400);
  } catch (_error) {
    return reply({ ok: false, error: "The video service encountered an unexpected error. Try again or contact support." }, 500);
  }
});

async function getCredits(admin: any, userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await admin.from("mh_video_credit_balances").select("credit_date,credits_remaining").eq("user_id", userId).maybeSingle();
  return !data || data.credit_date !== today ? 100 : data.credits_remaining;
}
