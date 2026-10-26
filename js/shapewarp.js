/* Merch Studio - warp for shapes: bend, wave, bulge, taper, twist and skew a rectangle / ellipse / triangle / polygon / star.
   The shape is re-built as a smooth polygon from its original outline every time, so sliders never stack and Reset restores the original shape. */
(function(){
'use strict';
const MS = window.MS, S = MS.S;
const { $, $$, clamp } = MS;
const cv = ()=> MS.canvas;
const W0 = { arch:0, side:0, wave:0, waveN:1.5, bulge:0, taper:0, twist:0, skewX:0, skewY:0 };
const KEYS = ['arch','side','wave','bulge','taper','twist','skewX','skewY'];
const IDS = [['swArch','arch'],['swSide','side'],['swWave','wave'],['swWaveN','waveN'],['swBulge','bulge'],['swTaper','taper'],['swTwist','twist'],['swSkewX','skewX'],['swSkewY','skewY']];
const PRESETS = {
  'Arch up':{ arch:45 }, 'Arch down':{ arch:-45 }, 'Wave':{ wave:25 }, 'Flag':{ wave:18, waveN:1 }, 'Bulge':{ bulge:60 }, 'Pinch':{ bulge:-55 },
  'Taper':{ taper:55 }, 'Flare':{ taper:-55 }, 'Twist':{ twist:60 }, 'Slant':{ skewX:35 }, 'Lean':{ side:45 }, 'Melt':{ wave:30, waveN:3, bulge:30 },
};
const on = p=> KEYS.some(k=> +p[k]);
const supported = o=> !!o && !o.__isBackground && ['rect','ellipse','triangle','polygon'].includes(o.type) && !o._isCurvedText;

function srcOf(o){
  if(o._warp && o._warp.src) return o._warp.src;
  if(o.type === 'rect') return { t:'rect', w:o.width, h:o.height, rx:o.rx || 0 };
  if(o.type === 'ellipse') return { t:'ellipse', w:o.rx * 2, h:o.ry * 2 };
  if(o.type === 'triangle') return { t:'triangle', w:o.width, h:o.height };
  const po = o.pathOffset || { x:0, y:0 };
  return { t:'polygon', w:o.width, h:o.height, pts:o.points.map(p=> ({ x:p.x - po.x, y:p.y - po.y })) };
}
function densify(poly, step){
  const out = [];
  poly.forEach((a, i)=>{ const b = poly[(i + 1) % poly.length], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step)); for(let k = 0; k < n; k++) out.push({ x:a.x + (b.x - a.x) * k / n, y:a.y + (b.y - a.y) * k / n }); });
  return out;
}
function outline(src){
  const hw = src.w / 2, hh = src.h / 2, step = Math.max(src.w, src.h) / 56;
  if(src.t === 'ellipse'){ const n = 160, out = []; for(let i = 0; i < n; i++){ const a = i / n * Math.PI * 2; out.push({ x:Math.cos(a) * hw, y:Math.sin(a) * hh }); } return out; }
  if(src.t === 'triangle') return densify([{ x:0, y:-hh }, { x:hw, y:hh }, { x:-hw, y:hh }], step);
  if(src.t === 'polygon') return densify(src.pts, step);
  const r = Math.min(src.rx || 0, hw, hh);
  if(r <= 0) return densify([{ x:-hw, y:-hh }, { x:hw, y:-hh }, { x:hw, y:hh }, { x:-hw, y:hh }], step);
  const poly = [], arc = (cx, cy, a0)=>{ for(let i = 0; i <= 10; i++){ const a = (a0 + i * 9) * Math.PI / 180; poly.push({ x:cx + Math.cos(a) * r, y:cy + Math.sin(a) * r }); } };
  arc(-hw + r, -hh + r, 180); arc(hw - r, -hh + r, 270); arc(hw - r, hh - r, 0); arc(-hw + r, hh - r, 90);
  return densify(poly, step);
}
function warpPt(pt, p, hw, hh){
  let x = pt.x, y = pt.y; const u = x / hw, v = y / hh;
  x *= 1 - (p.taper / 100) * (v + 1) / 2;
  y *= 1 + (p.bulge / 100) * (1 - u * u);
  y -= (p.arch / 100) * hh * (1 - u * u);
  x += (p.side / 100) * hw * (1 - v * v);
  y += (p.wave / 100) * hh * Math.sin(Math.PI * p.waveN * (u + 1));
  x += (p.skewX / 100) * hw * v; y += (p.skewY / 100) * hh * u;
  if(p.twist){ const ang = (p.twist / 100) * Math.PI * (1 - Math.min(1, Math.hypot(u, v) / Math.SQRT2)), c = Math.cos(ang), s = Math.sin(ang); const nx = x * c - y * s; y = x * s + y * c; x = nx; }
  return { x, y };
}
// where (local x,y) sits on the canvas, honouring the object's scale / flip / rotation
function toCanvas(o, c, lx, ly){
  const sx = (o.scaleX || 1) * (o.flipX ? -1 : 1), sy = (o.scaleY || 1) * (o.flipY ? -1 : 1), a = (o.angle || 0) * Math.PI / 180, x = lx * sx, y = ly * sy;
  return { x:c.x + x * Math.cos(a) - y * Math.sin(a), y:c.y + x * Math.sin(a) + y * Math.cos(a) };
}

