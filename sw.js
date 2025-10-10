self.addEventListener('install', e=> self.skipWaiting());
self.addEventListener('activate', e=> clients.claim());

const STATIC = 'static-v1';
const ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/assets/tsh.png'];
self.addEventListener('install', e=>{
  e.waitUntil(caches.open(STATIC).then(c=> c.addAll(ASSETS)));
});
self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);
  if(url.pathname.endsWith('/exec')){
    e.respondWith((async ()=>{
      try{
        const net=await fetch(e.request); const cache=await caches.open('data'); cache.put(e.request, net.clone()); return net;
      }catch(_){ const cache=await caches.open('data'); const hit=await cache.match(e.request); if(hit) return hit; throw _; }
    })());
  }else{
    e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request)));
  }
});
