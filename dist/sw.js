const CACHE='eng-gustavo-g-r16';
const CORE=['./','./index.html','./style.css','./ui-polish-r15.css','./app.js','./manifest.webmanifest','./app-icon.svg'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return;
  event.respondWith(fetch(req).then(res=>{
    const copy=res.clone();
    if(res.ok) caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});
    return res;
  }).catch(()=>caches.match(req).then(hit=>hit||caches.match('./index.html'))));
});
