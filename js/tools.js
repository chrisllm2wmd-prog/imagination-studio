/* Merch Studio - tool system: move / hand / zoom / shapes / pen / pencil / text / image / wand / eraser / eyedropper, toolbox + options bar. */
(function(){
'use strict';
const MS = window.MS, S = MS.S;
const { $, $$, clamp, toast } = MS;
const T = MS.tools = {};
const defs = {}, order = [];
let canvas = null;
const cv = ()=> MS.canvas;

/* ---------- helpers ---------- */
const hexOr = (c, d)=> (typeof c === 'string' && /^#/.test(c)) ? c : d;
function fillValue(){ return S.noFill ? '' : S.fill; }
function strokeValue(){ return S.noStroke ? null : S.stroke; }
function pointOf(o){ return cv().getPointer(o.e); }
function snapP(p){ return MS.snapPoint(p); }
function finishCreate(obj, label){
  const c = cv();
  c.discardActiveObject();
  c.setActiveObject(obj);
  MS.commit(label);
  if(!MS.prefs.stickyTools) T.set('move');
  else { c.requestRenderAll(); }
}

/* ======================= SHAPE FACTORY ======================= */
function polyPoints(n, w, h, starInner){
  const pts = [];
  if(starInner){
    for(let i = 0; i < n*2; i++){ const r = i % 2 === 0 ? 1 : starInner, a = -Math.PI/2 + i * Math.PI / n; pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r }); }
  } else {
    for(let i = 0; i < n; i++){ const a = -Math.PI/2 + i * 2*Math.PI / n; pts.push({ x: Math.cos(a), y: Math.sin(a) }); }
  }
  const xs = pts.map(p=>p.x), ys = pts.map(p=>p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return pts.map(p=>({ x:(p.x - x0) / (x1 - x0) * w, y:(p.y - y0) / (y1 - y0) * h }));
}
function arrowPoints(len, thick, headL, headW){
  headL = Math.min(headL, len * .7);
  const t = thick / 2, hw = headW / 2, bodyEnd = len - headL;
  return [{x:0,y:-t},{x:bodyEnd,y:-t},{x:bodyEnd,y:-hw},{x:len,y:0},{x:bodyEnd,y:hw},{x:bodyEnd,y:t},{x:0,y:t}];
}
const SHAPE_OPT = MS.shapeOpt = { radius:24, rectR:0, sides:6, points:5, inner:.42, lineW:6 };

function makeShape(kind, x0, y0, w, h, p0, p1){
  const common = { fill: fillValue(), stroke: strokeValue(), strokeWidth: S.noStroke ? 0 : S.strokeW, strokeUniform:true, strokeLineJoin:'miter', originX:'left', originY:'top' };
  let o = null;
  w = Math.max(w, 1); h = Math.max(h, 1);
  if(kind === 'rect' || kind === 'rrect'){ const r = Math.min(kind === 'rrect' ? SHAPE_OPT.radius : SHAPE_OPT.rectR, w / 2, h / 2); o = new fabric.Rect({ ...common, left:x0, top:y0, width:w, height:h, rx:r, ry:r }); }
  else if(kind === 'ellipse') o = new fabric.Ellipse({ ...common, left:x0, top:y0, rx:w/2, ry:h/2 });
  else if(kind === 'triangle') o = new fabric.Triangle({ ...common, left:x0, top:y0, width:w, height:h });
  else if(kind === 'polygon') o = new fabric.Polygon(polyPoints(SHAPE_OPT.sides, w, h), { ...common, left:x0, top:y0 });
  else if(kind === 'star') o = new fabric.Polygon(polyPoints(SHAPE_OPT.points, w, h, SHAPE_OPT.inner), { ...common, left:x0, top:y0 });
  else if(kind === 'line'){
    const col = S.noStroke ? (S.noFill ? '#000000' : S.fill) : S.stroke;
    o = new fabric.Line([p0.x, p0.y, p1.x, p1.y], { stroke: col, strokeWidth: Math.max(1, SHAPE_OPT.lineW), strokeLineCap:'round', strokeUniform:true });
  } else if(kind === 'arrow'){
    const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.max(Math.hypot(dx, dy), 2), th = Math.max(2, SHAPE_OPT.lineW);
    const col = S.noStroke ? (S.noFill ? '#000000' : S.fill) : S.stroke;
    o = new fabric.Polygon(arrowPoints(len, th, Math.max(th * 3, 18), Math.max(th * 3, 22)), { fill:col, stroke:null, left:p0.x, top:p0.y, originX:'left', originY:'center', angle: Math.atan2(dy, dx) * 180 / Math.PI });
    // Polygon's own origin is its bbox top-left; shift so that the arrow tail sits on p0
    o.set({ originX:'left', originY:'center' });
  }
  return o;
}
function describe(kind){ return { rect:'Rectangle', rrect:'Rounded rectangle', ellipse:'Ellipse', triangle:'Triangle', polygon:'Polygon', star:'Star', line:'Line', arrow:'Arrow' }[kind] || kind; }

function shapeTool(kind, icon, key, label){
  let start = null, temp = null, lastP = null;
  return {
    id:kind, label, icon, key, group:'shapes', lock:true, cursor:'crosshair',
    down(p, e){
      start = snapP(p); lastP = start;
      temp = makeShape(kind, start.x, start.y, 1, 1, start, start);
      temp.name = MS.nextName(kind === 'rrect' ? 'rect' : kind);
      cv().add(temp);
    },
    move(p, e){
      if(!temp) return;
      p = snapP(p); lastP = p;
      let x0 = Math.min(start.x, p.x), y0 = Math.min(start.y, p.y), w = Math.abs(p.x - start.x), h = Math.abs(p.y - start.y);
      let q = { x:p.x, y:p.y };
      if(kind === 'line' || kind === 'arrow'){
        if(e.shiftKey){ const a = Math.atan2(p.y - start.y, p.x - start.x), r = Math.hypot(p.x - start.x, p.y - start.y), sa = Math.round(a / (Math.PI/12)) * (Math.PI/12); q = { x:start.x + Math.cos(sa) * r, y:start.y + Math.sin(sa) * r }; }
        replace(makeShape(kind, 0, 0, 0, 0, start, q)); MS.showHud(temp, Math.round(Math.hypot(q.x - start.x, q.y - start.y)) + ' px  ∠' + Math.round(Math.atan2(q.y - start.y, q.x - start.x) * 180 / Math.PI) + '°');
      } else {
        // Shift forces a perfect square/circle; without it, drawing within ~10 screen px of equal sides snaps to one
        const sq = kind === 'rect' || kind === 'rrect' || kind === 'ellipse';
        const perfect = e.shiftKey || (sq && Math.max(w, h) > 0 && Math.abs(w - h) * S.view.z <= 10);
        if(perfect){ const m = Math.max(w, h); w = h = m; x0 = p.x < start.x ? start.x - m : start.x; y0 = p.y < start.y ? start.y - m : start.y; }
        if(e.altKey){ x0 = start.x - w; y0 = start.y - h; w *= 2; h *= 2; if(perfect){ w = h = Math.max(w, h); x0 = start.x - w/2; y0 = start.y - h/2; } }
        replace(makeShape(kind, x0, y0, w, h)); MS.showHud(temp, Math.round(w) + ' × ' + Math.round(h) + (perfect && sq ? (kind === 'ellipse' ? '  ● circle' : '  ■ square') : ''));
      }
      cv().requestRenderAll();
    },
    up(p, e){
      if(!temp) return;
      const tiny = (kind === 'line' || kind === 'arrow') ? Math.hypot(lastP.x - start.x, lastP.y - start.y) < 4 : (temp.getScaledWidth() < 4 && temp.getScaledHeight() < 4);
      if(tiny){
        const d = 200; cv().remove(temp);
        if(kind === 'line' || kind === 'arrow') temp = makeShape(kind, 0, 0, 0, 0, start, { x:start.x + d, y:start.y });
        else temp = makeShape(kind, start.x - d/2, start.y - d/2 * (kind === 'rect' || kind === 'rrect' ? .7 : 1), d, d * (kind === 'rect' || kind === 'rrect' ? .7 : 1));
        temp.name = MS.nextName(kind === 'rrect' ? 'rect' : kind); cv().add(temp);
      }
      temp.setCoords(); MS.hideHud();
      const o = temp; temp = null;
      finishCreate(o, 'Draw ' + describe(kind).toLowerCase());
    },
    exit(){ if(temp){ cv().remove(temp); temp = null; } },
  };
  function replace(n){
    const name = temp.name; cv().remove(temp); n.name = name; temp = n; cv().add(temp);
  }
}

/* ======================= TOOL DEFINITIONS ======================= */
function reg(d){ defs[d.id] = d; order.push(d.id); return d; }

reg({ id:'move', label:'Move', icon:'select', key:'V', lock:false, cursor:'default', hint:'Click to select · drag to move · drag empty space to marquee-select · Shift-click adds to selection · Space+drag pans' });
reg({ id:'hand', label:'Hand (pan)', icon:'hand', key:'H', lock:true, cursor:'grab', hint:'Drag to pan the view (or hold Space with any tool)' });
reg({ id:'zoom', label:'Zoom', icon:'zoom', key:'Z', lock:true, cursor:'zoom-in', hint:'Click to zoom in · Alt-click to zoom out · drag a box to zoom to it',
  _s:null,
  down(p, e){ this._s = { x:e.clientX, y:e.clientY, p, alt:e.altKey, moved:false }; },
  move(p, e){ if(!this._s) return; const s = this._s; if(Math.hypot(e.clientX - s.x, e.clientY - s.y) > 6){ s.moved = true; s.cur = p; MS.redrawOverlay(); } },
  up(p, e){
    const s = this._s; this._s = null; if(!s) return;
    if(s.moved && !s.alt){
      const r = { left:Math.min(s.p.x, p.x), top:Math.min(s.p.y, p.y), width:Math.abs(p.x - s.p.x), height:Math.abs(p.y - s.p.y) };
      if(r.width > 4 && r.height > 4) MS.view.toRect(r, 10);
    } else {
      const vp = $('#vp').getBoundingClientRect();
      MS.view.setZoom(S.view.z * (s.alt ? 1/1.6 : 1.6), e.clientX - vp.left, e.clientY - vp.top);
    }
    MS.redrawOverlay();
  },
  overlay(ctx){
    const s = this._s; if(!s || !s.moved || s.alt || !s.cur) return;
    const a = MS.view.toScreen(s.p), b = MS.view.toScreen(s.cur);
    ctx.save(); ctx.strokeStyle = '#5b8cff'; ctx.fillStyle = 'rgba(91,140,255,.12)'; ctx.setLineDash([5, 4]);
    ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y)); ctx.strokeRect(Math.min(a.x, b.x) + .5, Math.min(a.y, b.y) + .5, Math.abs(a.x - b.x), Math.abs(a.y - b.y)); ctx.restore();
  },
});

