/* Merch Studio - effects: drop shadow, outer glow, clean outline, and procedural "distress" (worn-print) masks. */
(function(){
'use strict';
const MS = window.MS, S = MS.S;
const { $, $$, clamp } = MS;
const cv = ()=> MS.canvas;
let syncing = false;

/* ============ distress masks ============ */
function rng(seed){ let s = seed >>> 0 || 1; return ()=>{ s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const maskCache = new Map();
function valueNoise(w, h, cell, rnd){
  const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2, g = new Float32Array(gw * gh); for(let i = 0; i < g.length; i++) g[i] = rnd();
  const out = new Float32Array(w * h);
  for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){
    const fx = x / cell, fy = y / cell, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, sx = tx*tx*(3 - 2*tx), sy = ty*ty*(3 - 2*ty);
    const a = g[iy*gw + ix], b = g[iy*gw + ix + 1], c = g[(iy+1)*gw + ix], d = g[(iy+1)*gw + ix + 1];
    out[y*w + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  return out;
}
// returns a canvas whose ALPHA marks the parts to ERASE
function makeMask(kind, w, h, amount, size, seed){
  const key = [kind, w, h, amount, size, seed].join('|'); if(maskCache.has(key)) return maskCache.get(key);
  const W = clamp(Math.round(w), 8, 1600), H = clamp(Math.round(h), 8, 1600), rnd = rng(seed * 7919 + 13);
  const cvs = document.createElement('canvas'); cvs.width = W; cvs.height = H; const ctx = cvs.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data, amt = amount / 100, cell = Math.max(2, size / 100 * Math.max(W, H) / 10);
  const set = (i, a)=>{ d[i*4] = d[i*4+1] = d[i*4+2] = 0; d[i*4+3] = clamp(a, 0, 255); };
  if(kind === 'grunge' || kind === 'crack' || kind === 'fade'){
    const n1 = valueNoise(W, H, cell * 2.2, rnd), n2 = valueNoise(W, H, cell * .8, rnd), n3 = valueNoise(W, H, cell * .3 + 1, rnd);
    for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
      const i = y*W + x; let v = n1[i] * .5 + n2[i] * .32 + n3[i] * .18;
      if(kind === 'crack'){ const ridge = Math.abs(n1[i] - .5) * 2, r2 = Math.abs(n2[i] - .5) * 2; v = 1 - Math.min(ridge, r2 * 1.1); v = Math.pow(v, 6); set(i, v > 1 - amt * .22 ? 255 : 0); continue; }
      if(kind === 'fade'){ const ex = Math.min(x, W - 1 - x) / (W * .5), ey = Math.min(y, H - 1 - y) / (H * .5), e = Math.min(ex, ey); v = v * .6 + (1 - Math.min(1, e * 3)) * .9; }
      const th = 1 - amt * .62; set(i, v > th ? clamp((v - th) / .08 * 255, 0, 255) : 0);
    }
  } else if(kind === 'scratch'){
    ctx.putImageData(img, 0, 0); ctx.strokeStyle = '#000'; ctx.lineCap = 'round';
    const n = Math.round(amt * 160 * (W * H) / 360000) + 6;
    for(let i = 0; i < n; i++){ const x = rnd() * W, y = rnd() * H, a = (rnd() - .5) * .9 + (rnd() > .5 ? 0 : Math.PI / 2), len = (.04 + rnd() * .35) * Math.max(W, H);
      ctx.globalAlpha = .55 + rnd() * .45; ctx.lineWidth = (.4 + rnd() * 1.6) * (size / 40 + .4) * Math.max(W, H) / 700 + .4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke(); }
    ctx.globalAlpha = 1; maskCache.set(key, cvs); return cvs;
  } else if(kind === 'spray' || kind === 'stamp'){
    const n = valueNoise(W, H, cell * 3, rnd);
    for(let i = 0; i < W * H; i++){ const r = rnd(); const density = kind === 'stamp' ? (n[i] * .7 + r * .3) : r; const th = 1 - amt * (kind === 'stamp' ? .55 : .5); set(i, density > th ? 255 : 0); }
    if(kind === 'spray'){ ctx.putImageData(img, 0, 0); ctx.filter = 'blur(' + Math.max(.4, cell / 6) + 'px)'; const t = document.createElement('canvas'); t.width = W; t.height = H; t.getContext('2d').drawImage(cvs, 0, 0); ctx.clearRect(0, 0, W, H); ctx.drawImage(t, 0, 0); ctx.filter = 'none'; maskCache.set(key, cvs); return cvs; }
  } else if(kind === 'halftone'){
    const step = Math.max(4, cell * 1.4); ctx.fillStyle = '#000';
    for(let y = 0, row = 0; y < H + step; y += step * .87, row++) for(let x = (row % 2) * step / 2; x < W + step; x += step){
      const t = (x / W) * .8 + (y / H) * .2, r = step * .6 * clamp(t * (.5 + amt) - .1, 0, 1); if(r > .3){ ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); } }
    maskCache.set(key, cvs); return cvs;
  }
  ctx.putImageData(img, 0, 0); maskCache.set(key, cvs); if(maskCache.size > 40) maskCache.delete(maskCache.keys().next().value);
  return cvs;
}
// hook: after an object draws, punch the mask out of it (object is cached so we only erase its own pixels)
// Groups (warped text) have their own drawObject, so hook both prototypes
[fabric.Object.prototype, fabric.Group.prototype].forEach(proto=>{
  const origDraw = proto.drawObject;
  proto.drawObject = function(ctx, forClipping){
    origDraw.call(this, ctx, forClipping);
    const fx = this.__fx && this.__fx.distress;
    if(fx && !forClipping && !this.__fxPass){
      const w = this.width + (this.strokeWidth || 0), h = this.height + (this.strokeWidth || 0);
      const m = makeMask(fx.kind, w * Math.abs(this.scaleX || 1), h * Math.abs(this.scaleY || 1), fx.amount, fx.size, fx.seed);
      ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(m, -w/2, -h/2, w, h); ctx.restore();
    }
  };
});
function applyDistress(o, ds){
  o.__fx = Object.assign({}, o.__fx);
  if(ds){ o.__fx.distress = ds; o.objectCaching = true; o.noScaleCache = false; }
  else { delete o.__fx.distress; if(MS.isTextObj(o)) o.objectCaching = false; }
  o.dirty = true; MS.dirtyObj(o);
}

/* ============ stackable effects: drop shadow + outer glow + outline (any combination at once) ============
   Stored per object in __fx.stack = { shadow:{on,color,alpha,blur,depth,angle}, glow:{on,color,size,bright}, outline:{on,color,width} }.
   They are painted by us (not Fabric's single native shadow): shadow first, then glow, then outline, then the element itself on top,
   so the glow can never separate from, or sit in front of, its source. */
function rgba(hex, a){ const c = MS.hexToRgb(hex); return `rgba(${c.r},${c.g},${c.b},${a})`; }
function eachTarget(fn){ cv().getActiveObjects().forEach(o=>{ fn(o); o.dirty = true; MS.dirtyObj(o); }); cv().requestRenderAll(); }
function objSize(o){ const b = o.getBoundingRect(true, true); return Math.max(b.width, b.height, 20); }
const mx = (v, b)=> typeof v === 'function' ? v(b) : v;
const FXDEF = {
  shadow:{ label:'Drop shadow', icon:'drop', def:b=>({ on:true, color:'#000000', alpha:70, blur:Math.round(b * .05), depth:Math.round(b * .04), angle:45 }),
    ctl:[['color', 'Colour'], ['alpha', 'Opacity', 0, 100, 1, '%'], ['blur', 'Blur', 0, b=> Math.max(120, b * .4), 1, 'px'], ['depth', 'Distance', 0, b=> Math.max(150, b * .3), 1, 'px'], ['angle', 'Angle', 0, 360, 1, '°']] },
  glow:{ label:'Outer glow', icon:'sun', def:b=>({ on:true, color:'#ffd24a', size:Math.max(8, Math.round(b * .08)), bright:100 }),
    ctl:[['color', 'Colour'], ['size', 'Size', 1, b=> Math.max(300, b * 1.5), 1, 'px'], ['bright', 'Brightness', 0, 300, 1, '%']] },
  outline:{ label:'Outline', icon:'stroke', def:b=>({ on:true, color:'#000000', width:Math.max(3, Math.round(b * .015)) }),
    ctl:[['color', 'Colour'], ['width', 'Width', 1, b=> Math.max(40, b * .2), 1, 'px']] },
};
const KINDS = ['shadow', 'glow', 'outline'];
const stackOf = o=> (o && o.__fx && o.__fx.stack) || null;
const anyOn = o=> { const s = stackOf(o); return !!s && KINDS.some(k=> s[k] && s[k].on); };
function ensureStack(o){ o.__fx = Object.assign({}, o.__fx); o.__fx.stack = Object.assign({}, o.__fx.stack); return o.__fx.stack; }
// older files keep a single native shadow / glow: turn it into the new stack the first time it is touched
function migrate(o){
  if(!o || !o.shadow || o.type === 'activeSelection') return;
  const sh = o.shadow, col = typeof sh.color === 'string' ? new fabric.Color(sh.color) : null, hex = col ? '#' + col.toHex() : '#000000', al = col ? Math.round(col.getAlpha() * 100) : 60, st = ensureStack(o), glow = !!(o.__fx && o.__fx.glow);
  if(glow) st.glow = { on:true, color:hex, size:Math.round(sh.blur), bright:100 };
  else st.shadow = { on:true, color:hex, alpha:al, blur:Math.round(sh.blur), depth:Math.round(Math.hypot(sh.offsetX, sh.offsetY)), angle:Math.round(((Math.atan2(sh.offsetY, sh.offsetX) * 180 / Math.PI) + 360) % 360) };
  delete o.__fx.glow; o.shadow = null; o.dirty = true;
}

/* ---- painting ---- */
const BIG = 30000;
function shadowOnly(o, ctx, color, blur, ox, oy, draw){
  const c = o.canvas, vpt = (c && c.viewportTransform) || [1, 0, 0, 1, 0, 0]; let kx = vpt[0], ky = vpt[3];
  if(c && c._isRetinaScaling && c._isRetinaScaling()){ kx *= fabric.devicePixelRatio; ky *= fabric.devicePixelRatio; }
  const sc = o.getObjectScaling(), t = ctx.getTransform();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, -BIG, 0); ctx.transform(t.a, t.b, t.c, t.d, t.e, t.f);   // the element lands off-screen, only its shadow lands on it
  ctx.shadowColor = color; ctx.shadowBlur = blur * (kx + ky) * (sc.scaleX + sc.scaleY) / 4; ctx.shadowOffsetX = ox * kx * sc.scaleX + BIG; ctx.shadowOffsetY = oy * ky * sc.scaleY;
  draw(); ctx.restore();
}
function withProps(o, props, fn){
  const list = [], walk = x=>{ list.push([x, { fill:x.fill, stroke:x.stroke, strokeWidth:x.strokeWidth, strokeUniform:x.strokeUniform, strokeLineJoin:x.strokeLineJoin, strokeDashArray:x.strokeDashArray, paintFirst:x.paintFirst, objectCaching:x.objectCaching }]); if(x._objects) x._objects.forEach(walk); };
  walk(o);
  list.forEach(([x])=>{ Object.assign(x, props); x.objectCaching = false; x.dirty = true; });
  try{ fn(); } finally { list.forEach(([x, old])=>{ Object.assign(x, old); x.dirty = true; }); }
}
function underlay(o, ctx){
  const st = stackOf(o); if(!st || !o.canvas) return;
  const sh = st.shadow && st.shadow.on ? st.shadow : null, gl = st.glow && st.glow.on ? st.glow : null, ol = st.outline && st.outline.on && o.type !== 'image' ? st.outline : null;
  ctx.save(); o.transform(ctx); o._setOpacity(ctx); o.__fxPass = true;
  try{
    const plain = ()=> o.drawObject(ctx, false);
    const sil = ol ? ()=> withProps(o, { fill:ol.color, stroke:ol.color, strokeWidth:ol.width * 2, strokeUniform:true, strokeLineJoin:'round', strokeDashArray:null, paintFirst:'fill' }, plain) : plain;
    if(sh){ const a = sh.angle * Math.PI / 180; shadowOnly(o, ctx, rgba(sh.color, clamp(sh.alpha, 0, 100) / 100), sh.blur, Math.cos(a) * sh.depth, Math.sin(a) * sh.depth, sil); }
    if(gl){
      const b = Math.max(0, gl.bright) / 100, reps = 1 + Math.floor(b);
      // tight + medium + wide halos stacked: the bright part always hugs the element, however large the glow
      [[.12, .95], [.35, .8], [1, .7]].forEach(([f, w])=>{ for(let i = 0; i < reps; i++) shadowOnly(o, ctx, rgba(gl.color, clamp(b * w, 0, 1)), Math.max(1, gl.size * f), 0, 0, sil); });
    }
    if(ol) withProps(o, { fill:ol.color, stroke:ol.color, strokeWidth:ol.width * 2, strokeUniform:true, strokeLineJoin:'round', strokeDashArray:null, paintFirst:'fill' }, plain);
  } finally { o.__fxPass = false; ctx.restore(); }
}
(function(){
  const origRender = fabric.Object.prototype.render;
  fabric.Object.prototype.render = function(ctx){
    if(!this.__fxPass && this.__fx && this.__fx.stack && anyOn(this) && !this.isNotVisible()){ try{ underlay(this, ctx); }catch(e){ console.error(e); } }
    origRender.call(this, ctx);
  };
})();

/* ---- the controls (one builder, used in the Effects section and in the pop-up beside the toolbar) ---- */
const builds = [];
let ct = null;
function commit(label, now){ clearTimeout(ct); if(now){ MS.commit(label); MS.emitSelection(); } else ct = setTimeout(()=>{ MS.commit(label); }, 350); }
function unifyIfAsked(root){
  const c = cv(), a = c.getActiveObject(), u = root && root.querySelector('.fxUnify');
  if(a && a.type === 'activeSelection' && u && u.checked && a.getObjects().length > 1){
    a.getObjects().forEach(o=>{ o.shadow = null; if(o.__fx) o.__fx = Object.assign({}, o.__fx, { stack:null }); });
    const g = a.toGroup(); g.name = MS.nextName('group'); g.objectCaching = true; g.dirty = true; c.setActiveObject(g);
  }
}
function setKind(k, on, root){
  if(on) unifyIfAsked(root);
  eachTarget(o=>{ migrate(o); const st = ensureStack(o); st[k] = Object.assign(FXDEF[k].def(objSize(o)), st[k] || {}, { on }); });
  commit((on ? 'Add ' : 'Remove ') + FXDEF[k].label.toLowerCase(), true);
}
function setParam(k, p, v){
  eachTarget(o=>{ migrate(o); const st = ensureStack(o); st[k] = Object.assign(FXDEF[k].def(objSize(o)), st[k] || {}, { on:true, [p]:v }); });
  commit(FXDEF[k].label);
}
function block(k){
  const d = FXDEF[k];
  return `<div class="fxb" data-fx="${k}"><label class="chk fxhead"><input type="checkbox" data-on> ${MS.icon(d.icon)} <b>${d.label}</b></label><div class="fxbody">` + d.ctl.map(([p, label, lo, hi, step, unit])=> p === 'color'
    ? `<div class="r"><label>${label}</label><span class="swatch-in"><input type="color" data-p="${p}" value="#000000"></span></div>`
    : `<div class="r"><label>${label}</label><input type="range" data-p="${p}" min="${lo}" max="${typeof hi === 'function' ? 300 : hi}" step="${step}"><div class="f" style="width:70px"><input type="number" data-n="${p}" min="${lo}" step="${step}"><em>${unit}</em></div></div>`).join('') + `</div></div>`;
}
function refresh(root){
  const act = cv() && cv().getActiveObjects(), o = act && act[0]; if(!o){ root.classList.add('off'); return; } root.classList.remove('off');
  migrate(o);
  const st = stackOf(o) || {}, base = objSize(cv().getActiveObject()), multi = cv().getActiveObject().type === 'activeSelection';
  const uni = root.querySelector('.fxuni'); uni.style.display = (multi || (cv().getActiveObject().type === 'group' && !cv().getActiveObject()._isCurvedText)) ? '' : 'none';
  KINDS.forEach(k=>{
    const b = root.querySelector(`.fxb[data-fx="${k}"]`), p = Object.assign(FXDEF[k].def(base), st[k] || {}), on = !!(st[k] && st[k].on);
    b.querySelector('[data-on]').checked = on; b.querySelector('.fxbody').style.display = on ? '' : 'none';
    FXDEF[k].ctl.forEach(([name, , lo, hi])=>{
      if(name === 'color'){ const e = b.querySelector('[data-p="color"]'); if(document.activeElement !== e) e.value = p.color; return; }
      const r = b.querySelector(`[data-p="${name}"]`), n = b.querySelector(`[data-n="${name}"]`); r.max = Math.max(mx(hi, base), +p[name]);
      if(document.activeElement !== r) r.value = p[name]; if(document.activeElement !== n) n.value = Math.round(p[name]); MS.fillRange(r);
    });
  });
}
MS.fx = MS.fx || {};
MS.fx.build = function(root){
  root.classList.add('fxstack');
  root.innerHTML = `<label class="chk fxuni" style="display:none"><input type="checkbox" class="fxUnify" checked> One effect around the whole selection</label>` + KINDS.map(block).join('') + `<div class="r"><button class="btn sm fxClear">Clear all effects</button><span class="hint">Shadow, glow and outline can all be on together.</span></div>`;
  window.MSI.hydrate && window.MSI.hydrate(root);
  root.addEventListener('change', e=>{ const on = e.target.closest('[data-on]'); if(on){ setKind(on.closest('.fxb').dataset.fx, on.checked, root); return; } if(e.target.dataset.p === 'color') MS.noteColor && MS.noteColor(e.target.value); });
  root.addEventListener('input', e=>{
    const t = e.target, b = t.closest('.fxb'); if(!b || t.matches('[data-on]')) return;
    const p = t.dataset.p || t.dataset.n, v = t.type === 'color' ? t.value : +t.value; if(t.type !== 'color' && !isFinite(v)) return;
    const r = b.querySelector(`[data-p="${p}"]`), n = b.querySelector(`[data-n="${p}"]`);
    if(t.dataset.n){ if(+t.value > +r.max) r.max = t.value; r.value = t.value; MS.fillRange(r); } else if(n){ n.value = Math.round(v); MS.fillRange(r); }
    setParam(b.dataset.fx, p, v);
  });
  root.querySelector('.fxClear').addEventListener('click', ()=>{ eachTarget(o=>{ migrate(o); o.shadow = null; if(o.__fx) o.__fx = Object.assign({}, o.__fx, { stack:null }); }); commit('Clear effects', true); });
  const rec = { root, refresh:()=> refresh(root) }; builds.push(rec); rec.refresh(); return rec;
};
const refreshAll = ()=>{ for(let i = builds.length - 1; i >= 0; i--){ if(!document.body.contains(builds[i].root)){ builds.splice(i, 1); continue; } builds[i].refresh(); } };
MS.fx.refresh = refreshAll;
MS.fx.active = o=> anyOn(o) || !!(o && o.shadow);
MS.fx.kindOn = (o, k)=> { const s = stackOf(o); return !!(s && s[k] && s[k].on) || (k === 'shadow' && !!(o && o.shadow && !(o.__fx && o.__fx.glow))) || (k === 'glow' && !!(o && o.shadow && o.__fx && o.__fx.glow)); };
// pop-up with the full controls, right beside the button that asked for it; `kind` switches that effect on if it is off
MS.fx.open = function(anchor, kind){
  if(!cv().getActiveObject()){ MS.toast('Select something first.'); return; }
  document.querySelectorAll('.fxpop').forEach(p=> p.remove());
  const pop = document.createElement('div'); pop.className = 'fxpop';
  pop.innerHTML = '<div class="fxpop-h"><b>Effects</b><button class="ib" data-x>' + MS.icon('x') + '</button></div><div class="fxpop-b"></div>';
  document.body.appendChild(pop);
  const rec = MS.fx.build(pop.querySelector('.fxpop-b'));
  if(kind && !MS.fx.kindOn(cv().getActiveObject(), kind)){ setKind(kind, true, rec.root); }
  const r = anchor ? anchor.getBoundingClientRect() : { left:200, bottom:80 };
  pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.left)) + 'px'; pop.style.top = Math.min(innerHeight - 60, r.bottom + 6) + 'px';
  pop.style.maxHeight = (innerHeight - parseInt(pop.style.top) - 10) + 'px';
  const close = ()=>{ pop.remove(); document.removeEventListener('mousedown', away, true); document.removeEventListener('keydown', esc, true); };
  const away = e=>{ if(!pop.contains(e.target) && !(anchor && anchor.contains(e.target))) close(); }, esc = e=>{ if(e.key === 'Escape') close(); };
  setTimeout(()=>{ document.addEventListener('mousedown', away, true); document.addEventListener('keydown', esc, true); }, 0);
  pop.querySelector('[data-x]').onclick = close;
};
MS.fx.enable = function(kind){ const root = document.getElementById('fxStack'); setKind(kind, true, root); MS.showPage('design'); };

