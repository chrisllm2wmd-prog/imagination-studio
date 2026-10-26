/* Merch Studio - node editing tool (A): move anchors and bezier handles, add / delete points, corner <-> smooth. */
(function(){
'use strict';
const MS = window.MS, S = MS.S;
const { $, $$, toast } = MS;
const cv = ()=> MS.canvas;
let edit = null;            // { obj, subs:[{nodes:[...], closed}], sel:{s,n}|null, drag:null }
const HIT = 8;

/* ---------- model <-> fabric path ---------- */
const pt = (x, y)=> new fabric.Point(x, y);
function toAbs(o, x, y){ return fabric.util.transformPoint(pt(x, y), o.calcTransformMatrix()); }
function nodeFrom(o, x, y, off){ const p = toAbs(o, x - off.x, y - off.y); return { x:p.x, y:p.y }; }
function setH(o, n, k, x, y, off){ const p = toAbs(o, x - off.x, y - off.y); n[k === 'i' ? 'ix' : 'ox'] = p.x; n[k === 'i' ? 'iy' : 'oy'] = p.y; }
function close(a, b){ return Math.hypot(a.x - b.x, a.y - b.y) < .01; }
function parse(o){
  const subs = [];
  if(o.type === 'path'){
    const off = o.pathOffset || { x:0, y:0 }, cmds = fabric.util.makePathSimpler ? fabric.util.makePathSimpler(o.path) : o.path;
    let cur = null;
    cmds.forEach(c=>{
      const t = c[0];
      if(t === 'M'){ cur = { nodes:[nodeFrom(o, c[1], c[2], off)], closed:false }; subs.push(cur); }
      else if(!cur) return;
      else if(t === 'L') cur.nodes.push(nodeFrom(o, c[1], c[2], off));
      else if(t === 'C'){ const last = cur.nodes[cur.nodes.length - 1]; setH(o, last, 'o', c[1], c[2], off); const n = nodeFrom(o, c[5], c[6], off); setH(o, n, 'i', c[3], c[4], off); cur.nodes.push(n); }
      else if(t === 'Q'){ const last = cur.nodes[cur.nodes.length - 1], p0 = { x:last.x, y:last.y }, q = toAbs(o, c[1] - off.x, c[2] - off.y), n = nodeFrom(o, c[3], c[4], off);
        last.ox = p0.x + (q.x - p0.x) * 2/3; last.oy = p0.y + (q.y - p0.y) * 2/3; n.ix = n.x + (q.x - n.x) * 2/3; n.iy = n.y + (q.y - n.y) * 2/3; cur.nodes.push(n); }
      else if(t === 'Z'){ cur.closed = true; const f = cur.nodes[0], l = cur.nodes[cur.nodes.length - 1]; if(cur.nodes.length > 1 && close(f, l)){ if(l.ix !== undefined){ f.ix = l.ix; f.iy = l.iy; } cur.nodes.pop(); } }
    });
  } else if(o.type === 'polygon' || o.type === 'polyline'){
    const off = o.pathOffset || { x:0, y:0 };
    subs.push({ nodes:o.points.map(p=> nodeFrom(o, p.x, p.y, off)), closed:o.type === 'polygon' });
  } else if(o.type === 'rect'){
    const w = o.width / 2, h = o.height / 2; subs.push({ nodes:[[-w,-h],[w,-h],[w,h],[-w,h]].map(p=>{ const a = toAbs(o, p[0], p[1]); return { x:a.x, y:a.y }; }), closed:true });
  } else if(o.type === 'triangle'){
    const w = o.width / 2, h = o.height / 2; subs.push({ nodes:[[0,-h],[w,h],[-w,h]].map(p=>{ const a = toAbs(o, p[0], p[1]); return { x:a.x, y:a.y }; }), closed:true });
  } else if(o.type === 'ellipse'){
    const rx = o.rx, ry = o.ry, k = .5523; const pts = [[0,-ry,-rx*k,0,rx*k,0],[rx,0,0,-ry*k,0,ry*k],[0,ry,rx*k,0,-rx*k,0],[-rx,0,0,ry*k,0,-ry*k]];
    subs.push({ nodes:pts.map(p=>{ const a = toAbs(o, p[0], p[1]), i = toAbs(o, p[0] + p[2], p[1] + p[3]), q = toAbs(o, p[0] + p[4], p[1] + p[5]); return { x:a.x, y:a.y, ix:i.x, iy:i.y, ox:q.x, oy:q.y, smooth:true }; }), closed:true });
  } else if(o.type === 'line'){
    const l = o.calcLinePoints(); const a = toAbs(o, l.x1, l.y1), b = toAbs(o, l.x2, l.y2); subs.push({ nodes:[{ x:a.x, y:a.y }, { x:b.x, y:b.y }], closed:false });
  } else return null;
  return subs;
}
const f2 = v=> +v.toFixed(2);
function seg(a, b){
  if(a.ox !== undefined || b.ix !== undefined) return ' C ' + f2(a.ox ?? a.x) + ' ' + f2(a.oy ?? a.y) + ' ' + f2(b.ix ?? b.x) + ' ' + f2(b.iy ?? b.y) + ' ' + f2(b.x) + ' ' + f2(b.y);
  return ' L ' + f2(b.x) + ' ' + f2(b.y);
}
function toD(subs){
  return subs.map(s=>{
    if(!s.nodes.length) return ''; let d = 'M ' + f2(s.nodes[0].x) + ' ' + f2(s.nodes[0].y);
    for(let i = 1; i < s.nodes.length; i++) d += seg(s.nodes[i-1], s.nodes[i]);
    if(s.closed && s.nodes.length > 1) d += seg(s.nodes[s.nodes.length - 1], s.nodes[0]) + ' Z';
    return d;
  }).join(' ');
}
const STYLE = ['fill','stroke','strokeWidth','strokeDashArray','strokeLineCap','strokeLineJoin','opacity','shadow','globalCompositeOperation','__fx','__fillMeta','paintFirst','name','__linkId'];
function bake(o, subs){
  const c = cv(), n = new fabric.Path(toD(subs), { strokeUniform:true, objectCaching:false });
  STYLE.forEach(k=>{ if(o[k] !== undefined) n[k] = o[k]; });
  if(o.type === 'line' && !n.stroke){ n.stroke = o.stroke; }
  if(o.type === 'line'){ n.fill = ''; }
  const idx = c.getObjects().indexOf(o); c.remove(o); c.add(n); c.moveTo(n, idx); return n;
}

/* ---------- begin / end ---------- */
function begin(o){
  if(!o || o.__isBackground) return false;
  const subs = parse(o);
  if(!subs){ toast('Node editing works on shapes and paths. For text, use Type ▸ Convert text to outlines first.', 4200); return false; }
  const c = cv();
  const plain = o.type === 'path' && !o.angle && o.scaleX === 1 && o.scaleY === 1 && !o.flipX && !o.flipY && !o.skewX && !o.skewY;
  let obj = o;
  if(!plain){ obj = bake(o, subs); c.discardActiveObject(); c.setActiveObject(obj); c.requestRenderAll(); edit = { obj, subs:parse(obj) || subs, sel:null, drag:null, dirty:true }; }
  else edit = { obj, subs, sel:null, drag:null, dirty:false };
  MS.tools.renderOptions(); MS.redrawOverlay(); return true;
}
function finish(){
  if(edit && edit.dirty){ MS.dirtyObj(edit.obj); MS.commit('Edit path'); }
  edit = null; MS.redrawOverlay();
}
function sync(){   // push the model into the real object
  const o = edit.obj; o._setPath(toD(edit.subs)); o.setCoords(); o.dirty = true; cv().requestRenderAll(); edit.dirty = true;
}

/* ---------- geometry ---------- */
const scr = p=> MS.view.toScreen(p);
function ctrl(a, b){ return [ { x:a.ox ?? a.x, y:a.oy ?? a.y }, { x:b.ix ?? b.x, y:b.iy ?? b.y } ]; }
function bez(p0, c1, c2, p1, t){ const u = 1 - t; return { x:u*u*u*p0.x + 3*u*u*t*c1.x + 3*u*t*t*c2.x + t*t*t*p1.x, y:u*u*u*p0.y + 3*u*u*t*c1.y + 3*u*t*t*c2.y + t*t*t*p1.y }; }
function split(p0, c1, c2, p1, t){
  const L = (a, b)=> ({ x:a.x + (b.x - a.x) * t, y:a.y + (b.y - a.y) * t });
  const a = L(p0, c1), b = L(c1, c2), c = L(c2, p1), d = L(a, b), e = L(b, c), m = L(d, e);
  return { a, d, m, e, c };
}
function segments(s){ const out = []; for(let i = 0; i < s.nodes.length - 1; i++) out.push([i, i + 1]); if(s.closed && s.nodes.length > 1) out.push([s.nodes.length - 1, 0]); return out; }
function hit(sx, sy){
  // 1. handles of the selected node (and neighbours) 2. anchors 3. segments
  for(let si = 0; si < edit.subs.length; si++){
    const s = edit.subs[si];
    for(let ni = 0; ni < s.nodes.length; ni++){
      const n = s.nodes[ni], showH = s.nodes.length <= 40 || (edit.sel && edit.sel.s === si && edit.sel.n === ni);
      if(showH) for(const k of ['i', 'o']){ const hx = n[k + 'x'], hy = n[k + 'y']; if(hx === undefined) continue; const q = scr({ x:hx, y:hy }); if(Math.hypot(q.x - sx, q.y - sy) <= HIT) return { type:'handle', s:si, n:ni, k }; }
    }
  }
  for(let si = 0; si < edit.subs.length; si++) edit.subs[si].nodes.forEach((n, ni)=>{ const q = scr(n); if(!hit.found && Math.hypot(q.x - sx, q.y - sy) <= HIT) hit.found = { type:'anchor', s:si, n:ni }; });
  if(hit.found){ const f = hit.found; hit.found = null; return f; }
  let best = null;
  edit.subs.forEach((s, si)=> segments(s).forEach(([i, j])=>{
    const a = s.nodes[i], b = s.nodes[j], [c1, c2] = ctrl(a, b);
    for(let k = 0; k <= 40; k++){ const t = k / 40, p = scr(bez(a, c1, c2, b, t)), d = Math.hypot(p.x - sx, p.y - sy); if(d <= HIT && (!best || d < best.d)) best = { type:'segment', s:si, i, j, t, d }; }
  }));
  return best;
}
function insertAt(h){
  const s = edit.subs[h.s], a = s.nodes[h.i], b = s.nodes[h.j], [c1, c2] = ctrl(a, b), sp = split(a, c1, c2, b, h.t);
  const curved = a.ox !== undefined || b.ix !== undefined, m = { x:sp.m.x, y:sp.m.y };
  if(curved){ a.ox = sp.a.x; a.oy = sp.a.y; m.ix = sp.d.x; m.iy = sp.d.y; m.ox = sp.e.x; m.oy = sp.e.y; b.ix = sp.c.x; b.iy = sp.c.y; m.smooth = true; }
  const at = h.j === 0 ? s.nodes.length : h.j; s.nodes.splice(at, 0, m);
  edit.sel = { s:h.s, n:at }; sync();
}
function toggleSmooth(si, ni){
  const s = edit.subs[si], n = s.nodes[ni], N = s.nodes.length;
  if(n.ix !== undefined || n.ox !== undefined){ delete n.ix; delete n.iy; delete n.ox; delete n.oy; n.smooth = false; }
  else {
    const prev = s.nodes[(ni - 1 + N) % N], next = s.nodes[(ni + 1) % N], dx = (next.x - prev.x) / 6, dy = (next.y - prev.y) / 6;
    if(!s.closed && (ni === 0 || ni === N - 1)){ const o = ni === 0 ? next : prev, k = ni === 0 ? 1 : -1; n.ox = n.x + (o.x - n.x) / 3 * k; n.oy = n.y + (o.y - n.y) / 3 * k; if(ni === N - 1){ n.ix = n.x + (o.x - n.x) / 3; n.iy = n.y + (o.y - n.y) / 3; delete n.ox; delete n.oy; } }
    else { n.ix = n.x - dx; n.iy = n.y - dy; n.ox = n.x + dx; n.oy = n.y + dy; }
    n.smooth = true;
  }
  sync();
}
function deleteSel(){
  if(!edit || !edit.sel) return false; const s = edit.subs[edit.sel.s]; const min = s.closed ? 3 : 2;
  if(s.nodes.length <= min){ toast('A path needs at least ' + min + ' points. Delete the layer instead.'); return true; }
  s.nodes.splice(edit.sel.n, 1); edit.sel = null; sync(); finish(); begin(cv().getActiveObject()); return true;
}

/* ---------- tool ---------- */
const tool = {
  id:'node', label:'Node edit (move points & curves)', icon:'direct', key:'A', lock:true, cursor:'default',
  hint:'Click a shape/path, then drag its points and curve handles · click a line to add a point · double-click a point to switch corner ↔ smooth · Delete removes the point · Esc finishes',
  enter(){ const a = cv().getActiveObject(); if(a && a.type !== 'activeSelection') begin(a); },
  exit(){ finish(); },
  down(p, e){
    const r = $('#vp').getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    if(edit){
      const h = hit(sx, sy);
      if(h && h.type === 'handle'){ edit.sel = { s:h.s, n:h.n }; edit.drag = { type:'handle', s:h.s, n:h.n, k:h.k }; MS.redrawOverlay(); return; }
      if(h && h.type === 'anchor'){
        if(e.altKey){ edit.sel = { s:h.s, n:h.n }; deleteSel(); return; }
        edit.sel = { s:h.s, n:h.n }; edit.drag = { type:'anchor', s:h.s, n:h.n, ox:p.x, oy:p.y, start:JSON.parse(JSON.stringify(edit.subs[h.s].nodes[h.n])) }; MS.tools.renderOptions(); MS.redrawOverlay(); return;
      }
      if(h && h.type === 'segment'){ insertAt(h); edit.drag = null; MS.tools.renderOptions(); MS.redrawOverlay(); return; }
    }
    // pick another shape
    const objs = cv().getObjects(), pt0 = new fabric.Point(p.x, p.y);
    for(let i = objs.length - 1; i >= 0; i--){
      const o = objs[i]; if(!o.visible || o.__isBackground || !['path','polygon','polyline','rect','ellipse','triangle','line'].includes(o.type)) continue;
      if(o.containsPoint(pt0, null, true, true)){ finish(); cv().setActiveObject(o); begin(cv().getActiveObject()); return; }
    }
    if(edit){ edit.sel = null; MS.tools.renderOptions(); MS.redrawOverlay(); }
  },
  move(p, e){
    if(!edit || !edit.drag) return; const d = edit.drag, s = edit.subs[d.s], n = s.nodes[d.n];
    if(d.type === 'anchor'){
      const q = e.shiftKey ? MS.snapPoint({ x:d.start.x + (p.x - d.ox), y:d.start.y + (p.y - d.oy) }) : { x:d.start.x + (p.x - d.ox), y:d.start.y + (p.y - d.oy) };
      const dx = q.x - n.x, dy = q.y - n.y; n.x += dx; n.y += dy;
      ['i','o'].forEach(k=>{ if(n[k + 'x'] !== undefined){ n[k + 'x'] += dx; n[k + 'y'] += dy; } });
    } else {
      const k = d.k, o = k === 'i' ? 'o' : 'i'; n[k + 'x'] = p.x; n[k + 'y'] = p.y;
      const smooth = n.smooth !== false && n[o + 'x'] !== undefined && !e.altKey;
      if(smooth){ const len = Math.hypot(n[o + 'x'] - n.x, n[o + 'y'] - n.y), vx = n.x - p.x, vy = n.y - p.y, vl = Math.hypot(vx, vy) || 1; n[o + 'x'] = n.x + vx / vl * len; n[o + 'y'] = n.y + vy / vl * len; }
      else if(n[o + 'x'] === undefined && !e.altKey){ n[o + 'x'] = n.x * 2 - p.x; n[o + 'y'] = n.y * 2 - p.y; n.smooth = true; }
    }
    sync(); MS.redrawOverlay();
  },
  up(){ if(edit && edit.drag){ edit.drag = null; MS.dirtyObj(edit.obj); } },
  dblclick(p, e){
    if(!edit) return; const r = $('#vp').getBoundingClientRect(), h = hit(e.clientX - r.left, e.clientY - r.top);
    if(h && h.type === 'anchor'){ edit.sel = { s:h.s, n:h.n }; toggleSmooth(h.s, h.n); MS.tools.renderOptions(); MS.redrawOverlay(); }
  },
  onKey(e){
    if(!edit) return false;
    if(e.key === 'Delete' || e.key === 'Backspace') return deleteSel();
    if(e.key === 'Enter' || e.key === 'Escape'){ MS.tools.set('move'); return true; }
    return false;
  },
  overlay(ctx){
    if(!edit) return; ctx.save();
    edit.subs.forEach((s, si)=>{
      ctx.strokeStyle = '#5b8cff'; ctx.lineWidth = 1.2; ctx.beginPath();
      s.nodes.forEach((n, i)=>{ const q = scr(n); i ? 0 : ctx.moveTo(q.x, q.y); });
      segments(s).forEach(([i, j])=>{ const a = s.nodes[i], b = s.nodes[j], [c1, c2] = ctrl(a, b), A = scr(a), B = scr(b), C1 = scr(c1), C2 = scr(c2); ctx.moveTo(A.x, A.y); ctx.bezierCurveTo(C1.x, C1.y, C2.x, C2.y, B.x, B.y); });
      ctx.stroke();
      s.nodes.forEach((n, ni)=>{
        const isSel = edit.sel && edit.sel.s === si && edit.sel.n === ni, showH = s.nodes.length <= 40 || isSel, A = scr(n);
        if(showH) ['i','o'].forEach(k=>{ if(n[k + 'x'] === undefined) return; const H = scr({ x:n[k + 'x'], y:n[k + 'y'] }); ctx.strokeStyle = '#8aa8ff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(H.x, H.y); ctx.stroke(); ctx.beginPath(); ctx.arc(H.x, H.y, 4, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); });
      });
      s.nodes.forEach((n, ni)=>{ const A = scr(n), isSel = edit.sel && edit.sel.s === si && edit.sel.n === ni, smooth = n.ix !== undefined || n.ox !== undefined; ctx.fillStyle = isSel ? '#5b8cff' : '#fff'; ctx.strokeStyle = '#5b8cff'; ctx.lineWidth = 1.5; if(smooth){ ctx.beginPath(); ctx.arc(A.x, A.y, 5, 0, 7); ctx.fill(); ctx.stroke(); } else { ctx.fillRect(A.x - 4.5, A.y - 4.5, 9, 9); ctx.strokeRect(A.x - 4.5, A.y - 4.5, 9, 9); } });
    });
    ctx.restore();
  },
  optionsHtml(){
    const has = edit && edit.sel;
    return '<div class="og"><button class="btn sm" data-n="smooth" ' + (has ? '' : 'disabled') + '>Corner ↔ smooth</button><button class="btn sm" data-n="del" ' + (has ? '' : 'disabled') + '>Delete point</button><button class="btn sm" data-n="close" ' + (edit ? '' : 'disabled') + '>Close / open path</button></div><div class="og hint">' + (edit ? 'Drag points & handles · click a line to add a point · Alt-click a point deletes it' : 'Click a shape or path to edit its points') + '</div>';
  },
  bindOptions(bar){
    $$('[data-n]', bar).forEach(b=> b.addEventListener('click', ()=>{
      if(!edit) return; const k = b.dataset.n;
      if(k === 'smooth' && edit.sel) toggleSmooth(edit.sel.s, edit.sel.n);
      else if(k === 'del') deleteSel();
      else if(k === 'close'){ const s = edit.subs[edit.sel ? edit.sel.s : 0]; s.closed = !s.closed; sync(); }
      MS.tools.renderOptions(); MS.redrawOverlay();
    }));
  },
};
MS.tools.reg(tool);
MS.on('selection', ()=>{ if(S.tool !== 'node') return; const a = cv().getActiveObject(); if(a && a.type !== 'activeSelection' && (!edit || edit.obj !== a)){ finish(); begin(a); } });
MS.nodeEdit = { begin, finish };
})();
