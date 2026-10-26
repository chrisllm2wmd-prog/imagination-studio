/* Merch Studio - Ad Studio: theme analysis, copy writing, layout templates and multi-size export (ported from the original Ad Builder,
   now building real editable objects on the shared canvas). */
(function(){
'use strict';
const MS = window.MS, M = MS.S.doc;
const { $, $$, clamp, toast, esc, uid } = MS;
const rad = d => d * Math.PI / 180;
const rot = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }; };
const FONTS = [
  ['Modern Sans', '"Montserrat"'], ['Arial Black', '"Archivo Black"'], ['Impact', '"Anton"'], ['Arial', '"Inter"'], ['Trebuchet', '"Work Sans"'],
  ['Verdana', '"Poppins"'], ['Georgia (serif)', '"Playfair Display"'], ['Palatino (serif)', '"Lora"'], ['Courier', '"Special Elite"'],
];
const SIZES = [
  ['Social', [['Square post', 1080, 1080], ['Portrait post', 1080, 1350], ['Story / Reel', 1080, 1920], ['Landscape link ad', 1200, 628], ['X / Twitter', 1600, 900], ['Pinterest pin', 1000, 1500]]],
  ['Display banners', [['Medium rectangle', 300, 250], ['Large rectangle', 336, 280], ['Leaderboard', 728, 90], ['Half page', 300, 600], ['Skyscraper', 160, 600], ['Billboard', 970, 250], ['Large mobile banner', 320, 100]]],
  ['Print (300 dpi)', [['Letter flyer', 2550, 3300], ['Postcard 6x4 in', 1800, 1200]]],
];

/* ============ colour helpers ============ */
function hexRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbHex(r, g, b) { return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); }
function shade(hex, a) { const [r, g, b] = hexRgb(hex), t = a < 0 ? 0 : 255, k = Math.abs(a); return rgbHex(r + (t - r) * k, g + (t - g) * k, b + (t - b) * k); }
function hexA(hex, a) { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; }
function lum(hex) { const [r, g, b] = hexRgb(hex).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; }
const contrast = hex => lum(hex) > 0.4 ? '#111111' : '#ffffff';

/* ============ state ============ */
const store = {};      // image id -> {id,name,bmp,w,h,url}
let library = [];      // image ids in display order
let refItems = [];     // Theme & Reference items: {id,kind:'file'|'text'|'image',name,raw?,ext?,url?,bitmap?}

function newState() {
  return {
    w: 1080, h: 1080, template: 'hero', auto: true, dirty: false,
    copy: { headline: 'Your Big Headline Goes Here', sub: 'One short line that makes people want it', cta: 'Shop Now',
      hFont: FONTS[1][1], bFont: FONTS[0][1], upper: false, accent: '#ff5a36', panel: '#14213d', text: '#ffffff', badge: '', footer: '', pill: 1 },
    bg: { mode: 'gradient', c1: '#1c2c52', c2: '#0b1226', angle: 150 },
    layers: [], sel: null,
  };
}
let S = newState();
const cur = () => S.layers.find(l => l.id === S.sel) || null;

/* ============ layer factories ============ */
function baseLayer(type, o) { return Object.assign({ id: uid(), type, x: 0, y: 0, w: 100, h: 100, rot: 0, opacity: 1, visible: true, locked: false, role: '' }, o); }
function imageLayer(img, o) { return baseLayer('image', Object.assign({ img, fit: 'cover', fx: .5, fy: .5, radius: 0, shadow: false, name: store[img] ? store[img].name : 'Picture' }, o)); }
function shapeLayer(o) { return baseLayer('shape', Object.assign({ color: '#000000', grad: 'none', radius: 0, name: 'Shape' }, o)); }
function textLayer(o) {
  return baseLayer('text', Object.assign({ text: 'Your text', font: S.copy.bFont, size: 64, weight: 700, color: S.copy.text, align: 'center',
    lh: 1.15, upper: false, bg: '', radius: 0, padX: 0, padY: 0, shadow: false, autoW: false, w: 400, h: 0, lines: [] }, o));
}
function layerName(l) {
  if (l.type === 'text') return (l.text || '').replace(/\s+/g, ' ').slice(0, 26) || 'Text';
  return l.name || (l.type === 'image' ? 'Picture' : 'Shape');
}


/* ============ text measuring ============ */
const mctx = document.createElement('canvas').getContext('2d');
const dispText = l => l.upper ? l.text.toUpperCase() : l.text;

function wrapLines(text, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    if (!para.trim()) { out.push(''); continue; }
    let line = '';
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      const test = line ? line + ' ' + word : word;
      if (line && mctx.measureText(test).width > maxW) { out.push(line); line = word; }
      else line = test;
      if (mctx.measureText(line).width > maxW && !line.includes(' ')) { // very long single word: break by character
        let chunk = '';
        for (const ch of line) { if (chunk && mctx.measureText(chunk + ch).width > maxW) { out.push(chunk); chunk = ch; } else chunk += ch; }
        line = chunk;
      }
    }
    out.push(line);
  }
  return out;
}
function textMetrics(l) {
  mctx.font = `${l.weight} ${l.size}px ${l.font}`;
  let lines, w = l.w;
  if (l.autoW) {
    lines = dispText(l).split('\n');
    w = Math.max(1, ...lines.map(s => mctx.measureText(s).width)) + 2 * l.padX;
  } else lines = wrapLines(dispText(l), Math.max(10, l.w - 2 * l.padX));
  return { lines, w, h: lines.length * l.size * l.lh + 2 * l.padY };
}
function initText(l) { const m = textMetrics(l); l.w = m.w; l.h = m.h; l.lines = m.lines; return l; }
// re-measure a text layer, keeping its top edge fixed (also when rotated)
function refreshText(l) {
  const m = textMetrics(l), oh = l.h || 0;
  const oc = { x: l.x + l.w / 2, y: l.y + oh / 2 };
  const sh = rot({ x: 0, y: (m.h - oh) / 2 }, rad(l.rot || 0));
  l.w = m.w; l.h = m.h; l.lines = m.lines;
  l.x = oc.x + sh.x - l.w / 2; l.y = oc.y + sh.y - l.h / 2;
}
function layoutAll(D) { for (const l of D.layers) if (l.type === 'text') refreshText(l); }
function fitSize(base, boxW, boxH, maxS, minS) {
  const fits = sz => {
    const t = { ...base, size: sz, w: boxW, autoW: false, padX: 0, padY: 0 };
    mctx.font = `${t.weight} ${sz}px ${t.font}`;
    for (const wd of dispText(t).split(/\s+/)) if (mctx.measureText(wd).width > boxW) return false;
    return textMetrics(t).h <= boxH;
  };
  let lo = minS, hi = Math.max(minS, maxS), best = minS;
  if (fits(hi)) return hi;
  for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (fits(mid)) { best = mid; lo = mid; } else hi = mid; }
  return best;
}


/* ============ layout templates ============ */
const libImgs = () => library.filter(id => store[id]);
function ctxInfo() {
  const W = S.w, fb = footerBand(), H = S.h - fb, u = Math.min(W, H), asp = W / H;
  return { W, H, u, asp, wide: asp >= 2.4, pad: Math.max(6, u * 0.06), c: S.copy, fb };
}
// height of the little "email footer" strip a style can add along the bottom edge
// vertical room the badge pill takes at the top edge (0 when there is no badge)
function badgeH() { const u = Math.min(S.w, S.h - footerBand()); return S.copy.badge && S.copy.badge.trim() && S.h >= 250 && S.w >= 250 ? clamp(u * .028, 10, 64) * 1.9 + Math.max(6, u * .06) * .8 : 0; }
function footerBand() { return S.copy.footer && S.copy.footer.trim() && S.h >= 280 && S.w >= 240 ? Math.max(18, Math.round(S.h * 0.05)) : 0; }
// background for text-only designs: subtle on light panels, deeper on dark ones
function panelBg(panel) {
  return lum(panel) > .5 ? { mode: 'gradient', c1: panel, c2: shade(panel, -.07), angle: 160 } : { mode: 'gradient', c1: shade(panel, .12), c2: shade(panel, -.4), angle: 150 };
}
function containBox(id, a) {
  const im = store[id], s = Math.min(a.w / im.w, a.h / im.h), w = im.w * s, h = im.h * s;
  return { x: a.x + (a.w - w) / 2, y: a.y + (a.h - h) / 2, w, h };
}
function splitRect(r, vertical, gap, ratio = .5) {
  if (vertical) { const w1 = (r.w - gap) * ratio; return [{ x: r.x, y: r.y, w: w1, h: r.h }, { x: r.x + w1 + gap, y: r.y, w: r.w - w1 - gap, h: r.h }]; }
  const h1 = (r.h - gap) * ratio; return [{ x: r.x, y: r.y, w: r.w, h: h1 }, { x: r.x, y: r.y + h1 + gap, w: r.w, h: r.h - h1 - gap }];
}
function gridRects(n, r, gap) {
  if (n <= 1) return [r];
  const land = r.w >= r.h;
  if (n === 2) return splitRect(r, land, gap);
  if (n === 3) { const [a, b] = splitRect(r, land, gap, .56); return [a, ...splitRect(b, !land, gap)]; }
  const [t, b] = splitRect(r, false, gap); return [...splitRect(t, true, gap), ...splitRect(b, true, gap)];
}

function ctaButton(h, maxW) {
  const c = S.copy;
  const l = textLayer({ role: 'cta', text: c.cta, font: c.bFont, weight: 700, color: contrast(c.accent), align: 'center', bg: c.accent, autoW: true, lh: 1.1, name: 'Button' });
  l.size = h * 0.4; l.padY = (h - l.size * l.lh) / 2; l.padX = h * 0.75; l.radius = h / 2 * (c.pill == null ? 1 : c.pill);
  const m = textMetrics(l);
  if (m.w > maxW) { const k = maxW / m.w; l.size *= k; l.padX *= k; l.padY *= k; l.radius *= k; }
  return initText(l);
}

