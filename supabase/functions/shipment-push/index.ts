import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-push-cron-secret","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const url=Deno.env.get("SUPABASE_URL")!;
const anonKey=Deno.env.get("SUPABASE_ANON_KEY")!;
const admin=createClient(url,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const authClient=createClient(url,anonKey,{auth:{persistSession:false}});
async function sha256(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,"0")).join("");}
async function validAccess(slug:string,password:string){
 const {data:s}=await admin.from("ms_shipments").select("id,user_id,carrier,tracking_code,tracking_slug,access_password_hash").eq("tracking_slug",slug).eq("is_active",true).maybeSingle();
 if(!s)return null;const [salt,stored]=String(s.access_password_hash||"").split(":");
 if(!salt||!stored||(await sha256(salt+":"+password))!==stored)return null;return s;
}
async function ownerFromRequest(req:Request,shipmentId:string){
 const token=String(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token)return null;
 const {data,error}=await authClient.auth.getUser(token);if(error||!data.user)return null;
 const {data:shipment}=await admin.from("ms_shipments").select("id,user_id,carrier,tracking_code,tracking_slug").eq("id",shipmentId).eq("user_id",data.user.id).maybeSingle();
 return shipment?{user:data.user,shipment}:null;
}
async function pushConfig(){
 const {data,error}=await admin.rpc("get_shipment_push_config");if(error)throw error;
 const publicKey=String(data?.shipment_vapid_public_key||""),privateKey=String(data?.shipment_vapid_private_key||"");
 if(!publicKey||!privateKey)throw new Error("Web Push keys are not configured.");
 webpush.setVapidDetails(String(data?.shipment_vapid_subject||"https://muskysocial.github.io/magic-hour/"),publicKey,privateKey);
 return {publicKey,privateKey};
}
async function sendToShipment(shipment:any,role:"viewer"|"owner",title:string,message:string){
 const {data:subs,error}=await admin.from("ms_shipment_push_subscriptions").select("id,endpoint,subscription").eq("shipment_id",shipment.id).eq("subscriber_role",role).eq("is_active",true);
 if(error)throw error;
 let sent=0,failed=0;
 const appBase="https://muskysocial.github.io/magic-hour/";
 const targetUrl=role==="viewer"&&shipment.tracking_slug?new URL("?shipment="+encodeURIComponent(shipment.tracking_slug),appBase).toString():appBase;
 for(const sub of subs||[]){
  try{await webpush.sendNotification(sub.subscription,JSON.stringify({title,body:message,tag:"shipment-"+shipment.id+"-"+role,url:targetUrl}),{TTL:3600});sent++;}
  catch(e){failed++;const status=Number((e as any)?.statusCode||0);if(status===404||status===410)await admin.from("ms_shipment_push_subscriptions").update({is_active:false,disabled_at:new Date().toISOString()}).eq("id",sub.id);}
 }
 return {sent,failed,subscribers:subs?.length||0};
}
function due(n:any,s:any,now:Date){
 if(!n.is_active||n.expires_at&&new Date(n.expires_at)<=now)return false;
 if(n.trigger_type==="manual")return true;
 if(n.trigger_type==="scheduled")return !!n.scheduled_at&&new Date(n.scheduled_at)<=now;
 const expected=String(n.trigger_status||"").trim().toLowerCase();
 const actual=[s.status,s.public_status_label,s.is_obstructed?"stopped":""].map((v:any)=>String(v||"").trim().toLowerCase());
 return !!expected&&actual.includes(expected);
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({ok:false,error:"Method not allowed."},405);
 try{
  const body=await req.json(),action=String(body.action||"");
  if(action==="subscribe"||action==="unsubscribe"){
   const slug=String(body.slug||"").replace(/[^a-f0-9]/gi,"").slice(0,64),password=String(body.password||"");
   if(!slug||!password||password.length>100)return json({ok:false,error:"Tracking credentials are required."},400);
   const shipment=await validAccess(slug,password);if(!shipment)return json({ok:false,error:"Tracking password is incorrect."},403);
   const endpoint=String(body.subscription?.endpoint||body.endpoint||"");
   if(action==="unsubscribe"){
    if(!endpoint)return json({ok:false,error:"Subscription endpoint is required."},400);
    await admin.from("ms_shipment_push_subscriptions").update({is_active:false,disabled_at:new Date().toISOString()}).eq("shipment_id",shipment.id).eq("endpoint",endpoint).eq("subscriber_role","viewer");
    return json({ok:true});
   }
   const sub=body.subscription;if(!sub||!endpoint.startsWith("https://")||!sub.keys?.p256dh||!sub.keys?.auth)return json({ok:false,error:"Browser push subscription is invalid."},400);
   const {error}=await admin.from("ms_shipment_push_subscriptions").upsert({shipment_id:shipment.id,endpoint,subscription:sub,subscriber_role:"viewer",owner_user_id:null,user_agent:String(req.headers.get("user-agent")||"").slice(0,500),is_active:true,last_seen_at:new Date().toISOString(),disabled_at:null},{onConflict:"shipment_id,endpoint,subscriber_role"});
   if(error)throw error;return json({ok:true});
  }
  if(action==="subscribe_owner"){
   const shipmentId=String(body.shipment_id||"");
   const owned=await ownerFromRequest(req,shipmentId);if(!owned)return json({ok:false,error:"You must be signed in as the owner of this shipment."},403);
   const sub=body.subscription,endpoint=String(sub?.endpoint||"");
   if(!sub||!endpoint.startsWith("https://")||!sub.keys?.p256dh||!sub.keys?.auth)return json({ok:false,error:"Browser push subscription is invalid."},400);
   const {error}=await admin.from("ms_shipment_push_subscriptions").upsert({shipment_id:shipmentId,endpoint,subscription:sub,subscriber_role:"owner",owner_user_id:owned.user.id,user_agent:String(req.headers.get("user-agent")||"").slice(0,500),is_active:true,last_seen_at:new Date().toISOString(),disabled_at:null},{onConflict:"shipment_id,endpoint,subscriber_role"});
   if(error)throw error;return json({ok:true});
  }
  if(action==="notify_owner"){
   const slug=String(body.slug||"").replace(/[^a-f0-9]/gi,"").slice(0,64),password=String(body.password||"");
   const shipment=await validAccess(slug,password);if(!shipment)return json({ok:false,error:"Tracking credentials are invalid."},403);
   const messageId=String(body.message_id||"");const {data:messageRow}=await admin.from("ms_shipment_messages").select("id").eq("id",messageId).eq("shipment_id",shipment.id).eq("sender_role","viewer").maybeSingle();if(!messageRow)return json({ok:false,error:"A valid recipient message is required before notifying the owner."},403);
   await pushConfig();
   const result=await sendToShipment(shipment,"owner",String(shipment.carrier||"Shipment service"),String(body.message||"A recipient sent a new shipment message."));
   return json({ok:true,...result});
  }
  if(action==="notify_viewer"){
   const shipmentId=String(body.shipment_id||"");
   const owned=await ownerFromRequest(req,shipmentId);if(!owned)return json({ok:false,error:"You must be signed in as the owner of this shipment."},403);
   await pushConfig();
   const result=await sendToShipment(owned.shipment,"viewer",String(body.title||owned.shipment.carrier||"Shipment update"),String(body.message||"Your shipment has a new update."));
   return json({ok:true,...result});
  }
  if(action!=="dispatch")return json({ok:false,error:"Unsupported action."},400);
  const {data:config,error:configError}=await admin.rpc("get_shipment_push_config");
  if(configError)throw configError;
  const cronSecret=String(config?.shipment_push_cron_secret||"");
  if(!cronSecret||req.headers.get("x-push-cron-secret")!==cronSecret)return json({ok:false,error:"Unauthorized."},401);
  await pushConfig();
  const now=new Date();
  const {data:rows,error}=await admin.from("ms_shipment_notifications").select("id,shipment_id,bot_name,message,trigger_type,trigger_status,scheduled_at,expires_at,is_active,published_at,push_sent_at").eq("is_active",true).is("push_sent_at",null).limit(100);
  if(error)throw error;
  let sent=0,failed=0,expired=0;
  for(const n of rows||[]){
   const {data:s}=await admin.from("ms_shipments").select("id,tracking_slug,tracking_code,carrier,status,public_status_label,is_obstructed").eq("id",n.shipment_id).maybeSingle();
   if(!s)continue;
   if(n.expires_at&&new Date(n.expires_at)<=now){expired++;await admin.from("ms_shipment_notifications").update({push_sent_at:now.toISOString(),updated_at:now.toISOString()}).eq("id",n.id).is("push_sent_at",null);continue;}
   if(!due(n,s,now))continue;
   const result=await sendToShipment(s,"viewer",String(s.carrier||n.bot_name||"Shipment Service"),String(n.message||"Your shipment has a new update."));
   sent+=result.sent;failed+=result.failed;
   await admin.from("ms_shipment_notifications").update({published_at:n.published_at||now.toISOString(),push_sent_at:now.toISOString(),updated_at:now.toISOString()}).eq("id",n.id).is("push_sent_at",null);
  }
  return json({ok:true,checked:rows?.length||0,sent,failed,expired});
 }catch(e){
  console.error("shipment-push error",e);
  return json({ok:false,error:e instanceof Error?e.message:"Push request failed."},500);
 }
});
