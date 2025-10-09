/* =========================================================
 * sw.js — Service Worker
 * ========================================================= */
const SW_VERSION = 'tsh-erp-v5';
const ASSET_CACHE = SW_VERSION+'-assets';
const CORE = ['./','./index.html','./style.css','./app.js','https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css','https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js','https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(ASSET_CACHE).then(c=>c.addAll(CORE)));
  self.skipWaiting();
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>!k.startsWith(SW_VERSION)).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',e=>{
  const url = new URL(e.request.url);
  if(url.origin===location.origin){
    e.respondWith(caches.match(e.request).then(res=>res||fetch(e.request)));
  }else{
    e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
  }
});
