/* Merch Studio - core engine: document, canvas, viewport (zoom/pan), overlay, rulers, snapping, history, project I/O. */
(function(){
'use strict';
const MS = window.MS;
const { $, $$, clamp, toast } = MS;

const WORKING_PPI = 100;                // design px per inch (fixed working resolution for print docs)
const MAX_HISTORY = 80;
const MAX_HISTORY_BYTES = 160 * 1024 * 1024;
const SERIALIZE_PROPS = ['name','selectable','evented','hasControls','lockMovementX','lockMovementY','lockScalingX','lockScalingY','lockRotation',
  '__animId','_isCurvedText','_curveSourceText','_curveStyle','_curveAmount','_curveFade','_warp','_layout','__isBackground','__fillMeta','__fx','__lockedLayer','__linkId','__bgMode','__kind','__outlined','paintFirst','strokeUniform','globalCompositeOperation'];
MS.WORKING_PPI = WORKING_PPI;
MS.SERIALIZE_PROPS = SERIALIZE_PROPS;

/* ============================== STATE ============================== */
const S = MS.S = {
  doc: { name:'Untitled design', kind:'logo', mode:'print', unit:'in', wPx:1200, hPx:1200, wIn:12, hIn:12, garment:'#ffffff', garmentClear:true },
  view: { z:1, x:0, y:0 },
  guides: [],                            // ruler guides: {a:'v'|'h', p: design px}
  tool: 'move',
  smart: { v:[], h:[] },
  suspend: false,
  exporting: false,
  ready: false,
  dirty: false,
  mouse: { x:0, y:0, sx:0, sy:0 },
  fill: '#222222', stroke: '#000000', strokeW: 2, noFill:false, noStroke:true,
  font: 'Montserrat',
};
MS.prefs = Object.assign({ wheelResize:true, stickyTools:false, clampHandles:true, rulers:true, snap:true, smart:true, grid:false, gridSize:50, safe:false, safeMargin:0.5, centerGuides:true, checker:true },
  MS.store.get('prefs', {}));
// older saves kept 'stay on the drawing tool' switched on; the default is now to return to Select / Move after drawing
if(!MS.store.get('stickyDefaultV2', false)){ MS.prefs.stickyTools = false; MS.store.set('stickyDefaultV2', true); MS.store.set('prefs', MS.prefs); }
MS.savePrefs = ()=> MS.store.set('prefs', MS.prefs);
let canvas = null;
Object.defineProperty(MS, 'canvas', { get(){ return canvas; } });
MS.doc = S.doc;

/* ============================== CONTROLS (grab points) ============================== */
function setupControls(){
  fabric.Object.prototype.set({
    cornerSize: 11, touchCornerSize: 26, cornerColor:'#ffffff', cornerStrokeColor:'#5b8cff',
    cornerStyle:'circle', transparentCorners:false, borderColor:'#5b8cff', borderScaleFactor:1.5,
    borderOpacityWhenMoving:.9, padding:0, strokeUniform:false,
  });
  fabric.Object.prototype.controls.mtr.offsetY = -26;
  fabric.Object.prototype.controls.mtr.withConnection = true;
  fabric.IText.prototype.editable = false;      // text is edited in the Text panel (curve text etc. need that)
  fabric.Textbox.prototype.editable = false;
  fabric.Text.prototype.objectCaching = false;   // crisp rotated vector text
  // keep handles on screen even when the selected object is enlarged way past the visible area
  [fabric.Object.prototype.controls, fabric.Group && fabric.Group.prototype.controls].forEach(ctrls=>{
    if(!ctrls) return;
    Object.keys(ctrls).forEach(k=>{
      const c = ctrls[k]; if(c.__clamped) return; c.__clamped = true;
      const orig = c.positionHandler;
      c.positionHandler = function(dim, m, obj, ctl){
        const p = orig.call(this, dim, m, obj, ctl);
        if(!MS.prefs.clampHandles || !canvas) return p;
        const mg = 14;
        return new fabric.Point(clamp(p.x, mg, canvas.getWidth() - mg), clamp(p.y, mg, canvas.getHeight() - mg));
      };
    });
  });
}

/* ============================== CANVAS CREATE ============================== */
function createCanvas(){
  canvas = new fabric.Canvas('mainCanvas', {
    backgroundColor:null, preserveObjectStacking:true, selection:true, stopContextMenu:true, fireRightClick:false,
    renderOnAddRemove:true, enableRetinaScaling:true, uniformScaling:true, centeredScaling:true, skipOffscreen:true,
  });
  const vp = $('#vp');
  canvas.setDimensions({ width: vp.clientWidth || 800, height: vp.clientHeight || 600 });
  wireCanvasEvents();
  wirePanZoom();
  new ResizeObserver(()=>{ onResize(); }).observe(vp);
  MS.emit('canvas', canvas);
}
function onResize(){
  const vp = $('#vp'); if(!canvas) return;
  const w = vp.clientWidth, h = vp.clientHeight; if(!w || !h) return;
  if(canvas.getWidth() !== w || canvas.getHeight() !== h) canvas.setDimensions({ width:w, height:h });
  sizeOverlay();
  if(S.pendingFit){ S.pendingFit = false; zoomFit(); } else applyView(true);
}

/* ============================== DOCUMENT ============================== */
MS.newDoc = function(o){
  o = o || {};
  const d = S.doc;
  d.name = o.name || 'Untitled design';
  d.kind = o.kind || d.kind || 'logo';
  d.mode = o.mode || 'print';
  if(d.mode === 'print'){
    d.wIn = o.wIn || 12; d.hIn = o.hIn || 12;
    d.wPx = Math.round(d.wIn * WORKING_PPI); d.hPx = Math.round(d.hIn * WORKING_PPI);
  } else {
    d.wPx = Math.round(o.wPx || 1080); d.hPx = Math.round(o.hPx || 1080);
    d.wIn = d.wPx / WORKING_PPI; d.hIn = d.hPx / WORKING_PPI;
  }
  d.unit = o.unit || (d.mode === 'print' ? 'in' : 'px'); d.target = o.target || 'print';
  if(o.garment !== undefined){ d.garment = o.garment; }
  d.garmentClear = o.garmentClear !== undefined ? o.garmentClear : true;
  S.guides = []; S.links = {};
  S.suspend = true; canvas.clear(); canvas.backgroundColor = null; S.suspend = false;
  MS.resetCounters();
  history = []; historyIndex = -1; imageStore = {};
  pushHistory('New design', true);
  $('#docName').value = d.name;
  S.pendingFit = true; onResize();
  updateGarmentBg(); updateDocUi();
  MS.emit('doc'); MS.emit('layers'); MS.emit('selection');
  S.ready = true;
};
MS.resizeDoc = function(wPx, hPx){
  const d = S.doc;
  d.wPx = Math.max(8, Math.round(wPx)); d.hPx = Math.max(8, Math.round(hPx));
  d.wIn = d.wPx / WORKING_PPI; d.hIn = d.hPx / WORKING_PPI;
  const bg = canvas.getObjects().find(o=>o.__isBackground);
  if(bg){ bg.set({ scaleX: d.wPx/(bg.width||d.wPx), scaleY: d.hPx/(bg.height||d.hPx), left:0, top:0 }); bg.setCoords(); }
  updateGarmentBg(); updateDocUi(); applyView(true);
  commit('Resize canvas');
  MS.emit('doc');
};
function updateDocUi(){
  const d = S.doc;
  const lab = d.mode === 'print' ? `${+d.wIn.toFixed(3)}" × ${+d.hIn.toFixed(3)}"  (${d.wPx}×${d.hPx} working px)` : `${d.wPx} × ${d.hPx} px`;
  const el = $('#canvasSizeLabel'); if(el) el.textContent = lab;
  const sb = $('#sbDoc'); if(sb) sb.innerHTML = '<b>' + MS.esc(d.name) + '</b> · ' + (d.mode === 'print' ? `${+d.wIn.toFixed(2)}×${+d.hIn.toFixed(2)} in` : `${d.wPx}×${d.hPx} px`);
}
MS.updateDocUi = updateDocUi;

function updateGarmentBg(){
  const g = $('#artboard .garment'), ab = $('#artboard'), d = S.doc;
  g.style.background = d.garmentClear ? 'transparent' : d.garment;
  ab.classList.toggle('checker', !!MS.prefs.checker && (d.garmentClear || true));
  if(!d.garmentClear && !MS.prefs.checker) ab.style.backgroundColor = d.garment; else ab.style.backgroundColor = '';
  MS.emit('garment');
}
MS.updateGarmentBg = updateGarmentBg;
MS.garmentValue = ()=> S.doc.garmentClear ? null : S.doc.garment;
MS.setGarment = function(hex, clear){
  S.doc.garment = hex || S.doc.garment; S.doc.garmentClear = !!clear;
  updateGarmentBg();
  const p = $('#garmentColorPicker'); if(p) p.value = S.doc.garment;
  const c = $('#garmentClear'); if(c) c.checked = S.doc.garmentClear;
  MS.emit('mockup-dirty');
};

/* ============================== VIEWPORT (zoom / pan) ============================== */
const Z_MIN = 0.02, Z_MAX = 32;
function zToSlider(z){ return Math.round(Math.log(z / Z_MIN) / Math.log(Z_MAX / Z_MIN) * 1000); }
function sliderToZ(v){ return Z_MIN * Math.pow(Z_MAX / Z_MIN, v / 1000); }
function applyView(noSet){
  if(!canvas) return;
  const v = S.view, d = S.doc;
  const vpt = [v.z, 0, 0, v.z, v.x, v.y];
  canvas.setViewportTransform(vpt);
  const ab = $('#artboard');
  ab.style.left = v.x + 'px'; ab.style.top = v.y + 'px'; ab.style.width = (d.wPx * v.z) + 'px'; ab.style.height = (d.hPx * v.z) + 'px';
  const pct = Math.round(v.z * 100);
  $('#zoomLabel').textContent = pct + '%';
  const zs = $('#zoomSlider'); zs.value = zToSlider(v.z); MS.fillRange(zs);
  drawRulers(); drawOverlay();
  MS.emit('view', v);
}
function setZoom(z, cx, cy){
  const v = S.view, vp = $('#vp');
  z = clamp(z, Z_MIN, Z_MAX);
  if(cx === undefined){ cx = vp.clientWidth/2; cy = vp.clientHeight/2; }
  v.x = cx - (cx - v.x) * (z / v.z);
  v.y = cy - (cy - v.y) * (z / v.z);
  v.z = z;
  applyView();
}
function zoomFit(pad){
  const vp = $('#vp'), d = S.doc; pad = pad === undefined ? 56 : pad;
  const w = vp.clientWidth, h = vp.clientHeight; if(!w || !h) { S.pendingFit = true; return; }
  const z = clamp(Math.min((w - pad*2) / d.wPx, (h - pad*2) / d.hPx), Z_MIN, Z_MAX);
  S.view.z = z; S.view.x = (w - d.wPx * z) / 2; S.view.y = (h - d.hPx * z) / 2;
  applyView();
}
function zoomToRect(r, pad){   // r in design coords
  const vp = $('#vp'); pad = pad === undefined ? 40 : pad;
  const z = clamp(Math.min((vp.clientWidth - pad*2) / r.width, (vp.clientHeight - pad*2) / r.height), Z_MIN, Z_MAX);
  S.view.z = z; S.view.x = vp.clientWidth/2 - (r.left + r.width/2) * z; S.view.y = vp.clientHeight/2 - (r.top + r.height/2) * z;
  applyView();
}
function panBy(dx, dy){ S.view.x += dx; S.view.y += dy; applyView(); }
MS.view = { apply:applyView, setZoom, fit:zoomFit, toRect:zoomToRect, panBy,
  zoomIn: ()=> setZoom(S.view.z * 1.25), zoomOut: ()=> setZoom(S.view.z / 1.25),
  actual: ()=> setZoom(1), get zoom(){ return S.view.z; },
  toScreen: p=> ({ x: p.x * S.view.z + S.view.x, y: p.y * S.view.z + S.view.y }),
  toDesign: p=> ({ x: (p.x - S.view.x) / S.view.z, y: (p.y - S.view.y) / S.view.z }),
  selection(){ const o = canvas.getActiveObject(); if(o) zoomToRect(o.getBoundingRect(true, true)); else toast('Select something first.'); } };

function wirePanZoom(){
  const el = canvas.upperCanvasEl, vp = $('#vp');
  let pan = null;
  const startPan = e=>{ pan = { x:e.clientX, y:e.clientY, vx:S.view.x, vy:S.view.y }; vp.classList.add('panning'); };
  el.addEventListener('mousedown', e=>{
    if(e.button === 1 || S.space || S.tool === 'hand'){
      e.preventDefault(); e.stopImmediatePropagation(); startPan(e);
    }
  }, true);
  window.addEventListener('mousemove', e=>{
    if(!pan) return;
    S.view.x = pan.vx + (e.clientX - pan.x); S.view.y = pan.vy + (e.clientY - pan.y); applyView();
  });
  window.addEventListener('mouseup', ()=>{ if(pan){ pan = null; vp.classList.remove('panning'); } });
  // zoom slider + buttons
  $('#zoomSlider').addEventListener('input', e=> setZoom(sliderToZ(+e.target.value)));
  $('#zPlus').addEventListener('click', MS.view.zoomIn);
  $('#zMinus').addEventListener('click', MS.view.zoomOut);
  $('#zFit').addEventListener('click', ()=> zoomFit());
  $('#zoomLabel').addEventListener('click', MS.view.actual);
  // wheel
  canvas.on('mouse:wheel', opt=>{
    const e = opt.e;
    e.preventDefault(); e.stopPropagation();
    const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 40 && Number.isInteger(e.deltaY));
    const obj = canvas.getActiveObject();
    const canAdjust = obj && !obj.lockScalingX && !['hand', 'zoom'].includes(S.tool);
    if(!e.ctrlKey && !e.metaKey && MS.prefs.wheelResize && canAdjust){
      // as before: wheel grows / shrinks the selected item about its centre; side wheel or Shift+wheel rotates it
      const center = obj.getCenterPoint(), horiz = Math.abs(e.deltaX) > Math.abs(e.deltaY), dv = horiz ? e.deltaX : e.deltaY;
      if(horiz || e.shiftKey){
        if(obj.lockRotation) return;
        const step = (dv > 0 ? 1 : -1) * (e.altKey ? 1 : 5);
        obj.rotate((((obj.angle || 0) + step) % 360 + 360) % 360);
      } else {
        const f = clamp(Math.exp(-e.deltaY * 0.0012), 0.9, 1.1);
        if(obj.getScaledWidth() * f < 6 || obj.getScaledHeight() * f < 6) return;
        obj.scaleX *= f; obj.scaleY *= f;
      }
      obj.setPositionByOrigin(center, 'center', 'center'); obj.setCoords();
      canvas.requestRenderAll(); MS.emit('selection');
      clearTimeout(S.wheelT); S.wheelT = setTimeout(()=> commit('Resize'), 400);
      return;
    }
    const r = $('#vp').getBoundingClientRect();
    if(e.ctrlKey || e.metaKey || mouseWheel){
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : (e.deltaMode === 1 ? 0.06 : 0.0016)));
      setZoom(S.view.z * f, e.clientX - r.left, e.clientY - r.top);
    } else if(e.shiftKey){ panBy(-e.deltaY, 0); }
    else panBy(-e.deltaX, -e.deltaY);
  });
}
function isOverObject(obj, e){
  const p = canvas.getPointer(e, true);   // viewport (screen) coords relative to canvas
  const inv = fabric.util.invertTransform(canvas.viewportTransform);
  const d = fabric.util.transformPoint(new fabric.Point(p.x, p.y), inv);
  return obj.containsPoint(d, null, true, true);
}

