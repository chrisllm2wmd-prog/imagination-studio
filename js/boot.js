/* Merch Studio - boot: menus, commands, shortcuts, workspaces, New Design dialog, context menu, startup. */
(function(){
'use strict';
const MS = window.MS, S = MS.S;
const { $, $$, toast } = MS;
const cv = ()=> MS.canvas;
const has = ()=> !!cv().getActiveObject();

/* ============================ WORKSPACES ============================ */
MS.setWorkspace = function(ws, silent){
  document.body.dataset.ws = ws; S.doc.kind = ws;
  $$('#wsSwitch button').forEach(b=> b.classList.toggle('active', b.dataset.ws === ws));
  $$('.ws-ad').forEach(e=> e.style.display = ws === 'ad' ? '' : 'none');
  $$('.ws-merch').forEach(e=> e.style.display = ws === 'merch' ? '' : 'none');
  const cur = $('#tabsTop .dock-tab.active');
  if(cur && cur.style.display === 'none') MS.showPage('design');
  if(ws === 'ad' && !silent) MS.showPage('ad');
  if(ws === 'merch' && !silent) MS.showPage('merch');
  MS.emit('workspace', ws);
  MS.store.set('ws', ws);
};

/* ============================ NEW DESIGN DIALOG ============================ */
const PRESETS = {
  Logo:[
    { n:'Square 12×12 in', d:'Standard print logo', mode:'print', w:12, h:12 },
    { n:'Square 14×14 in', d:'Large print', mode:'print', w:14, h:14 },
    { n:'Tall 12×16 in', d:'T-shirt front', mode:'print', w:12, h:16 },
    { n:'Pocket 4×4 in', d:'Left chest', mode:'print', w:4, h:4 },
    { n:'Sleeve 11×3 in', d:'Sleeve / banner', mode:'print', w:11, h:3 },
    { n:'Wide 16×8 in', d:'Wordmark', mode:'print', w:16, h:8 },
    { n:'Sticker 4×4 in', d:'Die-cut', mode:'print', w:4, h:4 },
    { n:'Patch 3×3 in', d:'Embroidery / patch', mode:'print', w:3, h:3 },
  ],
  Merch:[
    { n:'Tee front 12×16 in', d:'Adult tee', mode:'print', w:12, h:16 },
    { n:'Tee back 14×18 in', d:'Back print', mode:'print', w:14, h:18 },
    { n:'Hoodie front 12×14 in', d:'Hoodie', mode:'print', w:12, h:14 },
    { n:'Left chest 4×4 in', d:'Pocket area', mode:'print', w:4, h:4 },
    { n:'Hat front 4.5×2 in', d:'Cap embroidery', mode:'print', w:4.5, h:2 },
    { n:'Tote bag 12×12 in', d:'Canvas tote', mode:'print', w:12, h:12 },
    { n:'Mug wrap 8.5×3.5 in', d:'11 oz mug', mode:'print', w:8.5, h:3.5 },
    { n:'Poster 18×24 in', d:'Wall poster', mode:'print', w:18, h:24 },
    { n:'Phone case 3×6 in', d:'Case wrap', mode:'print', w:3, h:6 },
    { n:'Beanie 3×1.5 in', d:'Patch / embroidery', mode:'print', w:3, h:1.5 },
  ],
  Social:[
    { n:'Instagram post', d:'1080 × 1080', mode:'px', w:1080, h:1080 },
    { n:'Instagram portrait', d:'1080 × 1350', mode:'px', w:1080, h:1350 },
    { n:'Story / Reel', d:'1080 × 1920', mode:'px', w:1080, h:1920 },
    { n:'Facebook / link post', d:'1200 × 630', mode:'px', w:1200, h:630 },
    { n:'YouTube thumbnail', d:'1280 × 720', mode:'px', w:1280, h:720 },
    { n:'X / Twitter header', d:'1500 × 500', mode:'px', w:1500, h:500 },
    { n:'Pinterest pin', d:'1000 × 1500', mode:'px', w:1000, h:1500 },
    { n:'X / Twitter post', d:'1600 × 900', mode:'px', w:1600, h:900 },
  ],
  Ads:[
    { n:'Medium rectangle', d:'300 × 250', mode:'px', w:300, h:250 },
    { n:'Leaderboard', d:'728 × 90', mode:'px', w:728, h:90 },
    { n:'Half page', d:'300 × 600', mode:'px', w:300, h:600 },
    { n:'Skyscraper', d:'160 × 600', mode:'px', w:160, h:600 },
    { n:'Billboard', d:'970 × 250', mode:'px', w:970, h:250 },
    { n:'Large mobile banner', d:'320 × 100', mode:'px', w:320, h:100 },
    { n:'Flyer (letter 300dpi)', d:'2550 × 3300', mode:'px', w:2550, h:3300 },
    { n:'Postcard 6×4 in', d:'1800 × 1200', mode:'px', w:1800, h:1200 },
  ],
  Animation:[
    { n:'Square GIF', d:'480 × 480', mode:'px', w:480, h:480 },
    { n:'Logo loop', d:'800 × 800', mode:'px', w:800, h:800 },
    { n:'Wide GIF', d:'640 × 360', mode:'px', w:640, h:360 },
    { n:'Story / Reel loop', d:'540 × 960', mode:'px', w:540, h:960 },
    { n:'Chat emote', d:'128 × 128', mode:'px', w:128, h:128 },
    { n:'Email banner', d:'600 × 200', mode:'px', w:600, h:200 },
    { n:'Profile picture', d:'400 × 400', mode:'px', w:400, h:400 },
    { n:'Web banner', d:'970 × 250', mode:'px', w:970, h:250 },
  ],
  Blank:[ { n:'Blank canvas', d:'Largest possible square', mode:'px', w:16370, h:16370 } ],
  'Decals & Games':[
    { n:'Decal 2048 square', d:'Gran Turismo / Forza style', mode:'px', w:2048, h:2048 },
    { n:'Decal 1024 square', d:'Small decal', mode:'px', w:1024, h:1024 },
    { n:'Decal 4096 square', d:'Hi-res decal', mode:'px', w:4096, h:4096 },
    { n:'Wide decal 2048×1024', d:'Hood / bumper', mode:'px', w:2048, h:1024 },
    { n:'Icon 512', d:'App / game icon', mode:'px', w:512, h:512 },
    { n:'Discord banner', d:'960 × 540', mode:'px', w:960, h:540 },
  ],
};
const HOME_CATS = [
  ['Blank', 'newdoc', 'Blank canvas', 'Opens the largest possible square'],
  ['Animation', 'play', 'Animations & GIFs', 'Make logos and art move, export a GIF'],
  ['Logo', 'logo', 'Logos & print art', 'Artwork sized in inches for printing'],
  ['Merch', 'shirt', 'Merch & products', 'Tees, hoodies, mugs, caps, posters'],
  ['Social', 'image', 'Social media', 'Posts, stories, thumbnails, headers'],
  ['Ads', 'megaphone', 'Ads & flyers', 'Banners, display ads, print'],
  ['Decals & Games', 'hex', 'Decals & games', 'Livery decals, icons, banners'],
];
MS.openNewDialog = async function(first){
  if(document.getElementById('home')) return;
  const saved = first ? await MS.readAutosave() : null;
  const hasSaved = !!(saved && saved.payload && (saved.payload.canvasJSON.objects || []).length);
  let tab = 'Blank', pick = PRESETS.Blank[0], bgPick = 'transparent';
  const ov = document.createElement('div'); ov.id = 'home';
  const close = ()=>{ document.removeEventListener('keydown', onKey, true); ov.classList.add('out'); setTimeout(()=> ov.remove(), 250); };
  const onKey = e=>{ if(e.key === 'Escape' && !first){ e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(ov);
  const dims = p=> p.mode === 'print' ? p.w + ' × ' + p.h + ' in' : p.w + ' × ' + p.h + ' px';
  const BGS = [['transparent', 'transparent', 'Transparent'], ['#ffffff', '#ffffff', 'White'], ['#111111', '#111111', 'Black'], ['#0d1b2a', '#0d1b2a', 'Navy'], ['#7a1f2b', '#7a1f2b', 'Burgundy'], ['#2e5339', '#2e5339', 'Forest'], ['#d4a017', '#d4a017', 'Gold'], ['#e8e2d0', '#e8e2d0', 'Cream']];
  const TIPS = {
    _:[
      'Drawing tools lock the canvas — press <kbd>V</kbd> to select again.',
      '<kbd>Ctrl</kbd>+<kbd>K</kbd> searches every command.',
      'Export PNG, SVG, PDF, GIF and more from <kbd>Ctrl</kbd>+<kbd>E</kbd>.',
    ],
    Animation:[
      'Click an element, click a motion — it plays straight away. Then press Save as GIF.',
      'Small canvases make small GIFs. 480 px wide is plenty for the web.',
      'Save as GIF makes the loop seamless for you.',
    ],
    Blank:[
      'A blank canvas is 16370 × 16370 px — the biggest square the browser can export. Resize it any time from the document settings.',
    ],
    Logo:[
      'Print logos are sized in inches — design big, you can scale down without losing quality.',
      'Leave the background transparent so the logo works on any colour of shirt.',
    ],
    Merch:[
      'Pick the product that matches where the print sits — front, back, pocket or cap.',
      'Merch designs preview on a garment colour you can change later.',
    ],
    Social:[
      'Keep key text away from the edges — apps crop posts and stories differently.',
      'Story / Reel is 9:16 — leave the top and bottom clear for app buttons.',
    ],
    Ads:[
      'Display ads are tiny — big words, one clear message.',
      'You can export every ad size at once from the File menu.',
    ],
    'Decals & Games':[
      'Game decals are usually square and a power of two — 1024, 2048 or 4096.',
      'Keep a transparent background so the decal sits cleanly on the car.',
    ],
  };
  let tipIdx = 0, popRow = false, tipsOn = !MS.store.get('homeTipsOff', false);
  const tipList = ()=>{
    const l = [];
    if(pick) l.push(pick.mode === 'print' ? 'At 300 dpi, ' + MS.esc(pick.n) + ' exports at ' + Math.round(pick.w * 300) + ' × ' + Math.round(pick.h * 300) + ' px.' : MS.esc(pick.n) + ' exports at exactly ' + pick.w + ' × ' + pick.h + ' px.');
    if(tab) l.push(...TIPS[tab]);
    return l.concat(TIPS._);
  };
  const setTab = t=>{ tab = t; pick = t === 'Blank' ? PRESETS.Blank[0] : null; tipIdx = 0; popRow = true; };
  function draw(){
    const hr = new Date().getHours(), greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
    const tips = tipList(), tip = tips[tipIdx % tips.length];
    const shape = p=>{ const r = p.w / p.h, w = r >= 1 ? 30 : 30 * r, h = r >= 1 ? 30 / r : 30; return '<i class="fmt-shape" style="width:' + Math.max(4, Math.round(w)) + 'px;height:' + Math.max(4, Math.round(h)) + 'px"></i>'; };
    const step = 'Now choose a size';
    ov.innerHTML = `
      <div class="home-side">
        <div class="home-brand">${MS.icon('logo')}<div><b>Imagination Studio</b><span>Create. Design. Print.  ·  v${window.IMAGINATION_VERSION || ''}</span></div></div>
        <button class="home-new active" id="hmNew">${MS.icon('newdoc')}<span>New design</span></button>
        <button class="home-new" id="hmOpen">${MS.icon('open')}<span>Open project…</span></button>
        ${hasSaved ? `<button class="home-new" id="hmRestore">${MS.icon('history')}<span>Continue last session<small>${MS.esc(saved.payload.meta.name || 'Untitled')} · ${new Date(saved.savedAt).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}</small></span></button>` : ''}
        ${tipsOn ? `<div class="home-tips"><div class="ht-head"><b>Tips</b><button class="ht-x" id="htOff" data-tip="Switch tips off" aria-label="Switch tips off">×</button></div><p class="ht-body">${tip}</p><div class="ht-foot"><span>${(tipIdx % tips.length) + 1} / ${tips.length}</span><button class="btn sm" id="htNext">Next tip ›</button></div></div>` : `<button class="home-tipson" id="htOn">Show tips</button>`}
        <div class="home-credit">Created by Chris Chapman  ·  Powered by your Imagination</div>
        ${first ? '' : '<button class="home-new" id="hmClose">' + MS.icon('x') + '<span>Close</span></button>'}
      </div>
      <div class="home-main">
        <div class="home-hero"><h1>${greet}. What will you create today?</h1><p>Set your imagination free. Everything stays editable, and you can resize or export at any quality later.</p></div>
        <div class="home-cats">${HOME_CATS.map(([k, ic, t, d])=> `<button class="home-cat ${k === tab ? 'active' : ''}" data-t="${k}">${MS.icon(ic)}<b>${t}</b><span>${d}</span></button>`).join('')}</div>
        ${tab && tab !== 'Blank' ? `<div class="home-cats home-fmts ${popRow ? 'pop' : ''}">${PRESETS[tab].map((p, i)=> `<button class="home-cat home-fmt ${p === pick ? 'active' : ''}" data-i="${i}" title="${p.d}">${shape(p)}<div><b>${p.n}</b><em>${dims(p)}</em></div></button>`).join('')}</div>` : ''}
        <div class="home-foot">
          ${pick ? `<div class="r hf-opts" style="gap:10px"><label style="width:auto;color:var(--txt);font-weight:600">Custom size</label>
            <div class="f" style="width:104px"><span>W</span><input type="number" id="ndW" min="0.1" step="any" value="${pick.w}"></div>
            <div class="f" style="width:104px"><span>H</span><input type="number" id="ndH" min="0.1" step="any" value="${pick.h}"></div>
            <div class="seg" id="ndUnit"><button data-u="in" class="${pick.mode === 'print' ? 'active' : ''}">inches</button><button data-u="px" class="${pick.mode !== 'print' ? 'active' : ''}">pixels</button></div>
            <button class="btn sm" id="hpSwap">${MS.icon('swap')}Portrait ↔ Landscape</button>
            <input type="text" id="ndName" class="grow" value="${MS.esc(pick.n)}" spellcheck="false" placeholder="Name your design">
            <label style="width:auto;color:var(--txt);font-weight:600">Background</label>
            <div class="hp-bgs">${BGS.map(([k, c, t])=> `<button class="hp-bg ${k === bgPick ? 'active' : ''}" data-k="${k}" data-tip="${t}" style="--c:${c}"></button>`).join('')}<label class="hp-bg hp-bgpick ${BGS.some(b=> b[0] === bgPick) ? '' : 'active'}" data-tip="Any colour…" style="--c:${BGS.some(b=> b[0] === bgPick) ? '#888' : bgPick}"><input type="color" id="bgColor" value="${/^#[0-9a-f]{6}$/i.test(bgPick) ? bgPick : '#ffffff'}"><span>+</span></label></div></div>` : `<div class="hf-step">${step}</div>`}
          <button class="home-go" id="ndGo" ${pick ? '' : 'disabled'}>${MS.icon('sparkle') || ''}Open Imagination</button>
        </div>
      </div>`;
    popRow = false;
    $$('.home-cat[data-t]', ov).forEach(b=> b.onclick = ()=>{ setTab(b.dataset.t); draw(); });
    $$('.home-fmt', ov).forEach(b=>{ b.onclick = ()=>{ pick = PRESETS[tab][+b.dataset.i]; tipIdx = 0; draw(); }; b.ondblclick = ()=>{ pick = PRESETS[tab][+b.dataset.i]; draw(); create(); }; });
    $$('#ndUnit button', ov).forEach(b=> b.onclick = ()=>{ pick = Object.assign({}, pick, { mode:b.dataset.u === 'in' ? 'print' : 'px' }); $$('#ndUnit button', ov).forEach(x=> x.classList.toggle('active', x === b)); });
    const nw = $('#ndW', ov), nh = $('#ndH', ov);
    if(nw) nw.oninput = e=>{ pick = Object.assign({}, pick, { w:+e.target.value }); }; if(nh) nh.oninput = e=>{ pick = Object.assign({}, pick, { h:+e.target.value }); };
    const sw = $('#hpSwap', ov); if(sw) sw.onclick = ()=>{ pick = Object.assign({}, pick, { w:pick.h, h:pick.w }); draw(); };
    $$('button.hp-bg', ov).forEach(x=> x.onclick = ()=>{ bgPick = x.dataset.k; draw(); });
    const bc = $('#bgColor', ov); if(bc) bc.oninput = ()=>{ bgPick = bc.value; $$('.hp-bg', ov).forEach(x=> x.classList.toggle('active', x === bc.parentNode)); bc.parentNode.style.setProperty('--c', bc.value); bc.parentNode.classList.add('set'); };
    $('#ndGo', ov).onclick = create; $('#hmOpen', ov).onclick = ()=> $('#projectLoadInput').click();
    const rs = $('#hmRestore', ov); if(rs) rs.onclick = ()=>{ MS.loadProject(saved.payload, ()=>{ close(); toast('Session restored.'); }); };
    const cl = $('#hmClose', ov); if(cl) cl.onclick = close;
    $('#hmNew', ov).onclick = ()=>{ const n = $('#ndName', ov); if(n) n.focus(); };
    const tn = $('#htNext', ov); if(tn) tn.onclick = ()=>{ tipIdx = (tipIdx + 1) % tips.length; draw(); };
    const to = $('#htOff', ov); if(to) to.onclick = ()=>{ tipsOn = false; MS.store.set('homeTipsOff', true); draw(); };
    const ton = $('#htOn', ov); if(ton) ton.onclick = ()=>{ tipsOn = true; MS.store.set('homeTipsOff', false); draw(); };
    window.MSI.hydrate(ov);
  }
  function create(){
    if(!pick) return;
    const w = Math.max(.1, +$('#ndW', ov).value || pick.w), h = Math.max(.1, +$('#ndH', ov).value || pick.h), mode = $('#ndUnit button.active', ov).dataset.u === 'in' ? 'print' : 'social';
    const ws = ({ Logo:'logo', Merch:'merch', Ads:'ad', Social:'ad', Blank:'logo', Animation:'logo', 'Decals & Games':'logo' })[tab], name = $('#ndName', ov).value || 'Untitled design';
    MS.clearAutosave();
    const target = tab === 'Decals & Games' ? 'game' : 'print';
    if(mode === 'print') MS.newDoc({ name, kind:ws, mode:'print', wIn:w, hIn:h, target }); else MS.newDoc({ name, kind:ws, mode:'social', wPx:w, hPx:h, target });
    if(tab === 'Merch') MS.setGarment('#ffffff', false); else MS.setGarment('#ffffff', true);
    if(bgPick !== 'transparent') MS.setSolidBackground(bgPick);
    MS.setWorkspace(ws); close();
    if(tab === 'Animation' && MS.anim){ setTimeout(()=>{ if(!MS.anim.state.on) MS.anim.toggle(true); }, 150); }
    toast('Your canvas is ready — pick a tool on the left, or drop pictures onto it.', 3500);
  }
  draw();
};

/* ============================ CONTEXT MENU ============================ */
MS.contextMenu = function(x, y){
  const a = cv().getActiveObject(), multi = a && a.type === 'activeSelection';
  MS.menu(!a ? [
    { label:'Paste', icon:'paste', key:'Ctrl+V', action:()=> MS.ops.paste() },
    { label:'Select all', icon:'selectall', key:'Ctrl+A', action:MS.ops.selectAll },
    '-', { label:'Fit to screen', icon:'fit', key:'Ctrl+0', action:()=> MS.view.fit() },
    { label:'Add text here', icon:'text', action:()=> MS.tools.addText({ x:S.mouse.x, y:S.mouse.y }) },
    { label:'Import picture…', icon:'image', action:()=> $('#fileImportInput').click() },
  ] : [
    { label:'Cut', icon:'cut', key:'Ctrl+X', action:MS.ops.cut }, { label:'Copy', icon:'copy', key:'Ctrl+C', action:MS.ops.copy },
    { label:'Paste', icon:'paste', key:'Ctrl+V', action:()=> MS.ops.paste() }, { label:'Duplicate', icon:'dup', key:'Ctrl+D', action:MS.ops.duplicate },
    '-', { label:'Copy as…', icon:'kaleido', sub:[ { label:'Mirror copy…', icon:'mirror', action:()=> MS.symmetry.openMirror() }, { label:'Kaleidoscope / radial…', icon:'kaleido', action:()=> MS.symmetry.openKaleido() } ] },
    { label:'Arrange', icon:'front', sub:[ { label:'Bring to front', key:'Ctrl+]', action:()=> MS.ops.order('front') }, { label:'Forward', key:']', action:()=> MS.ops.order('fwd') }, { label:'Backward', key:'[', action:()=> MS.ops.order('bwd') }, { label:'Send to back', key:'Ctrl+[', action:()=> MS.ops.order('back') } ] },
    { label:'Align to artboard', icon:'al-hc', sub:['left','hcenter','right','top','vcenter','bottom'].map(k=>({ label:({left:'Left',hcenter:'Centre horizontally',right:'Right',top:'Top',vcenter:'Centre vertically',bottom:'Bottom'})[k], action:()=> MS.ops.align(k) })) },
    { label:'Flip horizontal', icon:'fliph', action:()=> MS.ops.flip('h') }, { label:'Flip vertical', icon:'flipv', action:()=> MS.ops.flip('v') },
    '-', { label:'Group', icon:'group', key:'Ctrl+G', disabled:!multi, action:MS.ops.group }, { label:'Ungroup', icon:'ungroup', key:'Ctrl+Shift+G', disabled:!(a.type === 'group' && !a._isCurvedText), action:MS.ops.ungroup },
    { label:'Flatten to picture', icon:'merge', action:MS.ops.flatten },
    { label:'Save to assets…', icon:'save', action:()=> MS.groups.saveSelection() },
    '-', { label:'Zoom to selection', icon:'zoom', action:()=> MS.view.selection() }, { label:'Delete', icon:'trash', key:'Del', action:MS.ops.del },
  ], x, y);
};

/* ============================ MENU BAR ============================ */
function clipboardPaste(){ navigator.clipboard && navigator.clipboard.read ? navigator.clipboard.read().then(async items=>{ for(const it of items){ const t = it.types.find(t=>t.startsWith('image/')); if(t){ const b = await it.getType(t); MS.importFiles([new File([b], 'pasted.png', { type:t })]); return; } } MS.ops.paste(); }).catch(()=> MS.ops.paste()) : MS.ops.paste(); }
function menus(){
  const U = k=> ()=> { const d = MS.S.doc; MS.setPref(k, !MS.prefs[k]); };
  const chk = k=> ()=> !!MS.prefs[k];
  return [
    { label:'File', items:[
      { label:'New design…', icon:'newdoc', key:'Ctrl+N', action:()=> MS.openNewDialog() },
      { label:'Open project…', icon:'open', key:'Ctrl+O', action:()=> $('#projectLoadInput').click() },
      { label:'Open from saved files…', icon:'folder', key:'Ctrl+Shift+O', action:()=> MS.openFiles() },
      { label:'Import picture / SVG…', icon:'image', key:'Ctrl+Shift+I', action:()=> $('#fileImportInput').click() },
      '-', { label:'Save project', icon:'save', key:'Ctrl+S', action:MS.saveProject },
      { label:'Save project as…', icon:'save', key:'Ctrl+Shift+S', action:()=> MS.saveProjectAs() },
      { label:'Save selection to assets…', icon:'save', action:()=> MS.groups && MS.groups.saveSelection() },
      { label:'Export…', icon:'export', key:'Ctrl+E', action:()=> MS.openExport() },
      { label:'Quick export PNG (transparent)', icon:'download', key:'Ctrl+Shift+E', action:()=> MS.quickExport && MS.quickExport() },
      { label:'Export all ad sizes (ZIP)…', icon:'megaphone', action:()=> MS.ads && MS.ads.exportAll && MS.ads.exportAll() },
    ]},
    { label:'Edit', items:[
      { label:'Undo', icon:'undo', key:'Ctrl+Z', action:MS.undo }, { label:'Redo', icon:'redo', key:'Ctrl+Shift+Z', action:MS.redo },
      '-', { label:'Cut', icon:'cut', key:'Ctrl+X', disabled:()=>!has(), action:MS.ops.cut }, { label:'Copy', icon:'copy', key:'Ctrl+C', disabled:()=>!has(), action:MS.ops.copy },
      { label:'Paste', icon:'paste', key:'Ctrl+V', action:clipboardPaste }, { label:'Paste in place', key:'Ctrl+Shift+V', action:()=> MS.ops.paste(true) },
      { label:'Duplicate', icon:'dup', key:'Ctrl+D', disabled:()=>!has(), action:MS.ops.duplicate }, { label:'Delete', icon:'trash', key:'Del', disabled:()=>!has(), action:MS.ops.del },
      '-', { label:'Select all', icon:'selectall', key:'Ctrl+A', action:MS.ops.selectAll }, { label:'Deselect', key:'Esc', action:MS.ops.deselect },
    ]},
    { label:'Object', items:[
      { label:'Copy ▸ Mirror…', icon:'mirror', disabled:()=>!has(), action:()=> MS.symmetry.openMirror() },
      { label:'Copy ▸ Kaleidoscope / radial…', icon:'kaleido', disabled:()=>!has(), action:()=> MS.symmetry.openKaleido() },
      '-', { label:'Group', icon:'group', key:'Ctrl+G', action:MS.ops.group }, { label:'Ungroup', icon:'ungroup', key:'Ctrl+Shift+G', action:MS.ops.ungroup },
      { label:'Arrange', icon:'front', sub:[ { label:'Bring to front', key:'Ctrl+]', action:()=> MS.ops.order('front') }, { label:'Forward', key:']', action:()=> MS.ops.order('fwd') }, { label:'Backward', key:'[', action:()=> MS.ops.order('bwd') }, { label:'Send to back', key:'Ctrl+[', action:()=> MS.ops.order('back') } ] },
      { label:'Align to artboard', icon:'al-hc', sub:[['left','Left'],['hcenter','Centre horizontally'],['right','Right'],['top','Top'],['vcenter','Centre vertically'],['bottom','Bottom']].map(([k, l])=>({ label:l, action:()=> MS.ops.align(k) })) },
      { label:'Distribute', icon:'dist-h', sub:[ { label:'Horizontally', action:()=> MS.ops.align('distH') }, { label:'Vertically', action:()=> MS.ops.align('distV') } ] },
      '-', { label:'Flip horizontal', icon:'fliph', action:()=> MS.ops.flip('h') }, { label:'Flip vertical', icon:'flipv', action:()=> MS.ops.flip('v') }, { label:'Rotate 90°', icon:'rot90', action:MS.ops.rotate90 },
      '-', { label:'Flatten selection to picture', icon:'merge', action:MS.ops.flatten },
      { label:'Convert text to outlines', icon:'type', action:()=> MS.textToPaths && MS.textToPaths() },
    ]},
    { label:'Type', items:[
      { label:'Add text', icon:'text', key:'T', action:()=> MS.tools.addText({}) }, { label:'Browse fonts…', icon:'type', key:'Ctrl+Shift+F', action:()=> MS.openFontBrowser() },
      '-', { label:'UPPERCASE', action:()=> MS.text.convertCase('upper') }, { label:'lowercase', action:()=> MS.text.convertCase('lower') }, { label:'Title Case', action:()=> MS.text.convertCase('title') },
      '-', { label:'Graffiti style (cycle)', action:MS.text.graffiti },
      { label:'Curve text', icon:'curve', sub:[ {label:'Arch up', action:()=> MS.text.curve(40)}, {label:'Arch down', action:()=> MS.text.curve(-40)}, {label:'Circle-ish up', action:()=> MS.text.curve(90)}, {label:'Straighten', action:()=> MS.text.curve(0)} ] },
    ]},
    { label:'Effects', items:[
      { label:'Drop shadow', icon:'drop', action:()=> MS.fx && MS.fx.quick('shadow') }, { label:'Outer glow', icon:'sun', action:()=> MS.fx && MS.fx.quick('glow') },
      { label:'Clean outline (stroke behind)', action:()=> MS.fx && MS.fx.quick('outline') }, { label:'Distress / worn print…', action:()=> MS.fx && MS.fx.quick('distress') },
      '-', { label:'Remove all effects', action:()=> MS.fx && MS.fx.quick('clear') },
    ]},
    { label:'View', items:[
      { label:'Zoom in', icon:'plus', key:'Ctrl++', action:MS.view.zoomIn }, { label:'Zoom out', icon:'minus', key:'Ctrl+−', action:MS.view.zoomOut },
      { label:'Fit to screen', icon:'fit', key:'Ctrl+0', action:()=> MS.view.fit() }, { label:'Actual size (100%)', key:'Ctrl+1', action:MS.view.actual }, { label:'Zoom to selection', key:'Ctrl+2', action:()=> MS.view.selection() },
      '-', { label:'Rulers', icon:'ruler', checked:chk('rulers'), action:U('rulers') }, { label:'Grid', icon:'grid', key:"Ctrl+'", checked:chk('grid'), action:U('grid') },
      { label:'Snapping', icon:'magnet', checked:chk('snap'), action:U('snap') }, { label:'Smart guides', checked:chk('smart'), action:U('smart') },
      { label:'Centre guides', checked:chk('centerGuides'), action:U('centerGuides') }, { label:'Safe area / bleed', checked:chk('safe'), action:U('safe') },
      { label:'Clear ruler guides', action:MS.clearGuides },
      '-', { label:'Full-screen preview', icon:'play', action:()=> MS.preview && MS.preview() },
    ]},
    { label:'Window', items:[
      { label:'Animation timeline', icon:'play', key:'Ctrl+Shift+A', action:()=> MS.anim && MS.anim.toggle() },
      { label:'Export animated GIF…', icon:'export', action:()=>{ if(MS.anim){ if(!MS.anim.state.on) MS.anim.toggle(true); MS.anim.openExport(); } } }, '-',
      { label:'Logo workspace', icon:'logo', checked:()=> document.body.dataset.ws === 'logo', action:()=> MS.setWorkspace('logo') },
      { label:'Ad workspace', icon:'megaphone', checked:()=> document.body.dataset.ws === 'ad', action:()=> MS.setWorkspace('ad') },
      { label:'Merch workspace', icon:'shirt', checked:()=> document.body.dataset.ws === 'merch', action:()=> MS.setWorkspace('merch') },
      '-', { label:'Layers', icon:'layers', action:()=> MS.showPage('layers') }, { label:'History', icon:'history', action:()=> MS.showPage('history') }, { label:'Swatches', icon:'palette', action:()=> MS.showPage('swatches') },
      { label:'Claude assistant', icon:'sparkle', action:()=> MS.showPage('claude') },
      '-', { label:'Reset panel layout', action:()=>{ ['dockSplit','dockW'].forEach(k=> localStorage.removeItem('ms.' + k)); location.reload(); } },
    ]},
    { label:'Help', items:[
      { label:'Help centre — guided tours', icon:'info', key:'F1', action:()=> MS.help && MS.help.open() },
      { label:'Quick start tour', icon:'play', action:()=> MS.help && MS.help.tour('start') },
      { label:'Tour a feature', icon:'search', sub:(MS.help ? MS.help.topics : []).map(t=> ({ label:t.title, action:()=> MS.help.tour(t.id) })) }, '-',
      { label:'Command palette…', icon:'search', key:'Ctrl+K', action:MS.openPalette }, { label:'Keyboard shortcuts', icon:'gear', key:'?', action:MS.showShortcuts },
      { label:'Tips', icon:'info', action:()=> MS.showTips() },
      { label:'About Imagination Studio', icon:'logo', action:()=> MS.showAbout() },
    ]},
  ];
}
MS.showShortcuts = function(){
  const rows = [['Tools',[['V','Move'],['H','Hand (pan)'],['Z','Zoom'],['R','Rectangle'],['O','Ellipse'],['L','Line'],['P','Pen (bezier)'],['B','Pencil'],['T','Text'],['W','Magic wand'],['E','Eraser'],['I','Eyedropper'],['X','Swap fill / stroke'],['Space','Hold to pan']]],
    ['Edit',[['Ctrl+Z','Undo'],['Ctrl+Shift+Z','Redo'],['Ctrl+C / X / V','Copy / cut / paste'],['Ctrl+D','Duplicate'],['Ctrl+A','Select all'],['Del','Delete'],['Ctrl+G','Group'],['Ctrl+Shift+G','Ungroup'],['Arrows','Nudge (Shift = 10px)']]],
    ['Arrange',[[']  /  [','Forward / backward'],['Ctrl+]  /  [','To front / back'],['Alt-drag','Move without snapping'],['Shift-rotate','15° steps']]],
    ['View',[['Ctrl+0','Fit to screen'],['Ctrl+1','100%'],['Ctrl+2','Zoom to selection'],['Ctrl + wheel','Zoom at cursor'],["Ctrl+'",'Grid'],['Ctrl+K','Command palette']]],
    ['File',[['Ctrl+N','New'],['Ctrl+S','Save project'],['Ctrl+E','Export'],['Ctrl+Shift+E','Quick export PNG'],['Ctrl+Shift+F','Font browser']]]];
  MS.modal({ title:'Keyboard shortcuts', med:true, footer:false, body:'<div class="kbd-grid">' + rows.map(([c, l])=>`<div class="cat">${c}</div>` + l.map(([k, v])=>`<div><span>${v}</span><kbd>${k}</kbd></div>`).join('')).join('') + '</div>' });
};
MS.showAbout = function(){
  MS.modal({ title:'About', footer:false, body:'<div style="text-align:center;padding:10px 0 4px"><div style="color:var(--acc)">' + MS.icon('logo').replace('class="ic"', 'class="ic" style="width:64px;height:64px"') + '</div><h2 style="margin:10px 0 2px;font-size:22px">Imagination Studio</h2><div class="hint" style="font-size:13px">Logos · Ads · Merch — one creative workspace</div><div style="margin-top:18px;font-size:13px">Created by <b>Chris Chapman</b></div><div class="hint" style="font-size:13px">Powered by your Imagination</div></div>' });
};
MS.showTips = function(){
  MS.modal({ title:'Good to know', med:true, footer:false, body:`<div class="hint" style="font-size:12.5px;line-height:1.7">
  <b>Drawing tools lock the canvas.</b> While Rectangle / Ellipse / Pen / Pencil / Text is active you can only draw — clicks never grab existing things. Press <kbd>V</kbd> (Move) to select again.<br>
  <b>Handles stay on screen.</b> Even when an object is bigger than the view, its grab points stay visible at the edge of the screen.<br>
  <b>Wheel over the selected object</b> resizes it; <kbd>Shift</kbd>+wheel rotates it; <kbd>Ctrl</kbd>+wheel (or wheel on empty space) zooms at the cursor.<br>
  <b>Rulers:</b> drag from a ruler to pull out a guide; drag it back to remove.<br>
  <b>Copies:</b> Object ▸ Copy ▸ Mirror / Kaleidoscope turns any selection into symmetric art.<br>
  <b>Export:</b> PNG, JPG, WebP, SVG (text → outlines for games like Gran Turismo), PDF, TIFF, BMP, ICO — with file-size control and your own file name.</div>` });
};

/* ============================ COMMANDS (palette) ============================ */
function registerCommands(){
  MS.menus.forEach(m=>{ (typeof m.items === 'function' ? m.items() : m.items).forEach(it=>{ if(it && typeof it === 'object' && it.action && it.label) MS.addCommand({ title:it.label.replace(/ ▸ /g, ' – '), cat:m.label, key:it.key, run:it.action, kw:'' }); else if(it && typeof it === 'object' && it.sub) (typeof it.sub === 'function' ? it.sub() : it.sub).forEach(s=>{ if(s.action) MS.addCommand({ title:it.label + ' – ' + s.label, cat:m.label, run:s.action }); }); }); });
  Object.values(MS.tools.defs).forEach(t=> MS.addCommand({ title:'Tool: ' + t.label, cat:'Tools', key:t.key, run:()=> MS.tools.set(t.id) }));
  [['Logo','logo'],['Ad','ad'],['Merch','merch']].forEach(([l, k])=> MS.addCommand({ title:'Workspace: ' + l, cat:'Window', run:()=> MS.setWorkspace(k) }));
  ['svg','png','jpg','webp','pdf','tiff','bmp','ico','gif'].forEach(f=> MS.addCommand({ title:'Export as ' + f.toUpperCase(), cat:'File', kw:'save download', run:()=> MS.openExport(f) }));
}

/* ============================ KEYBOARD ============================ */
function wireKeys(){
  const keyMap = {}; Object.values(MS.tools.defs).forEach(t=>{ if(t.key) keyMap[t.key.toLowerCase()] = t.id; });
  document.addEventListener('keydown', e=>{
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    const inField = ['INPUT','SELECT','TEXTAREA'].includes(tag) || (document.activeElement && document.activeElement.isContentEditable);
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if(e.code === 'Space' && !inField && !S.space){ S.space = true; $('#vp').classList.add('pan-mode'); e.preventDefault(); return; }
    if(mod && k === 'k'){ e.preventDefault(); MS.openPalette(); return; }
    if(mod && k === 'z' && !e.shiftKey && !inField){ e.preventDefault(); MS.undo(); return; }
    if(mod && ((k === 'z' && e.shiftKey) || k === 'y') && !inField){ e.preventDefault(); MS.redo(); return; }
    if(mod && k === 's'){ e.preventDefault(); e.shiftKey ? MS.saveProjectAs() : MS.saveProject(); return; }
    if(mod && k === 'e'){ e.preventDefault(); e.shiftKey ? (MS.quickExport && MS.quickExport()) : MS.openExport(); return; }
    if(mod && k === 'n'){ e.preventDefault(); MS.openNewDialog(); return; }
    if(mod && k === 'o' && !e.shiftKey){ e.preventDefault(); $('#projectLoadInput').click(); return; }
    if(mod && e.shiftKey && k === 'f'){ e.preventDefault(); MS.openFontBrowser(); return; }
    if(mod && e.shiftKey && k === 'i'){ e.preventDefault(); $('#fileImportInput').click(); return; }
    if(inField) return;
    const cur = MS.tools.current();
    if(cur && cur.onKey && cur.onKey(e)){ e.preventDefault(); return; }
    if(e.key === 'Escape'){ MS.closeMenus(); if(S.tool !== 'move'){ MS.tools.set('move'); } else MS.ops.deselect(); return; }
    if(e.key === '?'){ e.preventDefault(); MS.showShortcuts(); return; }
    if(mod && k === 'a'){ e.preventDefault(); MS.ops.selectAll(); return; }
    if(mod && k === 'c'){ e.preventDefault(); MS.ops.copy(); return; }
    if(mod && k === 'x'){ e.preventDefault(); MS.ops.cut(); return; }
    if(mod && k === 'v'){ e.preventDefault(); e.shiftKey ? MS.ops.paste(true) : clipboardPaste(); return; }
    if(mod && k === 'd'){ e.preventDefault(); MS.ops.duplicate(); return; }
    if(mod && k === 'g'){ e.preventDefault(); e.shiftKey ? MS.ops.ungroup() : MS.ops.group(); return; }
    if(mod && k === '0'){ e.preventDefault(); MS.view.fit(); return; }
    if(mod && k === '1'){ e.preventDefault(); MS.view.actual(); return; }
    if(mod && k === '2'){ e.preventDefault(); MS.view.selection(); return; }
    if(mod && (k === '=' || k === '+')){ e.preventDefault(); MS.view.zoomIn(); return; }
    if(mod && k === '-'){ e.preventDefault(); MS.view.zoomOut(); return; }
    if(mod && k === "'"){ e.preventDefault(); MS.setPref('grid', !MS.prefs.grid); MS.syncDocPanel(); return; }
    if(e.key === ']' || e.key === '['){ e.preventDefault(); MS.ops.order(e.key === ']' ? (mod ? 'front' : 'fwd') : (mod ? 'back' : 'bwd')); return; }
    if(e.key === 'Delete' || e.key === 'Backspace'){ if(S.tool === 'pen') return; e.preventDefault(); MS.ops.del(); return; }
    if(!mod && !e.altKey && keyMap[k] && !['Enter'].includes(e.key)){ if(k === 'x' && false) return; MS.tools.set(keyMap[k]); return; }
    if(k === 'x' && !mod){ MS.tools.swapColors(); return; }
    const step = e.shiftKey ? 10 : 1;
    if(e.key === 'ArrowLeft'){ e.preventDefault(); MS.ops.nudge(-step, 0); } else if(e.key === 'ArrowRight'){ e.preventDefault(); MS.ops.nudge(step, 0); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); MS.ops.nudge(0, -step); } else if(e.key === 'ArrowDown'){ e.preventDefault(); MS.ops.nudge(0, step); }
  });
  document.addEventListener('keyup', e=>{ if(e.code === 'Space'){ S.space = false; $('#vp').classList.remove('pan-mode'); } });
  window.addEventListener('blur', ()=>{ S.space = false; $('#vp').classList.remove('pan-mode'); });
  // right-click menu on canvas
  $('#vp').addEventListener('contextmenu', e=>{ e.preventDefault(); if(S.tool === 'move'){ const p = cv().findTarget(e); if(p && !cv().getActiveObjects().includes(p)) MS.ops.select([p]); MS.contextMenu(e.clientX, e.clientY); } });
  // paste images from the clipboard
  document.addEventListener('paste', e=>{
    const tag = (document.activeElement && document.activeElement.tagName) || ''; if(['INPUT','TEXTAREA'].includes(tag)) return;
    const files = Array.from(e.clipboardData && e.clipboardData.files || []).filter(f=>f.type.startsWith('image/'));
    if(files.length){ e.preventDefault(); MS.importFiles(files); }
  });
  // project file input
  $('#projectLoadInput').addEventListener('change', e=>{ const f = e.target.files[0]; e.target.value = ''; if(f){ $$('.modal-overlay').forEach(m=>m.remove()); const hm = $('#home'); if(hm) hm.remove(); MS.openProjectFile(f); } });
}


/* ============================ TITLE PAGE ============================ */
// Drop your own artwork in the "title" folder, named title-page.png / .jpg / .webp / .svg / .gif, and it is shown full-screen at start.
function probeTitle(){
  const names = ['png','jpg','jpeg','webp','svg','gif'].map(e=> 'title/title-page.' + e);
  return new Promise(res=>{
    let i = 0; const next = ()=>{ if(i >= names.length) return res(null); const im = new Image(), src = names[i++]; im.onload = ()=> res(src); im.onerror = next; im.src = src; };
    next();
  });
}
async function showSplash(){
  const art = await probeTitle();
  return new Promise(res=>{
    const ov = document.createElement('div'); ov.id = 'splash';
    ov.innerHTML = (art ? '<img class="sp-art" src="' + art + '" alt="Imagination Studio">' : '<div class="sp-default"><div class="sp-mark">' + MS.icon('logo') + '</div><h1>Imagination Studio</h1><p>Logos · Ads · Merch — one creative workspace</p></div>') +
      '<div class="sp-ver">Version ' + (window.IMAGINATION_VERSION || '') + '</div><button class="btn primary sp-go" id="spGo">Start creating</button><div class="sp-hint">Press Enter or click anywhere</div><div class="sp-credit">Created by Chris Chapman  ·  Powered by your Imagination</div>';
    document.body.appendChild(ov);
    const go = ()=>{ document.removeEventListener('keydown', key, true); ov.classList.add('out'); setTimeout(()=> ov.remove(), 400); res(); };
    const key = e=>{ if(e.key === 'Enter' || e.key === ' ' || e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); go(); } };
    document.addEventListener('keydown', key, true); ov.addEventListener('click', go);
  });
}

/* ============================ STARTUP ============================ */
async function recover(){
  const saved = await MS.readAutosave();
  if(!saved || !saved.payload || !(saved.payload.canvasJSON.objects || []).length) return false;
  const when = new Date(saved.savedAt).toLocaleString();
  return new Promise(res=>{
    const m = MS.modal({ title:'Restore your last session?', sticky:true, body:`<div>We found unsaved work from <b>${when}</b>${saved.payload.meta && saved.payload.meta.name ? ' ("' + MS.esc(saved.payload.meta.name) + '")' : ''} — the app may have closed unexpectedly.</div>`,
      buttons:[{ label:'Start fresh', action:()=>{ MS.clearAutosave(); res(false); } }, { label:'Restore it', primary:true, icon:'history', action:()=>{ MS.loadProject(saved.payload, ()=>{ toast('Session restored.'); res(true); }); } }], onClose:()=> res(false) });
  });
}
document.addEventListener('DOMContentLoaded', async ()=>{
  MS.initUI(); MS.initCore(); MS.tools.init(); MS.initPanels();
  MS.menus = menus(); MS.buildMenubar(MS.menus.map(m=>({ label:m.label, items:()=> menus().find(x=>x.label === m.label).items })));
  $$('#wsSwitch button').forEach(b=> b.addEventListener('click', ()=> MS.setWorkspace(b.dataset.ws)));
  const fsBtn = $('#btnFull'), fsOn = ()=> !!document.fullscreenElement;
  const fsSync = ()=>{ fsBtn.querySelector('span').textContent = fsOn() ? 'Exit full screen' : 'Full screen'; fsBtn.classList.toggle('on', fsOn()); setTimeout(()=> MS.emit('resize'), 120); };
  MS.toggleFullscreen = ()=>{ try{ if(fsOn()) document.exitFullscreen(); else document.documentElement.requestFullscreen(); }catch(e){ toast('This browser would not go full screen — try F11.', 3500); } };
  fsBtn.addEventListener('click', MS.toggleFullscreen); document.addEventListener('fullscreenchange', fsSync);
  MS.addCommand && MS.addCommand({ title:'Full screen (toggle)', cat:'Window', run:()=> MS.toggleFullscreen() });
  $('#btnSaveProject').addEventListener('click', MS.saveProject); $('#btnSaveAs').addEventListener('click', ()=> MS.saveProjectAs());
  $('#btnExport').addEventListener('click', ()=> MS.openExport());
  $('#btnPreview').addEventListener('click', ()=> MS.preview && MS.preview());
  wireKeys(); registerCommands();
  ['initTrace','initCompat','initGroups','initAnim','initHelp','initFx','initSymmetry','initExport','initMerch','initAds','initClaude'].forEach(f=>{ try{ MS[f] && MS[f](); }catch(e){ console.error(f, e); } });
  MS.setWorkspace(MS.store.get('ws', 'logo'), true);
  MS.newDoc({ name:'Untitled design', kind:document.body.dataset.ws, mode:'print', wIn:12, hIn:12 });
  MS.setGarment('#ffffff', true);
  await showSplash();
  MS.openNewDialog(true);
});
})();

