/* Imagination Studio service worker: offline use + safe updates.
   VERSION is stamped by make-download.ps1, so every new build gets its own cache and the browser sees a changed sw.js. */
const VERSION = '4.14 beta';
const CACHE = 'imagination-' + VERSION;
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/studio.css', 'fonts/fonts.css', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'app.js?v=4.14-beta'];

self.addEventListener('install', e=>{
  // fetch fresh copies (bypass the browser HTTP cache) and keep them; the new worker WAITS until the user accepts the update
  e.waitUntil(caches.open(CACHE).then(c=> Promise.all(SHELL.map(u=> fetch(new Request(u, { cache:'reload' })).then(r=>{ if(r.ok) return c.put(u, r); }).catch(()=>{})))));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(ks=> Promise.all(ks.filter(k=> k.startsWith('imagination-') && k !== CACHE).map(k=> caches.delete(k)))).then(()=> self.clients.claim()));
});
self.addEventListener('message', e=>{
  if(e.data === 'skipWaiting') self.skipWaiting();
  if(e.data === 'cacheFonts') e.waitUntil(cacheFonts());
});
// quietly keep every bundled font too, so the whole app (all 777 fonts) works offline
async function cacheFonts(){
  const c = await caches.open(CACHE), css = await (await fetch('fonts/fonts.css')).text();
  const urls = [...new Set([...css.matchAll(/url\(\s*['"]?([^'")]+\.woff2?)['"]?\s*\)/g)].map(m=> new URL(m[1], new URL('fonts/fonts.css', self.registration.scope)).href))];
  const todo = []; for(const u of urls){ if(!(await c.match(u))) todo.push(u); }
  for(let i = 0; i < todo.length; i += 4) await Promise.all(todo.slice(i, i + 4).map(u=> fetch(u).then(r=>{ if(r.ok) return c.put(u, r); }).catch(()=>{})));
}
self.addEventListener('fetch', e=>{
  const req = e.request, url = new URL(req.url);
  if(req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/claude/')) return;   // never touch the Claude / save endpoints or other sites
  e.respondWith(caches.open(CACHE).then(async c=>{
    const hit = await c.match(req, { ignoreSearch:true });
    if(hit) return hit;
    try{ const r = await fetch(req); if(r.ok && r.type === 'basic') c.put(req, r.clone()); return r; }   // fonts and anything else are cached the first time they are used
    catch(err){ if(req.mode === 'navigate'){ const i = await c.match('index.html'); if(i) return i; } throw err; }
  }));
});