/* ============================== OVERLAY (grid, guides, safe area, smart guides) ============================== */
let ovc = null, ovx = null;
function sizeOverlay(){
  ovc = $('#overlay'); const vp = $('#vp'), dpr = window.devicePixelRatio || 1;
  ovc.width = Math.round(vp.clientWidth * dpr); ovc.height = Math.round(vp.clientHeight * dpr);
  ovc.style.width = vp.clientWidth + 'px'; ovc.style.height = vp.clientHeight + 'px';
  ovx = ovc.getContext('2d');
}
let ovRaf = 0;
function drawOverlay(){ if(ovRaf) return; ovRaf = requestAnimationFrame(()=>{ ovRaf = 0; paintOverlay(); }); }
MS.redrawOverlay = drawOverlay;
function paintOverlay(){
  if(!ovx || S.exporting) return;
  const dpr = window.devicePixelRatio || 1, vp = $('#vp');
  ovx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = vp.clientWidth, H = vp.clientHeight;
  ovx.clearRect(0, 0, W, H);
  const v = S.view, d = S.doc, z = v.z;
  // grid
  if(MS.prefs.grid){
    const g = MS.prefs.gridSize * z;
    if(g >= 5){
      ovx.beginPath(); ovx.strokeStyle = 'rgba(128,140,170,.22)'; ovx.lineWidth = 1;
      const x0 = Math.max(0, v.x), x1 = Math.min(W, v.x + d.wPx * z), y0 = Math.max(0, v.y), y1 = Math.min(H, v.y + d.hPx * z);
      for(let x = v.x; x <= v.x + d.wPx*z + .5; x += g){ if(x < x0 || x > x1) continue; ovx.moveTo(Math.round(x) + .5, y0); ovx.lineTo(Math.round(x) + .5, y1); }
      for(let y = v.y; y <= v.y + d.hPx*z + .5; y += g){ if(y < y0 || y > y1) continue; ovx.moveTo(x0, Math.round(y) + .5); ovx.lineTo(x1, Math.round(y) + .5); }
      ovx.stroke();
    }
  }
  // safe area / bleed
  if(MS.prefs.safe){
    const m = MS.prefs.safeMargin * WORKING_PPI * z;
    ovx.save(); ovx.setLineDash([6, 5]); ovx.lineWidth = 1; ovx.strokeStyle = 'rgba(62,207,142,.9)';
    ovx.strokeRect(v.x + m + .5, v.y + m + .5, d.wPx*z - m*2, d.hPx*z - m*2);
    ovx.restore(); ovx.fillStyle = 'rgba(62,207,142,.9)'; ovx.font = '10px Segoe UI'; ovx.fillText('SAFE AREA', v.x + m + 4, v.y + m + 12);
  }
  // artboard centre guides
  if(MS.prefs.centerGuides){
    ovx.save(); ovx.setLineDash([5, 5]); ovx.lineWidth = 1; ovx.strokeStyle = 'rgba(255,61,139,.55)';
    ovx.beginPath();
    ovx.moveTo(Math.round(v.x + d.wPx*z/2) + .5, v.y); ovx.lineTo(Math.round(v.x + d.wPx*z/2) + .5, v.y + d.hPx*z);
    ovx.moveTo(v.x, Math.round(v.y + d.hPx*z/2) + .5); ovx.lineTo(v.x + d.wPx*z, Math.round(v.y + d.hPx*z/2) + .5);
    ovx.stroke(); ovx.restore();
  }
  // ruler guides
  if(S.guides.length){
    ovx.save(); ovx.lineWidth = 1; ovx.strokeStyle = 'rgba(0,214,255,.9)'; ovx.beginPath();
    S.guides.forEach(g=>{
      if(g.a === 'v'){ const x = Math.round(v.x + g.p*z) + .5; ovx.moveTo(x, 0); ovx.lineTo(x, H); }
      else { const y = Math.round(v.y + g.p*z) + .5; ovx.moveTo(0, y); ovx.lineTo(W, y); }
    });
    ovx.stroke(); ovx.restore();
  }
  // smart guides
  if(S.smart.v.length || S.smart.h.length){
    ovx.save(); ovx.lineWidth = 1.2; ovx.strokeStyle = '#ff2d9a'; ovx.beginPath();
    S.smart.v.forEach(g=>{ const x = Math.round(v.x + g.x*z) + .5; ovx.moveTo(x, v.y + g.y1*z); ovx.lineTo(x, v.y + g.y2*z); });
    S.smart.h.forEach(g=>{ const y = Math.round(v.y + g.y*z) + .5; ovx.moveTo(v.x + g.x1*z, y); ovx.lineTo(v.x + g.x2*z, y); });
    ovx.stroke(); ovx.restore();
  }
  // outline for the active object while a drawing tool has hidden the handles
  if(S.controlsHidden && canvas.getActiveObject()){
    const c = canvas.getActiveObject().getCoords(); // already in screen coords (includes viewport transform)
    ovx.save(); ovx.strokeStyle = '#5b8cff'; ovx.lineWidth = 1.2; ovx.setLineDash([4, 3]); ovx.beginPath();
    c.forEach((p, i)=> i ? ovx.lineTo(p.x, p.y) : ovx.moveTo(p.x, p.y)); ovx.closePath(); ovx.stroke(); ovx.restore();
  }
  MS.emit('overlay', ovx);
}
canvasAfterRenderHook();
function canvasAfterRenderHook(){ MS.on('canvas', c=>{ c.on('after:render', ()=>{ if(!S.exporting) drawOverlay(); }); }); }

