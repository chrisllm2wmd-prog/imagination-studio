/* Merch Studio - copy layer options: Mirror copy, Radial copies and true Kaleidoscope (with segment count, clipping, pivot, flatten). */
(function(){
'use strict';
const MS = window.MS, S = MS.S;
const { $, $$, toast } = MS;
const cv = ()=> MS.canvas;
const rad = d=> d * Math.PI / 180;

/* ---- gather the current selection as one absolute-positioned "source" group (clones; originals untouched) ---- */
function cloneAsync(o){ return new Promise(res=> o.clone(res, MS.SERIALIZE_PROPS)); }
async function sourceGroup(){
  const c = cv(), act = c.getActiveObject(); if(!act) return null;
  const objs = c.getActiveObjects().slice();
  c.discardActiveObject();                       // brings objects back to absolute coordinates
  const clones = [];
  for(const o of objs) clones.push(await cloneAsync(o));
  c.setActiveObject(objs.length === 1 ? objs[0] : new fabric.ActiveSelection(objs, { canvas:c }));
  const g = clones.length === 1 ? clones[0] : new fabric.Group(clones);
  return { group:g, originals:objs };
}
function reflect(o, pivot, phi){      // reflect object across the line through pivot at angle phi (degrees)
  const c = o.getCenterPoint(), p = rad(phi);
  const dx = c.x - pivot.x, dy = c.y - pivot.y, cos2 = Math.cos(2*p), sin2 = Math.sin(2*p);
  const nx = pivot.x + dx * cos2 + dy * sin2, ny = pivot.y + dx * sin2 - dy * cos2;
  o.set({ flipY: !o.flipY, angle: 2*phi - (o.angle || 0) });
  o.setPositionByOrigin(new fabric.Point(nx, ny), 'center', 'center'); o.setCoords();
}
function rotateAbout(o, pivot, deg){
  const c = o.getCenterPoint(), a = rad(deg), dx = c.x - pivot.x, dy = c.y - pivot.y;
  o.set('angle', (o.angle || 0) + deg);
  o.setPositionByOrigin(new fabric.Point(pivot.x + dx * Math.cos(a) - dy * Math.sin(a), pivot.y + dx * Math.sin(a) + dy * Math.cos(a)), 'center', 'center'); o.setCoords();
}
function wedgeClip(o, pivot, a0, a1, L){
  // wedge polygon in absolute coords -> object-local coords so it travels with the object
  const pts = [{ x:pivot.x, y:pivot.y }], n = Math.max(2, Math.ceil((a1 - a0) / 30));
  for(let i = 0; i <= n; i++){ const a = rad(a0 + (a1 - a0) * i / n); pts.push({ x:pivot.x + Math.cos(a) * L, y:pivot.y + Math.sin(a) * L }); }
  const inv = fabric.util.invertTransform(o.calcTransformMatrix());
  const loc = pts.map(p=> fabric.util.transformPoint(new fabric.Point(p.x, p.y), inv));
  const xs = loc.map(p=>p.x), ys = loc.map(p=>p.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return new fabric.Polygon(loc, { originX:'center', originY:'center', left:cx, top:cy, objectCaching:false });
}

/* ---- build the list of transformed copies ---- */
async function build(src, opt){
  const out = [], base = src.group;
  const bb = base.getBoundingRect(true, true);
  const pivot = opt.pivot(bb), L = Math.hypot(S.doc.wPx, S.doc.hPx) * 2;
  const make = async (fn, label)=>{ const c = await cloneAsync(base); fn(c); c.setCoords(); c.name = label; out.push(c); return c; };
  if(opt.kind === 'mirror'){
    const axes = opt.axes;
    if(axes.includes('v')) await make(c=> reflect(c, pivot, 90), 'Mirror ↔');
    if(axes.includes('h')) await make(c=> reflect(c, pivot, 0), 'Mirror ↕');
    if(axes.includes('d1')) await make(c=> reflect(c, pivot, 45), 'Mirror ⤢');
    if(axes.includes('d2')) await make(c=> reflect(c, pivot, 135), 'Mirror ⤡');
    if(axes.includes('v') && axes.includes('h')) await make(c=>{ reflect(c, pivot, 90); reflect(c, pivot, 0); }, 'Mirror ✛');
  } else if(opt.kind === 'radial'){
    const n = opt.n, step = 360 / n, th = Math.atan2(bb.top + bb.height/2 - pivot.y, bb.left + bb.width/2 - pivot.x) * 180 / Math.PI;
    for(let i = 1; i < n; i++) await make(c=>{
      if(opt.alt && i % 2){ rotateAbout(c, pivot, (i - 1) * step + opt.offset); reflect(c, pivot, th + opt.offset + (i - 1) * step + step / 2); }
      else rotateAbout(c, pivot, step * i + opt.offset);
    }, 'Copy ' + (i + 1));
    if(opt.offset) rotateAbout(base, pivot, opt.offset);
  } else if(opt.kind === 'kaleido'){
    const n = opt.n, w = 360 / n;
    // the wedge is anchored on the art itself so it always lands inside wedge 0, whatever its position
    const th = Math.atan2(bb.top + bb.height/2 - pivot.y, bb.left + bb.width/2 - pivot.x) * 180 / Math.PI + opt.offset;
    const a0 = th - w / 2;
    for(let k = 0; k < n; k++){
      const c = await cloneAsync(base);
      rotateAbout(c, pivot, opt.offset);
      if(k % 2 === 0) rotateAbout(c, pivot, k * w);
      else { rotateAbout(c, pivot, (k - 1) * w); reflect(c, pivot, a0 + k * w); }
      c.setCoords(); c.name = 'Segment ' + (k + 1);
      if(opt.clip){ c.clipPath = wedgeClip(c, pivot, a0 + k * w, a0 + (k + 1) * w, L); }
      out.push(c);
    }
    return { copies:out, pivot, replaceBase:true };
  }
  return { copies:out, pivot, replaceBase:false };
}

/* ---- Canvas2D live preview ---- */
async function preview(src, opt, target){
  const bb = src.group.getBoundingRect(true, true);
  const d = S.doc, size = 360, sc = size / Math.max(d.wPx, d.hPx);
  target.width = Math.round(d.wPx * sc); target.height = Math.round(d.hPx * sc);
  const res = await build(src, opt);
  const ctx = target.getContext('2d'); ctx.clearRect(0, 0, target.width, target.height);
  const all = (res.replaceBase ? [] : [src.group]).concat(res.copies);
  const keepV = cv().viewportTransform.slice(); S.exporting = true;
  try{
    all.forEach(o=>{
      const t = document.createElement('canvas'); t.width = target.width; t.height = target.height;
      const tc = t.getContext('2d'); tc.setTransform(sc, 0, 0, sc, 0, 0);
      const was = o.canvas; const fc = cv();
      if(o.clipPath){ tc.save(); const cp = o.clipPath; tc.beginPath(); const m = o.calcTransformMatrix(); const pts = cp.points.map(p=> fabric.util.transformPoint(new fabric.Point(p.x - cp.pathOffset.x + cp.left, p.y - cp.pathOffset.y + cp.top), m)); pts.forEach((p, i)=> i ? tc.lineTo(p.x, p.y) : tc.moveTo(p.x, p.y)); tc.closePath(); tc.clip(); o.render(tc); tc.restore(); }
      else o.render(tc);
      ctx.drawImage(t, 0, 0);
    });
  } finally { S.exporting = false; }
}

/* ---- apply to the document ---- */
async function apply(src, opt){
  const c = cv(), res = await build(src, opt);
  const hist = MS.suspendHistory;
  let created = res.copies;
  if(opt.flatten){
    const hidden = c.getObjects().filter(o=> o.visible).map(o=>{ o.visible = false; return o; });
    const tmp = res.replaceBase ? created : [src.group].concat(created);
    tmp.forEach(o=> c.add(o));
    const el = MS.renderArtboard({ multiplier: Math.min(3, 4000 / Math.max(S.doc.wPx, S.doc.hPx)) });
    tmp.forEach(o=> c.remove(o)); hidden.forEach(o=> o.visible = true);
    if(opt.removeOriginals) src.originals.forEach(o=> c.remove(o));
    await new Promise(r=> fabric.Image.fromURL(el.toDataURL('image/png'), img=>{ img.set({ left:0, top:0, scaleX:S.doc.wPx / img.width, scaleY:S.doc.hPx / img.height, name:MS.nextName(opt.kind === 'kaleido' ? 'kaleido' : 'mirror') }); c.add(img); c.discardActiveObject(); c.setActiveObject(img); r(); }));
    c.requestRenderAll(); MS.commit(opt.label); return;
  }
  const items = created;
  if(opt.group){
    const parts = res.replaceBase ? items : [src.group].concat(items);
    const g = new fabric.Group(parts); g.name = MS.nextName(opt.kind === 'kaleido' ? 'kaleido' : 'mirror') + (opt.kind === 'kaleido' ? ' ×' + opt.n : '');
    if(opt.removeOriginals || res.replaceBase) src.originals.forEach(o=> c.remove(o));
    c.add(g); c.discardActiveObject(); c.setActiveObject(g);
  } else {
    if(res.replaceBase && opt.removeOriginals) src.originals.forEach(o=> c.remove(o));
    items.forEach(o=>{ o.name = (o.name || 'Copy'); c.add(o); });
    c.discardActiveObject(); c.setActiveObject(new fabric.ActiveSelection(items, { canvas:c }));
  }
  c.requestRenderAll(); MS.commit(opt.label);
}

/* ---- dialogs ---- */
function pivotFn(mode, px, py){
  return bb=>{
    if(mode === 'art') return { x:S.doc.wPx / 2, y:S.doc.hPx / 2 };
    if(mode === 'sel') return { x:bb.left + bb.width / 2, y:bb.top + bb.height / 2 };
    return { x:S.doc.wPx * px / 100, y:S.doc.hPx * py / 100 };
  };
}
async function openDialog(kind){
  if(!cv().getActiveObject()){ toast('Select something first, then choose a copy option.'); return; }
  const src = await sourceGroup(); if(!src) return;
  const isK = kind === 'kaleido';
  const body = document.createElement('div');
  body.innerHTML = `<div class="kd-wrap"><div><div class="kd-prev"><canvas id="kdPrev"></canvas></div><div class="hint" style="margin-top:8px" id="kdNote"></div></div><div style="display:flex;flex-direction:column;gap:10px">
    <div class="seg" id="kdKind"><button data-k="mirror">Mirror</button><button data-k="radial">Radial</button><button data-k="kaleido">Kaleidoscope</button></div>
    <div id="kdMirror"><div class="hint" style="margin-bottom:6px">Mirror axes (through the pivot)</div>
      <div class="chips" id="kdAxes"><span class="chip active" data-a="v">↔ Left/right</span><span class="chip" data-a="h">↕ Up/down</span><span class="chip" data-a="d1">⤢ Diagonal</span><span class="chip" data-a="d2">⤡ Diagonal</span></div>
      <div class="hint" style="margin-top:6px">Pick both left/right and up/down for a 4-way mirror.</div></div>
    <div id="kdRad" style="display:none;flex-direction:column;gap:8px">
      <div class="r"><label>Segments</label><input type="range" id="kdN" min="2" max="48" value="8"><div class="f" style="width:56px"><input type="number" id="kdNn" min="2" max="96" value="8"></div></div>
      <div class="chips" id="kdNpre">${[3,4,5,6,8,10,12,16,24,32].map(n=>`<span class="chip" data-n="${n}">${n}</span>`).join('')}</div>
      <div class="r"><label>Rotate</label><input type="range" id="kdOff" min="0" max="360" value="0"><div class="f" style="width:56px"><input type="number" id="kdOffn" min="0" max="360" value="0"></div></div>
      <label class="chk" id="kdClipRow"><input type="checkbox" id="kdClip" checked> Clip to wedges (true kaleidoscope)</label>
      <label class="chk" id="kdAltRow"><input type="checkbox" id="kdAlt"> Mirror every other copy</label>
      <div class="hint" id="kdOdd"></div></div>
    <div><div class="hint" style="margin-bottom:5px">Pivot (centre of symmetry)</div>
      <select id="kdPivot" style="width:100%"><option value="art">Centre of the artboard</option><option value="sel">Centre of the selection</option><option value="custom">Custom point…</option></select>
      <div class="r two" id="kdCustom" style="display:none;margin-top:6px"><div class="f"><span>X</span><input type="number" id="kdPx" value="50"><em>%</em></div><div class="f"><span>Y</span><input type="number" id="kdPy" value="50"><em>%</em></div></div></div>
    <label class="chk"><input type="checkbox" id="kdGroup" checked> Result as one group</label>
    <label class="chk"><input type="checkbox" id="kdFlat"> Flatten into a single picture</label>
    <label class="chk" id="kdRmRow"><input type="checkbox" id="kdRm"> Remove the original (keep only the copies)</label>
  </div></div>`;
  let kindSel = kind === 'kaleido' ? 'kaleido' : kind === 'radial' ? 'radial' : 'mirror';
  const m = MS.modal({ title:'Copy layer', wide:true, body, buttons:[{ spacer:true }, { label:'Cancel' }, { label:'Make copies', primary:true, icon:'check', action:async ()=>{ await apply(src, opts()); } }], onClose:()=>{} });
  const q = id=> $('#' + id, body);
  const axes = new Set(['v']);
  function opts(){
    const n = +q('kdNn').value || 8;
    return { kind:kindSel, axes:[...axes], n, offset:+q('kdOffn').value || 0, clip: kindSel === 'kaleido' && q('kdClip').checked, alt:q('kdAlt').checked, pivot:pivotFn(q('kdPivot').value, +q('kdPx').value, +q('kdPy').value),
      group:q('kdGroup').checked, flatten:q('kdFlat').checked, removeOriginals: q('kdRm').checked,
      label: kindSel === 'mirror' ? 'Mirror copy' : kindSel === 'radial' ? 'Radial copies' : 'Kaleidoscope ×' + n };
  }
  let busy = false, again = false;
  async function refresh(){
    if(busy){ again = true; return; } busy = true;
    $$('#kdKind button', body).forEach(b=> b.classList.toggle('active', b.dataset.k === kindSel));
    q('kdMirror').style.display = kindSel === 'mirror' ? '' : 'none'; q('kdRad').style.display = kindSel === 'mirror' ? 'none' : 'flex';
    q('kdClipRow').style.display = kindSel === 'kaleido' ? '' : 'none'; q('kdAltRow').style.display = kindSel === 'radial' ? '' : 'none';
    q('kdRmRow').style.display = '';
    q('kdCustom').style.display = q('kdPivot').value === 'custom' ? '' : 'none';
    const n = +q('kdNn').value || 8; q('kdOdd').textContent = kindSel === 'kaleido' ? (n % 2 ? 'Odd segment counts can’t mirror perfectly — use an even number for a seamless kaleidoscope.' : 'The pattern is built around where your art sits. Move the art toward or away from the pivot to change the look.') : '';
    q('kdNote').textContent = kindSel === 'kaleido' ? n + ' segments · ' + (360 / n).toFixed(1) + '° each' : kindSel === 'radial' ? n + ' copies around the pivot' : 'Mirror copy across ' + [...axes].length + ' axis(es)';
    try{ await preview(src, opts(), q('kdPrev')); }catch(e){ console.error(e); }
    busy = false; if(again){ again = false; refresh(); }
  }
  $$('#kdKind button', body).forEach(b=> b.onclick = ()=>{ kindSel = b.dataset.k; if(kindSel === 'kaleido' && (+q('kdNn').value % 2)) { q('kdNn').value = q('kdN').value = 8; } refresh(); });
  $$('#kdAxes .chip', body).forEach(ch=> ch.onclick = ()=>{ const a = ch.dataset.a; if(axes.has(a)) axes.delete(a); else axes.add(a); if(!axes.size) axes.add(a); ch.classList.toggle('active', axes.has(a)); $$('#kdAxes .chip', body).forEach(x=> x.classList.toggle('active', axes.has(x.dataset.a))); refresh(); });
  q('kdN').oninput = e=>{ q('kdNn').value = e.target.value; refresh(); }; q('kdNn').oninput = e=>{ q('kdN').value = e.target.value; MS.fillRange(q('kdN')); refresh(); };
  $$('#kdNpre .chip', body).forEach(ch=> ch.onclick = ()=>{ q('kdNn').value = q('kdN').value = ch.dataset.n; MS.fillRange(q('kdN')); refresh(); });
  q('kdOff').oninput = e=>{ q('kdOffn').value = e.target.value; refresh(); }; q('kdOffn').oninput = e=>{ q('kdOff').value = e.target.value; MS.fillRange(q('kdOff')); refresh(); };
  ['kdPivot','kdPx','kdPy','kdClip','kdAlt','kdGroup','kdFlat','kdRm'].forEach(id=> q(id).addEventListener('input', refresh)); q('kdPivot').addEventListener('change', refresh);
  MS.syncRanges(body); refresh();
}
MS.symmetry = { _dbg:{ sourceGroup, build, pivotFn }, openMirror:()=> openDialog('mirror'), openKaleido:()=> openDialog('kaleido'), openRadial:()=> openDialog('radial') };
MS.initSymmetry = function(){
  MS.addCommand({ title:'Mirror copy…', cat:'Object', kw:'flip symmetry reflect', run:()=> MS.symmetry.openMirror() });
  MS.addCommand({ title:'Kaleidoscope…', cat:'Object', kw:'segments symmetry pattern', run:()=> MS.symmetry.openKaleido() });
  MS.addCommand({ title:'Radial copies…', cat:'Object', kw:'rotate circle repeat', run:()=> MS.symmetry.openRadial() });
};
})();
