/* Merch Studio - procedural background "scenes" (stars, galaxy, aurora, synthwave ...) and a colour grade that can be laid over any baked background. */
(function(){
'use strict';
const MS = window.MS;
const clamp = (v, a, b)=> Math.max(a, Math.min(b, v));
function mulberry(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rgb = h=>{ h = String(h).replace('#', ''); if(h.length === 3) h = h.split('').map(x=> x + x).join(''); const n = parseInt(h, 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const css = (c, a)=> `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a === undefined ? 1 : a})`;
const mix = (a, b, t)=> [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c, t)=> t < 0 ? mix(c, [0, 0, 0], -t) : mix(c, [255, 255, 255], t);
const WHITE = [255, 255, 255];
function mk(w, h){ const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
function vgrad(ctx, w, h, stops){ const g = ctx.createLinearGradient(0, 0, 0, h); stops.forEach(([p, c])=> g.addColorStop(p, css(c))); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
function glow(ctx, x, y, r, c, a){ const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, css(c, a)); g.addColorStop(1, css(c, 0)); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
function dot(ctx, x, y, r, col, a){ ctx.fillStyle = css(col, a); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); }
function vnoise(gw, gh, cell, r){
  const nw = Math.ceil(gw / cell) + 2, nh = Math.ceil(gh / cell) + 2, g = new Float32Array(nw * nh); for(let i = 0; i < g.length; i++) g[i] = r();
  const out = new Float32Array(gw * gh);
  for(let y = 0; y < gh; y++) for(let x = 0; x < gw; x++){
    const fx = x / cell, fy = y / cell, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[iy * nw + ix], b = g[iy * nw + ix + 1], c = g[(iy + 1) * nw + ix], d = g[(iy + 1) * nw + ix + 1];
    out[y * gw + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  return out;
}
function fbm(gw, gh, cell, oct, r){
  const out = new Float32Array(gw * gh); let amp = 1, tot = 0;
  for(let o = 0; o < oct; o++){ const n = vnoise(gw, gh, Math.max(2, cell / (1 << o)), r); for(let i = 0; i < out.length; i++) out[i] += n[i] * amp; tot += amp; amp *= .5; }
  let lo = 1e9, hi = -1e9; for(let i = 0; i < out.length; i++){ out[i] /= tot; if(out[i] < lo) lo = out[i]; if(out[i] > hi) hi = out[i]; }
  const sp = (hi - lo) || 1; for(let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / sp;
  return out;
}
function field(gw, gh, fn){
  const c = mk(gw, gh), x = c.getContext('2d'), im = x.createImageData(gw, gh), d = im.data;
  for(let i = 0; i < gw * gh; i++){ const p = fn(i, i % gw, (i / gw) | 0); d[i * 4] = p[0]; d[i * 4 + 1] = p[1]; d[i * 4 + 2] = p[2]; d[i * 4 + 3] = p[3] === undefined ? 255 : p[3]; }
  x.putImageData(im, 0, 0); return c;
}
function up(ctx, src, w, h){ ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, w, h); }

// plain little dots - no sparkles
function dots(ctx, w, h, o, k, tint){
  const r = o.r, u = o.u, n = Math.round(w * h / 6000 * (.15 + o.dens * 2.6) * (k || 1));
  for(let i = 0; i < n; i++){
    const x = r() * w, y = r() * h, big = Math.pow(r(), 5), rad = u * (.55 + big * (1.2 + o.size * 3.2)) * (.7 + o.size * .7);
    const col = r() < .55 ? WHITE : (r() < .5 ? o.B : o.C);
    dot(ctx, x, y, rad, tint ? mix(col, tint, .3) : col, .4 + r() * .6);
  }
}

const S = {
  stars(ctx, w, h, o){ vgrad(ctx, w, h, [[0, shade(o.A, -.55)], [1, o.A]]); dots(ctx, w, h, o, 1); },
  galaxy(ctx, w, h, o){
    const gw = 240, gh = Math.max(40, Math.round(240 * h / w)), r = o.r, n1 = fbm(gw, gh, 46, 4, r), n2 = fbm(gw, gh, 30, 4, r);
    const nb = field(gw, gh, (i, x, y)=>{
      const u = x / gw, v = y / gh, band = Math.exp(-Math.pow(((u - .5) * .6 + (v - .5) * .8) / (.16 + o.size * .2), 2));
      const a = clamp(n1[i] * 1.5 - .35, 0, 1) * band, b = clamp(n2[i] * 1.5 - .35, 0, 1) * band * .9, c = mix(mix(o.A, o.B, a * 1.3), o.C, b);
      return [c[0], c[1], c[2]];
    });
    ctx.fillStyle = css(shade(o.A, -.3)); ctx.fillRect(0, 0, w, h); up(ctx, nb, w, h);
    ctx.globalCompositeOperation = 'screen'; glow(ctx, w * .5, h * .5, Math.max(w, h) * .25, mix(o.B, o.C, .5), .22); ctx.globalCompositeOperation = 'source-over';
    dots(ctx, w, h, o, 1.2);
  },
  moon(ctx, w, h, o){
    vgrad(ctx, w, h, [[0, shade(o.A, -.45)], [1, o.A]]); dots(ctx, w, h, o, .7);
    const x = w * .72, y = h * .26, R = Math.min(w, h) * (.07 + o.size * .1);
    glow(ctx, x, y, R * 4.5, o.B, .35);
    const g = ctx.createRadialGradient(x - R * .3, y - R * .3, R * .2, x, y, R); g.addColorStop(0, css(shade(o.B, .3))); g.addColorStop(1, css(shade(o.B, -.15)));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, 6.2832); ctx.fill();
    const r = o.r; for(let i = 0; i < 9; i++){ const a = r() * 6.28, d = r() * R * .7; dot(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, R * (.05 + r() * .12), shade(o.B, -.35), .35); }
  },
  aurora(ctx, w, h, o){
    vgrad(ctx, w, h, [[0, shade(o.A, -.3)], [1, mix(o.A, o.C, .12)]]); dots(ctx, w, h, o, .5);
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.filter = 'blur(' + Math.max(1, Math.round(w / 260)) + 'px)';
    const r = o.r, step = Math.max(2, w / 520), bands = 2 + Math.round(o.dens * 2);
    for(let b = 0; b < bands; b++){
      const col = b % 2 ? o.C : o.B, ph = r() * 6, base = h * (.28 + b * .1), amp = h * (.05 + o.size * .08);
      for(let x = 0; x <= w; x += step){
        const y = base + Math.sin(x / w * (2.2 + b) * Math.PI + ph) * amp + Math.sin(x / w * 9 + ph * 2) * amp * .25, len = h * (.22 + .12 * Math.sin(x / w * 5 + b) + .06 * r());
        const g = ctx.createLinearGradient(0, y - len * .15, 0, y + len); g.addColorStop(0, css(col, 0)); g.addColorStop(.15, css(col, .55)); g.addColorStop(1, css(col, 0));
        ctx.fillStyle = g; ctx.fillRect(x, y - len * .15, step + 1, len * 1.15);
      }
    }
    ctx.restore();
  },
  sunset(ctx, w, h, o){
    vgrad(ctx, w, h, [[0, o.A], [.55, o.B], [.78, o.C], [1, shade(o.C, .3)]]);
    const hz = h * .72, R = Math.min(w, h) * (.07 + o.size * .1); glow(ctx, w / 2, hz, R * 5, shade(o.C, .4), .6); dot(ctx, w / 2, hz - R * .2, R, shade(o.C, .55), 1);
    const r = o.r, dark = shade(o.A, -.7);
    for(let l = 0; l < 3; l++){ const ph = r() * 6, base = h * (.8 + l * .07), amp = h * (.03 + l * .015); ctx.fillStyle = css(mix(dark, o.A, .35 - l * .1)); ctx.beginPath(); ctx.moveTo(0, h);
      for(let x = 0; x <= w; x += w / 90) ctx.lineTo(x, base + Math.sin(x / w * (3 + l) + ph) * amp + Math.sin(x / w * 11 + ph) * amp * .3); ctx.lineTo(w, h); ctx.fill(); }
  },
  sunburst(ctx, w, h, o){
    ctx.fillStyle = css(o.A); ctx.fillRect(0, 0, w, h);
    const n = 8 + Math.round(o.dens * 36) * 2, R = Math.hypot(w, h), cx = w / 2, cy = h / 2;
    ctx.fillStyle = css(o.B); for(let i = 0; i < n; i += 2){ const a0 = i / n * 6.2832, a1 = (i + 1) / n * 6.2832; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R); ctx.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R); ctx.fill(); }
    glow(ctx, cx, cy, Math.max(w, h) * (.2 + o.size * .4), o.C, .8);
  },
  synthwave(ctx, w, h, o){
    const hz = h * .6; vgrad(ctx, w, hz, [[0, shade(o.A, -.35)], [1, mix(o.A, o.B, .75)]]);
    const R = h * (.14 + o.size * .12), sun = mk(w, h), sx = sun.getContext('2d'), g = sx.createLinearGradient(0, hz - R * 2, 0, hz); g.addColorStop(0, css(o.C)); g.addColorStop(1, css(o.B));
    sx.fillStyle = g; sx.beginPath(); sx.arc(w / 2, hz - R, R, 0, 6.2832); sx.fill(); sx.globalCompositeOperation = 'destination-out';
    for(let i = 1; i < 8; i++){ const y = hz - R * 2 + (R * 2) * (i / 8) * (.55 + i / 14), t = R * .035 * i; sx.fillRect(0, y, w, t); }
    glow(ctx, w / 2, hz - R, R * 3, o.B, .45); ctx.drawImage(sun, 0, 0);
    ctx.save(); ctx.beginPath(); ctx.rect(0, hz, w, h - hz); ctx.clip(); vgrad(ctx, w, h, [[0, shade(o.A, -.1)], [1, shade(o.A, -.6)]]);
    ctx.strokeStyle = css(o.C); ctx.shadowColor = css(o.B); ctx.shadowBlur = h * .012; ctx.lineWidth = Math.max(1, h * .0035);
    const nH = 6 + Math.round(o.dens * 14); for(let i = 1; i <= nH; i++){ const y = hz + (h - hz) * Math.pow(i / nH, 2.2); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    const nV = 10 + Math.round(o.dens * 20); for(let i = -nV; i <= nV; i++){ ctx.beginPath(); ctx.moveTo(w / 2 + i * w * .012, hz); ctx.lineTo(w / 2 + i * w * (.9 / nV * 1.4), h); ctx.stroke(); }
    ctx.restore();
  },
  bokeh(ctx, w, h, o){
    vgrad(ctx, w, h, [[0, shade(o.A, -.2)], [1, mix(o.A, o.B, .28)]]); ctx.globalCompositeOperation = 'screen';
    const r = o.r, n = 14 + Math.round(o.dens * 120), u = o.u;
    for(let i = 0; i < n; i++){ const x = r() * w, y = r() * h, rad = u * (10 + o.size * 80) * (.35 + r() * 1.1), col = r() < .4 ? o.B : r() < .6 ? o.C : WHITE;
      dot(ctx, x, y, rad, col, .06 + r() * .22); ctx.strokeStyle = css(col, .18 + r() * .2); ctx.lineWidth = Math.max(1, rad * .06); ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.2832); ctx.stroke(); }
    ctx.globalCompositeOperation = 'source-over';
  },
  snow(ctx, w, h, o){
    vgrad(ctx, w, h, [[0, shade(o.A, -.35)], [1, mix(o.A, o.C, .25)]]);
    const r = o.r, u = o.u, n = Math.round(w * h / 5000 * (.1 + o.dens * 1.3));
    for(let i = 0; i < n; i++){ const big = Math.pow(r(), 3), rad = u * (.8 + big * (2 + o.size * 9)); const x = r() * w, y = r() * h; if(rad > 4 * u) glow(ctx, x, y, rad * 1.6, o.B, .5); else dot(ctx, x, y, rad, o.B, .5 + r() * .5); }
  },
  rain(ctx, w, h, o){
    vgrad(ctx, w, h, [[0, shade(o.A, -.25)], [1, mix(o.A, o.B, .35)]]);
    const r = o.r, u = o.u, n = Math.round(w * h / 6000 * (.1 + o.dens * 1.4)); ctx.lineCap = 'round';
    for(let i = 0; i < n; i++){ const x = r() * w, y = r() * h, len = u * (22 + o.size * 70) * (.5 + r()); ctx.strokeStyle = css(r() < .3 ? o.C : o.B, .12 + r() * .35); ctx.lineWidth = u * (.8 + r() * 1.4); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len * .22, y + len); ctx.stroke(); }
    glow(ctx, w / 2, h, Math.max(w, h) * .6, o.B, .25);
  },
  embers(ctx, w, h, o){
    vgrad(ctx, w, h, [[0, shade(o.A, -.2)], [1, mix(o.A, o.B, .45)]]); glow(ctx, w / 2, h * 1.02, Math.max(w, h) * .6, o.B, .55);
    const r = o.r, u = o.u, n = Math.round(w * h / 9000 * (.1 + o.dens * 1.4)); ctx.globalCompositeOperation = 'screen';
    for(let i = 0; i < n; i++){ const x = r() * w, y = h * (1 - Math.pow(r(), 1.8)), rad = u * (.8 + Math.pow(r(), 3) * (2 + o.size * 6)), col = r() < .5 ? o.B : o.C; glow(ctx, x, y, rad * 4, col, .5); dot(ctx, x, y, rad, mix(col, WHITE, .5), .95); }
    ctx.globalCompositeOperation = 'source-over';
  },
  topo(ctx, w, h, o){
    const gw = Math.min(w, 700), gh = Math.max(40, Math.round(gw * h / w)), f = fbm(gw, gh, gw / 3, 4, o.r), bands = 6 + Math.round(o.dens * 22), t = .06 + o.size * .16;
    const c = field(gw, gh, i=>{ const v = f[i] * bands, fr = Math.abs(v - Math.round(v)), a = fr < t ? 1 - fr / t : 0, p = mix(o.A, o.B, a); return [p[0], p[1], p[2]]; });
    up(ctx, c, w, h);
  },
  ripples(ctx, w, h, o){
    vgrad(ctx, w, h, [[0, shade(o.A, -.2)], [1, mix(o.A, o.B, .3)]]);
    const r = o.r, u = o.u, n = 2 + Math.round(o.dens * 5), step = u * (16 + o.size * 44); ctx.globalCompositeOperation = 'screen';
    for(let c = 0; c < n; c++){ const x = r() * w, y = r() * h, col = r() < .6 ? o.B : o.C, rings = 6 + Math.round(r() * 12);
      for(let k = 1; k <= rings; k++){ ctx.strokeStyle = css(col, .55 * (1 - k / (rings + 1))); ctx.lineWidth = Math.max(1, u * 2.2 * (1 - k / (rings + 2))); ctx.beginPath(); ctx.arc(x, y, k * step, 0, 6.2832); ctx.stroke(); } }
    ctx.globalCompositeOperation = 'source-over';
  },
  lowpoly(ctx, w, h, o){
    const r = o.r, cols = 5 + Math.round(o.dens * 16), cell = w / cols, rows = Math.ceil(h / cell) + 1, P = [];
    for(let j = 0; j <= rows; j++){ P[j] = []; for(let i = 0; i <= cols; i++) P[j][i] = { x:i * cell + (i > 0 && i < cols ? (r() - .5) * cell * .7 : 0), y:j * cell + (j > 0 && j < rows ? (r() - .5) * cell * .7 : 0) }; }
    const tri = (a, b, c)=>{ const t = clamp(((a.x + b.x + c.x) / 3 / w) * .55 + ((a.y + b.y + c.y) / 3 / h) * .45 + (r() - .5) * (.1 + o.size * .3), 0, 1); let col = shade(mix(o.A, o.B, t), (r() - .5) * .18); if(r() < .08) col = mix(col, o.C, .35);
      ctx.fillStyle = ctx.strokeStyle = css(col); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.closePath(); ctx.fill(); ctx.stroke(); };
    for(let j = 0; j < rows; j++) for(let i = 0; i < cols; i++){ const a = P[j][i], b = P[j][i + 1], c = P[j + 1][i], d = P[j + 1][i + 1]; if(r() < .5){ tri(a, b, c); tri(b, d, c); } else { tri(a, b, d); tri(a, d, c); } }
  },
  blobs(ctx, w, h, o){
    ctx.fillStyle = css(o.A); ctx.fillRect(0, 0, w, h); const r = o.r, n = 4 + Math.round(o.dens * 9), M = Math.max(w, h);
    for(let i = 0; i < n; i++){ const col = [o.B, o.C, mix(o.B, o.C, .5)][i % 3]; glow(ctx, r() * w, r() * h, M * (.2 + o.size * .4) * (.6 + r() * .6), col, .85); }
  },
  clouds(ctx, w, h, o){
    vgrad(ctx, w, h, [[0, o.A], [1, shade(o.A, .45)]]);
    const gw = 240, gh = Math.max(40, Math.round(240 * h / w)), f = fbm(gw, gh, 34 + o.size * 40, 5, o.r), th = .62 - o.dens * .3;
    up(ctx, field(gw, gh, i=>{ const a = clamp((f[i] - th) / .3, 0, 1), c = mix(o.C, o.B, f[i]); return [c[0], c[1], c[2], a * 255]; }), w, h);
  },
  skyline(ctx, w, h, o){
    vgrad(ctx, w, h, [[0, o.A], [.65, o.B], [1, o.C]]); glow(ctx, w / 2, h * .72, Math.max(w, h) * .45, o.C, .6); dots(ctx, w, h * .5, o, .3);
    const r = o.r, u = o.u, dark = shade(o.A, -.7);
    [[.42, .22, mix(dark, o.B, .3)], [.2, .38, dark]].forEach(([mx, my, col], layer)=>{
      ctx.fillStyle = css(col); let x = -10;
      while(x < w){ const bw = u * (26 + r() * 70 * (.5 + o.size)), bh = h * (.12 + r() * mx * (.5 + o.dens)); const y = h - bh; ctx.fillRect(x, y, bw + 1, bh + 2);
        if(layer === 1) for(let wy = y + u * 10; wy < h - u * 8; wy += u * 14) for(let wx = x + u * 6; wx < x + bw - u * 8; wx += u * 11) if(r() < .3) { ctx.fillStyle = css(o.C, .8); ctx.fillRect(wx, wy, u * 4, u * 6); ctx.fillStyle = css(col); }
        x += bw; }
    });
  },
  mountains(ctx, w, h, o){
    vgrad(ctx, w, h, [[0, shade(o.A, .3)], [1, o.A]]); glow(ctx, w * .7, h * .35, h * .35, shade(o.A, .6), .6);
    const r = o.r, L = 4;
    for(let l = 0; l < L; l++){
      const col = mix(mix(o.B, o.C, l / (L - 1)), o.A, (1 - l / (L - 1)) * .55), base = h * (.45 + l * .13), amp = h * (.1 + o.size * .12) * (1 + l * .2), ph = [r() * 6, r() * 6, r() * 6]; ctx.fillStyle = css(col); ctx.beginPath(); ctx.moveTo(0, h);
      for(let x = 0; x <= w; x += w / 160) ctx.lineTo(x, base - Math.abs(Math.sin(x / w * (2.5 + l) + ph[0])) * amp - Math.sin(x / w * 9 + ph[1]) * amp * .2 - Math.sin(x / w * 23 + ph[2]) * amp * .06);
      ctx.lineTo(w, h); ctx.fill();
      const g = ctx.createLinearGradient(0, base - amp, 0, base + h * .1); g.addColorStop(0, css(o.A, 0)); g.addColorStop(1, css(o.A, .35)); ctx.fillStyle = g; ctx.fillRect(0, base - amp, w, amp + h * .1);
    }
  },
  spotlights(ctx, w, h, o){
    ctx.fillStyle = css(o.A); ctx.fillRect(0, 0, w, h); const r = o.r, n = 3 + Math.round(o.dens * 4); ctx.globalCompositeOperation = 'screen';
    for(let i = 0; i < n; i++){ const x = (i + .5) / n * w + (r() - .5) * w * .1, col = [o.B, o.C, WHITE][i % 3], tx = x + (r() - .5) * w * .6, spread = w * (.06 + o.size * .12), g = ctx.createLinearGradient(x, 0, tx, h);
      g.addColorStop(0, css(col, .55)); g.addColorStop(1, css(col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 4, 0); ctx.lineTo(x + 4, 0); ctx.lineTo(tx + spread, h); ctx.lineTo(tx - spread, h); ctx.fill(); glow(ctx, tx, h * .96, spread * 1.4, col, .35); }
    ctx.globalCompositeOperation = 'source-over';
  },
  carbon(ctx, w, h, o){
    const t = Math.max(4, Math.round(Math.min(w, h) / (60 - o.size * 40))), tile = mk(t * 2, t * 2), x = tile.getContext('2d');
    [[0, 0, 0], [t, 0, 1], [0, t, 1], [t, t, 0]].forEach(([tx, ty, alt])=>{ const g = x.createLinearGradient(tx, ty, tx + t, ty + t); g.addColorStop(0, css(alt ? o.A : o.B)); g.addColorStop(1, css(alt ? o.B : o.A)); x.fillStyle = g; x.fillRect(tx, ty, t, t); });
    ctx.fillStyle = ctx.createPattern(tile, 'repeat'); ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, css(o.C, 0)); g.addColorStop(.5, css(o.C, .22)); g.addColorStop(1, css(o.C, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  },
  fireworks(ctx, w, h, o){
    vgrad(ctx, w, h, [[0, shade(o.A, -.3)], [1, o.A]]); dots(ctx, w, h, o, .3);
    const r = o.r, u = o.u, n = 2 + Math.round(o.dens * 5); ctx.globalCompositeOperation = 'screen';
    for(let b = 0; b < n; b++){ const cx = w * (.15 + r() * .7), cy = h * (.15 + r() * .5), col = [o.B, o.C, WHITE][b % 3], R = u * (90 + o.size * 200) * (.7 + r() * .5), rays = 40 + Math.round(r() * 30);
      glow(ctx, cx, cy, R * .6, col, .5);
      for(let i = 0; i < rays; i++){ const a = i / rays * 6.2832 + r() * .05, len = R * (.6 + r() * .4); for(let s = 0; s < 9; s++){ const d = len * (s / 8) ** .9, k = 1 - s / 9; dot(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d + s * s * u * .35, u * (1 + 2.2 * k), col, .8 * k); } } }
    ctx.globalCompositeOperation = 'source-over';
  },
  ocean(ctx, w, h, o){
    const hz = h * .42; vgrad(ctx, w, hz, [[0, o.A], [1, shade(o.A, .5)]]); const r = o.r, u = o.u, N = 6, ph = [];
    for(let i = 0; i < N; i++){ ph.push(r() * 6);
      const y0 = hz + (h - hz) * i / N, amp = u * (5 + o.size * 28) * (1 + i * .4), col = mix(o.B, o.C, i / (N - 1));
      ctx.fillStyle = css(col); ctx.beginPath(); ctx.moveTo(0, h);
      for(let x = 0; x <= w; x += 6) ctx.lineTo(x, y0 + Math.sin(x / w * (6 + i * 2 + o.dens * 6) + ph[i]) * amp);
      ctx.lineTo(w, h); ctx.fill();
      ctx.strokeStyle = css(shade(col, .35), .55); ctx.lineWidth = Math.max(1, u * 1.6); ctx.beginPath();
      for(let x = 0; x <= w; x += 6){ const y = y0 + Math.sin(x / w * (6 + i * 2 + o.dens * 6) + ph[i]) * amp; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
  },
  grunge(ctx, w, h, o){
    const gw = 260, gh = Math.max(40, Math.round(260 * h / w)), r = o.r, f1 = fbm(gw, gh, 60, 5, r), f2 = fbm(gw, gh, 22, 4, r), th = .7 - o.dens * .3;
    up(ctx, field(gw, gh, i=>{ const c = mix(o.A, o.B, Math.pow(f1[i], 1.6)), a = clamp((f2[i] - th) / .15, 0, 1), d = mix(c, o.C, a * .75); return [d[0], d[1], d[2]]; }), w, h);
    const u = o.u; for(let i = 0; i < 400 * (.3 + o.dens); i++) dot(ctx, r() * w, r() * h, u * (.5 + r() * 1.6), r() < .5 ? o.C : o.B, .15 + r() * .35);
    ctx.lineCap = 'round'; for(let i = 0; i < 14; i++){ const x = r() * w, y = r() * h, a = r() * 6.28, l = u * (30 + r() * 140); ctx.strokeStyle = css(o.B, .2); ctx.lineWidth = Math.max(1, u * .8); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke(); }
  },
};

const LIST = [
  ['stars', 'Starfield (dots)', '#0a1030', '#9ec5ff', '#ffd9a0'], ['galaxy', 'Galaxy', '#05030f', '#7a3cff', '#ff3c9e'], ['moon', 'Moonlit night', '#0b1a3a', '#fff4d0', '#9ec5ff'],
  ['aurora', 'Aurora', '#04111f', '#3dffb0', '#8a5bff'], ['sunset', 'Sunset', '#2b1055', '#ff5e62', '#ffd166'], ['sunburst', 'Sunburst rays', '#ffcf33', '#ff7a00', '#ffffff'],
  ['synthwave', 'Synthwave', '#14052e', '#ff2a9d', '#ffd23f'], ['bokeh', 'Bokeh lights', '#10162b', '#ff6ec7', '#6ee7ff'], ['snow', 'Snowfall', '#14233f', '#ffffff', '#a8c8ff'],
  ['rain', 'Rain', '#1a2430', '#9db4c8', '#ffffff'], ['embers', 'Embers', '#120503', '#ff6a00', '#ffd24a'], ['topo', 'Topographic', '#0f2a2a', '#4fd1a5', '#ffffff'],
  ['ripples', 'Ripples', '#06243d', '#4fc3f7', '#ffffff'], ['lowpoly', 'Low poly', '#0d3b66', '#f95738', '#faf0ca'], ['blobs', 'Soft colour blobs', '#1b1740', '#ff5fa2', '#4cc9f0'],
  ['clouds', 'Clouds', '#3a7bd5', '#ffffff', '#c9e0ff'], ['skyline', 'City skyline', '#1d1147', '#ff6b9a', '#ffd166'], ['mountains', 'Mountains', '#ffb88c', '#3b2a6b', '#1a1038'],
  ['spotlights', 'Spotlights', '#0a0a14', '#7aa2ff', '#ff7ad9'], ['carbon', 'Carbon fibre', '#151515', '#3a3a3a', '#8a8a8a'], ['fireworks', 'Fireworks', '#050818', '#ff4d6d', '#ffd23f'],
  ['ocean', 'Ocean waves', '#7fd7ff', '#0b6fa4', '#04304f'], ['grunge', 'Concrete / grunge', '#2a2a2a', '#8a8a80', '#000000'],
].map(([k, label, a, b, c])=> ({ k, label, a, b, c }));

// ---- more scenes ----
function voronoi(gw, gh, n, r){ const P = []; for(let i = 0; i < n; i++) P.push([r() * gw, r() * gh]); const id = new Int16Array(gw * gh), ed = new Float32Array(gw * gh);
  for(let y = 0; y < gh; y++) for(let x = 0; x < gw; x++){ let b = 1e9, b2 = 1e9, bi = 0; for(let i = 0; i < n; i++){ const d = (P[i][0] - x) ** 2 + (P[i][1] - y) ** 2; if(d < b){ b2 = b; b = d; bi = i; } else if(d < b2) b2 = d; } id[y * gw + x] = bi; ed[y * gw + x] = Math.sqrt(b2) - Math.sqrt(b); }
  return { id, ed, P }; }
function bolt(ctx, x, y, x2, y2, r, w, col){ ctx.strokeStyle = css(col, .95); ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.shadowColor = css(col); ctx.shadowBlur = w * 6; ctx.beginPath(); ctx.moveTo(x, y); const n = 14; for(let i = 1; i <= n; i++){ const t = i / n; ctx.lineTo(x + (x2 - x) * t + (r() - .5) * 60 * (1 - t * .3), y + (y2 - y) * t); } ctx.stroke(); ctx.shadowBlur = 0; }
function pine(ctx, x, base, hgt, col){ ctx.fillStyle = css(col); ctx.beginPath(); ctx.moveTo(x, base - hgt); for(let i = 1; i <= 5; i++){ const f = i / 5, wd = hgt * .1 + hgt * .22 * f; ctx.lineTo(x + wd, base - hgt + hgt * f * .95); ctx.lineTo(x + wd * .45, base - hgt + hgt * f * .95); } ctx.lineTo(x + hgt * .04, base); ctx.lineTo(x - hgt * .04, base); for(let i = 5; i >= 1; i--){ const f = i / 5, wd = hgt * .1 + hgt * .22 * f; ctx.lineTo(x - wd * .45, base - hgt + hgt * f * .95); ctx.lineTo(x - wd, base - hgt + hgt * f * .95); } ctx.closePath(); ctx.fill(); }
Object.assign(S, {
  milkyway(ctx, w, h, o){ const gw = 260, gh = Math.max(40, Math.round(260 * h / w)), r = o.r, n1 = fbm(gw, gh, 40, 5, r), n2 = fbm(gw, gh, 16, 4, r);
    up(ctx, field(gw, gh, (i, x, y)=>{ const u = x / gw, v = y / gh, d = (u - .5) * .55 + (v - .5) * -.85, band = Math.exp(-Math.pow(d / (.14 + o.size * .14), 2)), lane = clamp((n2[i] - .55) * 3, 0, 1), a = clamp(band * (1.1 - lane * .85) * (.4 + n1[i]), 0, 1), c = mix(mix(shade(o.A, -.2), o.B, a), o.C, a * a * .6); return [c[0], c[1], c[2]]; }), w, h); dots(ctx, w, h, o, 1.3); },
  planets(ctx, w, h, o){ vgrad(ctx, w, h, [[0, shade(o.A, -.5)], [1, o.A]]); dots(ctx, w, h, o, .9); const R = Math.min(w, h) * (.16 + o.size * .18), x = w * .62, y = h * .56;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-.35); ctx.strokeStyle = css(o.C, .7); ctx.lineWidth = R * .16; ctx.beginPath(); ctx.ellipse(0, 0, R * 1.9, R * .46, 0, Math.PI, 2 * Math.PI); ctx.stroke(); ctx.restore();
    const g = ctx.createRadialGradient(x - R * .4, y - R * .4, R * .1, x, y, R); g.addColorStop(0, css(shade(o.B, .35))); g.addColorStop(.6, css(o.B)); g.addColorStop(1, css(shade(o.B, -.7))); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, 6.2832); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(-.35); ctx.strokeStyle = css(o.C, .85); ctx.lineWidth = R * .16; ctx.beginPath(); ctx.ellipse(0, 0, R * 1.9, R * .46, 0, 0, Math.PI); ctx.stroke(); ctx.restore();
    dot(ctx, w * .18, h * .28, R * .22, shade(o.C, -.1), 1); },
  eclipse(ctx, w, h, o){ vgrad(ctx, w, h, [[0, shade(o.A, -.4)], [1, o.A]]); dots(ctx, w, h, o, .6); const x = w / 2, y = h / 2, R = Math.min(w, h) * (.17 + o.size * .12); glow(ctx, x, y, R * 3.2, o.B, .75); glow(ctx, x, y, R * 1.6, o.C, .9);
    ctx.strokeStyle = css(shade(o.C, .5)); ctx.lineWidth = R * .035; ctx.beginPath(); ctx.arc(x, y, R * 1.02, 0, 6.2832); ctx.stroke(); dot(ctx, x, y, R, [3, 3, 6], 1); },
  comets(ctx, w, h, o){ vgrad(ctx, w, h, [[0, shade(o.A, -.45)], [1, o.A]]); dots(ctx, w, h, o, .8); const r = o.r, n = 3 + Math.round(o.dens * 9), u = o.u; ctx.globalCompositeOperation = 'screen'; ctx.lineCap = 'round';
    for(let i = 0; i < n; i++){ const x = r() * w, y = r() * h * .8, L = u * (120 + o.size * 380) * (.5 + r()), a = .55 + r() * .2, col = r() < .5 ? o.B : o.C, g = ctx.createLinearGradient(x, y, x - Math.cos(a) * L, y - Math.sin(a) * L);
      g.addColorStop(0, css(col, .95)); g.addColorStop(1, css(col, 0)); ctx.strokeStyle = g; ctx.lineWidth = u * 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(a) * L, y - Math.sin(a) * L); ctx.stroke(); glow(ctx, x, y, u * 18, WHITE, .8); }
    ctx.globalCompositeOperation = 'source-over'; },
  constellations(ctx, w, h, o){ vgrad(ctx, w, h, [[0, shade(o.A, -.45)], [1, o.A]]); const r = o.r, n = 14 + Math.round(o.dens * 40), u = o.u, P = []; for(let i = 0; i < n; i++) P.push([r() * w, r() * h]);
    ctx.strokeStyle = css(o.B, .45); ctx.lineWidth = Math.max(1, u * 1.3); P.forEach((p, i)=>{ P.map((q, j)=> [j, Math.hypot(p[0] - q[0], p[1] - q[1])]).filter(a=> a[0] !== i).sort((a, b)=> a[1] - b[1]).slice(0, 2).forEach(([j, d])=>{ if(d < Math.max(w, h) * (.18 + o.size * .12)){ ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(P[j][0], P[j][1]); ctx.stroke(); } }); });
    P.forEach(p=>{ glow(ctx, p[0], p[1], u * 14, o.C, .5); dot(ctx, p[0], p[1], u * (2 + r() * 3), WHITE, 1); }); dots(ctx, w, h, o, .5); },
  dunes(ctx, w, h, o){ vgrad(ctx, w, h, [[0, o.A], [.6, shade(o.A, .4)], [1, o.C]]); const r = o.r, R = Math.min(w, h) * .09; glow(ctx, w * .7, h * .38, R * 5, shade(o.C, .5), .6); dot(ctx, w * .7, h * .38, R, shade(o.C, .65), 1);
    for(let l = 0; l < 5; l++){ const col = mix(o.B, shade(o.B, -.75), l / 4), base = h * (.5 + l * .1), amp = h * (.05 + o.size * .05), ph = r() * 6; ctx.fillStyle = css(col); ctx.beginPath(); ctx.moveTo(0, h); for(let x = 0; x <= w; x += w / 120) ctx.lineTo(x, base - Math.abs(Math.sin(x / w * (1.4 + l * .4) * Math.PI + ph)) * amp * 1.4 - Math.sin(x / w * 9 + ph) * amp * .12); ctx.lineTo(w, h); ctx.fill(); } },
  forest(ctx, w, h, o){ vgrad(ctx, w, h, [[0, shade(o.A, -.2)], [1, mix(o.A, o.B, .5)]]); glow(ctx, w * .75, h * .22, h * .3, shade(o.B, .5), .45); const r = o.r, u = o.u;
    for(let l = 0; l < 4; l++){ const col = mix(mix(o.A, o.B, .35), o.C, l / 3), base = h * (.62 + l * .13), n = Math.round((10 + o.dens * 26) * (1 + l * .4)); for(let i = 0; i < n; i++) pine(ctx, r() * w * 1.1 - w * .05, base + r() * h * .04, h * (.14 + r() * .1 + l * .05) * (.7 + o.size * .8), col);
      const g = ctx.createLinearGradient(0, base - h * .25, 0, base + h * .05); g.addColorStop(0, css(o.A, 0)); g.addColorStop(1, css(mix(o.A, o.B, .5), .28)); ctx.fillStyle = g; ctx.fillRect(0, base - h * .25, w, h * .3); } },
  lava(ctx, w, h, o){ const gw = 240, gh = Math.max(40, Math.round(240 * h / w)), r = o.r, f = fbm(gw, gh, 34 + o.size * 30, 5, r), f2 = fbm(gw, gh, 12, 3, r), th = .38 + (1 - o.dens) * .2;
    up(ctx, field(gw, gh, i=>{ const v = f[i] + f2[i] * .15, crack = clamp(1 - Math.abs(v - th) * 9, 0, 1), c = mix(shade(o.A, -.1), mix(o.B, o.C, clamp(crack * 1.2, 0, 1)), crack); return [c[0], c[1], c[2]]; }), w, h); },
  marble(ctx, w, h, o){ const gw = 300, gh = Math.max(40, Math.round(300 * h / w)), r = o.r, f = fbm(gw, gh, 70, 5, r), f2 = fbm(gw, gh, 30, 4, r);
    up(ctx, field(gw, gh, (i, x, y)=>{ const v = Math.abs(Math.sin((x / gw * (3 + o.dens * 6) + f[i] * (5 + o.size * 8)) * 3.14)), vein = Math.pow(1 - v, 6 + (1 - o.size) * 10), c = mix(mix(o.A, shade(o.A, -.12), f2[i]), o.B, vein * .85); return [c[0], c[1], c[2]]; }), w, h); },
  wood(ctx, w, h, o){ const gw = 280, gh = Math.max(40, Math.round(280 * h / w)), r = o.r, f = fbm(gw, gh, 90, 4, r), f2 = fbm(gw, gh, 6, 3, r);
    up(ctx, field(gw, gh, (i, x, y)=>{ const ring = Math.sin(((y / gh) * (14 + o.dens * 30) + f[i] * 6) * 3.14) * .5 + .5, c = mix(mix(o.A, o.B, ring * .7), o.C, f2[i] * .25); return [c[0], c[1], c[2]]; }), w, h); },
  watercolor(ctx, w, h, o){ ctx.fillStyle = css(o.A); ctx.fillRect(0, 0, w, h); const r = o.r, M = Math.max(w, h), n = 5 + Math.round(o.dens * 10);
    for(let i = 0; i < n; i++){ const col = [o.B, o.C, mix(o.B, o.C, .5)][i % 3], x = r() * w, y = r() * h, R = M * (.12 + o.size * .25) * (.6 + r() * .6); for(let k = 0; k < 7; k++) glow(ctx, x + (r() - .5) * R * .6, y + (r() - .5) * R * .6, R * (.5 + r() * .5), col, .22); }
    const gw = 200, gh = Math.max(30, Math.round(200 * h / w)), f = fbm(gw, gh, 3, 2, r); up(ctx, field(gw, gh, i=> [255, 255, 255, (f[i] - .5) * 40 + 20]), w, h); },
  smoke(ctx, w, h, o){ vgrad(ctx, w, h, [[0, shade(o.A, -.3)], [1, o.A]]); const gw = 240, gh = Math.max(40, Math.round(240 * h / w)), f = fbm(gw, gh, 40 + o.size * 40, 5, o.r), th = .5 - o.dens * .2;
    up(ctx, field(gw, gh, i=>{ const a = clamp((f[i] - th) * 2.4, 0, .85), c = mix(o.B, o.C, f[i]); return [c[0], c[1], c[2], a * 255]; }), w, h); },
  storm(ctx, w, h, o){ vgrad(ctx, w, h, [[0, shade(o.A, -.3)], [1, o.A]]); const gw = 220, gh = Math.max(40, Math.round(220 * h / w)), r = o.r, f = fbm(gw, gh, 50, 5, r);
    up(ctx, field(gw, gh, (i, x, y)=>{ const a = clamp((f[i] - .42) * 2.6, 0, .95) * clamp(1 - y / gh * 1.1, 0, 1), c = mix(shade(o.A, .15), o.C, f[i] * .6); return [c[0], c[1], c[2], a * 255]; }), w, h);
    const n = 1 + Math.round(o.dens * 3); for(let i = 0; i < n; i++){ const x = w * (.15 + r() * .7); glow(ctx, x, h * .25, h * .5, o.B, .3); bolt(ctx, x, 0, x + (r() - .5) * w * .2, h * (.55 + r() * .3), r, Math.max(2, o.u * (2 + o.size * 4)), o.B); } },
  godrays(ctx, w, h, o){ vgrad(ctx, w, h, [[0, o.A], [1, shade(o.A, -.35)]]); const r = o.r, cx = w * .72, cy = -h * .05, n = 6 + Math.round(o.dens * 16); ctx.globalCompositeOperation = 'screen';
    for(let i = 0; i < n; i++){ const a = 1.25 + (r() - .2) * 1.3, wd = (.02 + r() * .05) * (1 + o.size), L = Math.hypot(w, h) * 1.2, g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * L, cy + Math.sin(a) * L); g.addColorStop(0, css(o.B, .55)); g.addColorStop(1, css(o.B, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a - wd) * L, cy + Math.sin(a - wd) * L); ctx.lineTo(cx + Math.cos(a + wd) * L, cy + Math.sin(a + wd) * L); ctx.fill(); }
    glow(ctx, cx, cy, h * .6, o.C, .8); ctx.globalCompositeOperation = 'source-over'; },
  palms(ctx, w, h, o){ vgrad(ctx, w, h, [[0, o.A], [.6, o.B], [1, o.C]]); const R = Math.min(w, h) * (.1 + o.size * .08); glow(ctx, w / 2, h * .66, R * 4, shade(o.C, .5), .6); dot(ctx, w / 2, h * .66, R, shade(o.C, .6), 1); const r = o.r, dark = shade(o.A, -.85);
    ctx.fillStyle = css(dark); ctx.fillRect(0, h * .86, w, h * .14);
    const palm = (x, hgt)=>{ ctx.strokeStyle = css(dark); ctx.lineWidth = hgt * .028; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, h * .88); ctx.quadraticCurveTo(x + hgt * .12, h * .88 - hgt * .5, x + hgt * .05, h * .88 - hgt); ctx.stroke();
      const tx = x + hgt * .05, ty = h * .88 - hgt; for(let i = 0; i < 8; i++){ const a = -Math.PI + i * Math.PI / 7 - .1; ctx.lineWidth = hgt * .016; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx + Math.cos(a) * hgt * .22, ty + Math.sin(a) * hgt * .22 - hgt * .12, tx + Math.cos(a) * hgt * .38, ty + Math.sin(a) * hgt * .3 + hgt * .08); ctx.stroke(); } };
    const n = 2 + Math.round(o.dens * 3); for(let i = 0; i < n; i++) palm(w * (.08 + (i / Math.max(1, n - 1)) * .84) + (r() - .5) * w * .05, h * (.3 + r() * .25)); },
  tunnel(ctx, w, h, o){ ctx.fillStyle = css(shade(o.A, -.5)); ctx.fillRect(0, 0, w, h); const n = 8 + Math.round(o.dens * 22), cx = w / 2, cy = h / 2; ctx.shadowColor = css(o.B); ctx.shadowBlur = o.u * 8; ctx.lineWidth = Math.max(1, o.u * 2.2);
    for(let i = n; i >= 1; i--){ const t = Math.pow(i / n, 2.1) * (.7 + o.size * .8), sw = w * t, sh = h * t; ctx.strokeStyle = css(mix(o.B, o.C, 1 - i / n), .35 + .6 * (1 - i / n)); ctx.strokeRect(cx - sw / 2, cy - sh / 2, sw, sh); }
    ctx.beginPath(); [[0, 0], [w, 0], [w, h], [0, h]].forEach(([x, y])=>{ ctx.moveTo(cx, cy); ctx.lineTo(x, y); }); ctx.stroke(); ctx.shadowBlur = 0; },
  hexglow(ctx, w, h, o){ vgrad(ctx, w, h, [[0, shade(o.A, -.3)], [1, o.A]]); const r = o.r, s = Math.max(14, Math.min(w, h) / (6 + o.dens * 14)), dx = s * Math.sqrt(3);
    for(let row = -1; row * s * 1.5 < h + s; row++) for(let col = -1; col * dx < w + dx; col++){ const x = col * dx + (row % 2 ? dx / 2 : 0), y = row * s * 1.5, on = r() < .15; ctx.beginPath(); for(let i = 0; i < 6; i++){ const a = Math.PI / 6 + i * Math.PI / 3; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * s * .94, y + Math.sin(a) * s * .94); } ctx.closePath();
      if(on){ ctx.fillStyle = css(r() < .5 ? o.B : o.C, .35 + r() * .4); ctx.shadowColor = css(o.B); ctx.shadowBlur = s * .6; ctx.fill(); ctx.shadowBlur = 0; } ctx.strokeStyle = css(o.B, .28); ctx.lineWidth = Math.max(1, o.u * (1 + o.size * 2)); ctx.stroke(); } },
  matrix(ctx, w, h, o){ ctx.fillStyle = css(o.A); ctx.fillRect(0, 0, w, h); const r = o.r, fs = Math.max(8, o.u * (12 + o.size * 20)), cols = Math.floor(w / fs), chars = 'アイウエオカキクケコサシスセソ0123456789ABCDEF'; ctx.font = fs + 'px monospace';
    for(let c = 0; c < cols; c++){ if(r() > .25 + o.dens * .7) continue; const len = 6 + Math.floor(r() * h / fs * .6), y0 = Math.floor(r() * h / fs); for(let k = 0; k < len; k++){ const a = 1 - k / len; ctx.fillStyle = css(k === 0 ? WHITE : o.B, k === 0 ? .95 : a * .85); ctx.fillText(chars[Math.floor(r() * chars.length)], c * fs, (y0 + len - k) * fs % (h + fs)); } } },
  circuit(ctx, w, h, o){ vgrad(ctx, w, h, [[0, shade(o.A, -.2)], [1, o.A]]); const r = o.r, g = Math.max(14, Math.min(w, h) / (10 + o.dens * 18)), nodes = []; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1, o.u * (1.5 + o.size * 3));
    for(let i = 0; i < w * h / (g * g) * .45; i++){ let x = Math.round(r() * w / g) * g, y = Math.round(r() * h / g) * g; const col = r() < .6 ? o.B : o.C; ctx.strokeStyle = css(col, .75); ctx.beginPath(); ctx.moveTo(x, y); for(let s = 0; s < 3 + Math.floor(r() * 4); s++){ const d = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1]][Math.floor(r() * 6)], L = g * (1 + Math.floor(r() * 3)); x += d[0] * L; y += d[1] * L; ctx.lineTo(x, y); } ctx.stroke(); nodes.push([x, y, col]); }
    nodes.forEach(([x, y, col])=>{ ctx.fillStyle = css(shade(o.A, -.3)); ctx.beginPath(); ctx.arc(x, y, g * .22, 0, 6.2832); ctx.fill(); ctx.strokeStyle = css(col); ctx.stroke(); }); },
  splatter(ctx, w, h, o){ ctx.fillStyle = css(o.A); ctx.fillRect(0, 0, w, h); const r = o.r, n = 4 + Math.round(o.dens * 12), u = o.u; const pal = [o.B, o.C, mix(o.B, o.C, .5), shade(o.B, .3)];
    for(let i = 0; i < n; i++){ const x = r() * w, y = r() * h, R = u * (30 + o.size * 130) * (.5 + r()), col = pal[i % 4]; dot(ctx, x, y, R, col, .95); for(let k = 0; k < 18; k++){ const a = r() * 6.28, d = R * (1.1 + r() * 1.8); dot(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, R * (.04 + r() * .16), col, .95); }
      for(let k = 0; k < 6; k++){ const a = r() * 6.28; ctx.strokeStyle = css(col); ctx.lineWidth = R * (.08 + r() * .1); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * R * (1.3 + r()), y + Math.sin(a) * R * (1.3 + r())); ctx.stroke(); } } },
  brickwall(ctx, w, h, o){ const bh = Math.max(14, h / (8 + o.dens * 22)), bw = bh * 2.3, r = o.r; ctx.fillStyle = css(o.C); ctx.fillRect(0, 0, w, h);
    for(let row = 0; row * bh < h; row++) for(let col = -1; col * bw < w + bw; col++){ const x = col * bw + (row % 2 ? bw / 2 : 0), y = row * bh, c = shade(mix(o.A, o.B, r()), (r() - .5) * .18); ctx.fillStyle = css(c); ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4); if(r() < .3){ ctx.fillStyle = css(shade(c, -.25), .5); ctx.fillRect(x + 2 + r() * bw * .5, y + 2, bw * .2, bh - 4); } }
    const gw = 160, gh = Math.max(30, Math.round(160 * h / w)), f = fbm(gw, gh, 20, 4, r); up(ctx, field(gw, gh, i=> [0, 0, 0, clamp(f[i] - .45, 0, 1) * 200 * (.3 + o.size)]), w, h); },
  rainbow(ctx, w, h, o){ ctx.fillStyle = css(o.A); ctx.fillRect(0, 0, w, h); const r = o.r, M = Math.max(w, h), n = 5 + Math.round(o.dens * 6); for(let i = 0; i < n; i++){ const hue = (i / n * 360 + r() * 30) % 360; glow(ctx, r() * w, r() * h, M * (.25 + o.size * .35), rgb('#' + [0, 1, 2].map(k=>{ const a = hue / 60 + k * 4, v = Math.round(Math.max(0, Math.min(1, Math.abs(((a % 6) + 6) % 6 - 3) - 1)) * 200 + 55); return v.toString(16).padStart(2, '0'); }).join('')), .8); } },
  snowflakes(ctx, w, h, o){ vgrad(ctx, w, h, [[0, shade(o.A, -.2)], [1, mix(o.A, o.C, .3)]]); const r = o.r, u = o.u, n = 8 + Math.round(o.dens * 40); ctx.lineCap = 'round';
    for(let i = 0; i < n; i++){ const x = r() * w, y = r() * h, R = u * (10 + r() * 30 + o.size * 40), a0 = r() * 3; ctx.strokeStyle = css(o.B, .35 + r() * .5); ctx.lineWidth = Math.max(1, R * .08); for(let k = 0; k < 6; k++){ const a = a0 + k * Math.PI / 3, ex = x + Math.cos(a) * R, ey = y + Math.sin(a) * R; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); for(const t of [.5, .75]){ const bx = x + Math.cos(a) * R * t, by = y + Math.sin(a) * R * t; ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a + .8) * R * .25, by + Math.sin(a + .8) * R * .25); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a - .8) * R * .25, by + Math.sin(a - .8) * R * .25); } ctx.stroke(); } } },
  flowlines(ctx, w, h, o){ vgrad(ctx, w, h, [[0, shade(o.A, -.2)], [1, o.A]]); const n = 18 + Math.round(o.dens * 60), r = o.r, ph = r() * 6; ctx.lineWidth = Math.max(1, o.u * (1 + o.size * 2.5)); ctx.shadowColor = css(o.B); ctx.shadowBlur = o.u * 4;
    for(let i = 0; i < n; i++){ const t = i / n; ctx.strokeStyle = css(mix(o.B, o.C, t), .75); ctx.beginPath(); for(let x = 0; x <= w; x += w / 160){ const y = h * (.15 + t * .7) + Math.sin(x / w * 6 + t * 5 + ph) * h * .08 * Math.sin(t * 3.14 + .2) + Math.sin(x / w * 13 + t * 9) * h * .015; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); } ctx.shadowBlur = 0; },
  halftoneburst(ctx, w, h, o){ ctx.fillStyle = css(o.A); ctx.fillRect(0, 0, w, h); const s = Math.max(8, Math.min(w, h) / (24 + o.dens * 50)), cx = w / 2, cy = h / 2, M = Math.hypot(w, h) / 2; ctx.fillStyle = css(o.B);
    for(let y = 0, row = 0; y < h + s; y += s * .87, row++) for(let x = (row % 2) * s / 2; x < w + s; x += s){ const d = Math.hypot(x - cx, y - cy) / M, rr = s * .62 * clamp((d - .08) * (1.1 + o.size * 1.6), 0, 1); if(rr > .4){ ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.2832); ctx.fill(); } } },
  speedlines(ctx, w, h, o){ ctx.fillStyle = css(o.A); ctx.fillRect(0, 0, w, h); const r = o.r, cx = w / 2, cy = h / 2, M = Math.hypot(w, h), n = 60 + Math.round(o.dens * 220); ctx.fillStyle = css(o.B);
    for(let i = 0; i < n; i++){ const a = r() * 6.2832, w0 = (.002 + r() * .012) * (.5 + o.size), in1 = M * (.12 + r() * .25), ex = M; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * in1, cy + Math.sin(a) * in1); ctx.lineTo(cx + Math.cos(a - w0) * ex, cy + Math.sin(a - w0) * ex); ctx.lineTo(cx + Math.cos(a + w0) * ex, cy + Math.sin(a + w0) * ex); ctx.fill(); } },
  stainedglass(ctx, w, h, o){ const gw = Math.min(w, 520), gh = Math.max(40, Math.round(gw * h / w)), r = o.r, v = voronoi(gw, gh, 12 + Math.round(o.dens * 50), r), pal = v.P.map(()=> shade(mix(mix(o.A, o.B, r()), o.C, r() * .6), (r() - .5) * .25));
    up(ctx, field(gw, gh, i=>{ const e = clamp(v.ed[i] / (2 + o.size * 3), 0, 1), c = mix([8, 8, 10], pal[v.id[i]], clamp(e * 1.4, 0, 1)); return [c[0], c[1], c[2]]; }), w, h); },
  retrorays(ctx, w, h, o){ const hz = h * .62; vgrad(ctx, w, hz, [[0, o.A], [1, o.B]]); const cx = w / 2, n = 10 + Math.round(o.dens * 20), M = Math.hypot(w, h); ctx.fillStyle = css(o.C, .35);
    for(let i = 0; i < n; i++){ const a0 = Math.PI + i / n * Math.PI, a1 = a0 + Math.PI / n * .5; ctx.beginPath(); ctx.moveTo(cx, hz); ctx.lineTo(cx + Math.cos(a0) * M, hz + Math.sin(a0) * M); ctx.lineTo(cx + Math.cos(a1) * M, hz + Math.sin(a1) * M); ctx.fill(); }
    const R = h * (.12 + o.size * .12); glow(ctx, cx, hz, R * 3, o.C, .6); ctx.fillStyle = css(shade(o.C, .4)); ctx.beginPath(); ctx.arc(cx, hz, R, Math.PI, 0); ctx.fill(); ctx.fillStyle = css(shade(o.A, -.6)); ctx.fillRect(0, hz, w, h - hz); },
});
LIST.push(...[
  ['milkyway', 'Milky Way', '#05060f', '#6a8bff', '#ffd0a0'], ['planets', 'Planet & rings', '#080a1c', '#e07a3a', '#e8c98a'], ['eclipse', 'Eclipse', '#05060f', '#ff8a3a', '#ffd9a0'],
  ['comets', 'Comets', '#070a1c', '#8ec5ff', '#ffe29a'], ['constellations', 'Constellations', '#070c24', '#7aa2ff', '#ffe08a'], ['dunes', 'Desert dunes', '#f6c177', '#c8742f', '#6b2d1a'],
  ['forest', 'Pine forest', '#243b55', '#9fb7c9', '#0b1620'], ['lava', 'Lava', '#1a0603', '#ff4d00', '#ffd23f'], ['marble', 'Marble', '#f0eee8', '#3a3a44', '#ffffff'],
  ['wood', 'Wood grain', '#c68b4e', '#6b3d1a', '#3e220e'], ['watercolor', 'Watercolour', '#fbf7ef', '#ff7aa8', '#6ec3ff'], ['smoke', 'Smoke', '#0c0c10', '#8a8a96', '#d8d8e0'],
  ['storm', 'Lightning storm', '#0a1020', '#bcd4ff', '#4a5a7a'], ['godrays', 'God rays', '#2a6a8f', '#fff2c0', '#ffe9a0'], ['palms', 'Palm sunset', '#2b0f4a', '#ff4d6d', '#ffb347'],
  ['tunnel', 'Neon tunnel', '#0a0620', '#00e5ff', '#ff2ad4'], ['hexglow', 'Hex tech glow', '#07142a', '#2ea8ff', '#7affc8'], ['matrix', 'Code rain', '#020a04', '#2dff6a', '#ffffff'],
  ['circuit', 'Circuit board', '#06281e', '#2fe0a0', '#e6ff6a'], ['splatter', 'Paint splatter', '#f4f1ea', '#e63946', '#1d3557'], ['brickwall', 'Brick wall', '#9a4a36', '#b86a50', '#4a2a22'],
  ['rainbow', 'Rainbow glow', '#12122a', '#ffffff', '#ffffff'], ['snowflakes', 'Snowflakes', '#17305a', '#ffffff', '#a8c8ff'], ['flowlines', 'Flow lines', '#0b0b1e', '#ff5fa2', '#5fd0ff'],
  ['halftoneburst', 'Halftone burst', '#ffd23f', '#e63946', '#000000'], ['speedlines', 'Speed lines', '#ffffff', '#111111', '#000000'], ['stainedglass', 'Stained glass', '#d62839', '#2a6fdb', '#f4c430'],
  ['retrorays', 'Retro rays', '#2d1b69', '#ff4d9d', '#ffd23f'],
].map(([k, label, a, b, c])=> ({ k, label, a, b, c })));

