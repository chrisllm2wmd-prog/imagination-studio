/* Merch Studio - Trace picture to vector: colour-quantise a bitmap, trace the colour regions and fit smooth bezier paths. */
(function(){
'use strict';
const MS = window.MS, S = MS.S;
const { $, $$, toast } = MS;
const cv = ()=> MS.canvas;

/* ---------- 1. quantise ---------- */
function loadPixels(img, maxSide){
  const el = img._originalElement || img._element, iw = img.width, ih = img.height, s = Math.min(1, maxSide / Math.max(iw, ih));
  const w = Math.max(2, Math.round(iw * s)), h = Math.max(2, Math.round(ih * s)), c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently:true }); x.imageSmoothingQuality = 'high';
  // use the filtered element if tint/greyscale filters are applied
  x.drawImage(img._filteredEl || el, 0, 0, w, h);
  return { w, h, d:x.getImageData(0, 0, w, h).data };
}
function kmeans(px, k){
  const { w, h, d } = px, n = w * h, samples = [], step = Math.max(1, Math.floor(n / 14000));
  for(let i = 0; i < n; i += step) if(d[i*4+3] >= 128) samples.push([d[i*4], d[i*4+1], d[i*4+2]]);
  if(!samples.length) return [];
  const dist = (a, b)=> (a[0]-b[0])*(a[0]-b[0]) + (a[1]-b[1])*(a[1]-b[1]) + (a[2]-b[2])*(a[2]-b[2]);
  let seed = 11; const rnd = ()=>{ seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const cen = [samples[Math.floor(rnd() * samples.length)].slice()];
  while(cen.length < k){   // k-means++ seeding
    const ds = samples.map(s=> Math.min(...cen.map(c=> dist(s, c)))), tot = ds.reduce((a, b)=> a + b, 0); if(tot === 0) break;
    let r = rnd() * tot, i = 0; for(; i < ds.length - 1; i++){ r -= ds[i]; if(r <= 0) break; } cen.push(samples[i].slice());
  }
  for(let it = 0; it < 9; it++){
    const sum = cen.map(()=> [0, 0, 0, 0]);
    samples.forEach(s=>{ let bi = 0, bd = 1e12; cen.forEach((c, i)=>{ const dd = dist(s, c); if(dd < bd){ bd = dd; bi = i; } }); const q = sum[bi]; q[0] += s[0]; q[1] += s[1]; q[2] += s[2]; q[3]++; });
    sum.forEach((q, i)=>{ if(q[3]) cen[i] = [q[0]/q[3], q[1]/q[3], q[2]/q[3]]; });
  }
  return cen;
}
function label(px, cen){
  const { w, h, d } = px, lab = new Int16Array(w * h).fill(-1), lut = new Int16Array(32768).fill(-1);
  for(let i = 0; i < w * h; i++){
    if(d[i*4+3] < 128) continue; const key = ((d[i*4] >> 3) << 10) | ((d[i*4+1] >> 3) << 5) | (d[i*4+2] >> 3);
    if(lut[key] < 0){ let bi = 0, bd = 1e12; const r = (key >> 10) * 8 + 4, g = ((key >> 5) & 31) * 8 + 4, b = (key & 31) * 8 + 4; cen.forEach((c, j)=>{ const dd = (c[0]-r)*(c[0]-r) + (c[1]-g)*(c[1]-g) + (c[2]-b)*(c[2]-b); if(dd < bd){ bd = dd; bi = j; } }); lut[key] = bi; }
    lab[i] = lut[key];
  }
  return lab;
}
function majority(lab, w, h, k){
  const out = lab.slice(), cnt = new Int16Array(k);
  for(let y = 1; y < h - 1; y++) for(let x = 1; x < w - 1; x++){
    const i = y * w + x; if(lab[i] < 0) continue; cnt.fill(0); let best = lab[i], bc = 0;
    for(let dy = -1; dy <= 1; dy++) for(let dx = -1; dx <= 1; dx++){ const l = lab[i + dy * w + dx]; if(l >= 0){ if(++cnt[l] > bc){ bc = cnt[l]; best = l; } } }
    if(bc >= 5) out[i] = best;
  }
  return out;
}
function dropSpecks(lab, w, h, minA){
  if(minA <= 1) return lab; const seen = new Uint8Array(w * h), out = lab.slice();
  for(let s = 0; s < w * h; s++){
    if(seen[s] || lab[s] < 0) continue; const l = lab[s], comp = [s], st = [s]; seen[s] = 1; const nb = {};
    while(st.length){ const i = st.pop(), x = i % w, y = (i / w) | 0;
      [[x+1,y],[x-1,y],[x,y+1],[x,y-1]].forEach(([nx, ny])=>{ if(nx < 0 || ny < 0 || nx >= w || ny >= h) return; const j = ny * w + nx; if(lab[j] === l){ if(!seen[j]){ seen[j] = 1; comp.push(j); st.push(j); } } else if(lab[j] >= 0) nb[lab[j]] = (nb[lab[j]] || 0) + 1; }); }
    if(comp.length < minA){ let bl = -1, bc = 0; for(const k in nb) if(nb[k] > bc){ bc = nb[k]; bl = +k; } if(bl >= 0) comp.forEach(i=> out[i] = bl); }
  }
  return out;
}

/* ---------- 2. contour tracing (pixel-edge following) ---------- */
function contours(mask, w, h){
  const W1 = w + 1, out = new Map();
  const add = (x0, y0, x1, y1)=>{ const a = y0 * W1 + x0; let l = out.get(a); if(!l){ l = []; out.set(a, l); } l.push(y1 * W1 + x1); };
  for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){
    if(!mask[y * w + x]) continue;
    if(y === 0 || !mask[(y-1) * w + x]) add(x, y, x+1, y);
    if(x === w-1 || !mask[y * w + x + 1]) add(x+1, y, x+1, y+1);
    if(y === h-1 || !mask[(y+1) * w + x]) add(x+1, y+1, x, y+1);
    if(x === 0 || !mask[y * w + x - 1]) add(x, y+1, x, y);
  }
  const loops = [];
  for(const [start] of out){
    while(out.get(start) && out.get(start).length){
      const loop = []; let cur = start, prevDir = null;
      for(let guard = 0; guard < 2e6; guard++){
        const list = out.get(cur); if(!list || !list.length) break;
        let pick = 0;
        if(list.length > 1 && prevDir !== null){   // saddle: take the right-most turn so touching regions stay apart
          let bestScore = -9;
          list.forEach((nx, i)=>{ const dx = (nx % W1) - (cur % W1), dy = ((nx / W1) | 0) - ((cur / W1) | 0), cross = prevDir[0] * dy - prevDir[1] * dx; if(cross > bestScore){ bestScore = cross; pick = i; } });
        }
        const nx = list.splice(pick, 1)[0]; loop.push([cur % W1, (cur / W1) | 0]);
        prevDir = [(nx % W1) - (cur % W1), ((nx / W1) | 0) - ((cur / W1) | 0)]; cur = nx; if(cur === start) break;
      }
      if(loop.length > 3) loops.push(loop);
    }
  }
  return loops;
}
function dropCollinear(p){
  const out = []; const n = p.length;
  for(let i = 0; i < n; i++){ const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n]; if((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) out.push(b); }
  return out;
}
function rdp(pts, eps){
  if(pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1]; let dm = 0, im = 0; const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  for(let i = 1; i < pts.length - 1; i++){ const d = Math.abs((pts[i][0] - a[0]) * dy - (pts[i][1] - a[1]) * dx) / L; if(d > dm){ dm = d; im = i; } }
  if(dm > eps) return rdp(pts.slice(0, im + 1), eps).slice(0, -1).concat(rdp(pts.slice(im), eps));
  return [a, b];
}
function smoothLoop(p, passes){
  let q = p.map(a=> [a[0], a[1]]);
  for(let k = 0; k < passes; k++){ const n = q.length; q = q.map((b, i)=>{ const a = q[(i - 1 + n) % n], c = q[(i + 1) % n]; return [(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4]; }); }
  return q;
}
function simplifyLoop(loop, eps, smoothN){
  let p = smoothN > 0 ? smoothLoop(loop, smoothN) : dropCollinear(loop); if(p.length < 4) return p;
  let fi = 0, fd = 0; p.forEach((q, i)=>{ const d = Math.hypot(q[0] - p[0][0], q[1] - p[0][1]); if(d > fd){ fd = d; fi = i; } });
  const A = p.slice(0, fi + 1), B = p.slice(fi).concat([p[0]]);
  return rdp(A, eps).slice(0, -1).concat(rdp(B, eps).slice(0, -1));
}
const f1 = v=> +v.toFixed(2);
function loopToD(p, smooth, corner){
  const n = p.length; if(n < 3) return '';
  if(!smooth) return 'M' + p.map(q=> f1(q[0]) + ' ' + f1(q[1])).join('L') + 'Z';
  const ang = i=>{ const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n], v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]]; const cs = (v1[0]*v2[0] + v1[1]*v2[1]) / ((Math.hypot(...v1) * Math.hypot(...v2)) || 1); return Math.acos(Math.max(-1, Math.min(1, cs))) * 180 / Math.PI; };
  const isCorner = p.map((_, i)=> ang(i) < corner);
  let d = 'M' + f1(p[0][0]) + ' ' + f1(p[0][1]);
  for(let i = 0; i < n; i++){
    const p0 = p[i], p1 = p[(i + 1) % n], pm = p[(i - 1 + n) % n], p2 = p[(i + 2) % n], t = 1 / 6;
    const c1 = isCorner[i] ? p0 : [p0[0] + (p1[0] - pm[0]) * t, p0[1] + (p1[1] - pm[1]) * t];
    const c2 = isCorner[(i + 1) % n] ? p1 : [p1[0] - (p2[0] - p0[0]) * t, p1[1] - (p2[1] - p0[1]) * t];
    d += 'C' + f1(c1[0]) + ' ' + f1(c1[1]) + ' ' + f1(c2[0]) + ' ' + f1(c2[1]) + ' ' + f1(p1[0]) + ' ' + f1(p1[1]);
  }
  return d + 'Z';
}

