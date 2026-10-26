/* Merch Studio - dock panels: Design (properties), Fill/Background, Canvas, Layers, History, Swatches; text helpers. */
(function(){
'use strict';
const MS = window.MS, S = MS.S;
const { $, $$, clamp, toast } = MS;
const cv = ()=> MS.canvas;
const isText = o=> MS.isTextObj(o);
const kids = o=> (o && o._objects) ? o._objects : [];

/* ============================ TEXT API ============================ */
const TX = MS.text = {};
function textTargets(){ return cv().getActiveObjects().filter(isText); }
function styleOf(o){ return o._isCurvedText ? (o._curveStyle || {}) : o; }
TX.set = function(props, label, noCommit){
  const c = cv(), act = c.getActiveObject(); if(!act) return;
  textTargets().forEach(o=>{
    if(o._isCurvedText){
      o._curveStyle = Object.assign({}, o._curveStyle, props);
      kids(o).forEach(k=> k.set(props));
      TX.rebuildCurve(o);
    } else { o.set(props); o.initDimensions && o.initDimensions(); o.setCoords(); }
    MS.dirtyObj(o);
  });
  c.requestRenderAll();
  if(!noCommit){ clearTimeout(TX._t); TX._t = setTimeout(()=> MS.commit(label || 'Text'), 350); }
  MS.emitSelection();
};
TX.setSize = v=> TX.set({ fontSize: clamp(+v || 12, 4, 3000) }, 'Font size');
TX.setFill = v=> { MS.noteColor(v); TX.set({ fill:v }, 'Text colour'); };
TX.setFont = function(name){
  S.font = name;
  const sel = textTargets();
  const apply = ()=>{ if(sel.length) TX.set({ fontFamily:name }, 'Font: ' + name); MS.emit('font', name); };
  // make sure the face is loaded before canvas measures glyphs
  if(document.fonts && document.fonts.load){ Promise.all([document.fonts.load(`48px "${name}"`), document.fonts.load(`bold 48px "${name}"`)]).catch(()=>{}).then(()=>{ apply(); cv().requestRenderAll(); }); }
  else apply();
  MS.noteFont && MS.noteFont(name);
};
TX.text = function(value){
  const o = cv().getActiveObject(); if(!o || !isText(o)) return;
  if(o._isCurvedText){ o._curveSourceText = value; TX.rebuildCurve(o); }
  else { o.set('text', value || ''); o.initDimensions(); o.setCoords(); }
  cv().requestRenderAll(); MS.dirtyObj(o); MS.emit('layers');
  clearTimeout(TX._tt); TX._tt = setTimeout(()=> MS.commit('Edit text'), 500);
};
const LAYOUT0 = { curve:0, step:0, wave:0, waveN:1.5, bulge:0, tilt:0, spin:0, skewX:0, skewY:0 };
const layoutOn = L=> ['curve','step','wave','bulge','tilt','spin','skewX','skewY'].some(k=> +L[k]);
TX.layoutOf = o=> Object.assign({}, LAYOUT0, o && o._layout ? o._layout : { curve:(o && o._curveAmount) || 0 });
TX.layout = function(part, replace){
  const c = cv(), obj = c.getActiveObject(); if(!obj || !isText(obj)) return;
  const L = Object.assign({}, replace ? LAYOUT0 : TX.layoutOf(obj), part);
  if(!layoutOn(L) && !obj._isCurvedText) return;
  const base = obj._isCurvedText ? obj._curveSourceText : (obj.text || '');
  const style = obj._isCurvedText ? obj._curveStyle : { fontFamily:obj.fontFamily, fontSize:obj.fontSize, fill:obj.fill, fontWeight:obj.fontWeight, fontStyle:obj.fontStyle, charSpacing:obj.charSpacing || 0, lineHeight:obj.lineHeight || 1.16, stroke:obj.stroke, strokeWidth:obj.strokeWidth, shadow:obj.shadow, paintFirst:obj.paintFirst, underline:obj.underline, linethrough:obj.linethrough };
  const center = obj.getCenterPoint(), name = obj.name, angle = obj.angle, op = obj.opacity, idx = c.getObjects().indexOf(obj), fade = fadeOf(obj);
  if(fade && !obj._isCurvedText) style.fill = fade.stops[0].color;
  c.remove(obj);
  let n;
  if(!layoutOn(L)){ n = new fabric.IText(base, Object.assign({ left:center.x, top:center.y, originX:'center', originY:'center', angle, textAlign:'center', strokeUniform:true }, style)); straightFade(n, fade); }
  else { n = buildCurved(base, style, L); n.set({ left:center.x, top:center.y, originX:'center', originY:'center', angle }); n.setCoords(); refade(n, fade); }
  n.name = name || MS.nextName('text'); n.set('opacity', op); n.shadow = obj.shadow; n.__fx = obj.__fx; if(obj.__fx && obj.__fx.distress){ n.objectCaching = true; n.noScaleCache = false; }
  c.add(n); c.moveTo(n, idx); c.setActiveObject(n); c.requestRenderAll();
  clearTimeout(TX._lt); TX._lt = setTimeout(()=> MS.commit('Text layout'), 350); MS.emitSelection();
};
TX.curve = amount=> TX.layout({ curve:amount });
TX.layoutPresets = {
  'Arch up':{ curve:40 }, 'Arch down':{ curve:-40 }, 'Circle':{ curve:100 }, 'Wave':{ wave:25 }, 'Flag':{ wave:18, waveN:1, skewY:0 }, 'Stairs up':{ step:-16 }, 'Stairs down':{ step:16 },
  'Bulge':{ bulge:80 }, 'Pinch':{ bulge:-55 }, 'Bounce':{ tilt:-8, step:0, wave:14, waveN:3 }, 'Fan':{ curve:45, spin:7 }, 'Slant':{ skewX:-20 }, 'Tumble':{ spin:10, wave:10, waveN:2 }, 'Straight':{},
};
// One gradient across a whole warped word: every letter gets the slice of the gradient that lies under it.
// Without A/B the gradient runs across the word's own box at `angle`; with them it runs between two canvas points.
TX.fadeGroup = function(g, stops, angle, A, B){
  const M = g.calcTransformMatrix();
  if(!A){
    const rad = angle * Math.PI / 180, hw = (g.width || 1) / 2, hh = (g.height || 1) / 2;
    A = fabric.util.transformPoint(new fabric.Point(-Math.cos(rad) * hw, -Math.sin(rad) * hh), M);
    B = fabric.util.transformPoint(new fabric.Point(Math.cos(rad) * hw, Math.sin(rad) * hh), M);
  }
  kids(g).forEach(k=>{
    const inv = fabric.util.invertTransform(fabric.util.multiplyTransformMatrices(M, k.calcOwnMatrix())), a = fabric.util.transformPoint(A, inv), b = fabric.util.transformPoint(B, inv), w = k.width || 0, h = k.height || 0;
    k.set('fill', new fabric.Gradient({ type:'linear', coords:{ x1:a.x + w/2, y1:a.y + h/2, x2:b.x + w/2, y2:b.y + h/2 }, colorStops:stops }));
    k.dirty = true;
  });
  g._curveFade = { stops:JSON.parse(JSON.stringify(stops)), angle:angle, baseFill:g._curveStyle ? g._curveStyle.fill : null };
  g.dirty = true;
};
// carry a gradient across a rebuild (curve / layout / text edits make a fresh group)
function refade(n, f){ if(f && f.stops && f.stops.length) TX.fadeGroup(n, f.stops, f.angle || 0); }
function fadeOf(o){
  if(o._isCurvedText) return (o._curveFade && o._curveStyle && o._curveFade.baseFill === o._curveStyle.fill) ? o._curveFade : null;
  return (o.fill && o.fill.colorStops) ? { stops:o.fill.colorStops.map(c=>({ offset:c.offset, color:c.color })), angle:(o.__fillMeta && o.__fillMeta.angle) || 0 } : null;
}
function straightFade(n, f){ if(!f) return; const w = n.width || 1, h = n.height || 1, rad = f.angle * Math.PI / 180; n.set('fill', new fabric.Gradient({ type:'linear', coords:{ x1:w/2 - Math.cos(rad)*w/2, y1:h/2 - Math.sin(rad)*h/2, x2:w/2 + Math.cos(rad)*w/2, y2:h/2 + Math.sin(rad)*h/2 }, colorStops:f.stops })); }
function buildCurved(baseText, style, layout){
  const L = Object.assign({}, LAYOUT0, typeof layout === 'number' ? { curve:layout } : layout);
  const fs = style.fontSize, lines = String(baseText).split('\n'), lh = fs * (style.lineHeight || 1.16);
  const mctx = document.createElement('canvas').getContext('2d');
  mctx.font = (style.fontStyle || 'normal') + ' ' + (style.fontWeight || 'normal') + ' ' + fs + 'px "' + style.fontFamily + '"';
  const extra = (style.charSpacing || 0) / 1000 * fs;
  const radius0 = L.curve ? Math.max(60, 24000 / Math.abs(L.curve) * (fs / 48)) : 0, dir = L.curve > 0 ? 1 : -1;
  const items = [];
  // every line gets the same layout; later lines sit concentric under the first (inside an arch up, outside an arch down)
  lines.forEach((line, li)=>{
    const chars = line.split(''), n = chars.length; if(!n) return;
    const t = i=> n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
    const sc = chars.map((_, i)=> Math.max(.12, 1 + (L.bulge / 100) * (1 - t(i) * t(i))));
    const widths = chars.map((ch, i)=> Math.max(mctx.measureText(ch).width + extra, fs * .15) * sc[i]);
    const total = widths.reduce((a, w)=> a + w, 0), pos = [];
    if(L.curve){
      const radius = Math.max(30, radius0 - dir * li * lh);
      let cur = -total / radius / 2;
      widths.forEach(w=>{ const aw = w / radius; cur += aw / 2; const a = cur * dir; pos.push({ x:radius * Math.sin(a), y:-radius * Math.cos(a) * dir + radius0 * dir, ang:a * 180 / Math.PI }); cur += aw / 2; });
    } else {
      let x = -total / 2; widths.forEach(w=>{ pos.push({ x:x + w / 2, y:li * lh, ang:0 }); x += w; });
    }
    const mid = (n - 1) / 2, shift = -(lines.length - 1) / 2 * lh;
    chars.forEach((ch, i)=>{
      const o = new fabric.Text(ch, Object.assign({}, style, { originX:'center', originY:'center', strokeUniform:true, scaleX:sc[i], scaleY:sc[i], skewX:L.skewX, skewY:L.skewY }));
      const y = pos[i].y + shift + (L.step / 100 * fs) * (i - mid) + (L.wave / 100 * fs) * Math.sin(2 * Math.PI * L.waveN * (n > 1 ? i / (n - 1) : 0));
      o.set({ left:pos[i].x, top:y, angle:pos[i].ang + L.tilt + L.spin * (i - mid) });
      items.push(o);
    });
  });
  if(!items.length) items.push(new fabric.Text(' ', Object.assign({}, style, { originX:'center', originY:'center' })));
  const g = new fabric.Group(items, { originX:'center', originY:'center', subTargetCheck:false });
  g._isCurvedText = true; g._curveSourceText = baseText; g._curveStyle = style; g._curveAmount = L.curve; g._layout = L;
  return g;
}
TX.rebuildCurve = function(o){
  const c = cv(), n = buildCurved(o._curveSourceText, o._curveStyle, o._layout || o._curveAmount);
  const center = o.getCenterPoint(); n.set({ left:center.x, top:center.y, originX:'center', originY:'center', angle:o.angle, opacity:o.opacity, shadow:o.shadow, name:o.name });
  n.shadow = o.shadow; n.__fx = o.__fx; if(o.__fx && o.__fx.distress){ n.objectCaching = true; n.noScaleCache = false; }
  n.setCoords(); refade(n, fadeOf(o));
  const idx = c.getObjects().indexOf(o); c.remove(o); c.add(n); c.moveTo(n, idx); c.setActiveObject(n);
};
TX.convertCase = function(mode){
  const o = cv().getActiveObject(); if(!o || !isText(o)) return;
  const cur = o._isCurvedText ? o._curveSourceText : o.text;
  const nv = mode === 'upper' ? cur.toUpperCase() : mode === 'lower' ? cur.toLowerCase() : cur.toLowerCase().replace(/\b\w/g, m=> m.toUpperCase());
  TX.text(nv); $('#propTextContent').value = nv; MS.commit('Change case');
};

/* ---- Graffiti one-click style (20 presets cycle) ---- */
const GRAFFITI = [
  { f:'Bungee', fill:'#ff2d55', st:'#000000', sw:8, sh:{color:'#000000',blur:0,offsetX:6,offsetY:6} },
  { f:'Bungee Shade', fill:'#ffffff', st:'#0066ff', sw:6, sh:{color:'#00000099',blur:10,offsetX:4,offsetY:4} },
  { f:'Rubik Wet Paint', fill:'#39ff14', st:'#000000', sw:5, sh:{color:'#000000',blur:8,offsetX:3,offsetY:3} },
  { f:'Titan One', fill:'#ffcc00', st:'#cc0000', sw:7, sh:{color:'#000000',blur:0,offsetX:5,offsetY:5} },
  { f:'Rubik Distressed', fill:'#ffffff', st:'#000000', sw:4, sh:{color:'#00000099',blur:6,offsetX:3,offsetY:3} },
  { f:'Bungee Inline', fill:'#00e5ff', st:'#003049', sw:3, sh:{color:'#000000',blur:0,offsetX:4,offsetY:4} },
  { f:'Luckiest Guy', fill:'#ff6b00', st:'#5c1a00', sw:6, sh:{color:'#ffffff55',blur:0,offsetX:-3,offsetY:-3} },
  { f:'Monoton', fill:'#ff00e5', st:'#00fff2', sw:2, sh:{color:'#ff00e588',blur:16,offsetX:0,offsetY:0} },
  { f:'Rubik Burned', fill:'#ff9900', st:'#1a0800', sw:4, sh:{color:'#000000',blur:6,offsetX:3,offsetY:3} },
  { f:'Rubik Glitch', fill:'#ffffff', st:'#ff003c', sw:3, sh:{color:'#00fff2aa',blur:4,offsetX:-4,offsetY:0} },
  { f:'Rubik Beastly', fill:'#39ff14', st:'#062b00', sw:5, sh:{color:'#000000',blur:0,offsetX:5,offsetY:5} },
  { f:'Rubik Puddles', fill:'#00b4ff', st:'#001a33', sw:4, sh:{color:'#00b4ff66',blur:12,offsetX:2,offsetY:6} },
  { f:'Rubik Moonrocks', fill:'#ffe066', st:'#332600', sw:4, sh:{color:'#000000',blur:0,offsetX:4,offsetY:4} },
  { f:'Rubik Marker Hatch', fill:'#111111', st:'#ff2d55', sw:3, sh:{color:'#00000066',blur:5,offsetX:3,offsetY:3} },
  { f:'Rubik Storm', fill:'#e8e8e8', st:'#000000', sw:5, sh:{color:'#000000',blur:8,offsetX:6,offsetY:6} },
  { f:'Rubik Microbe', fill:'#7cff00', st:'#0a2600', sw:3, sh:{color:'#000000',blur:4,offsetX:2,offsetY:2} },
  { f:'Rubik Dirt', fill:'#c9a86a', st:'#2b1d0e', sw:4, sh:{color:'#000000',blur:6,offsetX:3,offsetY:3} },
  { f:'Rubik 80s Fade', fill:'#ff2d95', st:'#2d0033', sw:3, sh:{color:'#00e5ff99',blur:10,offsetX:-3,offsetY:3} },
  { f:'Nabla', fill:'#ff5a00', st:'#3d1400', sw:2, sh:{color:'#000000',blur:10,offsetX:4,offsetY:8} },
  { f:'Boogaloo', fill:'#ffffff', st:'#111111', sw:6, sh:{color:'#ff2d5599',blur:0,offsetX:6,offsetY:0} },
];
let gIdx = 0;
TX.graffiti = function(){
  const o = cv().getActiveObject();
  if(!o || !isText(o) || o._isCurvedText){ toast('Select a (straight) text object first.'); return; }
  const p = GRAFFITI[gIdx++ % GRAFFITI.length];
  o.set({ fontFamily:p.f, fill:p.fill, stroke:p.st, strokeWidth:p.sw, fontWeight:'normal', paintFirst:'stroke', shadow:new fabric.Shadow(p.sh) });
  o.initDimensions(); o.setCoords(); S.font = p.f; MS.dirtyObj(o); cv().requestRenderAll(); MS.commit('Graffiti style'); MS.emitSelection();
  toast('Graffiti style: ' + p.f + ' — click again to cycle');
};

/* ============================ PROPERTIES SYNC ============================ */
let syncing = false;
function setVal(id, v){ const e = $('#' + id); if(e && document.activeElement !== e) e.value = v; return e; }
function describeColor(v){
  if(!v) return { hex:null, css:null, kind:'none' };
  if(typeof v === 'string') return { hex:MS.colorHex(v), css:v, kind:'solid' };
  if(v.colorStops && v.colorStops.length){
    const stops = v.colorStops.map(s=>s.color), cc = v.coords || {};
    let ang = 90; if(cc.x1 !== undefined && cc.x2 !== undefined) ang = Math.round(Math.atan2((cc.y2||0) - (cc.y1||0), (cc.x2||0) - (cc.x1||0)) * 180 / Math.PI) + 90;
    return { hex:MS.colorHex(stops[0]), css:`linear-gradient(${ang}deg, ${stops.join(',')})`, kind:'fade' };
  }
  if(v.source){ let url = null; try{ url = v.source.toDataURL ? v.source.toDataURL() : v.source.src; }catch(e){} return { hex:null, css:url ? `url(${url}) center/cover` : '#888', kind:'pattern' }; }
  return { hex:null, css:null, kind:'none' };
}
function chipPreview(sel, d){
  const el = $(sel); if(!el) return;
  if(d.kind === 'fade' || d.kind === 'pattern'){ el.style.display = 'inline-block'; el.style.background = d.css; el.textContent = d.kind === 'fade' ? 'Fade' : 'Pattern'; el.style.color = '#fff'; el.style.textShadow = '0 0 3px #000'; }
  else el.style.display = 'none';
}
function syncProps(){
  const c = cv(); if(!c) return;
  const obj = c.getActiveObject();
  $('#propsEmpty').classList.toggle('hidden', !!obj); $('#propsBody').classList.toggle('hidden', !obj);
  if(!obj) return;
  syncing = true;
  const b = obj.getBoundingRect(true, true), multi = obj.type === 'activeSelection';
  setVal('propX', Math.round(b.left)); setVal('propY', Math.round(b.top)); setVal('propW', Math.round(b.width)); setVal('propH', Math.round(b.height));
  setVal('propAngleNum', Math.round(((obj.angle || 0) % 360 + 360) % 360));
  const op = Math.round((obj.opacity ?? 1) * 100); setVal('propOpacity', op); setVal('propOpacityNum', op); MS.fillRange($('#propOpacity'));
  setVal('propBlend', obj.globalCompositeOperation || 'source-over');
  const img = obj.type === 'image', txt = isText(obj) && !multi;
  $('#propFillGroup').style.display = img ? 'none' : ''; $('#propTextGroup').style.display = txt ? '' : 'none'; $('#propImageGroup').style.display = img ? '' : 'none';
  $('#rowCorner').style.display = (obj.type === 'rect') ? '' : 'none';
  if(!img){
    let src = obj; if(kids(obj).length){ const k = kids(obj).find(o=> o.fill !== undefined && o.type !== 'image'); if(k) src = k; }
    const fd = describeColor(src.fill), sd = describeColor(src.stroke);
    $('#propFillNone').checked = !src.fill; setVal('propFill', fd.hex || '#222222');
    $('#propStrokeNone').checked = !src.stroke; setVal('propStroke', sd.hex || '#000000'); setVal('propStrokeWidth', src.strokeWidth || 0);
    chipPreview('#propFillPreview', fd); chipPreview('#propStrokePreview', sd);
    const dash = src.strokeDashArray; $$('#strokeStyleSeg button').forEach(bt=> bt.classList.toggle('active', bt.dataset.v === (!dash ? 'solid' : (dash[0] <= 2 ? 'dot' : 'dash'))));
    $$('#strokeJoinSeg button').forEach(bt=> bt.classList.toggle('active', bt.dataset.v === (src.strokeLineJoin || 'miter')));
    if(obj.type === 'rect'){ setVal('propRadius', obj.rx || 0); setVal('propRadiusNum', Math.round(obj.rx || 0)); MS.fillRange($('#propRadius')); }
    reflectFill && reflectFill(src);
    // effects (shadow / glow / outline are drawn by the stack controls; distress is below)
    const fx = obj.__fx || {};
    MS.fx && MS.fx.refresh && MS.fx.refresh();
    const ds = fx.distress; $('#fxDistressKind').value = ds ? ds.kind : ''; $('#fxDistressBox').style.display = ds ? 'flex' : 'none';
    if(ds){ setVal('fxDistressAmt', ds.amount); setVal('fxDistressSize', ds.size); setVal('fxDistressSeed', ds.seed); }
  }
  if(txt){
    const s = styleOf(obj);
    const tf = obj._isCurvedText ? ((obj._curveFade && obj._curveFade.stops[0]) ? obj._curveFade.stops[0].color : s.fill) : obj.fill, td = describeColor(tf);
    setVal('propTextColor', td.hex || '#222222'); $('#propTextColorFade').style.display = td.kind === 'fade' ? '' : 'none';
    $('#propTextShadowBtn').classList.toggle('active', !!(MS.fx && MS.fx.active(obj)));
    const fb = $('#propFontFamilyBtn .fp'); if(fb){ fb.textContent = s.fontFamily || 'Montserrat'; fb.style.fontFamily = `'${s.fontFamily}'`; }
    setVal('propFontSize', Math.round(s.fontSize || 48)); const lh = +(s.lineHeight || 1.16).toFixed(2); setVal('propLineHeight', lh); setVal('propLineHeightR', lh); setVal('propCharSpacing', s.charSpacing || 0); setVal('propCharSpacingR', s.charSpacing || 0); MS.fillRange($('#propLineHeightR')); MS.fillRange($('#propCharSpacingR'));
    $('#propBold').classList.toggle('active', s.fontWeight === 'bold' || s.fontWeight >= 700); $('#propItalic').classList.toggle('active', s.fontStyle === 'italic');
    $('#propUnderline').classList.toggle('active', !!s.underline); $('#propStrike').classList.toggle('active', !!s.linethrough);
    const al = s.textAlign || 'left'; ['Left','Center','Right','Justify'].forEach(a=> $('#propAlign' + a).classList.toggle('active', al === a.toLowerCase()));
    const LY = TX.layoutOf(obj); setVal('propCurve', LY.curve); setVal('propCurveNum', LY.curve); MS.fillRange($('#propCurve'));
    [['tlStep','step'],['tlWave','wave'],['tlWaveN','waveN'],['tlBulge','bulge'],['tlTilt','tilt'],['tlSpin','spin'],['tlSkewX','skewX'],['tlSkewY','skewY']].forEach(([id, k])=>{ setVal(id, LY[k]); const e = $('#' + id); e && MS.fillRange(e); });
    const ta = $('#propTextContent'); const tv = obj._isCurvedText ? (obj._curveSourceText || '') : (obj.text || ''); if(document.activeElement !== ta) ta.value = tv;
  }
  if(img){
    const tint = (obj.filters || []).find(f=> f instanceof fabric.Image.filters.BlendColor), has = cls=> (obj.filters || []).some(f=> f instanceof fabric.Image.filters[cls]);
    $('#propTintEnable').checked = !!tint; if(tint){ setVal('propTintColor', tint.color); setVal('propTintAmount', Math.round(tint.alpha * 100)); }
    $('#propGrayscale').checked = has('Grayscale'); $('#propInvert').checked = has('Invert'); $('#propSepia').checked = has('Sepia');
    const g = cls=> (obj.filters || []).find(f=> f instanceof fabric.Image.filters[cls]);
    setVal('fxBright', g('Brightness') ? Math.round(g('Brightness').brightness * 100) : 0); setVal('fxContrast', g('Contrast') ? Math.round(g('Contrast').contrast * 100) : 0);
    setVal('fxSat', g('Saturation') ? Math.round(g('Saturation').saturation * 100) : 0); setVal('fxHue', g('HueRotation') ? Math.round(g('HueRotation').rotation * 100) : 0);
    setVal('fxBlur', g('Blur') ? Math.round(g('Blur').blur * 100) : 0); setVal('fxPixel', g('Pixelate') ? g('Pixelate').blocksize : 1); setVal('fxNoise', g('Noise') ? g('Noise').noise : 0);
  }
  MS.syncRanges($('#propsBody'));
  $('#propLockBtn').classList.toggle('active', $('#propLockRatio').checked);
  syncing = false;
}
let reflectFill = null;

/* ---- helpers to apply edits to the selection ---- */
function eachObj(fn){ const a = cv().getActiveObjects(); a.forEach(fn); return a.length; }
function done(label, now){ const c = cv(); c.requestRenderAll(); const a = c.getActiveObject(); MS.dirtyObj(a); if(now){ MS.commit(label); } else { clearTimeout(done._t); done._t = setTimeout(()=> MS.commit(label), 350); } MS.emitSelection(); }

function wireProps(){
  const c = ()=> cv();
  const num = (id, fn, ev)=> $('#' + id).addEventListener(ev || 'input', e=>{ if(syncing) return; fn(+e.target.value, e); });
  // transform
  const applyBox = ()=>{
    const o = c().getActiveObject(); if(!o) return;
    const b = o.getBoundingRect(true, true);
    const nx = +$('#propX').value, ny = +$('#propY').value, nw = Math.max(1, +$('#propW').value), nh = Math.max(1, +$('#propH').value);
    const lock = $('#propLockRatio').checked;
    let sx = o.scaleX * nw / b.width, sy = o.scaleY * nh / b.height;
    if(lock){ const r = Math.abs(nw - b.width) >= Math.abs(nh - b.height) ? nw / b.width : nh / b.height; sx = o.scaleX * r; sy = o.scaleY * r; }
    if(isFinite(sx) && isFinite(sy) && sx > 0 && sy > 0 && (Math.abs(nw - b.width) > .4 || Math.abs(nh - b.height) > .4)) o.set({ scaleX:sx, scaleY:sy });
    o.setCoords(); const b2 = o.getBoundingRect(true, true);
    o.set({ left:o.left + (nx - b2.left), top:o.top + (ny - b2.top) }); o.setCoords();
    done('Transform');
  };
  ['propX','propY','propW','propH'].forEach(id=> num(id, applyBox));
  num('propAngleNum', v=>{ const o = c().getActiveObject(); if(!o) return; const ctr = o.getCenterPoint(); o.rotate(v); o.setPositionByOrigin(ctr, 'center', 'center'); o.setCoords(); done('Rotate'); });
  $('#propLockBtn').addEventListener('click', ()=>{ const l = $('#propLockRatio'); l.checked = !l.checked; $('#propLockBtn').classList.toggle('active', l.checked); $('#propLockBtn').innerHTML = MS.icon(l.checked ? 'link' : 'unlink'); });
  $('#btnFlipH').addEventListener('click', ()=> MS.ops.flip('h')); $('#btnFlipV').addEventListener('click', ()=> MS.ops.flip('v')); $('#btnRot90').addEventListener('click', ()=> MS.ops.rotate90());
  $('#alignRow').addEventListener('click', e=>{ const b = e.target.closest('[data-align]'); if(b) MS.ops.align(b.dataset.align); });
  // appearance
  const setOpacity = v=>{ eachObj(o=> o.set('opacity', clamp(v, 0, 100) / 100)); setVal('propOpacity', v); setVal('propOpacityNum', v); MS.fillRange($('#propOpacity')); done('Opacity'); };
  num('propOpacity', setOpacity); num('propOpacityNum', setOpacity);
  $('#propBlend').addEventListener('change', e=>{ eachObj(o=> o.set('globalCompositeOperation', e.target.value)); done('Blend mode', true); });
  // fill & stroke
  $('#propFill').addEventListener('input', e=>{ S.fill = e.target.value; S.noFill = false; $('#propFillNone').checked = false; $('#propFillPreview').style.display = 'none'; eachObj(o=>{ o.__fillMeta = null; if(isText(o) && o._isCurvedText){ o._curveStyle.fill = e.target.value; o._curveFade = null; kids(o).forEach(k=>{ k.set('fill', e.target.value); k.dirty = true; }); o.dirty = true; } o.set('fill', e.target.value); }); MS.tools.syncSwatches(); done('Fill colour'); });
  $('#propFill').addEventListener('change', e=> MS.noteColor(e.target.value));
  $('#propTextColor').addEventListener('input', e=>{ if(syncing) return; const pf = $('#propFill'); pf.value = e.target.value; pf.dispatchEvent(new Event('input', { bubbles:true })); $('#propTextColorFade').style.display = 'none'; });
  $('#propTextColor').addEventListener('change', e=> MS.noteColor(e.target.value));
  $('#propTextShadowBtn').addEventListener('click', e=> MS.fx.open(e.currentTarget));
  $('#propFillNone').addEventListener('change', e=>{ S.noFill = e.target.checked; eachObj(o=>{ o.set('fill', e.target.checked ? '' : (S.fill || '#222222')); }); done('Fill', true); });
  $('#propStroke').addEventListener('input', e=>{ S.stroke = e.target.value; S.noStroke = false; $('#propStrokeNone').checked = false; eachObj(o=>{ o.set({ stroke:e.target.value }); if(!o.strokeWidth) o.set('strokeWidth', S.strokeW || 2); }); MS.tools.syncSwatches(); done('Stroke colour'); });
  $('#propStroke').addEventListener('change', e=> MS.noteColor(e.target.value));
  $('#propStrokeNone').addEventListener('change', e=>{ S.noStroke = e.target.checked; eachObj(o=> o.set('stroke', e.target.checked ? null : (S.stroke || '#000000'))); done('Stroke', true); });
  num('propStrokeWidth', v=>{ S.strokeW = v; eachObj(o=>{ o.set({ strokeWidth:v, strokeUniform:true }); if(v && !o.stroke) o.set('stroke', S.stroke || '#000'); }); done('Stroke width'); });
  $('#strokeStyleSeg').addEventListener('click', e=>{ const b = e.target.closest('button'); if(!b) return; eachObj(o=>{ const w = Math.max(1, o.strokeWidth || 2); o.set('strokeDashArray', b.dataset.v === 'solid' ? null : b.dataset.v === 'dash' ? [w*3, w*2] : [1, w*2]); if(b.dataset.v === 'dot') o.set('strokeLineCap', 'round'); }); done('Stroke style', true); });
  $('#strokeJoinSeg').addEventListener('click', e=>{ const b = e.target.closest('button'); if(!b) return; eachObj(o=> o.set('strokeLineJoin', b.dataset.v)); done('Line join', true); });
  const setRadius = v=>{ eachObj(o=>{ if(o.type === 'rect') o.set({ rx:v, ry:v }); }); setVal('propRadius', v); setVal('propRadiusNum', v); MS.fillRange($('#propRadius')); done('Corner radius'); };
  num('propRadius', setRadius); num('propRadiusNum', setRadius);
  $('#btnMoreFills').addEventListener('click', ()=>{ MS.fillForSelection = true; MS.showPage('fill'); });
  // text
  $('#propTextContent').addEventListener('input', e=> TX.text(e.target.value));
  num('propFontSize', v=> TX.setSize(v)); const setLH = v=>{ v = clamp(v || 1, .1, 10); setVal('propLineHeight', v); setVal('propLineHeightR', v); MS.fillRange($('#propLineHeightR')); TX.set({ lineHeight:v }, 'Line spacing'); };
  const setCS = v=>{ v = clamp(Math.round(v) || 0, -500, 5000); setVal('propCharSpacing', v); setVal('propCharSpacingR', v); MS.fillRange($('#propCharSpacingR')); TX.set({ charSpacing:v }, 'Letter spacing'); };
  num('propLineHeight', setLH); num('propLineHeightR', setLH); num('propCharSpacing', setCS); num('propCharSpacingR', setCS);
  const tog = (id, prop, on, off)=> $('#' + id).addEventListener('click', ()=>{ const a = !$('#' + id).classList.contains('active'); TX.set({ [prop]: a ? on : off }, prop); $('#' + id).classList.toggle('active', a); });
  tog('propBold', 'fontWeight', 'bold', 'normal'); tog('propItalic', 'fontStyle', 'italic', 'normal'); tog('propUnderline', 'underline', true, false); tog('propStrike', 'linethrough', true, false);
  ['Left','Center','Right','Justify'].forEach(a=> $('#propAlign' + a).addEventListener('click', ()=>{ TX.set({ textAlign:a.toLowerCase() }, 'Align text'); syncProps(); }));
  $('#caseUpper').addEventListener('click', ()=> TX.convertCase('upper')); $('#caseLower').addEventListener('click', ()=> TX.convertCase('lower')); $('#caseTitle').addEventListener('click', ()=> TX.convertCase('title'));
  const curveIt = v=>{ setVal('propCurve', v); setVal('propCurveNum', v); clearTimeout(curveIt._t); curveIt._t = setTimeout(()=> TX.curve(clamp(Math.round(v), -100, 100)), 120); };
  num('propCurve', curveIt); num('propCurveNum', curveIt);
  [['tlStep','step'],['tlWave','wave'],['tlWaveN','waveN'],['tlBulge','bulge'],['tlTilt','tilt'],['tlSpin','spin'],['tlSkewX','skewX'],['tlSkewY','skewY']].forEach(([id, k])=>{
    $('#' + id).addEventListener('input', e=>{ if(syncing) return; clearTimeout(TX['_d' + id]); const v = +e.target.value; TX['_d' + id] = setTimeout(()=> TX.layout({ [k]:v }), 90); });
  });
  $('#tlPresets').innerHTML = Object.keys(TX.layoutPresets).map(k=> '<span class="chip" data-p="' + k + '">' + k + '</span>').join('');
  $('#tlPresets').addEventListener('click', e=>{ const ch = e.target.closest('.chip'); if(ch) TX.layout(TX.layoutPresets[ch.dataset.p], true); });
  $('#tlReset').addEventListener('click', ()=> TX.layout({}, true));
  $('#btnGraffitiStyle').addEventListener('click', TX.graffiti);
  $('#btnTextOutline').addEventListener('click', ()=> MS.textToPaths && MS.textToPaths());
  // images
  const updFilters = ()=>{
    const o = c().getActiveObject(); if(!o || o.type !== 'image') return;
    const F = fabric.Image.filters, keep = [];
    if($('#propTintEnable').checked && !$('#propTintClear').checked) keep.push(new F.BlendColor({ color:$('#propTintColor').value, mode:'tint', alpha:+$('#propTintAmount').value / 100 }));
    if($('#propGrayscale').checked) keep.push(new F.Grayscale()); if($('#propInvert').checked) keep.push(new F.Invert()); if($('#propSepia').checked) keep.push(new F.Sepia());
    const v = id=> +$('#' + id).value;
    if(v('fxBright')) keep.push(new F.Brightness({ brightness:v('fxBright')/100 })); if(v('fxContrast')) keep.push(new F.Contrast({ contrast:v('fxContrast')/100 }));
    if(v('fxSat')) keep.push(new F.Saturation({ saturation:v('fxSat')/100 })); if(v('fxHue')) keep.push(new F.HueRotation({ rotation:v('fxHue')/100 }));
    if(v('fxBlur')) keep.push(new F.Blur({ blur:v('fxBlur')/100 })); if(v('fxPixel') > 1) keep.push(new F.Pixelate({ blocksize:v('fxPixel') })); if(v('fxNoise')) keep.push(new F.Noise({ noise:v('fxNoise') }));
    o.filters = keep; o.applyFilters(); done('Picture adjustments');
  };
  ['propTintEnable','propTintClear','propGrayscale','propInvert','propSepia'].forEach(id=> $('#' + id).addEventListener('change', e=>{ if(!syncing) updFilters(); }));
  ['propTintColor','propTintAmount','fxBright','fxContrast','fxSat','fxHue','fxBlur','fxPixel','fxNoise'].forEach(id=> $('#' + id).addEventListener('input', ()=>{ if(!syncing) updFilters(); }));
  $('#btnImgReset').addEventListener('click', ()=>{ const o = c().getActiveObject(); if(o && o.type === 'image'){ o.filters = []; o.applyFilters(); done('Reset picture', true); syncProps(); } });
  $('#btnImgWand').addEventListener('click', ()=> MS.setTool('wand')); $('#btnImgEraser').addEventListener('click', ()=> MS.setTool('eraser'));
  // arrange
  $('#btnBringFront').addEventListener('click', ()=> MS.ops.order('front')); $('#btnSendBack').addEventListener('click', ()=> MS.ops.order('back'));
  $('#btnBringFwd').addEventListener('click', ()=> MS.ops.order('fwd')); $('#btnSendBwd').addEventListener('click', ()=> MS.ops.order('bwd'));
  $('#btnGroup').addEventListener('click', MS.ops.group); $('#btnUngroup').addEventListener('click', MS.ops.ungroup);
  $('#btnDuplicate').addEventListener('click', MS.ops.duplicate); $('#btnDelete').addEventListener('click', MS.ops.del);
  $('#btnMirrorCopy').addEventListener('click', ()=> MS.symmetry && MS.symmetry.openMirror()); $('#btnKaleido').addEventListener('click', ()=> MS.symmetry && MS.symmetry.openKaleido());
  $('#propFontFamilyBtn').addEventListener('click', e=> MS.openFontBrowser && MS.openFontBrowser(e.currentTarget));
}

/* ============================ FILL / BACKGROUND PANEL ============================ */
const CLEAR = 'rgba(0,0,0,0)';
/* ---- fade model: stops with their own transparency, softness (clean line .. gradual), direction dial ---- */
const GS = { stops:[{ hex:'#ff5b8c', a:100, clear:false }, { hex:'#5b8cff', a:100, clear:false }], angle:45, soft:100 };
function rgbaOf(st){ const c = MS.hexToRgb(st.hex), al = st.clear ? 0 : st.a / 100; return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + (+al.toFixed(3)) + ')'; }
// soft=100: ordinary evenly spaced fade; soft=0: hard-edged bands (a clean line between colours)
function fadeStops(cols, soft){
  const n = cols.length; if(n < 2) return [{ offset:0, color:cols[0] }, { offset:1, color:cols[0] }];
  const half = 1 / (2 * (n - 1)), keep = (1 - soft / 100) * half, out = [];
  cols.forEach((c, i)=>{ const p = i / (n - 1), lo = clamp(p - keep, 0, 1), hi = clamp(p + keep, 0, 1); out.push({ offset:lo, color:c }); if(hi > lo + 1e-6) out.push({ offset:hi, color:c }); });
  return out;
}
function currentFade(){
  const colors = GS.stops.map(rgbaOf), stops = fadeStops(colors, GS.soft);
  return { colors, angle:clamp(GS.angle, 0, 360), stops, soft:GS.soft, gs:JSON.parse(JSON.stringify(GS.stops)) };
}
MS.currentFade = currentFade;
function cssFade(f){ return 'linear-gradient(' + (f.angle + 90) + 'deg, ' + f.stops.map(s=> s.color + ' ' + (s.offset * 100).toFixed(1) + '%').join(',') + ')'; }
function walkSel(fn){
  const walk = o=>{ if(!o || o.__isBackground) return; if(o.type === 'group' && !o._isCurvedText || o.type === 'activeSelection'){ o.getObjects().forEach(walk); return; } fn(o); };
  cv().getActiveObjects().forEach(walk);
}
function selTargets(skipCurved){
  const out = [];
  walkSel(o=>{ if(o._isCurvedText){ if(!skipCurved) kids(o).forEach(k=> out.push(k)); return; } if(o.type === 'image') return; out.push(o); });
  return out;
}
function curvedRoots(){ const out = []; walkSel(o=>{ if(o._isCurvedText) out.push(o); }); return out; }
function targetIsSelection(){ const m = $('#bgTarget').value; if(m === 'bg') return false; const has = selTargets().length > 0; return m === 'sel' ? true : has; }
// curveFn(group) lets warped text take one gradient across the whole word instead of one per letter
function fillTargets(make, label, meta, curveFn){
  const t = selTargets(!!curveFn), roots = curveFn ? curvedRoots() : [];
  if(!t.length && !roots.length){ toast('Select one or more shapes / text first.'); return; }
  const act = cv().getActiveObject();
  t.forEach(o=>{ const f = make(o); o.__fillMeta = meta || null; if(o.type === 'line') o.set('stroke', f); else o.set('fill', f); o.dirty = true; });
  roots.forEach(g=>{ curveFn(g); g.__fillMeta = meta || null; });
  if(!curveFn) curvedRoots().forEach(g=>{ g._curveFade = null; if(t.length){ const f = make(t[0]); if(typeof f === 'string') g._curveStyle.fill = f; } });
  MS.dirtyObj(act); cv().requestRenderAll(); MS.commit(label); const n = t.length + roots.length; toast(label + ' applied to ' + n + ' object' + (n > 1 ? 's' : '') + '.');
}
function setBg(obj, soft){
  const c = cv(); if(obj.type === 'image' && !obj.__bgMode) obj.__bgMode = 'pattern'; const old = c.getObjects().find(o=>o.__isBackground); if(old) c.remove(old);
  obj.__isBackground = true; obj.name = 'Background';
  obj.set({ left:0, top:0, selectable:false, evented:false, hasControls:false, lockMovementX:true, lockMovementY:true, lockScalingX:true, lockScalingY:true, lockRotation:true });
  c.add(obj); c.sendToBack(obj); c.discardActiveObject(); c.requestRenderAll();
  if(soft){ clearTimeout(setBg._t); setBg._t = setTimeout(()=> MS.commit('Background'), 450); } else MS.commit('Background');
}
MS.setBackgroundObject = setBg;
MS.clearBackground = function(){ const c = cv(), b = c.getObjects().find(o=>o.__isBackground); if(!b){ toast('No background to remove.'); return; } c.remove(b); c.requestRenderAll(); MS.commit('Remove background'); };
MS.setSolidBackground = hex=> setBg(new fabric.Rect({ width:S.doc.wPx, height:S.doc.hPx, fill:hex }));
function wireFill(){
  let setFade = null;
  const grid = $('#bgPatternGrid'), pc = $('#bgPatCount'); if(pc) pc.textContent = MS.patterns.list.length;
  MS.patterns.list.forEach(p=>{
    const b = document.createElement('button'); b.title = p.label; b.dataset.kind = p.k; b.innerHTML = MS.patterns.icon(p.k);
    b.addEventListener('click', ()=>{
      const A = $('#bgPatClearA').checked ? CLEAR : $('#bgPatColorA').value;
      const B = $('#bgPatFade').checked ? { fade:currentFade() } : ($('#bgPatClearB').checked ? CLEAR : $('#bgPatColorB').value);
      if(targetIsSelection()){
        fillTargets(o=>{ const w = Math.max(1, o.width || 1), h = Math.max(1, o.height || 1), k = Math.min(1, 1600 / Math.max(w, h)); const tile = MS.patterns.render(p.k, A, B, w*k, h*k); return new fabric.Pattern({ source:tile, repeat:'no-repeat', patternTransform:[1/k,0,0,1/k,0,0] }); }, 'Pattern', { kind:'pattern', pattern:p.k, A, B });
      } else {
        const off = MS.patterns.render(p.k, A, B, S.doc.wPx, S.doc.hPx);
        fabric.Image.fromURL(off.toDataURL('image/png'), img=> setBg(img));
      }
    });
    grid.appendChild(b);
  });
  $('#btnApplySolidBg').addEventListener('click', ()=>{
    const hex = $('#bgSolidColor').value;
    if($('#bgSolidClear').checked){ if(targetIsSelection()) fillTargets(()=>'', 'Clear fill'); else MS.clearBackground(); return; }
    MS.noteColor(hex);
    if(targetIsSelection()) fillTargets(()=>hex, 'Solid fill', { kind:'solid', color:hex }); else MS.setSolidBackground(hex);
  });
  const dial = $('#fadeDial');
  dial.innerHTML = '<div class="fd-bg"></div><svg viewBox="-60 -60 120 120"><circle r="50" class="fd-ring"/><line class="fd-line" x1="0" y1="0" x2="0" y2="0"/><circle class="fd-start" r="4"/><circle class="fd-end" r="8"/><path class="fd-arrow" d=""/></svg>';
  function paintDial(){
    const f = currentFade(), a = f.angle * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a);
    $('.fd-bg', dial).style.background = cssFade(f);
    const sv = dial.querySelector('svg'), q = sel=> sv.querySelector(sel);
    q('.fd-line').setAttribute('x1', -dx * 50); q('.fd-line').setAttribute('y1', -dy * 50); q('.fd-line').setAttribute('x2', dx * 50); q('.fd-line').setAttribute('y2', dy * 50);
    q('.fd-start').setAttribute('cx', -dx * 50); q('.fd-start').setAttribute('cy', -dy * 50);
    q('.fd-end').setAttribute('cx', dx * 50); q('.fd-end').setAttribute('cy', dy * 50);
    const ex = dx * 50, ey = dy * 50, px = -dy, py = dx;
    q('.fd-arrow').setAttribute('d', 'M' + (ex - dx * 9 + px * 6) + ' ' + (ey - dy * 9 + py * 6) + ' L' + ex + ' ' + ey + ' L' + (ex - dx * 9 - px * 6) + ' ' + (ey - dy * 9 - py * 6));
    $('#bgGradPreview').firstElementChild.style.background = cssFade(Object.assign({}, f, { angle:0 }));
    $('#bgGradAngleNum').value = Math.round(GS.angle);
    $('#bgGradSoftLbl').textContent = GS.soft >= 95 ? 'gradual fade ▶' : GS.soft <= 5 ? 'clean line ▶' : 'edge ' + GS.soft + '% ▶';
    $$('#fadeDirs button').forEach(b=> b.classList.toggle('active', Math.abs(((GS.angle - +b.dataset.a + 540) % 360) - 180) < 2));
    MS.bgFadeChanged && MS.bgFadeChanged();
  }
  const setAngle = a=>{ GS.angle = ((Math.round(a) % 360) + 360) % 360; paintDial(); };
  dial.addEventListener('pointerdown', e=>{
    dial.setPointerCapture(e.pointerId);
    const mv = ev=>{ const r = dial.getBoundingClientRect(); let a = Math.atan2(ev.clientY - (r.top + r.height/2), ev.clientX - (r.left + r.width/2)) * 180 / Math.PI; if(ev.shiftKey) a = Math.round(a / 15) * 15; setAngle(a); };
    mv(e); dial.addEventListener('pointermove', mv); const up = ()=>{ dial.removeEventListener('pointermove', mv); dial.removeEventListener('pointerup', up); }; dial.addEventListener('pointerup', up);
  });
  // arrows = where the fade travels TO (screen angle: 0 = right, 90 = down)
  const DIRS = [['↖', 225], ['↑', 270], ['↗', 315], ['←', 180], null, ['→', 0], ['↙', 135], ['↓', 90], ['↘', 45]];
  $('#fadeDirs').innerHTML = DIRS.map(d=> d ? '<button class="tb" data-a="' + d[1] + '">' + d[0] + '</button>' : '<span></span>').join('');
  $$('#fadeDirs button').forEach(b=> b.addEventListener('click', ()=> setAngle(+b.dataset.a)));
  $('#bgGradAngleNum').addEventListener('input', e=> setAngle(+e.target.value || 0));
  $('#bgGradSoft').addEventListener('input', e=>{ GS.soft = +e.target.value; paintDial(); });
  $('#fadeReverse').addEventListener('click', ()=>{ GS.stops.reverse(); renderStops(); });
  function renderStops(){
    const n = +$('#bgGradStops').value;
    while(GS.stops.length < n) GS.stops.push({ ...GS.stops[GS.stops.length - 1] });
    GS.stops.length = n;
    const box = $('#bgGradStopsList'); box.innerHTML = '';
    GS.stops.forEach((st)=>{
      const row = document.createElement('div'); row.className = 'r stop-row';
      row.innerHTML = '<span class="swatch-in"><input type="color" value="' + st.hex + '"></span><input type="range" min="0" max="100" value="' + (st.clear ? 0 : st.a) + '" style="min-width:60px"><div class="f" style="width:58px"><input type="number" min="0" max="100" value="' + (st.clear ? 0 : st.a) + '"><em>%</em></div><label class="chk mut" data-tip="Clear = fully see-through"><input type="checkbox" ' + (st.clear ? 'checked' : '') + '>clear</label>';
      const col = row.querySelector('input[type=color]'), rng = row.querySelector('input[type=range]'), num = row.querySelector('input[type=number]'), clr = row.querySelector('input[type=checkbox]');
      col.addEventListener('input', ()=>{ st.hex = col.value; paintDial(); });
      const setA = v=>{ st.a = clamp(+v || 0, 0, 100); st.clear = false; rng.value = num.value = st.a; clr.checked = false; MS.fillRange(rng); paintDial(); };
      rng.addEventListener('input', ()=> setA(rng.value)); num.addEventListener('input', ()=> setA(num.value));
      clr.addEventListener('change', ()=>{ st.clear = clr.checked; if(st.clear){ rng.value = num.value = 0; } else { st.a = st.a || 100; rng.value = num.value = st.a; } MS.fillRange(rng); paintDial(); });
      box.appendChild(row);
    });
    MS.syncRanges(box); paintDial();
  }
  $('#bgGradStops').addEventListener('change', renderStops);
  setFade = (colors, angle, meta)=>{
    if(meta && meta.gs){ GS.stops = JSON.parse(JSON.stringify(meta.gs)); GS.soft = meta.soft == null ? 100 : meta.soft; }
    else GS.stops = colors.map(c=>{ let col = null; try{ col = new fabric.Color(c); }catch(e){} return { hex: col ? '#' + col.toHex().toLowerCase() : '#888888', a: col ? Math.round(col.getAlpha() * 100) : 100, clear:false }; });
    GS.angle = ((Math.round(angle) % 360) + 360) % 360; $('#bgGradStops').value = String(clamp(GS.stops.length, 2, 6)); renderStops();
    $('#bgGradSoft').value = GS.soft; MS.fillRange($('#bgGradSoft'));
  };
  renderStops();
  $('#btnApplyGradientBg').addEventListener('click', ()=>{
    const f = currentFade(), rad = f.angle * Math.PI / 180, stops = f.stops;
    if(targetIsSelection()){
      const meta = { kind:'fade', colors:f.colors, angle:f.angle, soft:f.soft, gs:f.gs };
      if($('#bgSpan').checked){
        const t = selTargets(true).concat(curvedRoots()); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        t.forEach(o=>{ const b = o.getBoundingRect(true, true); x0 = Math.min(x0, b.left); y0 = Math.min(y0, b.top); x1 = Math.max(x1, b.left + b.width); y1 = Math.max(y1, b.top + b.height); });
        const cx = (x0+x1)/2, cy = (y0+y1)/2, hw = (x1-x0)/2, hh = (y1-y0)/2, A = new fabric.Point(cx - Math.cos(rad)*hw, cy - Math.sin(rad)*hh), B = new fabric.Point(cx + Math.cos(rad)*hw, cy + Math.sin(rad)*hh);
        fillTargets(o=>{ const inv = fabric.util.invertTransform(o.calcTransformMatrix()), a = fabric.util.transformPoint(A, inv), b = fabric.util.transformPoint(B, inv), w = o.width || 0, h = o.height || 0; return new fabric.Gradient({ type:'linear', coords:{ x1:a.x + w/2, y1:a.y + h/2, x2:b.x + w/2, y2:b.y + h/2 }, colorStops:stops }); }, 'Fade', meta, g=> TX.fadeGroup(g, stops, f.angle, A, B));
      } else fillTargets(o=>{ const w = Math.max(1, o.width || 1), h = Math.max(1, o.height || 1); return new fabric.Gradient({ type:'linear', coords:{ x1:w/2 - Math.cos(rad)*w/2, y1:h/2 - Math.sin(rad)*h/2, x2:w/2 + Math.cos(rad)*w/2, y2:h/2 + Math.sin(rad)*h/2 }, colorStops:stops }); }, 'Fade', meta, g=> TX.fadeGroup(g, stops, f.angle));
    } else {
      const W = S.doc.wPx, H = S.doc.hPx;
      setBg(new fabric.Rect({ width:W, height:H, fill:new fabric.Gradient({ type:'linear', coords:{ x1:W/2 - Math.cos(rad)*W/2, y1:H/2 - Math.sin(rad)*H/2, x2:W/2 + Math.cos(rad)*W/2, y2:H/2 + Math.sin(rad)*H/2 }, colorStops:stops }) }));
    }
  });
  $('#btnUploadBg').addEventListener('click', ()=> $('#bgImageInput').click());
  $('#bgImageInput').addEventListener('change', e=>{
    const f = e.target.files[0]; e.target.value = ''; if(!f) return;
    const r = new FileReader(); r.onload = ev=> fabric.Image.fromURL(ev.target.result, img=>{ const sc = Math.max(S.doc.wPx / img.width, S.doc.hPx / img.height); img.set({ scaleX:sc, scaleY:sc }); img.__bgMode = 'picture'; setBg(img); img.set({ left:(S.doc.wPx - img.width*sc)/2, top:(S.doc.hPx - img.height*sc)/2 }); cv().requestRenderAll(); }); r.readAsDataURL(f);
  });
  $('#btnRemoveBg').addEventListener('click', MS.clearBackground);
  reflectFill = function(src){
    const meta = src.__fillMeta, fill = src.fill, hex = MS.colorHex; $$('#bgPatternGrid button').forEach(b=> b.classList.remove('active'));
    let note = 'Showing this item’s current fill: ';
    if(fill && fill.colorStops){ let colors = fill.colorStops.map(s=>s.color), angle = 0; if(meta && meta.kind === 'fade'){ colors = meta.colors; angle = meta.angle; } else { const q = fill.coords || {}; angle = Math.atan2((q.y2||0) - (q.y1||0), (q.x2||0) - (q.x1||0)) * 180 / Math.PI; } setFade(colors, angle, meta && meta.kind === 'fade' ? meta : null); note += colors.length + '-colour fade at ' + Math.round(((angle % 360) + 360) % 360) + '°.'; }
    else if(fill && fill.source){ note += 'pattern.'; if(meta && meta.kind === 'pattern'){ const b = $(`#bgPatternGrid button[data-kind="${meta.pattern}"]`); if(b) b.classList.add('active'); if(typeof meta.A === 'string') $('#bgPatColorA').value = hex(meta.A) || $('#bgPatColorA').value; if(meta.B && meta.B.fade){ $('#bgPatFade').checked = true; setFade(meta.B.fade.colors, meta.B.fade.angle, meta.B.fade); } else { $('#bgPatFade').checked = false; if(typeof meta.B === 'string') $('#bgPatColorB').value = hex(meta.B) || $('#bgPatColorB').value; } } }
    else if(typeof fill === 'string' && fill){ const h = hex(fill); if(h) $('#bgSolidColor').value = h; note += 'solid ' + (h || fill) + '.'; } else note += 'none.';
    $('#bgTargetNote').textContent = note;
  };
}

/* ============================ BACKGROUND TAB (switch + live options) ============================ */
const BG = { mode:'solid', pat:'halftone', scene:'stars', scOp:{ A:'#0a1030', B:'#9ec5ff', C:'#ffd9a0', dens:50, size:50, seed:7 }, grade:Object.assign({}, MS.scenes.GRADE0), ready:false };
// bake a scene or pattern canvas (graded) into the background, scaled to the document
function bakeBg(canvas, mode){
  const g = MS.scenes.grade(canvas, BG.grade);
  fabric.Image.fromURL(g.toDataURL('image/png'), img=>{ img.__bgMode = mode; img.set({ scaleX:S.doc.wPx / img.width, scaleY:S.doc.hPx / img.height }); setBg(img, true); });
}
const bgObj = ()=> cv() && cv().getObjects().find(o=> o.__isBackground);
function softCommit(){ clearTimeout(softCommit._t); softCommit._t = setTimeout(()=> MS.commit('Background'), 450); }
function bgDetect(b){
  if(!b) return BG.mode; if(b.__bgMode) return b.__bgMode;
  if(b.type === 'image') return 'picture'; return (b.fill && b.fill.colorStops) ? 'fade' : 'solid';
}
function refreshBgUi(){
  const page = $('#page-fill'); if(!page) return;
  const sel = $('#bgTarget').value === 'sel', b = bgObj(), on = !!b;
  if(on && !sel && !refreshBgUi.userMode) BG.mode = bgDetect(b);
  page.classList.toggle('sel', sel);
  $('#bgTopSect').style.display = sel ? 'none' : ''; $('#bgSelBanner').style.display = sel ? '' : 'none';
  $('#bgOn').checked = on; $('#bgOnNote').textContent = on ? 'On' : 'Off — transparent'; $('#bgModes').style.display = on ? '' : 'none';
  $$('#bgModes button').forEach(x=> x.classList.toggle('active', x.dataset.m === BG.mode));
  $$('#page-fill [data-mode]').forEach(s=>{ const ms = s.dataset.mode.split(' '); s.style.display = sel ? (ms.some(m=> ['picture','scene'].includes(m)) || ms.length > 1 ? 'none' : '') : (on && ms.includes(BG.mode) ? '' : 'none'); });
  if(sel) $('#bgTargetNote').textContent = 'Pick a solid, a fade or a pattern and apply it to the selected shapes/text.';
}
function putFill(fill, meta, mode){
  const b = bgObj();
  if(b && b.type === 'rect'){ b.set({ fill }); b.__fillMeta = meta; b.__bgMode = mode; b.dirty = true; MS.dirtyObj(b); cv().requestRenderAll(); softCommit(); MS.emit('layers'); }
  else { const r = new fabric.Rect({ width:S.doc.wPx, height:S.doc.hPx, fill }); r.__fillMeta = meta; r.__bgMode = mode; setBg(r, true); }
}
function applyBg(force){
  if(!BG.ready || $('#bgTarget').value === 'sel' || (!force && !$('#bgOn').checked)) return;
  if(BG.mode === 'solid'){ const hex = $('#bgSolidColor').value; putFill($('#bgSolidClear').checked ? 'rgba(0,0,0,0)' : hex, { kind:'solid', color:hex }, 'solid'); }
  else if(BG.mode === 'fade'){
    const f = currentFade(), rad = f.angle * Math.PI / 180, W = S.doc.wPx, H = S.doc.hPx;
    putFill(new fabric.Gradient({ type:'linear', coords:{ x1:W/2 - Math.cos(rad)*W/2, y1:H/2 - Math.sin(rad)*H/2, x2:W/2 + Math.cos(rad)*W/2, y2:H/2 + Math.sin(rad)*H/2 }, colorStops:f.stops }), { kind:'fade', colors:f.colors, angle:f.angle, soft:f.soft, gs:f.gs }, 'fade');
  } else if(BG.mode === 'pattern'){
    clearTimeout(applyBg._pt); applyBg._pt = setTimeout(()=>{
      const A = $('#bgPatClearA').checked ? CLEAR : $('#bgPatColorA').value, B = $('#bgPatFade').checked ? { fade:currentFade() } : ($('#bgPatClearB').checked ? CLEAR : $('#bgPatColorB').value);
      const pw = S.doc.wPx, ph = S.doc.hPx, k = Math.min(1, 2600 / Math.max(pw, ph));
      bakeBg(MS.patterns.render(BG.pat, A, B, pw * k, ph * k), 'pattern');
    }, 90);
  } else if(BG.mode === 'scene'){
    clearTimeout(applyBg._st); applyBg._st = setTimeout(()=> bakeBg(MS.scenes.render(BG.scene, BG.scOp, S.doc.wPx, S.doc.hPx), 'scene'), 80);
  }
}
let liveT = null; const live = ()=>{ clearTimeout(liveT); liveT = setTimeout(applyBg, 30); };
MS.bgLive = live;
function wireScenes(){
  const cnt = $('#bgSceneCount'); if(cnt) cnt.textContent = MS.scenes.list.length;
  const grid = $('#bgSceneGrid'), op = BG.scOp, setUi = ()=>{ setVal('bgScA', op.A); setVal('bgScB', op.B); setVal('bgScC', op.C); setVal('bgScDens', op.dens); setVal('bgScSize', op.size); setVal('bgScSeed', op.seed); MS.syncRanges($('#page-fill')); };
  MS.scenes.list.forEach(sc=>{
    const b = document.createElement('button'); b.title = sc.label; b.dataset.scene = sc.k; b.innerHTML = '<canvas width="64" height="64"></canvas><span>' + sc.label + '</span>';
    const t = MS.scenes.render(sc.k, { A:sc.a, B:sc.b, C:sc.c, dens:50, size:50, seed:7 }, 64, 64), cx = b.querySelector('canvas').getContext('2d'); cx.drawImage(t, 0, 0, 64, 64);
    b.addEventListener('click', ()=>{ BG.scene = sc.k; Object.assign(op, { A:sc.a, B:sc.b, C:sc.c }); setUi(); $$('#bgSceneGrid button').forEach(x=> x.classList.toggle('active', x === b)); BG.mode = 'scene'; refreshBgUi.userMode = true; refreshBgUi(); applyBg(true); });
    grid.appendChild(b);
  });
  [['bgScA','A'],['bgScB','B'],['bgScC','C']].forEach(([id, k])=> $('#' + id).addEventListener('input', e=>{ op[k] = e.target.value; live(); }));
  [['bgScDens','dens'],['bgScSize','size'],['bgScSeed','seed']].forEach(([id, k])=> $('#' + id).addEventListener('input', e=>{ op[k] = +e.target.value; live(); }));
  $('#bgScDice').addEventListener('click', ()=>{ op.seed = 1 + Math.floor(Math.random() * 998); setVal('bgScSeed', op.seed); MS.syncRanges($('#page-fill')); live(); });
  // colour grade
  const G = [['bgGrHue','hue'],['bgGrSat','sat'],['bgGrBri','bri'],['bgGrCon','con'],['bgGrWarm','warm'],['bgGrGlow','glow'],['bgGrVig','vig'],['bgGrGrain','grain']];
  const gUi = ()=>{ G.forEach(([id, k])=> setVal(id, BG.grade[k])); MS.syncRanges($('#page-fill')); };
  G.forEach(([id, k])=> $('#' + id).addEventListener('input', e=>{ BG.grade[k] = +e.target.value; live(); }));
  const pr = $('#bgGradePresets'); pr.innerHTML = Object.keys(MS.scenes.GRADES).map(k=> '<span class="chip" data-g="' + k + '">' + k + '</span>').join('');
  pr.addEventListener('click', e=>{ const c = e.target.closest('.chip'); if(!c) return; BG.grade = Object.assign({}, MS.scenes.GRADE0, MS.scenes.GRADES[c.dataset.g]); gUi(); live(); });
  $('#bgGrReset').addEventListener('click', ()=>{ BG.grade = Object.assign({}, MS.scenes.GRADE0); gUi(); live(); });
}
function wireBgTab(){
  $('#bgOn').addEventListener('change', e=>{
    if(e.target.checked){ refreshBgUi.userMode = false; BG.ready = true; BG.mode = 'solid'; applyBg(true); refreshBgUi(); }
    else { const b = bgObj(); if(b){ cv().remove(b); cv().requestRenderAll(); MS.commit('Background off'); } refreshBgUi(); }
  });
  $('#bgModes').addEventListener('click', e=>{ const b = e.target.closest('button'); if(!b) return; BG.mode = b.dataset.m; refreshBgUi.userMode = true; refreshBgUi(); if(BG.mode !== 'picture') applyBg(true); else if(!bgObj() || bgObj().type !== 'image') $('#bgImageInput').click(); });
  ['bgSolidColor'].forEach(id=> $('#' + id).addEventListener('input', live)); $('#bgSolidClear').addEventListener('change', live);
  ['bgPatColorA','bgPatColorB'].forEach(id=> $('#' + id).addEventListener('input', live)); ['bgPatClearA','bgPatClearB','bgPatFade'].forEach(id=> $('#' + id).addEventListener('change', live));
  // pattern tiles pick the pattern; in background mode they apply live
  $('#bgPatternGrid').addEventListener('click', e=>{ const b = e.target.closest('button'); if(!b) return; BG.pat = b.dataset.kind; if($('#bgTarget').value !== 'sel'){ e.stopImmediatePropagation(); $$('#bgPatternGrid button').forEach(x=> x.classList.toggle('active', x === b)); BG.mode = 'pattern'; applyBg(); } }, true);
  wireScenes();
  $('#bgBackToBg').addEventListener('click', ()=>{ $('#bgTarget').value = 'bg'; refreshBgUi(); });
  // fade controls call this through paintDial
  MS.bgFadeChanged = ()=>{ if(BG.mode === 'fade') live(); };
  MS.on('page', p=>{ if(p !== 'fill') return; $('#bgTarget').value = MS.fillForSelection ? 'sel' : 'bg'; MS.fillForSelection = false; refreshBgUi.userMode = false; BG.ready = true; refreshBgUi(); });
  MS.on('layers', refreshBgUi); MS.on('doc', refreshBgUi);
  BG.ready = true; refreshBgUi();
}

/* ============================ CANVAS / DOCUMENT PANEL ============================ */
const UNIT = { in:1, cm:2.54, mm:25.4, px:WORKING_PPI_FN() };
function WORKING_PPI_FN(){ return MS.WORKING_PPI; }
function unitToPx(v, u){ return u === 'px' ? v : v / (u === 'in' ? 1 : u === 'cm' ? 2.54 : 25.4) * MS.WORKING_PPI * (S.doc.mode === 'print' ? 1 : 1); }
function pxToUnit(px, u){ return u === 'px' ? px : px / MS.WORKING_PPI * (u === 'in' ? 1 : u === 'cm' ? 2.54 : 25.4); }
function syncDocPanel(){
  const d = S.doc; $$('.docUnit').forEach(e=> e.textContent = d.unit);
  setVal('docW', +pxToUnit(d.wPx, d.unit).toFixed(d.unit === 'px' ? 0 : 3)); setVal('docH', +pxToUnit(d.hPx, d.unit).toFixed(d.unit === 'px' ? 0 : 3));
  $$('#unitSeg button').forEach(b=> b.classList.toggle('active', b.dataset.u === d.unit));
  setVal('garmentColorPicker', d.garment); $('#garmentClear').checked = d.garmentClear;
  $('#toggleChecker').checked = MS.prefs.checker; $('#toggleGuides').checked = MS.prefs.centerGuides; $('#toggleSnap').checked = MS.prefs.snap; $('#toggleSmart').checked = MS.prefs.smart;
  $('#toggleRulers').checked = MS.prefs.rulers; $('#toggleSafe').checked = MS.prefs.safe; $('#toggleGrid').checked = MS.prefs.grid; setVal('gridSize', MS.prefs.gridSize); setVal('safeMargin', MS.prefs.safeMargin);
  $('#prefWheelResize').checked = MS.prefs.wheelResize; $('#prefStickyTools').checked = MS.prefs.stickyTools; $('#prefClampHandles').checked = MS.prefs.clampHandles;
  $('#sbSnap').classList.toggle('on', MS.prefs.snap); $('#sbGrid').classList.toggle('on', MS.prefs.grid);
  MS.updateDocUi();
}
const GARMENTS = ['#ffffff','#000000','#0d1b2a','#1b3a4b','#7a1f2b','#2e5339','#d4a017','#e8e2d0','#9aa0a6','#c9184a','#3d3d3d','#6b4423'];
function wireCanvasPanel(){
  const sw = $('#garmentSwatches'); sw.className = 'swgrid';
  GARMENTS.forEach(col=>{ const s = document.createElement('div'); s.className = 's'; s.style.background = col; s.title = col; s.addEventListener('click', ()=> MS.setGarment(col, false)); sw.appendChild(s); });
  $('#garmentColorPicker').addEventListener('input', e=> MS.setGarment(e.target.value, false));
  $('#garmentClear').addEventListener('change', e=> MS.setGarment(S.doc.garment, e.target.checked));
  $('#unitSeg').addEventListener('click', e=>{ const b = e.target.closest('button'); if(!b) return; S.doc.unit = b.dataset.u; syncDocPanel(); MS.view.apply(); });
  const apply = ()=>{ const d = S.doc, w = unitToPx(+$('#docW').value, d.unit), h = unitToPx(+$('#docH').value, d.unit); if(w >= 8 && h >= 8) MS.resizeDoc(w, h); };
  $('#docApplySize').addEventListener('click', apply);
  $('#docSwap').addEventListener('click', ()=> MS.resizeDoc(S.doc.hPx, S.doc.wPx));
  const pref = (id, key, inv)=> $('#' + id).addEventListener('change', e=> MS.setPref(key, e.target.checked));
  pref('toggleChecker', 'checker'); pref('toggleGuides', 'centerGuides'); pref('toggleSnap', 'snap'); pref('toggleSmart', 'smart'); pref('toggleRulers', 'rulers'); pref('toggleSafe', 'safe'); pref('toggleGrid', 'grid');
  pref('prefWheelResize', 'wheelResize'); pref('prefStickyTools', 'stickyTools'); pref('prefClampHandles', 'clampHandles');
  $('#gridSize').addEventListener('input', e=> MS.setPref('gridSize', Math.max(2, +e.target.value || 50)));
  $('#safeMargin').addEventListener('input', e=> MS.setPref('safeMargin', Math.max(0, +e.target.value || 0)));
  $('#btnClearGuides').addEventListener('click', MS.clearGuides);
  $('#sbSnap').addEventListener('click', ()=> { MS.setPref('snap', !MS.prefs.snap); syncDocPanel(); });
  $('#sbGrid').addEventListener('click', ()=> { MS.setPref('grid', !MS.prefs.grid); syncDocPanel(); });
  $('#docName').addEventListener('input', e=>{ S.doc.name = e.target.value || 'Untitled design'; MS.updateDocUi(); });
}

/* ============================ LAYERS ============================ */
let layerRaf = 0;
function refreshLayers(){ if(layerRaf) return; layerRaf = requestAnimationFrame(()=>{ layerRaf = 0; paintLayers(); }); }
function thumbOf(o){
  if(o.__thumb) return o.__thumb;
  try{
    const b = o.getBoundingRect(true, true); const mult = Math.min(1, 60 / Math.max(b.width, b.height, 1));
    const tmp = MS.renderThumb(o, mult); o.__thumb = tmp;
  }catch(e){ o.__thumb = ''; }
  return o.__thumb;
}
MS.renderThumb = function(o, mult){
  const c = cv(), objs = c.getObjects(), vis = objs.map(x=>x.visible), keepV = c.viewportTransform.slice(), keepBg = c.backgroundColor, sk = c.skipOffscreen;
  const b = o.getBoundingRect(true, true);
  S.exporting = true;
  try{
    objs.forEach(x=> x.visible = (x === o) ? true : false);
    c.skipOffscreen = false; c.viewportTransform = [1,0,0,1,0,0]; c.backgroundColor = null;
    const el = c.toCanvasElement(Math.max(mult, .02), { left:b.left, top:b.top, width:Math.max(b.width, 1), height:Math.max(b.height, 1) });
    return el.toDataURL('image/png');
  } finally { objs.forEach((x, i)=> x.visible = vis[i]); c.viewportTransform = keepV; c.backgroundColor = keepBg; c.skipOffscreen = sk; c.calcViewportBoundaries(); S.exporting = false; c.requestRenderAll(); }
};
function paintLayers(){
  const c = cv(); if(!c) return;
  const list = $('#layersList'); const sel = new Set(c.getActiveObjects());
  const objs = c.getObjects().slice().reverse();
  if(!objs.length){ list.innerHTML = '<div class="empty-note"><i data-i="layers"></i><div>No layers yet</div><div class="hint">Draw a shape, add text or drop a picture.</div></div>'; window.MSI.hydrate(list); return; }
  list.innerHTML = '';
  objs.forEach(obj=>{
    obj.__layerId = obj.__layerId || MS.uid();
    const row = document.createElement('div'); row.className = 'layer-row' + (sel.has(obj) ? ' selected' : '') + (obj.visible === false ? ' dim' : ''); row.dataset.id = obj.__layerId;
    const kind = obj._isCurvedText ? 'Curved text' : obj.type === 'group' ? 'Group' : obj.type === 'image' ? 'Picture' : isText(obj) ? 'Text' : '';
    const locked = !!obj.lockMovementX;
    row.innerHTML = `<div class="layer-grip" title="Drag to reorder">⠿</div><div class="layer-thumb"><img draggable="false"></div><div class="lname" title="Double-click to rename"></div>${kind ? '<span class="layer-badge">' + kind + '</span>' : ''}
      <button class="lb ${obj.visible === false ? 'off' : ''}" data-a="vis" title="Show / hide">${MS.icon(obj.visible === false ? 'eyeoff' : 'eye')}</button>
      <button class="lb ${locked ? '' : 'off'}" data-a="lock" title="Lock / unlock">${MS.icon(locked ? 'lock' : 'unlock')}</button>`;
    const nm = row.querySelector('.lname'); nm.textContent = obj.name || obj.type;
    const im = row.querySelector('img'); const t = thumbOf(obj); if(t) im.src = t; else im.remove();
    nm.addEventListener('dblclick', e=>{ e.stopPropagation(); nm.contentEditable = 'true'; nm.focus(); document.execCommand('selectAll', false, null); });
    nm.addEventListener('blur', ()=>{ if(nm.contentEditable === 'true'){ nm.contentEditable = 'false'; obj.name = nm.textContent.trim() || obj.type; MS.commit('Rename layer'); } });
    nm.addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); nm.blur(); } e.stopPropagation(); });
    row.addEventListener('click', e=>{
      const a = e.target.closest('[data-a]');
      if(a){
        e.stopPropagation();
        if(a.dataset.a === 'vis'){ obj.visible = obj.visible === false; if(!obj.visible && sel.has(obj)) c.discardActiveObject(); c.requestRenderAll(); MS.commit(obj.visible ? 'Show layer' : 'Hide layer'); }
        else { MS.ops.toggleLock(obj); MS.commit(obj.lockMovementX ? 'Lock layer' : 'Unlock layer'); }
        return;
      }
      if(obj.lockMovementX && !obj.selectable){ toast('This layer is locked — click the padlock to unlock it.'); return; }
      if(MS.S.tool !== 'move') MS.setTool('move');
      if(e.shiftKey || e.ctrlKey || e.metaKey){
        const cur = c.getActiveObjects().filter(o=>o !== obj); if(!sel.has(obj)) cur.push(obj);
        MS.ops.select(cur);
      } else MS.ops.select([obj]);
    });
    row.addEventListener('contextmenu', e=>{ e.preventDefault(); if(!sel.has(obj)) MS.ops.select([obj]); MS.contextMenu(e.clientX, e.clientY); });
    row.querySelector('.layer-grip').addEventListener('mousedown', e=> startLayerDrag(e, obj));
    list.appendChild(row);
  });
}
let ld = null;
function startLayerDrag(e, obj){
  e.preventDefault();
  const list = $('#layersList'), row = $$('.layer-row', list).find(r=> r.dataset.id === obj.__layerId); if(!row) return;
  const ph = document.createElement('div'); ph.className = 'layer-row-placeholder';
  const ghost = row.cloneNode(true); ghost.className = 'layer-row layer-row-ghost'; const rr = row.getBoundingClientRect(); ghost.style.width = rr.width + 'px'; document.body.appendChild(ghost);
  row.parentNode.insertBefore(ph, row); row.style.display = 'none';
  ld = { obj, row, ph, ghost, off:e.clientY - rr.top };
  document.addEventListener('mousemove', onLD); document.addEventListener('mouseup', endLD);
}
function onLD(e){
  if(!ld) return; const lr = $('#layersList').getBoundingClientRect();
  Object.assign(ld.ghost.style, { position:'fixed', left:lr.left + 'px', top:(e.clientY - ld.off) + 'px', width:lr.width + 'px', pointerEvents:'none', zIndex:999, opacity:.92 });
  const rows = $$('.layer-row:not(.layer-row-ghost)', $('#layersList')).filter(r=> r !== ld.row); let placed = false;
  for(const r of rows){ const q = r.getBoundingClientRect(); if(e.clientY < q.top + q.height/2){ r.parentNode.insertBefore(ld.ph, r); placed = true; break; } }
  if(!placed) $('#layersList').appendChild(ld.ph);
  const lst = $('#layersList'); if(e.clientY < lr.top + 20) lst.scrollTop -= 10; else if(e.clientY > lr.bottom - 20) lst.scrollTop += 10;
}
function endLD(){
  if(!ld) return; document.removeEventListener('mousemove', onLD); document.removeEventListener('mouseup', endLD);
  const { obj, row, ph, ghost } = ld; ld = null;
  const order = $$('#layersList > *').filter(el=> (el.classList.contains('layer-row') && el !== row && !el.classList.contains('layer-row-ghost')) || el === ph).map(el=> el === ph ? '__D' : el.dataset.id);
  ph.remove(); ghost.remove(); row.style.display = '';
  const c = cv(), all = c.getObjects(), byId = {}; all.forEach(o=> byId[o.__layerId] = o);
  const front = order.map(id=> id === '__D' ? obj : byId[id]).filter(Boolean);
  if(front.length !== all.length){ refreshLayers(); return; }
  const bg = front.find(o=>o.__isBackground);
  const arr = front.filter(o=>!o.__isBackground).reverse(); if(bg) arr.unshift(bg);
  c.discardActiveObject(); c._objects = arr; c.requestRenderAll(); MS.commit('Reorder layers');
}

