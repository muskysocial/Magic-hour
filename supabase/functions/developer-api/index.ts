import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const encoder = new TextEncoder();
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function newApiKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return "ms_live_" + token;
}
const toolsCatalog = [
  { id: "face-swap", name: "Face Swap", status: "available", endpoint: "POST /v1/face-swap", coinCost: 60 },
  { id: "video-swap", name: "Video Swap", status: "not_enabled" },
  { id: "ai-image", name: "AI Image", status: "not_enabled" },
  { id: "ai-video", name: "AI Video", status: "provider_connected_generation_api_pending" },
  { id: "remove-background", name: "Remove Background", status: "engine_connected_api_pending" },
];


const FACE_SWAP_PROVIDER = "https://hugging-apps-bfs-best-face-swap.hf.space";
const FACE_SWAP_BUCKET = "magic-hour-assets";
function extractSwapOutput(value: any): any {
 const pair=Array.isArray(value)&&Array.isArray(value[0])?value[0]:null;const candidate=pair?.[1];
 if(candidate&&typeof candidate==="object"&&(candidate.url||candidate.path))return candidate.image??candidate;
 if(value&&typeof value==="object"){if(Array.isArray(value.data))return extractSwapOutput(value.data);if(Array.isArray(value.output))return extractSwapOutput(value.output);}
 return null;
}
async function uploadSwapInput(blob:Blob,name:string){
 const form=new FormData();form.append("files",blob,name);
 const r=await fetch(FACE_SWAP_PROVIDER+"/gradio_api/upload",{method:"POST",body:form});
 if(!r.ok)throw new Error("Face Swap provider could not accept the uploaded images.");
 const paths=await r.json();const path=Array.isArray(paths)?paths[0]:paths?.path;
 if(typeof path!=="string"||!path)throw new Error("Face Swap provider returned an invalid upload path.");
 return {path,url:null,size:blob.size,orig_name:name,mime_type:blob.type||"image/png",is_stream:false,meta:{_type:"gradio.FileData"}};
}
async function generateExternalFaceSwap(admin:any,userId:string,apiKeyId:string,req:Request){
 const requestId=req.headers.get("Idempotency-Key")||"";
 if(!/^[A-Za-z0-9._:-]{8,120}$/.test(requestId))return reply({ok:false,error:"Send a unique Idempotency-Key header (8–120 letters, numbers or . _ : -)."},400);
 const form=await req.formData();const reference=form.get("reference");const target=form.get("target");
 if(!(reference instanceof File)||!(target instanceof File))return reply({ok:false,error:"Send multipart/form-data with image files named reference and target."},400);
 const allowed=["image/jpeg","image/png","image/webp"];
 if(![reference,target].every((f:File)=>allowed.includes(f.type)))return reply({ok:false,error:"Both images must be JPG, PNG or WebP."},400);
 if(reference.size<1||target.size<1||reference.size>10*1024*1024||target.size>10*1024*1024)return reply({ok:false,error:"Each image must be between 1 byte and 10 MB."},400);
 const {data:existing}=await admin.from("ms_api_billing_transactions").select("id").eq("api_key_id",apiKeyId).eq("request_id",requestId).maybeSingle();
 if(existing)return reply({ok:false,error:"This Idempotency-Key has already been used. Send a new unique key."},409);
 const {data:project,error:projectError}=await admin.from("mh_projects").insert({user_id:userId,title:"API Face Swap",tool_id:"face-swap",status:"processing",metadata:{source:"developer-api",request_id:requestId}}).select("id").single();
 if(projectError||!project)return reply({ok:false,error:"Could not create a Face Swap project."},500);
 const base=userId+"/"+project.id+"/";const ext=(f:File)=>f.type==="image/jpeg"?"jpg":f.type==="image/webp"?"webp":"png";
 const referencePath=base+"reference-"+crypto.randomUUID()+"."+ext(reference);const targetPath=base+"target-"+crypto.randomUUID()+"."+ext(target);
 const [upRef,upTarget]=await Promise.all([admin.storage.from(FACE_SWAP_BUCKET).upload(referencePath,reference,{contentType:reference.type,upsert:false}),admin.storage.from(FACE_SWAP_BUCKET).upload(targetPath,target,{contentType:target.type,upsert:false})]);
 if(upRef.error||upTarget.error){await admin.storage.from(FACE_SWAP_BUCKET).remove([referencePath,targetPath]);return reply({ok:false,error:"Could not securely store the uploaded images."},500);}
 const {error:assetError}=await admin.from("mh_assets").insert([
  {user_id:userId,project_id:project.id,storage_path:referencePath,file_name:reference.name||"reference."+ext(reference),mime_type:reference.type,size_bytes:reference.size},
  {user_id:userId,project_id:project.id,storage_path:targetPath,file_name:target.name||"target."+ext(target),mime_type:target.type,size_bytes:target.size}
 ]);
 if(assetError){await admin.storage.from(FACE_SWAP_BUCKET).remove([referencePath,targetPath]);return reply({ok:false,error:"Could not register uploaded images."},500);}
 const {data:charged,error:chargeError}=await admin.rpc("ms_api_charge_face_swap",{p_api_key_id:apiKeyId,p_user_id:userId,p_request_id:requestId,p_amount:60});
 if(chargeError||!charged?.ok){await admin.storage.from(FACE_SWAP_BUCKET).remove([referencePath,targetPath]);await admin.from("mh_assets").delete().eq("project_id",project.id);await admin.from("mh_projects").delete().eq("id",project.id);return reply({ok:false,error:charged?.error||"Could not charge 60 coins.",required:60},402);}
 try{
  const [refUpload,tarUpload]=await Promise.all([uploadSwapInput(reference,reference.name||"reference.png"),uploadSwapInput(target,target.name||"target.png")]);
  const prompt="head_swap: start with <image1> as the base image, keeping its lighting, environment, and background. remove the head from <image1> completely and replace it with the head from <image2>, strictly preserving the hair, eye color, nose structure from <image2>. copy the direction of the eye, head rotation, micro expressions from <image1>, high quality, sharp details, 4k";
  const start=await fetch(FACE_SWAP_PROVIDER+"/gradio_api/call/face_swap",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:[refUpload,tarUpload,"Turbo · Viggle 6-step",1536,6,1.0,0,true,prompt]})});
  if(!start.ok)throw new Error("Face Swap provider rejected the generation request.");
  const started=await start.json();if(!started?.event_id)throw new Error("Face Swap provider did not return a job ID.");
  const resultResponse=await fetch(FACE_SWAP_PROVIDER+"/gradio_api/call/face_swap/"+encodeURIComponent(started.event_id),{headers:{"Accept":"text/event-stream"}});
  if(!resultResponse.ok)throw new Error("Could not retrieve the generated Face Swap result.");
  const sse=await resultResponse.text();let lastData="",providerError=false;
  for(const line of sse.split(/\r?\n/)){if(line.startsWith("event: error"))providerError=true;if(line.startsWith("data:"))lastData=line.slice(5).trim();}
  if(providerError||!lastData)throw new Error("Face Swap provider failed to generate an image.");
  const parsed=JSON.parse(lastData);if(parsed?.error)throw new Error("Face Swap provider reported a generation error.");
  const output=extractSwapOutput(parsed);if(!output)throw new Error("Provider returned no generated image.");
  let outputUrl=output.url;if(!outputUrl&&output.path)outputUrl=FACE_SWAP_PROVIDER+"/gradio_api/file="+String(output.path).replace(/^\//,"");
  if(!outputUrl||!String(outputUrl).startsWith("http"))throw new Error("Provider returned an invalid image URL.");
  const imageResponse=await fetch(outputUrl);if(!imageResponse.ok)throw new Error("Could not download the generated image.");
  const outputBlob=await imageResponse.blob();const contentType=imageResponse.headers.get("content-type")||"image/png";
  if(!contentType.startsWith("image/")||outputBlob.size>20*1024*1024)throw new Error("Generated output was not a valid image.");
  const outExt=contentType.includes("jpeg")?"jpg":contentType.includes("webp")?"webp":"png";const outputPath=base+"face-swap-result-"+crypto.randomUUID()+"."+outExt;
  const {error:storeError}=await admin.storage.from(FACE_SWAP_BUCKET).upload(outputPath,outputBlob,{contentType,upsert:false,cacheControl:"3600"});
  if(storeError)throw new Error("Could not save the generated image to your Library.");
  const {data:asset,error:saveError}=await admin.from("mh_assets").insert({user_id:userId,project_id:project.id,storage_path:outputPath,file_name:"face-swap-result."+outExt,mime_type:contentType,size_bytes:outputBlob.size}).select("id,storage_path,file_name,mime_type,size_bytes,created_at").single();
  if(saveError){await admin.storage.from(FACE_SWAP_BUCKET).remove([outputPath]);throw new Error("Could not save the generated asset.");}
  await admin.from("mh_projects").update({status:"completed",updated_at:new Date().toISOString()}).eq("id",project.id);
  const {data:signed}=await admin.storage.from(FACE_SWAP_BUCKET).createSignedUrl(outputPath,3600);
  return reply({ok:true,tool:"face-swap",coinCost:60,coinBalance:charged.balance,projectId:project.id,asset,signedUrl:signed?.signedUrl||null});
 }catch(error){
  const {data:refund}=await admin.rpc("ms_api_refund_face_swap",{p_api_key_id:apiKeyId,p_request_id:requestId});
  await admin.from("mh_projects").update({status:"failed",updated_at:new Date().toISOString()}).eq("id",project.id);
  console.error("External Face Swap failed",error);
  return reply({ok:false,error:error instanceof Error?error.message:"Face Swap failed.",refunded:Boolean(refund?.ok),coinBalance:refund?.balance??null},502);
 }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  let secretMap: Record<string, string> = {};
  try { secretMap = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); } catch { /* use legacy secret below */ }
  const serviceKey = secretMap.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !anon || !serviceKey) return reply({ ok: false, error: "API service configuration is incomplete." }, 503);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const path = new URL(req.url).pathname;
  const method = req.method.toUpperCase();
  const auth = req.headers.get("Authorization") || "";

  // Signed-in MuskySocials dashboard actions.
  if (auth.startsWith("Bearer ") && !auth.slice(7).startsWith("ms_live_")) {
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data, error } = await userClient.auth.getUser();
    if (error || !data.user) return reply({ ok: false, error: "Your session is invalid. Sign in again." }, 401);
    const userId = data.user.id;

    if (method === "POST" && path.endsWith("/keys/create")) {
      let body: any = {};
      try { body = await req.json(); } catch { return reply({ ok: false, error: "Invalid JSON body." }, 400); }
      const name = String(body.name || "Default API key").trim().slice(0, 60) || "Default API key";
      const key = newApiKey();
      const { data: saved, error: saveError } = await admin.from("ms_api_keys").insert({
        user_id: userId, name, key_prefix: key.slice(0, 16), key_hash: await sha256(key),
      }).select("id,name,key_prefix,created_at").single();
      if (saveError) return reply({ ok: false, error: "Could not create API key." }, 500);
      return reply({ ok: true, key, warning: "Copy this key now. It will not be shown again.", apiKey: saved }, 201);
    }
    if (method === "GET" && path.endsWith("/keys")) {
      const { data, error: listError } = await admin.from("ms_api_keys")
        .select("id,name,key_prefix,created_at,last_used_at,revoked_at")
        .eq("user_id", userId).order("created_at", { ascending: false });
      if (listError) return reply({ ok: false, error: "Could not load API keys." }, 500);
      return reply({ ok: true, keys: data || [] });
    }
    if (method === "POST" && path.endsWith("/keys/revoke")) {
      let body: any = {};
      try { body = await req.json(); } catch { return reply({ ok: false, error: "Invalid JSON body." }, 400); }
      const id = String(body.id || "");
      if (!id) return reply({ ok: false, error: "API key ID is required." }, 400);
      const { data: updated, error: updateError } = await admin.from("ms_api_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id).eq("user_id", userId).is("revoked_at", null)
        .select("id").maybeSingle();
      if (updateError) return reply({ ok: false, error: "Could not revoke API key." }, 500);
      if (!updated) return reply({ ok: false, error: "Active API key not found." }, 404);
      return reply({ ok: true, revoked: true });
    }
    if (method === "GET" && path.endsWith("/usage")) {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error: usageError } = await admin.from("ms_api_usage")
        .select("endpoint,http_method,status_code,created_at")
        .eq("user_id", userId).gte("created_at", since)
        .order("created_at", { ascending: false }).limit(500);
      if (usageError) return reply({ ok: false, error: "Could not load API usage." }, 500);
      const rows = data || [];
      return reply({
        ok: true, period: "last_30_days", totalRequests: rows.length,
        successfulRequests: rows.filter((x) => x.status_code >= 200 && x.status_code < 400).length,
        failedRequests: rows.filter((x) => x.status_code >= 400).length,
        recentRequests: rows,
      });
    }
    return reply({ ok: false, error: "Unknown developer API management route." }, 404);
  }

  // External developers authenticate using their MuskySocials API key.
  const apiKey = req.headers.get("x-api-key") || (auth.startsWith("Bearer ms_live_") ? auth.slice(7) : "");
  if (!apiKey || !apiKey.startsWith("ms_live_")) {
    return reply({ ok: false, error: "Provide your MuskySocials key in the x-api-key header." }, 401);
  }
  const { data: keyRow, error: keyError } = await admin.from("ms_api_keys")
    .select("id,user_id").eq("key_hash", await sha256(apiKey)).is("revoked_at", null).maybeSingle();
  if (keyError || !keyRow) return reply({ ok: false, error: "Invalid or revoked API key." }, 401);

  let status = 200;
  let response: Response;
  if (method === "POST" && path.endsWith("/v1/face-swap")) {
    response = await generateExternalFaceSwap(admin, keyRow.user_id, keyRow.id, req);
    status = response.status;
  } else if (method === "GET" && path.endsWith("/v1/tools")) {
    response = reply({ ok: true, tools: toolsCatalog });
  } else if (method === "GET" && path.endsWith("/v1/account")) {
    const [wallet, membership] = await Promise.all([
      admin.from("mh_wallets").select("balance").eq("user_id", keyRow.user_id).maybeSingle(),
      admin.from("mh_memberships").select("plan_key,plan_name,expires_at").eq("user_id", keyRow.user_id).maybeSingle()
    ]);
    response = reply({
      ok: true,
      account: {
        coinBalance: wallet.data?.balance ?? 0,
        membership: membership.data && new Date(membership.data.expires_at) > new Date() ? membership.data : null
      }
    });
  } else if (method === "GET" && path.endsWith("/v1/usage")) {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data, error: usageError } = await admin.from("ms_api_usage")
      .select("endpoint,http_method,status_code,created_at")
      .eq("api_key_id", keyRow.id).gte("created_at", since)
      .order("created_at", { ascending: false }).limit(500);
    const rows = data || [];
    if (usageError) { status = 500; response = reply({ ok: false, error: "Could not load API usage." }, status); }
    else response = reply({
      ok: true, period: "last_30_days", totalRequests: rows.length,
      successfulRequests: rows.filter((x) => x.status_code >= 200 && x.status_code < 400).length,
      failedRequests: rows.filter((x) => x.status_code >= 400).length,
    });
  } else {
    status = 404;
    response = reply({ ok: false, error: "Unknown endpoint. Available: GET /v1/tools, /v1/account, /v1/usage." }, status);
  }

  await admin.from("ms_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
  await admin.from("ms_api_usage").insert({
    api_key_id: keyRow.id, user_id: keyRow.user_id,
    endpoint: path.slice(0, 180), http_method: method, status_code: status
  });
  return response;
});