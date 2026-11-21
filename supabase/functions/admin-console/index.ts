import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OWNER_EMAIL = "ugohjeremiah16@gmail.com";
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

async function identify(req: Request) {
  const header = req.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
async function requireAdmin(req: Request) {
  const user = await identify(req);
  if (!user) throw new Error("Sign in required.");
  if ((user.email || "").toLowerCase() !== OWNER_EMAIL) throw new Error("Admin access denied.");
  const { data, error } = await admin.from("admin_users").select("role").eq("user_id", user.id).maybeSingle();
  if (error || !data || !["admin", "owner", "super_admin"].includes(data.role)) throw new Error("Admin access denied.");
  return user;
}
async function listAuthUsers(): Promise<any[]> {
  const allUsers: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw error;
    const batch = data.users || [];
    allUsers.push(...batch);
    if (batch.length < 500) break;
  }
  return allUsers;
}
async function findAuthUserByEmail(email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw error;
    const users = data.users || [];
    const match = users.find((u: any) => (u.email || "").toLowerCase() === email);
    if (match) return match;
    if (users.length < 500) break;
  }
  return null;
}
async function findAuthUsersByIds(userIds: string[]) {
  const wanted = new Set(userIds);
  const found: any[] = [];
  if (!wanted.size) return found;
  for (let page = 1; page <= 20 && wanted.size; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw error;
    const batch = data.users || [];
    for (const user of batch) {
      if (wanted.has(user.id)) {
        found.push(user);
        wanted.delete(user.id);
      }
    }
    if (batch.length < 500) break;
  }
  return found;
}
async function count(table: string, filter?: (q: any) => any) {
  let q = admin.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: n, error } = await q;
  if (error) throw error;
  return n || 0;
}
async function dashboard() {
  const now = new Date();
  const activeSince = new Date(now.getTime() - 5 * 60_000).toISOString();
  const daySince = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
  const [
    profiles, projects, assets, jobs, failedJobs, shipments, transactions, memberships,
    visitorActive, guests24h, guestsTotal, recentVisitors, issuesResult, failedRecent
  ] = await Promise.all([
    count("mh_profiles"), count("mh_projects"), count("mh_assets"), count("mh_video_jobs"),
    count("mh_video_jobs", q => q.eq("status", "failed")),
    count("ms_shipments"), count("mh_wallet_transactions"), count("mh_memberships", q => q.or("unlimited_duration.eq.true,expires_at.gt."+new Date().toISOString())),
    count("ms_guest_visitors", q => q.gte("last_seen_at", activeSince)),
    count("ms_guest_visitors", q => q.is("user_id", null).gte("last_seen_at", daySince)),
    count("ms_guest_visitors", q => q.is("user_id", null)),
    admin.from("ms_guest_visitors").select("visitor_id,user_id,last_seen_at,last_path,visits").gte("last_seen_at", activeSince).order("last_seen_at", { ascending: false }).limit(30),
    admin.from("ms_admin_issues").select("*").order("created_at", { ascending: false }).limit(25),
    admin.from("mh_video_jobs").select("id,status,error_message,created_at,updated_at").eq("status", "failed").order("updated_at", { ascending: false }).limit(10)
  ]);
  if (recentVisitors.error) throw recentVisitors.error;
  if (issuesResult.error) throw issuesResult.error;
  if (failedRecent.error) throw failedRecent.error;

  const allUsers: any[] = await listAuthUsers();
  const recentUsers = [...allUsers].sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).slice(0,100);
  const ids = recentUsers.map(u => u.id);
  const [walletRows, memberRows] = ids.length ? await Promise.all([
    admin.from("mh_wallets").select("user_id,balance").in("user_id", ids),
    admin.from("mh_memberships").select("user_id,plan_name,plan_key,expires_at,unlimited_duration").in("user_id", ids).or("unlimited_duration.eq.true,expires_at.gt."+now.toISOString())
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (walletRows.error) throw walletRows.error;
  if (memberRows.error) throw memberRows.error;
  const wallets = new Map((walletRows.data || []).map((x: any) => [x.user_id, x.balance]));
  const members = new Map((memberRows.data || []).map((x: any) => [x.user_id, x]));
  const users = recentUsers.map(u => ({
    id: u.id, email: u.email || "", created_at: u.created_at, last_sign_in_at: u.last_sign_in_at,
    confirmed: !!u.email_confirmed_at, wallet_balance: wallets.get(u.id) ?? 0,
    membership: members.get(u.id) || null
  }));
  const storageProbe = await admin.storage.from("magic-hour-assets").list("", { limit: 1 });
  const health = [
    { name: "Database", status: "healthy", detail: "Admin database queries responded successfully" },
    { name: "Authentication", status: "healthy", detail: "Supabase Auth admin API responded successfully" },
    { name: "Private storage", status: storageProbe.error ? "warning" : "healthy", detail: storageProbe.error ? "Private media bucket probe failed: " + storageProbe.error.message : "Private media bucket is reachable" },
    { name: "AI generation", status: failedJobs > 0 ? "warning" : "unknown", detail: failedJobs + " failed video jobs in recorded history; provider availability is not directly probed" },
    { name: "Shipment tracking", status: "healthy", detail: shipments + " shipment records are accessible" }
  ];
  return {
    generated_at: now.toISOString(),
    counts: {
      registered_users: allUsers.length, active_visitors_5m: visitorActive,
      active_guests_24h: guests24h, guest_sessions_total: guestsTotal,
      projects, assets, video_jobs: jobs, failed_video_jobs: failedJobs,
      shipments, wallet_transactions: transactions, memberships
    },
    users,
    recent_visitors: recentVisitors.data || [],
    issues: issuesResult.data || [],
    failed_jobs: failedRecent.data || [],
    health
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "heartbeat") {
      const visitorId = String(body.visitor_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(visitorId)) return json({ error: "Invalid visitor session" }, 400);
      const user = await identify(req);
      const record = {
        visitor_id: visitorId, last_seen_at: new Date().toISOString(),
        last_path: String(body.path || "/").slice(0, 240),
        user_id: user?.id || null,
        user_agent: String(req.headers.get("user-agent") || "").slice(0, 300)
      };
      const { data: exists, error: findError } = await admin.from("ms_guest_visitors").select("visitor_id,visits").eq("visitor_id", visitorId).maybeSingle();
      if (findError) throw findError;
      const result = exists
        ? await admin.from("ms_guest_visitors").update({ ...record, visits: Number(exists.visits || 0) + (body.visit_start === true ? 1 : 0) }).eq("visitor_id", visitorId)
        : await admin.from("ms_guest_visitors").insert({ ...record, first_seen_at: new Date().toISOString(), visits: 1 });
      if (result.error) throw result.error;
      return json({ ok: true });
    }

    if (action === "telemetry") {
      const visitorId = String(body.visitor_id || "");
      const eventType = String(body.event_type || "");
      if (!/^[0-9a-f-]{36}$/i.test(visitorId) || !["javascript_error","unhandled_rejection","page_load"].includes(eventType)) return json({error:"Invalid telemetry event."},400);
      const since = new Date(Date.now()-5*60_000).toISOString();
      const recent = await count("mh_site_telemetry",q=>q.eq("visitor_id",visitorId).gte("created_at",since));
      if (recent >= 12) return json({error:"Telemetry rate limit reached."},429);
      const duration = Math.max(0,Math.min(600000,Math.trunc(Number(body.duration_ms)||0)));
      const user = await identify(req);
      const {error} = await admin.from("mh_site_telemetry").insert({
        visitor_id:visitorId,user_id:user?.id||null,event_type:eventType,
        message:String(body.message||"").slice(0,1000),stack:String(body.stack||"").slice(0,4000),
        path:String(body.path||"/").slice(0,240),duration_ms:duration,
        user_agent:String(req.headers.get("user-agent")||"").slice(0,300)
      });
      if(error)throw error;
      return json({ok:true});
    }

    if (action === "public_config") {
      const now = new Date().toISOString();
      const [settingsResult, featureResult, announcementResult] = await Promise.all([
        admin.from("mh_site_settings").select("key,value").in("key", ["announcement","homepage_headline","support_email","maintenance_mode","brand_name","logo_url","favicon_url","accent_color","social_image_url"]),
        admin.from("mh_site_features").select("tool_id,enabled,access_tier,coin_cost,sort_order").order("sort_order"),
        admin.from("mh_site_announcements").select("id,title,body,starts_at,ends_at,created_at").eq("active",true).order("created_at",{ascending:false}).limit(100)
      ]);
      if (settingsResult.error) throw settingsResult.error;
      if (featureResult.error) throw featureResult.error;
      if (announcementResult.error) throw announcementResult.error;
      const settings = Object.fromEntries((settingsResult.data || []).map((x: any) => [x.key, x.value]));
      const announcements = (announcementResult.data || []).filter((item: any) =>
        (!item.starts_at || new Date(item.starts_at).getTime() <= Date.now()) &&
        (!item.ends_at || new Date(item.ends_at).getTime() > Date.now())
      ).slice(0,5);
      return json({ settings, features: featureResult.data || [], announcements });
    }
    if (action === "submit_support") {
      const email=String(body.email||"").trim().toLowerCase();
      const subject=String(body.subject||"").trim().slice(0,160);
      const message=String(body.message||"").trim().slice(0,5000);
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||subject.length<3||message.length<5)return json({error:"Enter a valid email, subject and message."},400);
      const since=new Date(Date.now()-3600000).toISOString();
      const {count:recent,error:rateError}=await admin.from("mh_support_tickets").select("*",{count:"exact",head:true}).eq("email",email).gte("created_at",since);
      if(rateError)throw rateError;
      if((recent||0)>=5)return json({error:"Support request limit reached. Please try again later."},429);
      const user=await identify(req);
      const {data,error}=await admin.from("mh_support_tickets").insert({user_id:user?.id||null,email,subject,message}).select("id,created_at,status").single();
      if(error)throw error;
      return json({ok:true,ticket:data});
    }
    await requireAdmin(req);
    if (action === "dashboard") return json(await dashboard());
    if (action === "create_issue") {
      const title = String(body.title || "").trim().slice(0, 160);
      if (!title) return json({ error: "Issue title is required." }, 400);
      const { data, error } = await admin.from("ms_admin_issues").insert({
        title, details: String(body.details || "").slice(0, 5000),
        severity: ["low","medium","high","critical"].includes(body.severity) ? body.severity : "medium",
        source: "admin", created_by: (await identify(req))?.id
      }).select("*").single();
      if (error) throw error;
      await admin.from("mh_admin_audit_log").insert({ actor_user_id: (await identify(req))?.id, actor_email: OWNER_EMAIL, action: "issue.create", target: data.id, details: title });
      return json({ issue: data });
    }
    if (action === "update_issue") {
      const id = String(body.id || "");
      const status = String(body.status || "");
      if (!/^[0-9a-f-]{36}$/i.test(id) || !["open","investigating","resolved","ignored"].includes(status)) return json({ error: "Invalid issue update." }, 400);
      const { data, error } = await admin.from("ms_admin_issues").update({
        status, updated_at: new Date().toISOString(),
        resolved_at: status === "resolved" ? new Date().toISOString() : null,
        admin_notes: String(body.admin_notes || "").slice(0, 5000)
      }).eq("id", id).select("*").single();
      if (error) throw error;
      await admin.from("mh_admin_audit_log").insert({ actor_user_id: (await identify(req))?.id, actor_email: OWNER_EMAIL, action: "issue.update", target: id, details: status });
      return json({ issue: data });
    }

    if (action === "room_data") {
      const room = String(body.room || "");
      const stamp = new Date().toISOString();
      if (room === "Site Features") {
        const { data, error } = await admin.from("mh_site_features").select("*").order("sort_order");
        if (error) throw error;
        return json({ loaded: true, description: "Control tool visibility and access tiers. Coin costs are catalogue values; live provider billing remains managed by each tool service.", features: data || [] });
      }
      if (room === "Site Settings") {
        const { data, error } = await admin.from("mh_site_settings").select("key,value");
        if (error) throw error;
        const settings = Object.fromEntries((data || []).map((x: any) => [x.key, x.value]));
        return json({ loaded: true, description: "Manage the platform-wide Magic Hour configuration.", settings });
      }
      if (room === "Site Monitor") {
        const since = new Date(Date.now() - 5 * 60000).toISOString();
        const daySince = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
        const [authUsers, guests, activeGuests, projects, assets, failed, shipments, visitors, jobs, storageProbe, telemetry, telemetryCount, clientErrors, pageLoads] = await Promise.all([
          listAuthUsers(), count("ms_guest_visitors", q => q.is("user_id", null)), count("ms_guest_visitors", q => q.is("user_id", null).gte("last_seen_at", since)),
          count("mh_projects"), count("mh_assets"), count("mh_video_jobs", q => q.eq("status", "failed")), count("ms_shipments"),
          admin.from("ms_guest_visitors").select("visitor_id,user_id,last_path,visits,last_seen_at").order("last_seen_at", { ascending: false }).limit(50),
          admin.from("mh_video_jobs").select("id,status,error_message,updated_at,created_at").eq("status", "failed").order("updated_at", { ascending: false }).limit(30),
          admin.storage.from("magic-hour-assets").list("", { limit: 1 }),
          admin.from("mh_site_telemetry").select("event_type,message,path,duration_ms,created_at,user_id").order("created_at",{ascending:false}).limit(100),
          count("mh_site_telemetry",q=>q.gte("created_at",daySince)),
          count("mh_site_telemetry",q=>q.gte("created_at",daySince).in("event_type",["javascript_error","unhandled_rejection"])),
          count("mh_site_telemetry",q=>q.gte("created_at",daySince).eq("event_type","page_load"))
        ]);
        if (visitors.error) throw visitors.error; if (jobs.error) throw jobs.error; if(telemetry.error)throw telemetry.error;
        const pageSamples=(telemetry.data||[]).filter((x:any)=>x.event_type==="page_load"&&new Date(x.created_at).getTime()>=Date.now()-24*60*60_000).map((x:any)=>Number(x.duration_ms)).filter((x:number)=>Number.isFinite(x)&&x>0);
        const averagePageLoadMs=pageSamples.length?Math.round(pageSamples.reduce((sum:number,x:number)=>sum+x,0)/pageSamples.length):0;
        const health = [
          { name: "Database", status: "healthy", detail: "Live admin database queries completed" },
          { name: "Authentication", status: "healthy", detail: "Supabase Auth account directory responded" },
          { name: "Private storage", status: storageProbe.error ? "warning" : "healthy", detail: storageProbe.error ? storageProbe.error.message : "Private media bucket is reachable" },
          { name: "Client errors", status: clientErrors > 0 ? "warning" : "healthy", detail: clientErrors + " JavaScript errors or unhandled rejections recorded in the last 24 hours" },
          { name: "Page performance", status: pageLoads === 0 ? "unknown" : averagePageLoadMs > 5000 ? "warning" : "healthy", detail: pageLoads + " page-load measurements in 24 hours; latest 100 sample average " + (averagePageLoadMs ? averagePageLoadMs + " ms" : "not available") },
          { name: "AI providers", status: "unknown", detail: "Provider availability is not directly probed by this monitor" },
          { name: "Shipment records", status: "healthy", detail: shipments + " shipment records are accessible" }
        ];
        return json({ loaded: true, description: "Live visitor activity, private storage health, client-side errors and page-load timing. Provider availability is not fabricated.",
          counts: { users: authUsers.length, guests, active_guests: activeGuests, projects, assets, failed_jobs: failed, shipments, telemetry_24h:telemetryCount, client_errors_24h:clientErrors, page_loads_24h:pageLoads, average_page_load_ms:averagePageLoadMs },
          health, visitors: visitors.data || [], failed_jobs: jobs.data || [], telemetry:telemetry.data||[] });
      }
      if (room === "User Centre") {
        const allAuthUsers = await listAuthUsers();
        const recentUsers = [...allAuthUsers].sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).slice(0, 100);
        const ids = recentUsers.map((u: any) => u.id);
        const [wallets, memberships, guests] = await Promise.all([
          ids.length ? admin.from("mh_wallets").select("user_id,balance").in("user_id", ids) : { data: [], error: null },
          ids.length ? admin.from("mh_memberships").select("user_id,plan_name,expires_at,unlimited_duration").in("user_id", ids).or("unlimited_duration.eq.true,expires_at.gt."+new Date().toISOString()) : { data: [], error: null },
          admin.from("ms_guest_visitors").select("visitor_id,last_path,visits,last_seen_at").is("user_id", null).order("last_seen_at", { ascending: false }).limit(100)
        ]);
        if (wallets.error) throw wallets.error; if (memberships.error) throw memberships.error; if (guests.error) throw guests.error;
        const w = new Map((wallets.data || []).map((x: any) => [x.user_id, x.balance]));
        const m = new Map((memberships.data || []).map((x: any) => [x.user_id, x]));
        const users = recentUsers.map((u: any) => ({ email: u.email || "", created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at || "Never", wallet_balance: w.get(u.id) ?? 0,
          membership: m.get(u.id)?.plan_name || "Free", confirmed: !!u.email_confirmed_at }));
        return json({ loaded: true, description: "Registered accounts, verification state, wallet balances, memberships and anonymous guest sessions.",
          counts: { registered_users: allAuthUsers.length }, users, guests: guests.data || [] });
      }
      if (room === "Finance") {
        const [transactions, memberships, txCount, memberCount, wallets, payments, paymentCount, successfulPaymentCount, apiBilling] = await Promise.all([
          admin.from("mh_wallet_transactions").select("created_at,user_id,transaction_type,amount,description,reference").order("created_at", { ascending: false }).limit(100),
          admin.from("mh_memberships").select("user_id,plan_name,started_at,expires_at,unlimited_generations,unlimited_duration").order("started_at", { ascending: false }).limit(100),
          count("mh_wallet_transactions"), count("mh_memberships", q => q.or("unlimited_duration.eq.true,expires_at.gt."+new Date().toISOString())),
          admin.from("mh_wallets").select("balance"),
          admin.from("mh_payment_orders").select("id,user_id,reference,product_key,amount_kobo,coins,status,paystack_transaction_id,created_at,paid_at").order("created_at",{ascending:false}).limit(100),
          count("mh_payment_orders"), count("mh_payment_orders",q=>q.eq("status","success")),
          admin.from("ms_api_billing_transactions").select("id,user_id,endpoint,amount,status,created_at,refunded_at").order("created_at",{ascending:false}).limit(100)
        ]);
        if (transactions.error) throw transactions.error; if (memberships.error) throw memberships.error; if (wallets.error) throw wallets.error;
        if (payments.error) throw payments.error; if (apiBilling.error) throw apiBilling.error;
        const ids = [...new Set([...(transactions.data || []).map((x: any) => x.user_id), ...(memberships.data || []).map((x: any) => x.user_id), ...(payments.data || []).map((x: any) => x.user_id), ...(apiBilling.data || []).map((x: any) => x.user_id)])];
        const users = await findAuthUsersByIds(ids);
        const email = new Map(users.map((u: any) => [u.id, u.email || ""]));
        const paymentRows = (payments.data || []).map((x: any) => ({...x,email:email.get(x.user_id)||x.user_id,amount_ngn:"₦"+(Number(x.amount_kobo||0)/100).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2})}));
        const recentPaidNgn = paymentRows.filter((x:any)=>x.status==="success").reduce((sum:number,x:any)=>sum+Number(x.amount_kobo||0)/100,0);
        return json({ loaded: true, description: "Actual wallet ledger, Paystack payment orders, API billing records and membership status. Revenue is calculated only from successful payment orders.",
          counts: { transactions: txCount, memberships: memberCount, coins: (wallets.data || []).reduce((n: number, x: any) => n + Number(x.balance || 0), 0), payment_orders: paymentCount, successful_payments: successfulPaymentCount, recent_paid_ngn: recentPaidNgn },
          transactions: (transactions.data || []).map((x: any) => ({ ...x, email: email.get(x.user_id) || x.user_id })),
          memberships: (memberships.data || []).map((x: any) => ({ ...x, email: email.get(x.user_id) || x.user_id, membership_status: x.unlimited_duration ? "Unlimited" : (x.expires_at && new Date(x.expires_at).getTime() > Date.now() ? "Active" : "Expired") })),
          payments: paymentRows, api_billing: (apiBilling.data || []).map((x:any)=>({...x,email:email.get(x.user_id)||x.user_id})) });
      }
      if (room === "API Centre") {
        const [keys, usage] = await Promise.all([
          admin.from("ms_api_keys").select("id,user_id,name,key_prefix,created_at,last_used_at,revoked_at").order("created_at", { ascending: false }).limit(100),
          admin.from("ms_api_usage").select("created_at,endpoint,http_method,status_code").order("created_at", { ascending: false }).limit(100)
        ]);
        if (keys.error) throw keys.error; if (usage.error) throw usage.error;
        return json({ loaded: true, description: "Developer API key metadata and request logs. Secret hashes are never returned.", keys: keys.data || [], usage: usage.data || [] });
      }
      if (room === "Issue Desk") {
        const { data, error } = await admin.from("ms_admin_issues").select("*").order("created_at", { ascending: false }).limit(100);
        if (error) throw error;
        return json({ loaded: true, description: "Operational issue register and resolution history.", issues: data || [] });
      }
      if (room === "Announcements") {
        const { data, error } = await admin.from("mh_site_announcements").select("*").order("created_at", { ascending: false }).limit(100);
        if (error) throw error;
        return json({ loaded: true, description: "Manage text announcements and media campaigns.", announcements: data || [] });
      }
      if (room === "Security") {
        const [{data:admins,error:adminError},{data:audit,error:auditError}] = await Promise.all([
          admin.from("admin_users").select("user_id,role,created_at").order("created_at",{ascending:true}),
          admin.from("mh_admin_audit_log").select("*").order("created_at", { ascending: false }).limit(100)
        ]);
        if(adminError)throw adminError;if(auditError)throw auditError;
        const authUsers=await findAuthUsersByIds((admins||[]).map((x:any)=>x.user_id));
        const emailById=new Map(authUsers.map((u:any)=>[u.id,u.email||""]));
        return json({ loaded: true, description: "Current admin role assignments and privileged actions recorded by the server. Secrets and credentials are never displayed.", admins:(admins||[]).map((x:any)=>({...x,email:emailById.get(x.user_id)||x.user_id})), audit:audit||[] });
      }
      if (room === "Deployment") {
        const { data, error } = await admin.from("mh_video_jobs").select("created_at,status,error_message,updated_at").order("updated_at", { ascending: false }).limit(40);
        if (error) throw error;
        return json({ loaded: true, description: "Application jobs and release safeguards. Production deployment is not performed by this control.", jobs: data || [] });
      }
      if (room === "Support") {
        const {data,error}=await admin.from("mh_support_tickets").select("*").order("created_at",{ascending:false}).limit(150);
        if(error)throw error;
        return json({loaded:true,description:"Customer support requests submitted through the Magic Hour account settings.",tickets:data||[]});
      }
      if (room === "AI Jobs") {
        const [jobs, queued, running, failed, completed] = await Promise.all([
          admin.from("mh_video_jobs").select("id,user_id,project_id,status,duration_seconds,credit_cost,error_message,created_at,updated_at").order("created_at",{ascending:false}).limit(100),
          count("mh_video_jobs",q=>q.eq("status","queued")), count("mh_video_jobs",q=>q.eq("status","processing")),
          count("mh_video_jobs",q=>q.eq("status","failed")), count("mh_video_jobs",q=>q.eq("status","completed"))
        ]);
        if (jobs.error) throw jobs.error;
        return json({loaded:true,description:"Live video generation queue and recorded outcomes.",counts:{queued,running,failed,completed},jobs:jobs.data||[]});
      }
      if (room === "Audit") {
        const {data,error}=await admin.from("mh_admin_audit_log").select("*").order("created_at",{ascending:false}).limit(200);
        if(error)throw error;
        return json({loaded:true,description:"Chronological record of privileged actions.",audit:data||[]});
      }
      if (room === "Feature Experiments") {
        const {data,error}=await admin.from("mh_feature_experiments").select("*").order("created_at",{ascending:false}).limit(100);
        if(error)throw error;
        return json({loaded:true,description:"Store experiment definitions and rollout settings. Traffic changes only when an experiment is connected to a live feature.",experiments:data||[]});
      }
      if (room === "Appearance") {
        const {data,error}=await admin.from("mh_site_settings").select("key,value").in("key",["brand_name","logo_url","favicon_url","accent_color","social_image_url"]);
        if(error)throw error;
        return json({loaded:true,description:"Manage public brand assets and theme appearance.",settings:Object.fromEntries((data||[]).map((x:any)=>[x.key,x.value]))});
      }
      if (room === "Notifications") {
        const [issues, failedJobs, tickets] = await Promise.all([
          admin.from("ms_admin_issues").select("id,title,details,severity,status,created_at").in("status", ["open","investigating"]).order("created_at",{ascending:false}).limit(25),
          admin.from("mh_video_jobs").select("id,error_message,status,updated_at").eq("status","failed").order("updated_at",{ascending:false}).limit(25),
          admin.from("mh_support_tickets").select("id,subject,email,status,created_at").in("status",["open","in_progress"]).order("created_at",{ascending:false}).limit(25)
        ]);
        if(issues.error)throw issues.error;if(failedJobs.error)throw failedJobs.error;if(tickets.error)throw tickets.error;
        const alerts = [
          ...(issues.data||[]).map(x=>({id:x.id,kind:"Issue",title:x.title,detail:x.details||"No details",status:x.severity+" · "+x.status,created_at:x.created_at,room:"Issue Desk"})),
          ...(failedJobs.data||[]).map(x=>({id:x.id,kind:"Failed AI job",title:"Generation job failed",detail:x.error_message||"No error details recorded",status:x.status,created_at:x.updated_at,room:"AI Jobs"})),
          ...(tickets.data||[]).map(x=>({id:x.id,kind:"Support",title:x.subject,detail:x.email,status:x.status,created_at:x.created_at,room:"Support"}))
        ].sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).slice(0,60);
        return json({loaded:true,description:"Operational inbox combining unresolved issues, failed generation jobs and open customer support requests.",alerts});
      }
      if (room === "Backups") return json({ loaded: true, description: "Backup availability is controlled by Supabase project backup settings. No unverified backup or restore is reported as complete.", cards: [["Database backups","Check Supabase project backups and point-in-time recovery in the provider console.","Provider-managed"],["Private media","magic-hour-assets remains private; preserve bucket contents and mh_assets metadata together.","Protected"],["Restore test","A restore test has not been performed by this control centre.","Not verified"]] });
      return json({ loaded: true, description: "This room is reserved for the final Site AI integration.", cards: [["Site AI","Connect only after all other control-centre systems are complete.","Reserved for last"]] });
    }
    if (action === "save_settings") {
      const s = body.settings || {};
      const allowed: Record<string, unknown> = {};
      if ("announcement" in s) allowed.announcement = String(s.announcement || "").slice(0,240);
      if ("homepage_headline" in s) allowed.homepage_headline = String(s.homepage_headline || "").slice(0,140);
      if ("support_email" in s) { const email = String(s.support_email || "").trim(); if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid support email address." }, 400); allowed.support_email = email.slice(0,254); }
      if ("maintenance_mode" in s) allowed.maintenance_mode = !!s.maintenance_mode;
      if ("brand_name" in s) allowed.brand_name = String(s.brand_name || "Magic Hour").slice(0,80);
      for (const key of ["logo_url","favicon_url","social_image_url"]) {
        if (!(key in s)) continue;
        const value = String(s[key] || "").trim();
        if (value && !value.toLowerCase().startsWith("https://")) return json({ error: "Brand image URLs must use HTTPS." }, 400);
        allowed[key] = value.slice(0,2048);
      }
      if ("accent_color" in s) {
        const color = String(s.accent_color || "");
        if (!/^#[0-9a-f]{6}$/i.test(color)) return json({ error: "Enter a valid six-digit accent colour." }, 400);
        allowed.accent_color = color;
      }
      const entries = Object.entries(allowed);
      if (!entries.length) return json({ error: "No settings were supplied." }, 400);
      for (const [key, value] of entries) {
        const { error } = await admin.from("mh_site_settings").upsert({ key, value, updated_by: (await identify(req))?.id, updated_at: new Date().toISOString() }, { onConflict: "key" });
        if (error) throw error;
      }
      await admin.from("mh_admin_audit_log").insert({ actor_user_id: (await identify(req))?.id, actor_email: OWNER_EMAIL, action: "settings.update", target: "site_settings", details: "Updated keys: " + entries.map(([key]) => key).join(", ") });
      return json({ ok: true, updated: entries.map(([key]) => key) });
    }
    if (action === "set_feature") {
      const tool = String(body.tool_id || "").slice(0,80);
      if (!/^[a-z0-9-]+$/i.test(tool)) return json({ error: "Invalid tool identifier." }, 400);
      const { data: currentFeature, error: currentFeatureError } = await admin.from("mh_site_features").select("enabled,access_tier,coin_cost").eq("tool_id",tool).maybeSingle();
      if (currentFeatureError) throw currentFeatureError;
      const featureUpdate = { tool_id: tool, enabled: typeof body.enabled === "boolean" ? body.enabled : (currentFeature?.enabled ?? true), access_tier: ["free","pro","restricted"].includes(body.access_tier) ? body.access_tier : (currentFeature?.access_tier || "free"), coin_cost: body.coin_cost !== undefined ? Math.max(0, Math.min(100000, Number(body.coin_cost) || 0)) : (currentFeature?.coin_cost || 0), updated_at: new Date().toISOString() };
      const { error } = await admin.from("mh_site_features").upsert(featureUpdate, { onConflict: "tool_id" });
      if (error) throw error;
      await admin.from("mh_admin_audit_log").insert({ actor_user_id: (await identify(req))?.id, actor_email: OWNER_EMAIL, action: "feature.toggle", target: tool, details: String(!!body.enabled) });
      return json({ ok: true });
    }

    if (action === "adjust_wallet") {
      const email = String(body.email || "").trim().toLowerCase();
      const amount = Math.trunc(Number(body.amount));
      const description = String(body.description || "Admin wallet adjustment").trim().slice(0,240);
      if (!email || !Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 100000000) return json({ error: "Enter a valid account email and a non-zero coin amount." }, 400);
      const target = await findAuthUserByEmail(email);
      if (!target) return json({ error: "No registered account was found for that email." }, 404);
      const reference = "admin-" + crypto.randomUUID();
      const { data: balance, error } = await admin.rpc("mh_admin_adjust_wallet", { p_user_id: target.id, p_amount: amount, p_description: description, p_reference: reference });
      if (error) throw error;
      await admin.from("mh_admin_audit_log").insert({ actor_user_id: (await identify(req))?.id, actor_email: OWNER_EMAIL, action: "wallet.adjust", target: target.id, details: amount + " coins: " + description });
      return json({ ok: true, balance, reference });
    }
    if (action === "grant_membership") {
      const email = String(body.email || "").trim().toLowerCase();
      const plan = String(body.plan_name || "").trim().slice(0,80);
      const days = Math.max(1, Math.min(3650, Math.trunc(Number(body.days) || 30)));
      if (!email || !plan) return json({ error: "Account email and plan name are required." }, 400);
      const target = await findAuthUserByEmail(email);
      if (!target) return json({ error: "No registered account was found for that email." }, 404);
      const now = new Date();
      const { data: currentMembership, error: currentMembershipError } = await admin.from("mh_memberships").select("started_at,expires_at,unlimited_duration").eq("user_id",target.id).maybeSingle();
      if (currentMembershipError) throw currentMembershipError;
      const currentExpiry = currentMembership?.expires_at ? new Date(currentMembership.expires_at) : null;
      const isActive = !!currentMembership && (!!currentMembership.unlimited_duration || (!!currentExpiry && currentExpiry.getTime() > now.getTime()));
      const isUnlimitedDuration = body.unlimited_duration === true;
      const renewalBase = isActive && currentExpiry ? currentExpiry : now;
      const expires = new Date(renewalBase.getTime() + days * 86400000);
      const startedAt = isActive && currentMembership?.started_at ? currentMembership.started_at : now.toISOString();
      const { data, error } = await admin.from("mh_memberships").upsert({ user_id: target.id, plan_key: plan.toLowerCase().replace(/[^a-z0-9]+/g,"-"), plan_name: plan, started_at: startedAt, expires_at: isUnlimitedDuration ? null : expires.toISOString(), unlimited_generations: !!body.unlimited_generations, unlimited_duration: isUnlimitedDuration, updated_at: now.toISOString() }, { onConflict: "user_id" }).select("*").single();
      if (error) throw error;
      await admin.from("mh_admin_audit_log").insert({ actor_user_id: (await identify(req))?.id, actor_email: OWNER_EMAIL, action: "membership.grant", target: target.id, details: plan + " for " + days + " days" });
      return json({ membership: data });
    }
    if (action === "update_announcement") {
      const id = String(body.id || "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid announcement." }, 400);
      const { data, error } = await admin.from("mh_site_announcements").update({ active: !!body.active, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
      if (error) throw error;
      await admin.from("mh_admin_audit_log").insert({ actor_user_id: (await identify(req))?.id, actor_email: OWNER_EMAIL, action: "announcement.toggle", target: id, details: String(!!body.active) });
      return json({ announcement: data });
    }

    if (action === "delete_announcement") {
      const id = String(body.id || "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid announcement." }, 400);
      const { data, error } = await admin.from("mh_site_announcements").delete().eq("id", id).select("id,title").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Announcement not found." }, 404);
      await admin.from("mh_admin_audit_log").insert({ actor_user_id: (await identify(req))?.id, actor_email: OWNER_EMAIL, action: "announcement.delete", target: id, details: data.title });
      return json({ ok: true });
    }

    if (action === "revoke_api_key") {
      const id = String(body.id || "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid API key." }, 400);
      const { data, error } = await admin.from("ms_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null).select("id,name").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "API key was not found or is already revoked." }, 404);
      await admin.from("mh_admin_audit_log").insert({ actor_user_id: (await identify(req))?.id, actor_email: OWNER_EMAIL, action: "api_key.revoke", target: id, details: data.name });
      return json({ ok: true, key: data });
    }
    if (action === "update_support_ticket") {
      const id=String(body.id||""),status=String(body.status||"");
      if(!/^[0-9a-f-]{36}$/i.test(id)||!["open","in_progress","resolved"].includes(status))return json({error:"Invalid ticket update."},400);
      const {data,error}=await admin.from("mh_support_tickets").update({status,admin_reply:String(body.admin_reply||"").slice(0,5000),updated_at:new Date().toISOString()}).eq("id",id).select("*").single();
      if(error)throw error;
      await admin.from("mh_admin_audit_log").insert({actor_user_id:(await identify(req))?.id,actor_email:OWNER_EMAIL,action:"support.update",target:id,details:status});
      return json({ticket:data});
    }
    if (action === "save_experiment") {
      const name = String(body.name || "").trim().slice(0,120);
      const description = String(body.description || "").trim().slice(0,500);
      const traffic = Math.max(0,Math.min(100,Math.trunc(Number(body.traffic_percent)||0)));
      if (!name) return json({error:"Experiment name is required."},400);
      const variants = Array.isArray(body.variants) ? body.variants.slice(0,8).map((v:any)=>String(v).slice(0,60)) : ["control","variant-a"];
      const {data,error}=await admin.from("mh_feature_experiments").insert({name,description,traffic_percent:traffic,variants,enabled:false}).select("*").single();
      if(error)throw error;
      await admin.from("mh_admin_audit_log").insert({actor_user_id:(await identify(req))?.id,actor_email:OWNER_EMAIL,action:"experiment.create",target:data.id,details:name});
      return json({experiment:data});
    }
    if (action === "toggle_experiment") {
      const id=String(body.id||"");
      if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"Invalid experiment."},400);
      const {data,error}=await admin.from("mh_feature_experiments").update({enabled:!!body.enabled,updated_at:new Date().toISOString()}).eq("id",id).select("*").single();
      if(error)throw error;
      await admin.from("mh_admin_audit_log").insert({actor_user_id:(await identify(req))?.id,actor_email:OWNER_EMAIL,action:"experiment.toggle",target:id,details:String(!!body.enabled)});
      return json({experiment:data});
    }
    if (action === "save_announcement") {
      const title = String(body.title || "").trim().slice(0,120), message = String(body.body || "").trim().slice(0,1000);
      if (!title || !message) return json({ error: "Announcement title and message are required." }, 400);
      const startDate = body.starts_at ? new Date(String(body.starts_at)) : null;
      const endDate = body.ends_at ? new Date(String(body.ends_at)) : null;
      if ((startDate && !Number.isFinite(startDate.getTime())) || (endDate && !Number.isFinite(endDate.getTime()))) return json({ error: "Enter valid announcement dates." }, 400);
      const starts = startDate ? startDate.toISOString() : null;
      const ends = endDate ? endDate.toISOString() : null;
      if (starts && ends && new Date(ends) <= new Date(starts)) return json({ error: "End date must be after start date." }, 400);
      const { data, error } = await admin.from("mh_site_announcements").insert({ title, body: message, active: true, starts_at: starts, ends_at: ends }).select("*").single();
      if (error) throw error;
      await admin.from("mh_admin_audit_log").insert({ actor_user_id: (await identify(req))?.id, actor_email: OWNER_EMAIL, action: "announcement.create", target: data.id, details: title });
      return json({ announcement: data });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin request failed";
    const status = message.includes("Admin access denied") ? 403 : message.includes("Sign in required") ? 401 : 500;
    return json({ error: message }, status);
  }
});
