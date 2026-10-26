/* Merch Studio - Claude assistant tab (talks to the Claude Code installed on this PC through serve.ps1). */
(function(){
'use strict';
const MS = window.MS, S = MS.S;
const { $, $$, clamp, toast } = MS;
const cv = ()=> MS.canvas;
const QUICK = {
  critique:'Critique my current design for printing on merch: legibility, contrast against the garment colour, balance and spacing, how many ink colours it needs, and anything that will look bad on a shirt. Be specific and concise. Offer the easy fixes as suggestions I can apply with one click.',
  ideas:'Give me 6 short slogan / tagline ideas that suit this design. Offer each as a suggestion that adds it to the design as text in a font and colour that fit.',
  palette:'Suggest 4 colour palettes that would suit this design on the current garment. Offer each as a suggestion that recolours my existing layers (and the garment colour if useful).',
};
const state = { history:[], busy:false, available:null, mode:'' };   // mode: 'key' (own API key, direct) | 'code' (Claude Code on this PC via serve.ps1)
const KEYNAME = 'imagination_claude_key', MODEL = 'claude-sonnet-5-5';
const getKey = ()=>{ try{ return localStorage.getItem(KEYNAME) || ''; }catch(e){ return ''; } };
const ANIMFX = ()=> Object.keys((MS.anim && MS.anim.FX) || {}).join(', ');
function fonts(){
  const by = {}; (MS.fontList || []).forEach(f=>{ (by[f.c] = by[f.c] || []).push(f.n); });
  return Object.values(by).map(a=> a.slice(0, 14)).flat();
}
const ckFont = f=> (MS.fontNames || []).find(x=> x.toLowerCase() === String(f || '').toLowerCase()) || S.font;
function ckColor(v){ if(v === undefined || v === null) return undefined; const s = String(v).trim().toLowerCase(); if(['clear','none','transparent'].includes(s)) return ''; return /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(s) ? s : undefined; }
const ckNum = (v, lo, hi, d)=>{ const n = +v; return Number.isFinite(n) ? clamp(n, lo, hi) : d; };

function describe(){
  const col = c=> typeof c === 'string' ? (c === '' ? 'clear' : c) : (c ? 'gradient/pattern' : 'clear');
  return cv().getObjects().map(o=>{
    const c = o.getCenterPoint(), d = { ref:o.name, type:o._isCurvedText ? 'curved-text' : o.type, x:Math.round(c.x), y:Math.round(c.y), w:Math.round(o.getScaledWidth()), h:Math.round(o.getScaledHeight()), angle:Math.round(o.angle || 0), opacity:+(o.opacity ?? 1).toFixed(2) };
    if(o._isCurvedText){ d.text = o._curveSourceText; d.fontFamily = o._curveStyle.fontFamily; d.fontSize = o._curveStyle.fontSize; d.fill = col(o._curveStyle.fill); }
    else if(MS.isTextObj(o)){ d.text = o.text; d.fontFamily = o.fontFamily; d.fontSize = o.fontSize; d.fill = col(o.fill); if(o.stroke) d.stroke = col(o.stroke); }
    else { d.fill = col(o.fill); if(o.stroke) d.stroke = col(o.stroke); d.strokeWidth = o.strokeWidth; }
    if(o.__isBackground) d.isBackground = true;
    return d;
  });
}
function snapshot(){
  const mult = Math.min(1, 800 / Math.max(S.doc.wPx, S.doc.hPx));
  return MS.renderArtboard({ multiplier:mult, background:MS.garmentValue() || '#b9bcc6' }).toDataURL('image/png');
}
function prompt(userText, hasImage){
  const hist = state.history.slice(-8).map(m=> (m.role === 'user' ? 'USER: ' : 'YOU: ') + m.text).join('\n');
  const g = MS.garmentValue();
  return `You are the design assistant built into "Merch Studio", a local logo / ad / merch design tool. You help the user design logos, ads and merch (t-shirts, hoodies, mugs, caps). You can edit their design directly.

OUTPUT FORMAT — reply with ONE JSON object and nothing else (no markdown fences):
{"say": "short, friendly message to the user", "actions": [...], "suggestions": [{"label": "short button text", "actions": [...]}]}
- "actions" are applied to the canvas immediately. Only include them when the user asked you to make a change. Never include them for pure advice/critique.
- "suggestions" are optional one-click buttons for ideas the user can choose to apply (slogans, palettes, fixes). Max 8.
- Keep "say" brief and concrete. Plain text, no markdown.

CANVAS: artboard is ${S.doc.wPx} x ${S.doc.hPx} px. Coordinates x,y are the CENTER of an object in artboard pixels, origin top-left. Garment colour (preview only): ${g || 'clear (see-through)'}. ${hasImage ? (state.mode === 'key' ? 'A snapshot of the design on the garment colour is attached as an image.' : 'A snapshot of the design on the garment colour is at ./design.png in the current directory — read it with the Read tool before judging looks.') : 'No snapshot is available; rely on the layer list.'}
Every colour is a "#rrggbb" hex, or "clear" meaning fully see-through.
Fonts must be exactly one of: ${fonts().join(', ')}.

ACTIONS (each is an object with "do"):
- {"do":"add_text","text":"...","x":600,"y":600,"fontSize":120,"fontFamily":"Anton","fill":"#ffffff","stroke":"#000000","strokeWidth":3,"bold":false,"italic":false,"charSpacing":0,"angle":0,"curve":0}   (curve -100..100 bends the text along an arc)
- {"do":"add_shape","kind":"rect|ellipse|triangle|diamond|pentagon|hexagon|star|cross|rrect|heart|speech","x":600,"y":600,"w":300,"h":300,"fill":"#ff0000","stroke":"#000000","strokeWidth":0,"angle":0}
- {"do":"update","ref":"<layer ref>","text":"...","fill":"#..","stroke":"#..","strokeWidth":2,"fontFamily":"..","fontSize":100,"x":..,"y":..,"w":..,"h":..,"angle":..,"opacity":0..1}
- {"do":"delete","ref":"<layer ref>"}
- {"do":"order","ref":"<layer ref>","to":"front|back|forward|backward"}
- {"do":"align","ref":"<layer ref>","mode":"left|right|hcenter|top|bottom|vcenter"}
- {"do":"set_garment","color":"#rrggbb or clear"}
- {"do":"set_background","color":"#rrggbb or clear"}
- {"do":"set_mockup","garment":"tee|hoodie|tote|mug|poster|cap|sticker","view":"front|back","widthIn":10}
ANIMATION (the editor has a timeline; use these when the user asks for movement / animation / GIF):
- {"do":"anim_settings","duration":3,"fps":12,"loop":true,"pingpong":false}   (duration in seconds, 0.5..60)
- {"do":"add_effect","ref":"<layer ref>","type":"<effect>","amount":50,"cycles":1,"dir":"l|r|u|d|cw|ccw","start":0,"len":0.6,"from":"<font>","stagger":0}   (use "refs":[...] for several layers; stagger 0..100 offsets each layer in turn)
  Effects: ${ANIMFX()}.
  LOOPING effects (pulse, heartbeat, bounce, float, wiggle, swing, shake, squash, orbit, glowpulse, flicker, blink, spin) repeat "cycles" times across the whole duration. ONE-SHOT effects (fadeIn, fadeOut, popIn, zoomIn, zoomOut, slideIn, slideOut, dropIn, gather, scatter, fontMorph) run from "start" for "len" seconds; "in" effects default to the start, "out" effects to the end. "dir" for slideIn/slideOut is the side it comes from/goes to (l r u d); for spin cw or ccw. fontMorph only works on text and warped shapes, "from" is the font it melts from.
- {"do":"add_key","ref":"<layer ref>","t":1.5,"x":600,"y":400,"dx":0,"dy":-100,"scale":1.5,"angle":20,"opacity":0.5,"ease":"linear|easeInOut|easeIn|easeOut|back|bounce|elastic|hold"}   (keyframe at time t seconds. x,y are absolute centre; dx,dy are offsets from the start position; scale is a multiplier of the starting size; omitted values carry on from the previous keyframe. Layers start at their current position at t=0.)
- {"do":"remove_animation","ref":"<layer ref>|all"}
- {"do":"make_loop"}   (makes the animation loop seamlessly: last keyframe = first, whole cycles)
Build animations from effects first; add keyframes for paths effects cannot do. Stack several effects on a layer when it helps. For a seamless GIF end with make_loop. Describe the motion briefly in "say". The editor plays the result right after your actions are applied.
CURRENT ANIMATION: ${JSON.stringify(MS.anim ? MS.anim.aiDescribe() : {})}

"ref" must match a "ref" from CURRENT LAYERS. Think about print: avoid tiny text, keep strong contrast with the garment, keep designs within the artboard.

CURRENT LAYERS (bottom to top):
${JSON.stringify(describe())}

${hist ? 'CONVERSATION SO FAR:\n' + hist + '\n\n' : ''}USER: ${userText}`;
}
const findLayer = ref=> cv().getObjects().find(o=> o.name === ref);
const ANIMDO = ['anim_settings', 'add_effect', 'add_key', 'remove_animation', 'make_loop'];
function applyAction(a){
  if(ANIMDO.includes(a.do)) return !!(MS.anim && MS.anim.aiApply(a));
  const c = cv(), cx = S.doc.wPx / 2, cy = S.doc.hPx / 2;
  switch(a.do){
    case 'add_text': {
      const t = MS.tools.addText({ text:String(a.text ?? 'Text'), x:ckNum(a.x, -5000, 9000, cx), y:ckNum(a.y, -5000, 9000, cy), fontSize:ckNum(a.fontSize, 8, 3000, 120), fontFamily:ckFont(a.fontFamily), fill:ckColor(a.fill) || '#222222', bold:!!a.bold, charSpacing:ckNum(a.charSpacing, -200, 1000, 0), stroke:ckColor(a.stroke) || null, strokeWidth:ckNum(a.strokeWidth, 0, 100, 2), select:false });
      if(a.italic) t.set('fontStyle', 'italic'); if(a.angle) t.rotate(ckNum(a.angle, -360, 360, 0));
      const curve = ckNum(a.curve, -100, 100, 0); if(curve){ c.setActiveObject(t); MS.text.curve(curve); }
      return true; }
    case 'add_shape': {
      const w = ckNum(a.w, 4, 9000, 300), h = ckNum(a.h, 4, 9000, w);
      const o = MS.tools.addShape(String(a.kind || 'rect'), { x:ckNum(a.x, -5000, 9000, cx), y:ckNum(a.y, -5000, 9000, cy), w, h, fill:ckColor(a.fill) ?? '#ff0000', stroke:ckColor(a.stroke) || null });
      if(!o) return false; if(a.strokeWidth) o.set('strokeWidth', ckNum(a.strokeWidth, 0, 200, 0)); if(a.angle) o.rotate(ckNum(a.angle, -360, 360, 0)); return true; }
    case 'update': {
      const o = findLayer(a.ref); if(!o) return false;
      c.setActiveObject(o); const f = ckColor(a.fill), s = ckColor(a.stroke);
      if(MS.isTextObj(o)){
        const props = {}; if(a.fontFamily) props.fontFamily = ckFont(a.fontFamily); if(a.fontSize) props.fontSize = ckNum(a.fontSize, 8, 3000, 48); if(f !== undefined) props.fill = f; if(s !== undefined) props.stroke = s || null;
        if(a.strokeWidth !== undefined) props.strokeWidth = ckNum(a.strokeWidth, 0, 200, 0); if(a.bold !== undefined) props.fontWeight = a.bold ? 'bold' : 'normal'; if(a.italic !== undefined) props.fontStyle = a.italic ? 'italic' : 'normal';
        if(Object.keys(props).length) MS.text.set(props, 'Claude edit', true); if(a.text !== undefined) MS.text.text(String(a.text));
      } else { const p = {}; if(f !== undefined){ p.fill = f; o.__fillMeta = null; } if(s !== undefined) p.stroke = s || null; if(a.strokeWidth !== undefined) p.strokeWidth = ckNum(a.strokeWidth, 0, 200, 0); o.set(p); }
      const o2 = c.getActiveObject() || o;
      if(a.opacity !== undefined) o2.set('opacity', ckNum(a.opacity, 0, 1, 1)); if(a.angle !== undefined) o2.set('angle', ckNum(a.angle, -360, 360, 0));
      if(a.w !== undefined && o2.width) o2.set('scaleX', ckNum(a.w, 4, 9000, o2.getScaledWidth()) / o2.width); if(a.h !== undefined && o2.height) o2.set('scaleY', ckNum(a.h, 4, 9000, o2.getScaledHeight()) / o2.height);
      if(a.x !== undefined || a.y !== undefined){ const ctr = o2.getCenterPoint(); o2.setPositionByOrigin(new fabric.Point(ckNum(a.x, -5000, 9000, ctr.x), ckNum(a.y, -5000, 9000, ctr.y)), 'center', 'center'); }
      o2.dirty = true; o2.setCoords(); MS.dirtyObj(o2); c.discardActiveObject(); return true; }
    case 'delete': { const o = findLayer(a.ref); if(!o) return false; c.remove(o); return true; }
    case 'order': { const o = findLayer(a.ref); if(!o) return false; c.setActiveObject(o); MS.ops.order(({ front:'front', back:'back', forward:'fwd', backward:'bwd' })[a.to] || 'front'); c.discardActiveObject(); return true; }
    case 'align': { const o = findLayer(a.ref); if(!o) return false; c.setActiveObject(o); MS.ops.align(a.mode); c.discardActiveObject(); return true; }
    case 'set_garment': { const col = ckColor(a.color); if(col === undefined) return false; MS.setGarment(col || S.doc.garment, col === ''); return true; }
    case 'set_background': { const col = ckColor(a.color); if(col === undefined) return false; if(col === '') MS.clearBackground(); else MS.setSolidBackground(col); return true; }
    case 'set_mockup': { MS.setWorkspace('merch'); MS.mockup && MS.mockup.set({ garment:a.garment || undefined, view:a.view, widthIn:a.widthIn }); return true; }
  }
  return false;
}
function run(actions){
  if(!Array.isArray(actions) || !actions.length) return { ok:0, bad:0 };
  let ok = 0, bad = 0;
  MS.suspendHistory(()=>{ actions.forEach(a=>{ try{ (a && applyAction(a)) ? ok++ : bad++; }catch(e){ console.warn('Claude action failed', a, e); bad++; } }); });
  cv().discardActiveObject(); cv().requestRenderAll(); if(actions.some(a=> a && ANIMDO.includes(a.do)) && MS.anim) MS.anim.aiFinish(true);
  MS.commit('Claude edit'); return { ok, bad };
}
function parse(text){
  const t = String(text).trim(), tp = s=>{ try{ const j = JSON.parse(s); return j && typeof j === 'object' ? j : null; }catch(e){ return null; } };
  let j = tp(t); if(!j){ const a = t.indexOf('{'), b = t.lastIndexOf('}'); if(a >= 0 && b > a) j = tp(t.slice(a, b + 1)); }
  return j || { say:t };
}
MS.initClaude = function(){
  const log = $('#claudeLog'), input = $('#claudeInput'), send = $('#claudeSend');
  const addMsg = (cls, text)=>{ const d = document.createElement('div'); d.className = 'cl-msg ' + cls; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; };
  const chips = (parent, list)=>{ const w = document.createElement('div'); w.className = 'cl-chips'; list.slice(0, 8).forEach(s=>{ if(!s || !s.label) return; const b = document.createElement('button'); b.textContent = s.label; b.onclick = ()=>{ const r = run(s.actions); b.classList.add('done'); toast(r.ok ? 'Applied “' + s.label + '” — Ctrl+Z to undo.' : 'That suggestion could not be applied.'); }; w.appendChild(b); }); if(w.children.length) parent.appendChild(w); };
  async function status(){
    const el = $('#claudeStatus');
    if(getKey()){ state.available = true; state.mode = 'key'; el.textContent = '● Using your own Claude API key'; return; }
    if(!/^https?:$/.test(location.protocol)){ state.available = false; el.textContent = '⚠ Add your Claude API key below to use Claude here (or open with “Start Imagination Studio.bat” to use Claude Code).'; return; }
    try{ const j = await (await fetch('claude/status')).json(); state.available = !!j.available; state.mode = j.available ? 'code' : ''; el.textContent = j.available ? '● Connected to Claude Code on this PC' : '⚠ Claude Code wasn’t found on this PC. Install it from claude.com/code and sign in once — or add your own Claude API key below.'; }
    catch(e){ state.available = false; state.mode = ''; el.textContent = '⚠ No Claude connection. Add your own Claude API key below (or start with “Start Imagination Studio.bat” to use Claude Code).'; }
  }
  async function askKey(promptText, image){
    const content = []; if(image) content.push({ type:'image', source:{ type:'base64', media_type:'image/png', data:image.replace(/^data:image\/png;base64,/, '') } });
    content.push({ type:'text', text:promptText });
    const r = await fetch('https://api.anthropic.com/v1/messages', { method:'POST', headers:{ 'content-type':'application/json', 'x-api-key':getKey(), 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' }, body:JSON.stringify({ model:MODEL, max_tokens:4096, messages:[{ role:'user', content }] }) });
    const j = await r.json().catch(()=> ({})); if(!r.ok) throw new Error((j.error && j.error.message) || ('Claude API error ' + r.status));
    return (j.content || []).filter(b=> b.type === 'text').map(b=> b.text).join('');
  }
  async function ask(txt){
    txt = (txt || '').trim(); if(!txt || state.busy) return;
    if(state.available === null) await status();
    if(!state.available){ addMsg('err', $('#claudeStatus').textContent); return; }
    state.busy = true; send.disabled = true; addMsg('user', txt);
    const think = addMsg('bot', ''); think.innerHTML = '<span class="cl-think">✦ Claude is thinking…</span>';
    try{
      const image = $('#claudeSeeDesign').checked ? snapshot() : null;
      let answer;
      if(state.mode === 'key') answer = await askKey(prompt(txt, !!image), image);
      else { const r = await fetch('claude/ask', { method:'POST', headers:{ 'Content-Type':'application/json', 'X-Merch-Studio':'1' }, body:JSON.stringify({ prompt:prompt(txt, !!image), image }) }); const j = await r.json(); if(!j.ok) throw new Error(j.error || 'Claude did not answer.'); answer = j.text; }
      const reply = parse(answer); state.history.push({ role:'user', text:txt }, { role:'assistant', text:reply.say || '' });
      think.textContent = reply.say || '(done)';
      const res = run(reply.actions);
      if(res.ok || res.bad) addMsg('sys', res.ok ? '✓ Applied ' + res.ok + ' change' + (res.ok > 1 ? 's' : '') + ' (Ctrl+Z undoes them all)' + (res.bad ? ' — ' + res.bad + ' couldn’t be applied' : '') : res.bad + ' change(s) couldn’t be applied');
      if(Array.isArray(reply.suggestions)) chips(think, reply.suggestions);
    }catch(e){ think.remove(); addMsg('err', String(e.message || e)); }
    finally{ state.busy = false; send.disabled = false; log.scrollTop = log.scrollHeight; }
  }
  send.onclick = ()=>{ const t = input.value; input.value = ''; ask(t); };
  input.addEventListener('keydown', e=>{ if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); const t = input.value; input.value = ''; ask(t); } });
  $$('.claude-quick').forEach(b=> b.onclick = ()=> ask(QUICK[b.dataset.q]));
  $('#claudeKeySave').onclick = ()=>{ const v = $('#claudeKey').value.trim(); if(!/^sk-ant-/.test(v)){ toast('That does not look like a Claude API key (it starts with sk-ant-).', 4000); return; } try{ localStorage.setItem(KEYNAME, v); }catch(e){ toast('This browser would not save the key.', 4000); return; } $('#claudeKey').value = ''; state.available = null; status(); toast('Key saved in this browser only.'); };
  $('#claudeKeyForget').onclick = ()=>{ try{ localStorage.removeItem(KEYNAME); }catch(e){} $('#claudeKey').value = ''; state.available = null; status(); toast('Key removed.'); };
  $('#claudeClear').onclick = ()=>{ log.innerHTML = ''; state.history = []; };
  MS.on('page', p=>{ if(p === 'claude' && state.available === null) status(); });
  if(getKey()) status();
  addMsg('sys', 'Ask Claude to design, edit or critique. Try “create a bold gold wordmark that says LLM2WMD”, or “make it fly in, pulse, then fade out as a seamless loop”.');
};
})();