/* ============================== RULERS & GUIDES ============================== */
function niceStep(pxPerUnit){
  const targets = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
  const frac = [0.01, 0.02, 0.05, 0.1, 0.125, 0.25, 0.5];
  const all = frac.concat(targets);
  for(const s of all){ if(s * pxPerUnit >= 62) return s; }
  return 10000;
}
function unitInfo(){
  const u = S.doc.unit;
  if(u === 'in') return { per: WORKING_PPI, label:'in' };
  if(u === 'cm') return { per: WORKING_PPI / 2.54, label:'cm' };
  if(u === 'mm') return { per: WORKING_PPI / 25.4, label:'mm' };
  return { per: 1, label:'px' };
}
let rulerRaf = 0;
function drawRulers(){ if(rulerRaf) return; rulerRaf = requestAnimationFrame(()=>{ rulerRaf = 0; paintRulers(); }); }
function paintRulers(){
  if(!MS.prefs.rulers) return;
  const rt = $('#rulerTop'), rl = $('#rulerLeft'), dpr = window.devicePixelRatio || 1;
  const wrapW = rt.clientWidth, wrapH = rl.clientHeight; if(!wrapW || !wrapH) return;
  [rt, rl].forEach(c=>{ const w = c.clientWidth, h = c.clientHeight; if(c.width !== Math.round(w*dpr) || c.height !== Math.round(h*dpr)){ c.width = Math.round(w*dpr); c.height = Math.round(h*dpr); } });
  const v = S.view, ui = unitInfo(), stepU = niceStep(ui.per * v.z), step = stepU * ui.per, sub = stepU >= 5 ? 5 : stepU >= 1 ? 4 : 5;
  const draw = (c, horiz)=>{
    const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const L = horiz ? c.clientWidth : c.clientHeight, T = horiz ? c.clientHeight : c.clientWidth;
    ctx.clearRect(0, 0, c.clientWidth, c.clientHeight);
    ctx.fillStyle = '#8b8f9a'; ctx.strokeStyle = '#4a4e59'; ctx.lineWidth = 1; ctx.font = '9px Segoe UI'; ctx.textBaseline = 'top';
    // artboard extent highlight
    const a0 = (horiz ? v.x : v.y), a1 = a0 + (horiz ? S.doc.wPx : S.doc.hPx) * v.z;
    ctx.fillStyle = 'rgba(91,140,255,.10)'; if(horiz) ctx.fillRect(a0, 0, a1 - a0, T); else ctx.fillRect(0, a0, T, a1 - a0);
    ctx.fillStyle = '#8b8f9a';
    const origin = horiz ? v.x : v.y;
    const first = Math.floor((0 - origin) / (step * v.z)) - 1, last = Math.ceil((L - origin) / (step * v.z)) + 1;
    ctx.beginPath();
    for(let i = first; i <= last; i++){
      const p = origin + i * step * v.z;
      const q = Math.round(p) + .5;
      if(horiz){ ctx.moveTo(q, T); ctx.lineTo(q, T - 9); } else { ctx.moveTo(T, q); ctx.lineTo(T - 9, q); }
      const val = +(i * stepU).toFixed(3);
      const txt = String(val);
      if(horiz) ctx.fillText(txt, p + 3, 2); else { ctx.save(); ctx.translate(2, p - 3); ctx.rotate(-Math.PI/2); ctx.textBaseline = 'top'; ctx.fillText(txt, 0, 0); ctx.restore(); }
      for(let s = 1; s < sub; s++){
        const sp = p + s * step * v.z / sub, sq = Math.round(sp) + .5, len = (sub % 2 === 0 && s === sub/2) ? 6 : 3;
        if(horiz){ ctx.moveTo(sq, T); ctx.lineTo(sq, T - len); } else { ctx.moveTo(T, sq); ctx.lineTo(T - len, sq); }
      }
    }
    ctx.stroke();
    // cursor marker
    const cur = horiz ? S.mouse.sx : S.mouse.sy;
    if(S.mouse.inside){ ctx.strokeStyle = '#ff3d8b'; ctx.beginPath(); if(horiz){ ctx.moveTo(Math.round(cur)+.5, 0); ctx.lineTo(Math.round(cur)+.5, T); } else { ctx.moveTo(0, Math.round(cur)+.5); ctx.lineTo(T, Math.round(cur)+.5); } ctx.stroke(); }
  };
  draw(rt, true); draw(rl, false);
  // unit label in corner
  const corner = $('#rulerCorner'); if(corner) corner.title = 'Rulers (' + ui.label + ') — click to toggle';
}
function wireRulers(){
  $('#rulerCorner').addEventListener('click', ()=> MS.setPref('rulers', !MS.prefs.rulers));
  // dragging out new guides
  const vp = $('#vp'); let drag = null;
  const startNew = (e, a)=>{
    e.preventDefault(); drag = { a, p: null, isNew:true };
    document.body.style.cursor = a === 'v' ? 'ew-resize' : 'ns-resize';
  };
  $('#rulerTop').addEventListener('mousedown', e=> startNew(e, 'h'));
  $('#rulerLeft').addEventListener('mousedown', e=> startNew(e, 'v'));
  window.addEventListener('mousemove', e=>{
    if(!drag) return;
    const r = vp.getBoundingClientRect();
    const dp = MS.view.toDesign({ x:e.clientX - r.left, y:e.clientY - r.top });
    let p = drag.a === 'v' ? dp.x : dp.y;
    if(MS.prefs.snap){ const t = [0, drag.a === 'v' ? S.doc.wPx/2 : S.doc.hPx/2, drag.a === 'v' ? S.doc.wPx : S.doc.hPx]; t.forEach(s=>{ if(Math.abs(s - p) * S.view.z < 6) p = s; }); }
    drag.p = p;
    if(drag.ref){ drag.ref.p = p; } else if(!drag.ref){ drag.ref = { a:drag.a, p }; S.guides.push(drag.ref); }
    MS.hint((drag.a === 'v' ? 'Vertical' : 'Horizontal') + ' guide at ' + Math.round(p) + ' px');
    drawOverlay();
  });
  window.addEventListener('mouseup', e=>{
    if(!drag) return;
    document.body.style.cursor = '';
    const r = vp.getBoundingClientRect();
    const out = e.clientX < r.left || e.clientY < r.top || e.clientX > r.right || e.clientY > r.bottom;
    if(drag.ref && out){ S.guides = S.guides.filter(g=>g!==drag.ref); }
    drag = null; drawOverlay(); MS.hint(); S.dirty = true;
  });
  // moving / removing existing guides with the Move tool: capture before fabric sees the click
  const up = canvas.upperCanvasEl;
  const hit = e=>{
    if(!S.guides.length || S.tool !== 'move') return null;
    const r = vp.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    return S.guides.find(g=> g.a === 'v' ? Math.abs(S.view.x + g.p * S.view.z - x) < 4 : Math.abs(S.view.y + g.p * S.view.z - y) < 4) || null;
  };
  up.addEventListener('mousemove', e=>{ if(!drag){ const g = hit(e); up.style.cursor = g ? (g.a === 'v' ? 'ew-resize' : 'ns-resize') : ''; } });
  up.addEventListener('mousedown', e=>{
    const g = hit(e); if(!g || e.button !== 0) return;
    e.preventDefault(); e.stopImmediatePropagation();
    drag = { a:g.a, ref:g, p:g.p };
  }, true);
  up.addEventListener('dblclick', e=>{ const g = hit(e); if(g){ S.guides = S.guides.filter(x=>x!==g); drawOverlay(); e.stopImmediatePropagation(); } }, true);
}
MS.clearGuides = ()=>{ S.guides = []; drawOverlay(); };

