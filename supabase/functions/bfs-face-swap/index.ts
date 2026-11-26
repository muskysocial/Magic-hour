import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const HF_SPACE = "https://hugging-apps-bfs-best-face-swap.hf.space";
const BUCKET = "magic-hour-assets";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractResultImage(value: any): any {
  // face_swap returns ([target_image, generated_image], seed).
  // The second image is the generated result; never save the first (original) image.
  const sliderPair = Array.isArray(value) && Array.isArray(value[0]) ? value[0] : null;
  const candidate = sliderPair?.[1];
  if (candidate && typeof candidate === "object" && (candidate.url || candidate.path)) {
    return candidate.image ?? candidate;
  }
  // Be tolerant of Gradio response wrappers while still preferring the second slider image.
  if (value && typeof value === "object") {
    if (Array.isArray(value.data)) return extractResultImage(value.data);
    if (Array.isArray(value.output)) return extractResultImage(value.output);
  }
  return null;
}

async function uploadToHuggingFace(blob: Blob, name: string) {
  const form = new FormData();
  form.append("files", blob, name);
  const response = await fetch(`${HF_SPACE}/gradio_api/upload`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    throw new Error(`Hugging Face upload failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  }
  const paths = await response.json();
  const path = Array.isArray(paths) ? paths[0] : paths?.path;
  if (typeof path !== "string" || !path) {
    throw new Error("Hugging Face did not return an uploaded image path.");
  }
  return {
    path,
    url: null,
    size: blob.size,
    orig_name: name,
    mime_type: blob.type || "image/png",
    is_stream: false,
    meta: { _type: "gradio.FileData" },
  };
}

async function readSseResult(response: Response) {
  const body = await response.text();
  let lastData = "";
  let errorMessage = "";
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith("event: error")) errorMessage = "The face-swap provider reported an error.";
    if (line.startsWith("data:")) lastData = line.slice(5).trim();
  }
  if (errorMessage) throw new Error(errorMessage);
  if (!lastData) throw new Error("The face-swap provider returned no result.");
  let parsed: any;
  try { parsed = JSON.parse(lastData); } catch { throw new Error("Could not read the face-swap provider response."); }
  if (parsed?.error) throw new Error(String(parsed.error));
  return parsed;
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
    if (!supabaseUrl || !serviceKey) {
      return json({ error: "Supabase server configuration is incomplete." }, 500);
    }

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
    const referencePath = String(input.referencePath || "");
    const targetPath = String(input.targetPath || "");
    const projectId = String(input.projectId || "");
    if (!referencePath || !targetPath || !projectId || referencePath === targetPath) {
      return json({ error: "Choose two different images and a project." }, 400);
    }
    if (!referencePath.startsWith(userId + "/") || !targetPath.startsWith(userId + "/")) {
      return json({ error: "The selected images do not belong to your account." }, 403);
    }

    const { data: project, error: projectError } = await admin
      .from("mh_projects").select("id,user_id,tool_id").eq("id", projectId).eq("user_id", userId).maybeSingle();
    if (projectError || !project) return json({ error: "Project not found." }, 404);

    const { data: assets, error: assetsError } = await admin
      .from("mh_assets").select("storage_path,mime_type,file_name")
      .eq("user_id", userId).eq("project_id", projectId)
      .in("storage_path", [referencePath, targetPath]);
    if (assetsError) throw assetsError;
    const referenceAsset = assets?.find((a: any) => a.storage_path === referencePath);
    const targetAsset = assets?.find((a: any) => a.storage_path === targetPath);
    if (!referenceAsset || !targetAsset) {
      return json({ error: "Both images must first be uploaded to this project." }, 400);
    }
    if (![referenceAsset, targetAsset].every((a: any) => ["image/jpeg", "image/png", "image/webp"].includes(a.mime_type || ""))) {
      return json({ error: "Please use JPG, PNG or WebP images." }, 400);
    }

    const [referenceDownload, targetDownload] = await Promise.all([
      admin.storage.from(BUCKET).download(referencePath),
      admin.storage.from(BUCKET).download(targetPath),
    ]);
    if (referenceDownload.error || !referenceDownload.data) throw new Error("Could not read the reference-face image from private storage.");
    if (targetDownload.error || !targetDownload.data) throw new Error("Could not read the target image from private storage.");

    const [referenceFile, targetFile] = await Promise.all([
      uploadToHuggingFace(referenceDownload.data, referenceAsset.file_name || "reference-face.png"),
      uploadToHuggingFace(targetDownload.data, targetAsset.file_name || "target-image.png"),
    ]);

    const prompt = "head_swap: start with <image1> as the base image, keeping its lighting, environment, and background. remove the head from <image1> completely and replace it with the head from <image2>, strictly preserving the hair, eye color, nose structure from <image2>. copy the direction of the eye, head rotation, micro expressions from <image1>, high quality, sharp details, 4k";
    const startResponse = await fetch(`${HF_SPACE}/gradio_api/call/face_swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [
          referenceFile,
          targetFile,
          "Turbo · Viggle 6-step",
          1536,
          6,
          1.0,
          0,
          true,
          prompt,
        ],
      }),
    });
    if (!startResponse.ok) {
      const providerError = await startResponse.text();
      console.error("BFS provider start error", startResponse.status, providerError.slice(0, 4000));
      throw new Error(`BFS provider rejected the generation request (HTTP ${startResponse.status}). ${providerError.slice(0, 1000)}`);
    }
    const started = await startResponse.json();
    console.log("BFS provider accepted generation", JSON.stringify(started).slice(0, 1000));
    const eventId = started?.event_id;
    if (!eventId) throw new Error("The face-swap provider did not return a job ID.");

    const resultResponse = await fetch(`${HF_SPACE}/gradio_api/call/face_swap/${encodeURIComponent(eventId)}`, {
      headers: { "Accept": "text/event-stream" },
    });
    if (!resultResponse.ok) {
      throw new Error(`Could not retrieve the generated image (${resultResponse.status}).`);
    }
    const resultData = await readSseResult(resultResponse);
    const outputFile = extractResultImage(resultData);
    if (!outputFile) throw new Error("The provider finished without returning an image file.");
    let outputUrl = outputFile.url;
    if (!outputUrl && outputFile.path) {
      const cleanPath = String(outputFile.path).replace(/^\//, "");
      outputUrl = `${HF_SPACE}/gradio_api/file=${cleanPath}`;
    }
    if (!outputUrl || !String(outputUrl).startsWith("http")) {
      throw new Error("The provider returned an invalid image URL.");
    }

    const imageResponse = await fetch(outputUrl);
    if (!imageResponse.ok) throw new Error("Could not download the generated image from the provider.");
    const outputBlob = await imageResponse.blob();
    const contentType = imageResponse.headers.get("content-type") || "image/png";
    if (!contentType.startsWith("image/")) throw new Error("The provider output was not an image.");
    const extension = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
    const outputPath = `${userId}/${projectId}/${crypto.randomUUID()}-bfs-face-swap.${extension}`;
    const { error: storageError } = await admin.storage.from(BUCKET).upload(outputPath, outputBlob, {
      contentType, upsert: false, cacheControl: "3600",
    });
    if (storageError) throw storageError;

    const { data: savedAsset, error: saveError } = await admin.from("mh_assets").insert({
      user_id: userId,
      project_id: projectId,
      storage_path: outputPath,
      file_name: `bfs-face-swap.${extension}`,
      mime_type: contentType,
      size_bytes: outputBlob.size,
    }).select("id,storage_path,file_name,mime_type,size_bytes,created_at").single();
    if (saveError) {
      await admin.storage.from(BUCKET).remove([outputPath]);
      throw saveError;
    }
    await admin.from("mh_projects").update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", projectId).eq("user_id", userId);

    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(outputPath, 3600);
    return json({ ok: true, asset: savedAsset, signedUrl: signed?.signedUrl || null });
  } catch (error) {
    console.error("bfs-face-swap error:", error);
    return json({ error: error instanceof Error ? error.message : "Face swap failed." }, 500);
  }
});
