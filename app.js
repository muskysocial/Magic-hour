import { supabase } from "./api.js";

const app = document.querySelector("#app");
const tools = [
  {id:"canva",name:"Canva Me",desc:"Design and create stunning graphics",icon:"palette",accent:"canva",kind:"design"},
  {id:"headswap",name:"Image HeadSwap",desc:"Swap faces in photos",icon:"scan-face",accent:"head",kind:"image"},
  {id:"videoswap",name:"Video Face Swap",desc:"Swap faces in videos",icon:"clapperboard",accent:"video",kind:"video"},
  {id:"format",name:"Format",desc:"Convert, compress and resize files",icon:"folder-symlink",accent:"format",kind:"files"},
  {id:"social",name:"All Social Media Platform",desc:"Manage and grow across social platforms",icon:"smartphone",accent:"social",kind:"social"}
];
const moreTools = [
  ["AI Video","video"],["AI Image","image"],["Background Remover","scissors"],["Photo Enhancer","sparkles"],["AI Avatar","user-round"],["Voice Generator","mic"],["Music Generator","music"],["Image to Video","film"],["AI Art Creator","wand-sparkles"],["Video Enhancer","clapperboard"],["Caption Writer","pen-line"],["More tools","plus"]
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
let selectedAssetFile = null;
let selectedReferenceFace = null;
let selectedTargetImage = null;
let workspaceResultUrl = "";
let referencePreviewUrl = "";
let targetPreviewUrl = "";
let selectedReferenceAssetId = "";
let selectedTargetAssetId = "";
let userProjects = [];
let userAssets = [];
let walletTransactions = [];
let workspaceBusy = false;
let workspaceNotice = "";
let videoDiagnosticResult = null;
let falDiagnosticResult = null;
let currentProjectId = null;
let dismissedRecentAssetIds = new Set();

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

const iconSvg = (name,size=20) => {
  const paths = {
    palette:'<path d="M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 1.4-3.4 1.8 1.8 0 0 1 1.3-3.1H18a3 3 0 0 0 3-3c0-4.7-4-8.5-9-8.5Z"/><circle cx="7.5" cy="10" r="1"/><circle cx="10" cy="6.8" r="1"/><circle cx="15" cy="7.5" r="1"/>',
    'scan-face':'<path d="M3 7V5a2 2 0 0 1 2-2h2m10 0h2a2 2 0 0 1 2 2v2M3 17v2a2 2 0 0 0 2 2h2m10 0h2a2 2 0 0 0 2-2v-2"/><circle cx="12" cy="11" r="3"/><path d="M8 17c1-2 7-2 8 0"/>',
    clapperboard:'<path d="M4 4h16v16H4zM4 9h16M8 4l3 5m3-5 3 5"/>',
    'folder-symlink':'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3z"/><path d="M9 13h6m-3-3 3 3-3 3"/>',
    smartphone:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    video:'<rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-3v10l-4-3z"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    scissors:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8.1 8.1 12 12M14 6l-3 3m-3 3 12-6"/>',
    sparkles:'<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 11 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z"/>',
    'user-round':'<circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>',
    mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0m-7 7v5m-4 0h8"/>',
    music:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    film:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18m10-18v18M3 8h4m-4 8h4m10-8h4m-4 8h4"/>',
    'wand-sparkles':'<path d="m15 4 5 5M4 20 17 7M6 4v4m-2-2h4m9 10v4m-2-2h4"/>',
    'pen-line':'<path d="m12 20 9-9-4-4-9 9-1 5zM14 6l4 4"/>',
    plus:'<path d="M12 5v14m-7-7h14"/>',
    send:'<path d="M12 19V5m-6 6 6-6 6 6"/>' ,
    home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"/>',
    library:'<path d="M4 4h16v16H4zM8 4v16m4-12h4m-4 4h4"/>',
    grid:'<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    arrow:'<path d="M7 17 17 7M7 7h10v10"/>',
    back:'<path d="m15 18-6-6 6-6M9 12h12"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    coin:'<circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.7-1-1.7-1.5-3-1.5-1.7 0-3 1-3 2.3 0 3.4 6 1.4 6 4.5 0 1.3-1.3 2.2-3 2.2-1.3 0-2.4-.5-3.1-1.5M12 5v14"/>',
    crown:'<path d="m2 8 5 4 5-8 5 8 5-4-2 12H4z"/>',
    folder:'<path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v11H3z"/>',
    chat:'<path d="M21 11.5a8.5 8.5 0 0 1-12.7 7.4L3 20l1.1-4.3A8.5 8.5 0 1 1 21 11.5Z"/>',
    wand:'<path d="m15 4 5 5M4 20 17 7m-8-4v4m-2-2h4"/>',
    upload:'<path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4"/>',
    check:'<path d="m5 12 4 4L19 6"/>'
  };
  return '<svg class="ui-icon" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.sparkles)+'</svg>';
};
const esc = (s) => String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toolById = id => tools.find(t=>t.id===id) || {id,name:id,desc:"AI workspace",icon:"sparkles",accent:"format"};
function sidebarLink(label,icon){return `<button class="side-link ${page===label&&!activeTool?"active":""}" data-page="${label}"><span class="side-ico">${iconSvg(icon,18)}</span>${label}</button>`;}
function toolCard(t){return `<button class="tool-card ${t.accent}" data-tool="${t.id}"><div class="art"><span class="tool-icon">${iconSvg(t.icon,32)}</span></div><h3>${t.name}</h3><p>${t.desc}</p><div class="card-foot"><span>Open workspace</span><span class="card-arrow">${iconSvg("arrow",15)}</span></div></button>`;}
function renderHome(){return `
<section class="hero">
  <div><div class="eyebrow">YOUR CREATIVE SPACE, ALL IN ONE PLACE</div><h1>What shall we <span>create</span> today?</h1><p>Design, transform and create with AI — all in one studio.</p></div>
  <div class="hero-art" aria-hidden="true"><div class="orbit"></div><div class="orb"></div><span class="spark one">${iconSvg("sparkles",21)}</span><span class="spark two">${iconSvg("sparkles",16)}</span></div>
</section>
<form class="chatbar" id="chat-form"><span aria-hidden="true">${iconSvg("sparkles",18)}</span><input id="chat-input" placeholder="Ask magic hour anything..." aria-label="Ask magic hour anything"><button class="send" aria-label="Send message">${iconSvg("send",18)}</button></form>
<section><div class="section-head"><div><h2>${iconSvg("sparkles",15)} &nbsp;Your creative tools</h2><p>Choose a workspace to get started</p></div><button class="text-btn" data-page="All tools">Explore all ${iconSvg("arrow",13)}</button></div><div class="tools-grid">${tools.map(toolCard).join("")}</div></section>
<section class="more-section"><div class="section-head"><div><h2>More AI tools</h2><p>More ways to bring your ideas to life</p></div><button class="text-btn" data-page="All tools">View all ${iconSvg("arrow",13)}</button></div><div class="more-grid">${moreTools.slice(0,7).map(([n,i])=>`<button class="mini-tool" data-extra="${esc(n)}"><span>${iconSvg(i,23)}</span><b>${n}</b></button>`).join("")}</div></section>
<section class="pro-banner"><div class="crown">${iconSvg("crown",32)}</div><div class="pro-copy"><b>Upgrade to Pro</b><p>Get more credits, unlock premium tools and enjoy priority processing.</p></div><button class="pro-button" data-modal="pro">Go Pro ${iconSvg("arrow",13)}</button></section>`;}
function recentThumbs(kind,selectedId=""){
 const images=userAssets.filter(asset=>asset.mime_type?.startsWith("image/")&&asset.storage_path&&asset.signedUrl&&!dismissedRecentAssetIds.has(asset.id)).slice(0,12);
 if(!images.length)return '<p class="recent-empty">Your recently used images will appear here.</p>';
 return `<div class="recent-strip" aria-label="Recently used images">${images.map(asset=>`<div class="recent-thumb-wrap"><button type="button" class="recent-thumb ${asset.id===selectedId?"selected":""}" data-recent-${kind}="${esc(asset.id)}" aria-label="Use ${esc(asset.file_name||"recent image")}" aria-pressed="${asset.id===selectedId}"><img src="${esc(asset.signedUrl)}" alt="${esc(asset.file_name||"Recent image")}" loading="lazy">${asset.id===selectedId?'<span class="recent-check">✓</span>':""}</button><button type="button" class="recent-dismiss" data-dismiss-recent="${esc(asset.id)}" aria-label="Hide from recent images">×</button></div>`).join("")}</div>`;
}
function renderTool(){const t=toolById(activeTool);if(activeTool==="ai-video"||activeTool==="image-to-video"){const heading=activeTool==="image-to-video"?"Image to Video":"AI Video Animate";return `
<div class="section-head"><div><h1 class="page-title">${heading}</h1><p class="page-sub">Connect the Fal.ai video engine to MuskySocials.</p></div><button class="back-btn" data-action="back">← Back</button></div>
<div class="workspace"><div class="workspace-head"><div class="tool-icon">${iconSvg("video",27)}</div><div><h2>Fal.ai video engine</h2><p>Secure provider connection through Supabase</p></div></div>
<div class="notice">Your Fal.ai secret stays on the server. This check validates the key and the selected Kling image-to-video route without generating a video or spending credits.</div>
<button class="primary-btn" data-action="check-fal-access" ${workspaceBusy?"disabled":""}>${workspaceBusy?"Checking Fal.ai…":"Check Fal.ai connection"}</button>
<div id="file-status" class="page-sub">${esc(workspaceNotice||"Run the connection check to verify Fal.ai access.")}</div>
${falDiagnosticResult?`<div class="account-panel"><b>${falDiagnosticResult.connected?"Fal.ai connection verified":"Fal.ai connection needs attention"}</b><p>${esc(falDiagnosticResult.error||falDiagnosticResult.message||"")}</p>${falDiagnosticResult.connected?`<small>Model route: ${esc(falDiagnosticResult.model||"")} · ${esc(falDiagnosticResult.checkedAt||"")}</small>`:""}</div>`:""}
<p class="page-sub">Next: connect image upload, selectable duration, daily credits, premium limits and saving generated videos to your Library.</p>
</div>`;}
if(activeTool==="background-remover")return `
<div class="section-head"><div><h1 class="page-title">Background Remover</h1><p class="page-sub">Remove image backgrounds in seconds and save the transparent PNG to your Library.</p></div><button class="back-btn" data-action="back">← Back</button></div>
<div class="workspace"><div class="workspace-head"><div class="tool-icon">${iconSvg("scissors",27)}</div><div><h2>AI Background Removal</h2><p>Powered by remove.bg</p></div></div>
<div class="notice">Upload a JPG, PNG or WebP image up to 12 MB. Your original and transparent result are stored in your private Supabase Library.</div>
<div class="upload-zone"><div style="font-size:34px">${iconSvg("upload",30)}</div><h3>Choose an image</h3><p>${selectedAssetFile?esc(selectedAssetFile.name):"Select a photo to remove its background."}</p><label for="bg-upload">Browse images</label><input id="bg-upload" type="file" accept="image/jpeg,image/png,image/webp"></div>
<div id="file-status" class="page-sub">${esc(workspaceNotice||"Choose an image to get started.")}</div>
<button class="primary-btn" data-action="run-background" ${workspaceBusy||!selectedAssetFile?"disabled":""}>${workspaceBusy?"Removing background…":"Remove background"}</button>
${workspaceResultUrl?`<div class="swap-result"><h3>Transparent result</h3><img class="result-image transparent-preview" src="${esc(workspaceResultUrl)}" alt="Image with background removed"><div class="result-actions"><a class="primary-btn" href="${esc(workspaceResultUrl)}" download="background-removed.png">↓ Download PNG</a></div></div>`:""}
</div>`;
if(activeTool==="headswap")return `
<div class="section-head"><div><h1 class="page-title">Image HeadSwap</h1><p class="page-sub">Swap a face into another photo with the BFS AI engine.</p></div><button class="back-btn" data-action="back">← Back</button></div>
<div class="workspace"><div class="workspace-head"><div class="tool-icon">${iconSvg("scan-face",27)}</div><div><h2>AI Face Swap</h2><p>Upload a reference face and the photo you want to edit.</p></div></div>
<div class="notice">Your images and generated result are stored in your private Supabase library. Use photos you own or have permission to edit.</div>
<div class="swap-upload-grid">
<div class="upload-zone swap-upload-card"><div class="swap-preview">${referencePreviewUrl?`<img src="${esc(referencePreviewUrl)}" alt="Selected face preview">`:`<span>${iconSvg("user-round",27)}</span>`}</div><h3>1. Face Image</h3><p>Choose a recent face or upload a new one</p><label class="upload-new-button" for="reference-face-upload">${iconSvg("upload",14)} Upload new face</label><input id="reference-face-upload" type="file" accept="image/jpeg,image/png,image/webp" hidden><div class="recent-heading">Recently used</div>${recentThumbs("face",selectedReferenceAssetId)}<div class="swap-file-name">${selectedReferenceFace?esc(selectedReferenceFace.name):selectedReferenceAssetId?"Recent image selected":"Choose a recent image or upload new"}</div></div>
<div class="upload-zone swap-upload-card"><div class="swap-preview">${targetPreviewUrl?`<img src="${esc(targetPreviewUrl)}" alt="Selected target preview">`:`<span>${iconSvg("image",27)}</span>`}</div><h3>2. Target Image</h3><p>Choose a recent image or upload a new one</p><label class="upload-new-button" for="target-image-upload">${iconSvg("upload",14)} Upload new image</label><input id="target-image-upload" type="file" accept="image/jpeg,image/png,image/webp" hidden><div class="recent-heading">Recently used</div>${recentThumbs("target",selectedTargetAssetId)}<div class="swap-file-name">${selectedTargetImage?esc(selectedTargetImage.name):selectedTargetAssetId?"Recent image selected":"Choose a recent image or upload new"}</div></div>
</div>
<div id="file-status" class="page-sub">${esc(workspaceNotice||"Select both images to begin.")}</div>
<button class="primary-btn" data-action="run-headswap" ${workspaceBusy?"disabled":""}>${workspaceBusy?"Generating face swap…":"Generate face swap"}</button>
${workspaceResultUrl?`<div class="swap-result"><h3>Your generated image</h3><img class="result-image" src="${esc(workspaceResultUrl)}" alt="Generated face swap result" data-preview="${esc(workspaceResultUrl)}"><div class="result-actions"><button class="primary-btn" data-action="download-result">↓ Download</button><button class="secondary-btn" data-action="share-result">↗ Share</button></div></div>`:""}
</div>`;
return `
<div class="section-head"><div><h1 class="page-title">${t.name}</h1><p class="page-sub">${t.desc}</p></div><button class="back-btn" data-action="back">← Back</button></div>
<div class="workspace"><div class="workspace-head"><div class="tool-icon">${iconSvg(t.icon,27)}</div><div><h2>${t.name}</h2><p>Your dedicated magic hour workspace</p></div></div>
<div class="notice">Your account, project records and private file storage are connected. AI generation still needs its provider service to be enabled.</div>
<div class="upload-zone"><div style="font-size:34px">${iconSvg("upload",30)}</div><h3>Upload your files</h3><p>Choose a file from your device to prepare your project.</p><label for="asset-upload">Browse files</label><input id="asset-upload" type="file" accept="image/*,video/*,.pdf,.doc,.docx,.png,.jpg,.jpeg,.mp4,.mov"></div>
<div id="file-status" class="page-sub">${workspaceNotice?esc(workspaceNotice):(selectedFile?esc(selectedFile):"No file selected yet.")}</div>
<button class="primary-btn" data-action="prepare" ${workspaceBusy?"disabled":""}>${workspaceBusy?"Saving project…":"Save project and upload file"}</button>
</div>`;}
function renderChat(){return `<h1 class="page-title">New chat</h1><p class="page-sub">A creative assistant for your ideas.</p><div class="workspace"><div class="chat-log">${messages.length?messages.map(m=>`<div class="bubble ${m.role}">${esc(m.text)}</div>`).join(""):'<div class="bubble">Hi! I’m your magic hour assistant. Tell me what you want to make, or choose one of the creative tools on Home.</div>'}</div><form class="chatbar" id="chat-form"><span>${iconSvg("sparkles",18)}</span><input id="chat-input" placeholder="Message magic hour..." aria-label="Message magic hour"><button class="send" aria-label="Send message">${iconSvg("send",18)}</button></form><div class="notice">The chat interface is ready. Connect your preferred AI chat API to enable live AI responses.</div></div>`;}
function renderGeneric(){
 const map={"Library":["library","Your Library","Your private uploaded files."],"Projects":["grid","Your Projects","Your saved creative projects."],"Settings":["settings","Settings","Manage your profile and account."],"All tools":["sparkles","Explore all tools","Choose a creative workspace."],"Create":["plus","Create something new","Choose a tool to start a project."],"Notifications":["bell","Notifications","You're all caught up."]};
 const [icon,title,desc]=map[page]||map["All tools"];
 const projectsHtml=userProjects.length?userProjects.map(p=>`<button class="account-panel project-row" data-project="${p.id}"><b>${esc(p.title)}</b><p>${esc(p.tool_id)} · ${esc(p.status)} · ${new Date(p.created_at).toLocaleDateString()}</p></button>`).join(""):'<div class="notice">No projects yet. Open a tool and upload a file to create your first project.</div>';
 const assetsHtml=userAssets.length?`<div class="history-grid">${userAssets.map(a=>`<div class="history-item"><button class="history-image" data-preview="${esc(a.signedUrl||"")}" aria-label="View ${esc(a.file_name)}">${a.mime_type?.startsWith("image/")&&a.signedUrl?`<img src="${esc(a.signedUrl)}" alt="${esc(a.file_name)}" loading="lazy">`:`<span class="history-file">${iconSvg("folder",24)}</span>`}</button><span class="history-name">${esc(a.file_name)}</span><small>${new Date(a.created_at).toLocaleDateString()}</small><button class="history-delete" data-delete-asset="${a.id}" aria-label="Delete ${esc(a.file_name)}">Delete</button></div>`).join("")}</div>`:'<div class="notice">Your uploaded files will appear here.</div>';
 return `<div class="empty-panel"><div class="empty-icon">${iconSvg(icon,34)}</div><h1 class="page-title">${title}</h1><p class="page-sub">${desc}</p>
 ${page==="Settings"?`<div class="account-panel"><b>Signed in account</b><p>${esc(currentUser?.email||"")}</p><p>Wallet balance: ${walletBalance.toLocaleString()} coins</p><button class="secondary-btn" data-action="signout">Sign out</button></div>`:""}
 ${page==="Projects"?`<div class="account-list">${projectsHtml}</div>`:""}
 ${page==="Library"?`<div class="account-list">${assetsHtml}</div>`:""}
 ${page==="All tools"?`<div class="tools-grid">${tools.map(toolCard).join("")}</div><div class="more-grid" style="margin-top:14px">${moreTools.map(([n,i])=>`<button class="mini-tool" data-extra="${esc(n)}"><span>${iconSvg(i,23)}</span><b>${n}</b></button>`).join("")}</div>`:""}
 ${!["Settings","Projects","Library","All tools"].includes(page)?'<button class="primary-btn" data-page="Home">Back to Home</button>':""}</div>`;
}
async function loadAccountData(){
  if(!currentUser)return;
  const uid=currentUser.id;
  const [wallet,projects,assets,transactions]=await Promise.all([
    supabase.from("mh_wallets").select("balance").eq("user_id",uid).maybeSingle(),
    supabase.from("mh_projects").select("id,title,tool_id,status,created_at,updated_at").eq("user_id",uid).order("updated_at",{ascending:false}).limit(100),
    supabase.from("mh_assets").select("id,project_id,storage_path,file_name,mime_type,size_bytes,created_at").eq("user_id",uid).order("created_at",{ascending:false}).limit(100),
    supabase.from("mh_wallet_transactions").select("id,amount,transaction_type,description,reference,created_at").eq("user_id",uid).order("created_at",{ascending:false}).limit(50)
  ]);
  if(!wallet.error&&wallet.data)walletBalance=Number(wallet.data.balance)||0;
  else if(wallet.error)console.warn("Wallet load:",wallet.error.message);
  if(!projects.error)userProjects=projects.data||[];else console.warn("Projects load:",projects.error.message);
  if(!assets.error){userAssets=await Promise.all((assets.data||[]).map(async a=>{if(!a.mime_type?.startsWith("image/"))return a;const {data:signed}=await supabase.storage.from("magic-hour-assets").createSignedUrl(a.storage_path,3600);return {...a,signedUrl:signed?.signedUrl||""};}));}else console.warn("Assets load:",assets.error.message);
  if(!transactions.error)walletTransactions=transactions.data||[];else console.warn("Wallet history:",transactions.error.message);
  if(currentUser)render();
}
function renderAuth(){const phoneMode=authMode==="phone"||authMode==="phone-verify";app.innerHTML=`<div class="auth-screen"><div class="auth-card"><div class="brand auth-brand"><span class="brand-mark"><svg class="brand-symbol" viewBox="0 0 64 64" aria-hidden="true"><path d="M10 49V15l22 25 22-25v34" /></svg></span><span>magic hour<small>AI STUDIO</small></span></div><div class="eyebrow">YOUR CREATIVE SPACE STARTS HERE</div><h1>${authMode==="signup"?"Create your account":authMode==="phone-verify"?"Verify your phone":"Welcome back"}</h1><p class="auth-sub">${authMode==="signup"?"Join magic hour and keep your creative work in one place.":authMode==="phone-verify"?"Enter the one-time code sent to "+esc(pendingPhone):"Sign in to access your magic hour workspace."}</p>
${!phoneMode&&authMode==="login"?`<button class="social-auth google-auth" data-auth-google><span class="google-g">G</span> Continue with Google</button><button class="social-auth whatsapp-auth" data-auth-phone><span>${iconSvg("chat",19)}</span> Continue with WhatsApp</button><div class="auth-divider"><span>or use email</span></div>`:""}
<form id="auth-form" class="auth-form">${authMode==="signup"?`<label>Full name<input name="name" autocomplete="name" placeholder="Your name" required></label>`:""}
${phoneMode?(authMode==="phone-verify"?`<label>Verification code<input name="otp" inputmode="numeric" autocomplete="one-time-code" placeholder="6-digit code" minlength="6" maxlength="6" required></label>`:`<label>Phone number<input name="phone" type="tel" autocomplete="tel" placeholder="+2348012345678" required></label>`):`<label>Email address<input name="email" type="email" autocomplete="email" placeholder="you@example.com" required></label>${authMode==="phone"?"":`<label>Password<input name="password" type="password" autocomplete="${authMode==="login"?"current-password":"new-password"}" minlength="8" placeholder="At least 8 characters" required></label>`}`}
<button class="primary-btn auth-submit" type="submit">${authMode==="signup"?"Create account":authMode==="phone"?"Send WhatsApp code":authMode==="phone-verify"?"Verify and sign in":"Sign in"}</button></form>
${phoneMode?`<button class="text-btn auth-switch" data-auth-mode="login">Back to email sign in</button>`:`<button class="text-btn auth-switch" data-auth-mode="${authMode==="login"?"signup":"login"}">${authMode==="login"?"New to magic hour? Create an account":"Already have an account? Sign in"}</button>`}
${authMode==="login"?`<button class="text-btn auth-reset" data-auth-reset>Forgot password?</button>`:""}<p class="auth-message" role="status">${esc(authNotice)}</p><p class="auth-legal">By continuing, you agree to use magic hour responsibly.</p></div></div>`;const googleButton=app.querySelector("[data-auth-google]");if(googleButton){googleButton.addEventListener("click",async event=>{event.preventDefault();event.stopPropagation();googleButton.disabled=true;googleButton.textContent="Connecting to Google…";authNotice="";try{const {data,error}=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:"https://magichour-black.vercel.app",skipBrowserRedirect:true}});if(error)throw error;if(!data?.url)throw new Error("No Google authorization URL was returned. Confirm Google is enabled in Supabase Auth → Providers.");window.location.href=data.url;}catch(error){authNotice="Google sign-in failed: "+(error?.message||String(error));renderAuth();}});}}