/* ============================== PREFS ============================== */
MS.setPref = function(k, v){
  MS.prefs[k] = v; MS.savePrefs();
  if(k === 'rulers') document.body.classList.toggle('no-rulers', !v);
  if(k === 'checker') updateGarmentBg();
  if(['rulers','grid','safe','safeMargin','centerGuides','gridSize'].includes(k)){ drawOverlay(); drawRulers(); }
  if(k === 'rulers') setTimeout(()=> onResize(), 20);
  MS.emit('prefs', k);
};

/* ============================== SNAPPING ============================== */
function snapObject(obj, e){
  if(e && e.altKey){ S.smart = { v:[], h:[] }; drawOverlay(); return; }
  const smart = MS.prefs.smart, snap = MS.prefs.snap;
  if(!smart && !snap){ S.smart = { v:[], h:[] }; return; }
  const z = S.view.z, thr = 7 / z, cw = S.doc.wPx, ch = S.doc.hPx;
  const b = obj.getBoundingRect(true, true);
  const moving = new Set(obj.type === 'activeSelection' ? obj._objects : [obj]);
  const xs = [{v:0,y1:0,y2:ch},{v:cw/2,y1:0,y2:ch},{v:cw,y1:0,y2:ch}];
  const ys = [{v:0,x1:0,x2:cw},{v:ch/2,x1:0,x2:cw},{v:ch,x1:0,x2:cw}];
  S.guides.forEach(g=>{ if(g.a === 'v') xs.push({v:g.p, y1:0, y2:ch}); else ys.push({v:g.p, x1:0, x2:cw}); });
  if(smart){
    canvas.getObjects().forEach(o=>{
      if(moving.has(o) || o.__isBackground || !o.visible) return;
      const r = o.getBoundingRect(true, true);
      [r.left, r.left + r.width/2, r.left + r.width].forEach(v=> xs.push({v, y1:r.top, y2:r.top + r.height}));
      [r.top, r.top + r.height/2, r.top + r.height].forEach(v=> ys.push({v, x1:r.left, x2:r.left + r.width}));
    });
  }
  const grid = MS.prefs.grid ? MS.prefs.gridSize : 0;
  const best = (edges, targets, gridSnap)=>{
    let res = null;
    edges.forEach(ed=> targets.forEach(t=>{ const d = t.v - ed; if(Math.abs(d) < thr && (!res || Math.abs(d) < Math.abs(res.d))) res = { d }; }));
    if(!res && gridSnap){ const ed = edges[0], g = Math.round(ed / gridSnap) * gridSnap; if(Math.abs(g - ed) < thr) res = { d:g - ed }; }
    return res;
  };
  const dxr = best([b.left, b.left + b.width/2, b.left + b.width], xs, grid), dyr = best([b.top, b.top + b.height/2, b.top + b.height], ys, grid);
  const dx = dxr ? dxr.d : 0, dy = dyr ? dyr.d : 0;
  if(dx || dy){ obj.set({ left: obj.left + dx, top: obj.top + dy }); obj.setCoords(); }
  const nb = obj.getBoundingRect(true, true); S.smart = { v:[], h:[] };
  [nb.left, nb.left + nb.width/2, nb.left + nb.width].forEach(ed=> xs.forEach(t=>{ if(Math.abs(t.v - ed) < .75) S.smart.v.push({ x:t.v, y1:Math.min(t.y1, nb.top), y2:Math.max(t.y2, nb.top + nb.height) }); }));
  [nb.top, nb.top + nb.height/2, nb.top + nb.height].forEach(ed=> ys.forEach(t=>{ if(Math.abs(t.v - ed) < .75) S.smart.h.push({ y:t.v, x1:Math.min(t.x1, nb.left), x2:Math.max(t.x2, nb.left + nb.width) }); }));
  drawOverlay();
}
MS.snapPoint = function(p, opts){   // snap a raw design point (used by shape/pen tools)
  if(!MS.prefs.snap) return p;
  const thr = 7 / S.view.z, out = { x:p.x, y:p.y }, cw = S.doc.wPx, ch = S.doc.hPx;
  const xs = [0, cw/2, cw], ys = [0, ch/2, ch];
  S.guides.forEach(g=> (g.a === 'v' ? xs : ys).push(g.p));
  if(MS.prefs.grid){ const g = MS.prefs.gridSize; xs.push(Math.round(p.x/g)*g); ys.push(Math.round(p.y/g)*g); }
  xs.forEach(x=>{ if(Math.abs(x - p.x) < thr) out.x = x; }); ys.forEach(y=>{ if(Math.abs(y - p.y) < thr) out.y = y; });
  return out;
};

