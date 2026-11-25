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
   const imageData=String(body.image_base64||"");
   if(!message&&!imageData)return json({ok:false,error:"Write a message or attach an image."},400);
   let attachment_path:string|null=null,attachment_name:string|null=null,attachment_mime:string|null=null;
   if(imageData){
    const match=imageData.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if(!match)return json({ok:false,error:"Attach a JPG, PNG or WebP image."},400);
    const raw=atob(match[2]);if(raw.length>5*1024*1024)return json({ok:false,error:"Images must be 5 MB or smaller."},413);
    const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));attachment_mime=match[1];const ext=attachment_mime==="image/jpeg"?"jpg":attachment_mime.split("/")[1];attachment_name=String(body.image_name||("message-image."+ext)).replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,100);
    attachment_path=s.id+"/recipient-chat/"+crypto.randomUUID()+"."+ext;
    const {error:uploadError}=await admin.storage.from("magic-hour-assets").upload(attachment_path,bytes,{contentType:attachment_mime,upsert:false});
    if(uploadError)return json({ok:false,error:"Image could not be uploaded."},500);
   }
   const {data:createdMessage,error:me}=await admin.from("ms_shipment_messages").insert({shipment_id:s.id,sender_role:"viewer",sender_name:s.recipient_name,message:message||"Image attachment",attachment_path,attachment_name,attachment_mime}).select("id").single();
   if(me){if(attachment_path)await admin.storage.from("magic-hour-assets").remove([attachment_path]);return json({ok:false,error:"Message could not be sent."},500);}
   // The tracking visitor's message belongs to the carrier assigned to this shipment.
   // Notify the Magic Hour shipment owner without exposing the owner's account details.
   try{
    await fetch(Deno.env.get("SUPABASE_URL")!+"/functions/v1/shipment-push",{
     method:"POST",
     headers:{"Content-Type":"application/json","apikey":Deno.env.get("SUPABASE_ANON_KEY")||""},
     body:JSON.stringify({action:"notify_owner",slug,password,message_id:createdMessage?.id,message:message||"The recipient attached an image to the shipment conversation."})
    });
   }catch(pushError){console.warn("Shipment owner push notification failed:",pushError);}
  }else if(action!=="view")return json({ok:false,error:"Unsupported action."},400);
  const [{data:events},{data:media},{data:messages}]=await Promise.all([
   admin.from("ms_shipment_events").select("id,event_title,event_details,event_at,event_type").eq("shipment_id",s.id).order("event_at",{ascending:true}),
   admin.from("ms_shipment_media").select("storage_path,file_name,mime_type,media_kind").eq("shipment_id",s.id).order("created_at",{ascending:true}),
   admin.from("ms_shipment_messages").select("id,sender_role,sender_name,message,created_at,attachment_path,attachment_name,attachment_mime").eq("shipment_id",s.id).order("created_at",{ascending:true}).limit(100)
  ]);
  const now=new Date();
  const {data:botRows}=await admin.from("ms_shipment_notifications")
    .select("id,bot_key,bot_name,message,trigger_type,trigger_status,scheduled_at,expires_at,published_at,created_at")
    .eq("shipment_id",s.id).eq("is_active",true).order("created_at",{ascending:true});
  const dueBots=(botRows||[]).filter((n:any)=>{
    if(n.expires_at && new Date(n.expires_at)<=now)return false;
    if(n.published_at)return true;
    if(n.trigger_type==="manual")return true;
    if(n.trigger_type==="scheduled")return !!n.scheduled_at && new Date(n.scheduled_at)<=now;
    const expected=String(n.trigger_status||"").trim().toLowerCase();
    const actual=[s.status,s.public_status_label,s.is_obstructed?"stopped":""].map((v:any)=>String(v||"").trim().toLowerCase());
    return !!expected && actual.includes(expected);
  });
  const newlyPublished=dueBots.filter((n:any)=>!n.published_at).map((n:any)=>n.id);
  if(newlyPublished.length){
    await admin.from("ms_shipment_notifications").update({published_at:now.toISOString(),updated_at:now.toISOString()}).in("id",newlyPublished);
  }
  const notifications=dueBots.map((n:any)=>({...n,published_at:n.published_at||now.toISOString(),sender_label:s.carrier||n.bot_name||"Shipment Service"}));
  const linkedMessages=await Promise.all((messages||[]).map(async (m:any)=>{let attachment_url=null;if(m.attachment_path){const {data:signed}=await admin.storage.from("magic-hour-assets").createSignedUrl(m.attachment_path,3600);attachment_url=signed?.signedUrl||null;}return {id:m.id,sender_role:m.sender_role,sender_name:m.sender_name,message:m.message,created_at:m.created_at,attachment_name:m.attachment_name,attachment_url};}));
  const clean={...s};delete clean.access_password_hash;delete clean.tracking_slug;
  const linked=await Promise.all((media||[]).map(async m=>{const {data}=await admin.storage.from("magic-hour-assets").createSignedUrl(m.storage_path,3600);return {file_name:m.file_name,mime_type:m.mime_type,media_kind:m.media_kind,url:data?.signedUrl||null};}));
  return json({ok:true,shipment:clean,events:events||[],media:linked,messages:linkedMessages,notifications});
 }catch(e){return json({ok:false,error:e instanceof Error?e.message:"Request failed."},500);}
});