function render(){if(!currentUser){renderAuth();return;}const body=activeTool?renderTool():page==="Home"?renderHome():page==="New chat"?renderChat():renderGeneric();app.innerHTML=`
<div class="shell">
<header class="topbar"><button class="icon-btn" data-action="menu" aria-label="Toggle menu">${iconSvg("menu",19)}</button><div class="brand"><span class="brand-mark"><svg class="brand-symbol" viewBox="0 0 64 64" aria-hidden="true"><path d="M10 49V15l22 25 22-25v34" /></svg></span><span>magic hour<small>AI STUDIO</small></span></div><div class="top-spacer"></div><button class="install-app" id="install-app" hidden>Install app</button><button class="wallet" data-modal="wallet"><span class="coin">${iconSvg("coin",17)}</span><strong>${walletBalance.toLocaleString()}</strong><span class="add-coin">+</span></button><button class="icon-btn notif" data-page="Notifications" aria-label="Notifications">${iconSvg("bell",18)}</button><button class="icon-btn account-btn" data-action="account" aria-label="Account">${iconSvg("user",19)}</button></header>
<div class="layout"><aside class="sidebar"><div class="side-label">Workspace</div>${sidebarLink("Home","home")}${sidebarLink("New chat","chat")}${sidebarLink("Library","library")}${sidebarLink("Projects","grid")}${sidebarLink("All tools","sparkles")}<div class="side-label">Account</div>${sidebarLink("Settings","settings")}<div class="side-bottom"><b>${iconSvg("crown",15)} &nbsp;magic hour Pro</b><p>More credits. More creative freedom. Faster workflows.</p><button class="upgrade-mini" data-modal="pro">Explore Pro</button></div></aside>
<main class="content">${body}</main></div>
<nav class="bottom-nav"><button class="${page==="Home"&&!activeTool?"active":""}" data-page="Home"><span>${iconSvg("home",18)}</span>Home</button><button class="${page==="Library"?"active":""}" data-page="Library"><span>${iconSvg("library",18)}</span>Library</button><button class="create-fab" data-page="Create" aria-label="Create">＋</button><button class="${page==="Projects"?"active":""}" data-page="Projects"><span>${iconSvg("grid",18)}</span>Projects</button><button class="${page==="Settings"?"active":""}" data-page="Settings"><span>${iconSvg("settings",18)}</span>Settings</button></nav>
</div>`;}
function goPage(p){page=p;activeTool=null;render();window.scrollTo({top:0,behavior:"smooth"});}
function openTool(id){activeTool=id;page="Home";selectedFile=null;selectedAssetFile=null;selectedReferenceFace=null;selectedTargetImage=null;workspaceResultUrl="";currentProjectId=null;workspaceNotice="";render();window.scrollTo({top:0,behavior:"smooth"});}
function showModal(type){
 const node=document.createElement("div");node.className="modal-backdrop";
 const rows=walletTransactions.length?walletTransactions.map(t=>`<div class="account-panel"><b>${esc(t.transaction_type)} · ${Number(t.amount).toLocaleString()} coins</b><p>${esc(t.description||"Wallet activity")} · ${new Date(t.created_at).toLocaleString()}</p></div>`).join(""):'<p>No wallet transactions yet.</p>';
 const body=type==="wallet"?`<h2>Coin wallet</h2><p>Available balance: <b>${walletBalance.toLocaleString()} coins</b></p><div class="account-list">${rows}</div><p class="notice">Paystack checkout is not yet active on the backend. No payment will be requested until the secure Paystack function and your coin pricing are configured.</p>`:`<h2>Magic Hour Pro</h2><p>Membership checkout will be enabled after the secure Paystack connection and plan pricing are configured.</p>`;
 node.innerHTML=`<div class="modal" role="dialog" aria-modal="true">${body}<div class="modal-actions"><button class="secondary-btn" data-close>Close</button></div></div>`;
 node.addEventListener("click",e=>{if(e.target===node||e.target.closest("[data-close]"))node.remove();});document.body.append(node);
}
function sendMessage(text){const value=text.trim();if(!value)return;messages.push({role:"user",text:value});messages.push({role:"assistant",text:"I’ve got your request. Live AI replies will be available when the chat model is connected. You can open one of the tool workspaces from Home in the meantime."});page="New chat";activeTool=null;render();}
app.addEventListener("click",async e=>{const b=e.target.closest("button");if(!b)return;
if(b.dataset.dismissRecent){dismissedRecentAssetIds.add(b.dataset.dismissRecent);render();return;}
if(b.dataset.recentFace||b.dataset.recentTarget){const assetId=b.dataset.recentFace||b.dataset.recentTarget;const asset=userAssets.find(a=>a.id===assetId);if(!asset)return;if(b.dataset.recentFace){selectedReferenceAssetId=assetId;selectedReferenceFace=null;if(referencePreviewUrl)URL.revokeObjectURL(referencePreviewUrl);referencePreviewUrl=asset.signedUrl||"";workspaceNotice="Recent face image selected.";}else{selectedTargetAssetId=assetId;selectedTargetImage=null;if(targetPreviewUrl)URL.revokeObjectURL(targetPreviewUrl);targetPreviewUrl=asset.signedUrl||"";workspaceNotice="Recent target image selected.";}render();return;}if(b.dataset.authMode){authMode=b.dataset.authMode;authNotice="";renderAuth();return;}if(b.dataset.authGoogle){const googleButton=b;googleButton.disabled=true;googleButton.textContent="Connecting to Google…";(async()=>{try{const {data,error}=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:"https://magichour-black.vercel.app",skipBrowserRedirect:true}});if(error)throw error;if(!data?.url)throw new Error("Supabase did not return a Google authorization URL. Check that Google is enabled in Supabase Auth providers.");window.location.assign(data.url);}catch(error){authNotice="Google sign-in could not start: "+(error?.message||"Unknown error");renderAuth();}})();return;}if(b.dataset.authPhone){authMode="phone";authNotice="Use your full international phone number. WhatsApp delivery requires the WhatsApp messaging provider to be configured.";renderAuth();return;}if(b.dataset.authReset){const email=app.querySelector('input[name="email"]')?.value?.trim();if(!email){authNotice="Enter your email address first.";renderAuth();return;}supabase.auth.resetPasswordForEmail(email,{redirectTo:"https://magichour-black.vercel.app"}).then(({error})=>{authNotice=error?error.message:"Password reset instructions have been sent if this email is registered.";renderAuth();});return;}if(b.dataset.action==="account"){goPage("Settings");return;}if(b.dataset.action==="signout"){supabase.auth.signOut();return;}if(b.dataset.page){goPage(b.dataset.page);return;}if(b.dataset.tool){openTool(b.dataset.tool);return;}if(b.dataset.project){const p=userProjects.find(x=>x.id===b.dataset.project);if(p){activeTool=p.tool_id;page="Home";currentProjectId=p.id;workspaceNotice="Project opened. Upload a file to add it to this project.";render();}return;}if(b.dataset.action==="download-result"||b.dataset.action==="share-result"){
 const mode=b.dataset.action==="download-result"?"download":"share";const url=workspaceResultUrl;
 if(!url){alert("The generated image is not available.");return;}
 try{const response=await fetch(url);if(!response.ok)throw new Error("Could not retrieve the generated image.");const blob=await response.blob();const file=new File([blob],"musky-headswap-result.png",{type:blob.type||"image/png"});
 if(mode==="download"){const objectUrl=URL.createObjectURL(blob);const link=document.createElement("a");link.href=objectUrl;link.download="musky-headswap-result.png";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),1500);}
 else if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:"My HeadSwap result",text:"Created with MuskySocials AI Studio"});}
 else if(navigator.share){await navigator.share({title:"My HeadSwap result",text:"My HeadSwap result",url});}
 else{await navigator.clipboard.writeText(url);alert("Share link copied. You can paste it into WhatsApp, Zangi or another app.");}
 }catch(error){if(error?.name!=="AbortError")alert((mode==="download"?"Download":"Share")+" failed: "+(error?.message||String(error)));}
 return;
}
if(b.dataset.deleteAsset){const asset=userAssets.find(a=>a.id===b.dataset.deleteAsset);if(!asset)return;if(!confirm(`Delete "${asset.file_name}" from your history and private library? This cannot be undone.`))return;b.disabled=true;b.textContent="Deleting…";try{const {error:storageError}=await supabase.storage.from("magic-hour-assets").remove([asset.storage_path]);if(storageError)throw storageError;const {error:rowError}=await supabase.from("mh_assets").delete().eq("id",asset.id).eq("user_id",currentUser.id);if(rowError)throw rowError;if(selectedReferenceAssetId===asset.id){selectedReferenceAssetId="";referencePreviewUrl="";}if(selectedTargetAssetId===asset.id){selectedTargetAssetId="";targetPreviewUrl="";}await loadAccountData();}catch(error){alert("Could not delete this image: "+(error?.message||String(error)));b.disabled=false;b.textContent="Delete";}return;}
if(b.dataset.preview){const url=b.dataset.preview;const viewer=document.createElement("div");viewer.className="image-lightbox";viewer.innerHTML='<button class="lightbox-close" aria-label="Close">×</button><img alt="Preview">';viewer.querySelector("img").src=url;viewer.addEventListener("click",event=>{if(event.target===viewer||event.target.closest(".lightbox-close"))viewer.remove();});document.body.appendChild(viewer);return;}
if(b.dataset.asset){const a=userAssets.find(x=>x.id===b.dataset.asset);if(a){supabase.storage.from("magic-hour-assets").createSignedUrl(a.storage_path,3600).then(({data,error})=>{if(error){alert("Could not open file: "+error.message);return;}window.open(data.signedUrl,"_blank","noopener");});}return;}if(b.dataset.extra){openTool(b.dataset.extra.toLowerCase().replace(/[^a-z0-9]+/g,"-"));return;}if(b.dataset.modal){showModal(b.dataset.modal);return;}if(b.dataset.action==="back"){activeTool=null;page="Home";videoDiagnosticResult=null;falDiagnosticResult=null;render();return;}if(b.dataset.action==="check-fal-access"){
  workspaceBusy=true;workspaceNotice="Checking Fal.ai securely…";falDiagnosticResult=null;render();
  try{
   const {data,error}=await supabase.functions.invoke("fal-video-diagnostics",{body:{}});
   if(error)throw error;
   falDiagnosticResult=data||{ok:false,connected:false,error:"Fal.ai returned an empty response."};
   workspaceNotice=falDiagnosticResult.connected?"Fal.ai connection verified. No video was generated.":(falDiagnosticResult.error||"Fal.ai connection could not be verified.");
  }catch(error){falDiagnosticResult={ok:false,connected:false,error:error?.message||String(error)};workspaceNotice="Fal.ai check failed: "+falDiagnosticResult.error;}
  finally{workspaceBusy=false;render();}
  return;
 }
 if(b.dataset.action==="menu"){document.querySelector(".sidebar")?.classList.toggle("show-mobile");const s=document.querySelector(".sidebar");if(s){s.style.display=s.style.display==="block"?"none":"block";s.style.position="fixed";s.style.zIndex="30";s.style.top="64px";s.style.bottom="70px";s.style.left="0";s.style.width="245px";s.style.background="#080e17";s.style.boxShadow="10px 0 35px #0009";}return;}if(b.dataset.action==="run-background"){
 if(!selectedAssetFile){workspaceNotice="Choose an image first.";render();return;}
 const allowed=["image/jpeg","image/png","image/webp"];
 if(!allowed.includes(selectedAssetFile.type)){workspaceNotice="Use a JPG, PNG or WebP image.";render();return;}
 if(selectedAssetFile.size>12*1024*1024){workspaceNotice="This image is larger than 12 MB. Please choose a smaller image.";render();return;}
 workspaceBusy=true;workspaceResultUrl="";workspaceNotice="Uploading your image securely…";render();
 let uploadedPath="";
 try{
  let projectId=currentProjectId;
  if(!projectId){
   const {data:project,error:projectError}=await supabase.from("mh_projects").insert({user_id:currentUser.id,title:"Background Removal "+new Date().toLocaleString(),tool_id:"background-remover",status:"processing",metadata:{provider:"remove.bg"}}).select("id").single();
   if(projectError)throw projectError;
   projectId=project.id;currentProjectId=projectId;
  }else{
   const {error:projectError}=await supabase.from("mh_projects").update({status:"processing",updated_at:new Date().toISOString()}).eq("id",projectId).eq("user_id",currentUser.id);
   if(projectError)throw projectError;
  }
  const safeName=selectedAssetFile.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  uploadedPath=currentUser.id+"/"+projectId+"/"+Date.now()+"-original-"+safeName;
  const {error:uploadError}=await supabase.storage.from("magic-hour-assets").upload(uploadedPath,selectedAssetFile,{contentType:selectedAssetFile.type,upsert:false});
  if(uploadError)throw uploadError;
  const {error:assetError}=await supabase.from("mh_assets").insert({user_id:currentUser.id,project_id:projectId,storage_path:uploadedPath,file_name:selectedAssetFile.name,mime_type:selectedAssetFile.type,size_bytes:selectedAssetFile.size});
  if(assetError){await supabase.storage.from("magic-hour-assets").remove([uploadedPath]);throw assetError;}
  workspaceNotice="Removing the background with remove.bg…";render();
  const {data,error}=await supabase.functions.invoke("remove-background",{body:{storagePath:uploadedPath,projectId}});
  if(error)throw error;
  if(!data?.ok)throw new Error(data?.error||"The background-removal service did not return a result.");
  workspaceResultUrl=data.signedUrl||"";
  if(!workspaceResultUrl&&data.asset?.storage_path){
   const {data:signed,error:signedError}=await supabase.storage.from("magic-hour-assets").createSignedUrl(data.asset.storage_path,3600);
   if(signedError)throw signedError;
   workspaceResultUrl=signed?.signedUrl||"";
  }
  if(!workspaceResultUrl)throw new Error("The result was saved but could not be opened. Check your Library.");
  selectedAssetFile=null;selectedFile=null;workspaceNotice="Background removed! Your transparent PNG is saved in your private Library.";
  await loadAccountData();
 }catch(error){
  workspaceNotice="Background removal failed: "+(error?.message||String(error));
  if(currentProjectId)await supabase.from("mh_projects").update({status:"failed",updated_at:new Date().toISOString()}).eq("id",currentProjectId).eq("user_id",currentUser.id);
  await loadAccountData();
 }finally{workspaceBusy=false;render();}
 return;
}
if(b.dataset.action==="run-headswap"){
 if((!selectedReferenceFace&&!selectedReferenceAssetId)||(!selectedTargetImage&&!selectedTargetAssetId)){workspaceNotice="Choose a face image and a body image, either by uploading or selecting recent images.";render();return;}
 if(!currentUser){workspaceNotice="Please sign in again.";render();return;}
 const allowed=["image/jpeg","image/png","image/webp"];
 if(selectedReferenceFace&&!allowed.includes(selectedReferenceFace.type)||selectedTargetImage&&!allowed.includes(selectedTargetImage.type)){workspaceNotice="Use JPG, PNG or WebP images.";render();return;}
 if(selectedReferenceFace?.size>100*1024*1024||selectedTargetImage?.size>100*1024*1024){workspaceNotice="Each image must be smaller than 100 MB.";render();return;}
 workspaceBusy=true;workspaceResultUrl="";workspaceNotice="Uploading your images securely…";render();
 let uploadedPaths=[];
 try{
  let projectId=currentProjectId;
  if(!projectId){
   const {data:project,error:projectError}=await supabase.from("mh_projects").insert({user_id:currentUser.id,title:"Face Swap "+new Date().toLocaleString(),tool_id:"headswap",status:"processing",metadata:{provider:"bfs-best-face-swap"}}).select("id").single();
   if(projectError)throw projectError;
   projectId=project.id;currentProjectId=projectId;
  }else{
   const {error:projectError}=await supabase.from("mh_projects").update({status:"processing",updated_at:new Date().toISOString()}).eq("id",projectId).eq("user_id",currentUser.id);
   if(projectError)throw projectError;
  }
  const uploadOne=async(file,role)=>{
   const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
   const path=currentUser.id+"/"+projectId+"/"+Date.now()+"-"+role+"-"+safeName;
   const {error:uploadError}=await supabase.storage.from("magic-hour-assets").upload(path,file,{contentType:file.type,upsert:false});
   if(uploadError)throw uploadError;
   uploadedPaths.push(path);
   const {error:assetError}=await supabase.from("mh_assets").insert({user_id:currentUser.id,project_id:projectId,storage_path:path,file_name:file.name,mime_type:file.type,size_bytes:file.size});
   if(assetError)throw assetError;
   return path;
  };
  workspaceNotice="Sending images to the BFS face-swap engine…";render();
  const recentAssetPath=assetId=>{const asset=userAssets.find(a=>a.id===assetId);if(!asset)throw new Error("A selected recent image is no longer available. Please choose it again.");return asset.storage_path;};
  const referencePath=selectedReferenceFace?await uploadOne(selectedReferenceFace,"reference-face"):recentAssetPath(selectedReferenceAssetId);
  const targetPath=selectedTargetImage?await uploadOne(selectedTargetImage,"target-photo"):recentAssetPath(selectedTargetAssetId);
  const {data,error}=await supabase.functions.invoke("bfs-face-swap",{body:{referencePath,targetPath,projectId}});
  if(error)throw error;
  if(!data?.ok)throw new Error(data?.error||"The face-swap provider did not return a result.");
  workspaceResultUrl=data.signedUrl||"";
  if(!workspaceResultUrl&&data.asset?.storage_path){
   const {data:signed,error:signedError}=await supabase.storage.from("magic-hour-assets").createSignedUrl(data.asset.storage_path,3600);
   if(signedError)throw signedError;
   workspaceResultUrl=signed?.signedUrl||"";
  }
  selectedReferenceFace=null;selectedTargetImage=null;selectedReferenceAssetId="";selectedTargetAssetId="";if(referencePreviewUrl)URL.revokeObjectURL(referencePreviewUrl);if(targetPreviewUrl)URL.revokeObjectURL(targetPreviewUrl);referencePreviewUrl="";targetPreviewUrl="";
  workspaceNotice="Face swap completed. Your result has been saved to your private Library.";
  await loadAccountData();
 }catch(error){
  workspaceNotice="Face swap failed: "+(error?.message||String(error));
  if(currentProjectId)await supabase.from("mh_projects").update({status:"failed",updated_at:new Date().toISOString()}).eq("id",currentProjectId).eq("user_id",currentUser.id);
  await loadAccountData();
 }finally{workspaceBusy=false;render();}
 return;
}
if(b.dataset.action==="prepare"){
 if(!selectedAssetFile){workspaceNotice="Choose a file first.";render();return;}
 if(!currentUser){workspaceNotice="Please sign in again.";render();return;}
 if(selectedAssetFile.size>100*1024*1024){workspaceNotice="File exceeds the 100 MB storage limit.";render();return;}
 workspaceBusy=true;workspaceNotice="Creating project and uploading securely…";render();
 try{
  const safeName=selectedAssetFile.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  let projectId=currentProjectId;
  if(!projectId){
   const {data:project,error:projectError}=await supabase.from("mh_projects").insert({user_id:currentUser.id,title:safeName.replace(/\.[^.]+$/,""),tool_id:activeTool||"general",status:"draft",metadata:{source:"web-app"}}).select("id").single();
   if(projectError)throw projectError;
   projectId=project.id;currentProjectId=projectId;
  }
  const storagePath=currentUser.id+"/"+projectId+"/"+Date.now()+"-"+safeName;
  const {error:uploadError}=await supabase.storage.from("magic-hour-assets").upload(storagePath,selectedAssetFile,{contentType:selectedAssetFile.type||"application/octet-stream",upsert:false});
  if(uploadError)throw uploadError;
  const {error:assetError}=await supabase.from("mh_assets").insert({user_id:currentUser.id,project_id:projectId,storage_path:storagePath,file_name:selectedAssetFile.name,mime_type:selectedAssetFile.type||null,size_bytes:selectedAssetFile.size});
  if(assetError){await supabase.storage.from("magic-hour-assets").remove([storagePath]);throw assetError;}
  selectedAssetFile=null;selectedFile=null;workspaceNotice="Project saved and file uploaded to your private Supabase storage.";await loadAccountData();workspaceBusy=false;render();
 }catch(error){workspaceBusy=false;workspaceNotice="Could not save project: "+(error?.message||String(error));render();}
 return;
}});
app.addEventListener("submit",async e=>{if(e.target.id==="auth-form"){e.preventDefault();const fd=new FormData(e.target);const submit=e.target.querySelector("button[type=submit]");submit.disabled=true;submit.textContent="Please wait…";let result;if(authMode==="phone"){pendingPhone=String(fd.get("phone")||"").trim();result=await supabase.auth.signInWithOtp({phone:pendingPhone});if(!result.error){authMode="phone-verify";authNotice="A verification code was requested. Delivery depends on your configured SMS/WhatsApp provider.";renderAuth();return;}}else if(authMode==="phone-verify"){result=await supabase.auth.verifyOtp({phone:pendingPhone,token:String(fd.get("otp")||"").trim(),type:"sms"});}else{const email=String(fd.get("email")||"").trim();const password=String(fd.get("password")||"");if(authMode==="signup"){result=await supabase.auth.signUp({email,password,options:{emailRedirectTo:"https://magichour-black.vercel.app",data:{full_name:String(fd.get("name")||"").trim()}}});}else{result=await supabase.auth.signInWithPassword({email,password});}}submit.disabled=false;if(result.error){authNotice=result.error.message;renderAuth();}else if(authMode==="signup"&&!result.data.session){authNotice="Account created. Check your inbox and spam folder for the confirmation email.";renderAuth();}else if(authMode==="phone"||authMode==="phone-verify"){currentUser=result.data.user||null;authNotice="";page="Home";render();}else{currentUser=result.data.user||null;authNotice="";page="Home";render();}return;}});
app.addEventListener("change",e=>{if(e.target.id==="reference-face-upload"&&e.target.files?.[0]){selectedReferenceFace=e.target.files[0];selectedReferenceAssetId="";if(referencePreviewUrl)URL.revokeObjectURL(referencePreviewUrl);referencePreviewUrl=URL.createObjectURL(selectedReferenceFace);workspaceNotice="Face image selected. Now choose the body image.";render();return;}if(e.target.id==="target-image-upload"&&e.target.files?.[0]){selectedTargetImage=e.target.files[0];selectedTargetAssetId="";if(targetPreviewUrl)URL.revokeObjectURL(targetPreviewUrl);targetPreviewUrl=URL.createObjectURL(selectedTargetImage);workspaceNotice="Body image selected. Ready when both images are selected.";render();return;}if(e.target.id==="bg-upload"&&e.target.files?.[0]){selectedAssetFile=e.target.files[0];selectedFile=selectedAssetFile.name;workspaceResultUrl="";workspaceNotice="Image selected. Ready to remove its background.";render();return;}if(e.target.id==="asset-upload"&&e.target.files?.[0]){selectedAssetFile=e.target.files[0];selectedFile=e.target.files[0].name;const status=document.querySelector("#file-status");if(status)status.textContent="Selected: "+selectedFile;}});
app.addEventListener("submit",e=>{if(e.target.id==="chat-form"){e.preventDefault();const input=e.target.querySelector("input");sendMessage(input.value);}});
// Progressive Web App setup and Android install prompt
let deferredInstallPrompt=null;
window.addEventListener("beforeinstallprompt",event=>{
 event.preventDefault();
 deferredInstallPrompt=event;
 const button=document.getElementById("install-app");
 if(button)button.hidden=false;
});
window.addEventListener("appinstalled",()=>{
 deferredInstallPrompt=null;
 const button=document.getElementById("install-app");
 if(button)button.hidden=true;
});
document.addEventListener("click",async event=>{
 const button=event.target.closest("#install-app");
 if(!button)return;
 if(!deferredInstallPrompt){
  alert("To install MuskySocials, open this site in Chrome, tap the three-dot menu, then choose Install app or Add to Home screen.");
  return;
 }
 deferredInstallPrompt.prompt();
 await deferredInstallPrompt.userChoice;
 deferredInstallPrompt=null;
 button.hidden=true;
});
if("serviceWorker" in navigator){
 window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(error=>console.warn("PWA service worker:",error)));
}

render();
