/* Merch Studio - export: PNG / JPG / WebP / AVIF / SVG (text->outlines) / PDF (vector) / TIFF / BMP / ICO, file-size control, file naming. */
(function(){
'use strict';
const MS = window.MS, S = MS.S;
const { $, $$, clamp, toast, fmtBytes } = MS;
const cv = ()=> MS.canvas;

/* ====================== binary helpers ====================== */
const CRC = (()=>{ const t = new Uint32Array(256); for(let n = 0; n < 256; n++){ let c = n; for(let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
function crc32(b){ let c = 0xFFFFFFFF; for(let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
async function blobBytes(b){ return new Uint8Array(await b.arrayBuffer()); }
function setPngDpi(bytes, dpi){
  const ppm = Math.round(dpi / 0.0254), td = new Uint8Array(13), dv = new DataView(td.buffer);
  td.set([0x70, 0x48, 0x59, 0x73], 0); dv.setUint32(4, ppm); dv.setUint32(8, ppm); td[12] = 1;
  const chunk = new Uint8Array(21), cd = new DataView(chunk.buffer); cd.setUint32(0, 9); chunk.set(td, 4); cd.setUint32(17, crc32(td));
  const out = new Uint8Array(bytes.length + 21); out.set(bytes.subarray(0, 33), 0); out.set(chunk, 33); out.set(bytes.subarray(33), 54); return out;
}
function setJpegDpi(bytes, dpi){
  if(bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF && bytes[3] === 0xE0){ bytes[13] = 1; bytes[14] = dpi >> 8; bytes[15] = dpi & 255; bytes[16] = dpi >> 8; bytes[17] = dpi & 255; }
  return bytes;
}
function canvasToBlob(c, type, q){ return new Promise(res=> c.toBlob(b=> res(b), type, q)); }
function rgbaOf(c){ const ctx = c.getContext('2d'); return ctx.getImageData(0, 0, c.width, c.height).data; }

function encodeTiff(c, dpi){
  const w = c.width, h = c.height, px = rgbaOf(c), n = w * h * 4, ifdN = 12, ifdOff = 8, extra = ifdOff + 2 + ifdN * 12 + 4;
  const bpsOff = extra, xresOff = bpsOff + 8, yresOff = xresOff + 8, dataOff = yresOff + 8;
  const buf = new ArrayBuffer(dataOff + n), dv = new DataView(buf), u8 = new Uint8Array(buf);
  u8.set([0x49, 0x49, 42, 0], 0); dv.setUint32(4, ifdOff, true); dv.setUint16(ifdOff, ifdN, true);
  let p = ifdOff + 2; const ent = (tag, type, cnt, val)=>{ dv.setUint16(p, tag, true); dv.setUint16(p+2, type, true); dv.setUint32(p+4, cnt, true); if(type === 3 && cnt === 1) dv.setUint16(p+8, val, true); else dv.setUint32(p+8, val, true); p += 12; };
  ent(256, 4, 1, w); ent(257, 4, 1, h); ent(258, 3, 4, bpsOff); ent(259, 3, 1, 1); ent(262, 3, 1, 2); ent(273, 4, 1, dataOff); ent(277, 3, 1, 4); ent(278, 4, 1, h); ent(279, 4, 1, n); ent(282, 5, 1, xresOff); ent(283, 5, 1, yresOff); ent(338, 3, 1, 2);
  // (ResolutionUnit omitted from the 12-entry table on purpose: unit defaults to inches)
  dv.setUint32(p, 0, true);
  [8, 8, 8, 8].forEach((v, i)=> dv.setUint16(bpsOff + i * 2, v, true));
  dv.setUint32(xresOff, Math.round(dpi), true); dv.setUint32(xresOff + 4, 1, true); dv.setUint32(yresOff, Math.round(dpi), true); dv.setUint32(yresOff + 4, 1, true);
  u8.set(px, dataOff);
  return new Blob([buf], { type:'image/tiff' });
}
function encodeBmp(c, dpi){
  const w = c.width, h = c.height, px = rgbaOf(c), hdr = 14 + 108, rowBytes = w * 4, size = hdr + rowBytes * h, buf = new ArrayBuffer(size), dv = new DataView(buf), u8 = new Uint8Array(buf);
  u8[0] = 0x42; u8[1] = 0x4D; dv.setUint32(2, size, true); dv.setUint32(10, hdr, true);
  dv.setUint32(14, 108, true); dv.setInt32(18, w, true); dv.setInt32(22, h, true); dv.setUint16(26, 1, true); dv.setUint16(28, 32, true); dv.setUint32(30, 3, true); dv.setUint32(34, rowBytes * h, true);
  const ppm = Math.round(dpi / 0.0254); dv.setInt32(38, ppm, true); dv.setInt32(42, ppm, true);
  dv.setUint32(54, 0x00FF0000, true); dv.setUint32(58, 0x0000FF00, true); dv.setUint32(62, 0x000000FF, true); dv.setUint32(66, 0xFF000000, true); dv.setUint32(70, 0x73524742, true);
  let o = hdr;
  for(let y = h - 1; y >= 0; y--) for(let x = 0; x < w; x++){ const i = (y * w + x) * 4; u8[o++] = px[i+2]; u8[o++] = px[i+1]; u8[o++] = px[i]; u8[o++] = px[i+3]; }
  return new Blob([buf], { type:'image/bmp' });
}
async function encodeIco(srcCanvas, sizes){
  const imgs = [];
  for(const s of sizes){
    const c = document.createElement('canvas'); c.width = c.height = s; const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    const r = Math.min(s / srcCanvas.width, s / srcCanvas.height), w = srcCanvas.width * r, h = srcCanvas.height * r;
    ctx.drawImage(srcCanvas, (s - w) / 2, (s - h) / 2, w, h);
    imgs.push({ s, bytes: await blobBytes(await canvasToBlob(c, 'image/png')) });
  }
  const head = 6 + imgs.length * 16, total = head + imgs.reduce((a, i)=> a + i.bytes.length, 0), buf = new ArrayBuffer(total), dv = new DataView(buf), u8 = new Uint8Array(buf);
  dv.setUint16(2, 1, true); dv.setUint16(4, imgs.length, true); let off = head;
  imgs.forEach((im, i)=>{ const e = 6 + i * 16; u8[e] = im.s >= 256 ? 0 : im.s; u8[e+1] = im.s >= 256 ? 0 : im.s; dv.setUint16(e+4, 1, true); dv.setUint16(e+6, 32, true); dv.setUint32(e+8, im.bytes.length, true); dv.setUint32(e+12, off, true); u8.set(im.bytes, off); off += im.bytes.length; });
  return new Blob([buf], { type:'image/x-icon' });
}


/* ---- GIF (median-cut palette, optional Floyd-Steinberg dithering, 1-bit transparency) ---- */
function encodeGif(c, dither){
  const w = c.width, h = c.height, px = rgbaOf(c), n = w * h;
  let transparent = false; for(let i = 3; i < px.length; i += 4) if(px[i] < 128){ transparent = true; break; }
  const hist = new Uint32Array(32768);
  for(let i = 0; i < px.length; i += 4) if(px[i+3] >= 128) hist[((px[i] >> 3) << 10) | ((px[i+1] >> 3) << 5) | (px[i+2] >> 3)]++;
  let bins = []; for(let k = 0; k < 32768; k++) if(hist[k]) bins.push(k);
  const want = transparent ? 255 : 256;
  const chan = (k, ch)=> ch === 0 ? (k >> 10) & 31 : ch === 1 ? (k >> 5) & 31 : k & 31;
  let boxes = [bins.length ? bins : [0]];
  while(boxes.length < want){
    let bi = -1, best = -1, bc = 0;
    boxes.forEach((b, i)=>{ if(b.length < 2) return; for(let ch = 0; ch < 3; ch++){ let lo = 31, hi = 0; b.forEach(k=>{ const v = chan(k, ch); if(v < lo) lo = v; if(v > hi) hi = v; }); if(hi - lo > best){ best = hi - lo; bi = i; bc = ch; } } });
    if(bi < 0 || best <= 0) break;
    const b = boxes[bi].slice().sort((x, y)=> chan(x, bc) - chan(y, bc)); let tot = 0; b.forEach(k=> tot += hist[k]);
    let acc = 0, cut = 1; for(let i = 0; i < b.length - 1; i++){ acc += hist[b[i]]; if(acc >= tot / 2){ cut = i + 1; break; } cut = i + 1; }
    boxes.splice(bi, 1, b.slice(0, cut), b.slice(cut));
  }
  const pal = boxes.map(b=>{ let r = 0, g = 0, bl = 0, t = 0; b.forEach(k=>{ const cnt = hist[k] || 1; r += chan(k, 0) * cnt; g += chan(k, 1) * cnt; bl += chan(k, 2) * cnt; t += cnt; }); return [Math.round(r / t * 8 + 4), Math.round(g / t * 8 + 4), Math.round(bl / t * 8 + 4)].map(v=> Math.min(255, v)); });
  if(transparent) pal.unshift([0, 0, 0]);
  while(pal.length < 256) pal.push([0, 0, 0]);
  const cache = new Int16Array(32768).fill(-1), start = transparent ? 1 : 0, count = boxes.length + start;
  const nearest = (r, g, b)=>{
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3); if(!dither && cache[key] >= 0) return cache[key];
    let bi = start, bd = 1e9; for(let i = start; i < count; i++){ const p = pal[i], d = (p[0] - r) * (p[0] - r) + (p[1] - g) * (p[1] - g) + (p[2] - b) * (p[2] - b); if(d < bd){ bd = d; bi = i; } }
    if(!dither) cache[key] = bi; return bi;
  };
  const idx = new Uint8Array(n);
  if(dither){
    const err = new Float32Array(w * 6), cur = (y)=> (y & 1) * w * 3; // two rows of error buffers
    let e0 = new Float32Array(w * 3), e1 = new Float32Array(w * 3);
    for(let y = 0; y < h; y++){
      e1.fill(0);
      for(let x = 0; x < w; x++){
        const i = y * w + x, p = i * 4; if(px[p+3] < 128){ idx[i] = 0; continue; }
        const r = Math.max(0, Math.min(255, px[p] + e0[x*3])), g = Math.max(0, Math.min(255, px[p+1] + e0[x*3+1])), b = Math.max(0, Math.min(255, px[p+2] + e0[x*3+2]));
        const k = nearest(r | 0, g | 0, b | 0); idx[i] = k; const q = pal[k], er = r - q[0], eg = g - q[1], eb = b - q[2];
        if(x + 1 < w){ e0[(x+1)*3] += er * 7/16; e0[(x+1)*3+1] += eg * 7/16; e0[(x+1)*3+2] += eb * 7/16; }
        if(x > 0){ e1[(x-1)*3] += er * 3/16; e1[(x-1)*3+1] += eg * 3/16; e1[(x-1)*3+2] += eb * 3/16; }
        e1[x*3] += er * 5/16; e1[x*3+1] += eg * 5/16; e1[x*3+2] += eb * 5/16;
        if(x + 1 < w){ e1[(x+1)*3] += er / 16; e1[(x+1)*3+1] += eg / 16; e1[(x+1)*3+2] += eb / 16; }
      }
      const t = e0; e0 = e1; e1 = t;
    }
  } else for(let i = 0; i < n; i++){ const p = i * 4; idx[i] = px[p+3] < 128 ? 0 : nearest(px[p], px[p+1], px[p+2]); }
  // --- write file ---
  const out = []; const w16 = v=> out.push(v & 255, (v >> 8) & 255);
  out.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61); w16(w); w16(h); out.push(0xF7, 0, 0);
  pal.forEach(p=> out.push(p[0], p[1], p[2]));
  if(transparent) out.push(0x21, 0xF9, 4, 0x09, 0, 0, 0, 0);
  out.push(0x2C); w16(0); w16(0); w16(w); w16(h); out.push(0, 8);
  // LZW
  const CLEAR = 256, EOI = 257; let codeSize = 9, nextCode = 258, dict = new Map(), bitBuf = 0, bitCnt = 0; const bytes = [];
  const emit = code=>{ bitBuf |= code << bitCnt; bitCnt += codeSize; while(bitCnt >= 8){ bytes.push(bitBuf & 255); bitBuf >>>= 8; bitCnt -= 8; } };
  emit(CLEAR); let prefix = idx[0];
  for(let i = 1; i < n; i++){
    const k = idx[i], key = prefix * 256 + k, found = dict.get(key);
    if(found !== undefined){ prefix = found; continue; }
    emit(prefix);
    if(nextCode < 4096){ dict.set(key, nextCode++); if(nextCode - 1 === (1 << codeSize) && codeSize < 12) codeSize++; }
    else { emit(CLEAR); dict = new Map(); nextCode = 258; codeSize = 9; }
    prefix = k;
  }
  emit(prefix); emit(EOI); if(bitCnt > 0) bytes.push(bitBuf & 255);
  for(let i = 0; i < bytes.length; i += 255){ const len = Math.min(255, bytes.length - i); out.push(len); for(let j = 0; j < len; j++) out.push(bytes[i + j]); }
  out.push(0, 0x3B);
  return new Blob([new Uint8Array(out)], { type:'image/gif' });
}

/* ====================== text -> outlines (opentype.js) ====================== */
const fontCache = new Map();
function fontFile(name, bold){
  const m = MS.fontMeta && MS.fontMeta[name]; if(!m || !m.f) return null;
  const w = bold ? (m.f[700] ? 700 : (m.f[400] ? 400 : +Object.keys(m.f)[0])) : (m.f[400] ? 400 : +Object.keys(m.f)[0]);
  return m.f[w] ? { path:'fonts/' + m.f[w], key:name + ':' + w } : null;
}
async function loadFont(name, bold){
  const f = fontFile(name, bold); if(!f) return null;
  if(fontCache.has(f.key)) return fontCache.get(f.key);
  const p = fetch(f.path).then(r=>{ if(!r.ok) throw new Error('font'); return r.arrayBuffer(); }).then(b=> opentype.parse(b)).catch(()=> null);
  fontCache.set(f.key, p); return p;
}
MS.loadFont = loadFont;
function textsIn(objs, out){
  (objs || []).forEach(o=>{ if(o.type === 'group' || o.type === 'activeSelection') textsIn(o._objects, out); else if(o.isType && (o.isType('text') || o.isType('i-text') || o.isType('textbox'))) out.push(o); });
  return out;
}
function boldOf(t){ return t.fontWeight === 'bold' || +t.fontWeight >= 600; }
function glyphCommands(t, font){
  t.initDimensions && t.initDimensions();
  const cmds = [], fs = t.fontSize, w = t.width, h = t.height, lines = t._textLines || [], cb = t.__charBounds || [];
  let lh = 0;
  const upper = false;
  for(let i = 0; i < lines.length; i++){
    const hol = t.getHeightOfLine(i), maxH = hol / t.lineHeight, base = -h/2 + lh + maxH - hol * (t._fontSizeFraction || .222) / t.lineHeight;
    const lo = t._getLineLeftOffset(i);
    (lines[i] || []).forEach((ch, j)=>{
      const b = cb[i] && cb[i][j]; if(!b || ch === ' ' || ch === '\n') return;
      const x = -w/2 + lo + b.left;
      const path = font.getPath(ch, x, base, fs);
      path.commands.forEach(c=> cmds.push(c));
    });
    if(t.underline || t.linethrough){
      const lw = t.getLineWidth ? t.getLineWidth(i) : 0, y = t.underline ? base + fs * .09 : base - fs * .3, th = Math.max(1, fs / 18);
      cmds.push({ type:'M', x:-w/2 + lo, y }, { type:'L', x:-w/2 + lo + lw, y }, { type:'L', x:-w/2 + lo + lw, y:y + th }, { type:'L', x:-w/2 + lo, y:y + th }, { type:'Z' });
    }
    lh += hol;
  }
  return cmds;
}
function cmdsToD(cmds, m){
  const P = (x, y)=>{ if(!m) return +x.toFixed(2) + ' ' + +y.toFixed(2); const p = fabric.util.transformPoint(new fabric.Point(x, y), m); return +p.x.toFixed(2) + ' ' + +p.y.toFixed(2); };
  return cmds.map(c=> c.type === 'M' ? 'M' + P(c.x, c.y) : c.type === 'L' ? 'L' + P(c.x, c.y) : c.type === 'C' ? 'C' + P(c.x1, c.y1) + ' ' + P(c.x2, c.y2) + ' ' + P(c.x, c.y) : c.type === 'Q' ? 'Q' + P(c.x1, c.y1) + ' ' + P(c.x, c.y) : 'Z').join('');
}
async function fontsFor(texts){
  const bad = new Set(), map = new Map();
  for(const t of texts){ const f = await loadFont(t.fontFamily, boldOf(t)); if(f) map.set(t, f); else bad.add(t.fontFamily); }
  return { map, bad };
}
MS.textToPaths = async function(){
  const c = cv(), sel = c.getActiveObjects(); if(!sel.length){ toast('Select some text first.'); return; }
  const texts = textsIn(sel, []); if(!texts.length){ toast('The selection has no text.'); return; }
  const { map, bad } = await fontsFor(texts);
  if(bad.size) toast('Can’t outline system fonts (' + [...bad].join(', ') + ') — use a bundled font.', 4500, 'err');
  const top = sel.filter(o=> textsIn([o], []).length);
  c.discardActiveObject(); const made = [];
  top.forEach(o=>{
    const ts = textsIn([o], []).filter(t=> map.has(t)); if(!ts.length) return;
    const parts = ts.map(t=>{
      const d = cmdsToD(glyphCommands(t, map.get(t)), t.calcTransformMatrix());
      const p = new fabric.Path(d, { fill: typeof t.fill === 'string' ? t.fill : '#000', stroke:t.stroke, strokeWidth:t.strokeWidth || 0, strokeLineJoin:t.strokeLineJoin, paintFirst:t.paintFirst, opacity:t.opacity, shadow:t.shadow, strokeUniform:true, objectCaching:false });
      return p;
    });
    const idx = c.getObjects().indexOf(o); c.remove(o);
    const obj = parts.length === 1 ? parts[0] : new fabric.Group(parts); obj.name = (o.name || 'Text') + ' (outlines)'; obj.__outlined = true;
    c.add(obj); c.moveTo(obj, idx); made.push(obj);
  });
  c.requestRenderAll(); if(made.length){ MS.ops.select(made); MS.commit('Convert text to outlines'); toast('Text converted to vector outlines.'); }
};

/* ====================== SVG build ====================== */
async function buildSVG(o){
  const c = cv(), d = S.doc, texts = textsIn(c.getObjects(), []).filter(t=> t.visible !== false);
  const notes = [];
  const patched = [];
  if(o.outline && texts.length){
    const { map, bad } = await fontsFor(texts);
    if(bad.size) notes.push('System fonts can’t be outlined (' + [...bad].join(', ') + ') — they stay as live text.');
    texts.forEach(t=>{
      const f = map.get(t); if(!f) return;
      const orig = t.toSVG; const d2 = cmdsToD(glyphCommands(t, f), null);
      const fill = typeof t.fill === 'string' && t.fill ? t.fill : (t.fill && t.fill.colorStops ? t.fill.colorStops[0].color : 'none');
      const stroke = t.stroke ? ` stroke="${t.stroke}" stroke-width="${t.strokeWidth || 0}" stroke-linejoin="${t.strokeLineJoin || 'miter'}"` + (t.paintFirst === 'stroke' ? ' paint-order="stroke"' : '') : '';
      t.toSVG = function(r){ const m = orig.call(this, r); return m.replace(/<text[\s\S]*?<\/text>/, `<path d="${d2}" fill="${fill}"${stroke}/>`); };
      patched.push(t);
    });
  }
  // distressed layers can't be expressed as vectors: bake them into pictures
  const distressed = c.getObjects().filter(x=> x.__fx && x.__fx.distress);
  distressed.forEach(x=>{
    const b = x.getBoundingRect(true, true), mult = Math.min(3, 2400 / Math.max(b.width, b.height));
    const url = MS.renderThumb(x, mult), orig = x.toSVG;
    x.toSVG = function(){ return `<image x="${b.left}" y="${b.top}" width="${b.width}" height="${b.height}" xlink:href="${url}" preserveAspectRatio="none"/>`; };
    patched.push(x);
  });
  if(distressed.length) notes.push(distressed.length + ' distressed layer(s) were baked into pictures inside the SVG.');
  const keepV = c.viewportTransform.slice(); S.exporting = true; c.viewportTransform = [1, 0, 0, 1, 0, 0];
  let svg;
  try{
    svg = c.toSVG({ viewBox:{ x:0, y:0, width:d.wPx, height:d.hPx }, width:o.wPx + 'px', height:o.hPx + 'px', suppressPreamble:false });
  } finally { c.viewportTransform = keepV; c.calcViewportBoundaries(); S.exporting = false; patched.forEach(t=>{ delete t.toSVG; }); c.requestRenderAll(); }
  if(o.background){ svg = svg.replace(/(<svg[^>]*>)/, `$1\n<rect x="0" y="0" width="${d.wPx}" height="${d.hPx}" fill="${o.background}"/>`); }
  if(o.title) svg = svg.replace(/(<svg[^>]*>)/, `$1\n<title>${MS.esc(o.title)}</title>`);
  return { svg, notes };
}

async function buildPDF(o){
  const { svg } = await buildSVG(Object.assign({}, o, { outline:true }));
  const { jsPDF } = window.jspdf, d = S.doc;
  const wpt = d.mode === 'print' ? d.wIn * 72 : d.wPx * .75, hpt = d.mode === 'print' ? d.hIn * 72 : d.hPx * .75;
  const doc = new jsPDF({ unit:'pt', format:[wpt, hpt], orientation: wpt > hpt ? 'l' : 'p', compress:true });
  const holder = document.createElement('div'); holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:10px;height:10px;overflow:hidden';
  holder.innerHTML = svg; document.body.appendChild(holder);
  try{ await window.svg2pdf.svg2pdf(holder.querySelector('svg'), doc, { x:0, y:0, width:wpt, height:hpt }); } finally { holder.remove(); }
  return doc.output('blob');
}

/* ====================== settings model ====================== */
const FORMATS = [
  { id:'png',  label:'PNG',  sub:'Lossless · transparency', ext:'png',  mime:'image/png',  alpha:true,  lossy:false },
  { id:'jpg',  label:'JPG',  sub:'Small photos', ext:'jpg', mime:'image/jpeg', alpha:false, lossy:true },
  { id:'webp', label:'WebP', sub:'Small + transparency', ext:'webp', mime:'image/webp', alpha:true, lossy:true },
  { id:'svg',  label:'SVG',  sub:'Vector · games/decals', ext:'svg', mime:'image/svg+xml', alpha:true, vector:true },
  { id:'pdf',  label:'PDF',  sub:'Vector print file', ext:'pdf', mime:'application/pdf', alpha:true, vector:true },
  { id:'tiff', label:'TIFF', sub:'Print / pre-press', ext:'tif', mime:'image/tiff', alpha:true },
  { id:'bmp',  label:'BMP',  sub:'Uncompressed', ext:'bmp', mime:'image/bmp', alpha:true },
  { id:'gif',  label:'GIF',  sub:'256 colours · web', ext:'gif', mime:'image/gif', alpha:true },
  { id:'ico',  label:'ICO',  sub:'Icon (16–256 px)', ext:'ico', mime:'image/x-icon', alpha:true },
  { id:'avif', label:'AVIF', sub:'Tiny · modern', ext:'avif', mime:'image/avif', alpha:true, lossy:true, optional:true },
];
let avifOK = null;
function detectAvif(){ return new Promise(res=>{ const c = document.createElement('canvas'); c.width = c.height = 2; c.toBlob(b=> res(!!b && b.type === 'image/avif'), 'image/avif', .5); }); }

const X = MS.exportState = Object.assign({ fmt:'png', dpi:300, quality:85, bg:'transparent', bgColor:'#ffffff', limitOn:false, limit:2, limitUnit:'MB', outline:true, dest:'auto', suffix:false, wPx:0, hPx:0, name:'' }, MS.store.get('export', {}));

function longSideIn(){ return Math.max(S.doc.wIn, S.doc.hIn); }
function initSize(){
  const d = S.doc;
  if(d.mode === 'print'){ X.wPx = Math.round(d.wIn * X.dpi); X.hPx = Math.round(d.hIn * X.dpi); }
  else { const sc = Math.max(1, Math.round(1600 / Math.max(d.wPx, d.hPx) * 10) / 10); X.wPx = Math.round(d.wPx * Math.min(sc, 2)); X.hPx = Math.round(d.hPx * Math.min(sc, 2)); }
}
function multiplier(){ return X.wPx / S.doc.wPx; }
function bgValue(fmt){
  if(fmt && !fmt.alpha) return X.bg === 'transparent' ? '#ffffff' : (X.bg === 'garment' ? (MS.garmentValue() || '#ffffff') : X.bgColor);
  if(X.bg === 'garment') return MS.garmentValue() || null; if(X.bg === 'white') return '#ffffff'; if(X.bg === 'custom') return X.bgColor; return null;
}
const MAX_SIDE = 16384, MAX_AREA = 268000000;
async function rasterCanvas(mult, fmt){
  const d = S.doc, w = Math.round(d.wPx * mult), h = Math.round(d.hPx * mult);
  if(w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_AREA) throw new Error('That size is bigger than the browser can render (' + w + '×' + h + '). Lower the pixel size or DPI.');
  return MS.renderArtboard({ multiplier:mult, background:bgValue(fmt) });
}
async function encode(fmtId, opts){
  opts = opts || {}; const fmt = FORMATS.find(f=>f.id === fmtId), mult = opts.mult || multiplier(), q = (opts.quality !== undefined ? opts.quality : X.quality) / 100;
  const dpi = S.doc.mode === 'print' ? Math.round((X.wPx / S.doc.wIn)) : 96;
  if(fmtId === 'svg'){ const r = await buildSVG({ outline:X.outline, wPx:Math.round(S.doc.wPx * mult), hPx:Math.round(S.doc.hPx * mult), background:bgValue(fmt), title:S.doc.name }); return { blob:new Blob([r.svg], { type:'image/svg+xml' }), notes:r.notes }; }
  if(fmtId === 'pdf'){ const b = await buildPDF({ wPx:S.doc.wPx, hPx:S.doc.hPx, background:bgValue(fmt) }); return { blob:b, notes:[] }; }
  const c = await rasterCanvas(mult, fmt);
  let blob;
  if(fmtId === 'png'){ blob = await canvasToBlob(c, 'image/png'); const b = await blobBytes(blob); blob = new Blob([setPngDpi(b, dpi)], { type:'image/png' }); }
  else if(fmtId === 'jpg'){ blob = await canvasToBlob(c, 'image/jpeg', q); const b = await blobBytes(blob); blob = new Blob([setJpegDpi(b, dpi)], { type:'image/jpeg' }); }
  else if(fmtId === 'webp' || fmtId === 'avif') blob = await canvasToBlob(c, fmt.mime, q);
  else if(fmtId === 'tiff') blob = encodeTiff(c, dpi);
  else if(fmtId === 'bmp') blob = encodeBmp(c, dpi);
  else if(fmtId === 'gif') blob = encodeGif(c, true);
  else if(fmtId === 'ico') blob = await encodeIco(c, [16, 24, 32, 48, 64, 128, 256]);
  return { blob, notes:[], w:c.width, h:c.height };
}
// fit under a size limit by lowering quality, then (if still too big) shrinking pixel size
async function encodeToLimit(fmtId, limitBytes, onStep){
  const fmt = FORMATS.find(f=>f.id === fmtId); let mult = multiplier(), tries = 0;
  if(fmt.vector){ return encode(fmtId); }
  for(;;){
    if(fmt.lossy){
      let lo = 5, hi = X.quality, best = null;
      let r = await encode(fmtId, { mult, quality:hi }); onStep && onStep(); if(r.blob.size <= limitBytes) return Object.assign(r, { mult, quality:hi });
      for(let i = 0; i < 7; i++){ const mid = Math.round((lo + hi) / 2); r = await encode(fmtId, { mult, quality:mid }); onStep && onStep(); if(r.blob.size <= limitBytes){ best = Object.assign(r, { mult, quality:mid }); lo = mid + 1; } else hi = mid - 1; if(lo > hi) break; }
      if(best) return best;
    } else { const r = await encode(fmtId, { mult }); onStep && onStep(); if(r.blob.size <= limitBytes) return Object.assign(r, { mult }); }
    mult *= .85; tries++;
    if(tries > 14 || S.doc.wPx * mult < 16) throw new Error('Could not get under that size — try a larger limit.');
  }
}
const limitBytes = ()=> X.limit * (X.limitUnit === 'MB' ? 1048576 : 1024);

/* ====================== dialog ====================== */
let dlg = null, estTimer = null, estToken = 0, lastEnc = null;
const animated = ()=> !!(MS.anim && Object.keys(MS.anim.state.tracks).length);
MS.openExport = async function(fmtId){
  if(dlg) return;
  if(fmtId === 'gif' && animated()){ MS.anim.openExport(); return; }
  if(avifOK === null) avifOK = await detectAvif();
  X.dpi = X.dpi || 300; if(fmtId) X.fmt = fmtId;
  if(X.fmt === 'avif' && !avifOK) X.fmt = 'png';
  X.name = S.doc.name || 'design'; initSize();
  const fmts = FORMATS.filter(f=> !f.optional || avifOK);
  const body = document.createElement('div'); body.style.cssText = 'display:grid;grid-template-columns:1fr 280px;gap:18px';
  body.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px;min-width:0">
      <div><div class="hint" style="margin-bottom:6px">Format</div><div class="fmt-grid" id="xFmts">${fmts.map(f=>`<div class="fmt" data-f="${f.id}"><b>${f.label}</b><small>${f.sub}</small></div>`).join('')}</div></div>
      <div class="r"><label style="width:70px">File name</label><input type="text" class="grow" id="xName" spellcheck="false"><span class="muted" id="xExt" style="width:42px">.png</span></div>
      <div id="xSizeBox">
        <div class="hint" style="margin-bottom:6px">Size</div>
        <div class="r two"><div class="f"><span>W</span><input type="number" id="xW" min="1"><em>px</em></div><div class="f"><span>H</span><input type="number" id="xH" min="1"><em>px</em></div></div>
        <div class="chips" id="xScales" style="margin-top:7px"></div>
        <div class="r" id="xPrintRow" style="margin-top:7px"><label style="width:70px">Print size</label><div class="f" style="width:84px"><input type="number" id="xIn" min=".1" step=".25" style="padding-left:8px"><em>in</em></div><label style="width:36px;text-align:right">DPI</label>
          <select id="xDpi" style="width:90px"><option value="72">72</option><option value="150">150</option><option value="300">300</option><option value="600">600</option><option value="1200">1200</option></select><span class="hint" id="xDpiNote"></span></div>
      </div>
      <div id="xQualBox"><div class="r"><label style="width:70px">Quality</label><input type="range" id="xQ" min="5" max="100"><div class="f" style="width:60px"><input type="number" id="xQn" min="5" max="100"><em>%</em></div></div></div>
      <div id="xLimitBox"><label class="chk"><input type="checkbox" id="xLimitOn"> Keep the file under <span class="f" style="display:inline-flex;width:78px;margin:0 4px"><input type="number" id="xLimit" min="1" style="padding-left:8px"></span><select id="xLimitU" style="width:64px"><option>KB</option><option>MB</option></select></label><div class="hint" id="xLimitNote" style="margin-top:3px">The app lowers quality (then size) automatically until the file fits.</div></div>
      <div id="xBgBox"><div class="r"><label style="width:70px">Background</label><select id="xBg" class="grow"><option value="transparent">Transparent</option><option value="garment">Garment colour (mockup)</option><option value="white">White</option><option value="custom">Custom colour…</option></select><span class="swatch-in" id="xBgSw" style="display:none"><input type="color" id="xBgC" value="#ffffff"></span></div></div>
      <div id="xSvgBox" style="display:none"><label class="chk"><input type="checkbox" id="xOutline"> Convert text to outlines <span class="muted">(needed for Gran Turismo, cutters, print shops)</span></label><div class="hint" id="xSvgNote" style="margin-top:3px"></div></div>
      <div class="r"><label style="width:70px">Save to</label><select id="xDest" class="grow"><option value="auto">MERCH folder (automatic, never overwrites)</option><option value="ask">Let me choose folder &amp; name (Save As…)</option><option value="download">Browser download</option></select></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;min-width:0">
      <div class="exp-prev" id="xPrev"></div>
      <div class="exp-summary"><div><small>Pixels</small><div class="big" id="xPx">—</div></div><div><small>File size</small><div class="big" id="xSize">—</div></div></div>
      <div id="xMsg"></div>
      <button class="btn sm" id="xCalc"><i data-i="gear"></i>Calculate exact size</button>
      <div class="progress hidden" id="xProg"><i></i></div>
    </div>`;
  dlg = MS.modal({ title:'Export', wide:true, body, buttons:[{ spacer:true, id:'xInfo' }, { label:'Cancel' }, { label:'Export', primary:true, id:'xGo', icon:'export', keepOpen:true, action:(api, btn)=>{ doExport(api, btn); return false; } }], onClose:()=>{ dlg = null; clearTimeout(estTimer); estToken++; lastEnc = null; MS.store.set('export', { fmt:X.fmt, dpi:X.dpi, quality:X.quality, bg:X.bg, bgColor:X.bgColor, limitOn:X.limitOn, limit:X.limit, limitUnit:X.limitUnit, outline:X.outline, dest:X.dest }); } });
  wireDialog(body); syncDialog(body); schedule();
};

function wireDialog(root){
  const q = id=> $('#' + id, root), d = S.doc;
  $$('#xFmts .fmt', root).forEach(el=> el.onclick = ()=>{ if(el.dataset.f === 'gif' && animated()){ dlg && dlg.close(); MS.anim.openExport(); return; } X.fmt = el.dataset.f; syncDialog(root); schedule(); });
  q('xName').oninput = e=> { X.name = e.target.value; };
  const setW = w=>{ X.wPx = Math.max(1, Math.round(w)); X.hPx = Math.max(1, Math.round(X.wPx * d.hPx / d.wPx)); X.dpi = d.mode === 'print' ? Math.round(X.wPx / d.wIn) : X.dpi; syncDialog(root, true); schedule(); };
  q('xW').oninput = e=> setW(+e.target.value || 1);
  q('xH').oninput = e=>{ const h = Math.max(1, +e.target.value || 1); setW(h * d.wPx / d.hPx); };
  q('xIn').oninput = e=>{ const w = Math.max(.1, +e.target.value || .1); setW(w * (d.mode === 'print' ? X.dpi : 100)); };
  q('xDpi').onchange = e=>{ X.dpi = +e.target.value; X.wPx = Math.round(d.wIn * X.dpi); X.hPx = Math.round(d.hIn * X.dpi); syncDialog(root); schedule(); };
  q('xQ').oninput = e=>{ X.quality = +e.target.value; q('xQn').value = X.quality; schedule(); }; q('xQn').oninput = e=>{ X.quality = clamp(+e.target.value || 85, 5, 100); q('xQ').value = X.quality; MS.fillRange(q('xQ')); schedule(); };
  q('xLimitOn').onchange = e=>{ X.limitOn = e.target.checked; schedule(); }; q('xLimit').oninput = e=>{ X.limit = Math.max(1, +e.target.value || 1); schedule(); }; q('xLimitU').onchange = e=>{ X.limitUnit = e.target.value; schedule(); };
  q('xBg').onchange = e=>{ X.bg = e.target.value; q('xBgSw').style.display = X.bg === 'custom' ? '' : 'none'; schedule(); }; q('xBgC').oninput = e=>{ X.bgColor = e.target.value; schedule(); };
  q('xOutline').onchange = e=>{ X.outline = e.target.checked; schedule(); }; q('xDest').onchange = e=>{ X.dest = e.target.value; };
  q('xCalc').onclick = ()=> estimate(root, true);
}
function syncDialog(root, keepInputs){
  const q = id=> $('#' + id, root), f = FORMATS.find(x=>x.id === X.fmt), d = S.doc;
  $$('#xFmts .fmt', root).forEach(el=> el.classList.toggle('active', el.dataset.f === X.fmt));
  q('xExt').textContent = '.' + f.ext; if(!keepInputs || document.activeElement !== q('xName')) q('xName').value = X.name;
  const raster = !f.vector && X.fmt !== 'ico';
  q('xSizeBox').style.display = (raster || X.fmt === 'svg') ? '' : 'none';
  if(X.fmt === 'pdf'){ q('xSizeBox').style.display = 'none'; }
  if(!keepInputs || document.activeElement !== q('xW')) q('xW').value = X.wPx; if(!keepInputs || document.activeElement !== q('xH')) q('xH').value = X.hPx;
  q('xPrintRow').style.display = d.mode === 'print' && X.fmt !== 'svg' ? '' : 'none';
  if(!keepInputs || document.activeElement !== q('xIn')) q('xIn').value = +(X.wPx / (d.mode === 'print' ? Math.max(X.dpi, 1) : 100)).toFixed(2);
  q('xDpi').value = [72, 150, 300, 600, 1200].includes(X.dpi) ? X.dpi : ''; q('xDpiNote').textContent = d.mode === 'print' ? '= ' + Math.round(X.wPx / d.wIn) + ' dpi' : '';
  q('xScales').innerHTML = [.5, 1, 2, 3, 4].map(s=>`<span class="chip ${Math.abs(X.wPx / d.wPx - s) < .01 ? 'active' : ''}" data-s="${s}">${s}× <span class="muted" style="color:inherit;opacity:.7">${Math.round(d.wPx * s)}px</span></span>`).join('');
  $$('#xScales .chip', root).forEach(ch=> ch.onclick = ()=>{ X.wPx = Math.round(d.wPx * +ch.dataset.s); X.hPx = Math.round(d.hPx * +ch.dataset.s); if(d.mode === 'print') X.dpi = Math.round(X.wPx / d.wIn); syncDialog(root); schedule(); });
  q('xQualBox').style.display = f.lossy ? '' : 'none'; q('xQ').value = X.quality; q('xQn').value = X.quality; MS.fillRange(q('xQ'));
  q('xLimitBox').style.display = (f.vector || X.fmt === 'ico' || X.fmt === 'bmp' || X.fmt === 'tiff') ? 'none' : '';
  q('xLimitOn').checked = X.limitOn; q('xLimit').value = X.limit; q('xLimitU').value = X.limitUnit;
  q('xBgBox').style.display = X.fmt === 'pdf' ? '' : ''; q('xBg').value = X.bg; q('xBgSw').style.display = X.bg === 'custom' ? '' : 'none'; q('xBgC').value = X.bgColor;
  q('xSvgBox').style.display = X.fmt === 'svg' ? '' : 'none'; q('xOutline').checked = X.outline;
  q('xSvgNote').textContent = X.outline ? 'Letters become plain vector shapes — they look identical on any computer and import cleanly into game livery editors.' : 'Text stays as live <text>; the viewer needs the same fonts installed.';
  q('xDest').value = X.dest;
  q('xPx').textContent = X.fmt === 'pdf' ? (d.mode === 'print' ? d.wIn + '×' + d.hIn + ' in' : d.wPx + '×' + d.hPx) : (X.fmt === 'svg' ? 'vector' : (X.fmt === 'ico' ? '256 max' : X.wPx + ' × ' + X.hPx));
  const mp = X.wPx * X.hPx / 1e6;
  const msgs = [];
  if(X.fmt === 'jpg' && X.bg === 'transparent') msgs.push('<div class="warnbox">JPG can’t be transparent — a white background will be used.</div>');
  if(['png','webp','avif','tiff','bmp'].includes(X.fmt) && (X.wPx > MAX_SIDE || X.hPx > MAX_SIDE || X.wPx * X.hPx > MAX_AREA)) msgs.push('<div class="warnbox">⚠ This size is larger than the browser can render. Lower it.</div>');
  else if(mp > 60 && !['svg','pdf'].includes(X.fmt)) msgs.push('<div class="warnbox">Very large image (' + mp.toFixed(0) + ' MP) — it will take a while and use a lot of memory.</div>');
  if(X.fmt === 'tiff' && mp > 80) msgs.push('<div class="warnbox">Uncompressed TIFF at this size is several hundred MB.</div>');
  if((X.fmt === 'svg' || X.fmt === 'pdf') && MS.compat){ const w = MS.compat.scan('vector').filter(i=> i.level === 'warn'); if(w.length) msgs.push('<div class="warnbox">' + w.length + ' thing(s) will not stay pure vector: ' + w.map(i=> MS.esc(i.text.replace('{n}', i.objs.length || ''))).slice(0, 3).join('; ') + '. See Canvas ▸ Build for ▸ Vector.</div>'); }
  if(X.fmt === 'svg') msgs.push('<div class="okbox">Vector: infinitely scalable. Embedded pictures stay as pictures.</div>');
  if(X.fmt === 'pdf') msgs.push('<div class="okbox">Vector PDF with text outlined, page size ' + (d.mode === 'print' ? d.wIn + '×' + d.hIn + ' in' : d.wPx + '×' + d.hPx + ' px') + '.</div>');
  q('xMsg').innerHTML = msgs.join('');
}
function schedule(){
  if(!dlg) return; const root = dlg.body; lastEnc = null;
  $('#xSize', root).textContent = '…'; clearTimeout(estTimer); estTimer = setTimeout(()=> estimate(root, false), 650); previewThumb(root);
}
let prevT = null;
function previewThumb(root){
  clearTimeout(prevT);
  prevT = setTimeout(()=>{
    try{ const el = MS.renderArtboard({ multiplier:Math.min(1, 280 / Math.max(S.doc.wPx, S.doc.hPx)), background:bgValue(FORMATS.find(f=>f.id === X.fmt)) }); const box = $('#xPrev', root); if(!box) return; box.innerHTML = ''; const im = new Image(); im.src = el.toDataURL(); box.appendChild(im); }catch(e){}
  }, 200);
}
async function estimate(root, exact){
  const tok = ++estToken, f = FORMATS.find(x=>x.id === X.fmt), out = $('#xSize', root); if(!out) return;
  const mp = X.wPx * X.hPx / 1e6;
  try{
    if(!exact && !f.vector && mp > 12){
      // quick estimate from a small render
      const m = Math.sqrt(4e6 / (X.wPx * X.hPx)) * multiplier(); const r = await encode(X.fmt, { mult:m });
      if(tok !== estToken) return; const factor = (X.wPx * X.hPx) / (r.w * r.h);
      out.textContent = '≈ ' + fmtBytes(Math.round(r.blob.size * (f.lossy || X.fmt === 'png' ? factor : factor))); return;
    }
    out.textContent = '…';
    const prog = $('#xProg', root); prog.classList.remove('hidden'); const bar = prog.firstElementChild; let n = 0; bar.style.width = '8%';
    const r = X.limitOn && !f.vector ? await encodeToLimit(X.fmt, limitBytes(), ()=>{ n++; bar.style.width = Math.min(95, 8 + n * 11) + '%'; }) : await encode(X.fmt);
    if(tok !== estToken) return;
    lastEnc = { r, key:JSON.stringify([X.fmt, X.wPx, X.quality, X.bg, X.bgColor, X.outline, X.limitOn, X.limit, X.limitUnit]) };
    out.textContent = fmtBytes(r.blob.size) + (r.mult && Math.abs(r.mult - multiplier()) > .005 ? '' : '');
    let extra = ''; if(r.mult && Math.abs(r.mult - multiplier()) > .005) extra += `<div class="warnbox">To fit the size limit the image was reduced to ${Math.round(S.doc.wPx * r.mult)} × ${Math.round(S.doc.hPx * r.mult)} px.</div>`; else if(r.quality !== undefined && r.quality < X.quality) extra += `<div class="okbox">Quality lowered to ${r.quality}% to fit the limit.</div>`;
    if(r.notes && r.notes.length) extra += r.notes.map(t=>`<div class="warnbox">${MS.esc(t)}</div>`).join('');
    const base = $('#xMsg', root); if(base) { syncDialog(root, true); $('#xMsg', root).innerHTML += extra; }
    bar.style.width = '100%'; setTimeout(()=> prog.classList.add('hidden'), 400);
  }catch(e){ if(tok === estToken){ out.textContent = '—'; $('#xMsg', root).innerHTML = `<div class="warnbox">${MS.esc(e.message || String(e))}</div>`; $('#xProg', root).classList.add('hidden'); } }
}

function safeName(){ let n = (X.name || S.doc.name || 'design').trim().replace(/\.(png|jpe?g|webp|avif|svg|pdf|tiff?|bmp|ico)$/i, '').replace(/[\\/:*?"<>|]+/g, '_'); return n || 'design'; }
async function doExport(api, btn){
  const f = FORMATS.find(x=>x.id === X.fmt); btn.disabled = true; const label = btn.innerHTML; btn.textContent = 'Rendering…';
  let handle = null;
  try{
    const filename = safeName() + '.' + f.ext;
    if(X.dest === 'ask' && window.showSaveFilePicker){
      try{ handle = await window.showSaveFilePicker({ id:'merch-export', suggestedName:filename, types:[{ description:f.label + ' file', accept:{ [f.mime]:['.' + f.ext] } }] }); }
      catch(e){ if(e && e.name === 'AbortError'){ btn.disabled = false; btn.innerHTML = label; return; } handle = null; }
    }
    const key = JSON.stringify([X.fmt, X.wPx, X.quality, X.bg, X.bgColor, X.outline, X.limitOn, X.limit, X.limitUnit]);
    let r = lastEnc && lastEnc.key === key ? lastEnc.r : (X.limitOn && !f.vector ? await encodeToLimit(X.fmt, limitBytes()) : await encode(X.fmt));
    let msg;
    if(X.dest === 'download') { MS.download(r.blob, filename); msg = 'downloaded as ' + filename; }
    else msg = await MS.saveFile(r.blob, filename, handle);
    api.close(); toast('Exported ' + f.label + ' (' + fmtBytes(r.blob.size) + ') — ' + msg, 7000);
  }catch(e){ btn.disabled = false; btn.innerHTML = label; toast('Export failed: ' + (e.message || e), 6000, 'err'); }
}
MS.quickExport = async function(){
  const d = S.doc; X.name = d.name; initSize();
  try{ const f = FORMATS[0], r = await encode('png'); const msg = await MS.saveFile(r.blob, safeName() + '.png'); toast('Exported PNG (' + fmtBytes(r.blob.size) + ') — ' + msg, 6000); }catch(e){ toast('Export failed: ' + e.message, 5000, 'err'); }
};
// full-screen preview on the garment colour
MS.preview = function(){
  const g = MS.garmentValue(), mult = Math.min(2, 2400 / Math.max(S.doc.wPx, S.doc.hPx));
  const url = MS.renderArtboard({ multiplier:mult, background:g }).toDataURL('image/png');
  const ov = document.createElement('div');
  ov.style.cssText = `position:fixed;inset:0;z-index:2000;background:${g || 'repeating-conic-gradient(#3a3b45 0% 25%,#2b2c33 0% 50%) 50%/24px 24px'};display:flex;align-items:center;justify-content:center;cursor:zoom-out`;
  ov.innerHTML = `<img src="${url}" style="max-width:96vw;max-height:96vh;object-fit:contain;box-shadow:0 10px 60px rgba(0,0,0,.35)"><div style="position:fixed;top:10px;right:14px;font:12px Segoe UI;color:#fff;background:rgba(0,0,0,.55);padding:5px 10px;border-radius:6px">Click or press Esc to close</div>`;
  document.body.appendChild(ov);
  let stopAnim = null; if(animated()){ const im = ov.querySelector('img'), c = document.createElement('canvas'); c.style.cssText = im.style.cssText; im.replaceWith(c); stopAnim = MS.anim.runPreview(c, g, 1400); }
  const close = ()=>{ stopAnim && stopAnim(); document.removeEventListener('keydown', k, true); if(document.fullscreenElement) document.exitFullscreen().catch(()=>{}); ov.remove(); };
  const k = e=>{ if(e.key === 'Escape'){ e.stopPropagation(); close(); } };
  document.addEventListener('keydown', k, true); ov.addEventListener('click', close);
  try{ ov.requestFullscreen && ov.requestFullscreen().catch(()=>{}); }catch(e){}
};
MS.exportEncode = encode; MS.buildSVG = buildSVG; MS.exportFormats = FORMATS;
MS.initExport = function(){};
})();
