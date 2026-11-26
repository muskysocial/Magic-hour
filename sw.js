const CACHE_NAME="magic-hour-pwa-v25";
const APP_SHELL=["./","./index.html","./app.css","./app.js","./api.js","./tracking-engine.js","./manifest.webmanifest","./icon.svg"].map(path=>new URL(path,self.registration.scope).href);
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET"||new URL(request.url).origin!==self.location.origin)return;
 if(request.mode==="navigate"){event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(new URL("./",self.registration.scope).href,copy));}return response;}).catch(()=>caches.match(new URL("./",self.registration.scope).href)));return;}
 event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));}return response;})));
});
self.addEventListener("push",event=>{
 let payload={};try{payload=event.data?event.data.json():{};}catch{payload={body:event.data?.text()||"Your shipment has a new update."};}
 const title=String(payload.title||payload.service_name||"Shipment update");
 const options={body:String(payload.body||payload.message||"Your shipment has a new update."),icon:new URL("./icon.svg",self.registration.scope).href,badge:new URL("./icon.svg",self.registration.scope).href,tag:String(payload.tag||"magic-hour-shipment"),renotify:true,data:{url:payload.url||new URL("./",self.registration.scope).href}};
 event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 const url=new URL(event.notification.data?.url||"./",self.registration.scope).href;
 event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(clients=>{
  for(const client of clients){if(client.url===url&&"focus" in client)return client.focus();}
  return self.clients.openWindow?self.clients.openWindow(url):undefined;
 }));
});
