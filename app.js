import { supabase } from "./api.js";

const app = document.querySelector("#app");
const tools = [
  {id:"canva",name:"Canva Me",desc:"Design and create stunning graphics",icon:"🎨",accent:"canva",kind:"design"},
  {id:"headswap",name:"Image HeadSwap",desc:"Swap faces in photos",icon:"🪄",accent:"head",kind:"image"},
  {id:"videoswap",name:"Video Face Swap",desc:"Swap faces in videos",icon:"🎬",accent:"video",kind:"video"},
  {id:"format",name:"Format",desc:"Convert, compress and resize files",icon:"📁",accent:"format",kind:"files"},
  {id:"social",name:"All Social Media Platform",desc:"Manage and grow across social platforms",icon:"📱",accent:"social",kind:"social"}
];
const moreTools = [
  ["AI Video","▶️"],["AI Image","🖼️"],["Background Remover","✂️"],["Photo Enhancer","✨"],["AI Avatar","👤"],["Voice Generator","🎙️"],["Music Generator","🎵"],["Image to Video","🎞️"],["AI Art Creator","🪄"],["Video Enhancer","📽️"],["Caption Writer","✍️"],["More tools","＋"]
];
let page = "Home";
let activeTool = null;
let messages = [];
let sessionState = "checking";
let currentUser = null;
let walletBalance = 0;
let authMode = "login";
let authNotice = "";
let pendingPhone = "";
let selectedFile = null;

try {
  const {data,error} = await supabase.auth.getSession();
  sessionState = error ? "unknown" : (data.session ? "signed-in" : "signed-out");
  currentUser = data.session?.user || null;
  if (currentUser) await loadAccountData();
  if (error) console.warn("Auth session check:",error.message);
} catch (error) {
  sessionState = "offline";
  console.warn("Supabase session unavailable:",error);
}
app.dataset.backend = "configured";
app.dataset.auth = sessionState;
supabase.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user || null;
  if (currentUser) loadAccountData();
  sessionState = currentUser ? "signed-in" : "signed-out";
  app.dataset.auth = sessionState;
  render();
});