/* ---------- 3. whole pipeline ---------- */
function run(img, o){
  const px = loadPixels(img, o.res), { w, h } = px;
  const cen = kmeans(px, o.colors); if(!cen.length) return { w, h, layers:[] };
  let lab = label(px, cen);
  for(let i = 0; i < o.smooth; i++) lab = majority(lab, w, h, cen.length);
  lab = dropSpecks(lab, w, h, o.speck);
  const area = cen.map(()=> 0); lab.forEach(l=>{ if(l >= 0) area[l]++; });
  let order = cen.map((_, i)=> i).filter(i=> area[i] > 0).sort((a, b)=> area[b] - area[a]);
  if(o.dropBg){
    const cnt = {}; for(let x = 0; x < w; x++){ [lab[x], lab[(h-1) * w + x]].forEach(l=>{ if(l >= 0) cnt[l] = (cnt[l] || 0) + 1; }); } for(let y = 0; y < h; y++){ [lab[y * w], lab[y * w + w - 1]].forEach(l=>{ if(l >= 0) cnt[l] = (cnt[l] || 0) + 1; }); }
    let bl = -1, bc = 0; for(const k in cnt) if(cnt[k] > bc){ bc = cnt[k]; bl = +k; } if(bl >= 0) order = order.filter(i=> i !== bl);
  }
  const layers = [], eps = o.eps;
  for(let j = 0; j < order.length; j++){
    const set = new Set(order.slice(j)), mask = new Uint8Array(w * h); for(let i = 0; i < w * h; i++) if(lab[i] >= 0 && set.has(lab[i])) mask[i] = 1;   // stack: each layer includes everything above it, so no gaps
    const loops = contours(mask, w, h).map(l=> simplifyLoop(l, eps, o.curves ? 4 : 0)).filter(l=> l.length >= 3);
    if(!loops.length) continue;
    const c = cen[order[j]], hex = '#' + [c[0], c[1], c[2]].map(v=> Math.round(v).toString(16).padStart(2, '0')).join('');
    layers.push({ color:hex, d:loops.map(l=> loopToD(l, o.curves, o.corner)).join('') });
  }
  return { w, h, layers };
}
function svgOf(r){
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + r.w + ' ' + r.h + '" width="' + r.w + '" height="' + r.h + '">' + r.layers.map(l=> '<path d="' + l.d + '" fill="' + l.color + '"/>').join('') + '</svg>';
}
function place(img, r, keep){
  const c = cv(), paths = r.layers.map((l, i)=>{ const p = new fabric.Path(l.d, { fill:l.color, stroke:null, strokeWidth:0, objectCaching:false }); p.name = 'Colour ' + (i + 1) + ' ' + l.color; return p; });
  const g = new fabric.Group(paths, { originX:'center', originY:'center' });
  const iw = img.width, ih = img.height, m = img.calcTransformMatrix(), gc = g.getCenterPoint();   // group centre in trace-pixel space (left/top = bbox top-left of the pixels)
  const cxp = g.left + g.width / 2 - (g.originX === 'center' ? g.width / 2 : 0), cyp = g.top + g.height / 2 - (g.originY === 'center' ? g.height / 2 : 0);
  const loc = fabric.util.transformPoint(new fabric.Point(cxp * iw / r.w - iw / 2, cyp * ih / r.h - ih / 2), m);
  g.set({ scaleX:img.scaleX * iw / r.w, scaleY:img.scaleY * ih / r.h, angle:img.angle, flipX:img.flipX, flipY:img.flipY });
  g.setPositionByOrigin(loc, 'center', 'center'); g.setCoords();
  g.name = (img.name || 'Picture') + ' (vector)'; g.opacity = img.opacity;
  const idx = c.getObjects().indexOf(img); c.add(g); c.moveTo(g, idx + 1);
  if(!keep){ img.visible = false; }
  c.discardActiveObject(); c.setActiveObject(g); c.requestRenderAll(); MS.commit('Trace to vector');
  return g;
}

