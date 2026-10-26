/* Imagination Studio - "Build for" compatibility checker: tells you what will not survive the target you are designing for. */
(function(){
'use strict';
const MS = window.MS, S = MS.S;
const { $, $$, esc, toast } = MS;
const cv = ()=> MS.canvas;
const TARGETS = {
  print:  { label:'Print / PNG', hint:'Raster output for printing or screens. Checks resolution, hairlines and tiny text.' },
  vector: { label:'Vector (SVG / PDF)', hint:'Scalable artwork for cutters, print shops and logos. Checks anything that cannot stay vector.' },
  game:   { label:'Game decal (SVG)', hint:'Livery editors such as Gran Turismo. Strictest: plain filled shapes, no effects, text as outlines.' },
};
const txt = o=> o && (o._isCurvedText || (o.isType && (o.isType('text') || o.isType('i-text') || o.isType('textbox'))));
function walk(objs, top, fn){ objs.forEach(o=>{ const t = top || o; fn(o, t); if(o._objects && !o._isCurvedText) walk(o._objects, t, fn); else if(o._isCurvedText) o._objects.forEach(k=> fn(k, t)); }); }

function scan(target){
  const c = cv(), issues = [], d = S.doc, sysFont = n=> !(MS.fontMeta && MS.fontMeta[n] && MS.fontMeta[n].f && Object.keys(MS.fontMeta[n].f).length);
  const add = (id, level, text, objs, fix)=>{ const u = [...new Set(objs)]; if(u.length || !objs) issues.push({ id, level, text:text.replace('{n}', u.length), objs:u, fix }); };
  const list = { distress:[], blend:[], shadow:[], image:[], liveText:[], sysText:[], pattern:[], clip:[], dash:[], alphaGrad:[], filters:[], lowres:[], hair:[], tiny:[], opacity:[], bg:[] };
  let nodes = 0; const colors = new Set();
  walk(c.getObjects(), null, (o, t)=>{
    if(o.visible === false) return;
    if(o.__fx && o.__fx.distress) list.distress.push(t);
    if(o.globalCompositeOperation && o.globalCompositeOperation !== 'source-over') list.blend.push(t);
    if(o.shadow || (o.__fx && o.__fx.stack && ['shadow','glow'].some(k=> o.__fx.stack[k] && o.__fx.stack[k].on))) list.shadow.push(t);
    if(o.type === 'image'){ list.image.push(t); if(o.filters && o.filters.length) list.filters.push(t);
      if(d.mode === 'print'){ const inches = o.getScaledWidth() / MS.WORKING_PPI; if(inches > 0 && o.width / inches < 150) list.lowres.push(t); } }
    if(txt(o) && o.type !== 'group'){ if(!o.__outlined && !o._isCurvedText) list.liveText.push(t); if(sysFont(o.fontFamily)) list.sysText.push(t); const pt = (o.fontSize * Math.abs(o.scaleX || 1) * (t._isCurvedText ? Math.abs(t.scaleX || 1) : 1)) / MS.WORKING_PPI * 72; if(d.mode === 'print' && pt < 6) list.tiny.push(t); }
    if(o.fill && typeof o.fill === 'object'){ if(o.fill.source) list.pattern.push(t); else if(o.fill.colorStops && o.fill.colorStops.some(s=> { try{ return new fabric.Color(s.color).getAlpha() < 1; }catch(e){ return false; } })) list.alphaGrad.push(t); }
    else if(typeof o.fill === 'string' && o.fill && !o.__isBackground) colors.add(o.fill.toLowerCase());
    if(o.clipPath) list.clip.push(t);
    if(o.strokeDashArray) list.dash.push(t);
    if(o.stroke && o.strokeWidth && d.mode === 'print'){ const pt = o.strokeWidth * Math.abs(o.scaleX || 1) / MS.WORKING_PPI * 72; if(pt < .25) list.hair.push(t); }
    if(o.opacity < 1 && !o.__isBackground) list.opacity.push(t);
    if(o.type === 'path' && o.path) nodes += o.path.length;
    if(o.__isBackground) list.bg.push(t);
  });
  const vec = target === 'vector' || target === 'game', game = target === 'game';
  const selectAndRun = (objs, fn)=> async ()=>{ MS.ops.select(objs); await fn(objs); };
  if(vec){
    add('image', 'warn', '{n} picture(s) are raster, not vector', list.image, { label:'Trace to vector…', run:()=>{ MS.ops.select([list.image[0]]); MS.traceDialog(); } });
    add('distress', 'warn', '{n} layer(s) use the Distress effect (becomes a picture)', list.distress, { label:'Remove', run:()=>{ list.distress.forEach(o=>{ if(o.__fx) delete o.__fx.distress; o.dirty = true; MS.dirtyObj(o); }); MS.commit('Remove distress'); } });
    add('blend', 'warn', '{n} layer(s) use blend modes (not kept in SVG)', list.blend, { label:'Set to Normal', run:()=>{ list.blend.forEach(o=>{ o.set('globalCompositeOperation', 'source-over'); }); MS.commit('Blend mode'); } });
    add('filters', 'info', '{n} picture(s) have colour adjustments baked in', list.filters);
    add('pattern', 'warn', '{n} shape(s) use a pattern fill (embedded as a picture)', list.pattern);
    add('sys', 'warn', '{n} text layer(s) use system fonts that cannot be outlined', list.sysText);
    add('live', game ? 'warn' : 'info', '{n} text layer(s) are live text, not outlines', list.liveText, { label:'Convert to outlines', run:async ()=>{ MS.ops.select(list.liveText); await MS.textToPaths(); } });
    if(nodes > 4000) issues.push({ id:'nodes', level:'warn', text:'Very detailed paths (' + nodes + ' segments) - some editors limit complexity', objs:[] });
    if(game){
      add('shadow', 'warn', '{n} layer(s) have shadows or glows (ignored by most decal editors)', list.shadow, { label:'Remove', run:()=>{ list.shadow.forEach(o=>{ o.shadow = null; if(o.__fx){ delete o.__fx.glow; if(o.__fx.stack){ o.__fx.stack = Object.assign({}, o.__fx.stack, { shadow:null, glow:null }); } } }); MS.commit('Remove shadows'); } });
      add('alpha', 'warn', '{n} gradient(s) fade to transparent (often unsupported)', list.alphaGrad);
      add('clip', 'warn', '{n} layer(s) are clipped (cut by a mask)', list.clip);
      add('dash', 'info', '{n} dashed line(s) may import as solid', list.dash);
      add('opacity', 'info', '{n} layer(s) are semi-transparent (some editors ignore it)', list.opacity);
      add('bg', 'info', 'A solid background layer exists - decals are usually transparent', list.bg, { label:'Remove', run:()=>{ MS.clearBackground(); } });
    } else add('shadow', 'info', '{n} layer(s) have shadows (exported as SVG filters)', list.shadow);
  } else {
    add('lowres', 'warn', '{n} picture(s) are below 150 dpi at this print size - they may print soft', list.lowres);
    add('hair', 'warn', '{n} line(s) are thinner than 0.25 pt (may not print)', list.hair);
    add('tiny', 'warn', '{n} text layer(s) are smaller than 6 pt', list.tiny);
    if(colors.size > 6) issues.push({ id:'colors', level:'info', text:colors.size + ' flat colours - screen printing usually needs fewer', objs:[] });
  }
  return issues;
}

let timer = null;
function schedule(){ clearTimeout(timer); timer = setTimeout(render, 350); }
function render(){
  const box = $('#compatList'); if(!box || !cv()) return;
  const t = S.doc.target || 'print', issues = scan(t), warn = issues.filter(i=> i.level === 'warn').length;
  $$('#compatSeg button').forEach(b=> b.classList.toggle('active', b.dataset.t === t)); $('#compatHint').textContent = TARGETS[t].hint;
  const chip = $('#sbCompat'); if(chip){ chip.style.display = ''; chip.classList.toggle('bad', warn > 0); chip.innerHTML = MS.icon(warn ? 'warning' : 'check') + (warn ? warn + ' to check' : 'Ready') + ' · ' + TARGETS[t].label; }
  if(!issues.length){ box.innerHTML = '<div class="okbox">' + MS.icon('check') + '<span>Looks good for <b>' + TARGETS[t].label + '</b>.</span></div>'; return; }
  box.innerHTML = '';
  issues.forEach(i=>{
    const row = document.createElement('div'); row.className = 'cp-row ' + i.level;
    row.innerHTML = MS.icon(i.level === 'warn' ? 'warning' : 'info') + '<div class="cp-t">' + esc(i.text) + (i.objs.length ? '<div class="hint">' + esc(i.objs.slice(0, 4).map(o=> o.name || o.type).join(', ') + (i.objs.length > 4 ? '…' : '')) + '</div>' : '') + '</div>' +
      (i.objs.length ? '<button class="btn sm" data-a="sel">Select</button>' : '') + (i.fix ? '<button class="btn sm primary" data-a="fix">' + esc(i.fix.label) + '</button>' : '');
    row.addEventListener('click', e=>{ const b = e.target.closest('[data-a]'); if(!b) return; if(b.dataset.a === 'sel'){ if(MS.S.tool !== 'move') MS.setTool('move'); MS.ops.select(i.objs); } else { Promise.resolve(i.fix.run()).then(()=>{ cv().requestRenderAll(); schedule(); }); } });
    box.appendChild(row);
  });
}
MS.compat = { scan, render, TARGETS, setTarget(t){ S.doc.target = t; MS.emit('doc'); render(); } };
MS.initCompat = function(){
  const page = $('#page-canvas');
  const sec = document.createElement('div'); sec.className = 'sect'; sec.dataset.sect = 'compat';
  sec.innerHTML = '<div class="sect-h">' + MS.icon('chevd', 'car') + 'Build for</div><div class="sect-b"><div class="seg acc" id="compatSeg">' + Object.entries(TARGETS).map(([k, v])=> '<button data-t="' + k + '">' + v.label.replace(' (SVG / PDF)', '').replace(' (SVG)', '') + '</button>').join('') + '</div><div class="hint" id="compatHint"></div><div id="compatList" style="display:flex;flex-direction:column;gap:6px"></div><div class="hint">You pick the real file format at export — this only warns you while you build.</div></div>';
  page.insertBefore(sec, page.firstChild); MS.wireAccordions(sec);
  $('#compatSeg').addEventListener('click', e=>{ const b = e.target.closest('button'); if(b) MS.compat.setTarget(b.dataset.t); });
  const sb = $('#sbSnap'); const chip = document.createElement('span'); chip.id = 'sbCompat'; chip.className = 'sb-toggle'; chip.style.display = 'none'; chip.setAttribute('data-tip', 'Compatibility check — click to review'); sb.parentNode.insertBefore(chip, sb);
  chip.addEventListener('click', ()=>{ MS.showPage('canvas'); });
  ['layers','history','doc'].forEach(ev=> MS.on(ev, schedule));
  schedule();
};
})();
