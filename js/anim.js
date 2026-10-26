/* Imagination Studio 3.0 - animation: timeline, keyframes, one-click motion effects, seamless loops and GIF export.
   An animated element has a TRACK: keyframes (position / scale / rotation / opacity / glow) plus EFFECTS (procedural motion laid on top:
   pulse, bounce, spin ... and entrances / exits). Loop effects use whole cycles per loop, so they repeat perfectly. */
(function(){
'use strict';
const MS = window.MS, S = MS.S;
const { $, $$, esc, clamp, toast } = MS;
const cv = ()=> MS.canvas;
const A = S.anim = { on:false, dur:2, fps:12, loop:true, pingpong:false, autokey:true, t:0, tracks:{}, sel:null, playing:false };
let mid = null, idN = 0, raf = 0, last = 0, dirT = 1, snap = null, bar = null;
const TAU = Math.PI * 2, frac = v=> v - Math.floor(v);

/* ---------------- easing ---------------- */
const EASE = {
  linear:u=> u, easeIn:u=> u * u * u, easeOut:u=> 1 - Math.pow(1 - u, 3), easeInOut:u=> u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2,
  back:u=>{ const c = 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); },
  bounce:u=>{ const n = 7.5625, d = 2.75; if(u < 1 / d) return n * u * u; if(u < 2 / d) return n * (u -= 1.5 / d) * u + .75; if(u < 2.5 / d) return n * (u -= 2.25 / d) * u + .9375; return n * (u -= 2.625 / d) * u + .984375; },
  elastic:u=> u === 0 ? 0 : u === 1 ? 1 : Math.pow(2, -10 * u) * Math.sin((u * 10 - .75) * (TAU / 3)) + 1,
  hold:u=> u < 1 ? 0 : 1,
};
const EASE_NAMES = [['linear', 'Linear'], ['easeInOut', 'Smooth'], ['easeIn', 'Ease in'], ['easeOut', 'Ease out'], ['back', 'Overshoot'], ['bounce', 'Bounce'], ['elastic', 'Elastic'], ['hold', 'Hold']];

/* ---------------- poses ---------------- */
const idOf = o=> o.__animId || (o.__animId = 'a' + Date.now().toString(36) + (idN++));
const glowOf = o=> (o.__fx && o.__fx.stack && o.__fx.stack.glow && o.__fx.stack.glow.on) ? o.__fx.stack.glow : null;
const sizeOf = o=>{ const b = o.getBoundingRect(true, true); return Math.max(b.width, b.height, 20); };
function pose(o){ const c = o.getCenterPoint(), g = glowOf(o); return { x:+c.x.toFixed(2), y:+c.y.toFixed(2), sx:+o.scaleX.toFixed(5), sy:+o.scaleY.toFixed(5), a:+(o.angle || 0).toFixed(3), op:o.opacity === undefined ? 1 : o.opacity, gl:g ? g.bright : null }; }
function applyPose(o, p){
  o.set({ scaleX:p.sx, scaleY:p.sy, angle:p.a, opacity:clamp(p.op, 0, 1) });
  o.setPositionByOrigin(new fabric.Point(p.x, p.y), 'center', 'center'); o.setCoords();
  if(p.gl !== null && p.gl !== undefined){ const g = glowOf(o); if(g) g.bright = Math.max(0, p.gl); }
  o.dirty = true;
}
const objs = ()=> cv().getObjects().filter(o=> !o.__isBackground);
function byId(id){ return objs().find(o=> o.__animId === id); }
function trackOf(o, make){ const id = idOf(o); let tr = A.tracks[id]; if(!tr && make){ tr = A.tracks[id] = { keys:[{ t:0, p:pose(o), e:'easeInOut' }], fx:[] }; } return tr; }

/* ---------------- motion effects ---------------- */
// loop effects: f(u, a, ctx) with u = 0..1 within one cycle, a = amount 0..1.   once effects: f(p, a, ctx), p = 0..1 across start..start+len
const LOOPFX = {
  pulse:{ label:'Pulse', f:(u, a, c)=>{ c.s *= 1 + a * .4 * Math.sin(TAU * u); } },
  heartbeat:{ label:'Heartbeat', f:(u, a, c)=>{ const e = (u < .15 ? Math.sin(Math.PI * u / .15) : 0) + (u >= .25 && u < .4 ? .7 * Math.sin(Math.PI * (u - .25) / .15) : 0); c.s *= 1 + a * .5 * e; } },
  bounce:{ label:'Bounce', f:(u, a, c)=>{ c.dy -= Math.abs(Math.sin(Math.PI * u)) * a * c.L * .6; } },
  float:{ label:'Float', f:(u, a, c)=>{ c.dy += Math.sin(TAU * u) * a * c.L * .12; c.dx += Math.sin(2 * TAU * u) * a * c.L * .04; } },
  wiggle:{ label:'Wiggle', f:(u, a, c)=>{ c.da += a * 25 * Math.sin(TAU * u); } },
  swing:{ label:'Swing', f:(u, a, c)=>{ c.da += a * 18 * (Math.sin(TAU * u) + .5 * Math.sin(2 * TAU * u)); } },
  shake:{ label:'Shake', f:(u, a, c)=>{ c.dx += a * c.L * .04 * Math.sin(TAU * 9 * u); c.dy += a * c.L * .02 * Math.sin(TAU * 13 * u + 1); } },
  squash:{ label:'Squash & stretch', f:(u, a, c)=>{ const k = a * .25 * Math.sin(TAU * u); c.sx *= 1 + k; c.sy *= 1 - k; } },
  orbit:{ label:'Orbit', f:(u, a, c)=>{ c.dx += Math.cos(TAU * u) * a * c.L * .3; c.dy += Math.sin(TAU * u) * a * c.L * .3; } },
  glowpulse:{ label:'Glow pulse', f:(u, a, c)=>{ c.gl *= Math.max(0, 1 + a * 1.2 * Math.sin(TAU * u)); } },
  flicker:{ label:'Flicker', f:(u, a, c)=>{ c.op *= 1 - a * .8 * Math.abs(Math.sin(TAU * 7 * u) * Math.sin(TAU * 11 * u + .7)); } },
  blink:{ label:'Blink', f:(u, a, c)=>{ if(u >= .5) c.op *= 1 - a; } },
};
const spinFx = { label:'Spin' };
const ONCEFX = {
  fadeIn:{ label:'Fade in', kind:'in', f:(p, a, c)=>{ c.op *= EASE.easeOut(p); } },
  fadeOut:{ label:'Fade out', kind:'out', f:(p, a, c)=>{ c.op *= 1 - EASE.easeIn(p); } },
  popIn:{ label:'Pop in', kind:'in', f:(p, a, c)=>{ c.s *= Math.max(0, EASE.back(p)); } },
  zoomIn:{ label:'Zoom in', kind:'in', f:(p, a, c)=>{ const e = EASE.easeOut(p); c.s *= .2 + .8 * e; c.op *= e; } },
  zoomOut:{ label:'Zoom out', kind:'out', f:(p, a, c)=>{ const e = EASE.easeIn(p); c.s *= 1 - .8 * e; c.op *= 1 - e; } },
  slideIn:{ label:'Slide in', kind:'in', dir:true, f:(p, a, c, fx)=>{ const e = 1 - EASE.easeOut(p), d = c.W * .6 * a * 2; slide(c, fx.dir, e * d); } },
  slideOut:{ label:'Slide out', kind:'out', dir:true, f:(p, a, c, fx)=>{ const e = EASE.easeIn(p), d = c.W * .6 * a * 2; slide(c, fx.dir, e * d); } },
  dropIn:{ label:'Drop in', kind:'in', f:(p, a, c)=>{ c.dy -= (1 - EASE.bounce(p)) * c.H * .5 * a * 2; } },
  gather:{ label:'Fly together', kind:'in', f:(p, a, c, fx)=>{ const e = 1 - EASE.easeOut(p), ang = (fx.seed || 0) * TAU; c.dx += Math.cos(ang) * c.W * a * 1.4 * e; c.dy += Math.sin(ang) * c.H * a * 1.4 * e; c.da += ((fx.seed || 0) - .5) * 360 * e; c.s *= 1 - .4 * e; c.op *= Math.min(1, p * 4); } },
  scatter:{ label:'Fly apart', kind:'out', f:(p, a, c, fx)=>{ const e = EASE.easeIn(p), ang = (fx.seed || 0) * TAU; c.dx += Math.cos(ang) * c.W * a * 1.4 * e; c.dy += Math.sin(ang) * c.H * a * 1.4 * e; c.da += ((fx.seed || 0) - .5) * 360 * e; c.s *= 1 - .4 * e; c.op *= 1 - Math.min(1, p * 1.5); } },
  fontMorph:{ label:'Morph font & shape', kind:'in', text:true, f:()=>{} },   // handled by the morph renderer below: the letters melt from another font into the current one
};
function slide(c, dir, d){ if(dir === 'r') c.dx += d; else if(dir === 'u') c.dy -= d; else if(dir === 'd') c.dy += d; else c.dx -= d; }
const FXLIST = Object.assign({ spin:spinFx }, LOOPFX, ONCEFX);

// recorded slider moves: fx.auto = { amount:[{t,v}...], morph:[{t,v}...] } - straight lines between the recorded points
function autoAt(fx, k, t){
  const p = fx.auto && fx.auto[k]; if(!p || !p.length) return undefined;
  if(t <= p[0].t) return p[0].v; const l = p[p.length - 1]; if(t >= l.t) return l.v;
  let i = 0; while(i < p.length - 2 && t > p[i + 1].t) i++; const a = p[i], b = p[i + 1]; return a.v + (b.v - a.v) * (t - a.t) / Math.max(1e-6, b.t - a.t);
}
const ampAt = (fx, t)=>{ const v = autoAt(fx, 'amount', t); return (v === undefined ? (fx.amount === undefined ? 50 : fx.amount) : v) / 100; };

// the keyframe path alone (no motion effects)
function baseAt(tr, t, o){
  const ks = tr.keys; let p;
  if(!ks.length) return pose(o);
  if(t <= ks[0].t) p = Object.assign({}, ks[0].p);
  else if(t >= ks[ks.length - 1].t) p = Object.assign({}, ks[ks.length - 1].p);
  else {
    let i = 0; while(i < ks.length - 2 && t > ks[i + 1].t) i++;
    const k0 = ks[i], k1 = ks[i + 1], u = (EASE[k0.e] || EASE.linear)((t - k0.t) / Math.max(1e-6, k1.t - k0.t));
    p = {}; ['x', 'y', 'sx', 'sy', 'a', 'op'].forEach(k=> p[k] = k0.p[k] + (k1.p[k] - k0.p[k]) * u);
    p.gl = k0.p.gl === null || k0.p.gl === undefined ? null : k0.p.gl + ((k1.p.gl === null ? k0.p.gl : k1.p.gl) - k0.p.gl) * u;
  }
  return p;
}
// what the motion effects add on top at time t. Loop effects are measured against their own value at t = 0, so the element
// starts exactly on its rest pose; entrance / exit effects are not (they start hidden / off-screen on purpose).
function fxAt(tr, t, o){
  if(!tr.fx || !tr.fx.length) return null;
  const L = sizeOf(o), mk = ()=> ({ dx:0, dy:0, da:0, s:1, sx:1, sy:1, op:1, gl:1, L, W:S.doc.wPx, H:S.doc.hPx }), c = mk(), c0 = mk();
  const loop = (cc, tt, fx, a)=>{
    // a loop effect plays only inside its window [start, start+len]; outside it holds its start value (zero change), and whole cycles keep it seamless
    const st = fx.start || 0, ln = Math.max(.05, fx.len || (A.dur - st)), w = clamp(tt, st, st + ln), k = (fx.cycles || 1) * (w - st) / ln + (fx.phase || 0);
    if(fx.type === 'spin'){ cc.da += 360 * (fx.dir === 'ccw' ? -1 : 1) * k; return; }
    LOOPFX[fx.type].f(frac(k), a, cc, fx);
  };
  tr.fx.forEach(fx=>{
    const a = ampAt(fx, t), a0 = ampAt(fx, 0);
    if(fx.type === 'spin' || LOOPFX[fx.type]){ loop(c, t, fx, a); loop(c0, 0, fx, a0); return; }
    const d = ONCEFX[fx.type]; if(d) d.f(clamp((t - (fx.start || 0)) / Math.max(.01, fx.len || .5), 0, 1), a, c, fx);
  });
  const ratio = (n, d)=> Math.abs(d) < 1e-6 ? n : n / d;
  return { dx:c.dx - c0.dx, dy:c.dy - c0.dy, da:c.da - c0.da, ms:ratio(c.s * c.sx, c0.s * c0.sx), mt:ratio(c.s * c.sy, c0.s * c0.sy), mo:ratio(c.op, c0.op), mg:ratio(c.gl, c0.gl) };
}
function evalTrack(tr, t, o){
  const p = baseAt(tr, t, o), d = fxAt(tr, t, o); if(!d) return p;
  p.x += d.dx; p.y += d.dy; p.a += d.da; p.sx *= d.ms; p.sy *= d.mt; p.op *= d.mo; if(p.gl !== null && p.gl !== undefined) p.gl *= d.mg;
  return p;
}
// the element on screen = keyframes + effects. When we record a keyframe from what is on screen, take the effects back out,
// otherwise they would be counted twice and the element jumps.
function basePoseOf(o, t){
  const p = pose(o), tr = A.tracks[o.__animId], d = tr && fxAt(tr, t === undefined ? A.t : t, o); if(!d) return p;
  p.x -= d.dx; p.y -= d.dy; p.a -= d.da; p.sx = Math.abs(d.ms) < 1e-6 ? p.sx : p.sx / d.ms; p.sy = Math.abs(d.mt) < 1e-6 ? p.sy : p.sy / d.mt; p.op = Math.abs(d.mo) < 1e-6 ? p.op : p.op / d.mo; if(p.gl !== null && p.gl !== undefined && Math.abs(d.mg) > 1e-6) p.gl /= d.mg;
  return p;
}
function applyAt(t){
  A.t = t;
  Object.keys(A.tracks).forEach(id=>{ const o = byId(id); if(o){ applyPose(o, evalTrack(A.tracks[id], t, o)); morphAt(o, A.tracks[id], t); } });
  cv().requestRenderAll();
}
const frameT = t=> Math.round(t * 100) / 100;          // times move in the smallest step: 0.01 s

/* ---------------- morph: text melts from another font into its own font (shape + stroke + shadow); warped shapes grow into their warp ---------------- */
const letters = o=> o && o._isCurvedText && o._objects ? o._objects.filter(c=> /text/.test(c.type || '')) : [];          // curved / laid-out text is a group of single letters
const canMorph = o=> !!o && ((MS.isTextObj(o) && !o._isCurvedText) || !!o._warp || letters(o).length > 0);
const fontOf = o=> !o ? S.font : o._isCurvedText ? ((o._curveStyle || {}).fontFamily || S.font) : (o.fontFamily || S.font);
function defaultFrom(o){ const d = (S.font || 'Montserrat'); return d !== fontOf(o) ? d : 'Abril Fatface'; }
function flatten(cmds){
  const cs = []; let cur = null, x = 0, y = 0;
  cmds.forEach(c=>{
    if(c.type === 'M'){ if(cur && cur.length > 2) cs.push(cur); cur = [{ x:c.x, y:c.y }]; x = c.x; y = c.y; }
    else if(!cur) return;
    else if(c.type === 'L'){ cur.push({ x:c.x, y:c.y }); x = c.x; y = c.y; }
    else if(c.type === 'C'){ for(let i = 1; i <= 10; i++){ const u = i / 10, v = 1 - u; cur.push({ x:v * v * v * x + 3 * v * v * u * c.x1 + 3 * v * u * u * c.x2 + u * u * u * c.x, y:v * v * v * y + 3 * v * v * u * c.y1 + 3 * v * u * u * c.y2 + u * u * u * c.y }); } x = c.x; y = c.y; }
    else if(c.type === 'Q'){ for(let i = 1; i <= 8; i++){ const u = i / 8, v = 1 - u; cur.push({ x:v * v * x + 2 * v * u * c.x1 + u * u * c.x, y:v * v * y + 2 * v * u * c.y1 + u * u * c.y }); } x = c.x; y = c.y; }
    else if(c.type === 'Z'){ if(cur.length > 2) cs.push(cur); cur = null; }
  });
  if(cur && cur.length > 2) cs.push(cur); return cs;
}
const areaOf = p=>{ let s = 0; for(let i = 0; i < p.length; i++){ const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; } return s / 2; };
const centroidOf = p=>{ let x = 0, y = 0; p.forEach(q=>{ x += q.x; y += q.y; }); return { x:x / p.length, y:y / p.length }; };
function resample(p, N){
  const n = p.length, L = [0]; for(let i = 0; i < n; i++){ const a = p[i], b = p[(i + 1) % n]; L.push(L[i] + Math.hypot(b.x - a.x, b.y - a.y)); }
  const tot = L[n] || 1e-6, out = []; let k = 0;
  for(let i = 0; i < N; i++){ const d = tot * i / N; while(k < n - 1 && L[k + 1] < d) k++; const a = p[k], b = p[(k + 1) % n], f = (d - L[k]) / (L[k + 1] - L[k] || 1e-6); out.push({ x:a.x + (b.x - a.x) * f, y:a.y + (b.y - a.y) * f }); }
  return out;
}
const MN = 64;
function matchContour(fa, ta){
  let A = resample(fa, MN); const B = resample(ta, MN); if(areaOf(fa) * areaOf(ta) < 0) A.reverse();
  let best = 0, bd = 1e18; for(let s = 0; s < MN; s++){ let d = 0; for(let i = 0; i < MN; i += 2){ const a = A[(i + s) % MN], b = B[i]; d += (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y); } if(d < bd){ bd = d; best = s; } }
  return [A.map((_, i)=> A[(i + best) % MN]), B];
}
function pairContours(from, to){
  const byArea = l=> l.slice().sort((a, b)=> Math.abs(areaOf(b)) - Math.abs(areaOf(a))), F = byArea(from), T = byArea(to), out = [];
  const dot = c=>{ const p = centroidOf(c); return Array.from({ length:MN }, ()=> ({ x:p.x, y:p.y })); };
  for(let i = 0; i < Math.max(F.length, T.length); i++){
    if(F[i] && T[i]) out.push(matchContour(F[i], T[i])); else if(T[i]) out.push([dot(T[i]), resample(T[i], MN)]); else out.push([resample(F[i], MN), dot(F[i])]);
  }
  return out;
}
async function buildMorph(o, fx){
  const bold = o.fontWeight === 'bold' || +o.fontWeight >= 600, toF = await MS.loadFont(o.fontFamily, bold), frF = await MS.loadFont(fx.from || defaultFrom(o), bold);
  if(!toF || !frF) throw new Error('Morph needs the bundled fonts — "' + (!toF ? o.fontFamily : fx.from) + '" is a system font.');
  o.initDimensions && o.initDimensions();
  const fs = o.fontSize, w = o.width, h = o.height, lines = o._textLines || [], cb = o.__charBounds || [], glyphs = []; let lh = 0;
  for(let i = 0; i < lines.length; i++){
    const hol = o.getHeightOfLine(i), maxH = hol / o.lineHeight, base = -h / 2 + lh + maxH - hol * (o._fontSizeFraction || .222) / o.lineHeight, lo = o._getLineLeftOffset(i), chars = lines[i] || [];
    let fw = 0; chars.forEach(ch=>{ fw += frF.getAdvanceWidth(ch, fs); });
    let fx0 = -w / 2 + lo + (o.getLineWidth ? o.getLineWidth(i) : fw) / 2 - fw / 2;
    chars.forEach((ch, j)=>{ const b = cb[i] && cb[i][j];
      if(b && ch !== ' ' && ch !== '\n'){ const g = pairContours(flatten(frF.getPath(ch, fx0, base, fs).commands), flatten(toF.getPath(ch, -w / 2 + lo + b.left, base, fs).commands)); if(g.length) glyphs.push(g); }
      fx0 += frF.getAdvanceWidth(ch, fs); });
    lh += hol;
  }
  return { glyphs, ready:true };
}
function morphPath(m, u){
  const p = new Path2D();
  m.glyphs.forEach(g=> g.forEach(([A, B])=>{ for(let i = 0; i < MN; i++){ const a = A[i], b = B[i], x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u; if(i) p.lineTo(x, y); else p.moveTo(x, y); } p.closePath(); }));
  return p;
}
const textRender = fabric.Text.prototype._render;
fabric.Text.prototype._render = function(ctx){
  const m = this.__morph;
  if(this.__morphU != null && m && m.ready){
    const path = morphPath(m, this.__morphU), f = this.fill; ctx.save();
    ctx.fillStyle = typeof f === 'string' ? f : (f && f.toLive ? f.toLive(ctx, this) : '#000'); ctx.fill(path, 'evenodd');
    if(this.stroke && this.strokeWidth){ ctx.lineWidth = this.strokeWidth; ctx.strokeStyle = this.stroke; ctx.lineJoin = 'round'; ctx.stroke(path); }
    ctx.restore(); return;
  }
  textRender.call(this, ctx);
};
const polyRender = fabric.Polygon.prototype._render;
fabric.Polygon.prototype._render = function(ctx){
  if(this.__morphU != null && this._warp && this.__morphPts){ const sp = this.points; this.points = this.__morphPts; try{ polyRender.call(this, ctx); } finally { this.points = sp; } }
  else polyRender.call(this, ctx);
};
function endMorph(o){ endOne(o); letters(o).forEach(endOne); o.dirty = true; }
function endOne(o){
  if(o.__mBase){ o.strokeWidth = o.__mBase.sw; if(o.shadow && o.__mBase.sh){ o.shadow.blur = o.__mBase.sh.b; o.shadow.offsetX = o.__mBase.sh.x; o.shadow.offsetY = o.__mBase.sh.y; } delete o.__mBase; }
  if(o.__morphU != null){ o.__morphU = null; o.__morphPts = null; o.dirty = true; }
}
function ensureMorph(o, fx){
  const key = [o.text, o.fontFamily, fx.from, o.fontSize, o.charSpacing, o.width, o.fontWeight, o.lineHeight].join('|');
  if(o.__morphKey === key) return o.__morphP; o.__morph = null; o.__morphKey = key;
  o.__morphP = buildMorph(o, fx).then(m=>{ if(o.__morphKey === key){ o.__morph = m; cv().requestRenderAll(); } }).catch(e=>{ if(!ensureMorph.told){ ensureMorph.told = true; setTimeout(()=>{ ensureMorph.told = false; }, 6000); toast(e.message + ' Pick a bundled font for the morph.', 6000, 'err'); } });
  return o.__morphP;
}
function morphAt(o, tr, t){
  const fx = tr.fx && tr.fx.find(f=> f.type === 'fontMorph');
  if(!fx){ if(o.__morphU != null || o.__mBase) endMorph(o); return; }
  const st = fx.start || 0, ln = Math.max(.05, fx.len || 1.2), p = clamp((t - st) / ln, 0, 1), rec = autoAt(fx, 'morph', t), u = rec !== undefined ? clamp(rec / 100, 0, 1) : EASE.easeInOut(p);
  if(rec === undefined ? p >= 1 : u >= 1){ endMorph(o); return; }
  if(MS.isTextObj(o) && !o._isCurvedText){
    ensureMorph(o, fx); o.__morphU = u;
    if(!o.__mBase) o.__mBase = { sw:o.strokeWidth || 0, sh:o.shadow ? { b:o.shadow.blur, x:o.shadow.offsetX, y:o.shadow.offsetY } : null };
    o.strokeWidth = o.__mBase.sw * u; if(o.shadow && o.__mBase.sh){ o.shadow.blur = o.__mBase.sh.b * u; o.shadow.offsetX = o.__mBase.sh.x * u; o.shadow.offsetY = o.__mBase.sh.y * u; }
  } else if(letters(o).length){ letters(o).forEach(c=>{ ensureMorph(c, fx); c.__morphU = u; c.dirty = true; });
  } else if(o._warp && MS.shapeWarp && MS.shapeWarp.morphPoints){ o.__morphU = u; o.__morphPts = MS.shapeWarp.morphPoints(o, u); }
  o.dirty = true;
}
async function prepMorphs(){
  const ps = []; Object.keys(A.tracks).forEach(id=>{ const o = byId(id), fx = o && A.tracks[id].fx.find(f=> f.type === 'fontMorph'); if(fx){ if(MS.isTextObj(o) && !o._isCurvedText) ps.push(ensureMorph(o, fx)); else letters(o).forEach(c=> ps.push(ensureMorph(c, fx))); } });
  await Promise.all(ps);
}


/* ---------------- track editing ---------------- */
function addKey(o, t, p){
  const tr = trackOf(o, true); t = clamp(frameT(t), 0, A.dur);
  const ex = tr.keys.find(k=> Math.abs(k.t - t) < .5 / A.fps); if(ex){ ex.p = p || basePoseOf(o, t); return ex; }
  const k = { t, p:p || basePoseOf(o, t), e:'easeInOut' }; tr.keys.push(k); tr.keys.sort((a, b)=> a.t - b.t); return k;
}
function addEffect(o, type, opt, idx, n){
  const tr = trackOf(o, true), def = FXLIST[type]; if(!def) return;
  const fx = Object.assign({ type, amount:50, cycles:1 }, opt);
  if(LOOPFX[type] || type === 'spin') fx.phase = ((opt.stagger || 0) / 100) * (idx / Math.max(1, n));
  else { fx.len = fx.len || ({ fontMorph:1.2, gather:1, scatter:1 })[type] || .6; if(type === 'gather' || type === 'scatter') fx.seed = frac(objs().indexOf(o) * .6180339 + .13); if(type === 'fontMorph') fx.from = opt.from || defaultFrom(o); fx.start = (def.kind === 'out' ? Math.max(0, A.dur - fx.len) : 0) + ((opt.stagger || 0) / 100) * A.dur * .5 * (idx / Math.max(1, n)); if(def.dir) fx.dir = opt.dir || 'l'; }
  delete fx.stagger; if(type === 'spin') fx.dir = opt.dir || 'cw';
  if(type === 'glowpulse' && !glowOf(o)){ o.__fx = Object.assign({}, o.__fx); o.__fx.stack = Object.assign({}, o.__fx.stack, { glow:{ on:true, color:'#ffd24a', size:Math.max(8, Math.round(sizeOf(o) * .08)), bright:100 } }); tr.keys.forEach(k=>{ if(k.p.gl === null || k.p.gl === undefined) k.p.gl = 100; }); }
  tr.fx.push(fx); return fx;
}
// make every track loop perfectly: last key = first key, whole cycles
function makeLoop(){
  let n = 0;
  Object.keys(A.tracks).forEach(id=>{
    const tr = A.tracks[id], o = byId(id); if(!o) return; tr.keys.sort((a, b)=> a.t - b.t);
    tr.keys = tr.keys.filter(k=> k.t <= A.dur + 1e-6); if(!tr.keys.length) return;
    if(tr.keys[0].t > 0) tr.keys.unshift({ t:0, p:Object.assign({}, tr.keys[0].p), e:'easeInOut' });
    const first = tr.keys[0], lastK = tr.keys[tr.keys.length - 1];
    if(Math.abs(lastK.t - A.dur) < 1e-6 && lastK !== first) lastK.p = Object.assign({}, first.p); else if(lastK.t < A.dur - 1e-6 && tr.keys.length > 1) tr.keys.push({ t:A.dur, p:Object.assign({}, first.p), e:'easeInOut' });
    tr.fx.forEach(fx=>{ if(LOOPFX[fx.type] || fx.type === 'spin') fx.cycles = Math.max(1, Math.round(fx.cycles || 1)); }); n++;
  });
  return n;
}
function loopStatus(){
  let bad = 0, total = 0;
  Object.keys(A.tracks).forEach(id=>{
    const tr = A.tracks[id]; if(!byId(id)) return; total++; const ks = tr.keys;
    let ok = true; if(ks.length > 1){ const f = ks[0].p, l = ks[ks.length - 1].p; ok = Math.abs(ks[ks.length - 1].t - A.dur) < 1e-3 && ['x', 'y', 'sx', 'sy', 'a', 'op'].every(k=> Math.abs(f[k] - l[k]) < .01 * (k === 'x' || k === 'y' ? 10 : 1)); }
    if(tr.fx.some(fx=> (LOOPFX[fx.type] || fx.type === 'spin') && Math.abs((fx.cycles || 1) - Math.round(fx.cycles || 1)) > 1e-6)) ok = false;
    if(!ok) bad++;
  });
  return { total, bad };
}

/* ---------------- playback ---------------- */
function tick(now){
  if(!A.playing) return; const dt = Math.min(.1, (now - last) / 1000); last = now;
  let t = A.t + dt * dirT;
  if(A.pv && A.pv.loop && t >= A.pv.to) t = A.pv.from;
  if(A.pv && t >= A.pv.to){ A.pv = null; A.playing = false; applyAt(Math.min(t, A.dur)); paintHead(); lockCanvas(false); syncTransport(); return; }
  if(A.pingpong){ if(t >= A.dur){ t = A.dur; dirT = -1; } else if(t <= 0){ t = 0; dirT = 1; } }
  else if(t >= A.dur){ if(A.loop) t = t % A.dur; else { t = A.dur; A.playing = false; } }
  applyAt(t); paintHead(); if(A.playing) raf = requestAnimationFrame(tick); else { lockCanvas(false); syncTransport(); }
}
let lockSave = null;
function lockCanvas(on){ if(!on && A.reselect){ const r = A.reselect.filter(o=> o.canvas); A.reselect = null; if(r.length) setTimeout(()=>{ const c = cv(); c.setActiveObject(r.length > 1 ? new fabric.ActiveSelection(r, { canvas:c }) : r[0]); c.requestRenderAll(); MS.emitSelection && MS.emitSelection(); }, 0); } const c = cv(); if(on){ lockSave = { sel:c.selection, skip:c.skipTargetFind }; c.discardActiveObject(); c.selection = false; c.skipTargetFind = true; } else if(lockSave){ c.selection = lockSave.sel; c.skipTargetFind = lockSave.skip; lockSave = null; } c.requestRenderAll(); }
function play(){ if(A.playing) return; if(!Object.keys(A.tracks).length){ toast('Nothing is animated yet — pick something and click an effect, or add keyframes.', 4000); return; } lockCanvas(true); A.pv = null; A.playing = true; dirT = 1; if(!A.loop && !A.pingpong && A.t >= A.dur) A.t = 0; last = performance.now(); raf = requestAnimationFrame(tick); syncTransport(); }
function stop(){ A.pv = null; A.playing = false; cancelAnimationFrame(raf); lockCanvas(false); syncTransport(); }

/* ---------------- GIF encoder (animated: one shared palette, ordered dither; frames are rendered and packed one at a time so big GIFs never run out of memory) ---------------- */
function ByteBuf(){ this.a = new Uint8Array(1 << 16); this.n = 0; }
ByteBuf.prototype.push = function(){ for(let i = 0; i < arguments.length; i++) this.put(arguments[i]); };
ByteBuf.prototype.put = function(v){ if(this.n >= this.a.length){ const b = new Uint8Array(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = v; };
ByteBuf.prototype.w16 = function(v){ this.put(v & 255); this.put((v >> 8) & 255); };
ByteBuf.prototype.blob = function(){ return new Blob([this.a.subarray(0, this.n)], { type:'image/gif' }); };

// histogram + median-cut palette from a few sample frames (index 0 is reserved for "transparent")
function buildPalette(samples, want){
  const hist = new Uint32Array(32768);
  samples.forEach(d=>{ const n = d.length / 4, step = Math.max(1, Math.floor(n * samples.length / 600000)); for(let i = 0; i < n; i += step){ const p = i * 4; if(d[p + 3] >= 128) hist[((d[p] >> 3) << 10) | ((d[p + 1] >> 3) << 5) | (d[p + 2] >> 3)]++; } });
  const bins = []; for(let k = 0; k < 32768; k++) if(hist[k]) bins.push(k);
  const chan = (k, ch)=> ch === 0 ? (k >> 10) & 31 : ch === 1 ? (k >> 5) & 31 : k & 31;
  let boxes = [bins.length ? bins : [0]];
  while(boxes.length < want){
    let bi = -1, best = -1, bc = 0;
    boxes.forEach((b, i)=>{ if(b.length < 2) return; for(let ch = 0; ch < 3; ch++){ let lo = 31, hi = 0; b.forEach(k=>{ const v = chan(k, ch); if(v < lo) lo = v; if(v > hi) hi = v; }); const sp = (hi - lo) * (b.length > 6 ? 1 : .5); if(sp > best){ best = sp; bi = i; bc = ch; } } });
    if(bi < 0 || best <= 0) break;
    const b = boxes[bi].slice().sort((x, y)=> chan(x, bc) - chan(y, bc)); let tot = 0; b.forEach(k=> tot += hist[k]); let acc = 0, cut = 1;
    for(let i = 0; i < b.length - 1; i++){ acc += hist[b[i]]; cut = i + 1; if(acc >= tot / 2) break; }
    boxes.splice(bi, 1, b.slice(0, cut), b.slice(cut));
  }
  return [[0, 0, 0]].concat(boxes.map(b=>{ let r = 0, g = 0, bl = 0, t = 0; b.forEach(k=>{ const c = hist[k] || 1; r += chan(k, 0) * c; g += chan(k, 1) * c; bl += chan(k, 2) * c; t += c; }); return [Math.min(255, Math.round(r / t * 8 + 4)), Math.min(255, Math.round(g / t * 8 + 4)), Math.min(255, Math.round(bl / t * 8 + 4))]; }));
}
const pause = ()=> new Promise(r=> setTimeout(r, 0));

/* renders one frame at time t into a canvas of width o.width (the artboard scaled down) */
function renderOne(t, o){
  const d = S.doc, mult = o.width / d.wPx; applyAt(t);
  const el = MS.renderArtboard({ multiplier:mult, background:o.bg || null });
  const w = Math.max(1, Math.round(d.wPx * mult)), h = Math.max(1, Math.round(d.hPx * mult));
  if(el.width === w && el.height === h) return el;
  const cc = document.createElement('canvas'); cc.width = w; cc.height = h; cc.getContext('2d').drawImage(el, 0, 0, w, h); return cc;
}
const pixelsOf = c=> c.getContext('2d', { willReadFrequently:true }).getImageData(0, 0, c.width, c.height).data;

function frameTimes(delayCs){
  const fps = 100 / delayCs, N = Math.max(2, Math.round(A.dur * fps)), ts = [];
  for(let i = 0; i < N; i++) ts.push(i / fps);
  if(A.pingpong){ for(let i = N - 2; i >= 1; i--) ts.push(i / fps); }
  return ts;
}

/* the whole job: o = { width, delay (1/100 s), bg (css colour or null), colors, dither, loops } -> Blob.  progress(done, total, label) */
async function makeGif(o, progress){
  const keepT = A.t, ts = frameTimes(o.delay), N = ts.length, rep = progress || (()=>{}); cv().discardActiveObject(); await prepMorphs();
  try{
    // pass 1: a handful of frames spread over the whole animation decide the palette
    const nS = Math.min(N, 10), samples = []; let w = 0, h = 0;
    for(let k = 0; k < nS; k++){ const c = renderOne(ts[Math.round(k * (N - 1) / Math.max(1, nS - 1))], o); w = c.width; h = c.height; samples.push(pixelsOf(c)); rep(k + 1, nS + N, 'Choosing colours…'); await pause(); }
    const pal = buildPalette(samples, Math.min(255, (o.colors || 256) - 1)); samples.length = 0;
    const count = pal.length; while(pal.length < 256) pal.push([0, 0, 0]);
    const cache = new Int16Array(32768).fill(-1);
    const nearest = (r, g, b)=>{ const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3); if(cache[key] >= 0) return cache[key]; let bi = 1, bd = 1e9; for(let i = 1; i < count; i++){ const p = pal[i], dd = (p[0] - r) * (p[0] - r) + (p[1] - g) * (p[1] - g) + (p[2] - b) * (p[2] - b); if(dd < bd){ bd = dd; bi = i; } } cache[key] = bi; return bi; };
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], amp = o.dither ? 14 : 0, transparent = !o.bg, px = w * h;
    const out = new ByteBuf();
    out.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61); out.w16(w); out.w16(h); out.push(0xF7, 0, 0); pal.forEach(p=> out.push(p[0], p[1], p[2]));
    if(o.loops !== 1) out.push(0x21, 0xFF, 0x0B, 0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30, 3, 1, (o.loops || 0) & 255, ((o.loops || 0) >> 8) & 255, 0);
    // pass 2: render, colour-reduce and pack each frame, then forget it
    let prev = null;
    for(let fi = 0; fi < N; fi++){
      const d = pixelsOf(renderOne(ts[fi], o)), idx = new Uint8Array(px);
      for(let i = 0; i < px; i++){ const p = i * 4; if(d[p + 3] < 128){ idx[i] = 0; continue; } let r = d[p], g = d[p + 1], b = d[p + 2]; if(amp){ const t = (bayer[((i / w | 0) & 3) * 4 + ((i % w) & 3)] - 7.5) * amp / 8; r = clamp(r + t, 0, 255); g = clamp(g + t, 0, 255); b = clamp(b + t, 0, 255); } idx[i] = nearest(r | 0, g | 0, b | 0); }
      let x0 = 0, y0 = 0, x1 = w - 1, y1 = h - 1, sub = idx; const disposal = transparent ? 2 : 1;
      if(!transparent && prev){        // only the part that changed
        let mnx = w, mny = h, mxx = -1, mxy = -1; for(let y = 0; y < h; y++) for(let x = 0; x < w; x++) if(idx[y * w + x] !== prev[y * w + x]){ if(x < mnx) mnx = x; if(x > mxx) mxx = x; if(y < mny) mny = y; if(y > mxy) mxy = y; }
        if(mxx < 0){ mnx = mny = 0; mxx = mxy = 0; }
        x0 = mnx; y0 = mny; x1 = mxx; y1 = mxy; const sw = x1 - x0 + 1, sh = y1 - y0 + 1; sub = new Uint8Array(sw * sh);
        for(let y = 0; y < sh; y++) for(let x = 0; x < sw; x++){ const i = (y + y0) * w + x + x0; sub[y * sw + x] = idx[i] === prev[i] ? 0 : idx[i]; }
      }
      prev = idx; const sw = x1 - x0 + 1, sh = y1 - y0 + 1, delay = o.delay || 8;
      out.push(0x21, 0xF9, 4, (disposal << 2) | 1, delay & 255, (delay >> 8) & 255, 0, 0);
      out.push(0x2C); out.w16(x0); out.w16(y0); out.w16(sw); out.w16(sh); out.push(0, 8);
      const CLEAR = 256, EOI = 257; let codeSize = 9, nextCode = 258, dict = new Map(), bitBuf = 0, bitCnt = 0; const bytes = new ByteBuf(), m = sw * sh;
      const emit = code=>{ bitBuf |= code << bitCnt; bitCnt += codeSize; while(bitCnt >= 8){ bytes.put(bitBuf & 255); bitBuf >>>= 8; bitCnt -= 8; } };
      emit(CLEAR); let prefix = sub[0];
      for(let i = 1; i < m; i++){ const k = sub[i], key = prefix * 256 + k, found = dict.get(key); if(found !== undefined){ prefix = found; continue; } emit(prefix);
        if(nextCode < 4096){ dict.set(key, nextCode++); if(nextCode - 1 === (1 << codeSize) && codeSize < 12) codeSize++; } else { emit(CLEAR); dict = new Map(); nextCode = 258; codeSize = 9; } prefix = k; }
      emit(prefix); emit(EOI); if(bitCnt > 0) bytes.put(bitBuf & 255);
      for(let i = 0; i < bytes.n; i += 255){ const len = Math.min(255, bytes.n - i); out.put(len); for(let j = 0; j < len; j++) out.put(bytes.a[i + j]); } out.put(0);
      rep(nS + fi + 1, nS + N, 'Frame ' + (fi + 1) + ' of ' + N); await pause();
    }
    out.put(0x3B); return out.blob();
  } finally { applyAt(keepT); }
}

