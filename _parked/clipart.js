/* Imagination Studio - clip-art & picture search. Type a word, get 10 results from Pixabay (needs a free key), Wikimedia Commons or
   Iconify's open icon sets, add any of them to the assets library in the left panel. Tick "More like this" on the ones you like and the
   next 10 are chosen to be close to them. Outside connections are only made while this window is open (see the CSP in index.html). */
(function(){
'use strict';
const MS = window.MS, S = MS.S;
const { $, $$, esc, toast } = MS;
const ICON_API = 'https://api.iconify.design', PIX = 'https://pixabay.com/api/', WIKI = 'https://commons.wikimedia.org/w/api.php';
const PAGE = 10;
// icon sets that need no credit line; CC BY ones are only offered when the box is ticked
const FREE = new Set(['CC0-1.0', 'MIT', 'Apache-2.0', 'ISC', 'Unlicense', '0BSD', 'OFL-1.1']);
const STYLE = new Set(['bold', 'outline', 'outlined', 'filled', 'fill', 'line', 'linear', 'duotone', 'solid', 'regular', 'thin', 'light', 'broken', 'sharp', 'rounded', 'round', 'twotone', 'alt', 'color', 'flat', 'big', 'small']);
const STOP = new Set(['file', 'the', 'and', 'with', 'for', 'from', 'svg', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'vector', 'image', 'images', 'icon', 'icons']);
const SOURCES = [
  { id:'pxv', label:'Pixabay · vectors & clip art', kind:'pix', type:'vector' },
  { id:'pxi', label:'Pixabay · illustrations', kind:'pix', type:'illustration' },
  { id:'pxp', label:'Pixabay · photos', kind:'pix', type:'photo' },
  { id:'wkd', label:'Wikimedia Commons · drawings & SVG', kind:'wiki', type:'drawing' },
  { id:'wkp', label:'Wikimedia Commons · photos', kind:'wiki', type:'bitmap' },
  { id:'ico', label:'Icons (Iconify · free, no credit)', kind:'icon' },
];
let collsP = null;
const svgCache = new Map(), searchCache = new Map();
const store = (k, v)=>{ try{ if(v === undefined) return localStorage.getItem('imag.' + k) || ''; localStorage.setItem('imag.' + k, v); }catch(e){ return ''; } };

const getJson = async url=>{ const r = await fetch(url); if(!r.ok) throw new Error('The service said ' + r.status + '.'); return r.json(); };
const colls = ()=> collsP || (collsP = getJson(ICON_API + '/collections').catch(e=>{ collsP = null; throw e; }));
async function iconSearch(q){
  const k = q.toLowerCase(); if(searchCache.has(k)) return searchCache.get(k);
  const list = (await getJson(ICON_API + '/search?limit=999&query=' + encodeURIComponent(q))).icons || []; searchCache.set(k, list); return list;
}
async function iconSvg(id){
  if(svgCache.has(id)) return svgCache.get(id);
  const [p, n] = id.split(':'), r = await fetch(ICON_API + '/' + p + '/' + n + '.svg?height=300');
  if(!r.ok) throw new Error('Could not load ' + id);
  const t = await r.text(); svgCache.set(id, t); return t;
}
const iconTokens = id=> id.split(':')[1].split('-').filter(t=> t.length > 1 && !/^\d+$/.test(t) && !STYLE.has(t));
const colourise = (t, col)=> t.replace(/currentColor/g, col);
const dataUri = svg=> 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
const words = s=> (s || '').toLowerCase().replace(/\.[a-z0-9]{3,4}$/, '').split(/[^a-z0-9]+/).filter(w=> w.length > 3 && !STOP.has(w) && !/^\d+$/.test(w));

/* ---- remote pages (Pixabay / Wikimedia): return the items on one page ---- */
async function pixPage(src, q, page, key){
  const j = await getJson(PIX + '?key=' + encodeURIComponent(key) + '&q=' + encodeURIComponent(q) + '&image_type=' + src.type + '&per_page=20&page=' + page + '&safesearch=true');
  return (j.hits || []).map(h=> ({ id:'px' + h.id, title:(h.tags || '').split(',')[0].trim() || 'picture', thumb:h.webformatURL || h.previewURL, full:h.vectorURL || h.largeImageURL || h.webformatURL, svg:!!h.vectorURL,
    tags:(h.tags || '').split(',').map(t=> t.trim().toLowerCase()).filter(Boolean), set:'Pixabay', lic:'Pixabay Content License', by:h.user, page:h.pageURL, free:true }));
}
async function wikiPage(src, q, page){
  const u = WIKI + '?action=query&generator=search&gsrnamespace=6&gsrlimit=20&gsroffset=' + (page - 1) * 20 + '&gsrsearch=' + encodeURIComponent(q + ' filetype:' + src.type)
    + '&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=700&iiextmetadatafilter=LicenseShortName|Artist&format=json&origin=*';
  const j = await getJson(u), pages = Object.values((j.query && j.query.pages) || {}).sort((a, b)=> a.index - b.index);
  return pages.map(p=>{
    const i = (p.imageinfo || [])[0]; if(!i || !/^image\/(svg\+xml|png|jpeg|webp)$/.test(i.mime)) return null;
    const m = i.extmetadata || {}, lic = (m.LicenseShortName && m.LicenseShortName.value) || 'see source page', svg = i.mime === 'image/svg+xml';
    const title = p.title.replace(/^File:/, '').replace(/\.[a-z0-9]{3,4}$/i, '').replace(/_/g, ' ');
    return { id:'wk' + p.pageid, title, thumb:i.thumburl || i.url, full:svg ? i.url : (i.thumburl || i.url), svg, tags:words(title),
      set:'Wikimedia Commons', lic, by:(m.Artist && m.Artist.value || '').replace(/<[^>]*>/g, '').slice(0, 60), page:i.descriptionurl, free:/public domain|cc0|^pd/i.test(lic) };
  }).filter(Boolean);
}

MS.clipart = { open };

function open(){
  const st = { q:'', src:SOURCES[store('src') ? Math.max(0, SOURCES.findIndex(s=> s.id === store('src'))) : 0], pool:[], seenTitles:new Set(), shown:new Set(), liked:new Map(), cur:[], credit:false, col:'#111111', busy:false, page:0, likedKey:'' };
  const body = document.createElement('div');
  body.innerHTML = `<div style="display:flex;gap:6px"><input type="text" id="caQ" placeholder="Search a word: cat, anchor, flame, skull…" spellcheck="false" style="flex:1;min-width:0"><button class="btn primary" id="caGo">Search</button></div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:8px"><label style="display:flex;align-items:center;gap:6px;width:auto">Find in <select id="caSrc">${SOURCES.map(s=> `<option value="${s.id}">${esc(s.label)}</option>`).join('')}</select></label>
    <label id="caColL" style="display:flex;align-items:center;gap:6px;width:auto;white-space:nowrap">Icon colour <input type="color" id="caCol" value="#111111" style="width:34px;height:24px;padding:0"></label>
    <label id="caCrL" style="display:flex;align-items:center;gap:6px;width:auto"><input type="checkbox" id="caCr" style="flex:none"> Also CC BY icons (credit needed)</label></div>
    <div id="caKey" style="display:none;margin-top:8px;gap:6px;align-items:center;flex-wrap:wrap"><span class="hint">Pixabay needs a free key (one minute): <a href="https://pixabay.com/api/docs/" target="_blank" rel="noopener" style="color:var(--acc2)">get it here</a>, then paste it →</span><input type="text" id="caKeyIn" placeholder="Pixabay API key" spellcheck="false" style="flex:1;min-width:140px"><button class="btn sm" id="caKeyOk">Save key</button></div>
    <div class="hint" id="caNote" style="margin:8px 0">Tick <b>More like this</b> on the ones you like, then press <b>Show 10 more</b>: the next ones are chosen to be close to what you ticked. <b>Add to assets</b> puts a picture in the Assets list in the left panel.</div>
    <div id="caGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:8px;min-height:120px"></div>
    <div class="hint" style="margin-top:12px;padding-top:8px;border-top:1px solid var(--line2);font-size:11px"><b>Please read:</b> these results come from outside websites and are shown as they are. Imagination Studio does not check who owns a picture or whether you may sell it. Only use a picture on merch, logos or anything you sell if you have the right to: read its licence on the source page and give credit where the licence asks. You are responsible for what you use.</div>`;
  const api = MS.modal({ title:'Find clip art & pictures', body, wide:true, buttons:[
    { spacer:true },
    { label:'Add ticked to assets', icon:'save', keepOpen:true, action:()=>{ addTicked(); return false; } },
    { label:'Show 10 more', icon:'redo', primary:true, id:'caMore', keepOpen:true, action:()=>{ more(); return false; } },
    { label:'Close' } ] });
  const q = $('#caQ', body), grid = $('#caGrid', body), note = $('#caNote', body), sel = $('#caSrc', body);
  const say = (t, bad)=>{ note.innerHTML = t; note.style.color = bad ? 'var(--bad)' : ''; };
  const isIcon = ()=> st.src.kind === 'icon';
  function chrome(){
    $('#caColL', body).style.display = $('#caCrL', body).style.display = isIcon() ? 'flex' : 'none';
    $('#caKey', body).style.display = (st.src.kind === 'pix' && !store('pixkey')) ? 'flex' : 'none';
  }
  sel.value = st.src.id; chrome();
  sel.onchange = ()=>{ st.src = SOURCES.find(s=> s.id === sel.value); store('src', st.src.id); chrome(); if(q.value.trim()) newSearch(); };
  $('#caKeyOk', body).onclick = ()=>{ const k = $('#caKeyIn', body).value.trim(); if(!k) return; store('pixkey', k); chrome(); say('Key saved in this browser only. Press Search.'); };
  $('#caKeyIn', body).addEventListener('keydown', e=> e.stopPropagation());

  async function iconMeta(id){
    const c = (await colls())[id.split(':')[0]]; if(!c) return null;
    const sp = c.license && c.license.spdx, free = FREE.has(sp);
    if(!free && !(st.credit && /^CC-BY-/.test(sp || ''))) return null;
    return { lic:(c.license && c.license.title) || sp || '', set:c.name, free, by:c.author && c.author.name || '' };
  }
  async function newSearch(){
    const w = q.value.trim(); if(!w) return;
    if(st.src.kind === 'pix' && !store('pixkey')){ chrome(); say('Paste your free Pixabay key above first (or pick another place to search).', true); return; }
    Object.assign(st, { q:w, seenTitles:new Set(), shown:new Set(), liked:new Map(), page:0, likedKey:'', pool:[] }); grid.innerHTML = ''; say('Searching…');
    if(isIcon()){ try{ st.pool = await iconSearch(w); }catch(e){ say('Could not reach the icon service. Check your internet connection.', true); return; } }
    await more(true);
  }
  // the next 10: remote sources re-search with the ticked pictures' tags added; icons are re-ranked by how much they share with the ticked ones
  async function nextRemote(){
    const tagCount = {}; st.liked.forEach(it=> it.tags.forEach(t=>{ if(!st.q.toLowerCase().includes(t)) tagCount[t] = (tagCount[t] || 0) + 1; }));
    const extra = Object.keys(tagCount).sort((a, b)=> tagCount[b] - tagCount[a]).slice(0, 3).join(' ');
    const query = (st.q + ' ' + extra).trim();
    if(query !== st.likedKey){ st.likedKey = query; st.page = 0; }
    const out = [];
    for(let n = 0; n < 4 && out.length < PAGE; n++){
      st.page++;
      const items = st.src.kind === 'pix' ? await pixPage(st.src, query, st.page, store('pixkey')) : await wikiPage(st.src, query, st.page);
      if(!items.length) break;
      items.forEach(it=>{   // skip ones already shown and near-copies (the same picture uploaded in several languages)
        const k = it.title.toLowerCase().replace(/[^a-z]/g, '').slice(0, 18);
        if(out.length < PAGE && !st.shown.has(it.id) && !st.seenTitles.has(k)){ out.push(it); st.seenTitles.add(k); }
      });
    }
    return out;
  }
  async function nextIcons(){
    const liked = [...st.liked.keys()];
    let cand = st.pool.map((id, i)=> ({ id, base:1 - i / Math.max(1, st.pool.length) })).filter(c=> !st.shown.has(c.id));
    if(liked.length){
      const likedTok = new Set(), likedPre = new Set(), cores = new Set();
      liked.forEach(id=>{ const t = iconTokens(id); t.forEach(x=> likedTok.add(x)); likedPre.add(id.split(':')[0]); if(t.length) cores.add(t.join(' ')); });
      const seen = new Set(cand.map(c=> c.id));
      for(const core of [...cores].slice(0, 4)){
        try{ (await iconSearch(core)).slice(0, 150).forEach(id=>{ if(!seen.has(id) && !st.shown.has(id)){ seen.add(id); cand.push({ id, base:0 }); } }); }catch(e){}
      }
      cand.forEach(c=>{
        const t = iconTokens(c.id), same = t.filter(x=> likedTok.has(x)).length;
        c.score = same * 4 + (t.length && cores.has(t.join(' ')) ? 3 : 0) + (likedPre.has(c.id.split(':')[0]) ? 2 : 0) + c.base;
      });
      cand.sort((a, b)=> b.score - a.score);
    }
    // at most 2 per icon set on a page so the 10 are a mix of styles; left-over places are filled afterwards
    const out = [], perSet = {}, spare = [];
    for(const c of cand){
      if(out.length >= PAGE) break;
      const meta = await iconMeta(c.id); if(!meta) continue;
      const p = c.id.split(':')[0], it = { id:c.id, title:c.id.split(':')[1], tags:iconTokens(c.id), svg:true, ...meta, icon:true };
      if((perSet[p] || 0) >= 2){ spare.push(it); continue; }
      perSet[p] = (perSet[p] || 0) + 1; out.push(it);
    }
    while(out.length < PAGE && spare.length) out.push(spare.shift());
    return out;
  }
  async function more(first){
    if(st.busy) return; st.busy = true;
    try{
      const out = isIcon() ? await nextIcons() : await nextRemote();
      if(!out.length){ say(first ? 'Nothing found for “' + esc(st.q) + '”. Try another word or another place to search.' : 'No more pictures for this word. Try another word or place.', true); st.busy = false; return; }
      out.forEach(o=> st.shown.add(o.id));
      st.cur = out; await draw();
      say(st.liked.size ? 'These are chosen to be close to the <b>' + st.liked.size + '</b> you ticked.' : 'Showing ' + out.length + ' for “' + esc(st.q) + '”.');
    }catch(e){ say(esc(e.message || e) + (st.src.kind === 'pix' ? ' (If it says 400 the key is wrong: paste it again.)' : ''), true); if(st.src.kind === 'pix' && /400|401|403/.test(e.message)){ store('pixkey', ''); chrome(); } }
    st.busy = false;
  }
  async function draw(){
    grid.innerHTML = '';
    st.cur.forEach(it=>{
      const card = document.createElement('div');
      card.style.cssText = 'border:1px solid var(--line2);border-radius:8px;padding:6px;display:flex;flex-direction:column;gap:5px;background:var(--bg2);min-width:0';
      card.innerHTML = `<div style="height:96px;background:#f2f2f2;border-radius:6px;display:flex;align-items:center;justify-content:center"><img draggable="false" style="max-width:100%;max-height:92px;object-fit:contain"></div>
        <div class="lname" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(it.title)}">${esc(it.title)}</div>
        <div class="hint" style="font-size:10px">${esc(it.set)} · ${esc(it.lic)}${it.free ? '' : ' (credit)'}${it.page ? ` · <a href="${esc(it.page)}" target="_blank" rel="noopener" style="color:var(--acc2)">source</a>` : ''}</div>
        <label style="display:flex;align-items:center;gap:5px;font-size:11px;width:auto"><input type="checkbox" class="caLike" style="flex:none"> More like this</label>
        <button class="btn sm caAdd">Add to assets</button>`;
      it.card = card; grid.appendChild(card);
      const like = $('.caLike', card); like.checked = st.liked.has(it.id);
      like.onchange = ()=>{ like.checked ? st.liked.set(it.id, it) : st.liked.delete(it.id); };
      $('.caAdd', card).onclick = ()=> addOne(it);
      const img = $('img', card);
      if(it.icon) iconSvg(it.id).then(t=>{ it.text = t; img.src = dataUri(colourise(t, st.col)); }).catch(()=>{ img.alt = 'failed'; });
      else img.src = it.thumb;
    });
  }
  async function addOne(it){
    const btn = $('.caAdd', it.card); if(btn.dataset.done) return;
    btn.disabled = true;
    try{
      await addToAssets(it, st.col);
      btn.dataset.done = '1'; btn.textContent = 'In your assets ✓';
    }catch(e){ toast('Could not add that one: ' + (e && e.message || e), 5000, 'err'); }
    btn.disabled = false;
  }
  async function addTicked(){
    const todo = st.cur.filter(it=> $('.caLike', it.card).checked && !$('.caAdd', it.card).dataset.done);
    if(!todo.length){ toast('Tick “More like this” on the pictures you want first.', 3500); return; }
    for(const it of todo) await addOne(it);
    toast(todo.length + ' picture' + (todo.length > 1 ? 's' : '') + ' added to your assets.', 3500);
  }
  $('#caGo', body).onclick = newSearch;
  q.addEventListener('keydown', e=>{ e.stopPropagation(); if(e.key === 'Enter'){ e.preventDefault(); newSearch(); } });
  $('#caCol', body).oninput = e=>{ st.col = e.target.value; st.cur.forEach(it=>{ if(it.text) $('img', it.card).src = dataUri(colourise(it.text, st.col)); }); };
  $('#caCr', body).onchange = e=>{ st.credit = e.target.checked; };
  setTimeout(()=> q.focus(), 50);
}

/* ---- one result -> one entry in the assets library (the same record the "Save to assets" button makes) ---- */
const fetchBlob = async url=>{ const r = await fetch(url); if(!r.ok) throw new Error('could not download it (' + r.status + ')'); return r.blob(); };
function rasterToUrl(blob, max, type){
  return createImageBitmap(blob).then(bm=>{
    const sc = Math.min(1, max / Math.max(bm.width, bm.height)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bm.width * sc)); c.height = Math.max(1, Math.round(bm.height * sc));
    c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height); return c.toDataURL(type || 'image/png');
  });
}
const loadSvg = svg=> new Promise((res, rej)=> fabric.loadSVGFromString(svg, (objs, opts)=>{ if(!objs || !objs.length) return rej(new Error('empty picture')); res(fabric.util.groupSVGElements(objs, opts)); }));
const loadImg = url=> new Promise((res, rej)=> fabric.Image.fromURL(url, img=> img && img.width ? res(img) : rej(new Error('picture could not be read'))));

