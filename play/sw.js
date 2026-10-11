// service worker של אפליקציית הטריוויה: שומר את דף הפתיחה בטלפון; כל השאר מהרשת (המשחק צריך חיבור)
const CACHE='trivia-play-v1', SHELL=['./','index.html','manifest.json','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{ self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{})); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',e=>{
  const req=e.request; if(req.method!=='GET') return;
  const url=new URL(req.url); if(url.origin!==location.origin || !url.pathname.startsWith(new URL('./',self.registration.scope).pathname)) return;
  e.respondWith(fetch(req).then(res=>{ if(res.ok){ const c=res.clone(); caches.open(CACHE).then(x=>x.put(req,c)); } return res; }).catch(()=>caches.match(req,{ignoreSearch:true}).then(h=>h||caches.match('index.html'))));
});
