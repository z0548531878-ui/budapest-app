// service worker של אפליקציית הטריוויה: שומר את דף הפתיחה בטלפון; כל השאר מהרשת (המשחק צריך חיבור)
const CACHE='trivia-play-v1', SHELL=['./','index.html','manifest.json','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{ self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{})); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',e=>{
  const req=e.request; if(req.method!=='GET') return;
  const url=new URL(req.url); if(url.origin!==location.origin || !url.pathname.startsWith(new URL('./',self.registration.scope).pathname)) return;
  e.respondWith(fetch(req).then(res=>{ if(res.ok){ const c=res.clone(); caches.open(CACHE).then(x=>x.put(req,c)); } return res; }).catch(()=>caches.match(req,{ignoreSearch:true}).then(h=>h||caches.match('index.html'))));
});

// ---- התראות (Firebase Cloud Messaging, הודעות data בלבד) ----
self.addEventListener('push', e=>{
  let d={}; try{ d=e.data.json(); }catch(x){ try{ d={title:'טריוויה על גלגלים', body:e.data.text()}; }catch(y){} }
  const n=d.data||d;
  e.waitUntil(self.registration.showNotification(n.title||'טריוויה על גלגלים', {body:n.body||'', icon:'icon-192.png', badge:'icon-192.png', tag:n.tag||undefined, renotify:!!n.tag, dir:'rtl', lang:'he', data:{url:n.url||''}}));
});
self.addEventListener('notificationclick', e=>{
  e.notification.close();
  const url=new URL('./'+((e.notification.data||{}).url||''), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(cs=>{
    for(const c of cs){ if(c.url.startsWith(self.registration.scope) && 'focus' in c){ return c.navigate(url).then(w=>(w||c).focus()).catch(()=>c.focus()); } }
    return self.clients.openWindow(url);
  }));
});