[['rect','rect','R','Rectangle / square'],['rrect','rrect','Q','Rounded square / rectangle'],['ellipse','ellipse','O','Ellipse / circle'],['triangle','triangle','','Triangle'],
 ['polygon','polygon','','Polygon'],['star','star','','Star'],['line','line','L','Line'],['arrow','arrow','','Arrow']].forEach(([k, ic, key, label])=>{
  const d = shapeTool(k, ic, key, label);
  d.isShape = true;
  if(k === 'ellipse' || k === 'rrect') d.group = null;   // own toolbox buttons, not in the shapes flyout
  d.hint = label + ': drag to draw · snaps to a perfect square/circle (Shift forces it) · 45° · Alt = from centre. Switches back to Move / Select when you let go.';
  reg(d);
});

/* ---- pen (bezier) ---- */
reg((function(){
  let pts = [], drag = null, hover = null, closed = false;
  const NEAR = 9;
  function build(){
    if(pts.length < 2) return null;
    let d = 'M ' + pts[0].x + ' ' + pts[0].y;
    const seg = (a, b)=>{
      if(a.ox !== undefined || b.ix !== undefined) return ' C ' + (a.ox ?? a.x) + ' ' + (a.oy ?? a.y) + ' ' + (b.ix ?? b.x) + ' ' + (b.iy ?? b.y) + ' ' + b.x + ' ' + b.y;
      return ' L ' + b.x + ' ' + b.y;
    };
    for(let i = 1; i < pts.length; i++) d += seg(pts[i-1], pts[i]);
    if(closed) d += seg(pts[pts.length-1], pts[0]) + ' Z';
    return d;
  }
  function finish(close){
    if(pts.length < 2){ cancel(); return; }
    closed = !!close;
    const d = build();
    const col = S.noStroke ? (S.noFill ? '#000000' : S.fill) : S.stroke;
    const o = new fabric.Path(d, { fill: closed && !S.noFill ? S.fill : '', stroke: (closed && S.noStroke && !S.noFill) ? null : col, strokeWidth: (closed && S.noStroke && !S.noFill) ? 0 : S.strokeW, strokeLineCap:'round', strokeLineJoin:'round', strokeUniform:true, objectCaching:false });
    o.name = MS.nextName('pen');
    pts = []; closed = false; drag = null;
    cv().add(o); finishCreate(o, 'Pen path'); MS.redrawOverlay();
  }
  function cancel(){ pts = []; closed = false; drag = null; MS.redrawOverlay(); }
  return {
    id:'pen', label:'Pen (bezier path)', icon:'pen', key:'P', lock:true, cursor:'crosshair',
    hint:'Click to add corner points · click-drag to pull smooth curves · click the first point to close · Enter / double-click finishes · Backspace removes the last point · Esc cancels',
    down(p, e){
      p = snapP(p);
      if(pts.length >= 3 && Math.hypot((p.x - pts[0].x) * S.view.z, (p.y - pts[0].y) * S.view.z) < NEAR){ finish(true); return; }
      const pt = { x:p.x, y:p.y }; pts.push(pt); drag = pt; MS.redrawOverlay();
    },
    move(p, e){
      hover = snapP(p);
      if(drag){
        const dx = p.x - drag.x, dy = p.y - drag.y;
        if(Math.hypot(dx * S.view.z, dy * S.view.z) > 3){ drag.ox = drag.x + dx; drag.oy = drag.y + dy; drag.ix = drag.x - dx; drag.iy = drag.y - dy; }
      }
      MS.redrawOverlay();
    },
    up(){ drag = null; },
    dblclick(){ if(pts.length > 1){ pts.pop(); finish(false); } },
    onKey(e){
      if(e.key === 'Enter'){ finish(false); return true; }
      if(e.key === 'Escape'){ cancel(); return true; }
      if(e.key === 'Backspace' && pts.length){ pts.pop(); MS.redrawOverlay(); return true; }
      return false;
    },
    exit(){ if(pts.length > 1) finish(false); else cancel(); },
    overlay(ctx){
      if(!pts.length) return;
      const z = S.view, sc = p=> MS.view.toScreen(p);
      ctx.save(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#5b8cff';
      const all = pts.slice();
      ctx.beginPath(); const a0 = sc(all[0]); ctx.moveTo(a0.x, a0.y);
      for(let i = 1; i < all.length; i++){
        const a = all[i-1], b = all[i], A = sc(a), B = sc(b);
        if(a.ox !== undefined || b.ix !== undefined){ const c1 = sc({ x:a.ox ?? a.x, y:a.oy ?? a.y }), c2 = sc({ x:b.ix ?? b.x, y:b.iy ?? b.y }); ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, B.x, B.y); }
        else ctx.lineTo(B.x, B.y);
      }
      if(hover){ const last = all[all.length-1], H = sc(hover), L = sc(last); if(last.ox !== undefined){ const c1 = sc({ x:last.ox, y:last.oy }); ctx.bezierCurveTo(c1.x, c1.y, H.x, H.y, H.x, H.y); } else ctx.lineTo(H.x, H.y); }
      ctx.stroke();
      all.forEach((q, i)=>{
        const Q = sc(q);
        if(q.ox !== undefined){ ctx.strokeStyle = '#8aa8ff'; ctx.lineWidth = 1; [[q.ix, q.iy], [q.ox, q.oy]].forEach(([hx, hy])=>{ const Hh = sc({ x:hx, y:hy }); ctx.beginPath(); ctx.moveTo(Q.x, Q.y); ctx.lineTo(Hh.x, Hh.y); ctx.stroke(); ctx.beginPath(); ctx.arc(Hh.x, Hh.y, 3.2, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); }); }
        ctx.fillStyle = i === 0 ? '#ff3d8b' : '#fff'; ctx.strokeStyle = '#5b8cff'; ctx.lineWidth = 1.5; ctx.fillRect(Q.x - 4, Q.y - 4, 8, 8); ctx.strokeRect(Q.x - 4, Q.y - 4, 8, 8);
      });
      ctx.restore();
    },
  };
})());