// headline + sub-headline + button stacked inside rect
function textStack(rect, o = {}) {
  const { u, c } = ctxInfo();
  const align = o.align || 'left', color = o.color || c.text;
  const hasSub = !!c.sub.trim() && rect.h >= 90 && !o.noSub;
  const hasCta = !!c.cta.trim() && !o.noCta;
  const gap = Math.min(rect.h * 0.05, u * 0.04), hs = o.headScale || 0.32;
  const ctaH = hasCta ? clamp(rect.h * 0.14, 22, u * 0.1) : 0, subH = hasSub ? rect.h * 0.16 : 0;
  const headH = Math.max(10, rect.h - ctaH - subH - ((hasSub ? 1 : 0) + (hasCta ? 1.5 : 0)) * gap);
  const items = [];
  if (c.headline.trim()) {
    const l = textLayer({ role: 'headline', text: c.headline, font: c.hFont, weight: 700, color, align, upper: c.upper, lh: 1.08, w: rect.w, shadow: !!o.shadow });
    l.size = fitSize(l, rect.w, headH, Math.min(rect.h, rect.w) * hs, 8); items.push(initText(l));
  }
  if (hasSub) {
    const l = textLayer({ role: 'sub', text: c.sub, font: c.bFont, weight: 400, color, align, lh: 1.25, w: rect.w, shadow: !!o.shadow });
    l.size = fitSize(l, rect.w, subH, Math.min(rect.h, rect.w) * 0.085, 8); items.push(initText(l));
  }
  if (hasCta) items.push(ctaButton(ctaH, rect.w));
  const gapBefore = l => l.role === 'cta' ? gap * 1.5 : gap;
  const total = items.reduce((s, l, i) => s + l.h + (i ? gapBefore(l) : 0), 0);
  let y = o.vAlign === 'top' ? rect.y : o.vAlign === 'bottom' ? rect.y + rect.h - total : rect.y + (rect.h - total) / 2;
  items.forEach((l, i) => {
    if (i) y += gapBefore(l);
    l.y = y; y += l.h;
    l.x = l.role !== 'cta' ? rect.x : align === 'center' ? rect.x + (rect.w - l.w) / 2 : align === 'right' ? rect.x + rect.w - l.w : rect.x;
  });
  return items;
}
// very wide banners: text on the left, button on the right, all on one row
function wideRow(rect, o = {}) {
  const { pad, c } = ctxInfo(), L = [];
  const inner = { x: rect.x + pad, y: rect.y + pad, w: rect.w - 2 * pad, h: rect.h - 2 * pad };
  let cta = null;
  if (c.cta.trim()) { cta = ctaButton(clamp(inner.h * 0.5, 20, 90), inner.w * 0.34); cta.x = inner.x + inner.w - cta.w; cta.y = inner.y + (inner.h - cta.h) / 2; }
  const tr = { x: inner.x, y: inner.y, w: inner.w - (cta ? cta.w + pad : 0), h: inner.h };
  L.push(...textStack(tr, { align: 'left', vAlign: 'middle', noCta: true, headScale: .55, shadow: o.shadow, color: o.color }));
  if (cta) L.push(cta);
  return L;
}

function tplHero(centered) {
  const { W, H, wide, pad, c } = ctxInfo(), imgs = libImgs(), L = [], has = imgs.length > 0;
  const bg = has ? { mode: 'solid', c1: '#0d0f14', c2: '#0d0f14', angle: 0 } : panelBg(c.panel);
  const tc = has ? '#ffffff' : undefined;   // text sits on the dark photo shade, so it stays white
  if (has) {
    L.push(imageLayer(imgs[0], { x: 0, y: 0, w: W, h: H, locked: true }));
    if (wide) L.push(shapeLayer({ x: 0, y: 0, w: W, h: H, grad: 'left', opacity: .85, locked: true, name: 'Shade' }));
    else if (centered) L.push(shapeLayer({ x: 0, y: 0, w: W, h: H, opacity: .45, locked: true, name: 'Shade' }));
    else L.push(shapeLayer({ x: 0, y: H * .3, w: W, h: H * .7, grad: 'bottom', opacity: .88, locked: true, name: 'Shade' }));
  }
  if (wide) L.push(...wideRow({ x: 0, y: 0, w: W, h: H }, { shadow: has, color: tc }));
  else if (centered) L.push(...textStack({ x: pad * 1.4, y: pad, w: W - pad * 2.8, h: H - 2 * pad }, { align: 'center', vAlign: 'middle', shadow: has, color: tc }));
  else L.push(...textStack({ x: pad, y: H * .4, w: W - 2 * pad, h: H * .6 - pad }, { align: 'left', vAlign: 'bottom', shadow: has, color: tc }));
  return { bg, layers: L };
}
function tplSplit(multi) {
  const { W, H, asp, wide, pad, c } = ctxInfo(), imgs = libImgs().slice(0, multi ? 4 : 1), L = [];
  const bg = { mode: 'solid', c1: c.panel, c2: c.panel, angle: 0 };
  let ir, tr;
  if (asp >= 1.15) { const f = wide ? .3 : .5; ir = { x: 0, y: 0, w: W * f, h: H }; tr = { x: W * f, y: 0, w: W * (1 - f), h: H }; }
  else { const f = asp > .55 ? .56 : .46; ir = { x: 0, y: 0, w: W, h: H * f }; tr = { x: 0, y: H * f, w: W, h: H * (1 - f) }; }
  let gap = 0;
  if (multi && imgs.length > 1) { gap = Math.max(2, pad * .3); const m = gap; ir = { x: ir.x + m, y: ir.y + m, w: ir.w - 2 * m, h: ir.h - 2 * m }; }
  gridRects(imgs.length, ir, gap).forEach((r, i) => L.push(imageLayer(imgs[i], { ...r })));
  if (wide) L.push(...wideRow(tr));
  else { const P = pad * 1.2; L.push(...textStack({ x: tr.x + P, y: tr.y + P * .8, w: tr.w - 2 * P, h: tr.h - P * 1.6 }, { align: asp >= 1.15 ? 'left' : 'center', vAlign: 'middle' })); }
  return { bg, layers: L };
}
function tplSpot() {
  const { W, H, u, asp, wide, pad, c } = ctxInfo(), imgs = libImgs(), L = [];
  const bg = panelBg(c.panel);
  const place = a => { if (!imgs.length) return; L.push(imageLayer(imgs[0], { ...containBox(imgs[0], a), shadow: true, radius: u * .02 })); };
  if (wide) { place({ x: pad, y: pad, w: H - 2 * pad, h: H - 2 * pad }); L.push(...wideRow({ x: H, y: 0, w: W - H, h: H })); }
  else if (asp >= 1.5) {
    place({ x: W * .5, y: pad, w: W * .5 - pad * 1.5, h: H - 2 * pad });
    L.push(...textStack({ x: pad * 1.5, y: pad, w: W * .5 - pad * 2.5, h: H - 2 * pad }, { align: 'left', vAlign: 'middle' }));
  } else {
    const bh = badgeH(), top = textStack({ x: pad, y: pad + bh, w: W - 2 * pad, h: H * .27 }, { align: 'center', vAlign: 'top', noCta: true });
    const tb = top.length ? Math.max(...top.map(l => l.y + l.h)) : pad;
    let cta = null, ctaTop = H - pad;
    if (c.cta.trim()) { cta = ctaButton(clamp(H * .075, 22, u * .1), W - 2 * pad); cta.x = (W - cta.w) / 2; cta.y = H - pad - cta.h; ctaTop = cta.y; }
    const g = pad * .6;
    place({ x: pad, y: tb + g, w: W - 2 * pad, h: Math.max(20, ctaTop - g - (tb + g)) });
    L.push(...top); if (cta) L.push(cta);
  }
  return { bg, layers: L };
}
const TEMPLATES = {
  hero: () => tplHero(false), center: () => tplHero(true), split: () => tplSplit(false),
  collage: () => tplSplit(true), spot: tplSpot,
  blank: () => ({ bg: { mode: 'solid', c1: S.copy.panel, c2: S.copy.panel, angle: 0 }, layers: [] }),
};
const TPL_LABELS = { hero: 'Photo + text', center: 'Centered', split: 'Split', collage: 'Collage', spot: 'Spotlight', blank: 'Blank' };
const TPL_USES_MANY = { collage: true };

function applyTemplate(name, opt = {}) {
  const old = {}, prevSel = S.sel;
  if (opt.preserve) S.layers.forEach(l => { if (l.role) old[l.role] = l.id; });
  const r = TEMPLATES[name]();
  S.template = name; S.bg = r.bg; S.layers = r.layers; S.dirty = false;
  if (name !== 'blank') S.layers.push(...styleExtras(r.bg));
  for (const l of S.layers) if (l.role && old[l.role]) l.id = old[l.role];
  S.sel = S.layers.some(l => l.id === prevSel) ? prevSel : null;
  layoutAll(S);
}

const STOP = new Set(('the and for with that this from your you are was were will have has had not but our out can all any one new use get more about into over than then them they their what when where which who how why also just like now its only very much many most some such been being does did doing here there these those each other own same too off per via yes let make made can\'t don\'t we\'re you\'re it\'s ' +
  'home menu contact login sign privacy terms cookies copyright rights reserved click read learn view take themselves seriously latest play really honestly totally pretty goofy little tiny lots sure well even still every always never first last next back').split(/\s+/));
const LANG_WORDS = {
  en: 'the and of to in is you that it for with on are this be as at your we',
  es: 'el la de que y en los del se las por un para con no una su al lo como más pero sus',
  fr: 'le la les des et est en un une du que pour dans qui pas sur au avec ce il nous vous',
  de: 'der die und in den von zu das mit sich des auf für ist im dem nicht ein eine als auch',
  pt: 'o a os as de do da em um uma para com não que se por mais dos das',
  it: 'il lo la le di che e un una per con non del della sono più in',
  nl: 'de het een en van ik te dat die in is niet zijn voor met op aan',
};
const LANG_NAMES = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', it: 'Italian', nl: 'Dutch' };
const cleanTxt = s => (s || '').replace(/\s+/g, ' ').trim();

function detectLang(words, declared) {
  const d = (declared || '').slice(0, 2).toLowerCase();
  if (LANG_NAMES[d]) return d;
  const set = w => new Set(w.split(' ')); let best = 'en', bs = -1;
  for (const [k, v] of Object.entries(LANG_WORDS)) { const s = set(v); const sc = words.filter(w => s.has(w)).length; if (sc > bs) { bs = sc; best = k; } }
  return best;
}