const esc = (s) => String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toolById = id => tools.find(t=>t.id===id) || {id,name:id,desc:"AI workspace",icon:"✨",accent:"format"};
function sidebarLink(label,icon){return `<button class="side-link ${page===label&&!activeTool?"active":""}" data-page="${label}"><span class="side-ico">${icon}</span>${label}</button>`;}
function toolCard(t){return `<button class="tool-card ${t.accent}" data-tool="${t.id}"><div class="art"><span class="tool-icon">${t.icon}</span></div><h3>${t.name}</h3><p>${t.desc}</p><div class="card-foot"><span>Open workspace</span><span class="card-arrow">↗</span></div></button>`;}
function renderHome(){return `
<section class="hero">
  <div><div class="eyebrow">YOUR CREATIVE SPACE, ALL IN ONE PLACE</div><h1>What shall we <span>create</span> today?</h1><p>Design, transform and create with AI — all in one studio.</p></div>
  <div class="hero-art" aria-hidden="true"><div class="orbit"></div><div class="orb"></div><span class="spark one">✦</span><span class="spark two">✧</span></div>
</section>
<form class="chatbar" id="chat-form"><span aria-hidden="true">✧</span><input id="chat-input" placeholder="Ask magic hour anything..." aria-label="Ask magic hour anything"><button class="send" aria-label="Send message">↑</button></form>
<section><div class="section-head"><div><h2>✦ &nbsp;Your creative tools</h2><p>Choose a workspace to get started</p></div><button class="text-btn" data-page="All tools">Explore all ↗</button></div><div class="tools-grid">${tools.map(toolCard).join("")}</div></section>
<section class="more-section"><div class="section-head"><div><h2>More AI tools</h2><p>More ways to bring your ideas to life</p></div><button class="text-btn" data-page="All tools">View all ↗</button></div><div class="more-grid">${moreTools.slice(0,7).map(([n,i])=>`<button class="mini-tool" data-extra="${esc(n)}"><span>${i}</span><b>${n}</b></button>`).join("")}</div></section>
<section class="pro-banner"><div class="crown">♛</div><div class="pro-copy"><b>Upgrade to Pro</b><p>Get more credits, unlock premium tools and enjoy priority processing.</p></div><button class="pro-button" data-modal="pro">Go Pro ↗</button></section>`;}
function renderTool(){const t=toolById(activeTool);return `
<div class="section-head"><div><h1 class="page-title">${t.name}</h1><p class="page-sub">${t.desc}</p></div><button class="back-btn" data-action="back">← Back</button></div>
<div class="workspace"><div class="workspace-head"><div class="tool-icon">${t.icon}</div><div><h2>${t.name}</h2><p>Your dedicated magic hour workspace</p></div></div>
<div class="notice">This workspace is ready for its connected AI service. Generation is not enabled until the matching API is configured.</div>
<div class="upload-zone"><div style="font-size:34px">⬆</div><h3>Upload your files</h3><p>Choose a file from your device to prepare your project.</p><label for="asset-upload">Browse files</label><input id="asset-upload" type="file" accept="image/*,video/*,.pdf,.doc,.docx,.png,.jpg,.jpeg,.mp4,.mov"></div>
<div id="file-status" class="page-sub">${selectedFile?esc(selectedFile):"No file selected yet."}</div>
<button class="primary-btn" data-action="prepare">Prepare workspace</button>
</div>`;}
function renderChat(){return `<h1 class="page-title">New chat</h1><p class="page-sub">A creative assistant for your ideas.</p><div class="workspace"><div class="chat-log">${messages.length?messages.map(m=>`<div class="bubble ${m.role}">${esc(m.text)}</div>`).join(""):'<div class="bubble">Hi! I’m your magic hour assistant. Tell me what you want to make, or choose one of the creative tools on Home.</div>'}</div><form class="chatbar" id="chat-form"><span>✧</span><input id="chat-input" placeholder="Message magic hour..." aria-label="Message magic hour"><button class="send" aria-label="Send message">↑</button></form><div class="notice">The chat interface is ready. Connect your preferred AI chat API to enable live AI responses.</div></div>`;}
function renderGeneric(){const map={
"Library":["▣","Your Library","Your uploaded and generated files will appear here when storage is connected."],
"Projects":["▦","Your Projects","Keep related chats, files and creative work together."],
"Settings":["⚙","Settings","Manage your profile, preferences, notifications and account."],
"All tools":["✦","Explore all tools","Choose from the creative workspaces available in magic hour."],
"Create":["＋","Create something new","Choose a tool to start a new creative project."],
"Notifications":["♧","Notifications","You're all caught up."]
};const [icon,title,desc]=map[page]||map["All tools"];return `<div class="empty-panel"><div class="empty-icon">${icon}</div><h1 class="page-title">${title}</h1><p class="page-sub">${desc}</p>${page==="Settings"?`<div class="account-panel"><b>Signed in account</b><p>${esc(currentUser?.email||"")}</p><button class="secondary-btn" data-action="signout">Sign out</button></div>`:""}${page==="All tools"?`<div class="tools-grid">${tools.map(toolCard).join("")}</div><div class="more-grid" style="margin-top:14px">${moreTools.map(([n,i])=>`<button class="mini-tool" data-extra="${esc(n)}"><span>${i}</span><b>${n}</b></button>`).join("")}</div>`:`<button class="primary-btn" data-page="Home">Back to Home</button>`}</div>`;}
async function loadAccountData(){if(!currentUser)return;const {data,error}=await supabase.from("mh_wallets").select("balance").eq("user_id",currentUser.id).maybeSingle();if(!error&&data)walletBalance=Number(data.balance)||0;else if(error)console.warn("Wallet load:",error.message);if(currentUser)render();}
function renderAuth(){const phoneMode=authMode==="phone"||authMode==="phone-verify";app.innerHTML=`<div class="auth-screen"><div class="auth-card"><div class="brand auth-brand"><span class="brand-mark">m</span><span>magic hour<small>AI STUDIO</small></span></div><div class="eyebrow">YOUR CREATIVE SPACE STARTS HERE</div><h1>${authMode==="signup"?"Create your account":authMode==="phone-verify"?"Verify your phone":"Welcome back"}</h1><p class="auth-sub">${authMode==="signup"?"Join magic hour and keep your creative work in one place.":authMode==="phone-verify"?"Enter the one-time code sent to "+esc(pendingPhone):"Sign in to access your magic hour workspace."}</p>
${!phoneMode&&authMode==="login"?`<button class="social-auth google-auth" data-auth-google><span class="google-g">G</span> Continue with Google</button><button class="social-auth whatsapp-auth" data-auth-phone><span>◉</span> Continue with WhatsApp</button><div class="auth-divider"><span>or use email</span></div>`:""}
<form id="auth-form" class="auth-form">${authMode==="signup"?`<label>Full name<input name="name" autocomplete="name" placeholder="Your name" required></label>`:""}
${phoneMode?(authMode==="phone-verify"?`<label>Verification code<input name="otp" inputmode="numeric" autocomplete="one-time-code" placeholder="6-digit code" minlength="6" maxlength="6" required></label>`:`<label>Phone number<input name="phone" type="tel" autocomplete="tel" placeholder="+2348012345678" required></label>`):`<label>Email address<input name="email" type="email" autocomplete="email" placeholder="you@example.com" required></label>${authMode==="phone"?"":`<label>Password<input name="password" type="password" autocomplete="${authMode==="login"?"current-password":"new-password"}" minlength="8" placeholder="At least 8 characters" required></label>`}`}
<button class="primary-btn auth-submit" type="submit">${authMode==="signup"?"Create account":authMode==="phone"?"Send WhatsApp code":authMode==="phone-verify"?"Verify and sign in":"Sign in"}</button></form>
${phoneMode?`<button class="text-btn auth-switch" data-auth-mode="login">Back to email sign in</button>`:`<button class="text-btn auth-switch" data-auth-mode="${authMode==="login"?"signup":"login"}">${authMode==="login"?"New to magic hour? Create an account":"Already have an account? Sign in"}</button>`}
${authMode==="login"?`<button class="text-btn auth-reset" data-auth-reset>Forgot password?</button>`:""}<p class="auth-message" role="status">${esc(authNotice)}</p><p class="auth-legal">By continuing, you agree to use magic hour responsibly.</p></div></div>`;}

