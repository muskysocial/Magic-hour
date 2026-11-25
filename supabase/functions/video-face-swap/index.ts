import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { readMp4Metadata } from "./mp4.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const safeText = (value: unknown) => typeof value === "string" ? value.slice(0, 220) : "Video face swap failed.";



Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ ok: false, error: "Method not allowed." }, 405);
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return reply({ ok: false, error: "Sign in is required." }, 401);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishable = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const piapiKey = Deno.env.get("PIAPI_API_KEY")?.trim() || "";
  if (!url || !publishable || !serviceKey || !piapiKey) return reply({ ok: false, error: "Video face-swap service configuration is incomplete. Contact the administrator." }, 503);

  const userClient = createClient(url, publishable, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData?.user;
  if (authError || !user) return reply({ ok: false, error: "Your session is invalid. Sign in again." }, 401);

  try {
    const body = await req.json();
    const action = String(body?.action || "");

    if (action === "start") {
      const sourceImagePath = String(body?.sourceImagePath || "");
      const targetVideoPath = String(body?.targetVideoPath || "");
      const projectId = String(body?.projectId || "");
      if (!sourceImagePath.startsWith(user.id + "/") || !targetVideoPath.startsWith(user.id + "/") || !projectId) {
        return reply({ ok: false, error: "Choose your face image and target video from your own Library." }, 400);
      }

      const { data: project } = await admin.from("mh_projects").select("id").eq("id", projectId).eq("user_id", user.id).maybeSingle();
      if (!project) return reply({ ok: false, error: "The selected project could not be found." }, 404);
      const { data: assets, error: assetError } = await admin.from("mh_assets")
        .select("storage_path,mime_type,size_bytes,file_name").eq("user_id", user.id).eq("project_id", projectId)
        .in("storage_path", [sourceImagePath, targetVideoPath]);
      if (assetError) throw assetError;
      const source = assets?.find((item: any) => item.storage_path === sourceImagePath);
      const target = assets?.find((item: any) => item.storage_path === targetVideoPath);
      if (!source || !target || !["image/jpeg", "image/png", "image/webp"].includes(source.mime_type || "") ||
          target.mime_type !== "video/mp4" || Number(target.size_bytes) > 10 * 1024 * 1024) {
        return reply({ ok: false, error: "Use a JPG, PNG or WebP face image and an MP4 video no larger than 10 MB." }, 400);
      }

      const { data: videoBlob, error: downloadError } = await admin.storage.from("magic-hour-assets").download(targetVideoPath);
      if (downloadError || !videoBlob) return reply({ ok: false, error: "Could not read the uploaded video from your private Library." }, 400);
      const bytes = new Uint8Array(await videoBlob.arrayBuffer());
      let mp4: { durationSeconds: number; width: number; height: number; frameCount: number | null };
      try { mp4 = readMp4Metadata(bytes); }
      catch (error) { return reply({ ok: false, error: safeText(error instanceof Error ? error.message : error) }, 400); }
      const durationSeconds = mp4.durationSeconds;
      const billableSeconds = Math.ceil(durationSeconds);
      const billingUnits = Math.ceil(durationSeconds / 10);
      const coinCost = billingUnits * 300;
      const jobId = crypto.randomUUID();
      const walletReference = "mh-video-face-swap:" + jobId;
      const { data: job, error: jobError } = await admin.from("mh_video_face_swap_jobs").insert({
        id: jobId, user_id: user.id, project_id: projectId, source_image_path: sourceImagePath,
        target_video_path: targetVideoPath, duration_seconds: durationSeconds, billing_units: billingUnits,
        coin_cost: coinCost, wallet_reference: walletReference, status: "queued",
      }).select("id").single();
      if (jobError || !job) return reply({ ok: false, error: "Could not create your video face-swap job." }, 500);

      const { data: debit, error: debitError } = await userClient.rpc("mh_charge_room_coins", {
        p_room_key: "video-face-swap", p_duration_seconds: billableSeconds, p_reference: walletReference,
      });
      const debitRow = Array.isArray(debit) ? debit[0] : debit;
      if (debitError || !debitRow?.ok) {
        await admin.from("mh_video_face_swap_jobs").update({ status: "failed", error_message: "Insufficient coins or wallet charge failed." }).eq("id", jobId);
        return reply({ ok: false, error: debitError?.message || "You do not have enough coins for this video. " + coinCost + " coins are required.", requiredCoins: coinCost }, 402);
      }
      const chargedCoins = Number(debitRow.cost ?? coinCost);
      await admin.from("mh_video_face_swap_jobs").update({ coin_cost: chargedCoins }).eq("id", jobId);

      const [imageSigned, videoSigned] = await Promise.all([
        admin.storage.from("magic-hour-assets").createSignedUrl(sourceImagePath, 86400),
        admin.storage.from("magic-hour-assets").createSignedUrl(targetVideoPath, 86400),
      ]);
      if (imageSigned.error || !imageSigned.data?.signedUrl || videoSigned.error || !videoSigned.data?.signedUrl) {
        await userClient.rpc("mh_refund_room_coins", { p_reference: walletReference, p_reason: "Video face swap could not prepare source files" });
        await admin.from("mh_video_face_swap_jobs").update({ status: "failed", error_message: "Could not prepare source files." }).eq("id", jobId);
        return reply({ ok: false, error: "Could not prepare your files. Your coins have been returned.", creditsRefunded: true }, 500);
      }

      let providerResponse: Response;
      try {
        providerResponse = await fetch("https://api.piapi.ai/api/v1/task", {
          method: "POST",
          headers: { "X-API-Key": piapiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "Qubico/video-toolkit",
            task_type: "face-swap",
            input: { swap_image: imageSigned.data.signedUrl, target_video: videoSigned.data.signedUrl },
            config: { service_mode: "public" },
          }),
        });
      } catch (_error) {
        await admin.from("mh_video_face_swap_jobs").update({ status: "queued", error_message: "Provider submission status is uncertain; keep this job for administrator reconciliation." }).eq("id", jobId);
        return reply({ ok: true, status: "queued", jobId, durationSeconds, coinCost: chargedCoins, balance: debitRow.balance, note: "Your request was charged and queued, but PiAPI did not confirm receipt. Please contact support before retrying." });
      }
      const providerText = await providerResponse.text();
      let providerData: any = {};
      try { providerData = JSON.parse(providerText); } catch { /* handled below */ }
      const taskId = providerData?.data?.task_id || providerData?.task_id;
      if (!providerResponse.ok || !taskId) {
        const { data: refundResult, error: refundError } = await userClient.rpc("mh_refund_room_coins", { p_reference: walletReference, p_reason: "PiAPI rejected video face swap" });
        await admin.from("mh_video_face_swap_jobs").update({
          status: "failed", error_message: safeText(providerData?.message || providerData?.data?.error?.message || "PiAPI rejected the request."),
        }).eq("id", jobId);
        return reply({ ok: false, error: safeText(providerData?.message || providerData?.data?.error?.message || "PiAPI rejected the request."), creditsRefunded: !refundError && !!refundResult?.ok }, 502);
      }

      await admin.from("mh_video_face_swap_jobs").update({ piapi_task_id: String(taskId), status: "processing", updated_at: new Date().toISOString() }).eq("id", jobId);
      await admin.from("mh_projects").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", projectId).eq("user_id", user.id);
      return reply({ ok: true, status: "processing", jobId, durationSeconds, coinCost: chargedCoins, balance: debitRow.balance });
    }

    if (action === "status") {
      const jobId = String(body?.jobId || "");
      const { data: job, error: jobError } = await admin.from("mh_video_face_swap_jobs").select("*").eq("id", jobId).eq("user_id", user.id).maybeSingle();
      if (jobError || !job) return reply({ ok: false, error: "Video face-swap job not found." }, 404);
      if (job.status === "completed" && job.output_storage_path) {
        const { data: signed } = await admin.storage.from("magic-hour-assets").createSignedUrl(job.output_storage_path, 3600);
        return reply({ ok: true, status: "completed", videoUrl: signed?.signedUrl || "", coinCost: job.coin_cost });
      }
      if (job.status === "failed") return reply({ ok: false, status: "failed", error: job.error_message || "Video face swap failed.", creditsRefunded: true });
      if (!job.piapi_task_id) return reply({ ok: true, status: "queued", note: "Your request is queued for provider reconciliation." });

      const poll = await fetch("https://api.piapi.ai/api/v1/task/" + encodeURIComponent(job.piapi_task_id), { headers: { "X-API-Key": piapiKey } });
      const raw = await poll.text();
      let result: any = {};
      try { result = JSON.parse(raw); } catch { /* handled below */ }
      if (!poll.ok) return reply({ ok: false, error: "Could not check the video face-swap task. Try again shortly." }, 502);
      const data = result?.data || result;
      const state = String(data?.status || data?.task_status || "").toLowerCase();
      if (["failed", "error", "cancelled", "canceled"].includes(state)) {
        const reason = safeText(data?.error?.message || data?.error?.raw_message || data?.error || result?.message || "PiAPI could not complete this video.");
        const { data: refundResult, error: refundError } = await userClient.rpc("mh_refund_room_coins", { p_reference: job.wallet_reference, p_reason: "Video face swap failed: " + reason });
        await admin.from("mh_video_face_swap_jobs").update({ status: "failed", error_message: reason, updated_at: new Date().toISOString() }).eq("id", job.id);
        await admin.from("mh_projects").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", job.project_id).eq("user_id", user.id);
        return reply({ ok: false, status: "failed", error: reason, creditsRefunded: !refundError && !!refundResult?.ok });
      }

      const output = data?.output || {};
      const videoUrl = output?.video_url || output?.url;
      if (["completed", "success", "succeeded"].includes(state) || videoUrl) {
        if (!videoUrl || !String(videoUrl).startsWith("https://")) return reply({ ok: true, status: "processing", note: "PiAPI finished; waiting for its video URL." });
        const outputResponse = await fetch(videoUrl);
        if (!outputResponse.ok) return reply({ ok: true, status: "processing", note: "Your video is ready; preparing it for your Library." });
        const outputBlob = await outputResponse.blob();
        if (!outputBlob.type.startsWith("video/") || outputBlob.size > 250 * 1024 * 1024) return reply({ ok: true, status: "processing", note: "Your video is ready; saving it to your Library." });
        const path = user.id + "/" + job.project_id + "/" + Date.now() + "-video-face-swap.mp4";
        const { error: uploadError } = await admin.storage.from("magic-hour-assets").upload(path, outputBlob, { contentType: "video/mp4", upsert: false });
        if (uploadError) return reply({ ok: true, status: "processing", note: "Your video is ready; saving it to your Library." });
        const { error: assetInsertError } = await admin.from("mh_assets").insert({
          user_id: user.id, project_id: job.project_id, storage_path: path,
          file_name: "Video Face Swap " + new Date().toISOString().slice(0, 10) + ".mp4",
          mime_type: "video/mp4", size_bytes: outputBlob.size,
        });
        if (assetInsertError) {
          await admin.storage.from("magic-hour-assets").remove([path]);
          return reply({ ok: true, status: "processing", note: "Your video is ready; saving it to your Library." });
        }
        await admin.from("mh_video_face_swap_jobs").update({ status: "completed", output_storage_path: path, updated_at: new Date().toISOString() }).eq("id", job.id);
        await admin.from("mh_projects").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", job.project_id).eq("user_id", user.id);
        const { data: signed } = await admin.storage.from("magic-hour-assets").createSignedUrl(path, 3600);
        return reply({ ok: true, status: "completed", videoUrl: signed?.signedUrl || "", coinCost: job.coin_cost });
      }
      await admin.from("mh_video_face_swap_jobs").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", job.id);
      return reply({ ok: true, status: "processing" });
    }
    return reply({ ok: false, error: "Unknown video face-swap action." }, 400);
  } catch (_error) {
    return reply({ ok: false, error: "The video face-swap service encountered an unexpected error. Try again or contact support." }, 500);
  }
});
