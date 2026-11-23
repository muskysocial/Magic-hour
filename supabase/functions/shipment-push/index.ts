import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-push-cron-secret","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
async function sha256(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,"0")).join("");}
async function validAccess(slug:string,password:string){const {data:s}=await admin.from("ms_shipments").select("id,access_password_hash").eq("tracking_slug",slug).eq("is_active",true).maybeSingle();if(!s)return null;const [salt,stored]=String(s.access_password_hash||"").split(":");if(!salt||!stored||(await sha256(salt+":"+password))!==stored)return null;return s.id;}
function due(n:any,s:any,now:Date){if(!n.is_active||n.expires_at&&new Date(n.expires_at)<=now)return false;if(n.trigger_type==="manual")return true;if(n.trigger_type==="scheduled")return !!n.scheduled_at&&new Date(n.scheduled_at)<=now;const expected=String(n.trigger_status||"").trim().toLowerCase();const actual=[s.status,s.public_status_label,s.is_obstructed?"stopped":""].map((v:any)=>String(v||"").trim().toLowerCase());return !!expected&&actual.includes(expected);}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({ok:false,error:"Method not allowed."},405);
 try{
  const body=await req.json(),action=String(body.action||"");
  if(action==="subscribe"||action==="unsubscribe"){
   const slug=String(body.slug||"").replace(/[^a-f0-9]/gi,"").slice(0,64),password=String(body.password||"");
   if(!slug||!password||password.length>100)return json({ok:false,error:"Tracking credentials are required."},400);
   const shipmentId=await validAccess(slug,password);if(!shipmentId)return json({ok:false,error:"Tracking password is incorrect."},403);
   const endpoint=String(body.subscription?.endpoint||body.endpoint||"");
   if(action==="unsubscribe"){
    if(!endpoint)return json({ok:false,error:"Subscription endpoint is required."},400);
    await admin.from("ms_shipment_push_subscriptions").update({is_active:false,disabled_at:new Date().toISOString()}).eq("shipment_id",shipmentId).eq("endpoint",endpoint);
    return json({ok:true});
   }
   const sub=body.subscription;if(!sub||!endpoint.startsWith("https://")||!sub.keys?.p256dh||!sub.keys?.auth)return json({ok:false,error:"Browser push subscription is invalid."},400);
   const {error}=await admin.from("ms_shipment_push_subscriptions").upsert({shipment_id:shipmentId,endpoint,subscription:sub,user_agent:String(req.headers.get("user-agent")||"").slice(0,500),is_active:true,last_seen_at:new Date().toISOString(),disabled_at:null},{onConflict:"endpoint"});
   if(error)throw error;return json({ok:true});
  }
  if(action!=="dispatch")return json({ok:false,error:"Unsupported action."},400);
  const cronSecret=Deno.env.get("PUSH_CRON_SECRET")||"";
  if(!cronSecret||req.headers.get("x-push-cron-secret")!==cronSecret)return json({ok:false,error:"Unauthorized."},401);
  const publicKey=Deno.env.get("VAPID_PUBLIC_KEY")||"",privateKey=Deno.env.get("VAPID_PRIVATE_KEY")||"";
  if(!publicKey||!privateKey)return json({ok:false,error:"Web Push keys are not configured."},503);
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")||"mailto:support@magichour-black.vercel.app",publicKey,privateKey);
  const now=new Date();
  const {data:rows,error}=await admin.from("ms_shipment_notifications").select("id,shipment_id,bot_name,message,trigger_type,trigger_status,scheduled_at,expires_at,is_active,published_at,push_sent_at").eq("is_active",true).is("push_sent_at",null).limit(100);
  if(error)throw error;
  let sent=0,failed=0,expired=0;
  for(const n of rows||[]){
   const {data:s}=await admin.from("ms_shipments").select("tracking_slug,tracking_code,carrier,status,public_status_label,is_obstructed").eq("id",n.shipment_id).maybeSingle();
   if(!s)continue;
   if(n.expires_at&&new Date(n.expires_at)<=now){expired++;continue;}
   if(!due(n,s,now))continue;
   const {data:subs}=await admin.from("ms_shipment_push_subscriptions").select("id,endpoint,subscription").eq("shipment_id",n.shipment_id).eq("is_active",true);
   const title=String(s.carrier||n.bot_name||"Shipment Service");
   const payload=JSON.stringify({title,service_name:title,body:String(n.message||"Your shipment has a new update."),tag:"shipment-"+n.shipment_id,url:"https://magichour-black.vercel.app/?shipment="+s.tracking_slug});
   let anySent=false;
   for(const sub of subs||[]){
    try{await webpush.sendNotification(sub.subscription,payload,{TTL:n.expires_at?Math.max(0,Math.floor((new Date(n.expires_at).getTime()-now.getTime())/1000)):3600});sent++;anySent=true;}
    catch(e){failed++;const status=Number((e as any)?.statusCode||0);if(status===404||status===410)await admin.from("ms_shipment_push_subscriptions").update({is_active:false,disabled_at:now.toISOString()}).eq("id",sub.id);}
   }
   await admin.from("ms_shipment_notifications").update({published_at:n.published_at||now.toISOString(),push_sent_at:now.toISOString(),updated_at:now.toISOString()}).eq("id",n.id).is("push_sent_at",null);
   if(!anySent&&!(subs||[]).length)continue;
  }
  return json({ok:true,checked:rows?.length||0,sent,failed,expired});
 }catch(e){return json({ok:false,error:e instanceof Error?e.message:"Push request failed."},500);}
});