/* Merch Studio - UI toolkit: namespace, event bus, tooltips, menus, modals, docks, number scrubbing, command palette. */
(function(){
'use strict';

const MS = window.MS = window.MS || {};
MS.version = '2.0';
const $ = MS.$ = (s, el)=> (el||document).querySelector(s);
const $$ = MS.$$ = (s, el)=> Array.from((el||document).querySelectorAll(s));
MS.clamp = (v,a,b)=> Math.max(a, Math.min(b, v));
MS.uid = ()=> 'o' + Math.random().toString(36).slice(2,10);
MS.esc = s=> String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
MS.store = {
  get(k, d){ try{ const v = localStorage.getItem('ms.'+k); return v==null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem('ms.'+k, JSON.stringify(v)); }catch(e){} },
};

/* ---------- tiny event bus ---------- */
const handlers = {};
MS.on = (evt, fn)=> { (handlers[evt] = handlers[evt] || []).push(fn); return fn; };
MS.off = (evt, fn)=> { handlers[evt] = (handlers[evt]||[]).filter(f=>f!==fn); };
MS.emit = (evt, data)=> { (handlers[evt]||[]).slice().forEach(fn=>{ try{ fn(data); }catch(e){ console.error('[MS:'+evt+']', e); } }); };

MS.icon = (n, c)=> window.MSI.svg(n, c);

/* ---------- toast ---------- */
let toastT = null;
MS.toast = function(msg, ms, kind){
  const t = $('#toast'); if(!t) return;
  t.className = '';
  t.innerHTML = MS.icon(kind==='err' ? 'warning' : 'info') + '<span></span>';
  t.lastChild.textContent = msg;
  if(kind==='err') t.classList.add('err');
  void t.offsetWidth; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(()=> t.classList.remove('show'), ms || 2600);
};
MS.hint = txt=> { const h = $('#sbHint'); if(h) h.textContent = txt || 'Ready'; };

/* ---------- tooltips: data-tip="Label|Shortcut" ---------- */
(function(){
  let tip = null, timer = null, cur = null;
  function hide(){ clearTimeout(timer); cur = null; if(tip){ tip.remove(); tip = null; } }
  document.addEventListener('mouseover', e=>{
    const el = e.target.closest && e.target.closest('[data-tip]');
    if(el === cur) return;
    hide();
    if(!el) return;
    cur = el;
    timer = setTimeout(()=>{
      if(!document.body.contains(el)) return;
      const [label, key] = el.getAttribute('data-tip').split('|');
      tip = document.createElement('div'); tip.className = 'tip';
      tip.innerHTML = '<span>'+MS.esc(label)+'</span>' + (key ? '<kbd>'+MS.esc(key)+'</kbd>' : '');
      document.body.appendChild(tip);
      const r = el.getBoundingClientRect(), tr = tip.getBoundingClientRect();
      let x = r.left + r.width/2 - tr.width/2, y = r.bottom + 8;
      if(el.closest('#toolbox')){ x = r.right + 8; y = r.top + r.height/2 - tr.height/2; }
      else if(y + tr.height > innerHeight - 6) y = r.top - tr.height - 8;
      tip.style.left = MS.clamp(x, 6, innerWidth - tr.width - 6) + 'px';
      tip.style.top = MS.clamp(y, 6, innerHeight - tr.height - 6) + 'px';
    }, 420);
  });
  document.addEventListener('mousedown', hide, true);
  document.addEventListener('wheel', hide, {passive:true});
})();

/* ---------- popup menus ---------- */
let openMenus = [];
MS.closeMenus = function(){ openMenus.forEach(m=>m.remove()); openMenus = []; $$('.menu-btn.open').forEach(b=>b.classList.remove('open')); };
MS.menu = function(items, x, y, opts){
  opts = opts || {};
  if(!opts.keep) MS.closeMenus();
  const m = document.createElement('div'); m.className = 'menu';
  items.forEach(it=>{
    if(it === '-' || it.sep){ const s = document.createElement('div'); s.className = 'sep'; m.appendChild(s); return; }
    if(it.hd){ const h = document.createElement('div'); h.className = 'hd'; h.textContent = it.hd; m.appendChild(h); return; }
    const row = document.createElement('div'); row.className = 'mi';
    const dis = typeof it.disabled === 'function' ? it.disabled() : it.disabled;
    if(dis) row.classList.add('disabled');
    const checked = typeof it.checked === 'function' ? it.checked() : it.checked;
    row.innerHTML = (it.checked !== undefined ? '<span class="chk-m">'+(checked ? MS.icon('check') : '')+'</span>' : '') +
      (it.icon ? MS.icon(it.icon) : (it.checked !== undefined ? '' : '<span style="width:16px"></span>')) +
      '<span class="lab">'+MS.esc(typeof it.label === 'function' ? it.label() : it.label)+'</span>' + (it.key ? '<kbd>'+MS.esc(it.key)+'</kbd>' : '');
    if(it.sub){
      row.classList.add('sub');
      let subEl = null;
      const showSub = ()=>{
        if(subEl) return;
        const r = row.getBoundingClientRect();
        subEl = MS.menu(typeof it.sub === 'function' ? it.sub() : it.sub, r.right - 4, r.top - 6, {keep:true, parentRow:row});
        subEl.addEventListener('mouseleave', ()=>{ setTimeout(()=>{ if(subEl && !row.matches(':hover') && !subEl.matches(':hover')){ subEl.remove(); openMenus = openMenus.filter(o=>o!==subEl); subEl = null; } }, 120); });
      };
      row.addEventListener('mouseenter', showSub);
      row.addEventListener('click', showSub);
      row.addEventListener('mouseleave', ()=> setTimeout(()=>{ if(subEl && !row.matches(':hover') && !subEl.matches(':hover')){ subEl.remove(); openMenus = openMenus.filter(o=>o!==subEl); subEl = null; } }, 160));
    } else if(!dis){
      row.addEventListener('click', e=>{ e.stopPropagation(); MS.closeMenus(); try{ it.action && it.action(); }catch(err){ console.error(err); MS.toast('Something went wrong: ' + err.message, 4000, 'err'); } });
    }
    m.appendChild(row);
  });
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = MS.clamp(x, 4, innerWidth - r.width - 4) + 'px';
  m.style.top = MS.clamp(y, 4, innerHeight - r.height - 4) + 'px';
  openMenus.push(m);
  return m;
};
document.addEventListener('mousedown', e=>{ if(!e.target.closest('.menu') && !e.target.closest('.menu-btn')) MS.closeMenus(); }, true);
window.addEventListener('blur', ()=> MS.closeMenus());

MS.buildMenubar = function(defs){
  const nav = $('#menus'); nav.innerHTML = '';
  defs.forEach(d=>{
    const b = document.createElement('button'); b.className = 'menu-btn'; b.textContent = d.label;
    const open = ()=>{
      const r = b.getBoundingClientRect();
      const wasOpen = b.classList.contains('open');
      MS.closeMenus();
      if(wasOpen) return;
      b.classList.add('open');
      MS.menu(typeof d.items === 'function' ? d.items() : d.items, r.left, r.bottom + 4);
    };
    b.addEventListener('click', open);
    b.addEventListener('mouseenter', ()=>{ if($$('.menu-btn.open').length && !b.classList.contains('open')){ MS.closeMenus(); b.classList.add('open'); const r = b.getBoundingClientRect(); MS.menu(typeof d.items === 'function' ? d.items() : d.items, r.left, r.bottom + 4); } });
    nav.appendChild(b);
  });
};

/* ---------- modal ---------- */
MS.modal = function(o){
  const ov = document.createElement('div'); ov.className = 'modal-overlay';
  const m = document.createElement('div'); m.className = 'modal' + (o.wide ? ' wide' : '') + (o.med ? ' med' : '');
  m.innerHTML = '<div class="modal-h"><h2></h2>'+(o.noClose ? '' : '<button class="ib" data-close>'+MS.icon('x')+'</button>')+'</div><div class="modal-b"></div>' + (o.footer === false ? '' : '<div class="modal-f"></div>');
  m.querySelector('h2').textContent = o.title || '';
  const body = m.querySelector('.modal-b');
  if(typeof o.body === 'string') body.innerHTML = o.body; else if(o.body) body.appendChild(o.body);
  const foot = m.querySelector('.modal-f');
  const api = { el:m, body, foot, overlay:ov, close(){ document.removeEventListener('keydown', onKey, true); ov.remove(); o.onClose && o.onClose(); } };
  (o.buttons || []).forEach(b=>{
    if(b.spacer){ const s = document.createElement('span'); s.className = 'sp'; s.id = b.id || ''; s.textContent = b.text || ''; foot.appendChild(s); return; }
    const btn = document.createElement('button'); btn.className = 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '');
    btn.innerHTML = (b.icon ? MS.icon(b.icon) : '') + MS.esc(b.label); if(b.id) btn.id = b.id;
    btn.addEventListener('click', ()=>{ const r = b.action ? b.action(api, btn) : undefined; if(r !== false && !b.keepOpen) api.close(); });
    foot.appendChild(btn);
  });
  m.querySelector('[data-close]') && m.querySelector('[data-close]').addEventListener('click', ()=> api.close());
  ov.addEventListener('mousedown', e=>{ if(e.target === ov && !o.noClose && !o.sticky) api.close(); });
  const onKey = e=>{ if(e.key === 'Escape' && !o.noClose){ e.stopPropagation(); api.close(); } };
  document.addEventListener('keydown', onKey, true);
  ov.appendChild(m); document.body.appendChild(ov);
  window.MSI.hydrate(m);
  return api;
};

/* ---------- accordion sections, dock tabs, splitters ---------- */
function wireAccordions(root){
  (root||document).querySelectorAll('.sect > .sect-h').forEach(h=>{
    if(h.dataset.wired) return; h.dataset.wired = '1';
    h.addEventListener('click', e=>{
      if(e.target.closest('button,input,select,a')) return;
      const s = h.parentElement; s.classList.toggle('collapsed');
      const k = s.dataset.sect; if(k) MS.store.set('sect.'+k, s.classList.contains('collapsed'));
    });
    const s = h.parentElement, k = s.dataset.sect;
    if(k && MS.store.get('sect.'+k, false)) s.classList.add('collapsed');
  });
}
MS.wireAccordions = wireAccordions;

MS.showPage = function(page){
  const tab = $(`.dock-tab[data-page="${page}"]`); if(!tab) return;
  const group = tab.closest('.dock-group');
  $$('.dock-tab', group).forEach(t=>t.classList.toggle('active', t===tab));
  $$('.dock-page', group).forEach(p=>p.classList.toggle('hidden', p.id !== 'page-' + page));
  MS.emit('page', page);
};
function wireDock(){
  $$('.dock-tab').forEach(t=> t.addEventListener('click', ()=> MS.showPage(t.dataset.page)));
  // splitter between the two dock groups
  const sp = $('#dockSplit'), top = $('#dockTop'), bot = $('#dockBottom'), dock = $('#dock');
  sp.addEventListener('pointerdown', e=>{
    sp.setPointerCapture(e.pointerId); sp.classList.add('drag');
    const startY = e.clientY, startTop = top.getBoundingClientRect().height, total = dock.getBoundingClientRect().height - sp.offsetHeight;
    const move = ev=>{
      const h = MS.clamp(startTop + (ev.clientY - startY), 120, total - 120);
      top.style.flex = '0 0 ' + h + 'px'; bot.style.flex = '1 1 0';
      MS.store.set('dockSplit', h);
    };
    const up = ()=>{ sp.classList.remove('drag'); sp.removeEventListener('pointermove', move); sp.removeEventListener('pointerup', up); };
    sp.addEventListener('pointermove', move); sp.addEventListener('pointerup', up);
  });
  const bt = $('#dockCollapse'), setCol = on=>{ bot.classList.toggle('collapsed', on); sp.classList.toggle('off', on); top.classList.toggle('full', on); MS.store.set('dockCollapsed', on); MS.emit('resize'); };
  bt.addEventListener('click', ()=> setCol(!bot.classList.contains('collapsed')));
  $$('.dock-tab', bot).forEach(t=> t.addEventListener('click', ()=>{ if(bot.classList.contains('collapsed')) setCol(false); }));
  $('#tabsBottom').addEventListener('dblclick', e=>{ if(!e.target.closest('.dock-collapse')) setCol(!bot.classList.contains('collapsed')); });
  if(MS.store.get('dockCollapsed', false)) setCol(true);
  const saved = MS.store.get('dockSplit', null);
  if(saved){ top.style.flex = '0 0 ' + saved + 'px'; bot.style.flex = '1 1 0'; }
  // dock width
  const dr = $('#dockResize');
  dr.addEventListener('pointerdown', e=>{
    dr.setPointerCapture(e.pointerId); dr.classList.add('drag');
    const startX = e.clientX, startW = dock.getBoundingClientRect().width;
    const move = ev=>{
      const w = MS.clamp(startW - (ev.clientX - startX), 260, 560);
      document.documentElement.style.setProperty('--dockW', w + 'px'); MS.store.set('dockW', w); MS.emit('resize');
    };
    const up = ()=>{ dr.classList.remove('drag'); dr.removeEventListener('pointermove', move); dr.removeEventListener('pointerup', up); };
    dr.addEventListener('pointermove', move); dr.addEventListener('pointerup', up);
  });
  const w = MS.store.get('dockW', null); if(w) document.documentElement.style.setProperty('--dockW', w + 'px');
}

/* ---------- scrubbable number labels + range fill + arrow keys ---------- */
function wireInputs(){
  document.addEventListener('pointerdown', e=>{
    const lab = e.target.closest && e.target.closest('[data-scrub]'); if(!lab) return;
    const inp = document.getElementById(lab.dataset.scrub); if(!inp) return;
    e.preventDefault();
    const step = parseFloat(inp.step) || 1, min = inp.min !== '' ? +inp.min : -Infinity, max = inp.max !== '' ? +inp.max : Infinity;
    const startX = e.clientX, start = parseFloat(inp.value) || 0;
    lab.setPointerCapture(e.pointerId); document.body.classList.add('scrub-active');
    let moved = false;
    const move = ev=>{
      const d = (ev.clientX - startX) * (ev.shiftKey ? 5 : ev.altKey ? 0.1 : 1) * Math.max(step, 0.1 + Math.abs(start) * 0.004);
      let v = MS.clamp(start + Math.round(d / step) * step, min, max);
      if(step < 1) v = Math.round(v / step) * step;
      if(v !== +inp.value){ moved = true; inp.value = +v.toFixed(4); inp.dispatchEvent(new Event('input', {bubbles:true})); }
    };
    const up = ()=>{ lab.removeEventListener('pointermove', move); lab.removeEventListener('pointerup', up); document.body.classList.remove('scrub-active'); if(moved) inp.dispatchEvent(new Event('change', {bubbles:true})); };
    lab.addEventListener('pointermove', move); lab.addEventListener('pointerup', up);
  });
  /* up / down buttons on every number box (hold to repeat; Shift = x10, Alt = x0.1) */
  const addSpin = inp=>{ if(inp.__nsp || inp.type !== 'number' || (inp.nextElementSibling && inp.nextElementSibling.classList.contains('nsp'))) return; inp.__nsp = 1; const sp = document.createElement('span'); sp.className = 'nsp'; sp.innerHTML = '<button type="button" tabindex="-1" data-d="1" aria-label="Up">▲</button><button type="button" tabindex="-1" data-d="-1" aria-label="Down">▼</button>'; inp.insertAdjacentElement('afterend', sp); };
  const scanSpin = ()=> document.querySelectorAll('input[type=number]').forEach(addSpin);
  let spinT = 0; new MutationObserver(()=>{ clearTimeout(spinT); spinT = setTimeout(scanSpin, 40); }).observe(document.body, { childList:true, subtree:true }); scanSpin();
  document.addEventListener('pointerdown', e=>{
    const b = e.target.closest && e.target.closest('.nsp button'); if(!b) return; e.preventDefault();
    const inp = b.parentNode.previousElementSibling; if(!inp || inp.disabled) return;
    const dir = +b.dataset.d, base = parseFloat(inp.step), unit = isFinite(base) && base > 0 ? base : 1, dec = (String(unit).split('.')[1] || '').length;
    const bump = ev=>{ const st = unit * (ev.shiftKey ? 10 : ev.altKey ? .1 : 1); let v = (parseFloat(inp.value) || 0) + dir * st; if(inp.min !== '') v = Math.max(+inp.min, v); if(inp.max !== '') v = Math.min(+inp.max, v); v = +v.toFixed(Math.min(6, dec + (ev.altKey ? 1 : 0))); if(String(v) !== inp.value){ inp.value = v; inp.dispatchEvent(new Event('input', { bubbles:true })); } };
    let rep = null, hold = null; bump(e);
    hold = setTimeout(()=>{ rep = setInterval(()=> bump(e), 55); }, 380);
    const up = ()=>{ clearTimeout(hold); clearInterval(rep); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); inp.dispatchEvent(new Event('change', { bubbles:true })); };
    document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  });
  document.addEventListener('input', e=>{
    const r = e.target;
    if(r.type === 'range') fillRange(r);
  }, true);
  document.addEventListener('keydown', e=>{
    const t = e.target;
    if(t.tagName === 'INPUT' && t.type === 'number' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')){
      e.preventDefault();
      const step = (parseFloat(t.step) || 1) * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);
      let v = (parseFloat(t.value) || 0) + (e.key === 'ArrowUp' ? step : -step);
      if(t.min !== '') v = Math.max(+t.min, v); if(t.max !== '') v = Math.min(+t.max, v);
      t.value = +v.toFixed(4); t.dispatchEvent(new Event('input', {bubbles:true})); t.dispatchEvent(new Event('change', {bubbles:true}));
    }
    if(t.tagName === 'INPUT' && (t.type === 'number' || t.type === 'text') && e.key === 'Enter'){ t.blur(); }
  });
}
function fillRange(r){
  const min = +r.min || 0, max = +r.max || 100, v = +r.value;
  r.style.setProperty('--p', ((v - min) / (max - min) * 100) + '%');
}
MS.fillRange = fillRange;
MS.syncRanges = root=> $$('input[type=range]', root).forEach(fillRange);