const MAXSIDE = 1800;
function render(k, op, W, H){
  const s = Math.min(1, MAXSIDE / Math.max(W, H)), w = Math.max(8, Math.round(W * s)), h = Math.max(8, Math.round(H * s)), c = mk(w, h), ctx = c.getContext('2d');
  const o = { A:rgb(op.A), B:rgb(op.B), C:rgb(op.C), dens:clamp((op.dens === undefined ? 50 : op.dens) / 100, 0, 1), size:clamp((op.size === undefined ? 50 : op.size) / 100, 0, 1), r:mulberry((op.seed || 7) * 7919 + 13), u:Math.max(w, h) / 1000 };
  (S[k] || S.stars)(ctx, w, h, o); return c;
}

/* ---------------- colour grade ---------------- */
const GRADE0 = { hue:0, sat:0, bri:0, con:0, warm:0, glow:0, vig:0, grain:0, sepia:0, gray:0 };
const GRADES = {
  'Natural':{}, 'Cinematic':{ con:22, sat:12, warm:14, vig:35, bri:-4 }, 'Vintage':{ sepia:45, sat:-18, con:-10, warm:28, vig:42, grain:40 }, 'Noir':{ gray:1, con:35, vig:55, grain:30 },
  'Neon':{ sat:55, con:22, bri:4, glow:45 }, 'Faded':{ sat:-35, con:-22, bri:10, warm:8 }, 'Golden hour':{ warm:50, sat:22, hue:-8, vig:22, glow:20 }, 'Frost':{ warm:-50, sat:-10, bri:6, glow:10 },
  'Dreamy':{ glow:65, sat:15, bri:8, con:-8 }, 'Moody':{ bri:-24, con:28, sat:-8, vig:62, warm:-12 }, 'Pop':{ sat:60, con:25, bri:3 },
};
const isNeutral = g=> Object.keys(GRADE0).every(k=> !(+g[k]));
function grade(src, g){
  g = Object.assign({}, GRADE0, g); if(isNeutral(g)) return src;
  const w = src.width, h = src.height, out = mk(w, h), ctx = out.getContext('2d');
  ctx.filter = `hue-rotate(${g.hue}deg) saturate(${100 + g.sat}%) brightness(${100 + g.bri}%) contrast(${100 + g.con}%)` + (g.sepia ? ` sepia(${g.sepia}%)` : '') + (g.gray ? ' grayscale(1)' : '');
  ctx.drawImage(src, 0, 0); ctx.filter = 'none';
  if(g.warm){ ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = g.warm > 0 ? `rgba(255,150,60,${Math.abs(g.warm) / 100 * .5})` : `rgba(60,140,255,${Math.abs(g.warm) / 100 * .5})`; ctx.fillRect(0, 0, w, h); ctx.restore(); }
  if(g.glow){ const b = mk(w, h), bx = b.getContext('2d'); bx.filter = `blur(${Math.max(2, Math.round(Math.max(w, h) / 90))}px) brightness(1.25)`; bx.drawImage(out, 0, 0); ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = g.glow / 100 * .8; ctx.drawImage(b, 0, 0); ctx.restore(); }
  if(g.vig){ const gr = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .25, w / 2, h / 2, Math.hypot(w, h) * .55); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${g.vig / 100 * .85})`); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h); }
  if(g.grain){ const t = mk(256, 256), tx = t.getContext('2d'), im = tx.createImageData(256, 256), r = mulberry(5); for(let i = 0; i < 65536; i++){ const v = r() * 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; } tx.putImageData(im, 0, 0);
    ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = g.grain / 100 * .6; ctx.fillStyle = ctx.createPattern(t, 'repeat'); ctx.fillRect(0, 0, w, h); ctx.restore(); }
  return out;
}

MS.scenes = { list:LIST, render, grade, GRADES, GRADE0, isNeutral };
})();