/* ============================== CANVAS EVENTS ============================== */
let selRaf = 0;
function emitSelection(){ if(selRaf) return; selRaf = requestAnimationFrame(()=>{ selRaf = 0; MS.emit('selection'); updateStatusSel(); }); }
MS.emitSelection = emitSelection;
function updateStatusSel(){
  const o = canvas.getActiveObject(), el = $('#sbSel'); if(!el) return;
  if(!o){ el.textContent = ''; return; }
  const n = canvas.getActiveObjects().length, b = o.getBoundingRect(true, true);
  el.innerHTML = (n > 1 ? n + ' objects' : '<b>' + MS.esc(o.name || o.type) + '</b>') + ' · ' + Math.round(b.width) + ' × ' + Math.round(b.height) + ' px';
}
function actionLabel(t){
  const a = t && t.action || '';
  if(a === 'drag') return 'Move'; if(a === 'rotate') return 'Rotate';
  if(a.startsWith('scale')) return 'Resize'; if(a === 'skewX' || a === 'skewY') return 'Skew';
  return 'Edit';
}
function wireCanvasEvents(){
  canvas.on('selection:created', emitSelection); canvas.on('selection:updated', emitSelection); canvas.on('selection:cleared', emitSelection);
  canvas.on('object:modified', e=>{
    S.smart = { v:[], h:[] }; MS.dirtyObj(e.target); commit(actionLabel(e.transform));
  });
  canvas.on('object:added', e=>{ if(!S.suspend) MS.emit('layers'); });
  canvas.on('object:removed', ()=>{ if(!S.suspend) MS.emit('layers'); });
  canvas.on('object:moving', e=>{ snapObject(e.target, e.e); showHud(e.target); updateStatusSel(); });
  canvas.on('object:scaling', e=>{ showHud(e.target); updateStatusSel(); emitSelection(); });
  canvas.on('object:rotating', e=>{
    if(e.e && e.e.shiftKey) e.target.angle = Math.round(e.target.angle / 15) * 15;
    showHud(e.target, 'Rotate ' + Math.round(e.target.angle) + '°');
    emitSelection();
  });
  canvas.on('mouse:up', ()=>{ S.smart = { v:[], h:[] }; hideHud(); drawOverlay(); });
  canvas.on('path:created', e=>{ e.path.set({ name: MS.nextName('path') }); MS.emit('path-created', e.path); });
  canvas.on('mouse:move', e=>{
    const p = canvas.getPointer(e.e); const r = $('#vp').getBoundingClientRect();
    S.mouse = { x:p.x, y:p.y, sx:e.e.clientX - r.left, sy:e.e.clientY - r.top, inside:true };
    $('#sbCursor').textContent = 'x ' + Math.round(p.x) + '   y ' + Math.round(p.y);
    drawRulers();
  });
  $('#vp').addEventListener('mouseleave', ()=>{ S.mouse.inside = false; $('#sbCursor').textContent = 'x —   y —'; drawRulers(); });
  canvas.on('text:changed', ()=> MS.emit('layers'));
}
function showHud(obj, extra){
  const h = $('#hud'); const b = obj.getBoundingRect(true, true);
  h.style.display = 'block'; h.textContent = extra || (Math.round(b.width) + ' × ' + Math.round(b.height) + '   (' + Math.round(b.left) + ', ' + Math.round(b.top) + ')');
}
function hideHud(){ $('#hud').style.display = 'none'; }
MS.hideHud = hideHud; MS.showHud = showHud;

/* ============================== NAMING / DIRTY ============================== */
const counters = {};
MS.resetCounters = ()=> { for(const k in counters) delete counters[k]; };
MS.nextName = function(prefix){
  counters[prefix] = (counters[prefix] || 0) + 1;
  const nice = { rect:'Rectangle', ellipse:'Ellipse', triangle:'Triangle', line:'Line', arrow:'Arrow', polygon:'Polygon', star:'Star', text:'Text', path:'Path', image:'Image', group:'Group', pen:'Pen path', kaleido:'Kaleidoscope', mirror:'Mirror' }[prefix] || (prefix.charAt(0).toUpperCase() + prefix.slice(1));
  return nice + ' ' + counters[prefix];
};
MS.dirtyObj = function(o){ if(!o) return; (o.type === 'activeSelection' ? o._objects : [o]).forEach(x=>{ x.__thumb = null; }); };

/* ============================== HISTORY ============================== */
let history = [], historyIndex = -1, imageStore = {};
function fnv(str){ let h = 0x811c9dc5; for(let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = (h * 0x01000193) >>> 0; } return h.toString(36) + '_' + str.length; }
function stripImg(json){
  const walk = o=>{
    if(o && o.type === 'image' && typeof o.src === 'string' && o.src.length > 200){ const t = fnv(o.src); if(!imageStore[t]) imageStore[t] = o.src; o = { ...o, src:'@img:' + t }; }
    if(o && Array.isArray(o.objects)) o = { ...o, objects:o.objects.map(walk) };
    if(o && o.clipPath) o = { ...o, clipPath: walk(o.clipPath) };
    return o;
  };
  return { ...json, objects:(json.objects || []).map(walk) };
}
function restoreImg(json){
  const walk = o=>{
    if(o && o.type === 'image' && typeof o.src === 'string' && o.src.startsWith('@img:')) o = { ...o, src: imageStore[o.src.slice(5)] || '' };
    if(o && Array.isArray(o.objects)) o = { ...o, objects:o.objects.map(walk) };
    if(o && o.clipPath) o = { ...o, clipPath: walk(o.clipPath) };
    return o;
  };
  return { ...json, objects:(json.objects || []).map(walk) };
}
function pruneStore(){
  const used = new Set();
  history.forEach(h=>{ const m = h.json.match(/@img:([A-Za-z0-9_]+)/g); if(m) m.forEach(t=>used.add(t.slice(5))); });
  Object.keys(imageStore).forEach(k=>{ if(!used.has(k)) delete imageStore[k]; });
}
function histBytes(){ let n = 0; history.forEach(h=> n += h.json.length); Object.values(imageStore).forEach(s=> n += s.length); return n; }
function pushHistory(label, initial){
  if(S.suspend || !canvas) return;
  const json = canvas.toJSON(SERIALIZE_PROPS);
  if(!initial) history = history.slice(0, historyIndex + 1);
  history.push({ json: JSON.stringify(stripImg(json)), label: label || 'Edit', t: Date.now() });
  while(history.length > MAX_HISTORY || (histBytes() > MAX_HISTORY_BYTES && history.length > 1)) history.shift();
  pruneStore(); historyIndex = history.length - 1;
  S.dirty = true; scheduleAutosave();
  MS.emit('history');
}
function commit(label){
  if(S.suspend || !canvas) return;
  pushHistory(label);
  MS.emit('layers'); emitSelection();
}
MS.commit = commit; MS.pushHistory = pushHistory;
function loadSnapshot(idx){
  S.suspend = true;
  const json = restoreImg(JSON.parse(history[idx].json));
  canvas.loadFromJSON(json, ()=>{
    S.suspend = false; canvas.requestRenderAll();
    MS.emit('layers'); MS.emit('selection'); MS.emit('history'); updateStatusSel(); MS.emit('mockup-dirty');
  });
}
MS.undo = function(){ if(historyIndex <= 0){ toast('Nothing to undo'); return; } historyIndex--; loadSnapshot(historyIndex); };
MS.redo = function(){ if(historyIndex >= history.length - 1){ toast('Nothing to redo'); return; } historyIndex++; loadSnapshot(historyIndex); };
MS.jumpHistory = function(i){ if(i < 0 || i >= history.length) return; historyIndex = i; loadSnapshot(i); };
MS.getHistory = ()=> ({ list: history.map(h=>({ label:h.label, t:h.t })), index: historyIndex });
MS.suspendHistory = fn=> { const was = S.suspend; S.suspend = true; try{ return fn(); } finally { S.suspend = was; } };

