/* Merch Studio - font browser: 700+ bundled fonts in categories, search, favourites, recents, live preview text. */
(function(){
'use strict';
const MS = window.MS, S = MS.S;
const { $, $$, esc } = MS;

const LIST = (window.FONT_MANIFEST || []).slice();
const SYSTEM = ['Arial','Georgia','Times New Roman','Courier New','Verdana','Impact','Trebuchet MS','Comic Sans MS','Tahoma','Palatino Linotype'];
SYSTEM.forEach(n=> LIST.push({ n, c:'System fonts', f:{} }));
const CATS = (window.FONT_CATEGORY_ORDER || []).concat(['System fonts']);
MS.fontList = LIST; MS.fontNames = LIST.map(f=>f.n);
MS.fontMeta = Object.fromEntries(LIST.map(f=>[f.n, f]));

let prefs = MS.store.get('fontPrefs', { fav:[], recent:[] });
const save = ()=> MS.store.set('fontPrefs', prefs);
MS.noteFont = function(n){ prefs.recent = [n, ...prefs.recent.filter(x=>x !== n)].slice(0, 12); save(); };

let el = null, cat = 'All', q = '', sample = '', onPick = null;

// pick(name) lets another panel use the browser (e.g. the morph effect's start font); pick.current = the font to highlight
MS.openFontBrowser = function(anchor, pick){
  if(el && pick){ close(); } if(el){ close(); return; }
  onPick = pick || null;
  MS.closeMenus();
  el = document.createElement('div'); el.id = 'fontBrowser';
  el.innerHTML = `
    <div class="fb-h"><b>Fonts <span class="muted" style="font-weight:400">· ${LIST.length} · click to apply, keep clicking</span></b><button class="ib" id="fbClose">${MS.icon('x')}</button></div>
    <div class="fb-tools"><select id="fbCatSel" title="Category"></select><div class="f"><span>${MS.icon('search')}</span><input type="search" id="fbQ" placeholder="Search fonts… try “stencil”, “brush”, “bold”" spellcheck="false" style="padding-left:2px"></div>
      </div>
    <div class="fb-tools" style="padding-top:0"><div class="f" style="flex:1"><input type="text" id="fbSample" placeholder="Preview text (blank = font name)" style="padding-left:8px"></div></div>
    <div class="fb-body"><div class="fb-cats" id="fbCats"></div><div class="fb-list" id="fbList"></div></div>
    <div class="fb-foot"><span id="fbCount"></span><span style="flex:1"></span><span>Esc or ✕ closes · sits over the right panel</span></div>`;
  document.body.appendChild(el);
  el.classList.add('docked'); place(); window.addEventListener('resize', place); MS.on('resize', place);
  $('#fbClose').onclick = close;
  $('#fbQ').addEventListener('input', e=>{ q = e.target.value.trim().toLowerCase(); render(); });
  $('#fbSample').addEventListener('input', e=>{ sample = e.target.value; render(true); });
  $('#fbSample').value = sample;
  $('#fbCats').addEventListener('click', e=>{ const b = e.target.closest('button'); if(b){ cat = b.dataset.c; render(); $('#fbList').scrollTop = 0; } });
  $('#fbCatSel').addEventListener('change', e=>{ cat = e.target.value; render(); $('#fbList').scrollTop = 0; });
  $('#fbList').addEventListener('click', e=>{
    const st = e.target.closest('.star'); const it = e.target.closest('.fb-item'); if(!it) return;
    const n = it.dataset.n;
    if(st){ const i = prefs.fav.indexOf(n); if(i >= 0) prefs.fav.splice(i, 1); else prefs.fav.push(n); save(); render(true); return; }
    if(onPick){ onPick(n); onPick.current = n; MS.noteFont && MS.noteFont(n); } else MS.text.setFont(n);
    $$('.fb-item', el).forEach(x=> x.classList.toggle('active', x.dataset.n === n));
    MS.tools.renderOptions && S.tool !== 'move' && MS.tools.renderOptions();
  });
  document.addEventListener('keydown', onKey, true);
  window.MSI.hydrate(el);
  render(); setTimeout(()=> $('#fbQ') && $('#fbQ').focus(), 30);
};
function place(){
  if(!el) return; const d = $('#dock').getBoundingClientRect();
  Object.assign(el.style, { left:d.left + 'px', top:d.top + 'px', width:d.width + 'px', height:d.height + 'px' });
}
function onKey(e){ if(e.key === 'Escape' && el){ e.stopPropagation(); close(); } }
function close(){ onPick = null; if(!el) return; window.removeEventListener('resize', place); MS.off('resize', place); document.removeEventListener('keydown', onKey, true); el.remove(); el = null; }
MS.closeFontBrowser = close;

function currentFont(){
  if(onPick && onPick.current) return onPick.current;
  const o = MS.canvas && MS.canvas.getActiveObject();
  if(o && MS.isTextObj(o)) return (o._isCurvedText ? (o._curveStyle || {}).fontFamily : o.fontFamily) || S.font;
  return S.font;
}
function item(f, active){
  const fav = prefs.fav.includes(f.n);
  return `<div class="fb-item${active === f.n ? ' active' : ''}" data-n="${esc(f.n)}"><div class="pv" style="font-family:'${esc(f.n)}'">${esc(sample || f.n)}</div><div class="nm">${esc(f.n)}</div><div class="star${fav ? ' on' : ''}" title="Favourite">${MS.icon('staro')}</div></div>`;
}
function render(keepScroll){
  if(!el) return;
  const active = currentFont();
  const counts = {}; LIST.forEach(f=> counts[f.c] = (counts[f.c] || 0) + 1);
  const cats = ['All', '★ Favourites', 'Recent'].concat(CATS);
  const cs = $('#fbCatSel'); if(cs){ cs.innerHTML = cats.map(c=> '<option value="' + esc(c) + '"' + (c === cat ? ' selected' : '') + '>' + esc(c) + '</option>').join(''); }
  $('#fbCats').innerHTML = cats.map(c=>{
    const n = c === 'All' ? LIST.length : c === '★ Favourites' ? prefs.fav.length : c === 'Recent' ? prefs.recent.length : (counts[c] || 0);
    return `<button data-c="${esc(c)}" class="${c === cat ? 'active' : ''}"><span>${esc(c)}</span><span class="cnt">${n}</span></button>`;
  }).join('');
  const top = $('#fbList').scrollTop;
  let html = '', shown = 0;
  const match = f=> !q || f.n.toLowerCase().includes(q) || f.c.toLowerCase().includes(q);
  if(cat === '★ Favourites'){ prefs.fav.map(n=>MS.fontMeta[n]).filter(f=>f && match(f)).forEach(f=>{ html += item(f, active); shown++; }); if(!shown) html = '<div class="empty-note">Click the ☆ on any font to keep it here.</div>'; }
  else if(cat === 'Recent'){ prefs.recent.map(n=>MS.fontMeta[n]).filter(f=>f && match(f)).forEach(f=>{ html += item(f, active); shown++; }); if(!shown) html = '<div class="empty-note">Fonts you apply show up here.</div>'; }
  else {
    if(cat === 'All'){
      const fv = prefs.fav.map(n=>MS.fontMeta[n]).filter(f=>f && match(f));
      if(fv.length){ html += '<div class="fb-cat-h">★ Favourites</div>' + fv.map(f=>item(f, active)).join(''); }
      const rc = prefs.recent.map(n=>MS.fontMeta[n]).filter(f=>f && match(f)).slice(0, 6);
      if(rc.length && !q){ html += '<div class="fb-cat-h">Recently used</div>' + rc.map(f=>item(f, active)).join(''); }
    }
    CATS.forEach(c=>{
      if(cat !== 'All' && cat !== c) return;
      const fs = LIST.filter(f=> f.c === c && match(f)); if(!fs.length) return;
      html += `<div class="fb-cat-h">${esc(c)} · ${fs.length}</div>` + fs.map(f=>item(f, active)).join(''); shown += fs.length;
    });
    if(!shown) html = '<div class="empty-note">No fonts match “' + esc(q) + '”.</div>';
  }
  $('#fbList').innerHTML = html;
  if(keepScroll === true) $('#fbList').scrollTop = top;
  $('#fbCount').textContent = shown + ' font' + (shown === 1 ? '' : 's') + ' shown';
  const act = $('#fbList .fb-item.active'); if(act && !keepScroll && !q && cat === 'All') act.scrollIntoView({ block:'center' });
}
MS.on('font', ()=>{ if(el) render(true); });
})();