function extractHtml(raw) {
  raw = raw.replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer|blockquote)\s*>|<br\s*\/?>/gi, m => m + '\n');
  const doc = new DOMParser().parseFromString(raw, 'text/html');
  const meta = n => { const e = doc.querySelector(`meta[name="${n}"],meta[property="${n}"]`); return e ? cleanTxt(e.getAttribute('content')) : ''; };
  const out = { title: cleanTxt(doc.title), desc: meta('description') || meta('og:description'), siteName: meta('og:site_name'), theme: meta('theme-color'), lang: doc.documentElement.getAttribute('lang') || '' };
  out.css = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n') + '\n' + [...doc.querySelectorAll('[style]')].map(e => e.getAttribute('style')).join('\n');
  out.headings = [...doc.querySelectorAll('h1,h2,h3')].map(e => cleanTxt(e.textContent)).filter(Boolean);
  out.ctas = [...doc.querySelectorAll('button,a[class*=btn],a[class*=button],a[class*=cta],input[type=submit],input[type=button]')]
    .map(e => cleanTxt(e.value || e.textContent)).filter(s => s && s.length <= 32 && s.split(' ').length <= 5);
  out.images = [...doc.querySelectorAll('img')].map(e => ({ src: e.getAttribute('src') || '', alt: cleanTxt(e.getAttribute('alt')) })).filter(i => i.src);
  const og = meta('og:image'); if (og) out.images.push({ src: og, alt: 'og:image' });
  doc.querySelectorAll('script,style,noscript,template,svg,iframe').forEach(e => e.remove());
  out.text = (doc.body ? doc.body.textContent : '').split('\n').map(cleanTxt).filter(Boolean).join('\n');
  return out;
}
function jsonStrings(v, out = []) { if (typeof v === 'string') { if (v.length > 2 && !/^(https?:|#|\/|[\w.-]+\.(png|jpe?g|css|js)$)/i.test(v)) out.push(v); } else if (Array.isArray(v)) v.forEach(x => jsonStrings(x, out)); else if (v && typeof v === 'object') Object.values(v).forEach(x => jsonStrings(x, out)); return out; }

/* ---- colours & fonts ---- */
function normHex(h) { h = h.replace('#', '').toLowerCase(); if (h.length === 3) h = h.split('').map(x => x + x).join(''); return /^[0-9a-f]{6}$/.test(h) ? '#' + h : null; }
function toHsl(hex) {
  let [r, g, b] = hexRgb(hex).map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)); return { s, l };
}
function extractColors(css, theme) {
  const counts = {}, add = (h, w = 1) => { h = normHex(h); if (h) counts[h] = (counts[h] || 0) + w; };
  css.replace(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b/gi, (m, h) => { add(h.length === 8 ? h.slice(0, 6) : h); return m; });
  css.replace(/rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/gi, (m, r, g, b) => { add(rgbHex(+r, +g, +b)); return m; });
  css.replace(/--[\w-]*(?:primary|accent|brand|main|theme|highlight)[\w-]*\s*:\s*(#[0-9a-f]{3,8})/gi, (m, h) => { add(h, 6); return m; });
  if (theme) add(theme, 8);
  return counts;
}
function pickPalette(counts) {
  const list = Object.entries(counts).map(([hex, n]) => ({ hex, n, ...toHsl(hex) }));
  const acc = list.filter(c => c.s >= .3 && c.l >= .2 && c.l <= .82).sort((a, b) => b.n * b.s - a.n * a.s)[0];
  const dark = list.filter(c => c.l < .28).sort((a, b) => b.n - a.n)[0];
  const accent = acc ? acc.hex : '#ff5a36';
  const panel = dark ? dark.hex : shade(accent, -.72);
  const swatches = [...new Set([accent, panel, ...list.filter(c => c.s >= .2 || c.l < .25).sort((a, b) => b.n - a.n).map(c => c.hex)])].slice(0, 7);
  return { accent, panel, text: lum(panel) > .5 ? '#111111' : '#ffffff', swatches, found: list.length > 0 };
}
function pickFonts(css) {
  const fams = []; css.replace(/font-family\s*:\s*([^;}{]+)/gi, (m, v) => { fams.push(v.split(',')[0].replace(/['"]/g, '').trim()); return m; });
  const freq = {}; fams.forEach(f => freq[f] = (freq[f] || 0) + 1);
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]; const name = top ? top[0] : '';
  const L = name.toLowerCase();
  let kind = 'sans', h = FONTS[1][1], b = FONTS[0][1];
  if (/mono|courier|consolas|menlo|code/.test(L)) { kind = 'mono'; h = b = FONTS[8][1]; }
  else if (/georgia|times|garamond|playfair|merriweather|lora|serif/.test(L) && !/sans/.test(L)) { kind = 'serif'; h = FONTS[6][1]; b = FONTS[6][1]; }
  else if (/impact|anton|bebas|oswald/.test(L)) { kind = 'display'; h = FONTS[2][1]; }
  return { name: name || 'system default', kind, h, b };
}

/* ---- tone ---- */
function toneScores(text, sents) {
  const words = text.toLowerCase().match(/[a-z']+/g) || [], n = Math.max(30, words.length), per = x => x / n * 100;
  const cnt = re => (text.match(re) || []).length;
  const contr = cnt(/\b[a-z]+'(?:t|re|ll|ve|d|m)\b/gi);
  const casual = cnt(/\b(hey|hi|yeah|yep|cool|awesome|gonna|wanna|kinda|stuff|folks|super|pretty|totally|lol|ok|okay|grab|whole|cheers|fun|love)\b/gi);
  const you = cnt(/\b(you|your|yours)\b/gi), we = cnt(/\b(we|our|us)\b/gi);
  const formal = cnt(/\b(therefore|furthermore|moreover|hereby|pursuant|regarding|kindly|ensure|provide|comprehensive|solutions?|enterprise|compliance|terms|policy|accordingly|whilst|utili[sz]e|facilitate|stakeholders?|organi[sz]ations?|services?|professional|leading|dedicated|committed)\b/gi);
  const avgLen = words.reduce((s, w) => s + w.length, 0) / Math.max(1, words.length);
  const hum = cnt(/\b(lol|haha+|hehe|oops|yikes|whoops|silly|goofy|ridiculous|weird|funny|joke|pun|nope|spoiler|honestly|literally|obviously|snack|nap|cats?|dogs?|coffee|awkward|chaos|mess)\b/gi)
    + cnt(/\p{Extended_Pictographic}/gu) * 1.5 + cnt(/\?!|!\?|!{2,}/g) * 2 + cnt(/\([^)]{4,70}\)/g) * .8 + cnt(/\.\.\./g) * .5;
  const exc = cnt(/!/g), caps = cnt(/\b[A-Z]{3,}\b/g);
  const hype = cnt(/\b(amazing|incredible|revolutionary|now|today|hurry|limited|ultimate|boost|supercharge|unleash|powerful|instantly|free|exclusive|best|epic|huge|brand new)\b/gi);
  const tech = cnt(/\b(api|sdk|deploy(?:ment)?|integrations?|scalable|scalability|framework|algorithm|latency|config(?:uration)?|repo|stack|open-source|runtime|async|cloud|pipeline|metrics|backend|frontend|database|encryption|workflow|infrastructure|architecture|analytics|platform|protocol|middleware|docker|json|http|css|html|javascript|python|server|client|plugin|module|dependency)\b/gi);
  const long = words.filter(w => w.length >= 10).length;
  const asl = sents.length ? sents.reduce((s, x) => s + x.split(/\s+/).length, 0) / sents.length : 12;
  return {
    tone: {
      formal: Math.round(clamp(52 + per(formal) * 7 - per(contr + casual) * 4 - per(you) + (avgLen - 4.8) * 14, 5, 95)),
      humor: Math.round(clamp(12 + per(hum) * 16, 5, 95)),
      energy: Math.round(clamp(18 + exc / Math.max(1, sents.length) * 70 + per(caps) * 5 + per(hype) * 7, 5, 95)),
      jargon: Math.round(clamp(10 + per(tech) * 9 + per(long) * 3, 5, 95)),
      length: Math.round(clamp((asl - 6) * 6, 22, 90)),
    },
    emoji: per(cnt(/\p{Extended_Pictographic}/gu)) > .3,
    person: you > we * 1.3 ? 'you' : we > you * 1.3 ? 'we' : 'mixed',
  };
}
function describeTone(t, person) {
  const d = [t.formal > 62 ? 'formal' : t.formal < 40 ? 'casual' : 'balanced'];
  if (t.humor > 50) d.push('funny'); else if (t.humor < 25) d.push('serious');
  d.push(t.energy > 60 ? 'high-energy' : t.energy < 35 ? 'calm' : 'steady');
  d.push(t.jargon > 50 ? 'technical' : 'plain-spoken');
  d.push(t.length < 35 ? 'concise' : t.length > 65 ? 'detailed' : 'medium-length');
  if (person === 'you') d.push('talks to "you"'); else if (person === 'we') d.push('speaks as "we"');
  return d;
}
function keywordsOf(text) {
  const f = {}; (text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []).forEach(w => { if (!STOP.has(w)) f[w] = (f[w] || 0) + 1; });
  return Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, 10).map(e => e[0]);
}
function guessName(x, fallback) {
  const bad = /^(home|welcome|index|untitled|homepage)$/i;
  let n = x.siteName;
  if (!n && x.title) n = x.title.split(/\s+[|\-–—·:]\s+/).map(s => s.trim()).find(s => s && !bad.test(s));
  if (!n) n = x.headings.find(h => h.length <= 40);
  return (n || fallback).slice(0, 40);
}

/* ---- dominant colours out of a reference picture (down-sampled + bucketed) ---- */
function sampleImageColors(bmp) {
  const c = document.createElement('canvas'), size = 48;
  const s = Math.min(size / bmp.width, size / bmp.height, 1);
  c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
  const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0, c.width, c.height);
  let data; try { data = ctx.getImageData(0, 0, c.width, c.height).data; } catch (e) { return {}; }
  const counts = {}, q = v => Math.round(v / 24) * 24;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const hex = rgbHex(q(data[i]), q(data[i + 1]), q(data[i + 2]));
    counts[hex] = (counts[hex] || 0) + 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1, scaled = {};
  for (const [h, n] of Object.entries(counts)) scaled[h] = (n / total) * 12; // weight comparable to a CSS colour mention
  return scaled;
}

/* ---- put it all together: merge every Theme & Reference item into one profile ---- */
async function computeProfileFromRefItems() {
  if (!refItems.length) return null;
  const x = { title: '', desc: '', siteName: '', theme: '', lang: '', css: '', headings: [], ctas: [], images: [], text: '' };
  let imgColorCounts = {};
  const fileNames = [], properFileNames = []; // properFileNames: only real uploaded files, used for the brand-name fallback
  for (const item of refItems) {
    if (item.kind === 'file') {
      fileNames.push(item.name); if (!item.synthetic) properFileNames.push(item.name);
      const raw = item.raw, ext = item.ext;
      if (ext === 'html' || ext === 'htm') {
        const h = extractHtml(raw);
        x.title = x.title || h.title; x.desc = x.desc || h.desc; x.siteName = x.siteName || h.siteName; x.theme = x.theme || h.theme; x.lang = x.lang || h.lang;
        x.css += '\n' + h.css; x.headings.push(...h.headings); x.ctas.push(...h.ctas); x.images.push(...h.images); x.text += '\n' + h.text;
      } else if (ext === 'css') x.css += '\n' + raw;
      else if (ext === 'json') { try { x.text += '\n' + jsonStrings(JSON.parse(raw)).join('\n'); } catch (e) { x.text += '\n' + raw; } }
      else x.text += '\n' + raw.replace(/^#{1,6}\s*/gm, '').replace(/[*_`>]|\[([^\]]*)\]\([^)]*\)/g, '$1');
    } else if (item.kind === 'text') {
      fileNames.push(item.name); x.text += '\n' + item.raw;
    } else if (item.kind === 'image') {
      fileNames.push(item.name);
      const ic = sampleImageColors(item.bitmap);
      for (const [h, n] of Object.entries(ic)) imgColorCounts[h] = (imgColorCounts[h] || 0) + n;
    }
  }
  const text = x.text.trim(), words = text.toLowerCase().match(/[a-zÀ-ɏ']+/g) || [];
  const sents = text.split(/\n+|(?<=[.!?])\s+/).map(cleanTxt).filter(s => s.split(/\s+/).length >= 3);
  const t = toneScores(text, sents), lang = detectLang(words, x.lang);
  const first = properFileNames[0] ? properFileNames[0].replace(/\.[^.]+$/, '') : 'Your brand';
  const tag = x.desc || sents.find(s => s.length >= 20 && s.length <= 140) || '';
  const uniq = a => [...new Set(a.map(cleanTxt))].filter(Boolean);
  const cssColorCounts = extractColors(x.css, x.theme);
  const mergedCounts = { ...cssColorCounts };
  for (const [h, n] of Object.entries(imgColorCounts)) mergedCounts[h] = (mergedCounts[h] || 0) + n;
  return {
    name: guessName(x, first), tagline: tag.slice(0, 160), lang, langName: LANG_NAMES[lang] || lang, words: words.length, files: fileNames,
    headings: uniq(x.headings).slice(0, 6), ctas: uniq(x.ctas).slice(0, 6), keywords: keywordsOf((x.headings.join(' ') + ' ').repeat(3) + text),
    colors: pickPalette(mergedCounts), fonts: pickFonts(x.css),
    tone: t.tone, emoji: t.emoji, person: t.person, descr: describeTone(t.tone, t.person),
    images: x.images, dataImages: x.images.filter(i => /^data:image\//.test(i.src)).map(i => i.src).slice(0, 8),
  };
}
async function dataUrlToFile(url, i) {
  const b = await (await fetch(url)).blob(); return new File([b], `site-image-${i + 1}.${(b.type.split('/')[1] || 'png').replace('+xml', '')}`, { type: b.type });
}

/* ============ campaign phrase banks ============ */
// each line: [text, formality, humour, energy] (0-100 = the tone it suits). Slots: {what} {brand} {topic} {n}
const CAMPAIGNS = {
  merch: {
    label: 'New merch / product drop', what: 'the new {brand} merch', emoji: '🛍️',
    H: [['Introducing {what}.', 75, 10, 30], ['{what} has landed.', 50, 20, 55], ['Fresh drop: {what}!', 20, 25, 85], ["You've been asking. {what} is here.", 30, 40, 60],
      ['Wear it. Love it. Repeat.', 35, 55, 70], ['{brand} gear, finally.', 30, 45, 45], ['New arrivals: {what}', 85, 0, 25], ['Your wardrobe called. It wants {what}.', 20, 85, 60]],
    S: [['Limited quantities. Available now at {brand}.', 70, 5, 45], ['Designed by us, made for you. Grab yours before it sells out.', 35, 15, 70],
      ['Soft, sturdy and suspiciously good-looking.', 25, 85, 50], ['Now available in our online store.', 85, 0, 15], ["Once it's gone, it's gone. (We checked. Twice.)", 25, 80, 65]],
    C: [['Shop Now', 50, 0, 60], ['Get Yours', 30, 10, 75], ['View the Collection', 85, 0, 20], ['Take Me There', 20, 60, 50]],
  },
  feature: {
    label: 'New feature / update', what: 'our latest update', emoji: '✨',
    H: [['Introducing {what}.', 75, 5, 35], ['{what} is here.', 55, 10, 50], ['New in {brand}: {what}', 65, 5, 40], ['You asked. We built it.', 30, 25, 60], ["{what}? It's live!", 25, 20, 85],
      ['Say hello to {what}.', 35, 35, 55], ['Meet {what}. It does the annoying bits for you.', 25, 75, 50], ['{brand} just got better.', 55, 10, 55]],
    S: [['Available today for all users. See what has changed.', 80, 0, 25], ['Faster, simpler and easier to use.', 55, 5, 45], ['We fixed the thing you were grumbling about.', 20, 85, 40],
      ['Everything you need, right where you expect it.', 50, 10, 30], ["Update now and you'll wonder how you managed without it.", 30, 25, 60]],
    C: [["See What's New", 55, 5, 45], ['Try It Now', 35, 5, 70], ['Read the Release Notes', 85, 0, 10], ['Take a Look', 30, 20, 40]],
  },
  content: {
    label: 'New content (post / video / episode)', what: 'our newest post', emoji: '📝',
    H: [['New: {what}', 60, 5, 35], ['Fresh off the press: {what}', 40, 25, 55], ['{what} is live.', 55, 5, 45], ['Just dropped: {what}', 20, 25, 80], ['Go on, have a read.', 25, 55, 35],
      ['Good news: {what} is out.', 35, 20, 50], ["You'll want to see {what}.", 25, 35, 55], ['Now publishing: {what}', 85, 0, 15]],
    S: [['Our latest is ready for you. Grab a coffee and dive in.', 30, 20, 40], ['A closer look at {topic}, from the team at {brand}.', 70, 0, 25],
      ["Worth your time, we promise. (Or your money back. It's free.)", 25, 85, 55], ['Read, watch or listen, whichever suits you.', 45, 10, 35]],
    C: [['Read It Now', 45, 5, 50], ['Watch Now', 40, 5, 60], ['Dive In', 25, 15, 70], ['Continue to Article', 85, 0, 10]],
  },
  sale: {
    label: 'Sale / discount', what: 'everything', emoji: '🔥',
    H: [['Save {n}% on {what}.', 55, 0, 55], ['{n}% off. Today only.', 40, 5, 80], ['The {brand} sale is on!', 30, 10, 90], ["Big savings, small print (there isn't any).", 25, 80, 50],
      ['Prices dropped. So did our jaws.', 20, 80, 65], ['Exclusive offer: {n}% off {what}', 85, 0, 30], ["Don't miss out: {n}% off", 30, 5, 95]],
    S: [['Offer ends soon. While stocks last.', 60, 0, 60], ['Your wallet will thank you. Your friends will ask where you got it.', 25, 80, 45], ['Use the code at checkout. Terms apply.', 85, 0, 10], ['Everything we make, a little cheaper.', 35, 15, 50]],
    C: [['Shop the Sale', 45, 0, 60], ['Claim {n}% Off', 40, 5, 75], ['Grab the Deal', 25, 15, 80], ['View Offer', 85, 0, 10]],
  },
  event: {
    label: 'Event / webinar', what: 'our next event', emoji: '📅',
    H: [['Join us: {what}', 60, 0, 45], ["You're invited to {what}", 70, 5, 30], ['Save the date: {what}', 55, 5, 45], ['{what} is coming. Bring a friend!', 25, 25, 70], ['Live: {what}. Be there.', 40, 5, 75],
      ['Come for the ideas. Stay for the snacks.', 25, 75, 50], ['Registration open: {what}', 88, 0, 15]],
    S: [['Free to attend. Limited spaces available.', 65, 0, 40], ['Hosted by {brand}. Reserve your place today.', 75, 0, 30], ['Learn, meet, and leave with something useful.', 40, 10, 45],
      ['Seats are filling up faster than the biscuit table.', 20, 85, 60]],
    C: [['Reserve My Spot', 35, 5, 65], ['Register Now', 60, 0, 55], ['Save My Seat', 35, 10, 60], ['Add to Calendar', 65, 0, 20]],
  },
  news: {
    label: 'Announcement / newsletter', what: 'our latest news', emoji: '📣',
    H: [['News from {brand}', 70, 0, 20], ["What's new at {brand}", 50, 5, 35], ['A quick update from us', 40, 5, 20], ['Big news: {what}', 30, 10, 80], ['{brand} announces {what}', 90, 0, 20], ["Here's what we've been up to", 25, 25, 35]],
    S: [['A short note on {what} and what it means for you.', 55, 0, 25], ['Everything you need to know, in about a minute.', 35, 15, 40], ["We wrote it down so you don't have to guess.", 25, 60, 30],
      ['Full details are available on our website.', 88, 0, 10]],
    C: [['Read the Update', 50, 0, 35], ['Learn More', 55, 0, 35], ['Catch Up', 25, 15, 50], ['Find Out More', 60, 0, 25]],
  },
  winback: {
    label: 'We miss you / come back', what: 'everything new', emoji: '💌',
    H: [['We miss you.', 40, 10, 25], ["It's been a while, hasn't it?", 30, 25, 25], ['Come back to {brand}.', 50, 5, 50], ["Still thinking about us? We're thinking about you.", 25, 50, 40],
      ['A lot has changed at {brand}.', 55, 5, 30], ['Your seat is still warm.', 25, 70, 30]],
    S: [['Pop back in and see what\'s new. We saved you a spot.', 30, 20, 40], ["Log in to see what you've missed.", 55, 0, 30], ['No hard feelings. Plenty of new things, though.', 25, 60, 40],
      ['Return today and pick up right where you left off.', 65, 0, 45]],
    C: [['Come Back', 30, 10, 50], ["See What's New", 50, 0, 35], ['Log Back In', 55, 0, 25], ['Take Me Back', 20, 55, 55]],
  },
};
// optional one-liners appended when humour is turned up
const WINKS = ['(Yes, really.)', "We're not even sorry.", 'Your move.', 'No pressure. (Some pressure.)', 'Honestly.', 'You heard it here first.'];

/* ============ style presets (incl. spoofs) & copy generator ============ */
// pal = [button, panel, text]; fonts are indexes into FONTS; pill = button roundness 0..1
const STYLES = {
  brand: { label: 'Your brand', note: 'Uses the voice, colours and fonts read from your source', E: '' },
  flowers: {
    label: 'Spoof: Flower shop', pal: ['#d6336c', '#fdeef2', '#5a1f35'], hF: 6, bF: 7, pill: 1, tpl: 'spot', E: '🌸',
    H: ['Say it with {what}.', '{what}, freshly picked for you.', 'Roses are red. {what} is here.', 'Because {what} deserves a bouquet.', 'Blooming marvellous: {what}'],
    S: ['Hand-tied with love and delivered the same day.', 'Order before 3pm for free same-day delivery.', 'Seasonal stems, arranged by our florists.', 'Perfect for birthdays, anniversaries and apologies.'],
    C: ['Order Bouquet', 'Send Flowers', 'Shop Blooms'], B: ['Same-day delivery', 'Fresh today', "Mother's Day is coming"], F: ['{brand} Florals · Sent with love · Unsubscribe'],
  },
  team: {
    label: 'Spoof: Team building', pal: ['#0b5cab', '#eef3f8', '#1f2d3d'], hF: 3, bF: 3, pill: .25, tpl: 'split', E: '🤝',
    H: ['Team Building Day: {what}', 'Mandatory Fun: {what}', 'Synergy Session: {what}', "Let's Circle Back on {what} (Together!)", 'Together Everyone Achieves More: {what}'],
    S: ['Please RSVP by end of day. Snacks will be provided.', 'Trust falls begin at 10:00. Comfortable shoes recommended.', 'Attendance is optional but noted.', 'Your participation is valued and will be reflected in Q3 fun metrics.'],
    C: ['RSVP Now', 'Add to Calendar', 'Confirm Attendance'], B: ['MANDATORY FUN', 'ALL STAFF', 'ACTION REQUIRED'], F: ['Sent by People & Culture · Please do not reply · {brand} internal'],
  },
  memo: {
    label: 'Spoof: Office memo', pal: ['#555555', '#ffffff', '#222222'], hF: 6, bF: 6, pill: 0, tpl: 'split', E: '📎',
    H: ['Reminder: {what}', 'FYI: {what}', 'Re: Re: Fwd: {what}', 'Notice regarding {what}', 'Kind reminder about {what}'],
    S: ['Please see the attached document for details.', 'As per my previous email, this has been noted.', 'Kindly ensure you have read and acknowledged.', 'No action is required. Some action may be required.'],
    C: ['Acknowledge', 'See Attachment', 'Reply All'], B: ['INTERNAL - LOW PRIORITY', 'REF: FAC-2291-B', 'FYI'], F: ['Please consider the environment before printing this notice · {brand}'],
  },
  boring: {
    label: 'Spoof: Boring item sale', pal: ['#b03a2e', '#ece7db', '#2b2b2b'], hF: 5, bF: 5, pill: 0, tpl: 'spot', E: '📦',
    H: ['{what}. Now available.', '{what}, Model 4471-B', 'Standard {what}. Colour: grey.', '{what} (Pack of 12)', 'Reduced: {what}'],
    S: ['Suitable for most purposes. Batteries not included.', 'In stock. Ships in 3 to 5 working days.', 'Item may differ slightly from picture.', 'A reliable choice for everyday use.'],
    C: ['Add to Basket', 'View Item', 'Buy Now (Standard Delivery)'], B: ['IN STOCK (12)', 'CLEARANCE', 'BULK SAVER'], F: ['Prices exclude VAT · {brand} Trade Supplies · Unsubscribe'],
  },
  hype: {
    label: 'Spoof: Startup hype', pal: ['#7c5cff', '#0b0b1a', '#ffffff'], hF: 0, bF: 0, pill: 1, tpl: 'center', E: '🚀',
    H: ['Introducing {what}. Reinvented.', '{what} changes everything.', 'The future of {what} is here.', 'Meet {what}. 10x better.', 'Disrupting {what}, one pixel at a time.'],
    S: ['Powered by AI. Built for scale. Loved by absolutely everyone.', 'Join 10,000+ people on the waitlist.', 'Move fast. Ship faster.', "We raised a seed round and we're not afraid to use it."],
    C: ['Join the Waitlist', 'Get Early Access', 'Book a Demo'], B: ['NOW IN BETA', 'AI-POWERED', 'SERIES SEED'], F: ['{brand} Labs · Made with love in the cloud · Unsubscribe'],
  },
  luxury: {
    label: 'Spoof: Luxury', pal: ['#c9a24b', '#0e0e0e', '#f3ecd8'], hF: 7, bF: 7, pill: 0, tpl: 'center', E: '✦',
    H: ['The {what} Collection', '{what}. By appointment.', 'Understated. Exceptional. {what}.', 'Discover {what}'],
    S: ['Crafted in limited numbers for the discerning few.', 'Private viewing by invitation.', 'Timeless design. Enduring quality.'],
    C: ['Discover', 'Request an Invitation', 'Enquire'], B: ['LIMITED EDITION', 'BY INVITATION', 'MAISON {brand}'], F: ['{brand} · Private clients · Unsubscribe'],
  },
  info: {
    label: 'Spoof: Infomercial', pal: ['#e10600', '#ffe600', '#111111'], hF: 2, bF: 1, pill: .5, tpl: 'center', upper: true, E: '📞',
    H: ["BUT WAIT, THERE'S MORE: {what}!", '{what}! As seen on TV!', 'Tired of not having {what}?', 'ACT NOW: {what}!'],
    S: ["Order in the next 10 minutes and we'll double it. That's TWO for the price of ONE!", 'Just 3 easy payments of $19.99!', 'Not sold in stores!'],
    C: ['CALL NOW', 'ORDER TODAY', 'Get Yours!'], B: ['AS SEEN ON TV', 'LIMITED TIME!', 'FREE SHIPPING'], F: ['Operators are standing by · {brand} · Unsubscribe'],
  },
};

const G = { profile: null, campaign: 'merch', about: '', style: 'brand', tone: { formal: 50, humor: 30, energy: 50, jargon: 20, length: 50 }, emoji: false, seed: 0 };

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const rng = (seed, i) => { const x = Math.sin(seed * 9301 + i * 49297 + 1.7) * 233280; return x - Math.floor(x); };
const fillSlots = (s, ctx) => s.replace(/\{(what|brand|topic|n)\}/g, (m, k) => ctx[k]);
function caseLike(from, to) { return from[0] === from[0].toUpperCase() ? cap(to) : to; }

const CONTR = [['do not', "don't"], ['does not', "doesn't"], ['we are', "we're"], ['you are', "you're"], ['it is', "it's"], ['you will', "you'll"], ['cannot', "can't"], ['we have', "we've"], ['you have', "you've"], ['is not', "isn't"], ["let us", "let's"]];
function fixFormality(s, f) {
  if (f < 38) CONTR.forEach(([a, b]) => { s = s.replace(new RegExp('\\b' + a + '\\b', 'gi'), m => caseLike(m, b)); });
  else if (f > 62) CONTR.forEach(([a, b]) => { s = s.replace(new RegExp("\\b" + b.replace("'", "['’]") + "\\b", 'gi'), m => caseLike(m, a)); });
  return s;
}
const JARGON = [['use', 'leverage'], ['new', 'next-generation'], ['faster', 'lower-latency'], ['easy', 'frictionless'], ['easier', 'more streamlined'], ['simple', 'streamlined'], ['start', 'onboard'],
  ['help', 'enable'], ['try', 'evaluate'], ['everything you need', 'a comprehensive toolkit'], ['fixed', 'remediated'], ['shop', 'procure']];
function fixJargon(s, j) {
  if (j > 65) JARGON.forEach(([a, b]) => { s = s.replace(new RegExp('\\b' + a + '\\b', 'gi'), m => caseLike(m, b)); });
  return s;
}
function fixEnergy(s, e, isCta) {
  if (isCta) return s;
  if (e >= 72 && !/[!?]$/.test(s)) s = s.replace(/[.]$/, '') + '!';
  else if (e <= 28) s = s.replace(/!+$/, '.');
  return s;
}
function pickToned(bank, want, seed, salt) {
  let best = null, bs = 1e9;
  bank.forEach((r, i) => {
    const d = Math.abs(r[1] - want.formal) + Math.abs(r[2] - want.humor) + Math.abs(r[3] - want.energy) + (r[4] || 0) + (seed ? rng(seed, i + salt * 31) * 110 : 0);
    if (d < bs) { bs = d; best = r; }
  });
  return best;
}
const pickPlain = (arr, seed, salt) => arr[seed ? Math.floor(rng(seed, salt) * arr.length) : 0];

function generateCopy() {
  const c = CAMPAIGNS[G.campaign], st = STYLES[G.style], p = G.profile, T = G.tone, seed = G.seed;
  const brand = p ? p.name : 'Your Brand', topic = (p && p.keywords[0]) || 'what we do';
  const n = [20, 25, 30, 40, 50][Math.floor(rng(seed, 7) * 5)];
  const what = (G.about.trim() || c.what).replace(/\{brand\}/g, brand);
  const ctx = { what, brand, topic, n };
  const prep = s => fillSlots(fixJargon(fixFormality(s, T.formal), T.jargon), ctx);
  let headline, sub, cta, badge = '', footer = '', wink = '';
  if (G.style === 'brand') {
    const ctaBank = c.C.slice(); if (p && p.ctas[0]) ctaBank.push([p.ctas[0], 55, 10, 50, -25]);
    headline = prep(pickToned(c.H, T, seed, 1)[0]);
    sub = prep(pickToned(c.S, T, seed, 2)[0]);
    cta = prep(pickToned(ctaBank, T, seed, 3)[0]);
    if (T.length >= 72) { const s2 = prep(pickToned(c.S.filter(r => prep(r[0]) !== sub), T, seed, 4)[0]); sub += ' ' + s2; }
    if (T.humor >= 60) wink = pickPlain(WINKS, seed, 5);
  } else {
    headline = fillSlots(pickPlain(st.H, seed, 1), ctx); sub = fillSlots(pickPlain(st.S, seed, 2), ctx); cta = fillSlots(pickPlain(st.C, seed, 3), ctx);
    badge = fillSlots(pickPlain(st.B, seed, 4), ctx); footer = fillSlots(pickPlain(st.F, seed, 5), ctx);
    if (T.length >= 72) sub += ' ' + fillSlots(pickPlain(st.S.filter(x => !sub.includes(x)), seed, 6) || '', ctx);
  }
  headline = fixEnergy(cap(headline), T.energy, false); sub = fixEnergy(cap(sub), T.energy, false);
  if (G.emoji) headline += ' ' + (st.E || c.emoji);
  if (T.length < 15) sub = ""; else if (wink) sub += " " + wink;
  return { headline, sub, cta, badge, footer };
}
// the visual side of a style: colours, fonts, button roundness (brand style reads them from the source)
function styleLook() {
  const st = STYLES[G.style], p = G.profile;
  if (G.style === 'brand') {
    if (!p) return {};
    return { accent: p.colors.accent, panel: p.colors.panel, text: p.colors.text, hFont: p.fonts.h, bFont: p.fonts.b, upper: false, pill: 1 };
  }
  return { accent: st.pal[0], panel: st.pal[1], text: st.pal[2], hFont: FONTS[st.hF][1], bFont: FONTS[st.bF][1], upper: !!st.upper, pill: st.pill };
}

/* ============ brand / campaign / voice / style: glue + UI ============ */
// spoof styles keep their palette: the text-only 'center' look becomes Spotlight once there is a picture to show
const autoTemplate = () => { if (library.length > 1) return 'collage'; if (G.style === 'brand') return 'hero'; const t = STYLES[G.style].tpl; return t === 'center' && library.length ? 'spot' : t; };

// badge (top-left pill) and email-footer strip that some styles add on top of any layout
function styleExtras(bg) {
  const c = S.copy, L = [], { W, H, u, pad } = ctxInfo(), fb = footerBand(), dark = lum(bg.c1) < .5;
  if (fb) {
    L.push(shapeLayer({ x: 0, y: H, w: W, h: fb, color: dark ? '#ffffff' : '#000000', opacity: dark ? .1 : .08, locked: true, name: 'Footer strip' }));
    const t = textLayer({ role: 'footer', text: c.footer, font: c.bFont, weight: 400, color: dark ? '#b8bdcc' : '#666666', align: 'center', autoW: true, lh: 1.1, size: clamp(fb * .42, 8, 30), name: 'Footer' });
    let m = textMetrics(t); if (m.w > W - 2 * pad) t.size *= (W - 2 * pad) / m.w;
    initText(t); t.x = (W - t.w) / 2; t.y = H + (fb - t.h) / 2; L.push(t);
  }
  if (c.badge && c.badge.trim() && S.h >= 250 && S.w >= 250) {
    const size = clamp(u * .028, 10, 64);
    const t = textLayer({ role: 'badge', text: c.badge, font: c.bFont, weight: 700, color: contrast(c.accent), align: 'center', bg: c.accent, autoW: true, lh: 1.1, size,
      padX: size * .8, padY: size * .45, radius: size * .6 * (c.pill == null ? 1 : c.pill), name: 'Badge' });
    initText(t); t.x = pad; t.y = pad * .8; L.push(t);
  }
  return L;
}



/* ====================== glue: ad state -> fabric objects ====================== */
const familyOf = f => String(f).replace(/["']/g, '').split(',')[0].trim();
function designFor(w, h){
  const sw = S.w, sh = S.h; S.w = w; S.h = h;
  try{
    const r = TEMPLATES[S.template](), layers = r.layers.slice();
    if(S.template !== 'blank') layers.push(...styleExtras(r.bg));
    const D = { w, h, bg:r.bg, layers }; layoutAll(D); return D;
  } finally { S.w = sw; S.h = sh; }
}
function loadImg(url){ return new Promise(res=> fabric.Image.fromURL(url, img=> res(img), { crossOrigin:'anonymous' })); }
async function layersToFabric(D){
  const out = [], W = D.w, H = D.h;
  // background
  const b = D.bg; let fill = b.c1;
  if(b.mode === 'gradient'){
    const a = rad(b.angle), dx = Math.sin(a), dy = -Math.cos(a), len = Math.abs(W * dx) + Math.abs(H * dy);
    fill = new fabric.Gradient({ type:'linear', coords:{ x1:W/2 - dx*len/2, y1:H/2 - dy*len/2, x2:W/2 + dx*len/2, y2:H/2 + dy*len/2 }, colorStops:[{ offset:0, color:b.c1 }, { offset:1, color:b.c2 }] });
  }
  const bg = new fabric.Rect({ left:0, top:0, width:W, height:H, fill }); bg.name = 'Background'; bg.__isBackground = true;
  bg.set({ selectable:false, evented:false, hasControls:false, lockMovementX:true, lockMovementY:true, lockScalingX:true, lockScalingY:true, lockRotation:true });
  out.push(bg);
  for(const l of D.layers){
    if(l.visible === false) continue;
    let obj = null; const cx = l.x + l.w / 2, cy = l.y + l.h / 2, common = { opacity:l.opacity == null ? 1 : l.opacity, angle:l.rot || 0 };
    if(l.type === 'shape'){
      let f = l.color;
      if(l.grad && l.grad !== 'none'){
        const d = { bottom:[0, 1], top:[0, -1], right:[1, 0], left:[-1, 0] }[l.grad];
        f = new fabric.Gradient({ type:'linear', coords:{ x1:l.w/2 + d[0]*l.w/2, y1:l.h/2 + d[1]*l.h/2, x2:l.w/2 - d[0]*l.w/2, y2:l.h/2 - d[1]*l.h/2 }, colorStops:[{ offset:0, color:hexA(l.color, 1) }, { offset:.55, color:hexA(l.color, .45) }, { offset:1, color:hexA(l.color, 0) }] });
      }
      obj = new fabric.Rect({ ...common, left:cx, top:cy, originX:'center', originY:'center', width:l.w, height:l.h, rx:l.radius || 0, ry:l.radius || 0, fill:f });
    } else if(l.type === 'image'){
      const im = store[l.img]; if(!im) continue;
      const img = await loadImg(im.url); if(!img || !img.width) continue;
      if(l.fit === 'cover'){
        const s = Math.max(l.w / im.w, l.h / im.h), sw = l.w / s, sh = l.h / s;
        img.set({ ...common, cropX:(im.w - sw) * l.fx, cropY:(im.h - sh) * l.fy, width:sw, height:sh, scaleX:s, scaleY:s, left:cx, top:cy, originX:'center', originY:'center' });
        if(l.radius) img.clipPath = new fabric.Rect({ width:sw, height:sh, rx:l.radius / s, ry:l.radius / s, originX:'center', originY:'center' });
      } else {
        const s = Math.min(l.w / im.w, l.h / im.h);
        img.set({ ...common, scaleX:s, scaleY:s, left:cx, top:cy, originX:'center', originY:'center' });
        if(l.radius) img.clipPath = new fabric.Rect({ width:im.w, height:im.h, rx:l.radius / s, ry:l.radius / s, originX:'center', originY:'center' });
      }
      if(l.shadow) img.shadow = new fabric.Shadow({ color:'rgba(0,0,0,.5)', blur:Math.min(l.w, l.h) * .08, offsetX:0, offsetY:Math.min(l.w, l.h) * .03 });
      obj = img;
    } else if(l.type === 'text'){
      const txt = (l.lines && l.lines.length ? l.lines : [dispText(l)]).join('\n');
      const tx = new fabric.IText(txt, { fontFamily:familyOf(l.font), fontSize:l.size, fontWeight:l.weight >= 600 ? 'bold' : 'normal', fill:l.color, textAlign:l.align, lineHeight:l.lh / 1.13, strokeUniform:true });
      if(l.shadow && !l.bg) tx.shadow = new fabric.Shadow({ color:'rgba(0,0,0,.5)', blur:l.size * .18, offsetX:0, offsetY:l.size * .05 });
      if(l.bg){
        const rc = new fabric.Rect({ width:l.w, height:l.h, rx:l.radius || 0, ry:l.radius || 0, fill:l.bg, originX:'center', originY:'center', left:0, top:0 });
        tx.set({ originX:'center', originY:'center', left:0, top:0 });
        const g = new fabric.Group([rc, tx], { ...common, left:cx, top:cy, originX:'center', originY:'center' });
        if(l.shadow) g.shadow = new fabric.Shadow({ color:'rgba(0,0,0,.5)', blur:l.size * .18, offsetX:0, offsetY:l.size * .05 });
        obj = g;
      } else {
        const ox = l.align === 'left' ? 'left' : l.align === 'right' ? 'right' : 'center', px = l.align === 'left' ? l.x + l.padX : l.align === 'right' ? l.x + l.w - l.padX : cx;
        tx.set({ ...common, originX:ox, originY:'top', left:px, top:l.y + l.padY }); obj = tx;
      }
    }
    if(obj){ obj.name = layerName(l) || 'Layer'; obj.__adRole = l.role || ''; out.push(obj); }
  }
  return out;
}

/* ====================== building on the shared canvas ====================== */
let builtSig = null;
const sigNow = ()=> JSON.stringify(MS.canvas.toJSON(MS.SERIALIZE_PROPS));
function pristine(){ return builtSig !== null && builtSig === sigNow(); }
async function buildOnCanvas(force){
  const c = MS.canvas;
  if(!force && builtSig !== null && !pristine() && c.getObjects().length){
    toast('You edited the ad on the canvas. Click “Rebuild ad” to replace it with the new text/layout.', 4500); return false;
  }
  const D = designFor(S.w, S.h), objs = await layersToFabric(D);
  MS.suspendHistory(()=>{
    if(M.wPx !== S.w || M.hPx !== S.h){ M.mode = 'social'; M.unit = 'px'; MS.resizeDoc(S.w, S.h); }
    c.discardActiveObject(); c.clear(); c.backgroundColor = null; objs.forEach(o=> c.add(o)); c.requestRenderAll();
  });
  MS.view.fit(); MS.commit('Build ad'); builtSig = sigNow(); MS.emit('mockup-dirty'); return true;
}

/* ====================== pictures / theme pieces ====================== */
const fileToDataURL = f => new Promise((res, rej)=>{ const r = new FileReader(); r.onload = ()=> res(r.result); r.onerror = rej; r.readAsDataURL(f); });
async function addPicture(file){
  const url = await fileToDataURL(file), img = new Image();
  await new Promise((res, rej)=>{ img.onload = res; img.onerror = ()=> rej(new Error('Could not read ' + file.name)); img.src = url; });
  const id = uid(); store[id] = { id, name:file.name.replace(/\.[a-z0-9]+$/i, ''), bmp:img, w:img.naturalWidth, h:img.naturalHeight, url };
  library.push(id); return id;
}
async function addRefFile(file){
  if((file.type || '').startsWith('image/')){ const url = URL.createObjectURL(file), img = new Image(); await new Promise((res, rej)=>{ img.onload = res; img.onerror = ()=> rej(new Error('Could not read ' + file.name)); img.src = url; }); refItems.push({ id:uid(), kind:'image', name:file.name, url, bitmap:img }); return; }
  const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase(); refItems.push({ id:uid(), kind:'file', name:file.name, ext, raw:await file.text() });
}
async function rebuildProfile(){
  const first = !G.profile;
  G.profile = await computeProfileFromRefItems();
  if(G.profile && first){ G.tone = { ...G.profile.tone }; G.emoji = G.profile.emoji; }
  saveG();
}
function saveG(){ try{ localStorage.setItem('ms.ads.G', JSON.stringify(G, (k, v)=> (k === 'images' || k === 'dataImages') ? undefined : v)); }catch(e){} }
function loadG(){ try{ const s = JSON.parse(localStorage.getItem('ms.ads.G') || 'null'); if(s){ Object.assign(G, s); if(G.profile){ G.profile.images = G.profile.images || []; G.profile.dataImages = []; } } }catch(e){} }

/* ====================== regenerate copy / look / layout ====================== */
async function regen(opts){
  opts = opts || {};
  Object.assign(S.copy, generateCopy(), styleLook());
  if(S.auto) S.template = autoTemplate();
  saveG(); refreshUi();
  if(opts.build !== false) await buildOnCanvas(!!opts.force);
}
let regenT = null;
const regenSoon = ()=>{ clearTimeout(regenT); regenT = setTimeout(()=> regen({ build:true }), 220); };

/* ====================== UI ====================== */
const VOICE = [['formal', 'Formality', 'Casual', 'Formal'], ['humor', 'Humour', 'Serious', 'Funny'], ['energy', 'Energy', 'Calm', 'Hyped'], ['jargon', 'Language', 'Plain', 'Technical'], ['length', 'Length', 'Brief', 'Detailed']];
const TPL_ICON = {
  hero:'<rect x="1" y="1" width="46" height="30" fill="#566"/><rect x="6" y="18" width="26" height="4" fill="#fff"/><rect x="6" y="25" width="12" height="3" fill="#5b8cff"/>',
  center:'<rect x="1" y="1" width="46" height="30" fill="#334"/><rect x="10" y="10" width="28" height="4" fill="#fff"/><rect x="17" y="20" width="14" height="4" fill="#5b8cff"/>',
  split:'<rect x="1" y="1" width="22" height="30" fill="#566"/><rect x="27" y="8" width="18" height="3" fill="#fff"/><rect x="27" y="14" width="12" height="2" fill="#aaa"/><rect x="27" y="22" width="10" height="4" fill="#5b8cff"/>',
  collage:'<rect x="1" y="1" width="10" height="14" fill="#566"/><rect x="12" y="1" width="10" height="14" fill="#667"/><rect x="1" y="16" width="21" height="15" fill="#657"/><rect x="27" y="8" width="18" height="3" fill="#fff"/><rect x="27" y="22" width="10" height="4" fill="#5b8cff"/>',
  spot:'<rect x="1" y="1" width="46" height="30" fill="#334"/><rect x="14" y="6" width="20" height="14" fill="#678"/><rect x="10" y="23" width="28" height="3" fill="#fff"/>',
  blank:'<rect x="1" y="1" width="46" height="30" fill="none" stroke="#778" stroke-dasharray="3 3"/>',
};
const TPL_NAME = { hero:'Photo + text', center:'Centred', split:'Split', collage:'Collage', spot:'Spotlight', blank:'Blank' };
function sect(key, title, body, collapsed){ return `<div class="sect${collapsed ? ' collapsed' : ''}" data-sect="ad-${key}"><div class="sect-h">${MS.icon('chevd', 'car')}${title}</div><div class="sect-b">${body}</div></div>`; }
function build(){
  const page = $('#page-ad');
  const fontOpts = (sel)=>{
    const by = {}; (MS.fontList || []).forEach(f=>{ (by[f.c] = by[f.c] || []).push(f.n); });
    return Object.entries(by).map(([c, a])=>`<optgroup label="${esc(c)}">${a.map(n=>`<option value="&quot;${esc(n)}&quot;">${esc(n)}</option>`).join('')}</optgroup>`).join('');
  };
  page.innerHTML =
    `<div class="sect"><div class="sect-b" style="padding-top:10px"><div class="tb-row fill"><button class="btn primary" id="adBuild">${MS.icon('sparkle')}Write &amp; build ad</button><button class="btn" id="adShuffle" data-tip="Different wording">${MS.icon('rotate')}Shuffle</button></div>
      <div class="hint" id="adState">The ad is built from real objects on the canvas — edit anything afterwards with the normal tools.</div></div></div>` +
    sect('size', 'Ad size', `<div class="size-list" id="adSizes"></div><div class="r two"><div class="f"><span>W</span><input type="number" id="adW" min="20" max="8000"><em>px</em></div><div class="f"><span>H</span><input type="number" id="adH" min="20" max="8000"><em>px</em></div></div><div class="hint">Changing size re-flows an un-edited layout automatically.</div>`) +
    sect('theme', '1 · Theme &amp; reference', `<div class="hint">Add website/data files, reference pictures or a quick note — everything shapes tone, colour and copy.</div><div class="dz" id="adSrcDrop"><b>Drop files or pictures here</b>.html .css .md .txt .json or any image — or click</div><input type="file" id="adSrcFile" multiple hidden accept=".html,.htm,.css,.md,.txt,.json,.csv,.xml,text/*,image/*">
      <div class="r"><input type="text" class="grow" id="adNote" placeholder="Theme note, e.g. “beachy, pastel, summer”"><button class="btn sm" id="adNoteAdd">Add</button></div><div id="adRefs" style="display:flex;flex-direction:column;gap:5px"></div><div id="adProfile"></div><div class="tb-row fill"><button class="btn sm" id="adUseDesign">${MS.icon('logo')}Use my current design as the logo picture</button><button class="btn sm danger" id="adClearTheme">Clear theme</button></div>`) +
    sect('campaign', '2 · Campaign', `<div class="r"><label>Type</label><select id="adCamp" class="grow"></select></div><div class="r"><label>About</label><input type="text" class="grow" id="adAbout" placeholder="e.g. Spring hoodie drop" spellcheck="true"></div>`) +
    sect('voice', '3 · Voice', `<div id="adVoice"></div><div class="tb-row"><label class="chk"><input type="checkbox" id="adEmoji"> Use emoji</label><button class="btn sm" id="adVoiceReset">Reset to detected</button></div>`, true) +
    sect('style', '4 · Style', `<div class="chips" id="adStyles"></div><div class="hint" id="adStyleNote"></div>`) +
    sect('pics', 'Pictures', `<div class="dz" id="adPicDrop"><b>Drop pictures here</b>or click to browse</div><input type="file" id="adPicFile" accept="image/*" multiple hidden><div id="adThumbs" style="display:flex;flex-wrap:wrap;gap:6px"></div>`) +
    sect('text', 'Ad text &amp; colours', `<label class="hint">Headline</label><input type="text" data-c="headline" spellcheck="true"><label class="hint">Sub-headline</label><input type="text" data-c="sub" spellcheck="true"><label class="hint">Button text</label><input type="text" data-c="cta" spellcheck="true"><label class="hint">Badge (top-left label)</label><input type="text" data-c="badge" spellcheck="true"><label class="hint">Footer line</label><input type="text" data-c="footer" spellcheck="true">
      <div class="r"><label>Headline font</label><select data-c="hFont" class="grow">${fontOpts()}</select></div><div class="r"><label>Body font</label><select data-c="bFont" class="grow">${fontOpts()}</select></div>
      <label class="chk"><input type="checkbox" data-c="upper"> UPPERCASE headline</label>
      <div class="r"><label>Button</label><span class="swatch-in"><input type="color" data-c="accent"></span><label style="width:auto">Panel</label><span class="swatch-in"><input type="color" data-c="panel"></span><label style="width:auto">Text</label><span class="swatch-in"><input type="color" data-c="text"></span></div>`) +
    sect('layout', 'Layout', `<div class="tpl-grid" id="adTpls"></div>`) +
    sect('export', 'Export', `<div class="tb-row fill"><button class="btn" id="adExportAll">${MS.icon('download')}All sizes (ZIP)…</button><button class="btn" id="adExportOne">${MS.icon('export')}This size…</button></div>`);
  window.MSI.hydrate(page); MS.wireAccordions(page);
  // sizes
  const sizes = $('#adSizes');
  sizes.innerHTML = SIZES.map(([g, list])=> `<div class="hint" style="margin-top:6px">${g}</div>` + list.map(([n, w, h])=>`<div class="size-item" data-w="${w}" data-h="${h}"><span>${n}</span><span class="d">${w}×${h}</span></div>`).join('')).join('');
  sizes.onclick = e=>{ const it = e.target.closest('.size-item'); if(it) setAdSize(+it.dataset.w, +it.dataset.h); };
  $('#adW').onchange = ()=> setAdSize(+$('#adW').value || S.w, +$('#adH').value || S.h); $('#adH').onchange = $('#adW').onchange;
  // campaign
  $('#adCamp').innerHTML = Object.entries(CAMPAIGNS).map(([k, c])=>`<option value="${k}">${c.label}</option>`).join('');
  $('#adCamp').onchange = e=>{ G.campaign = e.target.value; G.seed = 0; regen(); };
  $('#adAbout').oninput = e=>{ G.about = e.target.value; regenSoon(); };
  $('#adBuild').onclick = ()=>{ G.seed = 0; regen({ force:true }); };
  $('#adShuffle').onclick = ()=>{ G.seed = (G.seed || 0) + 1; regen({ force:true }); };
  // voice
  $('#adVoice').innerHTML = VOICE.map(([k, l, a, b])=>`<div><div class="r" style="justify-content:space-between;min-height:18px"><span class="hint">${a}</span><b>${l}</b><span class="hint">${b}</span></div><input type="range" min="0" max="100" data-v="${k}" style="width:100%"></div>`).join('');
  $('#adVoice').oninput = e=>{ if(e.target.dataset.v){ G.tone[e.target.dataset.v] = +e.target.value; regenSoon(); } };
  $('#adEmoji').onchange = e=>{ G.emoji = e.target.checked; regenSoon(); };
  $('#adVoiceReset').onclick = ()=>{ if(G.profile){ G.tone = { ...G.profile.tone }; G.emoji = G.profile.emoji; } else G.tone = { formal:50, humor:30, energy:50, jargon:20, length:50 }; G.seed = 0; regen(); };
  // styles
  $('#adStyles').innerHTML = Object.entries(STYLES).map(([k, s])=>`<span class="chip" data-s="${k}">${esc(s.label.replace('Spoof: ', ''))}</span>`).join('');
  $('#adStyles').onclick = e=>{ const c = e.target.closest('.chip'); if(c){ G.style = c.dataset.s; G.seed = 0; regen(); } };
  // theme sources
  const drop = (zone, input, fn)=>{
    zone.onclick = ()=> input.click(); input.onchange = e=>{ fn(e.target.files); e.target.value = ''; };
    ['dragenter','dragover'].forEach(ev=> zone.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); zone.classList.add('over'); }));
    zone.addEventListener('dragleave', ()=> zone.classList.remove('over'));
    zone.addEventListener('drop', e=>{ e.preventDefault(); e.stopPropagation(); zone.classList.remove('over'); fn(e.dataTransfer.files); });
  };
  drop($('#adSrcDrop'), $('#adSrcFile'), async files=>{ try{ for(const f of files) await addRefFile(f); await rebuildProfile(); await regen(); toast('Theme updated from ' + files.length + ' piece' + (files.length > 1 ? 's' : '') + '.'); }catch(e){ toast(e.message, 4000, 'err'); } });
  drop($('#adPicDrop'), $('#adPicFile'), async files=>{ try{ for(const f of files) if(f.type.startsWith('image/')) await addPicture(f); await regen(); }catch(e){ toast(e.message, 4000, 'err'); } });
  $('#adNoteAdd').onclick = async ()=>{ const t = $('#adNote').value.trim(); if(!t) return; refItems.push({ id:uid(), kind:'text', name:'Note: ' + t.slice(0, 24), raw:t }); $('#adNote').value = ''; await rebuildProfile(); await regen(); };
  $('#adNote').onkeydown = e=>{ if(e.key === 'Enter') $('#adNoteAdd').click(); };
  $('#adClearTheme').onclick = async ()=>{ refItems.forEach(it=> it.url && it.kind !== 'image' && URL.revokeObjectURL(it.url)); refItems.length = 0; G.profile = null; saveG(); await regen(); toast('Theme cleared.'); };
  $('#adUseDesign').onclick = useDesign;
  $('#adRefs').onclick = async e=>{ const b = e.target.closest('[data-rm]'); if(!b) return; const i = refItems.findIndex(x=> x.id === b.dataset.rm); if(i >= 0) refItems.splice(i, 1); await rebuildProfile(); await regen(); };
  $('#adThumbs').onclick = async e=>{ const b = e.target.closest('[data-rm]'); if(!b) return; library = library.filter(x=> x !== b.dataset.rm); delete store[b.dataset.rm]; await regen(); };
  $('#adProfile').onclick = e=>{ const i = e.target.closest('i[data-col]'); if(!i) return; const k = e.shiftKey ? 'panel' : 'accent'; S.copy[k] = i.dataset.col; if(k === 'panel') S.copy.text = lum(S.copy.panel) > .5 ? '#111111' : '#ffffff'; refreshUi(); buildOnCanvas(true); };
  // copy fields
  page.addEventListener('input', e=>{
    const k = e.target.dataset && e.target.dataset.c; if(!k) return;
    S.copy[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    clearTimeout(build._t); build._t = setTimeout(()=> buildOnCanvas(false), 260);
  });
  // templates
  $('#adTpls').innerHTML = Object.keys(TEMPLATES).map(k=>`<div class="tpl" data-t="${k}"><svg viewBox="0 0 48 32">${TPL_ICON[k]}</svg>${TPL_NAME[k]}</div>`).join('');
  $('#adTpls').onclick = e=>{ const t = e.target.closest('.tpl'); if(!t) return; S.auto = false; S.template = t.dataset.t; refreshUi(); buildOnCanvas(true); };
  // export
  $('#adExportAll').onclick = exportAll; $('#adExportOne').onclick = ()=> MS.openExport();
  refreshUi();
}
async function useDesign(){
  const c = MS.canvas; if(!c.getObjects().some(o=> !o.__isBackground)){ toast('Nothing on the canvas yet — design your logo first (Logo workspace), then come back.'); return; }
  const mult = Math.min(1, 1200 / Math.max(M.wPx, M.hPx));
  const url = MS.renderArtboard({ multiplier:mult, background:null }).toDataURL('image/png');
  const texts = [], colors = new Set();
  const addC = v=>{ if(typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) colors.add(v.toLowerCase()); };
  c.getObjects().forEach(o=>{ if(MS.isTextObj(o)){ const t = o._isCurvedText ? o._curveSourceText : o.text; if(t) texts.push(t.trim()); } addC(o.fill); addC(o.stroke); (o._objects || []).forEach(k=>{ addC(k.fill); addC(k.stroke); }); });
  const img = new Image(); await new Promise(r=>{ img.onload = r; img.src = url; });
  const id = uid(); store[id] = { id, name:'Logo (from your design)', bmp:img, w:img.naturalWidth, h:img.naturalHeight, url }; library.unshift(id);
  refItems = refItems.filter(x=> !x.synthetic && x.name !== 'Logo (from your design)');
  refItems.push({ id:uid(), kind:'image', name:'Logo (from your design)', url, bitmap:img });
  [...new Set(texts)].slice(0, 4).forEach(t=> refItems.push({ id:uid(), kind:'text', name:'Text: ' + t.slice(0, 22), raw:t }));
  if(colors.size) refItems.push({ id:uid(), kind:'file', name:'Logo colours', ext:'css', raw:':root{' + [...colors].slice(0, 10).map((h, i)=>`--logo-color-${i}:${h};`).join('') + '}', synthetic:true });
  await rebuildProfile(); S.auto = true; await regen({ force:true }); toast('Your design is now the ad’s picture, and its colours and words feed the theme.');
}
async function setAdSize(w, h){
  S.w = clamp(Math.round(w), 20, 8000); S.h = clamp(Math.round(h), 20, 8000);
  M.mode = 'social'; M.unit = 'px';
  if(!MS.canvas.getObjects().some(o=> !o.__isBackground)) { MS.suspendHistory(()=> MS.resizeDoc(S.w, S.h)); MS.commit('Resize canvas'); MS.view.fit(); refreshUi(); return; }
  if(pristine() || builtSig === null){ await buildOnCanvas(true); } else { MS.resizeDoc(S.w, S.h); MS.view.fit(); toast('Resized the canvas. Click “Rebuild ad” to re-flow the layout for this size.'); }
  refreshUi();
}
function refreshUi(){
  const page = $('#page-ad'); if(!page || !page.firstChild) return;
  $('#adW').value = S.w; $('#adH').value = S.h;
  $$('.size-item', page).forEach(it=> it.classList.toggle('active', +it.dataset.w === S.w && +it.dataset.h === S.h));
  $('#adCamp').value = G.campaign; if(document.activeElement !== $('#adAbout')) $('#adAbout').value = G.about; $('#adEmoji').checked = !!G.emoji;
  $$('#adVoice [data-v]', page).forEach(el=>{ if(el !== document.activeElement){ el.value = G.tone[el.dataset.v]; MS.fillRange(el); } });
  $$('#adStyles .chip', page).forEach(c=> c.classList.toggle('active', c.dataset.s === G.style));
  $('#adStyleNote').textContent = G.style === 'brand' ? 'Wording follows your Voice sliders; colours and fonts come from your theme.' : 'Spoof style: wording, colours and fonts imitate that kind of email.';
  $$('[data-c]', page).forEach(el=>{
    if(el === document.activeElement) return; const k = el.dataset.c, v = S.copy[k];
    if(el.type === 'checkbox') el.checked = !!v; else if(el.tagName === 'SELECT'){ if(![...el.options].some(o=> o.value === v)){ const m = String(v || '').replace(/["']/g, '').split(',')[0].trim(); const opt = [...el.options].find(o=> o.value.replace(/["']/g, '') === m); if(opt) el.value = opt.value; } else el.value = v; } else if(el.type === 'color') el.value = /^#[0-9a-f]{6}$/i.test(v) ? v : '#000000'; else el.value = v || '';
  });
  $$('#adTpls .tpl', page).forEach(t=> t.classList.toggle('active', t.dataset.t === S.template));
  $('#adThumbs').innerHTML = library.map(id=> store[id] ? `<div class="ref-card" style="padding:3px"><img src="${store[id].url}" title="${esc(store[id].name)}"><span data-rm="${id}" class="ib" style="width:18px;height:18px;cursor:pointer" title="Remove">${MS.icon('x')}</span></div>` : '').join('');
  $('#adRefs').innerHTML = refItems.map(it=>`<div class="ref-card">${it.kind === 'image' ? `<img src="${it.url}">` : MS.icon(it.kind === 'text' ? 'tag' : 'word')}<span class="t">${esc(it.name)}</span><span data-rm="${it.id}" class="ib" style="width:20px;height:20px;cursor:pointer" title="Remove">${MS.icon('x')}</span></div>`).join('');
  const p = G.profile, el = $('#adProfile');
  if(!p) el.innerHTML = '<div class="hint">Nothing added yet, so copy uses neutral defaults.</div>';
  else el.innerHTML = `<div class="ref-card" style="flex-direction:column;align-items:stretch;gap:5px"><b>${esc(p.name)}</b><div class="hint">${esc(p.tagline || 'No tagline found.')}</div><div class="chips">${p.descr.map(d=>`<span class="chip">${esc(d)}</span>`).join('')}</div><div class="hint">Colours found — click = button, shift-click = panel</div><div class="swgrid">${p.colors.swatches.map(h=>`<div class="s" data-col="${h}" style="background:${h}"></div>`).join('')}</div><div class="hint">${refItems.length} piece(s) · ${p.words.toLocaleString()} words · font: ${esc(p.fonts.name)}</div></div>`;
  $('#adProfile').querySelectorAll('.s[data-col]').forEach(s=> s.classList.add('s'));
}

/* ====================== export all sizes ====================== */
async function exportAll(){
  const checks = SIZES.map(([g, list])=>`<div class="hint" style="margin-top:6px">${g}</div>` + list.map(([n, w, h])=>`<label class="chk"><input type="checkbox" class="adSz" data-w="${w}" data-h="${h}" data-n="${esc(n)}" ${(w === S.w && h === S.h) || g === 'Social' ? 'checked' : ''}> ${n} <span class="muted">${w}×${h}</span></label>`).join('')).join('');
  const body = document.createElement('div');
  body.innerHTML = `<div class="r"><label style="width:70px">Format</label><select id="adFmt"><option value="png">PNG</option><option value="jpg">JPG</option><option value="webp">WebP</option></select><label style="width:60px;text-align:right">Quality</label><input type="range" id="adQ" min="30" max="100" value="90" style="width:120px"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 16px">${checks}</div><div class="progress hidden" id="adProg"><i></i></div>`;
  const m = MS.modal({ title:'Export ad in several sizes', med:true, body, buttons:[{ spacer:true }, { label:'Cancel' }, { label:'Download ZIP', primary:true, icon:'download', keepOpen:true, action:async (api, btn)=>{
    const sel = $$('.adSz', body).filter(c=> c.checked); if(!sel.length){ toast('Pick at least one size.'); return false; }
    btn.disabled = true; const prog = $('#adProg', body); prog.classList.remove('hidden'); const bar = prog.firstElementChild;
    try{
      const zip = new JSZip(), fmt = $('#adFmt', body).value, q = +$('#adQ', body).value / 100, mime = fmt === 'jpg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png';
      for(let i = 0; i < sel.length; i++){
        const w = +sel[i].dataset.w, h = +sel[i].dataset.h, D = designFor(w, h), objs = await layersToFabric(D);
        const sc = new fabric.StaticCanvas(null, { width:w, height:h, enableRetinaScaling:false }); objs.forEach(o=> sc.add(o)); sc.renderAll();
        if(fmt === 'jpg'){ sc.backgroundColor = '#ffffff'; sc.renderAll(); }
        const blob = await new Promise(res=> sc.toCanvasElement(1).toBlob(res, mime, q)); sc.dispose();
        zip.file((M.name || 'ad').replace(/[\\/:*?"<>|]+/g, '_') + '_' + sel[i].dataset.n.replace(/[^\w]+/g, '-') + '_' + w + 'x' + h + '.' + fmt, blob);
        bar.style.width = Math.round((i + 1) / sel.length * 100) + '%';
      }
      const zb = await zip.generateAsync({ type:'blob' });
      const msg = await MS.saveFile(zb, (M.name || 'ads').replace(/[\\/:*?"<>|]+/g, '_') + '_ad-sizes.zip', null, 'ads');
      toast('Exported ' + sel.length + ' sizes — ' + msg, 7000); api.close();
    }catch(e){ btn.disabled = false; toast('Export failed: ' + e.message, 5000, 'err'); }
    return false; } }] });
}

MS.ads = { exportAll, build:buildOnCanvas, setSize:setAdSize, debug:()=>({ S, G, designFor }) };
MS.collectExtra = ()=> ({ adG:JSON.parse(JSON.stringify(G, (k, v)=> (k === 'images' || k === 'dataImages') ? undefined : v)), adS:{ template:S.template, copy:S.copy, auto:S.auto } });
MS.restoreExtra = ex=>{ if(ex && ex.adS){ Object.assign(S.copy, ex.adS.copy); S.template = ex.adS.template; S.auto = ex.adS.auto; builtSig = null; } if(ex && ex.adG) Object.assign(G, ex.adG); refreshUi(); };
MS.initAds = function(){
  loadG(); S.copy.headline = S.copy.headline || 'Your Big Headline Goes Here';
  build();
  MS.on('doc', ()=>{ S.w = M.wPx; S.h = M.hPx; refreshUi(); });
  MS.on('workspace', w=>{ if(w === 'ad'){ S.w = M.wPx; S.h = M.hPx; refreshUi(); } });
};
})();