/* ============================== AUTOSAVE ============================== */
const AUTOSAVE_DB = 'merchStudioAutosave', AUTOSAVE_STORE = 'sessions', AUTOSAVE_KEY = 'current';
let autosaveTimer = null;
const openDB = ()=> new Promise((res, rej)=>{ const r = indexedDB.open(AUTOSAVE_DB, 1); r.onupgradeneeded = ()=> r.result.createObjectStore(AUTOSAVE_STORE); r.onsuccess = ()=> res(r.result); r.onerror = ()=> rej(r.error); });
function scheduleAutosave(){ clearTimeout(autosaveTimer); autosaveTimer = setTimeout(doAutosave, 1500); }
MS.projectPayload = function(){
  return { v:2, meta: Object.assign({}, S.doc, { guides:S.guides, ws: document.body.dataset.ws }), canvasJSON: canvas.toJSON(SERIALIZE_PROPS), extra: MS.collectExtra ? MS.collectExtra() : {} };
};
async function doAutosave(){
  if(!canvas || !S.ready) return;
  try{
    const db = await openDB();
    await new Promise((res, rej)=>{ const tx = db.transaction(AUTOSAVE_STORE, 'readwrite'); tx.objectStore(AUTOSAVE_STORE).put({ payload: MS.projectPayload(), savedAt: Date.now() }, AUTOSAVE_KEY); tx.oncomplete = res; tx.onerror = ()=>rej(tx.error); });
  }catch(e){}
}
async function readAutosave(){ try{ const db = await openDB(); return await new Promise((res, rej)=>{ const q = db.transaction(AUTOSAVE_STORE).objectStore(AUTOSAVE_STORE).get(AUTOSAVE_KEY); q.onsuccess = ()=>res(q.result || null); q.onerror = ()=>rej(q.error); }); }catch(e){ return null; } }
async function clearAutosave(){ try{ const db = await openDB(); db.transaction(AUTOSAVE_STORE, 'readwrite').objectStore(AUTOSAVE_STORE).delete(AUTOSAVE_KEY); }catch(e){} }
MS.readAutosave = readAutosave; MS.clearAutosave = clearAutosave;

