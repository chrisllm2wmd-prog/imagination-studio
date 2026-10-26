/* Merch Studio - Merch workspace: live garment/product mockups driven by the design canvas. */
(function(){
'use strict';
const MS = window.MS, S = MS.S;
const { $, $$, clamp, toast } = MS;
const cv = ()=> MS.canvas;
const MK_UNITS_PER_IN = 29;
const MK_PLACEMENTS = {
  chest:  { label:'Center chest',    widthIn:10, cx:500, top:215 },
  pocket: { label:'Left chest',      widthIn:4,  cx:645, top:250 },
  large:  { label:'Oversized front', widthIn:15, cx:500, top:190 },
  low:    { label:'Low center',      widthIn:8,  cx:500, top:470 },
  sleeveL:{ label:'Left sleeve',     widthIn:3,  sleeve:'L' },
  sleeveR:{ label:'Right sleeve',    widthIn:3,  sleeve:'R' },
};
const mk = { open:false, garment:'tee', view:'front', place:'chest', widthIn:10, dx:0, dy:0, img:null, timer:null, busy:false };
let mkCtx = null;

function mkStrokeLine(ctx, pts, w, style){
  ctx.strokeStyle = style; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); ctx.lineTo(pts[2], pts[3]); ctx.stroke();
}
const MK_GARMENTS = {
  tee: {
    label: 'T-shirt', topOffset: 0, backLift: 30,
    armpits: [[792,345],[208,345]],
    sleeve: { R:{ cx:878, cy:262, rot:-0.66 }, L:{ cx:122, cy:262, rot:0.66 } },
    path(view){
      const p = new Path2D(), back = view === 'back';
      p.moveTo(375, 62);
      p.quadraticCurveTo(500, back ? 112 : 205, 625, 62);            // neckline
      p.lineTo(790, 105); p.lineTo(965, 292); p.lineTo(838, 392);   // right shoulder + sleeve
      p.lineTo(792, 335); p.lineTo(802, 1040);                      // right side
      p.quadraticCurveTo(500, 1064, 198, 1040);                     // hem
      p.lineTo(208, 335); p.lineTo(162, 392); p.lineTo(35, 292);    // left side + sleeve
      p.lineTo(210, 105); p.closePath();
      return p;
    },
    detail(ctx, view){
      const back = view === 'back';
      if(!back){   // inside of the back neck, visible through the front scoop
        ctx.fillStyle = 'rgba(0,0,0,.28)';
        ctx.beginPath(); ctx.moveTo(375,62); ctx.quadraticCurveTo(500,118,625,62); ctx.quadraticCurveTo(500,205,375,62); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 26;   // ribbed collar
      ctx.beginPath(); ctx.moveTo(375,62); ctx.quadraticCurveTo(500, back?112:205, 625,62); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(375,84); ctx.quadraticCurveTo(500, back?134:228, 625,84); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 3;    // armhole seams
      [[790,108,838,235,792,335],[210,108,162,235,208,335]].forEach(([x0,y0,cx,cy,x1,y1])=>{
        ctx.beginPath(); ctx.moveTo(x0,y0); ctx.quadraticCurveTo(cx,cy,x1,y1); ctx.stroke();
      });
      ctx.lineWidth = 2; ctx.setLineDash([7,6]);                  // sleeve + hem stitching
      ctx.beginPath(); ctx.moveTo(838,392); ctx.lineTo(965,292); ctx.moveTo(162,392); ctx.lineTo(35,292);
      ctx.moveTo(214,1012); ctx.quadraticCurveTo(500,1036,790,1012); ctx.stroke();
      ctx.setLineDash([]);
    },
  },
  hoodie: {
    label: 'Hoodie', topOffset: 55, backLift: 0,
    armpits: [[805,640],[195,640]],
    sleeve: { R:{ cx:868, cy:470, rot:-0.15 }, L:{ cx:132, cy:470, rot:0.15 } },
    path(view){
      const p = new Path2D(), back = view === 'back';
      p.moveTo(355,125);
      p.quadraticCurveTo(500, back ? 150 : 215, 645,125);
      p.lineTo(785,158); p.lineTo(928,570); p.lineTo(955,860); p.lineTo(832,880);   // right shoulder + long sleeve
      p.lineTo(805,640); p.lineTo(795,1010);
      p.quadraticCurveTo(500,1038,205,1010);
      p.lineTo(195,640); p.lineTo(168,880); p.lineTo(45,860); p.lineTo(72,570);     // left sleeve
      p.lineTo(215,158); p.closePath();
      p.moveTo(338,150); p.bezierCurveTo(296,-30, 704,-30, 662,150);                 // hood rising behind the neck
      p.quadraticCurveTo(500, back ? 160 : 225, 338,150); p.closePath();
      return p;
    },
    detail(ctx, view){
      const back = view === 'back';
      // ribbed cuffs and hem: a darker band hugging each edge
      ctx.lineCap = 'butt';
      mkStrokeLine(ctx, [832,880,955,860], 84, 'rgba(0,0,0,.14)');
      mkStrokeLine(ctx, [168,880,45,860], 84, 'rgba(0,0,0,.14)');
      ctx.strokeStyle = 'rgba(0,0,0,.14)'; ctx.lineWidth = 96;
      ctx.beginPath(); ctx.moveTo(200,1012); ctx.quadraticCurveTo(500,1040,800,1012); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(205,962); ctx.quadraticCurveTo(500,990,795,962); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(840,815); ctx.lineTo(950,795); ctx.moveTo(160,815); ctx.lineTo(50,795); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.18)';                                           // armhole seams
      [[785,162,860,400,805,640],[215,162,140,400,195,640]].forEach(([x0,y0,cx,cy,x1,y1])=>{
        ctx.beginPath(); ctx.moveTo(x0,y0); ctx.quadraticCurveTo(cx,cy,x1,y1); ctx.stroke();
      });
      if(!back){
        ctx.fillStyle = 'rgba(0,0,0,.5)';                                            // dark hood opening
        ctx.beginPath(); ctx.moveTo(372,130); ctx.quadraticCurveTo(500,222,628,130);
        ctx.bezierCurveTo(650,30,350,30,372,130); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(372,130); ctx.quadraticCurveTo(500,222,628,130); ctx.stroke();
        // kangaroo pocket
        ctx.fillStyle = 'rgba(0,0,0,.07)';
        ctx.beginPath(); ctx.moveTo(300,770); ctx.quadraticCurveTo(500,752,700,770); ctx.lineTo(742,975); ctx.lineTo(258,975); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath(); ctx.moveTo(300,770); ctx.lineTo(258,975); ctx.moveTo(700,770); ctx.lineTo(742,975); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(306,778); ctx.quadraticCurveTo(500,760,694,778); ctx.stroke();
        // drawstrings
        ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(235,235,235,.85)'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(452,205); ctx.quadraticCurveTo(440,320,448,430);
        ctx.moveTo(548,205); ctx.quadraticCurveTo(562,320,554,430); ctx.stroke();
        ctx.lineWidth = 12; mkStrokeLine(ctx, [448,430,447,452], 12, 'rgba(235,235,235,.95)');
        mkStrokeLine(ctx, [554,430,555,452], 12, 'rgba(235,235,235,.95)');
      } else {
        // hood lying flat down the back, with its centre seam
        ctx.fillStyle = 'rgba(0,0,0,.08)';
        ctx.beginPath(); ctx.moveTo(345,135); ctx.bezierCurveTo(330,-10,670,-10,655,135);
        ctx.quadraticCurveTo(650,345,500,385); ctx.quadraticCurveTo(350,345,345,135); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 3; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(500,18); ctx.lineTo(500,385); ctx.stroke();
      }
    },
  },
};

// light/shadow over the fabric; drawn once under the print at full strength and again over it
// at lower strength so the print follows the folds instead of looking pasted on
function mkShade(ctx, s, armpits){
  let g = ctx.createLinearGradient(0,0,1000,0);
  g.addColorStop(0, `rgba(0,0,0,${.34*s})`); g.addColorStop(.16, `rgba(0,0,0,${.12*s})`);
  g.addColorStop(.3, 'rgba(0,0,0,0)'); g.addColorStop(.7, 'rgba(0,0,0,0)');
  g.addColorStop(.84, `rgba(0,0,0,${.12*s})`); g.addColorStop(1, `rgba(0,0,0,${.34*s})`);
  ctx.fillStyle = g; ctx.fillRect(0,0,1000,1100);
  g = ctx.createRadialGradient(500,330,20,500,380,560);
  g.addColorStop(0, `rgba(255,255,255,${.16*s})`); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,1000,1100);
  g = ctx.createLinearGradient(0,700,0,1060);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${.2*s})`);
  ctx.fillStyle = g; ctx.fillRect(0,700,1000,400);
  armpits.forEach(([x,y])=>{                                  // armpit shadows
    const r = ctx.createRadialGradient(x,y,4,x,y,110);
    r.addColorStop(0, `rgba(0,0,0,${.24*s})`); r.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = r; ctx.fillRect(x-160,y-160,320,320);
  });
  ctx.lineCap = 'round'; ctx.lineWidth = 26;                 // soft vertical folds + a hem wrinkle
  [[300,380,260,700,300,980,1],[700,380,740,700,700,980,1]]
    .forEach(([x0,y0,cx,cy,x1,y1,light])=>{
      ctx.strokeStyle = light > 0 ? `rgba(255,255,255,${.05*s})` : `rgba(0,0,0,${.06*s})`;
      ctx.beginPath(); ctx.moveTo(x0,y0); ctx.quadraticCurveTo(cx,cy,x1,y1); ctx.stroke();
    });
}

/* ---- extra products (simple silhouettes) ---- */
MK_GARMENTS.tote = { label:'Tote bag', topOffset:0, backLift:0, armpits:[], upi:42, placements:{ center:{ label:'Centre', widthIn:9, cx:500, top:420 }, high:{ label:'Upper', widthIn:8, cx:500, top:330 }, low:{ label:'Low', widthIn:8, cx:500, top:560 } },
  path(){ const p = new Path2D(); p.rect(170, 330, 660, 700); const h = new Path2D(); h.moveTo(330, 332); h.bezierCurveTo(330, 90, 670, 90, 670, 332); h.lineTo(630, 332); h.bezierCurveTo(630, 150, 370, 150, 370, 332); h.closePath(); p.addPath(h); return p; },
  detail(ctx){ ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 3; ctx.strokeRect(190, 350, 620, 660); ctx.setLineDash([8, 6]); ctx.strokeRect(200, 360, 600, 640); ctx.setLineDash([]); } };
MK_GARMENTS.mug = { label:'Mug', topOffset:0, backLift:0, armpits:[], upi:60, placements:{ wrap:{ label:'Front panel', widthIn:3.5, cx:430, top:360 }, wide:{ label:'Wide panel', widthIn:4.2, cx:430, top:380 } },
  path(){ const p = new Path2D(); p.moveTo(250, 250); p.lineTo(250, 880); p.quadraticCurveTo(250, 960, 330, 960); p.lineTo(560, 960); p.quadraticCurveTo(640, 960, 640, 880); p.lineTo(640, 250); p.closePath();
    const h = new Path2D(); h.moveTo(640, 340); h.bezierCurveTo(820, 330, 860, 560, 640, 700); h.lineTo(640, 640); h.bezierCurveTo(760, 560, 740, 420, 640, 400); h.closePath(); p.addPath(h); return p; },
  detail(ctx){ ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(270, 250, 40, 700); ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fillRect(590, 250, 50, 700); } };
MK_GARMENTS.poster = { label:'Framed poster', topOffset:0, backLift:0, armpits:[], upi:30, placements:{ full:{ label:'Fill frame', widthIn:18, cx:500, top:210 }, inset:{ label:'Inset', widthIn:14, cx:500, top:290 } },
  path(){ const p = new Path2D(); p.rect(130, 150, 740, 900); return p; },
  detail(ctx){ ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 30; ctx.strokeRect(145, 165, 710, 870); } };
MK_GARMENTS.cap = { label:'Cap (front)', topOffset:0, backLift:0, armpits:[], upi:60, placements:{ front:{ label:'Front panel', widthIn:4.5, cx:500, top:330 } },
  path(){ const p = new Path2D(); p.moveTo(160, 640); p.bezierCurveTo(140, 250, 860, 250, 840, 640); p.lineTo(160, 640); p.closePath(); const b = new Path2D(); b.moveTo(120, 650); b.bezierCurveTo(300, 780, 700, 780, 880, 650); b.bezierCurveTo(700, 700, 300, 700, 120, 650); b.closePath(); p.addPath(b); return p; },
  detail(ctx){ ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(500, 280); ctx.lineTo(500, 650); ctx.stroke(); } };
MK_GARMENTS.sticker = { label:'Die-cut sticker', topOffset:0, backLift:0, armpits:[], upi:80, placements:{ full:{ label:'Whole sticker', widthIn:5, cx:500, top:300 } },
  path(){ const p = new Path2D(); const x = 250, y = 300, w = 500, h = 500, r = 70; p.moveTo(x + r, y); p.arcTo(x + w, y, x + w, y + h, r); p.arcTo(x + w, y + h, x, y + h, r); p.arcTo(x, y + h, x, y, r); p.arcTo(x, y, x + w, y, r); p.closePath(); return p; }, detail(){} };

function pl(){ const gm = MK_GARMENTS[mk.garment]; return gm.placements || MK_PLACEMENTS; }
function drawMockup(){
  if(!mk.open || !mkCtx) return;
  const ctx = mkCtx, W = 1000, H = 1100;
  const color = MS.garmentValue(), clear = !color;
  ctx.clearRect(0, 0, W, H);
  const lum = color ? (()=>{ const c = MS.hexToRgb(color); return (.299 * c.r + .587 * c.g + .114 * c.b) / 255; })() : .5;
  ctx.fillStyle = lum > .6 ? '#2b2c33' : '#d9dbe1'; ctx.fillRect(0, 0, W, H);
  if(clear){ for(let y = 0; y < H; y += 40) for(let x = 0; x < W; x += 40){ ctx.fillStyle = ((x + y) / 40) % 2 ? '#3a3b45' : '#2f3039'; ctx.fillRect(x, y, 40, 40); } }
  const gm = MK_GARMENTS[mk.garment], upi = gm.upi || MK_UNITS_PER_IN, shirt = gm.path(mk.view);
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18; ctx.fillStyle = clear ? 'rgba(0,0,0,0)' : color; ctx.fill(shirt); ctx.restore();
  ctx.save(); ctx.clip(shirt);
  if(!clear){ if(gm.armpits.length) mkShade(ctx, 1, gm.armpits); gm.detail(ctx, mk.view); }
  const P = pl()[mk.place] || Object.values(pl())[0];
  if(mk.img){
    const pw = mk.widthIn * upi, ph = pw * (S.doc.hPx / S.doc.wPx);
    if(P.sleeve){ const side = (P.sleeve === 'L') === (mk.view === 'front') ? 'R' : 'L', s = gm.sleeve[side]; ctx.save(); ctx.translate(s.cx + mk.dx, s.cy + mk.dy); ctx.rotate(s.rot); ctx.drawImage(mk.img, -pw / 2, -ph / 2, pw, ph); ctx.restore(); }
    else { const top = P.top + gm.topOffset + mk.dy - (mk.view === 'back' && mk.place !== 'low' ? gm.backLift : 0); ctx.drawImage(mk.img, P.cx + mk.dx - pw / 2, top, pw, ph); }
  }
  if(!clear && gm.armpits.length) mkShade(ctx, .55, gm.armpits);
  ctx.restore();
  if(clear){ ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3; ctx.setLineDash([14, 10]); ctx.stroke(shirt); ctx.setLineDash([]); }
  const pw = mk.widthIn, ph = pw * (S.doc.hPx / S.doc.wPx);
  $('#mkSizeLabel').textContent = pw.toFixed(1) + '"';
  $('#mkNote').textContent = 'Print ≈ ' + pw.toFixed(1) + ' × ' + ph.toFixed(1) + ' in — the whole artboard is placed, so empty margins count.';
}
function capture(){
  if(!mk.open || !cv() || !S.ready) return;
  mk.busy = true;
  try{
    const mult = Math.min(1, 900 / Math.max(S.doc.wPx, S.doc.hPx));
    const url = MS.renderArtboard({ multiplier:mult, background:null }).toDataURL('image/png');
    const img = new Image(); img.onload = ()=>{ mk.img = img; drawMockup(); }; img.src = url;
  } finally { mk.busy = false; }
}
function schedule(){ if(!mk.open || mk.busy) return; clearTimeout(mk.timer); mk.timer = setTimeout(capture, 140); }

function build(){
  const page = $('#page-merch');
  page.innerHTML = `<div class="sect"><div class="sect-b" style="padding-top:10px">
    <div id="mkStage"><canvas id="mkCanvas" width="1000" height="1100"></canvas></div>
    <div class="r"><label style="width:62px">Product</label><select id="mkGarment" class="grow">${Object.entries(MK_GARMENTS).map(([k, v])=>`<option value="${k}">${v.label}</option>`).join('')}</select></div>
    <div class="r two"><div class="r"><label style="width:40px">View</label><select id="mkView" class="grow"><option value="front">Front</option><option value="back">Back</option></select></div><div class="r"><label style="width:40px">Place</label><select id="mkPlace" class="grow"></select></div></div>
    <div class="r"><label style="width:62px">Size</label><input type="range" id="mkSize" min="1" max="20" step=".25"><b id="mkSizeLabel" style="width:42px;text-align:right"></b></div>
    <div class="r"><label style="width:62px">Up / down</label><input type="range" id="mkDy" min="-250" max="400" step="1"></div>
    <div class="r"><label style="width:62px">Left / right</label><input type="range" id="mkDx" min="-300" max="300" step="1"></div>
    <div class="hint">Garment colour</div><div class="swgrid" id="mkSwatches"></div>
    <div class="tb-row fill"><button class="btn sm" id="mkFit"><i data-i="fit"></i>Set artboard to print size</button><button class="btn sm" id="mkSave"><i data-i="download"></i>Save mockup PNG</button></div>
    <div class="hint" id="mkNote"></div></div></div>`;
  window.MSI.hydrate(page);
  mkCtx = $('#mkCanvas').getContext('2d');
  const sw = $('#mkSwatches');
  const clearChip = document.createElement('div'); clearChip.className = 's none'; clearChip.title = 'Clear (see-through)'; clearChip.style.background = '#fff'; clearChip.onclick = ()=> MS.setGarment(S.doc.garment, true); sw.appendChild(clearChip);
  ['#ffffff','#000000','#0d1b2a','#1b3a4b','#7a1f2b','#2e5339','#d4a017','#e8e2d0','#9aa0a6','#c9184a','#3d3d3d','#6b4423'].forEach(c=>{ const s = document.createElement('div'); s.className = 's'; s.style.background = c; s.title = c; s.onclick = ()=> MS.setGarment(c, false); sw.appendChild(s); });
  const fillPlaces = ()=>{ $('#mkPlace').innerHTML = Object.entries(pl()).map(([k, v])=>`<option value="${k}">${v.label}</option>`).join(''); $('#mkPlace').value = mk.place; };
  const sync = ()=>{ $('#mkGarment').value = mk.garment; $('#mkView').value = mk.view; fillPlaces(); $('#mkSize').value = mk.widthIn; $('#mkDx').value = mk.dx; $('#mkDy').value = mk.dy; MS.syncRanges(page); };
  const choose = k=>{ mk.place = k; mk.widthIn = (pl()[k] || {}).widthIn || 10; mk.dx = 0; mk.dy = 0; sync(); };
  $('#mkGarment').onchange = e=>{ mk.garment = e.target.value; choose(Object.keys(pl())[0]); drawMockup(); };
  $('#mkView').onchange = e=>{ mk.view = e.target.value; drawMockup(); };
  $('#mkPlace').onchange = e=>{ choose(e.target.value); drawMockup(); };
  $('#mkSize').oninput = e=>{ mk.widthIn = +e.target.value; drawMockup(); }; $('#mkDx').oninput = e=>{ mk.dx = +e.target.value; drawMockup(); }; $('#mkDy').oninput = e=>{ mk.dy = +e.target.value; drawMockup(); };
  $('#mkSave').onclick = ()=> $('#mkCanvas').toBlob(b=>{ if(b) MS.saveFile(b, (S.doc.name || 'design') + '-mockup-' + mk.garment + '.png').then(m=> toast('Mockup ' + m, 6000)); }, 'image/png');
  $('#mkFit').onclick = ()=>{ const w = mk.widthIn; MS.resizeDoc(w * MS.WORKING_PPI, w * MS.WORKING_PPI * (S.doc.hPx / S.doc.wPx)); MS.view.fit(); toast('Artboard is now the print size (' + w + '" wide).'); };
  sync();
  MS.mockup = { state:mk, sync, choose, set(o){ Object.assign(mk, o); if(o.garment && !o.place) choose(Object.keys(pl())[0]); sync(); drawMockup(); } };
}
MS.on('page', p=>{ if(p === 'merch'){ mk.open = true; capture(); } else if(['design','fill','canvas','ad','claude'].includes(p)){ mk.open = false; } });
MS.on('mockup-dirty', schedule);
MS.initMerch = function(){
  build();
  MS.on('canvas', ()=>{});
  cv().on('after:render', ()=>{ if(!S.exporting) schedule(); });
};
})();
