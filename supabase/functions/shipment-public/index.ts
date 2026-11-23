import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
async function sha256(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,"0")).join("");}
async function verify(shipment:any,password:string){const [salt,stored]=String(shipment.access_password_hash||"").split(":");return !!salt&&!!stored&&(await sha256(salt+":"+password))===stored;}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({ok:false,error:"Method not allowed."},405);
 try{
  const body=await req.json(),action=String(body.action||""),slug=String(body.slug||"").replace(/[^a-f0-9]/gi,"").slice(0,64);
  if(!slug)return json({ok:false,error:"Tracking link is invalid."},400);
  const {data:s,error}=await admin.from("ms_shipments").select("id,tracking_code,carrier,transport_mode,sender_name,recipient_name,origin,destination,origin_country,destination_country,origin_city,destination_city,operator_name,current_location,current_lat,current_lng,public_status_label,barcode_value,item_names,departure_at,arrival_at,status,route_notes,created_at,tracking_slug,access_password_hash,is_obstructed,obstruction_reason,obstruction_location,obstructed_at,progress_percent,paused_progress,paused_duration_seconds,flight_number,aircraft_model,aircraft_registration,origin_airport_code,destination_airport_code,carrier_tracking_number,tracking_source,route_distance_km,estimated_duration_minutes,route_points,checkpoint_plan,last_engine_update_at").eq("tracking_slug",slug).eq("is_active",true).maybeSingle();
  if(error||!s)return json({ok:false,error:"This tracking link is unavailable."},404);
  const password=String(body.password||"");
  if(!password||password.length>100||!(await verify(s,password)))return json({ok:false,error:"The tracking password is incorrect."},403);
  if(action==="message"){
   const message=String(body.message||"").trim().slice(0,1000);
   if(!message)return json({ok:false,error:"Write a message first."},400);
   const {error:me}=await admin.from("ms_shipment_messages").insert({shipment_id:s.id,sender_role:"viewer",sender_name:s.recipient_name,message});
   if(me)return json({ok:false,error:"Message could not be sent."},500);
  }else if(action!=="view")return json({ok:false,error:"Unsupported action."},400);
  const [{data:events},{data:media},{data:messages}]=await Promise.all([
   admin.from("ms_shipment_events").select("id,event_title,event_details,event_at,event_type").eq("shipment_id",s.id).order("event_at",{ascending:true}),
   admin.from("ms_shipment_media").select("storage_path,file_name,mime_type,media_kind").eq("shipment_id",s.id).order("created_at",{ascending:true}),
   admin.from("ms_shipment_messages").select("id,sender_role,sender_name,message,created_at").eq("shipment_id",s.id).order("created_at",{ascending:true}).limit(100)
  ]);
  const clean={...s};delete clean.access_password_hash;delete clean.tracking_slug;
  const linked=await Promise.all((media||[]).map(async m=>{const {data}=await admin.storage.from("magic-hour-assets").createSignedUrl(m.storage_path,3600);return {file_name:m.file_name,mime_type:m.mime_type,media_kind:m.media_kind,url:data?.signedUrl||null};}));
  return json({ok:true,shipment:clean,events:events||[],media:linked,messages:messages||[]});
 }catch(e){return json({ok:false,error:e instanceof Error?e.message:"Request failed."},500);}
});