async function addToAssets(it, col){
  let obj, thumb;
  if(it.icon){
    const svg = colourise(it.text || await iconSvg(it.id), col);
    obj = await loadSvg(svg); thumb = dataUri(svg);
  } else if(it.svg){
    const svg = await (await fetch(it.full)).text();
    try{ obj = await loadSvg(svg); thumb = await rasterToUrl(await fetchBlob(it.thumb), 160); }
    catch(e){ it = { ...it, svg:false, full:it.thumb }; }
  }
  if(!obj){
    const blob = await fetchBlob(it.full), photo = /jpe?g/i.test(blob.type);
    const url = await rasterToUrl(blob, 1200, photo ? 'image/jpeg' : 'image/png');
    obj = await loadImg(url); thumb = await rasterToUrl(blob, 160);
  }
  obj.set({ left:0, top:0, originX:'left', originY:'top' }); obj.setCoords();
  // a sensible size when it is inserted: about 400 px on the longest side
  const w0 = obj.width, h0 = obj.height, sc = Math.min(1, 400 / Math.max(w0, h0)) || 1; obj.set({ scaleX:sc, scaleY:sc });
  const name = it.title.replace(/\s+/g, ' ').slice(0, 40) || 'clip art';
  const o = obj.toObject(MS.SERIALIZE_PROPS); o.name = name;
  const rec = { name, thumb, objects:[o], x:0, y:0, w:w0 * sc, h:h0 * sc, t:Date.now(),
    source:it.set + (it.by ? ' by ' + it.by : '') + ' · ' + it.lic + (it.page ? ' · ' + it.page : '') };
  await MS.groups.addRecord(rec);
  const lp = $('#leftPanel'); if(lp && lp.classList.contains('collapsed')){ lp.classList.remove('collapsed'); MS.store.set('lpCollapsed', false); MS.emit('resize'); }
}

MS.addCommand && MS.addCommand({ title:'Find clip art & pictures', cat:'File', kw:'clipart clip art svg icons search free download assets pixabay pictures', run:open });
})();