/* ---- pencil / brush ---- */
const brush = MS.brush = { size:6, smooth:8, color:null };
reg({
  id:'pencil', label:'Pencil / brush', icon:'pencil', key:'B', lock:true, cursor:'crosshair', drawing:true,
  hint:'Draw freehand. Colour & size are in the bar above. Each stroke becomes an editable vector path.',
  enter(){
    const c = cv(); c.isDrawingMode = true;
    c.freeDrawingBrush = new fabric.PencilBrush(c);
    c.freeDrawingBrush.color = brush.color || (S.noStroke ? S.fill : S.stroke);
    c.freeDrawingBrush.width = brush.size; c.freeDrawingBrush.decimate = Math.max(0.4, brush.smooth / 4);
    c.freeDrawingBrush.strokeLineCap = 'round'; c.freeDrawingBrush.strokeLineJoin = 'round';
  },
  exit(){ cv().isDrawingMode = false; },
});

/* ---- text ---- */
reg({
  id:'text', label:'Text', icon:'text', key:'T', lock:true, cursor:'text',
  hint:'Click on the canvas to place text, then type it in the Text box on the right. The tool returns to Move / Select once the text is placed.',
  down(p){ T.addText({ x:p.x, y:p.y, select:true }); },
});

reg({ id:'image', label:'Import picture', icon:'image', key:'', action:true, hint:'Pick pictures to add (PNG, JPG, WebP, SVG…) — or just drag them onto the canvas' });
reg({
  id:'wand', label:'Magic wand (remove background)', icon:'wand', key:'W', lock:true, cursor:'crosshair',
  hint:'Click a background colour on a picture to make it transparent. Raise tolerance to remove more shades.',
  down(p){
    const t = imageUnderPoint(p);
    if(!t){ toast('Click on a picture to remove its background colour.'); return; }
    wandRemove(t, p, W.tol, W.global, W.contiguousOnly);
  },
});
reg({
  id:'eraser', label:'Eraser', icon:'eraser', key:'E', lock:true, cursor:'cell', hint:'Drag over a picture to erase parts of it (non-destructive until you save)',
  _active:false,
  down(p){ const t = imageUnderPoint(p); if(!t){ toast('Drag on a picture to erase it.'); return; } this._active = true; startErase(t); eraseAt(p); },
  move(p){ if(this._active) eraseAt(p); },
  up(){ if(this._active){ this._active = false; endErase(); } },
});
reg({
  id:'dropper', label:'Eyedropper', icon:'dropper', key:'I', lock:true, cursor:'copy',
  hint:'Click anywhere to pick up that colour as your fill. Alt-click picks the stroke colour.',
  down(p, e){ pickColor(e); },
});

const W = { tol:30, global:false, contiguousOnly:true };

/* ======================= TOOL SWITCHING ======================= */
let flyLast = { shapes:'rect' };
T.defs = defs; T.order = order; T.reg = reg;
T.current = ()=> defs[S.tool];
T.set = function(id){
  const t = defs[id]; if(!t) return;
  if(t.action){ if(id === 'image') $('#fileImportInput').click(); return; }
  const c = cv(), prev = defs[S.tool];
  if(prev && prev.exit && prev.id !== id) { try{ prev.exit(); }catch(e){ console.error(e); } }
  S.tool = id;
  if(t.group) flyLast[t.group] = id;
  const locked = !!t.lock;
  c.isDrawingMode = false;
  c.selection = !locked; c.skipTargetFind = locked;
  c.defaultCursor = t.cursor || 'default'; c.hoverCursor = locked ? (t.cursor || 'default') : 'move'; c.freeDrawingCursor = 'crosshair';
  c.drawControls = locked ? function(){} : fabric.Canvas.prototype.drawControls;
  S.controlsHidden = locked;
  if(locked && !t.keepSelection && (t.drawing || ['pen','text'].includes(id) ) && false) c.discardActiveObject();
  if(t.enter) t.enter();
  c.requestRenderAll();
  $$('#toolbox .tool').forEach(b=> b.classList.toggle('active', b.dataset.tool === id || (b.dataset.group && t.group === b.dataset.group)));
  const gb = $('#toolbox .tool[data-group="shapes"]'); if(gb && t.group === 'shapes'){ gb.dataset.tool = id; gb.innerHTML = MS.icon(t.icon); gb.setAttribute('data-tip', t.label + (t.key ? '|' + t.key : '')); }
  MS.hint(t.hint || t.label);
  T.renderOptions();
  MS.redrawOverlay();
  MS.emit('tool', id);
};

/* ======================= MOUSE DISPATCH ======================= */
function wireMouse(){
  const c = cv();
  c.on('mouse:down', o=>{ const t = defs[S.tool]; if(t && t.down && o.e.button === 0 && !S.space) t.down(pointOf(o), o.e); });
  c.on('mouse:move', o=>{ const t = defs[S.tool]; if(t && t.move && !S.space) t.move(pointOf(o), o.e); });
  c.on('mouse:up', o=>{ const t = defs[S.tool]; if(t && t.up && !S.space) t.up(pointOf(o), o.e); });
  c.on('mouse:dblclick', o=>{
    const t = defs[S.tool];
    if(t && t.dblclick){ t.dblclick(pointOf(o), o.e); return; }
    if(S.tool === 'move' && o.target && MS.isTextObj(o.target)){ MS.showPage('design'); const b = $('#propTextContent'); if(b){ b.focus(); b.select(); } }
  });
  c.on('path:created', e=>{
    if(S.tool !== 'pencil') return;
    const p = e.path;
    p.set({ strokeLineCap:'round', strokeLineJoin:'round', strokeUniform:true, objectCaching:false });
    c.setActiveObject(p); MS.commit('Brush stroke');
  });
  MS.on('overlay', ctx=>{ const t = defs[S.tool]; if(t && t.overlay) t.overlay(ctx); });
}