function wire(){
  const root = $('#fxStack'); if(root) MS.fx.build(root);
  const on = (id, ev, fn)=> $('#' + id).addEventListener(ev, e=>{ if(!cv().getActiveObject()) return; fn(e); });
  const readDs = ()=>({ kind:$('#fxDistressKind').value, amount:+$('#fxDistressAmt').value, size:+$('#fxDistressSize').value, seed:+$('#fxDistressSeed').value });
  on('fxDistressKind', 'change', ()=>{ const k = $('#fxDistressKind').value; $('#fxDistressBox').style.display = k ? 'flex' : 'none'; eachTarget(o=> applyDistress(o, k ? readDs() : null)); commit(k ? 'Distress' : 'Remove distress', true); });
  ['fxDistressAmt','fxDistressSize','fxDistressSeed'].forEach(id=> on(id, 'input', ()=>{ if($('#fxDistressKind').value) { eachTarget(o=> applyDistress(o, readDs())); commit('Distress'); } }));
  on('fxDistressDice', 'click', ()=>{ $('#fxDistressSeed').value = 1 + Math.floor(Math.random() * 998); MS.fillRange($('#fxDistressSeed')); if($('#fxDistressKind').value){ eachTarget(o=> applyDistress(o, readDs())); commit('Distress', true); } });
}

Object.assign(MS.fx, {
  quick(kind){
    if(!cv().getActiveObject()){ MS.toast('Select something first.'); return; }
    if(kind === 'shadow' || kind === 'glow' || kind === 'outline') MS.fx.enable(kind);
    else if(kind === 'distress'){ $('#fxDistressKind').value = 'grunge'; $('#fxDistressKind').dispatchEvent(new Event('change')); }
    else if(kind === 'clear'){ eachTarget(o=>{ o.shadow = null; o.paintFirst = 'fill'; if(o.__fx) o.__fx = {}; o.objectCaching = !MS.isTextObj(o); }); MS.commit('Clear effects'); MS.emitSelection(); }
    MS.showPage('design');
  },
  applyDistress, makeMask,
});
MS.initFx = function(){ wire(); MS.on('selection', refreshAll); MS.on('history', refreshAll); };
MS.initFx.__ = true;
})();