// whole-animation frames as canvases (used for the "frames as PNG" ZIP only)
async function renderFrames(o, progress){
  const keepT = A.t, frames = [], ts = frameTimes(o.delay); cv().discardActiveObject(); await prepMorphs();
  try{ for(let i = 0; i < ts.length; i++){ const c = renderOne(ts[i], o), cc = document.createElement('canvas'); cc.width = c.width; cc.height = c.height; cc.getContext('2d').drawImage(c, 0, 0); frames.push(cc); progress && progress(i + 1, ts.length); if(i % 3 === 2) await pause(); } }
  finally { applyAt(keepT); }
  return frames;
}

/* ---------------- export dialog: three plain choices; the rest tucked under "More options" ---------------- */
const fmtMB = b=> b / 1024 / 1024 < 1 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
// a moving preview of the saved GIF - Windows Photos and Explorer only ever show the first frame of a GIF
function showGif(blob, name, msg){
  const url = URL.createObjectURL(blob), body = document.createElement('div');
  body.innerHTML = `<div style="display:grid;place-items:center;padding:8px;background:repeating-conic-gradient(#2a2e38 0 25%,#222630 0 50%) 0 0/16px 16px;border-radius:8px"><img src="${url}" alt="" style="max-width:100%;max-height:46vh"></div>
    <div class="hint" style="margin-top:8px">This is the saved GIF playing. <b>It is animated</b> — but the Windows <b>Photos</b> app and File Explorer previews only show the first frame of any GIF. To see it move outside Imagination Studio, open the file in Chrome / Edge / Firefox (or drag it onto a browser window), or use it on a web page, chat or email.</div><div class="hint">${esc(name)} — ${esc(msg)}</div>`;
  MS.modal({ title:'Your GIF', body, med:true, onClose:()=> setTimeout(()=> URL.revokeObjectURL(url), 500), buttons:[{ spacer:true }, { label:'Open in a browser tab', icon:'export', keepOpen:true, action:()=>{ window.open(url, '_blank'); return false; } }, { label:'Done', primary:true }] });
}
function openExport(quick){
  stop(); if(!Object.keys(A.tracks).length){ toast('Animate something first — click an element, then click a motion.', 4000); return; }
  const d = S.doc, def = { width:Math.min(480, d.wPx), fps:12, colors:256, dither:true, loops:0, bg:'transparent' }, saved = Object.assign(def, MS.store.get('gifopt', {}));
  saved.width = clamp(+saved.width || def.width, 16, 2000);
  const sizes = [['Small', 240], ['Medium', 480], ['Large', 720], ['Extra large', 1080]].filter(([l, w], i, arr)=> w < d.wPx || (i === 0 || arr[i - 1][1] < d.wPx)).map(([l, w])=> [w >= d.wPx ? 'Full size' : l, Math.min(w, Math.max(16, d.wPx))]);
  const body = document.createElement('div');
  body.innerHTML = `<div class="r"><label>Size</label><div class="seg grow" id="gxSize">${sizes.map(([l, w])=> `<button data-w="${w}" class="${w === saved.width ? 'active' : ''}">${l}<small>${w}px</small></button>`).join('')}</div></div>
    <div class="r"><label>Background</label><div class="seg grow" id="gxBgSeg">${[['transparent', 'Transparent'], ['#ffffff', 'White'], ['#000000', 'Black']].map(([v, l])=> `<button data-bg="${v}" class="${v === saved.bg ? 'active' : ''}">${l}</button>`).join('')}</div></div>
    <div class="r"><label>Smoothness</label><div class="seg grow" id="gxFpsSeg">${[[10, 'Small file'], [15, 'Normal'], [25, 'Smooth']].map(([f, l])=> `<button data-fps="${f}" class="${f === saved.fps || (f === 15 && ![10, 25].includes(saved.fps)) ? 'active' : ''}">${l}<small>${f} fps</small></button>`).join('')}</div></div>
    <details class="gx-more"><summary>More options</summary>
      <div class="r"><label>Custom width</label><div class="f" style="width:96px"><input type="number" id="gxW" min="16" max="2000" value="${saved.width}"><em>px</em></div><span class="hint" id="gxH"></span></div>
      <div class="r"><label>Colours</label><select id="gxCol" class="grow">${[256, 128, 64, 32].map(c=> `<option ${c === saved.colors ? 'selected' : ''}>${c}</option>`).join('')}</select><label class="chk"><input type="checkbox" id="gxDith" ${saved.dither ? 'checked' : ''}> Smooth gradients</label></div>
      <div class="r"><label>Plays</label><select id="gxLoops" class="grow">${[[0, 'Forever'], [1, 'Once'], [3, '3 times']].map(([v, l])=> `<option value="${v}" ${v === saved.loops ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    </details>
    <div class="hint" id="gxInfo"></div><div class="gx-bar"><i id="gxProg"></i></div>`;
  const g = id=> $('#' + id, body);
  const get = ()=>{ const on = (sel, at)=> { const b = $(sel + '.active', body); return b ? b.dataset[at] : null; };
    return { width:clamp(+g('gxW').value || 480, 16, 2000), fps:+(on('#gxFpsSeg button', 'fps') || 15), colors:+g('gxCol').value, dither:g('gxDith').checked, loops:+g('gxLoops').value, bg:on('#gxBgSeg button', 'bg') || 'transparent' }; };
  let working = false;
  const api = MS.modal({ title:'Save animated GIF', body, med:true, sticky:true, buttons:[{ spacer:true, id:'gxMsg' }, { label:'Cancel' }, { label:'Save GIF', primary:true, icon:'export', keepOpen:true, id:'gxGo', action:async (m, btn)=>{
    if(working) return false; working = true;
    const opt = get(); MS.store.set('gifopt', opt); btn.disabled = true; opt.delay = Math.max(2, Math.round(100 / opt.fps)); $$('button,input,select', body).forEach(e=> e.disabled = true);
    const msgEl = $('#gxMsg'), done = ()=>{ working = false; btn.disabled = false; $$('button,input,select', body).forEach(e=> e.disabled = false); };
    try{
      if(A.loop && !A.pingpong && loopStatus().bad){ makeLoop(); renderRows(); }       // so the GIF repeats with no jump
      const blob = await makeGif({ width:opt.width, delay:opt.delay, bg:opt.bg === 'transparent' ? null : opt.bg, colors:opt.colors, dither:opt.dither, loops:opt.loops }, (i, n, label)=>{ g('gxProg').style.width = (i / n * 96) + '%'; msgEl.textContent = label; });
      g('gxProg').style.width = '100%'; msgEl.textContent = 'Saving…';
      const name = (S.doc.name || 'animation').replace(/[\\/:*?"<>|]+/g, '_') + '.gif', msg = await MS.saveFile(blob, name);
      toast('GIF ' + msg + ' (' + fmtMB(blob.size) + ')', 8000); api.close(); showGif(blob, name, msg);
    }catch(e){ console.error(e); toast('Could not make the GIF: ' + (e && e.message || e) + ' — try the Small size.', 8000, 'err'); msgEl.textContent = ''; g('gxProg').style.width = '0'; done(); }
    return false;
  } }] });
  const upd = ()=>{ const o = get(), h = Math.round(o.width * d.hPx / d.wPx), n = frameTimes(Math.max(2, Math.round(100 / o.fps))).length, est = o.width * h * n * .1 / 1048576;
    g('gxH').textContent = '× ' + h + ' px'; g('gxInfo').textContent = n + ' frames · ' + A.dur + ' s' + (A.pingpong ? ' (back and forth)' : '') + ' · about ' + (est < .1 ? 'under 0.1' : est.toFixed(1)) + ' MB'; };
  $$('.seg', body).forEach(sg=> sg.addEventListener('click', e=>{ const b = e.target.closest('button'); if(!b) return; $$('button', sg).forEach(x=> x.classList.toggle('active', x === b)); if(b.dataset.w) g('gxW').value = b.dataset.w; upd(); }));
  g('gxW').addEventListener('input', ()=>{ $$('#gxSize button', body).forEach(b=> b.classList.toggle('active', +b.dataset.w === +g('gxW').value)); upd(); });
  $$('select,input', body).forEach(e=> e.addEventListener('input', upd)); upd();
  if(quick === true){ const go = $('#gxGo'); go && go.click(); }
}
async function exportFrames(){
  stop(); const o = { width:Math.min(S.doc.wPx, 1080), delay:Math.max(2, Math.round(100 / A.fps)) }; toast('Rendering frames…', 2000);
  const frames = await renderFrames(o), zip = new JSZip(), name = (S.doc.name || 'animation').replace(/[\\/:*?"<>|]+/g, '_');
  for(let i = 0; i < frames.length; i++){ const b = await new Promise(r=> frames[i].toBlob(r, 'image/png')); zip.file(name + '-' + String(i + 1).padStart(3, '0') + '.png', b); }
  const msg = await MS.saveFile(await zip.generateAsync({ type:'blob' }), name + '-frames.zip'); toast('Frames ' + msg, 6000);
}

/* ---------------- the timeline panel ---------------- */
function build(){
  bar = document.createElement('div'); bar.id = 'animBar'; bar.style.display = 'none';
  bar.innerHTML = `<div class="an-top"><div class="an-tr"><button class="ib an-start" data-tip="Back to start">${MS.icon('rotate')}</button><button class="btn sm primary an-play">${MS.icon('play')}<span>Play</span></button><span class="an-time">0.00 / 2.00 s</span></div>
      <span class="hint">Timeline — click the ruler to scrub · drag diamonds to retime · all controls are in the <b>Animate</b> tab on the right</span>
      <div class="an-act"><span class="an-badge"></span><button class="ib" id="anClose" data-tip="Collapse the timeline|Ctrl+Shift+A">${MS.icon('chevd')}</button></div></div>
    <div class="an-main"><div class="an-rows" id="anRows"></div></div>
    <div class="an-foot"><div class="an-tr"><button class="btn sm primary an-play">${MS.icon('play')}<span>Play</span></button><button class="btn sm an-start">${MS.icon('rotate')}Start</button><span class="an-time">0.00 / 2.00 s</span></div><label class="chk" data-tip="Click an effect bar and it plays on repeat so you can watch it while you tune it"><input type="checkbox" id="anLoopSel" checked> Loop the selected effect</label><span class="an-badge"></span></div>`;
  $('#center').insertBefore(bar, $('#statusbar'));
  const tab = document.createElement('button'); tab.className = 'dock-tab'; tab.dataset.page = 'anim'; tab.innerHTML = MS.icon('play') + 'Animate'; tab.addEventListener('click', ()=> MS.showPage('anim'));
  $('#tabsTop').insertBefore(tab, $('#tabsTop .dock-tab[data-page="claude"]'));
  const pg = document.createElement('div'); pg.className = 'dock-page hidden'; pg.id = 'page-anim';
  pg.innerHTML = `<div class="sect"><div class="sect-b" style="padding-top:12px">
      <div class="an-tr"><button class="btn sm primary an-play">${MS.icon('play')}<span>Play</span></button><button class="btn sm an-start">${MS.icon('rotate')}Start</button><span class="an-time">0.00 / 2.00 s</span></div>
      <div class="an-badge"></div>
      <div class="an-steps" id="anSteps"><div class="an-step" data-s="1"><b>1</b><span>Click an element on the canvas</span></div><div class="an-step" data-s="2"><b>2</b><span>Click a motion below — it plays at once</span></div><div class="an-step" data-s="3"><b>3</b><span>Save it as a GIF</span></div></div>
      <button class="btn an-big" id="anHide2" data-tip="Hide the timeline so you can edit the design (animation is kept)|Ctrl+Shift+A">${MS.icon('x')}<span>Hide timeline — edit design</span></button>
      <button class="btn primary an-big" id="anGif">${MS.icon('export')}<span>Save as GIF…</span></button></div></div>
    <div class="sect"><div class="sect-h" style="cursor:default">Pick a motion</div><div class="sect-b"><div class="an-chips" id="anChips"></div><div class="r"><label>Stagger</label><input type="range" id="anStag" min="0" max="100" value="0"><div class="f"><input type="number" id="anStagN" min="0" max="100" value="0"></div></div><div class="hint">Each effect you add shows its own settings under "On the selected element" — add several to stack them. Stagger only matters when you pick more than one element.</div></div></div>
    <div class="sect"><div class="sect-h" style="cursor:default">On the selected element</div><div class="sect-b"><div id="anOnEl"></div><div class="hint">Changes play back straight away. Removing an animation puts the element back exactly where it was — it never deletes the element.</div></div></div>
    <details class="an-adv sect"><summary>More controls <span>speed, length, keyframes, loop</span></summary>
      <div class="sect-b" style="padding-top:8px"><div class="r"><label>Length</label><div class="f" style="width:84px"><input type="number" id="anDur" min=".5" max="60" step=".1" value="2"><em>s</em></div><label>FPS</label><select id="anFps"><option>10</option><option selected>12</option><option>15</option><option>20</option><option>25</option><option>30</option></select></div>
      <label class="chk"><input type="checkbox" id="anLoop" checked> Loop playback</label><label class="chk"><input type="checkbox" id="anPing"> Ping-pong (forward, then back)</label>
      <button class="btn sm" id="anLoopFix" data-tip="Make the last frame match the first so it repeats with no jump (Save as GIF does this for you)">Make seamless loop</button></div>
    <div class="sect"><div class="sect-h" style="cursor:default">Keyframes</div><div class="sect-b">
      <div class="r"><button class="btn sm" id="anAddKey">◆ Add key at playhead</button><button class="btn sm" id="anDel">Delete selected</button></div>
      <div class="r"><label>Easing</label><select id="anEase" class="grow">${EASE_NAMES.map(([k, l])=> `<option value="${k}">${l}</option>`).join('')}</select></div>
      <div class="r"><label>Key time</label><div class="f" style="width:84px"><input type="number" id="anKeyT" min="0" step=".01" value="0"><em>s</em></div></div>
      <label class="chk"><input type="checkbox" id="anAuto" checked> Auto-key: record moves, scales and rotations</label></div></div>
    <div class="sect"><div class="sect-b"><button class="btn sm" id="anSnapTab" data-tip="Save a PNG picture of the frame at the playhead">${MS.icon('image')}Save this frame as a PNG</button><button class="btn sm" id="anFrames" data-tip="Every frame as a PNG in a ZIP">Save frames (ZIP)</button></div></div>
    </details>`;
  $('#dockTop .dock-pages').appendChild(pg); window.MSI.hydrate(pg); window.MSI.hydrate(bar);
  const q = id=> $('#' + id);
  $$('.an-play').forEach(b=> b.onclick = ()=> A.playing ? stop() : play()); $$('.an-start').forEach(b=> b.onclick = ()=>{ stop(); setT(0); });
  q('anClose').onclick = ()=> collapse(true); q('anHide2').onclick = ()=> collapse(true); q('anGif').onclick = openExport; q('anFrames').onclick = exportFrames;
  q('anDur').oninput = e=>{ A.dur = clamp(+e.target.value || 2, .5, 60); A.t = Math.min(A.t, A.dur); renderRows(); };
  q('anFps').onchange = e=>{ A.fps = +e.target.value; renderRows(); };
  q('anLoopSel').onchange = e=>{ A.loopSel = e.target.checked; if(!A.loopSel && A.pv && A.pv.loop) stop(); }; A.loopSel = true; q('anLoop').onchange = e=>{ A.loop = e.target.checked; }; q('anPing').onchange = e=>{ A.pingpong = e.target.checked; }; q('anAuto').onchange = e=>{ A.autokey = e.target.checked; };
  q('anLoopFix').onclick = ()=>{ const n = makeLoop(); renderRows(); setT(A.t); toast(n ? 'Loop is now seamless — the last frame matches the first.' : 'Nothing to loop yet.', 3500); };
  q('anAddKey').onclick = keyHere; q('anSnapTab').onclick = snapshot;
  q('anOnEl').addEventListener('click', e=>{ const b = e.target.closest('[data-rm]'); if(!b) return; const [kind, id, i] = b.dataset.rm.split('|'); if(kind === 'fx') removeFx(id, +i); else if(kind === 'keys') clearKeys(id); else removeTrack(id); });
  // a camera button on the edge of the drawing area
  const cam = document.createElement('button'); cam.id = 'anSnapBtn'; cam.className = 'ib'; cam.dataset.tip = 'Add a keyframe here: records the selected element as it is now at this time  (or click the mouse wheel)'; cam.innerHTML = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.6-2.4h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.2" r="3.6"/></svg>'; cam.onclick = keyHere; $('#vp').appendChild(cam);
  const pill = document.createElement('button'); pill.id = 'anPill'; pill.className = 'ib'; pill.style.display = 'none'; pill.innerHTML = MS.icon('chevd'); pill.dataset.tip = 'Bring the timeline back|Ctrl+Shift+A'; pill.onclick = ()=> collapse(false); $('#vp').appendChild(pill);
  const flash = document.createElement('div'); flash.id = 'anFlash'; $('#vp').appendChild(flash);
  [['anStag', 'anStagN']].forEach(([r, n])=>{ q(r).oninput = ()=>{ q(n).value = q(r).value; }; q(n).oninput = ()=>{ q(r).value = q(n).value; }; });
  wireCards();
  q('anEase').onchange = ()=>{ const s = A.sel; if(s && s.kind === 'key'){ const k = A.tracks[s.id] && A.tracks[s.id].keys[s.i]; if(k){ k.e = q('anEase').value; applyAt(A.t); } } };
  q('anKeyT').onchange = ()=>{ const s = A.sel; if(s && s.kind === 'key'){ const tr = A.tracks[s.id], k = tr && tr.keys[s.i]; if(k){ k.t = clamp(frameT(+q('anKeyT').value || 0), 0, A.dur); tr.keys.sort((a, b)=> a.t - b.t); A.sel.i = tr.keys.indexOf(k); renderRows(); applyAt(A.t); } } };
  q('anDel').onclick = delSelected;
  q('anChips').innerHTML = '<div class="an-g">Loop</div>' + Object.keys(LOOPFX).concat(['spin']).map(k=> `<span class="chip" data-fx="${k}">${FXLIST[k].label}</span>`).join('') + '<div class="an-g">Text &amp; shape</div><span class="chip" data-fx="fontMorph" data-tip="Letters melt from another font into the text’s own font; warped shapes grow into their warp. Has a Morph slider you can record.">' + ONCEFX.fontMorph.label + '</span>' + '<div class="an-g">Entrance / exit</div>' + Object.keys(ONCEFX).filter(k=> k !== 'fontMorph').map(k=> `<span class="chip" data-fx="${k}">${ONCEFX[k].label}</span>`).join('');
  q('anChips').onclick = e=>{ const c = e.target.closest('.chip'); if(c) applyPreset(c.dataset.fx); };
  document.addEventListener('keydown', e=>{ if(!A.on) return; if((e.key === 'Delete' || e.key === 'Backspace') && A.sel && !/input|textarea|select/i.test((e.target.tagName || ''))){ e.preventDefault(); e.stopImmediatePropagation(); delSelected(); } }, true);
  document.addEventListener('mousedown', e=>{ if(A.on && e.button === 1 && e.target.closest('#vp')){ mid = { x:e.clientX, y:e.clientY, t:Date.now() }; e.preventDefault(); } }, true);
  document.addEventListener('mouseup', e=>{ if(!mid || e.button !== 1) return; const m = mid; mid = null; if(A.on && Math.hypot(e.clientX - m.x, e.clientY - m.y) < 5 && Date.now() - m.t < 500){ e.preventDefault(); keyHere(); } }, true);
  MS.on('page', p=>{ if(p === 'anim' && !A.on) toggle(true); else if(p === 'anim' && A.collapsed) collapse(false); });
}
function targets(){ return cv().getActiveObjects().filter(o=> !o.__isBackground); }
function applyPreset(type){
  const t = targets(); if(!t.length){ toast('Select an element on the canvas first.', 3000); return; }
  cv().discardActiveObject(); stop(); const q = id=> $('#' + id), opt = { amount:50, cycles:1, stagger:+q('anStag').value, dir:'l' };
  if(type === 'spin') opt.dir = 'cw'; if(type === 'fontMorph'){ if(!t.every(canMorph)){ toast('Morph works on text and on warped shapes (Warp shape panel).', 4500); return; } } const keep = A.t; applyAt(0);
  t.forEach((o, i)=> addEffect(o, type, opt, i, t.length)); A.sel = null; renderRows(); setT(0); const made = t.map(o=> A.tracks[o.__animId].fx[A.tracks[o.__animId].fx.length - 1]).filter(Boolean).map(fxWin); const a0 = Math.max(0, Math.min(...made.map(w=> w.st)) - .1), b0 = Math.min(A.dur, Math.max(...made.map(w=> w.st + w.ln)) + .15);
  (type === 'fontMorph' ? prepMorphs() : Promise.resolve()).then(()=>{ previewRange(a0, b0); A.reselect = t; });   // plays once, then stops with the element selected again
  MS.commit && MS.commit('Animate ' + FXLIST[type].label.toLowerCase());
}
function keyHere(){ let t = targets(); if(!t.length) t = objs().filter(o=> A.tracks[o.__animId]); if(!t.length){ toast('Click an element first, then add a keyframe.', 3000); return; } cv().discardActiveObject(); t.forEach(o=> addKey(o, A.t)); cv().setActiveObject(t.length > 1 ? new fabric.ActiveSelection(t, { canvas:cv() }) : t[0]); renderRows(); const fl = $('#anFlash'); if(fl){ fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go'); } toast('Keyframe added at ' + A.t.toFixed(2) + ' s — now move / scale / rotate the element at other times.', 4000); }
function delSelected(){
  const s = A.sel; if(!s) { toast('Click a keyframe or an effect bar first.', 2500); return; } const tr = A.tracks[s.id]; if(!tr) return;
  if(s.kind === 'key'){ if(tr.keys.length <= 1){ toast('A track needs at least one keyframe — delete its effects or the whole row instead.', 3500); return; } tr.keys.splice(s.i, 1); }
  else if(s.kind === 'fx'){ removeFx(s.id, s.i); return; } else if(s.kind === 'track'){ removeTrack(s.id); return; }
  A.sel = null; renderRows(); applyAt(A.t);
}
// taking animation away puts the element back on its rest pose (the first keyframe) — it is never deleted
function removeTrack(id){
  const tr = A.tracks[id], o = byId(id); if(tr && o && tr.keys[0]){ applyPose(o, tr.keys[0].p); }
  delete A.tracks[id]; A.sel = null; cv().requestRenderAll(); renderRows(); toast('Animation removed — the element is back where it started.', 3000);
}
function removeFx(id, i){
  const tr = A.tracks[id]; if(!tr) return; tr.fx.splice(i, 1); A.sel = null;
  if(!tr.fx.length && tr.keys.length <= 1){ removeTrack(id); return; }
  applyAt(A.t); renderRows();
}
function clearKeys(id){ const tr = A.tracks[id], o = byId(id); if(!tr) return; const first = tr.keys[0]; tr.keys = first ? [first] : []; A.sel = null; if(!tr.fx.length) { removeTrack(id); return; } applyAt(A.t); renderRows(); }
/* per-effect settings: every effect on the selected element has its own card, so effects stack and each one is tuned on its own */
let onSig = '', focusIds = [];
const cardTargets = ()=>{ const t = targets(); if(t.length){ focusIds = t.map(o=> idOf(o)); return t; } return focusIds.map(byId).filter(Boolean); };
const armed = new Set();
const CAPS = t=>({ amount:!!LOOPFX[t] || ['slideIn', 'slideOut', 'dropIn', 'gather', 'scatter'].includes(t), cycles:!!LOOPFX[t] || t === 'spin', dir:t === 'slideIn' || t === 'slideOut', spin:t === 'spin', from:t === 'fontMorph' });
const fxWin = fx=>{ const once = !!ONCEFX[fx.type], st = fx.start || 0; return { st, ln:fx.len || (once ? .6 : A.dur - st) }; };
function cardRow(label, k, min, max, step){ const s = step ? ` step="${step}"` : ''; return `<div class="r"><label>${label}</label><input type="range" data-k="${k}" min="${min}" max="${max}"${s}><div class="f"><input type="number" data-k="${k}" min="${min}" max="${max}"${s}></div></div>`; }
const fontBtn = (k, name)=> `<button class="font-btn grow" data-fb="${k}" style="height:26px;min-width:0"><span class="fp" style="font-family:'${esc(name)}'">${esc(name)}</span><i data-i="chevd"></i></button>`;
function onElement(){
  const box = $('#anOnEl'); if(!box) return; const list = cardTargets().filter(o=> A.tracks[o.__animId]);
  if(!list.length){ if(onSig !== 'none'){ box.innerHTML = '<div class="hint">Select an animated element to see and tune each of its effects.</div>'; onSig = 'none'; } return; }
  const sig = list.map(o=> o.__animId + ':' + A.tracks[o.__animId].fx.map(f=> f.type).join(',') + ':' + A.tracks[o.__animId].keys.length).join('|') + '#' + (A.sel && A.sel.kind === 'fx' ? A.sel.id + A.sel.i : '');
  if(sig !== onSig){
    onSig = sig;
    box.innerHTML = list.map(o=>{ const id = o.__animId, tr = A.tracks[id];
      return `<div class="an-el"><div class="an-eh"><b>${esc(o.name || o.type)}</b><button class="btn sm" data-rm="track|${id}" data-tip="Remove all animation from this element">Remove all</button></div>`
      + tr.fx.map((fx, i)=>{ const c = CAPS(fx.type), on = A.sel && A.sel.kind === 'fx' && A.sel.id === id && A.sel.i === i;
        return `<div class="an-fxc ${on ? 'on' : ''}" data-id="${id}" data-i="${i}"><div class="an-er"><b>${esc(FXLIST[fx.type].label)}</b><span class="an-recs"><button class="rec" data-rec="${id}|${i}" data-tip="Record: while this is red, every slider move you make is written onto the timeline at the playhead. Press Play and move the slider, or scrub to a time and set it.">● Rec</button><button class="btn sm" data-recclear="${id}|${i}" style="display:none" data-tip="Delete the recorded slider moves of this effect">Clear rec</button><button class="x" data-rm="fx|${id}|${i}" title="Remove this effect">×</button></span></div>`
          + (c.from ? cardRow('Morph', 'morph', 0, 100) : '') + (c.amount ? cardRow('Amount', 'amount', 0, 100) : '') + (c.cycles ? cardRow('Cycles', 'cycles', 1, 8) : '')
          + (c.dir ? '<div class="r"><label>Slide from</label><select data-k="dir" class="grow"><option value="l">Left</option><option value="r">Right</option><option value="u">Top</option><option value="d">Bottom</option></select></div>' : '')
          + (c.spin ? '<div class="r"><label>Direction</label><select data-k="dir" class="grow"><option value="cw">Clockwise</option><option value="ccw">Anticlockwise</option></select></div>' : '')
          + (c.from ? `<div class="r"><label>Start font</label>${fontBtn('from', fx.from || defaultFrom(o))}</div><div class="r"><label>End font</label>${fontBtn('to', fontOf(o))}</div>` : '')
          + cardRow('Start', 'start', 0, A.dur, .01) + cardRow('Length', 'len', .05, A.dur, .01) + '</div>'; }).join('')
      + (tr.keys.length > 1 ? `<div class="an-er"><span>${tr.keys.length} keyframes</span><button class="x" data-rm="keys|${id}" title="Remove the keyframes">×</button></div>` : '') + (!tr.fx.length && tr.keys.length <= 1 ? '<div class="hint">No effects yet.</div>' : '') + '</div>'; }).join('') + '<datalist id="anFonts"></datalist>';
    window.MSI && window.MSI.hydrate && window.MSI.hydrate(box);
  }
  syncCards(box);
}
// copy the real values into the cards (never touches the box being typed in)
function syncCards(box){
  box = box || $('#anOnEl'); if(!box) return;
  $$('.an-fxc', box).forEach(card=>{ const tr = A.tracks[card.dataset.id], fx = tr && tr.fx[+card.dataset.i]; if(!fx) return; const w = fxWin(fx);
    $$('[data-fb]', card).forEach(b=>{ const o = byId(card.dataset.id), n = b.dataset.fb === 'from' ? (fx.from || defaultFrom(o || {})) : fontOf(o), sp = b.querySelector('.fp'); if(sp && sp.textContent !== n){ sp.textContent = n; sp.style.fontFamily = "'" + n + "'"; } });
    $$('[data-k]', card).forEach(el=>{ if(el === document.activeElement) return; const k = el.dataset.k; if(k === 'start' || k === 'len') el.max = A.dur;
      el.value = k === 'morph' ? Math.round(autoAt(fx, 'morph', A.t) !== undefined ? autoAt(fx, 'morph', A.t) : 100 * clamp((A.t - (fx.start || 0)) / Math.max(.05, fx.len || 1.2), 0, 1)) : k === 'amount' ? Math.round(ampAt(fx, A.t) * 100) : k === 'cycles' ? (fx.cycles || 1) : k === 'start' ? w.st.toFixed(2) : k === 'len' ? w.ln.toFixed(2) : k === 'dir' ? (fx.dir || (fx.type === 'spin' ? 'cw' : 'l')) : (fx.from || ''); });
  });
  $$('[data-rec]', box).forEach(b=>{ const on = armed.has(b.dataset.rec); b.classList.toggle('on', on); b.closest('.an-fxc').classList.toggle('armed', on); });
  $$('[data-recclear]', box).forEach(b=>{ const [id, i] = b.dataset.recclear.split('|'), fx = A.tracks[id] && A.tracks[id].fx[+i]; b.style.display = fx && fx.auto && Object.keys(fx.auto).some(k=> fx.auto[k].length) ? '' : 'none'; });
  MS.syncRanges(box);
}
// play just this effect's window once, so every tweak is seen working
function previewFx(fx){ const w = fxWin(fx); previewRange(Math.max(0, w.st - .1), Math.min(A.dur, w.st + w.ln + .15)); }
function previewRange(a, b, loop){ stop(); lockCanvas(true); A.pv = { to:b, from:a, loop:!!loop }; A.t = a; A.playing = true; dirT = 1; last = performance.now(); raf = requestAnimationFrame(tick); syncTransport(); }
function recordPoint(fx, k, v){
  fx.auto = fx.auto || {}; const arr = fx.auto[k] = fx.auto[k] || [];
  if(!arr.length) arr.push({ t:0, v:k === 'amount' ? (fx.amount === undefined ? 50 : fx.amount) : 0 });
  const t = clamp(frameT(A.t), 0, A.dur), near = arr.find(p=> Math.abs(p.t - t) < .03);
  if(near) near.v = v; else { arr.push({ t, v }); arr.sort((x, y)=> x.t - y.t); }
  if(k === 'amount') fx.amount = v;
  if(!A.playing) applyAt(A.t);
  if(!recordPoint.q){ recordPoint.q = requestAnimationFrame(()=>{ recordPoint.q = 0; renderRows(); }); }
}
function wireCards(){
  const box = $('#anOnEl'), fxOf = el=>{ const card = el.closest('.an-fxc'); if(!card) return null; const tr = A.tracks[card.dataset.id]; return tr && tr.fx[+card.dataset.i] ? { fx:tr.fx[+card.dataset.i], card, id:card.dataset.id, i:+card.dataset.i } : null; };
  box.addEventListener('input', e=>{
    const el = e.target.closest('[data-k]'), h = el && fxOf(el); if(!h) return; const k = el.dataset.k, fx = h.fx;
    if(k === 'dir' || k === 'from') return;                       // applied on change
    let v = +el.value; if(!isFinite(v)) return;
    if(k === 'amount' || k === 'morph'){
      const key = h.id + '|' + h.i, has = fx.auto && fx.auto[k] && fx.auto[k].length;
      if(armed.has(key) || has){ $$('[data-k="' + k + '"]', h.card).forEach(x=>{ if(x !== el) x.value = el.value; }); recordPoint(fx, k, clamp(v, 0, 100)); return; }       // goes onto the timeline; playback keeps running
      if(k === 'morph'){ const o = byId(h.id); stop(); if(o){ ensureMorph(o, fx); o.__morphU = clamp(v / 100, 0, 1); o.dirty = true; cv().requestRenderAll(); } $$('[data-k="morph"]', h.card).forEach(x=>{ if(x !== el) x.value = el.value; }); return; }   // just a look: drag to see the morph
    }
    stop(); const minL = Math.max(.05, 1 / A.fps);
    if(k === 'start'){ fx.start = clamp(Math.round(v * 100) / 100, 0, Math.max(0, A.dur - minL)); if(fx.len) fx.len = Math.min(fx.len, A.dur - fx.start); }
    else if(k === 'len') fx.len = clamp(Math.round(v * 100) / 100, minL, A.dur - (fx.start || 0));
    else if(k === 'cycles') fx.cycles = clamp(Math.round(v), 1, 8); else fx[k] = clamp(v, 0, 100);
    $$('[data-k="' + k + '"]', h.card).forEach(x=>{ if(x !== el) x.value = el.value; });
    const w = fxWin(fx), here = A.t >= w.st && A.t <= w.st + w.ln, loop = !ONCEFX[fx.type];
    applyAt(here ? A.t : clamp(w.st + w.ln * (loop ? .25 / (fx.cycles || 1) : .5), 0, A.dur)); paintHead(); MS.syncRanges(box);
    renderRows();
  });
  box.addEventListener('click', e=>{
    const fb = e.target.closest('[data-fb]');
    if(fb){ const h = fxOf(fb), o = h && byId(h.id); if(!o) return; const which = fb.dataset.fb; const pick = n=>{
        if(which === 'from'){ h.fx.from = n; prepMorphs().then(()=> previewFx(h.fx)); }
        else { const keepFont = S.font; cv().setActiveObject(o); MS.text.setFont(n); setTimeout(()=>{ S.font = keepFont; syncCards(box); prepMorphs().then(()=> previewFx(h.fx)); }, 450); }
        syncCards(box); };
      pick.current = which === 'from' ? (h.fx.from || defaultFrom(o)) : fontOf(o); MS.openFontBrowser(fb, pick); return; }
    const rb = e.target.closest('[data-rec]'), cb = e.target.closest('[data-recclear]');
    if(rb){ const key = rb.dataset.rec; if(armed.has(key)) armed.delete(key); else { armed.add(key); toast('Recording: press Play and move the slider, or scrub to a time and set it — each move is written onto the timeline. Click Rec again to stop.', 6000); } syncCards(box); return; }
    if(cb){ const [id, i] = cb.dataset.recclear.split('|'), fx = A.tracks[id] && A.tracks[id].fx[+i]; if(fx){ delete fx.auto; armed.delete(cb.dataset.recclear); applyAt(A.t); renderRows(); toast('Recorded moves cleared.', 2500); } }
  });
  box.addEventListener('change', e=>{
    if(e.target.closest('[data-k="amount"],[data-k="morph"]')){ const h0 = fxOf(e.target); if(h0 && (armed.has(h0.id + '|' + h0.i) || (h0.fx.auto && h0.fx.auto[e.target.dataset.k]))){ MS.commit && MS.commit('Record ' + e.target.dataset.k); return; } if(e.target.closest('[data-k="morph"]')) return; }
    const el = e.target.closest('[data-k]'), h = el && fxOf(el); if(!h) return; const k = el.dataset.k, fx = h.fx;
    if(k === 'dir') fx.dir = el.value; else if(k === 'from') fx.from = el.value.trim() || defaultFrom(byId(h.id) || {});
    if(k === 'from') prepMorphs().then(()=> previewFx(fx)); else previewFx(fx);
    A.sel = { id:h.id, kind:'fx', i:h.i }; MS.commit && MS.commit('Tune ' + FXLIST[fx.type].label.toLowerCase());
  });
  box.addEventListener('focusin', e=>{ const h = e.target.closest && e.target.closest('[data-k]') && fxOf(e.target); if(h && !(A.sel && A.sel.kind === 'fx' && A.sel.id === h.id && A.sel.i === h.i)){ $$('.an-fxc', box).forEach(c=> c.classList.toggle('on', c === h.card)); $$('.an-fx.on').forEach(n=> n.classList.remove('on')); const bar = $('.an-row[data-id="' + h.id + '"] .an-fx[data-fx="' + h.i + '"]'); bar && bar.classList.add('on'); } });
}
async function snapshot(){
  const d = S.doc, mult = Math.min(2, 2048 / Math.max(d.wPx, d.hPx)), el = MS.renderArtboard({ multiplier:mult });
  const blob = await new Promise(r=> el.toBlob(r, 'image/png')), name = (S.doc.name || 'design').replace(/[\/:*?"<>|]+/g, '_') + '-snapshot-' + A.t.toFixed(2) + 's.png';
  const fl = $('#anFlash'); if(fl){ fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go'); }
  try{ if(navigator.clipboard && window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'image/png':blob })]); }catch(e){}
  const msg = await MS.saveFile(blob, name); toast('Snapshot ' + msg + '  (also copied — Ctrl+V pastes it)', 6000);
}
const setT = t=>{ applyAt(clamp(frameT(t), 0, A.dur)); paintHead(); };

/* rows */
let area = null, pxs = 1, labelW = 150;
function renderRows(){
  if(!bar || !A.on) return; const rows = $('#anRows'), W = Math.max(260, rows.clientWidth - labelW - 18); pxs = W / A.dur;
  const sel = new Set(targets().map(o=> o.__animId)), ids = Object.keys(A.tracks).filter(id=> byId(id));
  Object.keys(A.tracks).forEach(id=>{ if(!byId(id)) delete A.tracks[id]; });
  const ticks = []; const stepS = A.dur <= 4 ? .25 : A.dur <= 12 ? 1 : 5; for(let s = 0; s <= A.dur + 1e-6; s += stepS) ticks.push(s);
  let h = `<div class="an-corner" style="width:${labelW}px"><button class="btn sm primary an-play">${MS.icon(A.playing ? 'x' : 'play')}<span>${A.playing ? 'Pause' : 'Play'}</span></button><button class="btn sm an-start" data-tip="Back to start">${MS.icon('rotate')}</button></div><div class="an-ruler" style="margin-left:${labelW}px;width:${W}px">${ticks.map(s=> `<span style="left:${s * pxs}px">${Number.isInteger(s) ? s + 's' : ''}</span><i style="left:${s * pxs}px"></i>`).join('')}</div>`;
  const rowOf = (id, o, tr)=>{
    const isSel = sel.has(id) || (A.sel && A.sel.id === id), nfx = tr.fx.length, rowH = Math.max(44, 8 + nfx * 25 + 22);
    return `<div class="an-row ${isSel ? 'sel' : ''} ${A.sel && A.sel.id === id && A.sel.kind === 'track' ? 'trk' : ''}" data-id="${id}" style="height:${rowH}px"><div class="an-name" style="width:${labelW}px" title="${esc(o.name || o.type)}">${esc(o.name || o.type)}<button class="x" data-del-track="${id}" title="Remove animation">×</button></div>
      <div class="an-lane" style="width:${W}px">${tr.fx.map((fx, i)=> { const once = !!ONCEFX[fx.type], x0 = fx.start || 0, len = fx.len || (once ? .6 : A.dur - x0); return `<div class="an-fx ${once ? 'once ' + ONCEFX[fx.type].kind : 'loop'} ${A.sel && A.sel.id === id && A.sel.kind === 'fx' && A.sel.i === i ? 'on' : ''}" data-fx="${i}" style="left:${x0 * pxs}px;top:${5 + i * 25}px;width:${Math.max(18, len * pxs)}px" title="${FXLIST[fx.type].label} · ${x0.toFixed(2)}–${(x0 + len).toFixed(2)} s — drag to move, drag the ends to resize"><i class="hl"></i>${Object.keys(fx.auto || {}).map(k=> fx.auto[k].map(p=> `<b class="ap" title="${k} ${Math.round(p.v)} at ${p.t.toFixed(2)} s" style="left:${(p.t - x0) * pxs}px"></b>`).join('')).join('')}${FXLIST[fx.type].label}${!once && (fx.cycles || 1) > 1 ? ' ×' + fx.cycles : ''}<i class="hr"></i></div>`; }).join('')}
        ${tr.keys.map((k, i)=> `<div class="an-key ${A.sel && A.sel.id === id && A.sel.kind === 'key' && A.sel.i === i ? 'on' : ''}" data-key="${i}" style="left:${k.t * pxs}px;top:${rowH - 9}px" title="${k.t.toFixed(2)} s · ${k.e}"></div>`).join('')}</div></div>`;
  };
  ids.forEach(id=> h += rowOf(id, byId(id), A.tracks[id]));
  const pending = targets().filter(o=> !A.tracks[o.__animId]);
  if(pending.length) h += `<div class="an-row pend"><div class="an-name" style="width:${labelW}px">${esc(pending.length > 1 ? pending.length + ' selected' : (pending[0].name || pending[0].type))}</div><div class="an-lane" style="width:${W}px"><span class="hint">Not animated yet — click an effect on the right, or ◆ Add key.</span></div></div>`;
  if(!ids.length && !pending.length) h += `<div class="empty-note" style="padding:20px"><div>Nothing animated yet</div><div class="hint">Select an element, then click a motion effect — or add keyframes and move it at different times.</div></div>`;
  h += `<div class="an-head" id="anHead" style="left:${labelW}px"><i></i></div>`;
  rows.innerHTML = h; area = rows; paintHead(); syncTransport(); badge(); onElement(); steps();
}
function steps(){ const has = Object.keys(A.tracks).length > 0, sel = targets().length > 0, cur = has ? 3 : sel ? 2 : 1; $$('#anSteps .an-step').forEach(e=>{ const n = +e.dataset.s; e.classList.toggle('cur', n === cur); e.classList.toggle('done', n < cur); }); }
function paintHead(){ if(Object.keys(A.tracks).some(id=> A.tracks[id].fx.some(f=> f.auto))) syncCards(); const hd = $('#anHead'); if(hd) hd.firstChild.style.transform = 'translateX(' + (A.t * pxs) + 'px)'; $$('.an-time').forEach(tl=> tl.textContent = A.t.toFixed(2) + ' / ' + A.dur.toFixed(2) + ' s'); }
function syncTransport(){ $$('.an-play').forEach(b=>{ b.innerHTML = MS.icon(A.playing ? 'x' : 'play') + '<span>' + (A.playing ? 'Pause' : 'Play') + '</span>'; }); }
function badge(){ const st = loopStatus(); $$('.an-badge').forEach(b=>{ if(!st.total){ b.textContent = ''; b.className = 'an-badge'; return; } b.textContent = st.bad ? 'Not seamless yet — click Make seamless loop' : 'Loops seamlessly ✓'; b.className = 'an-badge ' + (st.bad ? 'warn' : 'ok'); }); }
function wireRows(){
  const rows = $('#anRows');
  rows.addEventListener('mousedown', e=>{
    const del = e.target.closest('[data-del-track]'); if(del){ A.sel = { id:del.dataset.delTrack, kind:'track' }; delSelected(); return; }
    const row = e.target.closest('.an-row'), lane = e.target.closest('.an-lane'), ruler = e.target.closest('.an-ruler'), head = e.target.closest('.an-head');
    const scrub = ev=>{ const r = rows.getBoundingClientRect(); setT((ev.clientX - r.left + rows.scrollLeft - labelW) / pxs); };
    if(ruler || head){ stop(); scrub(e); const mv = ev=> scrub(ev), up = ()=>{ document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); }; document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); return; }
    if(!row) return; const id = row.dataset.id; if(id){ const o = byId(id); if(o){ cv().setActiveObject(o); cv().requestRenderAll(); MS.emitSelection(); } if(e.target.closest('.an-name') && !e.target.closest('[data-del-track]')){ A.sel = { id, kind:'track' }; renderRows(); return; } }
    const key = e.target.closest('.an-key'), fxEl = e.target.closest('.an-fx');
    if(key && id){ const i = +key.dataset.key, tr = A.tracks[id]; A.sel = { id, kind:'key', i }; $('#anEase').value = tr.keys[i].e; $('#anKeyT').value = tr.keys[i].t.toFixed(2); setT(tr.keys[i].t); stop();
      const x0 = e.clientX, t0 = tr.keys[i].t, k = tr.keys[i]; let moved = false;
      const mv = ev=>{ if(!moved && Math.abs(ev.clientX - x0) < 3) return; moved = true; if(i === 0 && false) return; k.t = clamp(frameT(t0 + (ev.clientX - x0) / pxs), 0, A.dur); key.style.left = k.t * pxs + 'px'; applyAt(k.t); paintHead(); };
      const up = ()=>{ document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); if(moved){ tr.keys.sort((a, b)=> a.t - b.t); A.sel.i = tr.keys.indexOf(k); } renderRows(); };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); $$('.an-fx.on, .an-key.on', rows).forEach(n=> n.classList.remove('on')); key.classList.add('on'); return; }
    if(fxEl && id){
      const i = +fxEl.dataset.fx, fx = A.tracks[id].fx[i]; A.sel = { id, kind:'fx', i }; const once = !!ONCEFX[fx.type];
      const fill = ()=> syncCards(); fill();
      MS.syncRanges(document);
      $$('.an-fx.on, .an-key.on', rows).forEach(n=> n.classList.remove('on')); fxEl.classList.add('on');
      const x0 = e.clientX, s0 = fx.start || 0, l0 = fx.len || (once ? .6 : A.dur - s0), mode = e.target.classList.contains('hl') ? 'l' : e.target.classList.contains('hr') ? 'r' : 'm', minL = Math.max(.05, 1 / A.fps); let moved = false;
      const mv = ev=>{
        if(!moved && Math.abs(ev.clientX - x0) < 3) return; moved = true; const dt = (ev.clientX - x0) / pxs; let st = s0, ln = l0;
        if(mode === 'm') st = clamp(frameT(s0 + dt), 0, Math.max(0, A.dur - l0));
        else if(mode === 'l'){ st = clamp(frameT(s0 + dt), 0, s0 + l0 - minL); ln = s0 + l0 - st; }
        else ln = clamp(frameT(l0 + dt), minL, A.dur - s0);
        fx.start = st; fx.len = ln; fxEl.style.left = st * pxs + 'px'; fxEl.style.width = Math.max(18, ln * pxs) + 'px'; fill(); applyAt(clamp(mode === 'r' ? st + ln : st, 0, A.dur)); paintHead();
      };
      const up = ()=>{ document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); renderRows(); if(A.loopSel){ const w = fxWin(fx); prepMorphs().then(()=> previewRange(w.st, Math.min(A.dur, w.st + w.ln), true)); } };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); return; }
    if(lane && id){ A.sel = null; const r = lane.getBoundingClientRect(); stop(); setT((e.clientX - r.left) / pxs); renderRows(); }
  });
  rows.addEventListener('click', e=>{ const p = e.target.closest('.an-corner .an-play'), s = e.target.closest('.an-corner .an-start'); if(p){ A.playing ? stop() : play(); } else if(s){ stop(); setT(0); } });
  rows.addEventListener('dblclick', e=>{ const lane = e.target.closest('.an-lane'), row = e.target.closest('.an-row'); if(!lane || !row || !row.dataset.id || e.target.closest('.an-key') || e.target.closest('.an-fx')) return; const o = byId(row.dataset.id); if(!o) return; const r = lane.getBoundingClientRect(); addKey(o, (e.clientX - r.left) / pxs, baseAt(A.tracks[row.dataset.id], clamp((e.clientX - r.left) / pxs, 0, A.dur), o)); renderRows(); });
}

/* ---------------- auto-key + wiring ---------------- */
function wireCanvas(){
  const c = cv(); if(!c || c.__animWired) return; c.__animWired = true;
  c.on('mouse:down', ()=>{ if(!A.on) return; snap = {}; targets().forEach(o=>{ snap[idOf(o)] = basePoseOf(o, A.t); }); });
  c.on('object:modified', e=>{
    if(!A.on || A.collapsed || !A.autokey || A.playing) return; const list = e.target && e.target.type === 'activeSelection' ? e.target.getObjects() : [e.target]; if(!list[0]) return;
    list.forEach(o=>{
      if(o.__isBackground) return; const id = idOf(o), before = snap && snap[id];
      if(!A.tracks[id]){ A.tracks[id] = { keys:[{ t:0, p:before || basePoseOf(o, 0), e:'easeInOut' }], fx:[] }; }
      const grp = e.target.type === 'activeSelection'; if(grp) return;      // moving a multi-selection: keys are added per object after it is released
      if(A.t === 0 && !before) return; addKey(o, A.t, basePoseOf(o, A.t));
    });
    if(e.target && e.target.type === 'activeSelection'){ const act = e.target; cv().discardActiveObject(); list.forEach(o=>{ const id = idOf(o); if(!A.tracks[id]) A.tracks[id] = { keys:[{ t:0, p:(snap && snap[id]) || pose(o), e:'easeInOut' }], fx:[] }; addKey(o, A.t, basePoseOf(o, A.t)); }); cv().setActiveObject(new fabric.ActiveSelection(list, { canvas:cv() })); }
    renderRows();
  });
}
// collapse / reopen: the timeline folds away but the animation stays switched on and everything stays exactly where it is
function collapse(c){
  if(!A.on){ toggle(true); return; }
  A.collapsed = c === undefined ? !A.collapsed : c; stop(); bar.style.display = A.collapsed ? 'none' : ''; document.body.classList.toggle('anim-collapsed', A.collapsed);
  const pill = $('#anPill'); if(pill) pill.style.display = A.collapsed ? '' : 'none';
  if(A.collapsed){ if(!$('#page-anim').classList.contains('hidden')) MS.showPage('design'); if(Object.keys(A.tracks).length) toast('Timeline folded away — everything stays where it is. Edits made now are not recorded as keyframes. Click the up arrow at the bottom right of the canvas (or Ctrl+Shift+A) to reopen.', 5500); }
  else { MS.showPage('anim'); renderRows(); }
  MS.emit('resize'); const sb = $('#sbAnim'); if(sb) sb.classList.toggle('on', A.on && !A.collapsed);
}
function toggle(on){
  if(on === true && A.on && A.collapsed){ collapse(false); return; }
  A.collapsed = false; document.body.classList.remove('anim-collapsed'); const pill0 = $('#anPill'); if(pill0) pill0.style.display = 'none';
  A.on = on === undefined ? !A.on : on; bar.style.display = A.on ? '' : 'none'; document.body.classList.toggle('anim-on', A.on);
  if(A.on) MS.showPage('anim'); else if(!$('#page-anim').classList.contains('hidden')) MS.showPage('design');
  if(A.on){ wireCanvas(); renderRows(); } else { stop(); setT0(); }
  MS.emit('resize'); if(!A.on && Object.keys(A.tracks).length) toast('Timeline hidden — edit freely, your animation is kept. Click Animate at the bottom (or Ctrl+Shift+A) to bring it back.', 5000); const sb = $('#sbAnim'); if(sb) sb.classList.toggle('on', A.on);
}
function setT0(){ if(Object.keys(A.tracks).length) applyAt(0); }

// full-screen preview: plays the animation live into a canvas; returns a function that stops it and puts the design back
function runPreview(cnv, bg, maxPx){
  const d = S.doc, mult = Math.min(2, maxPx / Math.max(d.wPx, d.hPx)), keep = A.t; stop(); cv().discardActiveObject(); lockCanvas(true);
  cnv.width = Math.max(1, Math.round(d.wPx * mult)); cnv.height = Math.max(1, Math.round(d.hPx * mult)); const ctx = cnv.getContext('2d');
  let alive = true, raf2 = 0, t0 = 0;
  const frame = now=>{
    if(!alive) return; if(!t0) t0 = now; let t = (now - t0) / 1000;
    if(A.pingpong){ const p = t % (A.dur * 2); t = p > A.dur ? A.dur * 2 - p : p; } else if(A.loop) t = t % A.dur; else t = Math.min(t, A.dur);
    applyAt(t); const el = MS.renderArtboard({ multiplier:mult, background:bg || null }); ctx.clearRect(0, 0, cnv.width, cnv.height); ctx.drawImage(el, 0, 0, cnv.width, cnv.height); raf2 = requestAnimationFrame(frame);
  };
  prepMorphs().then(()=>{ if(alive) raf2 = requestAnimationFrame(frame); });
  return ()=>{ alive = false; cancelAnimationFrame(raf2); applyAt(keep); lockCanvas(false); };
}
/* ---------------- Claude (prompt-driven animation) ---------------- */
const aiObj = ref=> objs().find(o=> o.name === ref);
const aiNum = (v, lo, hi, d)=>{ const n = +v; return Number.isFinite(n) ? clamp(n, lo, hi) : d; };
function aiDescribe(){
  const rows = Object.keys(A.tracks).map(id=>{ const o = byId(id), tr = A.tracks[id]; if(!o) return null; const b = tr.keys[0] ? tr.keys[0].p : pose(o);
    return { ref:o.name, keys:tr.keys.map(k=>({ t:k.t, x:Math.round(k.p.x), y:Math.round(k.p.y), scale:+(k.p.sx / (b.sx || 1)).toFixed(2), angle:Math.round(k.p.a), opacity:+k.p.op.toFixed(2), ease:k.e })), effects:tr.fx.map(f=>({ type:f.type, amount:f.amount, cycles:f.cycles, start:f.start, len:f.len, dir:f.dir })) }; }).filter(Boolean);
  return { duration:A.dur, fps:A.fps, loop:A.loop, pingpong:A.pingpong, animated:rows };
}
function aiNeedOn(){ if(!A.on){ toggle(true); MS.showPage('claude'); } }          // show the timeline but stay in the Claude chat
function aiApply(a){
  aiNeedOn();
  switch(a.do){
    case 'anim_settings': {
      if(a.duration !== undefined){ A.dur = aiNum(a.duration, .5, 60, A.dur); A.t = Math.min(A.t, A.dur); const d = $('#anDur'); if(d) d.value = A.dur; }
      if(a.fps !== undefined){ A.fps = aiNum(a.fps, 5, 30, A.fps); const f = $('#anFps'); if(f) f.value = String(A.fps); }
      if(a.loop !== undefined) A.loop = !!a.loop; if(a.pingpong !== undefined) A.pingpong = !!a.pingpong; return true; }
    case 'add_effect': {
      const type = String(a.type || ''); if(!FXLIST[type]) return false;
      const list = (Array.isArray(a.refs) ? a.refs : [a.ref]).map(aiObj).filter(Boolean); if(!list.length) return false;
      if(type === 'fontMorph' && !list.every(canMorph)) return false;
      const opt = { amount:aiNum(a.amount, 0, 100, 50), cycles:aiNum(a.cycles, .25, 20, 1), stagger:aiNum(a.stagger, 0, 100, 0), dir:['l', 'r', 'u', 'd', 'cw', 'ccw'].includes(a.dir) ? a.dir : undefined };
      if(type === 'fontMorph' && a.from && (MS.fontNames || []).includes(a.from)) opt.from = a.from;
      if(!opt.dir) delete opt.dir;
      list.forEach((o, i)=>{ const fx = addEffect(o, type, opt, i, list.length); if(!fx || LOOPFX[type] || type === 'spin') return;
        if(a.start !== undefined) fx.start = aiNum(a.start, 0, A.dur, fx.start || 0); if(a.len !== undefined) fx.len = aiNum(a.len, .1, A.dur, fx.len || .6); });
      if(type === 'fontMorph') prepMorphs(); return true; }
    case 'add_key': {
      const o = aiObj(a.ref); if(!o) return false; const tr = trackOf(o, true), b = tr.keys[0].p, t = clamp(frameT(aiNum(a.t, 0, A.dur, 0)), 0, A.dur);
      const prev = tr.keys.filter(k=> k.t <= t).pop() || tr.keys[0], p = Object.assign({}, prev.p), sc = a.scale === undefined ? undefined : aiNum(a.scale, 0, 20, 1);
      if(a.x !== undefined) p.x = aiNum(a.x, -5000, 9000, p.x); if(a.y !== undefined) p.y = aiNum(a.y, -5000, 9000, p.y); if(a.dx !== undefined) p.x = b.x + aiNum(a.dx, -9000, 9000, 0); if(a.dy !== undefined) p.y = b.y + aiNum(a.dy, -9000, 9000, 0);
      if(sc !== undefined){ p.sx = b.sx * sc; p.sy = b.sy * sc; } if(a.angle !== undefined) p.a = aiNum(a.angle, -3600, 3600, p.a); if(a.opacity !== undefined) p.op = aiNum(a.opacity, 0, 1, p.op);
      const k = addKey(o, t, p); if(EASE[a.ease]) k.e = a.ease; return true; }
    case 'remove_animation': {
      if(a.ref === 'all'){ Object.keys(A.tracks).forEach(id=>{ const o = byId(id), tr = A.tracks[id]; if(o && tr.keys[0]) applyPose(o, tr.keys[0].p); delete A.tracks[id]; }); return true; }
      const o = aiObj(a.ref); if(!o || !A.tracks[o.__animId]) return false; const tr = A.tracks[o.__animId]; if(tr.keys[0]) applyPose(o, tr.keys[0].p); delete A.tracks[o.__animId]; return true; }
    case 'make_loop': makeLoop(); A.loop = true; return true;
  }
  return false;
}
function aiFinish(play0){ A.sel = null; applyAt(0); renderRows(); if(play0 && Object.keys(A.tracks).length) setTimeout(()=>{ stop(); play(); }, 60); }

MS.anim = { aiDescribe, aiApply, aiFinish, collapse, runPreview, state:A, snapshot, removeTrack, removeFx, toggle, applyAt, addEffect, addKey, makeLoop, play, stop, openExport, renderFrames, makeGif, frameTimes, loopStatus, FX:FXLIST, EASE };
MS.initAnim = function(){
  build(); wireRows(); MS.on('selection', ()=>{ if(A.on) renderRows(); }); MS.on('layers', ()=>{ if(A.on) renderRows(); });
  window.addEventListener('resize', ()=>{ if(A.on) renderRows(); });
  const sb = document.createElement('span'); sb.className = 'sb-toggle'; sb.id = 'sbAnim'; sb.dataset.tip = 'Animation timeline — make GIFs'; sb.innerHTML = MS.icon('play') + 'Animate'; sb.onclick = ()=> A.on ? collapse() : toggle(true); $('#statusbar').insertBefore(sb, $('#sbSnap'));
  MS.addCommand && MS.addCommand({ title:'Animation timeline', cat:'Window', run:()=> toggle() });
  MS.addCommand && MS.addCommand({ title:'Add keyframe at playhead', cat:'Window', run:()=> keyHere() });
  MS.addCommand && MS.addCommand({ title:'Export animated GIF', cat:'File', run:()=>{ if(!A.on) toggle(true); openExport(); } });
  document.addEventListener('keydown', e=>{ if((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a'){ e.preventDefault(); A.on ? collapse() : toggle(true); } if(A.on && e.code === 'Space' && !/input|textarea|select|button/i.test((e.target.tagName || ''))){ e.preventDefault(); e.stopPropagation(); A.playing ? stop() : play(); } }, true);
  const pc = MS.collectExtra, pr = MS.restoreExtra;
  MS.collectExtra = ()=> Object.assign(pc ? pc() : {}, { anim:{ dur:A.dur, fps:A.fps, loop:A.loop, pingpong:A.pingpong, autokey:A.autokey, tracks:A.tracks } });
  MS.restoreExtra = ex=>{ const a = ex && ex.anim; A.tracks = (a && a.tracks) || {}; if(a){ A.dur = a.dur || 2; A.fps = a.fps || 12; A.loop = a.loop !== false; A.pingpong = !!a.pingpong; A.autokey = a.autokey !== false; } A.t = 0; A.sel = null; pr && pr(ex); if(bar){ $('#anDur').value = A.dur; $('#anFps').value = A.fps; $('#anLoop').checked = A.loop; $('#anPing').checked = A.pingpong; $('#anAuto').checked = A.autokey; } setTimeout(()=>{ if(Object.keys(A.tracks).length && !A.on) toggle(true); else A.on && renderRows(); if(Object.keys(A.tracks).length) applyAt(0); }, 80); };
  const nd = MS.newDoc; MS.newDoc = function(){ stop(); A.tracks = {}; A.t = 0; A.sel = null; const r = nd.apply(this, arguments); if(A.on) renderRows(); return r; };
};
})();
