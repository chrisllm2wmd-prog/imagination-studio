/* Merch Studio - Linked groups panel (left): multi-selections become a locked "group" that moves/rotates/scales as one,
   with a lock toggle and a save-to-library icon. Saved groups can be re-inserted any time. */
(function(){
'use strict';
const MS = window.MS, S = MS.S;
const { $, $$, esc, toast } = MS;
const cv = ()=> MS.canvas;
S.links = S.links || {};
let busy = false, altDown = false, seq = 0, renderT = null;
const thumbs = {};

function allLinks(){ const m = {}; cv().getObjects().forEach(o=>{ if(o.__linkId) (m[o.__linkId] = m[o.__linkId] || []).push(o); }); return m; }
const isLocked = id=> !S.links[id] || S.links[id].locked !== false;
const members = id=> cv().getObjects().filter(o=> o.__linkId === id);
function nextName(){ let n = 1; const used = new Set(Object.values(S.links).map(l=>l.name)); while(used.has('Group ' + n)) n++; return 'Group ' + n; }

function onSelection(){
  if(busy || !cv()) return;
  const act = cv().getActiveObjects(); if(!act.length){ scheduleRender(); return; }
  // 1. locked links pull in all of their members
  if(!altDown){
    const set = new Set(act); let changed = false;
    act.forEach(o=>{ const id = o.__linkId; if(id && isLocked(id)) members(id).forEach(m=>{ if(!set.has(m) && m.visible !== false && !m.lockMovementX){ set.add(m); changed = true; } }); });
    if(changed){ busy = true; MS.ops.select([...set]); busy = false; scheduleRender(); return; }
  }
  // 2. a fresh multi-selection becomes a new locked group
  if(act.length >= 2 && !act.some(o=> o.__isBackground)){
    const ids = new Set(act.map(o=> o.__linkId || ''));
    if(!(ids.size === 1 && !ids.has(''))){
      const id = 'g' + Date.now().toString(36) + (seq++);
      act.forEach(o=>{ o.__linkId = id; });
      S.links[id] = { locked:true, name:nextName() };
      toast('Selection grouped in the Groups panel (locked) — it moves, rotates and scales as one.', 3500);
    }
  }
  scheduleRender();
}
function scheduleRender(){ clearTimeout(renderT); renderT = setTimeout(render, 120); }

async function thumbOfGroup(objs){
  const c = cv(), all = c.getObjects(), vis = all.map(o=>o.visible), keepV = c.viewportTransform.slice(), keepBg = c.backgroundColor, sk = c.skipOffscreen;
  const rects = objs.map(o=> o.getBoundingRect(true, true));
  const x0 = Math.min(...rects.map(r=>r.left)), y0 = Math.min(...rects.map(r=>r.top)), x1 = Math.max(...rects.map(r=>r.left + r.width)), y1 = Math.max(...rects.map(r=>r.top + r.height));
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0), set = new Set(objs);
  S.exporting = true;
  try{
    all.forEach(o=> o.visible = set.has(o));
    c.skipOffscreen = false; c.viewportTransform = [1,0,0,1,0,0]; c.backgroundColor = null;
    return c.toCanvasElement(Math.min(1, 80 / Math.max(w, h)), { left:x0, top:y0, width:w, height:h }).toDataURL('image/png');
  } finally { all.forEach((o, i)=> o.visible = vis[i]); c.viewportTransform = keepV; c.backgroundColor = keepBg; c.skipOffscreen = sk; c.calcViewportBoundaries(); S.exporting = false; c.requestRenderAll(); }
}

function render(){
  const list = $('#grpList'); if(!list || !cv()) return;
  const links = allLinks();
  Object.keys(links).forEach(id=>{ if(links[id].length < 2){ links[id].forEach(o=>{ delete o.__linkId; }); delete links[id]; delete S.links[id]; } });
  const act = new Set(cv().getActiveObjects());
  const ids = Object.keys(links);
  $('#grpCount').textContent = ids.length || '';
  if(!ids.length){ list.innerHTML = '<div class="empty-note" style="padding:16px 10px"><div>No groups yet</div><div class="hint">Drag a box around several things, or Shift-click them. They appear here, locked together.</div></div>'; return; }
  list.innerHTML = '';
  ids.forEach(id=>{
    const ms = links[id], locked = isLocked(id), info = S.links[id] = S.links[id] || { locked:true, name:nextName() };
    const sel = ms.every(m=> act.has(m)) && act.size === ms.length;
    const row = document.createElement('div'); row.className = 'grp-row' + (sel ? ' selected' : ''); row.dataset.id = id;
    row.innerHTML = `<div class="layer-thumb" style="width:34px;height:34px"><img draggable="false"></div><div class="grp-main"><div class="lname" title="Double-click to rename">${esc(info.name)}</div><div class="hint">${ms.length} items · ${locked ? 'locked together' : 'free'}</div></div>
      <button class="lb ${locked ? 'on' : ''}" data-a="lock" data-tip="${locked ? 'Locked: moves, rotates and scales as one — click to release' : 'Free: items can be edited alone — click to lock together'}">${MS.icon(locked ? 'lock' : 'unlock')}</button>
      <button class="lb" data-a="save" data-tip="Save this group to the library">${MS.icon('save')}</button>
      <button class="lb" data-a="ungroup" data-tip="Remove this group (keeps the items)">${MS.icon('x')}</button>`;
    const key = ms.map(o=> o.__layerId || '').join() + '|' + ms.map(o=> Math.round(o.left) + ',' + Math.round(o.top) + ',' + Math.round(o.scaleX * 100) + ',' + Math.round(o.angle || 0)).join(';');
    const im = row.querySelector('img');
    if(thumbs[id] && thumbs[id].key === key) im.src = thumbs[id].url;
    else thumbOfGroup(ms).then(u=>{ thumbs[id] = { key, url:u }; im.src = u; }).catch(()=>{});
    const nm = row.querySelector('.lname');
    nm.addEventListener('dblclick', e=>{ e.stopPropagation(); nm.contentEditable = 'true'; nm.focus(); document.execCommand('selectAll', false, null); });
    nm.addEventListener('blur', ()=>{ if(nm.contentEditable === 'true'){ nm.contentEditable = 'false'; info.name = nm.textContent.trim() || info.name; } });
    nm.addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); nm.blur(); } e.stopPropagation(); });
    row.addEventListener('click', e=>{
      const b = e.target.closest('[data-a]');
      if(!b){ if(MS.S.tool !== 'move') MS.setTool('move'); busy = true; MS.ops.select(ms); busy = false; scheduleRender(); return; }
      e.stopPropagation();
      if(b.dataset.a === 'lock'){ info.locked = !locked; if(info.locked){ busy = true; MS.ops.select(ms); busy = false; } MS.commit(info.locked ? 'Lock group' : 'Release group'); render(); }
      else if(b.dataset.a === 'save') saveGroup(id);
      else if(b.dataset.a === 'ungroup'){ ms.forEach(o=>{ delete o.__linkId; }); delete S.links[id]; MS.commit('Remove group'); render(); }
    });
    list.appendChild(row);
  });
  window.MSI.hydrate && 0;
}