/* ======================= TEXT / IMAGE / SHAPE CREATION APIs ======================= */
MS.isTextObj = o=> !!o && (!!o._isCurvedText || (o.isType && (o.isType('i-text') || o.isType('textbox') || o.isType('text'))));
T.addText = function(o){
  o = o || {};
  const c = cv();
  const t = new fabric.IText(o.text || 'Text', {
    left: o.x !== undefined ? o.x : S.doc.wPx/2, top: o.y !== undefined ? o.y : S.doc.hPx/2, originX:'center', originY:'center',
    fontFamily: o.fontFamily || S.font, fontSize: o.fontSize || Math.round(Math.min(S.doc.wPx, S.doc.hPx) / 9), fill: o.fill || (S.noFill ? '#222222' : S.fill),
    fontWeight: o.bold ? 'bold' : 'normal', textAlign: o.align || 'center', charSpacing: o.charSpacing || 0, lineHeight: o.lineHeight || 1.16,
    stroke: o.stroke || null, strokeWidth: o.strokeWidth || 0, strokeUniform:true, paintFirst: o.stroke ? 'stroke' : 'fill',
  });
  t.name = MS.nextName('text');
  c.add(t); c.discardActiveObject(); c.setActiveObject(t);
  c.requestRenderAll(); MS.commit('Add text');
  if(o.select !== false){
    MS.showPage('design');
    setTimeout(()=>{ const b = $('#propTextContent'); if(b){ b.focus(); b.select(); } }, 30);
  }
  if(!MS.prefs.stickyTools && S.tool === 'text') T.set('move');
  return t;
};
T.addShape = function(kind, o){
  o = o || {};
  const cx = o.x !== undefined ? o.x : S.doc.wPx/2, cy = o.y !== undefined ? o.y : S.doc.hPx/2;
  const w = o.w || Math.min(S.doc.wPx, S.doc.hPx) * .35, h = o.h || w;
  const saved = { fill:S.fill, stroke:S.stroke, noFill:S.noFill, noStroke:S.noStroke, sw:S.strokeW };
  if(o.fill !== undefined){ S.fill = o.fill; S.noFill = !o.fill; }
  if(o.stroke !== undefined){ S.stroke = o.stroke || S.stroke; S.noStroke = !o.stroke; }
  let obj;
  if(kind === 'heart') obj = new fabric.Path('M 0 -8 C -2 -14 -12 -14 -12 -4 C -12 4 -4 8 0 14 C 4 8 12 4 12 -4 C 12 -14 2 -14 0 -8 Z', { fill:fillValue(), stroke:strokeValue(), strokeWidth:S.noStroke ? 0 : S.strokeW, originX:'center', originY:'center', left:cx, top:cy, scaleX:w/26, scaleY:h/26 });
  else if(kind === 'speech') obj = new fabric.Path('M 2 2 H 30 V 20 H 12 L 4 28 L 6 20 H 2 Z', { fill:fillValue(), stroke:strokeValue(), strokeWidth:S.noStroke ? 0 : S.strokeW, originX:'center', originY:'center', left:cx, top:cy, scaleX:w/30, scaleY:h/30 });
  else if(kind === 'cross'){
    const t = w * .34, pts = [{x:-t/2,y:-w/2},{x:t/2,y:-w/2},{x:t/2,y:-t/2},{x:w/2,y:-t/2},{x:w/2,y:t/2},{x:t/2,y:t/2},{x:t/2,y:w/2},{x:-t/2,y:w/2},{x:-t/2,y:t/2},{x:-w/2,y:t/2},{x:-w/2,y:-t/2},{x:-t/2,y:-t/2}];
    obj = new fabric.Polygon(pts, { fill:fillValue(), stroke:strokeValue(), strokeWidth:S.noStroke ? 0 : S.strokeW, originX:'center', originY:'center', left:cx, top:cy });
  } else {
    obj = makeShape(kind, cx - w/2, cy - h/2, w, h, { x:cx - w/2, y:cy }, { x:cx + w/2, y:cy });
  }
  Object.assign(S, { fill:saved.fill, stroke:saved.stroke, noFill:saved.noFill, noStroke:saved.noStroke });
  if(!obj){ MS.shapeLib(kind); return cv().getActiveObject(); }
  obj.name = MS.nextName(kind === 'rrect' ? 'rect' : (['heart','speech','cross'].includes(kind) ? 'polygon' : kind));
  const c = cv(); c.add(obj); c.discardActiveObject(); c.setActiveObject(obj); c.requestRenderAll(); MS.commit('Add ' + describe(kind).toLowerCase());
  return obj;
};
T.addImage = function(src, o, cb){
  o = o || {};
  fabric.Image.fromURL(src, img=>{
    if(!img || !img.width){ toast('That picture could not be loaded.', 3500, 'err'); return; }
    const maxDim = Math.min(S.doc.wPx, S.doc.hPx) * (o.fit || .6);
    const sc = o.noScale ? 1 : Math.min(1, maxDim / Math.max(img.width, img.height)) || 1;
    img.set({ left: o.x !== undefined ? o.x : S.doc.wPx/2, top: o.y !== undefined ? o.y : S.doc.hPx/2, originX:'center', originY:'center', scaleX:sc, scaleY:sc, strokeUniform:true });
    img.name = o.name || MS.nextName('image');
    const c = cv(); c.add(img); c.discardActiveObject(); c.setActiveObject(img); c.requestRenderAll();
    MS.commit('Add picture');
    if(!MS.prefs.stickyTools || S.tool === 'image') { if(S.tool !== 'move') T.set('move'); }
    cb && cb(img);
  }, { crossOrigin:'anonymous' });
};
MS.importFiles = function(list, dropEvt){
  let i = 0;
  Array.from(list).forEach(file=>{
    const idx = i++;
    const pt = dropEvt ? cv().getPointer(dropEvt) : null;
    const ok = pt && isFinite(pt.x) && isFinite(pt.y);
    const pos = ok ? { x:pt.x + idx * 20, y:pt.y + idx * 20 } : { x:S.doc.wPx/2 + idx * 20, y:S.doc.hPx/2 + idx * 20 };
    if(/\.svg$/i.test(file.name) || file.type === 'image/svg+xml'){
      const r = new FileReader();
      r.onload = ev=>{
        fabric.loadSVGFromString(ev.target.result, (objs, opts)=>{
          if(!objs || !objs.length){ toast('That SVG had nothing I could read.', 3500, 'err'); return; }
          const g = fabric.util.groupSVGElements(objs, opts);
          const maxDim = Math.min(S.doc.wPx, S.doc.hPx) * .6, sc = Math.min(1, maxDim / Math.max(g.width, g.height)) || 1;
          g.set({ left:pos.x, top:pos.y, originX:'center', originY:'center', scaleX:sc, scaleY:sc, name:file.name.replace(/\.svg$/i, '') || MS.nextName('group') });
          const c = cv(); c.add(g); c.discardActiveObject(); c.setActiveObject(g); c.requestRenderAll(); MS.commit('Import SVG');
          toast('SVG imported as editable vector shapes — Ungroup (Ctrl+Shift+G) to edit the pieces.', 4500);
        });
      };
      r.readAsText(file);
    } else if(file.type.startsWith('image/')){
      const r = new FileReader();
      r.onload = ev=> T.addImage(ev.target.result, { x:pos.x, y:pos.y, name:file.name.replace(/\.[a-z0-9]+$/i, '') });
      r.readAsDataURL(file);
    } else if(/\.(json|msd)$/i.test(file.name)){ MS.openProjectFile(file); }
  });
};

