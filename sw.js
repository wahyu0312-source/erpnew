self.addEventListener('install', (e)=> self.skipWaiting());
self.addEventListener('activate', (e)=> clients.claim());

const STATIC = 'static-v1';
const ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/assets/tsh.png'];

self.addEventListener('install', (event)=>{
  event.waitUntil(caches.open(STATIC).then(c=> c.addAll(ASSETS)));
});

// cache-first utk asset; network-first utk data
self.addEventListener('fetch', (event)=>{
  const url = new URL(event.request.url);
  if(url.pathname.endsWith('/exec')){
    // data: SWR
    event.respondWith((async ()=>{
      try{
        const net = await fetch(event.request);
        const cache = await caches.open('data');
        cache.put(event.request, net.clone());
        return net;
      }catch(_){
        const cache = await caches.open('data');
        const hit = await cache.match(event.request);
        if(hit) return hit;
        throw _;
      }
    })());
  }else{
    event.respondWith(caches.match(event.request).then(r=> r || fetch(event.request)));
  }
});
