const CACHE = "pagekeep-app-v2";
const ASSETS=["./","./index.html","./styles.css","./src/app.js","./src/path-utils.mjs","./vendor/jszip.min.js","./manifest.webmanifest","./icons/icon.svg","./icons/apple-touch-icon.png"];
self.addEventListener("install",(event)=>event.waitUntil(caches.open(CACHE).then((c)=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",(event)=>event.waitUntil(Promise.all([
  caches.keys().then((keys)=>Promise.all(keys.filter((k)=>k.startsWith("pagekeep-app-")&&k!==CACHE).map((k)=>caches.delete(k)))),
  self.clients.claim()
])));
self.addEventListener("fetch",(event)=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith(new URL("./",self.registration.scope).pathname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(event.request.mode==="navigate")return (await cache.match("./index.html"))||fetch(event.request);
    const cached=await cache.match(event.request,{ignoreSearch:true});
    if(cached)return cached;
    try {const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;}
    catch{return Response.error();}
  })());
});