/* ======================= WAND / ERASER / DROPPER ======================= */
function imageUnderPoint(p){
  const objs = cv().getObjects(), pt = new fabric.Point(p.x, p.y);
  for(let i = objs.length - 1; i >= 0; i--){
    const o = objs[i];
    if(o.type !== 'image' || !o.visible || o.__isBackground) continue;
    if(o.containsPoint(pt, null, true, true)) return o;
  }
  return null;
}
function colorDist(r1, g1, b1, r2, g2, b2){ const dr = r1-r2, dg = g1-g2, db = b1-b2; return Math.sqrt(dr*dr + dg*dg + db*db); }
function wandRemove(img, p, tolPct, globalMode){
  const local = img.toLocalPoint(new fabric.Point(p.x, p.y), 'center', 'center');
  const px = Math.round(local.x + img.width/2), py = Math.round(local.y + img.height/2);
  if(px < 0 || py < 0 || px >= img.width || py >= img.height){ toast('Click inside the picture.'); return; }
  const work = document.createElement('canvas'); work.width = img.width; work.height = img.height;
  const wctx = work.getContext('2d'); wctx.drawImage(img._originalElement || img._element, 0, 0, img.width, img.height);
  const id = wctx.getImageData(0, 0, work.width, work.height), d = id.data, w = work.width, h = work.height;
  const si = (py * w + px) * 4, r0 = d[si], g0 = d[si+1], b0 = d[si+2], th = tolPct / 100 * 441.7;
  if(globalMode){
    for(let i = 0; i < d.length; i += 4) if(colorDist(d[i], d[i+1], d[i+2], r0, g0, b0) <= th) d[i+3] = 0;
  } else {
    const seen = new Uint8Array(w*h), st = [[px, py]]; seen[py*w + px] = 1;
    while(st.length){
      const [cx, cy] = st.pop(), ix = (cy*w + cx) * 4;
      if(colorDist(d[ix], d[ix+1], d[ix+2], r0, g0, b0) > th) continue;
      d[ix+3] = 0;
      for(const [nx, ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]){
        if(nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[ny*w + nx]){ seen[ny*w + nx] = 1; const nI = (ny*w + nx) * 4; if(colorDist(d[nI], d[nI+1], d[nI+2], r0, g0, b0) <= th) st.push([nx, ny]); }
      }
    }
  }
  wctx.putImageData(id, 0, 0);
  img.setElement(work, { width:w, height:h }); img._isEraseCanvas = true; img.dirty = true;
  MS.dirtyObj(img); cv().requestRenderAll(); MS.commit('Remove background colour');
  toast('Removed. Raise or lower the tolerance and click again if needed.');
}
let eTarget = null, eCanvas = null, eCtx = null;
function startErase(img){
  eTarget = img;
  if(img._isEraseCanvas && img._element instanceof HTMLCanvasElement) eCanvas = img._element;
  else {
    eCanvas = document.createElement('canvas'); eCanvas.width = img.width; eCanvas.height = img.height;
    eCanvas.getContext('2d').drawImage(img._originalElement || img._element, 0, 0, img.width, img.height);
    img.setElement(eCanvas, { width:img.width, height:img.height }); img._isEraseCanvas = true;
  }
  eCtx = eCanvas.getContext('2d');
}
const ER = MS.eraserOpt = { size:36, soft:30 };
function eraseAt(p){
  if(!eTarget) return;
  const local = eTarget.toLocalPoint(new fabric.Point(p.x, p.y), 'center', 'center');
  const x = local.x + eTarget.width/2, y = local.y + eTarget.height/2;
  const rad = (ER.size / S.view.z) / (eTarget.scaleX || 1) / 2;
  eCtx.save(); eCtx.globalCompositeOperation = 'destination-out';
  const g = eCtx.createRadialGradient(x, y, rad * (1 - ER.soft/100), x, y, rad);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  eCtx.fillStyle = g; eCtx.beginPath(); eCtx.arc(x, y, rad, 0, 7); eCtx.fill(); eCtx.restore();
  eTarget.dirty = true; cv().requestRenderAll();
}
function endErase(){ if(!eTarget) return; MS.dirtyObj(eTarget); eTarget = null; eCanvas = null; eCtx = null; MS.commit('Erase'); }
function pickColor(e){
  const c = cv(), low = c.lowerCanvasEl, r = low.getBoundingClientRect(), dpr = low.width / r.width;
  const x = Math.round((e.clientX - r.left) * dpr), y = Math.round((e.clientY - r.top) * dpr);
  if(x < 0 || y < 0 || x >= low.width || y >= low.height) return;
  const d = low.getContext('2d').getImageData(x, y, 1, 1).data;
  if(d[3] === 0){ toast('That spot is transparent.'); return; }
  const hex = MS.rgbToHex(d[0], d[1], d[2]);
  const asStroke = e.altKey;
  const a = c.getActiveObject();
  if(asStroke){ S.stroke = hex; S.noStroke = false; } else { S.fill = hex; S.noFill = false; }
  if(a && a.type !== 'image' && !MS.isTextObj(a) || (a && MS.isTextObj(a) && !asStroke)){
    MS.ops.each(o=> { if(o.type !== 'image') o.set(asStroke ? 'stroke' : 'fill', hex); }); MS.dirtyObj(a); c.requestRenderAll(); MS.commit('Eyedropper');
  }
  MS.noteColor(hex); T.syncSwatches(); MS.emit('selection'); T.renderOptions();
  toast('Picked ' + hex + (asStroke ? ' (stroke)' : ' (fill)'));
}

/* ======================= TOOLBOX ======================= */
T.buildToolbox = function(){
  const box = $('#toolbox'); box.innerHTML = '';
  const add = (id, group)=>{
    const t = defs[id];
    const b = document.createElement('button'); b.className = 'tool' + (group ? ' has-flyout' : ''); b.dataset.tool = id;
    if(group) b.dataset.group = group;
    b.setAttribute('data-tip', t.label + (t.key ? '|' + t.key : ''));
    b.innerHTML = MS.icon(t.icon);
    b.addEventListener('click', ()=> { if(group && S.tool === flyLast[group] && t.group === group && b.dataset.armed === '1'){ openFlyout(b, group); } T.set(b.dataset.tool); b.dataset.armed = '1'; setTimeout(()=>{ b.dataset.armed = ''; }, 500); });
    if(group){
      b.addEventListener('contextmenu', e=>{ e.preventDefault(); openFlyout(b, group); });
      let hold = null;
      b.addEventListener('mousedown', ()=>{ hold = setTimeout(()=> openFlyout(b, group), 380); });
      ['mouseup','mouseleave'].forEach(ev=> b.addEventListener(ev, ()=> clearTimeout(hold)));
    }
    box.appendChild(b); return b;
  };
  const sep = ()=>{ const s = document.createElement('div'); s.className = 'tool-sep'; box.appendChild(s); };
  add('move'); if(defs.node) add('node'); add('hand'); add('zoom'); sep();
  add('rect', 'shapes'); add('rrect'); add('ellipse'); add('pen'); add('pencil'); add('text'); sep();
  add('image'); add('wand'); add('eraser'); add('dropper');
  // colour chips
  const col = document.createElement('div'); col.className = 'tool-colors';
  col.innerHTML = '<div class="sw" id="swStroke" data-tip="Stroke colour|click"><input type="color" id="swStrokeIn"></div><div class="sw" id="swFill" data-tip="Fill colour|click"><input type="color" id="swFillIn"></div><button class="swap" id="swSwap" data-tip="Swap fill & stroke|X">' + MS.icon('swap') + '</button>';
  box.appendChild(col);
  const fi = $('#swFillIn'), si = $('#swStrokeIn');
  fi.addEventListener('input', ()=>{ S.fill = fi.value; S.noFill = false; applyDefaultsToSelection('fill'); T.syncSwatches(); T.renderOptions(); });
  si.addEventListener('input', ()=>{ S.stroke = si.value; S.noStroke = false; applyDefaultsToSelection('stroke'); T.syncSwatches(); T.renderOptions(); });
  fi.addEventListener('change', ()=> MS.noteColor(fi.value)); si.addEventListener('change', ()=> MS.noteColor(si.value));
  $('#swSwap').addEventListener('click', swapColors);
  T.syncSwatches();
};
function openFlyout(btn, group){
  const items = order.filter(id=> defs[id].group === group);
  const r = btn.getBoundingClientRect();
  MS.closeMenus();
  const m = document.createElement('div'); m.className = 'flyout';
  m.innerHTML = items.map(id=> `<button data-id="${id}" class="${S.tool === id ? 'active' : ''}">${MS.icon(defs[id].icon)}<span>${MS.esc(defs[id].label)}</span>${defs[id].key ? '<kbd>' + defs[id].key + '</kbd>' : ''}</button>`).join('');
  document.body.appendChild(m);
  m.style.left = (r.right + 6) + 'px'; m.style.top = Math.min(r.top, innerHeight - m.offsetHeight - 8) + 'px';
  const close = ()=>{ m.remove(); document.removeEventListener('mousedown', away, true); };
  const away = e=>{ if(!m.contains(e.target)) close(); };
  setTimeout(()=> document.addEventListener('mousedown', away, true), 0);
  m.addEventListener('click', e=>{ const b = e.target.closest('button'); if(b){ T.set(b.dataset.id); close(); } });
}
function applyDefaultsToSelection(which){
  const c = cv(), a = c.getActiveObject();
  if(!a || a.type === 'image') return;
  MS.ops.each(o=>{ if(o.type === 'image') return; if(which === 'fill') o.set('fill', S.noFill ? '' : S.fill); else o.set('stroke', S.noStroke ? null : S.stroke); });
  MS.dirtyObj(a); c.requestRenderAll(); clearTimeout(S.dfT); S.dfT = setTimeout(()=> MS.commit(which === 'fill' ? 'Change fill' : 'Change stroke'), 400);
  MS.emit('selection');
}
function swapColors(){ const f = S.fill, nf = S.noFill; S.fill = S.stroke; S.noFill = S.noStroke; S.stroke = f; S.noStroke = nf; T.syncSwatches(); T.renderOptions(); }
T.swapColors = swapColors;
T.syncSwatches = function(){
  const f = $('#swFill'), s = $('#swStroke'); if(!f) return;
  f.style.background = S.noFill ? 'repeating-linear-gradient(45deg,#fff 0 4px,#f00 4px 5px)' : S.fill;
  s.style.background = S.noStroke ? 'repeating-linear-gradient(45deg,#fff 0 4px,#f00 4px 5px)' : S.stroke;
  const fi = $('#swFillIn'), si = $('#swStrokeIn'); if(fi) fi.value = S.fill; if(si) si.value = S.stroke;
};