/* ============================== PROJECT LOAD / SAVE ============================== */
MS.loadProject = function(payload, cb){
  const m = payload.meta || {};
  const d = S.doc;
  d.name = m.name || 'Untitled design';
  d.mode = m.designMode || m.mode || 'print';
  d.wPx = m.pxW || m.wPx || Math.round((m.wIn || 12) * WORKING_PPI); d.hPx = m.pxH || m.hPx || Math.round((m.hIn || 12) * WORKING_PPI);
  d.wIn = m.wIn || d.wPx / WORKING_PPI; d.hIn = m.hIn || d.hPx / WORKING_PPI;
  d.unit = m.unit || (d.mode === 'print' ? 'in' : 'px'); d.kind = m.kind || 'logo'; d.target = m.target || 'print';
  if(m.garmentColor || m.garment){ d.garment = m.garmentColor || m.garment; }
  d.garmentClear = m.garmentClear !== undefined ? m.garmentClear : false;
  S.guides = (m.guides || []).slice();
  S.suspend = true; canvas.clear(); canvas.backgroundColor = null;
  canvas.loadFromJSON(payload.canvasJSON, ()=>{
    S.suspend = false; MS.resetCounters();
    history = []; historyIndex = -1; imageStore = {};
    pushHistory('Open project', true);
    $('#docName').value = d.name; updateGarmentBg(); updateDocUi();
    S.pendingFit = true; onResize();
    if(payload.extra && MS.restoreExtra) MS.restoreExtra(payload.extra);
    if(m.ws && MS.setWorkspace) MS.setWorkspace(m.ws, true);
    MS.emit('doc'); MS.emit('layers'); MS.emit('selection'); S.ready = true;
    cb && cb();
  });
};
MS.openProjectFile = function(file){
  const r = new FileReader();
  r.onload = ev=>{
    try{ const p = JSON.parse(ev.target.result); MS.loadProject(p, ()=> toast('Project opened.')); }
    catch(err){ toast('Could not read this project file: ' + err.message, 5000, 'err'); }
  };
  r.readAsText(file);
};
// Save as: pick the name, and (where the browser allows) the exact folder
MS.saveProjectAs = function(){
  const body = document.createElement('div'), safe = n=> (n || 'design').replace(/[\/:*?"<>|]+/g, '_').trim() || 'design';
  body.innerHTML = '<div class="r"><label>Name</label><input type="text" class="grow" id="saName" spellcheck="false"><span class="hint">.json</span></div><div class="hint">“Save” keeps it in your MERCH folder and never overwrites an older file (the next gets -2, -3…). “Choose folder…” lets you pick exactly where it goes.</div>';
  const inp = $('#saName', body); inp.value = S.doc.name || 'Untitled design';
  const finish = (name, msg)=>{ S.doc.name = name; $('#docName').value = name; MS.updateDocUi && MS.updateDocUi(); S.dirty = false; toast('Project ' + msg, 6000); };
  const buttons = [{ spacer:true }, { label:'Cancel' }];
  if(window.showSaveFilePicker) buttons.push({ label:'Choose folder…', icon:'folder', action:async ()=>{
    const name = safe(inp.value); let h;
    try{ h = await window.showSaveFilePicker({ id:'merch-projects', suggestedName:name + '.json', types:[{ description:'Imagination project', accept:{ 'application/json':['.json'] } }] }); }catch(e){ return; }
    try{ const w = await h.createWritable(); await w.write(new Blob([JSON.stringify(MS.projectPayload())], { type:'application/json' })); await w.close(); finish(h.name.replace(/\.json$/i, ''), 'saved as ' + h.name); }catch(e){ toast('Could not save there: ' + e.message, 5000, 'err'); }
  } });
  buttons.push({ label:'Save', primary:true, icon:'save', action:async ()=>{ const name = safe(inp.value); const msg = await MS.saveFile(new Blob([JSON.stringify(MS.projectPayload())], { type:'application/json' }), name + '.json'); finish(name, msg); } });
  MS.modal({ title:'Save project as', body, med:true, buttons });
  setTimeout(()=>{ inp.focus(); inp.select(); }, 50);
  inp.addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); const b = body.closest('.modal').querySelector('.modal-f .btn.primary'); b && b.click(); } });
};
MS.saveProject = function(){
  const name = (S.doc.name || 'design').replace(/[\\/:*?"<>|]+/g, '_');
  const blob = new Blob([JSON.stringify(MS.projectPayload())], { type:'application/json' });
  MS.saveFile(blob, name + '.json').then(msg=>{ S.dirty = false; toast('Project ' + msg, 6000); });
};

/* ---- file saving: local server -> remembered folder -> normal download ---- */
const FOLDER_DB = 'merchLogoFolder';
const folderDb = ()=> new Promise((res, rej)=>{ const r = indexedDB.open(FOLDER_DB, 1); r.onupgradeneeded = ()=> r.result.createObjectStore('h'); r.onsuccess = ()=>res(r.result); r.onerror = ()=>rej(r.error); });
async function loadDirHandle(){ try{ const db = await folderDb(); return await new Promise(r=>{ const q = db.transaction('h').objectStore('h').get('dir'); q.onsuccess = ()=>r(q.result || null); q.onerror = ()=>r(null); }); }catch(e){ return null; } }
async function storeDirHandle(h){ try{ const db = await folderDb(); await new Promise(r=>{ const tx = db.transaction('h', 'readwrite'); tx.objectStore('h').put(h, 'dir'); tx.oncomplete = r; tx.onerror = r; }); }catch(e){} }
// the remembered save folder (File System Access API): null when none, or when permission is not granted
MS.folderHandle = async function(ask){
  if(!window.showDirectoryPicker) return null;
  const h = await loadDirHandle(); if(!h) return null;
  try{ let p = await h.queryPermission({ mode:'readwrite' }); if(p !== 'granted' && ask) p = await h.requestPermission({ mode:'readwrite' }); return p === 'granted' ? h : null; }catch(e){ return null; }
};
MS.chooseFolder = async function(){ const h = await window.showDirectoryPicker({ id:'merch-logos', mode:'readwrite' }); await storeDirHandle(h); return h; };
// save without ever falling back to a download: local server, else the remembered folder. Returns where it went, or null.
MS.saveQuiet = async function(blob, filename, sub){
  if(/^https?:$/.test(location.protocol) && ['localhost','127.0.0.1'].includes(location.hostname)){
    try{ const r = await fetch('save?name=' + encodeURIComponent(filename) + (sub ? '&dir=' + encodeURIComponent(sub) : ''), { method:'POST', body:blob }); if(r.ok){ const j = await r.json(); return { where:'MERCH\\' + (j.dir || 'logos'), name:j.name }; } }catch(e){}
  }
  const h = await MS.folderHandle(false);
  if(h){ try{ const d = sub ? await h.getDirectoryHandle(sub, { create:true }) : h; const dot = filename.lastIndexOf('.'), base = dot > 0 ? filename.slice(0, dot) : filename, ext = dot > 0 ? filename.slice(dot) : ''; let name = filename, n = 2;
    for(;;){ try{ await d.getFileHandle(name); name = base + '-' + (n++) + ext; }catch(e){ break; } }
    const w = await (await d.getFileHandle(name, { create:true })).createWritable(); await w.write(blob); await w.close(); return { where:h.name + (sub ? '\\' + sub : ''), name }; }catch(e){} }
  return null;
};
MS.saveFile = async function(blob, filename, fileHandle, sub){
  if(fileHandle){
    try{ const w = await fileHandle.createWritable(); await w.write(blob); await w.close(); return 'saved as ' + fileHandle.name; }catch(e){}
  }
  if(/^https?:$/.test(location.protocol) && ['localhost','127.0.0.1'].includes(location.hostname)){
    try{
      const r = await fetch('save?name=' + encodeURIComponent(filename) + (sub ? '&dir=' + encodeURIComponent(sub) : ''), { method:'POST', body:blob });
      if(r.ok){ const j = await r.json(); return 'saved to MERCH\\' + (j.dir || 'logos') + '\\' + j.name; }
    }catch(e){}
  }
  if(window.showDirectoryPicker){
    try{
      let h = await loadDirHandle();
      if(h && (await h.queryPermission({mode:'readwrite'})) !== 'granted' && (await h.requestPermission({mode:'readwrite'})) !== 'granted') h = null;
      if(!h){ toast('Pick the folder to save into (only asked once).', 6000); h = await window.showDirectoryPicker({ id:'merch-logos', mode:'readwrite' }); await storeDirHandle(h); }
      const dot = filename.lastIndexOf('.'), base = dot > 0 ? filename.slice(0, dot) : filename, ext = dot > 0 ? filename.slice(dot) : '';
      const dh = sub ? await h.getDirectoryHandle(sub, { create:true }) : h;
      let name = filename, n = 2;
      for(;;){ try{ await dh.getFileHandle(name); name = base + '-' + (n++) + ext; }catch(e){ break; } }
      const w = await (await dh.getFileHandle(name, { create:true })).createWritable();
      await w.write(blob); await w.close();
      return 'saved to "' + h.name + '" as ' + name;
    }catch(e){}
  }
  MS.download(blob, filename);
  return 'downloaded to your Downloads folder';
};

/* ============================== RENDER ARTBOARD (export / previews) ============================== */
MS.renderArtboard = function(o){
  o = o || {};
  const mult = o.multiplier || 1, d = S.doc;
  const keepVpt = canvas.viewportTransform.slice(), keepBg = canvas.backgroundColor, keepSkip = canvas.skipOffscreen;
  const act = canvas.getActiveObject();
  S.exporting = true;
  let el;
  try{
    canvas.skipOffscreen = false;
    canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    canvas.backgroundColor = o.background || null;
    const crop = o.region || { left:0, top:0, width:d.wPx, height:d.hPx };
    el = canvas.toCanvasElement(mult, crop);
  } finally {
    canvas.viewportTransform = keepVpt; canvas.backgroundColor = keepBg; canvas.skipOffscreen = keepSkip;
    canvas.calcViewportBoundaries(); S.exporting = false; canvas.requestRenderAll();
  }
  return el;
};
MS.renderDataURL = function(o){ const c = MS.renderArtboard(o); return c.toDataURL(o && o.format || 'image/png', o && o.quality); };

/* ============================== LAYER / OBJECT OPERATIONS ============================== */
const O = MS.ops = {};
O.active = ()=> canvas.getActiveObjects();
O.each = fn=> { const a = canvas.getActiveObjects(); a.forEach(fn); return a.length; };
O.select = function(objs){
  canvas.discardActiveObject();
  objs = (objs || []).filter(Boolean);
  if(objs.length === 1) canvas.setActiveObject(objs[0]);
  else if(objs.length > 1) canvas.setActiveObject(new fabric.ActiveSelection(objs, { canvas }));
  canvas.requestRenderAll(); emitSelection();
};
O.selectAll = function(){
  const all = canvas.getObjects().filter(o=> !o.__isBackground && o.selectable !== false && o.visible !== false);
  if(!all.length) return; O.select(all);
};
O.deselect = ()=> { canvas.discardActiveObject(); canvas.requestRenderAll(); emitSelection(); };
O.del = function(){
  const objs = canvas.getActiveObjects(); if(!objs.length) return;
  canvas.discardActiveObject(); objs.forEach(o=> canvas.remove(o));
  canvas.requestRenderAll(); commit('Delete');
};
O.group = function(){
  const a = canvas.getActiveObject();
  if(!a || a.type !== 'activeSelection'){ toast('Select 2 or more objects to group.'); return; }
  const g = a.toGroup(); g.name = MS.nextName('group'); canvas.requestRenderAll(); commit('Group');
};
O.ungroup = function(){
  const a = canvas.getActiveObject();
  if(!a || a.type !== 'group' || a._isCurvedText){ toast('Select a group to ungroup.'); return; }
  a.toActiveSelection(); canvas.requestRenderAll(); commit('Ungroup');
};
O.order = function(where){
  const sel = canvas.getActiveObjects(); if(!sel.length) return;
  const bgIdx = canvas.getObjects().findIndex(o=>o.__isBackground);
  const fwd = where === 'front' || where === 'fwd';
  (fwd ? sel.slice().reverse() : sel).forEach(o=>{
    if(where === 'front') canvas.bringToFront(o); else if(where === 'back') canvas.sendToBack(o);
    else if(where === 'fwd') canvas.bringForward(o); else canvas.sendBackwards(o);
  });
  const bg = canvas.getObjects().find(o=>o.__isBackground); if(bg) canvas.sendToBack(bg);
  canvas.requestRenderAll(); commit('Arrange');
};
let clip = null, pasteN = 0;
O.copy = function(){
  const a = canvas.getActiveObject();
  if(!a || a.__isBackground){ toast('Select something to copy.'); return; }
  a.clone(c=>{ clip = c; pasteN = 0; toast('Copied.', 1200); }, SERIALIZE_PROPS);
};
function placeClone(cloned, dx, dy, suffix){
  canvas.discardActiveObject();
  cloned.set({ left:(cloned.left || 0) + dx, top:(cloned.top || 0) + dy, evented:true });
  if(cloned.type === 'activeSelection'){ cloned.canvas = canvas; cloned.forEachObject(o=>{ o.name = (o.name || 'Object') + suffix; canvas.add(o); }); cloned.setCoords(); }
  else { cloned.name = (cloned.name || 'Object') + suffix; canvas.add(cloned); }
  canvas.setActiveObject(cloned); canvas.requestRenderAll();
}
O.paste = function(inPlace){
  if(!clip) return; pasteN++;
  clip.clone(c=>{ const off = inPlace ? 0 : 24 * pasteN; placeClone(c, off, off, ' copy'); commit('Paste'); }, SERIALIZE_PROPS);
};
O.cut = function(){ O.copy(); O.del(); };
O.duplicate = function(){
  const a = canvas.getActiveObject(); if(!a || a.__isBackground) return;
  a.clone(c=>{ placeClone(c, 24, 24, ' copy'); commit('Duplicate'); }, SERIALIZE_PROPS);
};
O.flip = function(axis){
  const objs = canvas.getActiveObjects(); if(!objs.length) return;
  const a = canvas.getActiveObject();
  if(a.type === 'activeSelection'){
    const c = a.getCenterPoint(); a.set(axis === 'h' ? 'flipX' : 'flipY', !(axis === 'h' ? a.flipX : a.flipY)); a.setPositionByOrigin(c, 'center', 'center');
  } else a.set(axis === 'h' ? 'flipX' : 'flipY', !(axis === 'h' ? a.flipX : a.flipY));
  a.setCoords(); canvas.requestRenderAll(); commit(axis === 'h' ? 'Flip horizontal' : 'Flip vertical');
};
O.rotate90 = function(){
  const a = canvas.getActiveObject(); if(!a) return;
  const c = a.getCenterPoint(); a.rotate(((a.angle || 0) + 90) % 360); a.setPositionByOrigin(c, 'center', 'center'); a.setCoords();
  canvas.requestRenderAll(); commit('Rotate 90°');
};
O.align = function(mode){
  const active = canvas.getActiveObject(); if(!active) return;
  const multi = active.type === 'activeSelection';
  const objs = multi ? active.getObjects().slice() : [active];
  if((mode === 'distH' || mode === 'distV') && objs.length < 3){ toast('Select 3 or more objects to distribute.'); return; }
  if(multi) canvas.discardActiveObject();
  const rects = objs.map(o=>({ o, b:o.getBoundingRect(true, true) }));
  let ref = { left:0, top:0, right:S.doc.wPx, bottom:S.doc.hPx };
  if(multi) ref = { left:Math.min(...rects.map(r=>r.b.left)), top:Math.min(...rects.map(r=>r.b.top)), right:Math.max(...rects.map(r=>r.b.left + r.b.width)), bottom:Math.max(...rects.map(r=>r.b.top + r.b.height)) };
  const move = (r, dx, dy)=>{ r.o.set({ left:r.o.left + dx, top:r.o.top + dy }); r.o.setCoords(); };
  if(mode === 'distH' || mode === 'distV'){
    const h = mode === 'distH', pos = r=> h ? r.b.left : r.b.top, size = r=> h ? r.b.width : r.b.height;
    const sorted = rects.slice().sort((a, b)=> pos(a) - pos(b));
    const first = pos(sorted[0]), last = pos(sorted[sorted.length-1]) + size(sorted[sorted.length-1]);
    const gap = (last - first - sorted.reduce((s, r)=> s + size(r), 0)) / (sorted.length - 1);
    let cur = first; sorted.forEach(r=>{ const d = cur - pos(r); h ? move(r, d, 0) : move(r, 0, d); cur += size(r) + gap; });
  } else {
    rects.forEach(r=>{
      const b = r.b; let dx = 0, dy = 0;
      if(mode === 'left') dx = ref.left - b.left; if(mode === 'right') dx = ref.right - (b.left + b.width);
      if(mode === 'hcenter') dx = (ref.left + ref.right)/2 - (b.left + b.width/2);
      if(mode === 'top') dy = ref.top - b.top; if(mode === 'bottom') dy = ref.bottom - (b.top + b.height);
      if(mode === 'vcenter') dy = (ref.top + ref.bottom)/2 - (b.top + b.height/2);
      move(r, dx, dy);
    });
  }
  if(multi) canvas.setActiveObject(new fabric.ActiveSelection(objs, { canvas }));
  canvas.requestRenderAll(); commit('Align');
};
O.nudge = function(dx, dy){
  const a = canvas.getActiveObject(); if(!a || a.lockMovementX) return;
  a.set({ left:a.left + dx, top:a.top + dy }); a.setCoords(); canvas.requestRenderAll(); emitSelection();
  clearTimeout(S.nudgeT); S.nudgeT = setTimeout(()=> commit('Nudge'), 350);
};
O.toggleLock = function(obj, force){
  const lock = force !== undefined ? force : !obj.lockMovementX;
  obj.set({ lockMovementX:lock, lockMovementY:lock, lockScalingX:lock, lockScalingY:lock, lockRotation:lock, selectable:!lock, evented:!lock, __lockedLayer:lock });
  if(lock && canvas.getActiveObject() === obj) canvas.discardActiveObject();
  canvas.requestRenderAll();
};
O.flatten = function(){
  const objs = canvas.getActiveObjects(); if(!objs.length) return;
  const a = canvas.getActiveObject();
  const b = a.getBoundingRect(true, true);
  // render only the selection: hide others
  const hidden = canvas.getObjects().filter(o=> !objs.includes(o) && o.visible).map(o=>{ o.visible = false; return o; });
  const el = MS.renderArtboard({ multiplier: Math.min(4, 3000 / Math.max(b.width, b.height)), region:{ left:b.left, top:b.top, width:b.width, height:b.height } });
  hidden.forEach(o=> o.visible = true);
  const idx = Math.max(...objs.map(o=> canvas.getObjects().indexOf(o)));
  canvas.discardActiveObject(); objs.forEach(o=> canvas.remove(o));
  fabric.Image.fromURL(el.toDataURL('image/png'), img=>{
    img.set({ left:b.left, top:b.top, scaleX:b.width / img.width, scaleY:b.height / img.height, name: MS.nextName('image') });
    canvas.add(img); canvas.moveTo(img, Math.min(idx, canvas.getObjects().length - 1)); canvas.setActiveObject(img); commit('Flatten');
  });
};

/* ============================== COLOURS ============================== */
MS.hexToRgb = function(hex){ hex = hex.replace('#', ''); if(hex.length === 3) hex = hex.split('').map(c=>c+c).join(''); const n = parseInt(hex, 16); return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 }; };
MS.rgbToHex = (r, g, b)=> '#' + [r, g, b].map(v=> clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
MS.colorHex = function(c){ try{ return '#' + new fabric.Color(c).toHex().toLowerCase(); }catch(e){ return null; } };
MS.recentColors = MS.store.get('recentColors', []);
MS.noteColor = function(hex){
  if(!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return;
  MS.recentColors = [hex.toLowerCase(), ...MS.recentColors.filter(c=>c !== hex.toLowerCase())].slice(0, 24);
  MS.store.set('recentColors', MS.recentColors); MS.emit('swatches');
};

/* ============================== BOOT ============================== */
MS.initCore = function(){
  setupControls();
  createCanvas();
  sizeOverlay();
  wireRulers();
  document.body.classList.toggle('no-rulers', !MS.prefs.rulers);
  window.addEventListener('resize', ()=> onResize());
  MS.on('resize', ()=> setTimeout(onResize, 0));
  // drag & drop files onto the work area
  const vp = $('#vp'), veil = $('#dropveil'); let dragN = 0;
  vp.addEventListener('dragenter', e=>{ if(e.dataTransfer && [...e.dataTransfer.types].includes('Files')){ dragN++; veil.classList.add('on'); } e.preventDefault(); });
  vp.addEventListener('dragover', e=> e.preventDefault());
  vp.addEventListener('dragleave', ()=>{ dragN = Math.max(0, dragN - 1); if(!dragN) veil.classList.remove('on'); });
  vp.addEventListener('drop', e=>{
    e.preventDefault(); dragN = 0; veil.classList.remove('on');
    if(e.dataTransfer.files && e.dataTransfer.files.length) MS.importFiles(e.dataTransfer.files, e);
  });
  window.addEventListener('beforeunload', e=>{ if(S.dirty && S.ready && (canvas.getObjects().length)){ doAutosave(); } });
  window.addEventListener('dragover', e=> e.preventDefault()); window.addEventListener('drop', e=> e.preventDefault());
};

MS.zoomFit = zoomFit;
})();