/* ---------------- saved library (IndexedDB) ---------------- */
const DB = 'merchStudioGroups';
const openDb = ()=> new Promise((res, rej)=>{ const r = indexedDB.open(DB, 1); r.onupgradeneeded = ()=> r.result.createObjectStore('g', { keyPath:'id' }); r.onsuccess = ()=> res(r.result); r.onerror = ()=> rej(r.error); });
async function dbAll(){ try{ const db = await openDb(); return await new Promise(res=>{ const q = db.transaction('g').objectStore('g').getAll(); q.onsuccess = ()=> res((q.result || []).sort((a, b)=> b.t - a.t)); q.onerror = ()=> res([]); }); }catch(e){ return []; } }
async function dbPut(v){ const db = await openDb(); return new Promise((res, rej)=>{ const tx = db.transaction('g', 'readwrite'); tx.objectStore('g').put(v); tx.oncomplete = res; tx.onerror = ()=> rej(tx.error); }); }
async function dbDel(id){ const db = await openDb(); return new Promise(res=>{ const tx = db.transaction('g', 'readwrite'); tx.objectStore('g').delete(id); tx.oncomplete = res; }); }

async function saveGroup(id){ return saveObjects(members(id), (S.links[id] || { name:'Group' }).name); }
// save ANY set of objects (one thing, several things, a group) into the assets library (MERCH\groups + this browser)
async function saveObjects(ms, name){
  const c = cv(), info = { name:name || 'Asset' };
  const keep = c.getActiveObjects(); c.discardActiveObject();
  const objs = ms.map(o=> o.toObject(MS.SERIALIZE_PROPS));
  keep.length && MS.ops.select(keep);
  const rects = ms.map(o=> o.getBoundingRect(true, true));
  const x0 = Math.min(...rects.map(r=>r.left)), y0 = Math.min(...rects.map(r=>r.top));
  const w = Math.max(...rects.map(r=>r.left + r.width)) - x0, h = Math.max(...rects.map(r=>r.top + r.height)) - y0;
  const thumb = await thumbOfGroup(ms);
  objs.forEach(o=>{ delete o.__linkId; });
  const rec = { id:'s' + Date.now().toString(36), name:info.name, thumb, objects:objs, x:x0, y:y0, w, h, t:Date.now() };
  await dbPut(rec);
  const put = await MS.saveQuiet(new Blob([JSON.stringify({ type:'merch-studio-group', v:1, ...rec })], { type:'application/json' }), info.name.replace(/[^\w -]+/g, '_') + '.msgroup.json', 'groups');
  toast('Saved “' + info.name + '” to the library' + (put ? ' and to ' + put.where + '\\' + put.name : ' (this browser only — open the .bat or pick a folder in the Saved groups panel to keep it as a file)') + '.', 5000); renderLibrary();
}
async function insertSaved(rec){
  const c = cv();
  const objs = await new Promise(res=> fabric.util.enlivenObjects(JSON.parse(JSON.stringify(rec.objects)), res));
  const dx = S.doc.wPx / 2 - (rec.x + rec.w / 2), dy = S.doc.hPx / 2 - (rec.y + rec.h / 2);
  const id = 'g' + Date.now().toString(36) + (seq++);
  objs.forEach(o=>{ o.set({ left:o.left + dx, top:o.top + dy }); o.setCoords(); o.__linkId = id; o.name = o.name || MS.nextName('group'); c.add(o); });
  S.links[id] = { locked:true, name:rec.name };
  busy = true; MS.ops.select(objs); busy = false; MS.commit('Insert saved group'); render();
}
// groups that live as files (MERCH\\groups, or the remembered folder\\groups) merged with ones kept in this browser
async function folderGroups(){
  const out = [];
  try{
    const items = await MS.files.list('groups');
    for(const it of items){ if(!/\.json$/i.test(it.name)) continue; try{ const j = JSON.parse(await (await it.get()).text()); if(j.type === 'merch-studio-group'){ j.file = it; out.push(j); } }catch(e){} }
  }catch(e){}
  return out;
}
async function renderLibrary(){
  const box = $('#grpLib'); if(!box) return;
  const local = await dbAll(), files = await folderGroups(), seen = new Set(files.map(r=> r.id)), recs = files.concat(local.filter(r=> !seen.has(r.id)));
  const canFile = await MS.files.canStore();
  const mv = $('#grpToFolder'); if(mv) mv.style.display = (canFile && local.some(r=> !seen.has(r.id))) ? '' : 'none';
  $('#grpLibCount').textContent = recs.length || '';
  if(!recs.length){ box.innerHTML = '<div class="hint" style="padding:8px 10px">Nothing saved yet — click the <b>save</b> icon on a group above.</div>'; return; }
  box.innerHTML = '';
  recs.forEach(rec=>{
    const row = document.createElement('div'); row.className = 'grp-row';
    row.innerHTML = `<div class="layer-thumb" style="width:34px;height:34px"><img src="${rec.thumb}" draggable="false"></div><div class="grp-main"><div class="lname">${esc(rec.name)}</div><div class="hint">${rec.objects.length} items · ${rec.file ? 'in folder' : 'this browser only'}</div></div>
      <button class="lb" data-a="add" data-tip="Insert into the design">${MS.icon('plus')}</button><button class="lb" data-a="dl" data-tip="Download as a file">${MS.icon('download')}</button><button class="lb" data-a="del" data-tip="Delete from library">${MS.icon('trash')}</button>`;
    row.addEventListener('click', async e=>{
      const b = e.target.closest('[data-a]'); const a = b ? b.dataset.a : 'add';
      if(a === 'add') insertSaved(rec);
      else if(a === 'dl') MS.download(new Blob([JSON.stringify({ type:'merch-studio-group', v:1, ...rec })], { type:'application/json' }), rec.name.replace(/[^\w -]+/g, '_') + '.msgroup.json');
      else if(a === 'del'){ await dbDel(rec.id); if(rec.file && rec.file.remove) await rec.file.remove(); renderLibrary(); }
    });
    box.appendChild(row);
  });
}
// copy every group that only lives in this browser into the groups folder
async function groupsToFolder(){
  const files = await folderGroups(), seen = new Set(files.map(r=> r.id)); let n = 0;
  for(const r of await dbAll()){ if(seen.has(r.id)) continue; const put = await MS.saveQuiet(new Blob([JSON.stringify({ type:'merch-studio-group', v:1, ...r })], { type:'application/json' }), r.name.replace(/[^\w -]+/g, '_') + '.msgroup.json', 'groups'); if(put) n++; }
  toast(n ? n + ' group' + (n > 1 ? 's' : '') + ' copied into the groups folder.' : 'Nothing to copy — pick a folder first.', 4000); renderLibrary();
}
function saveSelection(){
  const ms = cv().getActiveObjects().filter(o=> !o.__isBackground); if(!ms.length){ toast('Select something on the canvas first, then save it to your assets.', 4000); return; }
  const body = document.createElement('div'); body.innerHTML = '<div class="r"><label>Name</label><input type="text" class="grow" id="asName" spellcheck="false"></div><div class="hint">Saved to your assets library (the Groups panel, and the MERCH\groups folder). Insert it into any design later.</div>';
  const first = ms.length === 1 ? (ms[0].name || ms[0].type) : (ms.length + ' items'); $('#asName', body).value = first;
  const api = MS.modal({ title:'Save to assets', body, med:true, buttons:[{ spacer:true }, { label:'Cancel' }, { label:'Save', primary:true, icon:'save', action:()=>{ saveObjects(ms, $('#asName', body).value.trim() || first); } }] });
  setTimeout(()=>{ const i = $('#asName', body); i && (i.focus(), i.select()); }, 50);
  $('#asName', body).addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); const b = $$('.modal-f .btn.primary', api.el)[0]; b && b.click(); } });
}
MS.groups = { saveSelection, addRecord:async rec=>{ rec.id = 's' + Date.now().toString(36); await dbPut(rec); const put = await MS.saveQuiet(new Blob([JSON.stringify({ type:'merch-studio-group', v:1, ...rec })], { type:'application/json' }), rec.name.replace(/[^\w -]+/g, '_') + '.msgroup.json', 'groups'); renderLibrary(); return put; }, insertRecord:insertSaved, refresh:()=> renderLibrary() };
function importGroupFile(file){
  const r = new FileReader(); r.onload = async ev=>{ try{ const j = JSON.parse(ev.target.result); if(j.type !== 'merch-studio-group') throw new Error('Not a saved group file.'); j.id = 's' + Date.now().toString(36); await dbPut(j); renderLibrary(); toast('Group added to the library.'); }catch(e){ toast(e.message, 4000, 'err'); } }; r.readAsText(file);
}

