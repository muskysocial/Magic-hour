import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={ "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-paystack-signature", "Access-Control-Allow-Methods":"POST, OPTIONS" };
const catalog:Record<string,{amount:number;coins:number}> = {
 coin_500:{amount:50000,coins:500},coin_1100:{amount:100000,coins:1100},coin_2400:{amount:200000,coins:2400},
 gold:{amount:700000,coins:7300},diamond:{amount:1500000,coins:16000},platinum:{amount:2800000,coins:37000},platinum_unlimited:{amount:3600000,coins:37000}
};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
const legacyReferencePrefix=atob("bXVza3lf");
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,"0")).join("");
async function validSignature(raw:string,signature:string,secret:string){
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-512"},false,["sign"]);
 return hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw)))===signature;
}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,secret=Deno.env.get("PAYSTACK_SECRET_KEY");
  if(!secret)return json({error:"PAYSTACK_SECRET_KEY is not configured in Supabase secrets"},500);
  const admin=createClient(url,service);
  const raw=await req.text();
  if(req.headers.has("x-paystack-signature")){
   const signature=req.headers.get("x-paystack-signature")||"";
   if(!await validSignature(raw,signature,secret))return json({error:"Invalid Paystack signature"},401);
   const event=JSON.parse(raw);
   if(event.event!=="charge.success")return json({received:true});
   const ref=String(event.data?.reference||"");
   const {data:order,error}=await admin.from("mh_payment_orders").select("*").eq("reference",ref).single();
   if(error||!order)return json({error:"Order not found"},404);
   if(Number(event.data?.amount)!==Number(order.amount_kobo)||event.data?.currency!=="NGN")return json({error:"Payment amount mismatch"},400);
   const {error:settleError}=await admin.rpc("mh_settle_paystack_order",{p_reference:ref,p_transaction_id:String(event.data.id)});
   if(settleError)throw settleError;
   return json({received:true,credited:true});
  }
  const auth=req.headers.get("Authorization")||"",token=auth.startsWith("Bearer ")?auth.slice(7):"";
  if(!token)return json({error:"Sign in required"},401);
  const userClient=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}}});
  const {data:{user},error:userError}=await userClient.auth.getUser();
  if(userError||!user?.email)return json({error:"Your signed-in account email is required"},401);
  const body=JSON.parse(raw);
  if(body.action==="initialize"){
   const key=String(body.product||""),item=catalog[key];if(!item)return json({error:"Unknown plan or coin package"},400);
   const reference="magic_"+crypto.randomUUID().replaceAll("-","");
   const {error:insertError}=await admin.from("mh_payment_orders").insert({user_id:user.id,reference,product_key:key,amount_kobo:item.amount,coins:item.coins,status:"pending"});
   if(insertError)throw insertError;
   const pay=await fetch("https://api.paystack.co/transaction/initialize",{method:"POST",headers:{"Authorization":`Bearer ${secret}`,"Content-Type":"application/json"},body:JSON.stringify({email:user.email,amount:item.amount,reference,callback_url:"https://muskysocial.github.io/magic-hour/?payment=complete",metadata:{app_name:"Magic Hour",user_id:user.id,product:key,brand:"Magic Hour"}})});
   const result=await pay.json();
   if(!pay.ok||!result.status||!result.data?.authorization_url){await admin.from("mh_payment_orders").update({status:"failed"}).eq("reference",reference);return json({error:result.message||"Paystack could not initialize checkout"},502);}
   return json({ok:true,authorization_url:result.data.authorization_url,reference});
  }
  if(body.action==="verify"){
   const reference=String(body.reference||"");if(!new RegExp("^(?:magic_|"+legacyReferencePrefix+")[a-f0-9]{32}$").test(reference))return json({error:"Invalid payment reference"},400);
   const {data:order,error:orderError}=await admin.from("mh_payment_orders").select("*").eq("reference",reference).eq("user_id",user.id).single();
   if(orderError||!order)return json({error:"Payment order not found for this account"},404);
   if(order.status==="success")return json({ok:true,already_processed:true});
   const pay=await fetch("https://api.paystack.co/transaction/verify/"+encodeURIComponent(reference),{headers:{"Authorization":`Bearer ${secret}`}});
   const result=await pay.json();
   if(!pay.ok||!result.status||result.data?.status!=="success")return json({ok:false,pending:true,message:"Payment is not confirmed yet."},409);
   if(Number(result.data.amount)!==Number(order.amount_kobo)||result.data.currency!=="NGN"||result.data.reference!==reference)return json({error:"Verified payment details do not match this order"},400);
   const {data:settled,error:settleError}=await admin.rpc("mh_settle_paystack_order",{p_reference:reference,p_transaction_id:String(result.data.id)});
   if(settleError)throw settleError;
   return json({ok:true,settled});
  }
  return json({error:"Unknown action"},400);
 }catch(error){console.error("paystack-membership:",error);return json({error:error instanceof Error?error.message:"Payment processing failed"},500);}
});