/* ======================= OPTIONS BAR ======================= */
const ob = ()=> $('#optionsbar');
function swatchHtml(id, val, none){ return `<span class="swatch-in" title="${id}"><input type="color" id="${id}" value="${val}"></span>`; }
T.renderOptions = function(){
  const bar = ob(); if(!bar) return;
  const t = defs[S.tool] || defs.move;
  let h = `<div class="opt-title">${MS.icon(t.icon)}<span>${MS.esc(t.label.replace(/ \(.*/, ''))}</span></div>`;
  const kind = S.tool;
  const shapeLike = defs[kind] && defs[kind].isShape;
  const fillStroke = ()=> `
    <div class="og"><label>Fill</label>${swatchHtml('obFill', S.fill)}<label class="chk mut"><input type="checkbox" id="obNoFill" ${S.noFill ? 'checked' : ''}>None</label></div>
    <div class="og"><label>Stroke</label>${swatchHtml('obStroke', S.stroke)}<label class="chk mut"><input type="checkbox" id="obNoStroke" ${S.noStroke ? 'checked' : ''}>None</label>
      <div class="f" style="width:74px"><span data-scrub="obStrokeW">W</span><input type="number" id="obStrokeW" min="0" step="0.5" value="${S.strokeW}"></div></div>`;
  const radKey = kind === 'rrect' ? 'radius' : 'rectR', rmax = Math.max(400, Math.round(Math.min(S.doc.wPx, S.doc.hPx) / 2));
  const radiusHtml = ()=> `<div class="og radius-og"><label>Corner radius${kind === 'rect' ? ' (0 = sharp)' : ''}</label><input type="range" id="obRadius" min="0" max="${rmax}" value="${Math.min(rmax, SHAPE_OPT[radKey])}" style="width:150px"><div class="f" style="width:78px"><input type="number" id="obRadiusN" min="0" step="1" value="${SHAPE_OPT[radKey]}"><em>px</em></div>
      <span class="chips">${[0, 8, 24, 48, 100, 200, 500, 1000].filter(r=> r <= rmax).map(r=> `<span class="chip" data-radius="${r}">${r}</span>`).join('') + '<span class="chip" data-radius="100000" data-tip="Fully rounded ends / circle">Full</span>'}</span></div>`;
  if(shapeLike){
    if(kind === 'rect' || kind === 'rrect') h += radiusHtml();
    h += fillStroke();
    if(kind === 'polygon') h += `<div class="og"><label>Sides</label><div class="f" style="width:64px"><input type="number" id="obSides" min="3" max="24" value="${SHAPE_OPT.sides}" style="padding-left:8px"></div></div>`;
    if(kind === 'star') h += `<div class="og"><label>Points</label><div class="f" style="width:64px"><input type="number" id="obPoints" min="3" max="24" value="${SHAPE_OPT.points}" style="padding-left:8px"></div><label>Inner</label><input type="range" id="obInner" min="10" max="90" value="${Math.round(SHAPE_OPT.inner*100)}" style="width:90px"></div>`;
    if(kind === 'line' || kind === 'arrow') h += `<div class="og"><label>Thickness</label><input type="range" id="obLineW" min="1" max="80" value="${SHAPE_OPT.lineW}" style="width:110px"></div>`;
    h += `<div class="og hint">${S.tool === 'rect' || S.tool === 'rrect' ? '' : ''}Locked to drawing — press <kbd>V</kbd> to select things again</div>`;
    h += `<div class="og push"><button class="btn sm" id="obMoreShapes"><i data-i="star"></i>More shapes…</button></div>`;
  } else if(kind === 'pen'){
    h += fillStroke() + `<div class="og hint">Click = corner · drag = curve · click first point = close · Enter = finish</div>`;
  } else if(kind === 'pencil'){
    h += `<div class="og"><label>Colour</label>${swatchHtml('obBrushColor', brush.color || (S.noStroke ? S.fill : S.stroke))}</div>
      <div class="og"><label>Size</label><input type="range" id="obBrushSize" min="1" max="120" value="${brush.size}" style="width:130px"><span class="hint" id="obBrushV">${brush.size}px</span></div>
      <div class="og"><label>Smoothing</label><input type="range" id="obBrushSmooth" min="0" max="40" value="${brush.smooth}" style="width:100px"></div>`;
  } else if(kind === 'text'){
    h += `<div class="og"><label>Font</label><button class="font-btn" id="obFont" style="width:200px;height:26px"><span class="fp" style="font-family:'${S.font}'">${MS.esc(S.font)}</span><i data-i="chevd"></i></button></div>
      <div class="og"><label>Colour</label>${swatchHtml('obFill', S.fill)}</div>
      <div class="og hint">Click the canvas to place text</div>`;
  } else if(kind === 'wand'){
    h += `<div class="og"><label>Tolerance</label><input type="range" id="obTol" min="0" max="100" value="${W.tol}" style="width:150px"><span class="hint" id="obTolV">${W.tol}</span></div>
      <div class="og"><label class="chk"><input type="checkbox" id="obGlobal" ${W.global ? 'checked' : ''}>Remove all matching colour (not only touching)</label></div>`;
  } else if(kind === 'eraser'){
    h += `<div class="og"><label>Size</label><input type="range" id="obEraseSize" min="4" max="300" value="${ER.size}" style="width:150px"><span class="hint" id="obEraseV">${ER.size}px</span></div>
      <div class="og"><label>Softness</label><input type="range" id="obEraseSoft" min="0" max="100" value="${ER.soft}" style="width:110px"></div>`;
  } else if(kind === 'dropper'){
    h += `<div class="og hint">Click to pick a colour into Fill · Alt-click picks Stroke</div>`;
  } else if(t.optionsHtml){
    h += t.optionsHtml();
  } else if(kind === 'hand' || kind === 'zoom'){
    h += `<div class="og"><button class="btn sm" id="obFit"><i data-i="fit"></i>Fit</button><button class="btn sm" id="ob100">100%</button><button class="btn sm" id="obSel">Zoom to selection</button></div>`;
  } else {
    // MOVE tool: contextual bar for the selection
    const a = cv() && cv().getActiveObject();
    if(!a){
      h += `<div class="og hint">${MS.esc(t.hint || '')}</div>`;
    } else {
      const multi = a.type === 'activeSelection', isText = MS.isTextObj(a) && !multi;
      h += `<div class="og"><span class="opt-pill">${multi ? a.getObjects().length + ' objects' : MS.esc(a.name || a.type)}</span></div>`;
      h += `<div class="og tb-row">
        <button class="tb" data-act="align" data-v="left" data-tip="Align left"><i data-i="al-l"></i></button><button class="tb" data-act="align" data-v="hcenter" data-tip="Centre horizontally"><i data-i="al-hc"></i></button><button class="tb" data-act="align" data-v="right" data-tip="Align right"><i data-i="al-r"></i></button>
        <button class="tb" data-act="align" data-v="top" data-tip="Align top"><i data-i="al-t"></i></button><button class="tb" data-act="align" data-v="vcenter" data-tip="Centre vertically"><i data-i="al-vc"></i></button><button class="tb" data-act="align" data-v="bottom" data-tip="Align bottom"><i data-i="al-b"></i></button></div>`;
      if(isText) h += `<div class="og"><button class="font-btn" id="obFont" style="width:190px;height:26px"><span class="fp" style="font-family:'${(a._isCurvedText ? (a._curveStyle||{}).fontFamily : a.fontFamily)||S.font}'">${MS.esc((a._isCurvedText ? (a._curveStyle||{}).fontFamily : a.fontFamily)||S.font)}</span><i data-i="chevd"></i></button>
        <div class="f" style="width:70px"><span data-scrub="obTextSize">Size</span><input type="number" id="obTextSize" min="4" value="${Math.round((a._isCurvedText ? (a._curveStyle||{}).fontSize : a.fontSize)||48)}"></div><label>Text colour</label>${swatchHtml('obTextFill', hexOr(a._isCurvedText ? (a._curveStyle||{}).fill : a.fill, '#222222'))}</div>`;
      h += `<div class="og fxbtns">` + [['shadow', 'drop', 'Shadow'], ['glow', 'sun', 'Glow'], ['outline', 'stroke', 'Outline']].map(([k, ic, l])=> `<button class="btn sm ${MS.fx && MS.fx.kindOn(a, k) ? 'active' : ''}" data-act="fx" data-fx="${k}" data-tip="${l}: click to turn on and set it up (they can all be on together)"><i data-i="${ic}"></i>${l}</button>`).join('') + `</div>`;
      if(a.type === 'rect' && !multi) h += `<div class="og radius-og"><label>Corner radius</label><input type="range" id="obSelRadius" min="0" max="${Math.round(Math.min(a.width, a.height) / 2)}" value="${Math.round(a.rx || 0)}" style="width:150px"><div class="f" style="width:78px"><input type="number" id="obSelRadiusN" min="0" step="1" value="${Math.round(a.rx || 0)}"><em>px</em></div><span class="chip" data-selradius="full" data-tip="Fully rounded ends / circle">Full</span></div>`;
      h += `<div class="og tb-row"><button class="tb" data-act="flipH" data-tip="Flip horizontal"><i data-i="fliph"></i></button><button class="tb" data-act="flipV" data-tip="Flip vertical"><i data-i="flipv"></i></button>
        <button class="tb" data-act="front" data-tip="Bring to front"><i data-i="front"></i></button><button class="tb" data-act="back" data-tip="Send to back"><i data-i="back"></i></button>
        ${multi ? '<button class="tb" data-act="group" data-tip="Group"><i data-i="group"></i></button>' : ''}${a.type === 'group' && !a._isCurvedText ? '<button class="tb" data-act="ungroup" data-tip="Ungroup"><i data-i="ungroup"></i></button>' : ''}</div>`;
      h += `<div class="og"><button class="btn sm" data-act="mirror"><i data-i="mirror"></i>Mirror copy</button><button class="btn sm" data-act="kaleido"><i data-i="kaleido"></i>Kaleidoscope</button><button class="btn sm" data-act="dup"><i data-i="dup"></i>Duplicate</button></div>`;
    }
  }
  bar.innerHTML = h;
  window.MSI.hydrate(bar); MS.syncRanges(bar);
  bindOptions(bar);
  const tl = defs[S.tool]; if(tl && tl.bindOptions) tl.bindOptions(bar);
};
function bindOptions(bar){
  const on = (id, ev, fn)=> { const e = $('#' + id, bar); if(e) e.addEventListener(ev, fn); };
  on('obFill', 'input', e=>{ S.fill = e.target.value; S.noFill = false; applyDefaultsToSelection('fill'); T.syncSwatches(); });
  on('obStroke', 'input', e=>{ S.stroke = e.target.value; S.noStroke = false; applyDefaultsToSelection('stroke'); T.syncSwatches(); });
  on('obFill', 'change', e=> MS.noteColor(e.target.value)); on('obStroke', 'change', e=> MS.noteColor(e.target.value));
  on('obNoFill', 'change', e=>{ S.noFill = e.target.checked; applyDefaultsToSelection('fill'); T.syncSwatches(); });
  on('obNoStroke', 'change', e=>{ S.noStroke = e.target.checked; applyDefaultsToSelection('stroke'); T.syncSwatches(); });
  on('obStrokeW', 'input', e=>{ S.strokeW = Math.max(0, +e.target.value || 0); });
  const setR = v=>{ const key = S.tool === 'rrect' ? 'radius' : 'rectR'; SHAPE_OPT[key] = Math.max(0, +v || 0); const r = $('#obRadius', bar), n = $('#obRadiusN', bar); if(r){ r.value = Math.min(+r.max, SHAPE_OPT[key]); MS.fillRange(r); } if(n && document.activeElement !== n) n.value = Math.min(SHAPE_OPT[key], r ? +r.max : SHAPE_OPT[key]); };
  on('obRadius', 'input', e=> setR(e.target.value)); on('obRadiusN', 'input', e=> setR(e.target.value));
  const setSel = v=>{ const a = cv().getActiveObject(); if(!a || a.type !== 'rect') return; const r = Math.max(0, Math.min(+v || 0, a.width / 2, a.height / 2)); a.set({ rx:r, ry:r }); a.dirty = true; a.setCoords(); cv().requestRenderAll(); const sl = $('#obSelRadius', bar); if(sl){ sl.value = r; MS.fillRange(sl); } clearTimeout(setSel._t); setSel._t = setTimeout(()=>{ MS.commit('Corner radius'); }, 350); };
  on('obSelRadius', 'input', e=> setSel(e.target.value)); on('obSelRadiusN', 'input', e=> setSel(e.target.value));
  $$('[data-selradius]', bar).forEach(c=> c.addEventListener('click', ()=> setSel(1e6)));
  $$('[data-radius]', bar).forEach(c=> c.addEventListener('click', ()=> setR(c.dataset.radius)));
  on('obSides', 'input', e=>{ SHAPE_OPT.sides = clamp(+e.target.value || 6, 3, 24); });
  on('obPoints', 'input', e=>{ SHAPE_OPT.points = clamp(+e.target.value || 5, 3, 24); });
  on('obInner', 'input', e=>{ SHAPE_OPT.inner = clamp(+e.target.value, 10, 90) / 100; });
  on('obLineW', 'input', e=>{ SHAPE_OPT.lineW = +e.target.value; });
  on('obMoreShapes', 'click', e=>{ const r = e.currentTarget.getBoundingClientRect(); shapeLibrary(r.left, r.bottom + 4); });
  on('obBrushColor', 'input', e=>{ brush.color = e.target.value; if(cv().freeDrawingBrush) cv().freeDrawingBrush.color = e.target.value; });
  on('obBrushSize', 'input', e=>{ brush.size = +e.target.value; $('#obBrushV').textContent = e.target.value + 'px'; if(cv().freeDrawingBrush) cv().freeDrawingBrush.width = brush.size; });
  on('obBrushSmooth', 'input', e=>{ brush.smooth = +e.target.value; if(cv().freeDrawingBrush) cv().freeDrawingBrush.decimate = Math.max(.4, brush.smooth / 4); });
  on('obTol', 'input', e=>{ W.tol = +e.target.value; $('#obTolV').textContent = e.target.value; });
  on('obGlobal', 'change', e=>{ W.global = e.target.checked; });
  on('obEraseSize', 'input', e=>{ ER.size = +e.target.value; $('#obEraseV').textContent = e.target.value + 'px'; });
  on('obEraseSoft', 'input', e=>{ ER.soft = +e.target.value; });
  on('obFit', 'click', ()=> MS.view.fit()); on('ob100', 'click', ()=> MS.view.actual()); on('obSel', 'click', ()=> MS.view.selection());
  on('obFont', 'click', e=> MS.openFontBrowser && MS.openFontBrowser(e.currentTarget));
  on('obTextSize', 'input', e=> MS.text && MS.text.setSize(+e.target.value));
  on('obTextFill', 'input', e=> MS.text && MS.text.setFill(e.target.value));
  $$('[data-act]', bar).forEach(b=> b.addEventListener('click', ()=>{
    const a = b.dataset.act, O = MS.ops;
    if(a === 'align') O.align(b.dataset.v); else if(a === 'flipH') O.flip('h'); else if(a === 'flipV') O.flip('v');
    else if(a === 'front') O.order('front'); else if(a === 'back') O.order('back'); else if(a === 'group') O.group(); else if(a === 'ungroup') O.ungroup();
    else if(a === 'fx') MS.fx.open(b, b.dataset.fx); else if(a === 'dup') O.duplicate(); else if(a === 'mirror') MS.symmetry && MS.symmetry.openMirror(); else if(a === 'kaleido') MS.symmetry && MS.symmetry.openKaleido();
    T.renderOptions();
  }));
}
function shapeLibrary(x, y){
  const items = [['diamond','Diamond'],['pentagon','Pentagon'],['hexagon','Hexagon'],['octagon','Octagon'],['star5','Star (5)'],['star6','Star (6)'],['burst','Starburst (12)'],['heart','Heart'],['speech','Speech bubble'],['cross','Cross'],['badge','Badge / seal'],['shield','Shield'],['banner','Ribbon banner'],['chevron','Chevron'],['bolt','Lightning bolt'],['crescent','Crescent moon'],['gear','Gear'],['drop','Drop']];
  MS.menu(items.map(([k, l])=>({ label:l, icon:'star', action:()=> MS.shapeLib(k) })), x, y);
}
MS.shapeLib = function(k){
  const size = Math.min(S.doc.wPx, S.doc.hPx) * .35;
  const common = { fill:fillValue(), stroke:strokeValue(), strokeWidth:S.noStroke ? 0 : S.strokeW, strokeUniform:true, originX:'center', originY:'center', left:S.doc.wPx/2, top:S.doc.hPx/2 };
  const reg = (n, r)=> polyPoints(n, r*2, r*2).map(p=>({ x:p.x - r, y:p.y - r }));
  let o = null;
  const star = (n, inner)=> polyPoints(n, size, size, inner).map(p=>({ x:p.x - size/2, y:p.y - size/2 }));
  if(k === 'diamond') o = new fabric.Polygon(reg(4, size/2), common);
  else if(k === 'pentagon') o = new fabric.Polygon(reg(5, size/2), common);
  else if(k === 'hexagon') o = new fabric.Polygon(reg(6, size/2), common);
  else if(k === 'octagon') o = new fabric.Polygon(reg(8, size/2), common);
  else if(k === 'star5') o = new fabric.Polygon(star(5, .42), common);
  else if(k === 'star6') o = new fabric.Polygon(star(6, .55), common);
  else if(k === 'burst') o = new fabric.Polygon(star(12, .78), common);
  else if(k === 'chevron') o = new fabric.Polygon([{x:-.5,y:-.5},{x:.1,y:-.5},{x:.5,y:0},{x:.1,y:.5},{x:-.5,y:.5},{x:-.1,y:0}].map(p=>({ x:p.x*size, y:p.y*size })), common);
  else if(k === 'bolt') o = new fabric.Polygon([{x:.15,y:-.5},{x:-.35,y:.1},{x:-.02,y:.1},{x:-.15,y:.5},{x:.35,y:-.15},{x:.02,y:-.15}].map(p=>({ x:p.x*size, y:p.y*size })), common);
  else if(k === 'banner') o = new fabric.Polygon([{x:-.6,y:-.2},{x:-.45,y:-.2},{x:-.45,y:-.28},{x:.45,y:-.28},{x:.45,y:-.2},{x:.6,y:-.2},{x:.5,y:0},{x:.6,y:.2},{x:.45,y:.2},{x:.45,y:.28},{x:-.45,y:.28},{x:-.45,y:.2},{x:-.6,y:.2},{x:-.5,y:0}].map(p=>({ x:p.x*size, y:p.y*size })), common);
  else if(k === 'badge'){ const pts = []; const n = 24; for(let i = 0; i < n*2; i++){ const r = i % 2 ? .46 : .5, a = -Math.PI/2 + i * Math.PI / n; pts.push({ x:Math.cos(a)*r*size, y:Math.sin(a)*r*size }); } o = new fabric.Polygon(pts, common); }
  else if(k === 'shield') o = new fabric.Path('M 0 -50 L 40 -38 L 40 6 C 40 28 20 42 0 54 C -20 42 -40 28 -40 6 L -40 -38 Z', { ...common, scaleX:size/90, scaleY:size/90 });
  else if(k === 'crescent') o = new fabric.Path('M 20 -45 A 45 45 0 1 0 45 20 A 36 36 0 1 1 20 -45 Z', { ...common, scaleX:size/100, scaleY:size/100 });
  else if(k === 'drop') o = new fabric.Path('M 0 -50 C 20 -20 40 0 40 22 A 40 40 0 0 1 -40 22 C -40 0 -20 -20 0 -50 Z', { ...common, scaleX:size/100, scaleY:size/100 });
  else if(k === 'gear'){ const pts = []; const teeth = 10; for(let i = 0; i < teeth*4; i++){ const a = -Math.PI/2 + i * 2*Math.PI / (teeth*4), r = (i % 4 < 2) ? .5 : .38; pts.push({ x:Math.cos(a)*r*size, y:Math.sin(a)*r*size }); } o = new fabric.Polygon(pts, common); }
  else { T.addShape(k); return; }
  o.name = MS.nextName('polygon');
  const c = cv(); c.add(o); c.discardActiveObject(); c.setActiveObject(o); c.requestRenderAll(); MS.commit('Add shape');
};

/* ======================= INIT ======================= */
T.init = function(){
  wireMouse();
  T.buildToolbox();
  $('#fileImportInput').addEventListener('change', e=>{ MS.importFiles(e.target.files); e.target.value = ''; });
  MS.on('selection', ()=>{ if(S.tool === 'move') T.renderOptions(); else if(S.controlsHidden) MS.redrawOverlay(); });
  T.set('move');
};
MS.setTool = T.set;
})();
