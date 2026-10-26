/* Imagination Studio - installable app (PWA): registers the service worker, runs the Install buttons + "get the app" prompt, and shows
   "update ready" instead of silently swapping files mid-design. */
(function(){
'use strict';
const MS = window.MS;
// only on a real web host (https) - or add ?pwa=1 to the address to try it on localhost. The local .bat version never caches, so it never goes stale while you edit.
const web = location.protocol === 'https:' || /[?&]pwa=1\b/.test(location.search);
const standalone = ()=> matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true;
let deferred = null, installedNow = false;
const offer = ()=> web && !standalone() && !installedNow && 'serviceWorker' in navigator;
const store = MS && MS.store || { get:(k, d)=> d, set(){} };

MS.pwa = { offer, installed:()=> standalone() || installedNow, install:()=> installClick(), maybePrompt:()=> maybePrompt(), refresh:()=> sync() };

/* ---------- how to install on browsers that cannot do it with one click ---------- */
function steps(){
  const ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if(ios) return 'Tap the <b>Share</b> button, then <b>Add to Home Screen</b>.';
  if(/Firefox\//.test(ua)) return 'Firefox cannot install web apps on desktop. Open this page in <b>Chrome</b> or <b>Edge</b> to install it.';
  if(/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua)) return 'In Safari choose <b>File ▸ Add to Dock</b>.';
  return 'Click the <b>install icon</b> at the right end of the address bar (a small screen with a down arrow), or open the browser menu (⋮) and choose <b>Install Imagination Studio</b>.';
}
async function installClick(){
  if(deferred){ const e = deferred; deferred = null; e.prompt(); const r = await e.userChoice.catch(()=> null); if(r && r.outcome === 'accepted') installedNow = true; sync(); return; }
  MS.modal({ title:'Install Imagination Studio', med:true, body:'<div style="line-height:1.6">' + steps() + '</div><div class="hint" style="margin-top:10px">Once installed it opens in its own window, works offline and updates itself.</div>', buttons:[{ label:'OK', primary:true }] });
}

/* ---------- the buttons (editor top bar + title screen) ---------- */
function sync(){
  const show = offer();
  const top = document.getElementById('btnInstall'); if(top){ top.style.display = show ? '' : 'none'; top.onclick = installClick; }
  const sp = document.getElementById('spInstall'); if(sp){ sp.style.display = show ? '' : 'none'; sp.onclick = e=>{ e.stopPropagation(); installClick(); }; }
}
MS.pwaSync = sync;
document.addEventListener('DOMContentLoaded', sync);
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferred = e; sync(); });
window.addEventListener('appinstalled', ()=>{ installedNow = true; deferred = null; sync(); if(MS.toast) MS.toast('Installed! You can open Imagination Studio from your Start menu or desktop.', 6000); });
matchMedia('(display-mode: standalone)').addEventListener && matchMedia('(display-mode: standalone)').addEventListener('change', sync);

/* ---------- the "get the app" prompt ---------- */
function maybePrompt(){
  if(!offer() || MS.pwa._shown) return;
  if(store.get('pwaNever', false) || store.get('pwaSnooze', 0) > Date.now()) return;
  MS.pwa._shown = true;
  const li = (b, t)=> '<li style="margin:9px 0"><b>' + b + '</b> ' + t + '</li>';
  MS.modal({ title:'Get Imagination Studio as an app', med:true, sticky:true,
    body:'<div style="font-size:14px;line-height:1.55">Install it once and it lives on your computer like any other program:</div>' +
      '<ul style="margin:10px 0 4px;padding-left:20px;font-size:13.5px;line-height:1.5">' +
      li('Always up to date.', 'New features and fixes arrive automatically. When one is ready you just click <i>Update now</i>.') +
      li('Improving all the time.', 'New tools, effects and animation features are added regularly, and installing is how you keep getting them.') +
      li('Works offline.', 'Every tool and all 777 fonts, no internet needed.') +
      li('Feels like a real app.', 'Its own window, Start menu and taskbar icon. Your designs stay on your computer.') +
      '</ul>',
    buttons:[
      { label:'Don’t ask again', action:()=>{ store.set('pwaNever', true); } },
      { spacer:true },
      { label:'Maybe later', action:()=>{ store.set('pwaSnooze', Date.now() + 7 * 864e5); } },
      { label:'Install app', icon:'download', primary:true, action:()=>{ installClick(); } },
    ] });
}

/* ---------- offline use + safe updates ---------- */
if(!web || !('serviceWorker' in navigator)) return;
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
})();