MS.initGroups = function(){
  const main = $('#main'), tool = $('#toolbox');
  const p = document.createElement('aside'); p.id = 'leftPanel';
  p.innerHTML = `<div class="lp-h"><button class="ib" id="lpToggle" data-tip="Show / hide the Groups panel">${MS.icon('group')}</button><b>Groups</b><span class="layer-badge" id="grpCount"></span></div>
    <div class="lp-body"><div class="lp-sec"><div id="grpList"></div></div>
    <div class="lp-sec"><div class="sect-h" style="cursor:default;padding:8px 10px">${MS.icon('save')}<span>Assets &amp; saved groups</span><button class="tb" id="grpSaveSel" data-tip="Save the selected item(s) to assets">${MS.icon('plus')}</button><span class="layer-badge" id="grpLibCount"></span><span class="sp"></span><button class="tb" id="grpFolder" data-tip="Browse saved files / pick a folder">${MS.icon('folder')}</button><button class="tb" id="grpImport" data-tip="Add a group file">${MS.icon('open')}</button></div><div class="r" style="padding:0 10px 6px"><button class="btn sm" id="grpToFolder" style="display:none" data-tip="Copy groups kept only in this browser into the groups folder">Copy into folder</button></div><div id="grpLib"></div></div>
    <div class="hint" style="padding:8px 10px">Lock ON: the group moves, rotates and scales as one and keeps its layout. Lock OFF: edit items on their own. Hold <kbd>Alt</kbd> while clicking to pick one item inside a locked group.</div></div>
    <input type="file" id="grpFile" accept=".json" hidden>`;
  main.insertBefore(p, tool.nextSibling);
  $('#lpToggle').onclick = ()=>{ p.classList.toggle('collapsed'); MS.store.set('lpCollapsed', p.classList.contains('collapsed')); MS.emit('resize'); };
  if(MS.store.get('lpCollapsed', innerWidth < 1250)) p.classList.add('collapsed');
  $('#grpSaveSel').onclick = saveSelection; $('#grpFolder').onclick = ()=> MS.openFiles && MS.openFiles('groups'); $('#grpToFolder').onclick = groupsToFolder;
  $('#grpImport').onclick = ()=> $('#grpFile').click(); $('#grpFile').onchange = e=>{ if(e.target.files[0]) importGroupFile(e.target.files[0]); e.target.value = ''; };
  MS.on('selection', onSelection); MS.on('layers', scheduleRender); MS.on('history', scheduleRender);
  document.addEventListener('keydown', e=>{ if(e.key === 'Alt') altDown = true; }); document.addEventListener('keyup', e=>{ if(e.key === 'Alt') altDown = false; }); window.addEventListener('blur', ()=>{ altDown = false; });
  const prevC = MS.collectExtra, prevR = MS.restoreExtra;
  MS.collectExtra = ()=> Object.assign(prevC ? prevC() : {}, { links:S.links });
  MS.restoreExtra = ex=>{ S.links = (ex && ex.links) || {}; prevR && prevR(ex); };
  MS.on('doc', ()=>{ S.links = S.links || {}; scheduleRender(); });
  MS.addCommand && MS.addCommand({ title:'Save selection to assets', cat:'File', kw:'asset library group save', run:saveSelection });
  render(); renderLibrary();
};
})();