function render(){if(!currentUser){renderAuth();return;}const body=activeTool?renderTool():page==="Home"?renderHome():page==="New chat"?renderChat():renderGeneric();app.innerHTML=`
<div class="shell">
<header class="topbar"><button class="icon-btn" data-action="menu" aria-label="Toggle menu">☰</button><div class="brand"><span class="brand-mark">m</span><span>magic hour<small>AI STUDIO</small></span></div><div class="top-spacer"></div><button class="wallet" data-modal="wallet"><span class="coin">¢</span><strong>${walletBalance.toLocaleString()}</strong><span class="add-coin">+</span></button><button class="icon-btn notif" data-page="Notifications" aria-label="Notifications">♧</button><button class="icon-btn account-btn" data-action="account" aria-label="Account">☺</button></header>
<div class="layout"><aside class="sidebar"><div class="side-label">Workspace</div>${sidebarLink("Home","⌂")}${sidebarLink("New chat","✧")}${sidebarLink("Library","▣")}${sidebarLink("Projects","▦")}${sidebarLink("All tools","◈")}<div class="side-label">Account</div>${sidebarLink("Settings","⚙")}<div class="side-bottom"><b>♛ &nbsp;magic hour Pro</b><p>More credits. More creative freedom. Faster workflows.</p><button class="upgrade-mini" data-modal="pro">Explore Pro</button></div></aside>
<main class="content">${body}</main></div>
<nav class="bottom-nav"><button class="${page==="Home"&&!activeTool?"active":""}" data-page="Home"><span>⌂</span>Home</button><button class="${page==="Library"?"active":""}" data-page="Library"><span>▱</span>Library</button><button class="create-fab" data-page="Create" aria-label="Create">＋</button><button class="${page==="Projects"?"active":""}" data-page="Projects"><span>▦</span>Projects</button><button class="${page==="Settings"?"active":""}" data-page="Settings"><span>⚙</span>Settings</button></nav>
</div>`;}
function goPage(p){page=p;activeTool=null;render();window.scrollTo({top:0,behavior:"smooth"});}
function openTool(id){activeTool=id;page="Home";selectedFile=null;render();window.scrollTo({top:0,behavior:"smooth"});}
function showModal(type){const content=type==="wallet"?["Coin wallet","Your current account balance is shown in the header. Coin purchases will be enabled when a payment provider is connected."]:["magic hour Pro","Pro membership checkout is not connected yet. This preview shows where your plan and upgrade options will live."];const node=document.createElement("div");node.className="modal-backdrop";node.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><h2>${content[0]}</h2><p>${content[1]}</p><div class="modal-actions"><button class="secondary-btn" data-close>Close</button></div></div>`;node.addEventListener("click",e=>{if(e.target===node||e.target.closest("[data-close]"))node.remove();});document.body.append(node);}
function sendMessage(text){const value=text.trim();if(!value)return;messages.push({role:"user",text:value});messages.push({role:"assistant",text:"I’ve got your request. Live AI replies will be available when the chat model is connected. You can open one of the tool workspaces from Home in the meantime."});page="New chat";activeTool=null;render();}
app.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.authMode){authMode=b.dataset.authMode;authNotice="";renderAuth();return;}if(b.dataset.authGoogle){const googleButton=b;googleButton.disabled=true;googleButton.textContent="Connecting to Google…";(async()=>{try{const {data,error}=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin,skipBrowserRedirect:true}});if(error)throw error;if(!data?.url)throw new Error("Supabase did not return a Google authorization URL. Check that Google is enabled in Supabase Auth providers.");window.location.assign(data.url);}catch(error){authNotice="Google sign-in could not start: "+(error?.message||"Unknown error");renderAuth();}})();return;}if(b.dataset.authPhone){authMode="phone";authNotice="Use your full international phone number. WhatsApp delivery requires the WhatsApp messaging provider to be configured.";renderAuth();return;}if(b.dataset.authReset){const email=app.querySelector('input[name="email"]')?.value?.trim();if(!email){authNotice="Enter your email address first.";renderAuth();return;}supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin}).then(({error})=>{authNotice=error?error.message:"Password reset instructions have been sent if this email is registered.";renderAuth();});return;}if(b.dataset.action==="account"){goPage("Settings");return;}if(b.dataset.action==="signout"){supabase.auth.signOut();return;}if(b.dataset.page){goPage(b.dataset.page);return;}if(b.dataset.tool){openTool(b.dataset.tool);return;}if(b.dataset.extra){openTool(b.dataset.extra.toLowerCase().replace(/[^a-z0-9]+/g,"-"));return;}if(b.dataset.modal){showModal(b.dataset.modal);return;}if(b.dataset.action==="back"){activeTool=null;page="Home";render();return;}if(b.dataset.action==="menu"){document.querySelector(".sidebar")?.classList.toggle("show-mobile");const s=document.querySelector(".sidebar");if(s){s.style.display=s.style.display==="block"?"none":"block";s.style.position="fixed";s.style.zIndex="30";s.style.top="64px";s.style.bottom="70px";s.style.left="0";s.style.width="245px";s.style.background="#080e17";s.style.boxShadow="10px 0 35px #0009";}return;}if(b.dataset.action==="prepare"){const status=document.querySelector("#file-status");if(status)status.textContent=selectedFile?"File selected and ready for API connection.":"Choose a file first.";return;}});
app.addEventListener("submit",async e=>{if(e.target.id==="auth-form"){e.preventDefault();const fd=new FormData(e.target);const submit=e.target.querySelector("button[type=submit]");submit.disabled=true;submit.textContent="Please wait…";let result;if(authMode==="phone"){pendingPhone=String(fd.get("phone")||"").trim();result=await supabase.auth.signInWithOtp({phone:pendingPhone});if(!result.error){authMode="phone-verify";authNotice="A verification code was requested. Delivery depends on your configured SMS/WhatsApp provider.";renderAuth();return;}}else if(authMode==="phone-verify"){result=await supabase.auth.verifyOtp({phone:pendingPhone,token:String(fd.get("otp")||"").trim(),type:"sms"});}else{const email=String(fd.get("email")||"").trim();const password=String(fd.get("password")||"");if(authMode==="signup"){result=await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin,data:{full_name:String(fd.get("name")||"").trim()}}});}else{result=await supabase.auth.signInWithPassword({email,password});}}submit.disabled=false;if(result.error){authNotice=result.error.message;renderAuth();}else if(authMode==="signup"&&!result.data.session){authNotice="Account created. Check your inbox and spam folder for the confirmation email.";renderAuth();}else if(authMode==="phone"||authMode==="phone-verify"){currentUser=result.data.user||null;authNotice="";page="Home";render();}else{currentUser=result.data.user||null;authNotice="";page="Home";render();}return;}});
app.addEventListener("change",e=>{if(e.target.id==="asset-upload"&&e.target.files?.[0]){selectedFile=e.target.files[0].name;const status=document.querySelector("#file-status");if(status)status.textContent="Selected: "+selectedFile;}});
app.addEventListener("submit",e=>{if(e.target.id==="chat-form"){e.preventDefault();const input=e.target.querySelector("input");sendMessage(input.value);}});
render();