/* ============================ HISTORY PANEL ============================ */
function paintHistory(){
  const h = MS.getHistory(), box = $('#historyList'); if(!box) return;
  box.innerHTML = h.list.map((e, i)=> `<div class="hist-row ${i === h.index ? 'current' : ''} ${i > h.index ? 'future' : ''}" data-i="${i}"><span class="n">${i}</span><span>${MS.esc(e.label)}</span></div>`).join('');
  const cur = box.querySelector('.current'); if(cur) cur.scrollIntoView({ block:'nearest' });
  $('#btnUndo').disabled = h.index <= 0; $('#btnRedo').disabled = h.index >= h.list.length - 1;
}

/* ============================ SWATCHES ============================ */
const STOCK = ['#000000','#ffffff','#1a1a1a','#f5f0e6','#c8102e','#e4002b','#ff6a13','#ffb81c','#ffd100','#7ac143','#00843d','#009cde','#0057b8','#003087','#5b2a86','#e5007d','#8b5a2b','#a7a8aa','#54585a','#cfb53b','#b87333','#2b2d42','#ef233c','#06d6a0'];
function paintSwatches(){
  const mk = (el, list)=>{ el.innerHTML = ''; list.forEach(col=>{ const s = document.createElement('div'); s.className = 's'; s.style.background = col; s.title = col; s.addEventListener('click', e=> applySwatch(col, e.shiftKey)); el.appendChild(s); }); };
  mk($('#stockSwatches'), STOCK); mk($('#recentSwatches'), MS.recentColors);
  const cols = new Set(); cv() && cv().getObjects().forEach(o=>{ [o.fill, o.stroke].forEach(f=>{ const h = typeof f === 'string' && MS.colorHex(f); if(h) cols.add(h); }); kids(o).forEach(k=>{ [k.fill, k.stroke].forEach(f=>{ const h = typeof f === 'string' && MS.colorHex(f); if(h) cols.add(h); }); }); });
  mk($('#docSwatches'), [...cols].slice(0, 36));
}
function applySwatch(col, asStroke){
  if(asStroke){ S.stroke = col; S.noStroke = false; } else { S.fill = col; S.noFill = false; }
  const a = cv().getActiveObject();
  if(a){ eachObj(o=>{ if(o.type === 'image') return; if(isText(o) && o._isCurvedText && !asStroke) o._curveStyle.fill = col; o.set(asStroke ? 'stroke' : 'fill', col); if(asStroke && !o.strokeWidth) o.set('strokeWidth', S.strokeW || 2); }); done(asStroke ? 'Stroke colour' : 'Fill colour', true); }
  MS.noteColor(col); MS.tools.syncSwatches(); MS.tools.renderOptions();
}