MS.traceDialog = function(){
  const img = cv().getActiveObject();
  if(!img || img.type !== 'image'){ toast('Select a picture first, then trace it.'); return; }
  const O = Object.assign({ colors:6, smooth:1, speck:6, eps:1.1, curves:true, corner:150, dropBg:false, res:420 }, MS.store.get('trace', {}));
  const body = document.createElement('div'); body.className = 'kd-wrap';
  body.innerHTML = `<div><div class="kd-prev" style="background-color:#e9e9ed"><img id="trPrev" style="max-width:100%;max-height:100%"></div><div class="hint" id="trInfo" style="margin-top:8px"></div></div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <div class="r"><label style="width:72px">Colours</label><input type="range" id="trK" min="2" max="16" value="${O.colors}"><b id="trKv" style="width:24px;text-align:right">${O.colors}</b></div>
      <div class="r"><label style="width:72px">Smooth noise</label><input type="range" id="trS" min="0" max="4" value="${O.smooth}"></div>
      <div class="r"><label style="width:72px">Ignore specks</label><input type="range" id="trP" min="0" max="80" value="${O.speck}"></div>
      <div class="r"><label style="width:72px">Detail</label><input type="range" id="trE" min="2" max="40" value="${Math.round(42 - O.eps * 10)}"></div>
      <div class="r"><label style="width:72px">Resolution</label><select id="trR" class="grow"><option value="300">Fast (300)</option><option value="420">Normal (420)</option><option value="640">High (640)</option><option value="900">Very high (900)</option></select></div>
      <label class="chk"><input type="checkbox" id="trC" ${O.curves ? 'checked' : ''}> Smooth curves (off = straight edges)</label>
      <label class="chk"><input type="checkbox" id="trB" ${O.dropBg ? 'checked' : ''}> Leave out the background colour</label>
      <label class="chk"><input type="checkbox" id="trKeep"> Keep the original picture visible</label>
      <div class="hint">Each colour becomes one stacked vector shape. Fewer colours = cleaner, simpler, cheaper to print or cut.</div>
    </div>`;
  let result = null, busy = false, again = false;
  const q = id=> $('#' + id, body);
  const read = ()=>({ colors:+q('trK').value, smooth:+q('trS').value, speck:+q('trP').value, eps:(42 - +q('trE').value) / 10, curves:q('trC').checked, dropBg:q('trB').checked, res:+q('trR').value, corner:150 });
  const go = ()=>{
    if(busy){ again = true; return; } busy = true; q('trKv').textContent = q('trK').value;
    setTimeout(()=>{
      try{ const o = read(); result = run(img, o); q('trPrev').src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgOf(result)); q('trInfo').textContent = result.layers.length + ' colour layers · ' + result.layers.reduce((a, l)=> a + (l.d.match(/[MC]/g) || []).length, 0) + ' curve points'; MS.store.set('trace', Object.assign({}, o)); }
      catch(e){ console.error(e); q('trInfo').textContent = 'Trace failed: ' + e.message; }
      busy = false; if(again){ again = false; go(); }
    }, 30);
  };
  const m = MS.modal({ title:'Trace picture to vector', wide:true, body, buttons:[{ spacer:true }, { label:'Cancel' }, { label:'Create vector', primary:true, icon:'check', action:()=>{ if(!result || !result.layers.length){ toast('Nothing to trace — raise the colour count.'); return false; } place(img, result, q('trKeep').checked); toast('Traced! It is a group of editable vector shapes — Ungroup to edit each colour, or use the Node tool (A) on a piece.', 6000); } }] });
  q('trR').value = String(O.res);
  ['trK','trS','trP','trE'].forEach(id=> q(id).addEventListener('input', go)); ['trC','trB','trR'].forEach(id=> q(id).addEventListener('change', go));
  MS.syncRanges(body); go();
};
MS.initTrace = function(){
  const b = $('#btnImgTrace'); if(b) b.addEventListener('click', MS.traceDialog);
  MS.addCommand({ title:'Trace picture to vector…', cat:'Object', kw:'vectorize image svg bitmap', run:MS.traceDialog });
  MS.addCommand({ title:'Node edit tool', cat:'Tools', kw:'points anchors bezier path', key:'A', run:()=> MS.tools.set('node') });
};
})();