function apply(part, replace){
  const c = cv(), o = c && c.getActiveObject(); if(!supported(o)) return;
  const src = srcOf(o), old = o._warp || { p:W0, off:{ x:0, y:0 } };
  const p = Object.assign({}, W0, replace ? {} : old.p, part);
  // geometric centre of the *unwarped* outline, recovered from the current centre and the last build's offset
  const cur = o.getCenterPoint(), a = (o.angle || 0) * Math.PI / 180, sx = (o.scaleX || 1) * (o.flipX ? -1 : 1), sy = (o.scaleY || 1) * (o.flipY ? -1 : 1);
  const ox = old.off.x * sx, oy = old.off.y * sy, G = { x:cur.x - (ox * Math.cos(a) - oy * Math.sin(a)), y:cur.y - (ox * Math.sin(a) + oy * Math.cos(a)) };
  const common = { fill:o.fill, stroke:o.stroke, strokeWidth:o.strokeWidth, strokeUniform:true, strokeLineJoin:o.strokeLineJoin, strokeDashArray:o.strokeDashArray, strokeLineCap:o.strokeLineCap, opacity:o.opacity, shadow:o.shadow, paintFirst:o.paintFirst,
    globalCompositeOperation:o.globalCompositeOperation, angle:o.angle, scaleX:o.scaleX, scaleY:o.scaleY, flipX:o.flipX, flipY:o.flipY, originX:'center', originY:'center', name:o.name };
  let n, off = { x:0, y:0 };
  if(!on(p)){
    if(src.t === 'rect') n = new fabric.Rect({ ...common, width:src.w, height:src.h, rx:src.rx, ry:src.rx });
    else if(src.t === 'ellipse') n = new fabric.Ellipse({ ...common, rx:src.w / 2, ry:src.h / 2 });
    else if(src.t === 'triangle') n = new fabric.Triangle({ ...common, width:src.w, height:src.h });
    else n = new fabric.Polygon(src.pts.map(q=> ({ x:q.x, y:q.y })), common);
    n.set({ left:G.x, top:G.y });
  } else {
    const pts = outline(src).map(q=> warpPt(q, p, src.w / 2, src.h / 2));
    const xs = pts.map(q=> q.x), ys = pts.map(q=> q.y);
    off = { x:(Math.min(...xs) + Math.max(...xs)) / 2, y:(Math.min(...ys) + Math.max(...ys)) / 2 };
    n = new fabric.Polygon(pts, common);
    const ctr = toCanvas(o, G, off.x, off.y); n.set({ left:ctr.x, top:ctr.y });
    n._warp = { src, p, off };
  }
  n.__fx = o.__fx; n.__fillMeta = o.__fillMeta;
  const idx = c.getObjects().indexOf(o); c.remove(o); c.add(n); c.moveTo(n, idx); c.setActiveObject(n); n.setCoords(); c.requestRenderAll();
  clearTimeout(apply._t); apply._t = setTimeout(()=> MS.commit('Warp shape'), 350); MS.emitSelection();
}

function sync(){
  const sect = $('#propShapeWarp'); if(!sect) return;
  const c = cv(), o = c && c.getActiveObject(), ok = supported(o);
  sect.style.display = ok ? '' : 'none'; if(!ok) return;
  const p = Object.assign({}, W0, o._warp ? o._warp.p : {});
  IDS.forEach(([id, k])=>{ const e = $('#' + id); if(e && document.activeElement !== e){ e.value = p[k]; MS.fillRange(e); } });
}

// the outline at a fraction u (0 = unwarped, 1 = fully warped) - used by the animation morph
function morphPoints(o, u){ const w = o._warp; if(!w) return null; const p = Object.assign({}, w.p); KEYS.forEach(k=>{ p[k] = (w.p[k] || 0) * u; }); return outline(w.src).map(q=> warpPt(q, p, w.src.w / 2, w.src.h / 2)); }
MS.shapeWarp = { apply, presets:PRESETS, supported, morphPoints };
MS.on('selection', sync);
document.addEventListener('DOMContentLoaded', ()=>{
  const pr = $('#swPresets'); if(!pr) return;
  pr.innerHTML = Object.keys(PRESETS).map(k=> '<span class="chip" data-p="' + k + '">' + k + '</span>').join('');
  pr.addEventListener('click', e=>{ const ch = e.target.closest('.chip'); if(ch) apply(PRESETS[ch.dataset.p], true); });
  IDS.forEach(([id, k])=>{ const e = $('#' + id); if(e) e.addEventListener('input', ()=>{ const v = +e.value; clearTimeout(apply['_d' + id]); apply['_d' + id] = setTimeout(()=> apply({ [k]:v }), 60); MS.fillRange(e); }); });
  $('#swReset').addEventListener('click', ()=> apply({}, true));
});
})();