/* ============================ INIT ============================ */
MS.initPanels = function(){
  wireProps(); wireFill(); wireCanvasPanel(); wireBgTab();
  MS.on('selection', syncProps); MS.on('layers', refreshLayers); MS.on('history', paintHistory); MS.on('doc', syncDocPanel);
  MS.on('layers', ()=>{ clearTimeout(paintSwatches._t); paintSwatches._t = setTimeout(paintSwatches, 300); }); MS.on('swatches', paintSwatches);
  $('#historyList').addEventListener('click', e=>{ const r = e.target.closest('.hist-row'); if(r) MS.jumpHistory(+r.dataset.i); });
  $('#lyAddText').addEventListener('click', ()=> MS.tools.addText({})); $('#lyDup').addEventListener('click', MS.ops.duplicate); $('#lyGroup').addEventListener('click', MS.ops.group);
  $('#lyDel').addEventListener('click', MS.ops.del); $('#lyMerge').addEventListener('click', MS.ops.flatten);
  $('#btnUndo').addEventListener('click', MS.undo); $('#btnRedo').addEventListener('click', MS.redo);
  syncDocPanel(); paintHistory(); paintSwatches(); refreshLayers();
};
MS.syncProps = syncProps; MS.syncDocPanel = syncDocPanel;
})();

