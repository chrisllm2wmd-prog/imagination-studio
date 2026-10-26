/* Merch Studio - saved files: browse and open what you have saved (MERCH\logos, \ads, \groups through the local server,
   or the remembered folder, or any folder you pick such as Chrome's Downloads) instead of hunting for it in a file dialog. */
(function(){
'use strict';
const MS = window.MS, S = MS.S;
const { $, $$, esc, toast } = MS;
const H = { 'X-Merch-Studio':'1' };
const OK = /\.(png|jpe?g|webp|svg|gif|json|pdf|zip)$/i;
const isLocal = ()=> /^https?:$/.test(location.protocol) && ['localhost', '127.0.0.1'].includes(location.hostname);
let serverP = null;
const FS = MS.files = {};
const within = (p, ms, fallback)=> Promise.race([p, new Promise(r=> setTimeout(()=> r(fallback), ms))]);
// never hangs: if the little local server does not answer in 4 s we carry on without it (and ask again next time)
FS.server = ()=> serverP || (serverP = isLocal() ? within(fetch('list?dir=groups', { headers:H }).then(r=> r.ok ? r.json() : null).then(j=> !!(j && j.ok)).catch(()=> false), 4000, false).then(ok=>{ if(!ok) serverP = null; return ok; }) : Promise.resolve(false));
FS.canStore = async ()=> (await FS.server()) || !!(await MS.folderHandle(false));

async function listHandle(dir, removable){
  const out = [];
  for await (const [name, e] of dir.entries()){
    if(e.kind !== 'file' || !OK.test(name)) continue;
    const f = await e.getFile();
    out.push({ name, size:f.size, modified:f.lastModified, get:()=> e.getFile(), remove:removable ? ()=> dir.removeEntry(name) : null });
  }
  out.sort((a, b)=> b.modified - a.modified); return out.slice(0, 400);
}
// list(sub): the saved files in logos / ads / groups (or the remembered folder). list(null, handle): any folder handle.
FS.list = async function(sub, handle){
  if(handle) return listHandle(handle, false);
  if(await FS.server()){
    const q = encodeURIComponent(sub || 'logos'), j = await (await fetch('list?dir=' + q, { headers:H })).json();
    return (j.files || []).map(f=> ({
      name:f.name, size:f.size, modified:Date.parse(f.modified),
      get:async()=>{ const b = await (await fetch('file?dir=' + q + '&name=' + encodeURIComponent(f.name), { headers:H })).blob(); return new File([b], f.name, { type:b.type }); },
      remove:(sub === 'groups' && /\.json$/i.test(f.name)) ? async()=>{ await fetch('delete?dir=' + q + '&name=' + encodeURIComponent(f.name), { method:'POST', headers:H }); } : null,
    }));
  }
  const h = await MS.folderHandle(false); if(!h) return [];
  let d = h; if(sub && sub !== 'logos'){ try{ d = await h.getDirectoryHandle(sub); }catch(e){ return []; } }
  return listHandle(d, sub === 'groups');
};

/* ---------------- the browser dialog ---------------- */
const fmtSize = n=> n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const fmtDate = t=> t ? new Date(t).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
const kindOf = name=> /\.msgroup\.json$/i.test(name) ? 'Group' : /\.json$/i.test(name) ? 'Project' : /\.svg$/i.test(name) ? 'SVG' : /\.(png|jpe?g|webp|gif)$/i.test(name) ? 'Picture' : /\.pdf$/i.test(name) ? 'PDF' : 'Other';

async function openFile(it, api, inLib){ try{ await openFile2(it, api, inLib); }catch(e){ console.error(e); toast('Could not open that file: ' + (e && e.message || e), 5000, 'err'); } }
async function openFile2(it, api, inLib){
  const kind = kindOf(it.name), file = await it.get();
  if(kind === 'Picture' || kind === 'SVG'){ MS.importFiles([file]); api.close(); return; }
  if(kind === 'Group' || kind === 'Project'){
    let j; try{ j = JSON.parse(await file.text()); }catch(e){ toast('Could not read that file.', 4000, 'err'); return; }
    if(j.type === 'merch-studio-group'){ if(!j.objects){ toast('That group file is empty.', 3500, 'err'); return; } const rec = { ...j }; if(!inLib) await MS.groups.addRecord(rec); MS.groups.insertRecord(rec); api.close(); toast(inLib ? 'Group inserted.' : 'Group inserted and added to your Saved groups.'); return; }
    if(j.canvasJSON){
      const go = ()=>{ MS.openProjectFile(file); api.close(); };
      if(!MS.canvas.getObjects().length){ go(); return; }
      // an in-app question (the browser's confirm() box can be silently blocked, which looked like "nothing happens")
      MS.modal({ title:'Open this project?', body:'<div>Open <b>' + esc(it.name) + '</b>? Your current design will be replaced — save it first if you need it.</div>', med:true, buttons:[{ spacer:true }, { label:'Cancel' }, { label:'Open it', primary:true, icon:'open', action:go }] });
      return;
    }
    toast('That JSON file is not a project or a group.', 4000, 'err'); return;
  }
  toast('That file type cannot be opened in the editor.', 3500, 'err');
}

MS.openFiles = async function(startSrc){
  const srv = await FS.server(), fh = srv ? null : await within(MS.folderHandle(false), 3000, null), canPick = !!window.showDirectoryPicker;
  const sources = srv ? [['logos', 'Logos'], ['ads', 'Ads'], ['groups', 'Groups']] : (fh ? [['logos', fh.name], ['groups', 'Groups']] : []);
  let src = startSrc && sources.some(s=> s[0] === startSrc) ? startSrc : (sources[0] ? sources[0][0] : null), picked = null, items = [], gen = 0;
  const body = document.createElement('div');
  body.innerHTML = `<div class="fb-bar"><div class="seg" id="fbSrc"></div><button class="btn sm" id="fbPick" ${canPick ? '' : 'disabled'} data-tip="Open files from any folder, for example your Downloads">${MS.icon('folder')}Browse another folder…</button>${srv ? '' : '<button class="btn sm" id="fbSet" data-tip="Remember a folder: saves go there and show up here">Set my save folder…</button>'}<input type="search" id="fbFind" placeholder="Search" class="grow"></div>
    <div class="hint" id="fbNote"></div><div class="fgrid" id="fbGrid"></div><input type="file" id="fbFiles" multiple hidden>`;
  const api = MS.modal({ title:'Open from saved files', body, wide:true, footer:false });
  const note = $('#fbNote', body), grid = $('#fbGrid', body);
  const drawSrc = ()=>{ $('#fbSrc', body).innerHTML = sources.map(([k, l])=> `<button data-s="${k}" class="${!picked && src === k ? 'active' : ''}">${esc(l)}</button>`).join('') + (picked ? `<button class="active">${esc(picked.name)}</button>` : ''); $$('#fbSrc button[data-s]', body).forEach(b=> b.onclick = ()=>{ src = b.dataset.s; picked = null; load(); }); };
  async function load(){
    const my = ++gen; drawSrc(); grid.innerHTML = ''; note.textContent = 'Loading…';
    try{ items = picked ? await FS.list(null, picked) : (src ? await FS.list(src) : []); }catch(e){ items = []; }
    if(my !== gen) return;
    note.textContent = items.length ? items.length + ' file' + (items.length > 1 ? 's' : '') + ' — click one to open it.' : (src || picked ? 'Nothing here yet.' : 'No saved folder yet. Start “Start Imagination Studio.bat”, or use “Set my save folder…”, or browse another folder (for example Downloads).');
    paint();
  }
  const thumbQ = [];
  async function pump(){ if(pump.busy) return; pump.busy = true; while(thumbQ.length){ const [it, img] = thumbQ.shift(); try{ const f = await it.get(); img.src = URL.createObjectURL(f); }catch(e){} } pump.busy = false; }
  function paint(){
    const q = ($('#fbFind', body).value || '').toLowerCase().trim(); grid.innerHTML = ''; thumbQ.length = 0;
    items.filter(it=> !q || it.name.toLowerCase().includes(q)).forEach(it=>{
      const kind = kindOf(it.name), card = document.createElement('div'); card.className = 'fcard';
      card.innerHTML = `<div class="fthumb">${kind === 'Picture' || kind === 'SVG' ? '<img draggable="false">' : '<span>' + kind + '</span>'}</div><div class="fname" title="${esc(it.name)}">${esc(it.name)}</div><div class="hint">${kind} · ${fmtSize(it.size)} · ${fmtDate(it.modified)}</div>`;
      const img = card.querySelector('img'); if(img) thumbQ.push([it, img]);
      card.onclick = ()=> openFile(it, api, !picked && src === 'groups'); grid.appendChild(card);
    });
    pump();
  }
  $('#fbFind', body).oninput = paint;
  $('#fbPick', body).onclick = async ()=>{ try{ picked = await window.showDirectoryPicker({ id:'merch-open', mode:'read' }); load(); }catch(e){} };
  const set = $('#fbSet', body); if(set) set.onclick = async ()=>{ try{ const h = await MS.chooseFolder(); toast('Saves now go to "' + h.name + '" and show up here.', 4500); api.close(); MS.openFiles(); }catch(e){} };
  if(!canPick){ note.textContent = 'This browser cannot browse folders — use Chrome or Edge, or choose files below.'; const b = document.createElement('button'); b.className = 'btn sm'; b.textContent = 'Choose files…'; b.onclick = ()=> $('#fbFiles', body).click(); $('.fb-bar', body).appendChild(b); $('#fbFiles', body).onchange = e=>{ const f = e.target.files[0]; if(f) openFile({ name:f.name, get:async()=> f }, api); }; }
  load();
};
// the menu item always gives feedback: a message while it looks, and the real error if something breaks
const openFilesImpl = MS.openFiles; let opening = false;
MS.openFiles = async function(a){
  if(opening) return; opening = true; const t = setTimeout(()=> toast('Looking for your saved files…', 3000), 200);
  try{ await openFilesImpl(a); }catch(e){ console.error(e); toast('Could not open the saved files window: ' + (e && e.message || e), 8000, 'err'); }
  finally{ clearTimeout(t); opening = false; }
};
document.addEventListener('keydown', e=>{ if((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o'){ e.preventDefault(); MS.openFiles(); } });
})();