/* ---------- command palette ---------- */
MS.commands = [];
MS.addCommand = c=> { MS.commands.push(c); };
MS.openPalette = function(){
  if($('#cmdk')) return;
  const ov = document.createElement('div'); ov.className = 'modal-overlay'; ov.style.alignItems = 'flex-start';
  ov.innerHTML = '<div id="cmdk"><input type="text" placeholder="Type a command… (e.g. kaleidoscope, export svg, mirror, new)" spellcheck="false"><div id="cmdkList"></div></div>';
  document.body.appendChild(ov);
  const inp = $('#cmdk input'), list = $('#cmdkList'); let sel = 0, shown = [];
  const render = ()=>{
    const q = inp.value.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    shown = MS.commands.filter(c=>{ const hay = (c.title + ' ' + (c.cat||'') + ' ' + (c.kw||'')).toLowerCase(); return words.every(w=>hay.includes(w)); }).slice(0, 60);
    sel = Math.min(sel, Math.max(0, shown.length-1));
    list.innerHTML = shown.map((c,i)=>`<div class="ci${i===sel?' sel':''}" data-i="${i}"><span class="cat">${MS.esc(c.cat||'')}</span><span>${MS.esc(c.title)}</span>${c.key?'<kbd>'+MS.esc(c.key)+'</kbd>':''}</div>`).join('') || '<div class="empty-note">No matching command</div>';
  };
  const close = ()=> ov.remove();
  const run = i=>{ const c = shown[i]; if(!c) return; close(); setTimeout(()=>{ try{ c.run(); }catch(e){ console.error(e); MS.toast(e.message, 4000, 'err'); } }, 10); };
  inp.addEventListener('input', ()=>{ sel = 0; render(); });
  inp.addEventListener('keydown', e=>{
    if(e.key === 'Escape'){ close(); }
    else if(e.key === 'ArrowDown'){ sel = Math.min(sel+1, shown.length-1); render(); e.preventDefault(); $('.ci.sel', list) && $('.ci.sel', list).scrollIntoView({block:'nearest'}); }
    else if(e.key === 'ArrowUp'){ sel = Math.max(sel-1, 0); render(); e.preventDefault(); $('.ci.sel', list) && $('.ci.sel', list).scrollIntoView({block:'nearest'}); }
    else if(e.key === 'Enter'){ run(sel); }
  });
  list.addEventListener('click', e=>{ const ci = e.target.closest('.ci'); if(ci) run(+ci.dataset.i); });
  ov.addEventListener('mousedown', e=>{ if(e.target === ov) close(); });
  render(); inp.focus();
};

/* ---------- misc helpers ---------- */
MS.download = function(blob, filename){
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 5000);
};
MS.fmtBytes = n=> n < 1024 ? n + ' B' : n < 1048576 ? (n/1024).toFixed(n < 10240 ? 1 : 0) + ' KB' : (n/1048576).toFixed(n < 10485760 ? 2 : 1) + ' MB';
MS.makeColorCss = c=> typeof c === 'string' ? c : '#888';

MS.initUI = function(){
  window.MSI.hydrate(document);
  wireAccordions(document); wireDock(); wireInputs();
  MS.syncRanges(document);
};

})();
