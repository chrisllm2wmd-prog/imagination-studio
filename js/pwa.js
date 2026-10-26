/* Imagination Studio - installable app (PWA): registers the service worker, offers Install, and shows "update ready" instead of silently swapping files mid-design. */
(function(){
'use strict';
// only on a real web host (https) - or add ?pwa=1 to the address to try it on localhost. The local .bat version never caches, so it never goes stale while you edit.
const on = location.protocol === 'https:' || /[?&]pwa=1\b/.test(location.search);
if(!on || !('serviceWorker' in navigator)) return;
const bar = (html, btns)=>{
  let b = document.getElementById('pwaBar'); if(!b){ b = document.createElement('div'); b.id = 'pwaBar'; b.style.cssText = 'position:fixed;left:50%;bottom:34px;transform:translateX(-50%);z-index:99999;background:#1b2036;color:#e8ecff;border:1px solid #5b8cff;border-radius:10px;padding:9px 14px;font:13px system-ui,sans-serif;display:flex;gap:12px;align-items:center;box-shadow:0 6px 24px #0008'; document.body.appendChild(b); }
  b.innerHTML = '<span>' + html + '</span>'; (btns || []).forEach(x=>{ const k = document.createElement('button'); k.textContent = x[0]; k.style.cssText = 'background:#5b8cff;color:#fff;border:0;border-radius:6px;padding:5px 12px;cursor:pointer;font:inherit'; k.onclick = x[1]; b.appendChild(k); });
  return b;
};
const hide = ()=>{ const b = document.getElementById('pwaBar'); if(b) b.remove(); };
let reloading = false;
navigator.serviceWorker.addEventListener('controllerchange', ()=>{ if(reloading) return; reloading = true; location.reload(); });
function updateReady(w){ bar('A new version of Imagination Studio is ready.', [['Update now', ()=>{ w.postMessage('skipWaiting'); }], ['Later', hide]]); }
navigator.serviceWorker.register('sw.js').then(reg=>{
  navigator.serviceWorker.ready.then(r=>{ if(r.active) setTimeout(()=> r.active.postMessage('cacheFonts'), 8000); });   // after the app has settled
  if(reg.waiting && navigator.serviceWorker.controller) updateReady(reg.waiting);
  reg.addEventListener('updatefound', ()=>{ const w = reg.installing; if(!w) return; w.addEventListener('statechange', ()=>{ if(w.state === 'installed' && navigator.serviceWorker.controller) updateReady(w); }); });
  setInterval(()=>{ reg.update().catch(()=>{}); }, 60 * 60 * 1000);   // look for a new version hourly while the app stays open
}).catch(e=> console.warn('Offline mode unavailable', e));
// install button
let deferred = null;
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferred = e; const sb = document.getElementById('statusbar'); if(!sb || document.getElementById('pwaInstall')) return; const i = document.createElement('button'); i.id = 'pwaInstall'; i.textContent = 'Install app'; i.title = 'Install Imagination Studio as an app (works offline)'; i.style.cssText = 'background:none;border:1px solid var(--dim);color:var(--dim);border-radius:5px;font-size:11px;padding:1px 8px;margin-left:8px;cursor:pointer'; i.onclick = async ()=>{ deferred.prompt(); await deferred.userChoice; deferred = null; i.remove(); }; sb.appendChild(i); });
window.addEventListener('appinstalled', ()=>{ const i = document.getElementById('pwaInstall'); if(i) i.remove(); });
})();
