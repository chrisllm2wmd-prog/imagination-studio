/* Merch Studio - 22 background/fill patterns (ported from the original Logo Builder). */
(function(){
'use strict';
const MS = window.MS;
const BG_PATTERNS = [
  {k:'halftone', label:'Halftone Dots'},
  {k:'stripes', label:'Diagonal Stripes'},
  {k:'hstripes', label:'Horizontal Stripes'},
  {k:'vstripes', label:'Vertical Stripes'},
  {k:'grid', label:'Grid'},
  {k:'splatter', label:'Splatter / Grunge'},
  {k:'radial', label:'Radial Burst'},
  {k:'confetti', label:'Confetti'},
  {k:'checkerboard', label:'Checkerboard'},
  {k:'polka', label:'Polka Dots'},
  {k:'herringbone', label:'Herringbone'},
  {k:'crosshatch', label:'Crosshatch'},
  {k:'chevron', label:'Chevron / Zigzag'},
  {k:'waves', label:'Waves'},
  {k:'brick', label:'Brick'},
  {k:'hex', label:'Hexagons'},
  {k:'camo', label:'Camo'},
  {k:'stars', label:'Stars'},
  {k:'argyle', label:'Diamonds / Argyle'},
  {k:'noise', label:'Noise / Grain'},
  {k:'cross', label:'Cross / Plus'},
  {k:'rings', label:'Concentric Rings'},
];

function bgPatternIconSvg(k){
  const common = 'width="100%" height="100%" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"';
  if(k==='halftone') return `<svg ${common}><rect width="40" height="40" fill="#0d1b2a"/>${
    [4,12,20,28,36].map(y=>[4,12,20,28,36].map(x=>`<circle cx="${x}" cy="${y}" r="${1+((x+y)%9)/4}" fill="#fff"/>`).join('')).join('')
  }</svg>`;
  if(k==='stripes') return `<svg ${common}><rect width="40" height="40" fill="#0d1b2a"/><g stroke="#fff" stroke-width="5">${
    [-10,0,10,20,30,40,50].map(x=>`<line x1="${x}" y1="40" x2="${x+40}" y2="0"/>`).join('')
  }</g></svg>`;
  if(k==='grid') return `<svg ${common}><rect width="40" height="40" fill="#0d1b2a"/><g stroke="#fff" stroke-width="1.5">${
    [0,8,16,24,32,40].map(v=>`<line x1="${v}" y1="0" x2="${v}" y2="40"/><line x1="0" y1="${v}" x2="40" y2="${v}"/>`).join('')
  }</g></svg>`;
  if(k==='splatter') return `<svg ${common}><rect width="40" height="40" fill="#0d1b2a"/>${
    [[8,10,4],[22,8,3],[30,20,5],[12,26,3.5],[26,32,2.5],[6,34,2]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/>`).join('')
  }</svg>`;
  if(k==='radial') return `<svg ${common}><rect width="40" height="40" fill="#0d1b2a"/>${
    Array.from({length:16}).map((_,i)=>{const a=i*Math.PI/8; return `<line x1="20" y1="20" x2="${20+22*Math.cos(a)}" y2="${20+22*Math.sin(a)}" stroke="#fff" stroke-width="2"/>`;}).join('')
  }</svg>`;
  if(k==='confetti') return `<svg ${common}><rect width="40" height="40" fill="#0d1b2a"/>${
    [[6,6],[14,20],[24,10],[32,26],[8,32],[20,34],[34,6],[28,18]].map(([x,y],i)=>`<rect x="${x}" y="${y}" width="3" height="3" fill="#fff" transform="rotate(${i*37} ${x+1.5} ${y+1.5})"/>`).join('')
  }</svg>`;
  if(k==='hstripes') return `<svg ${common}><rect width="40" height="40" fill="#0d1b2a"/><g fill="#fff">${
    [2,12,22,32].map(y=>`<rect x="0" y="${y}" width="40" height="5"/>`).join('')
  }</g></svg>`;
  if(k==='vstripes') return `<svg ${common}><rect width="40" height="40" fill="#0d1b2a"/><g fill="#fff">${
    [2,12,22,32].map(x=>`<rect x="${x}" y="0" width="5" height="40"/>`).join('')
  }</g></svg>`;
  if(k==='checkerboard') return `<svg ${common}><rect width="40" height="40" fill="#0d1b2a"/><g fill="#fff">${
    [0,1,2,3].map(r=>[0,1,2,3].map(c=>(r+c)%2===0?`<rect x="${c*10}" y="${r*10}" width="10" height="10"/>`:'').join('')).join('')
  }</g></svg>`;
  if(k==='polka') return `<svg ${common}><rect width="40" height="40" fill="#0d1b2a"/>${
    [8,24].map(y=>[8,24].map(x=>`<circle cx="${x}" cy="${y}" r="5" fill="#fff"/>`).join('')).join('')
  }${[16,32].map(y=>[16].map(x=>`<circle cx="${x}" cy="${y}" r="5" fill="#fff"/>`).join('')).join('')}</svg>`;
  if(k==='herringbone') return `<svg ${common}><rect width="40" height="40" fill="#0d1b2a"/><g stroke="#fff" stroke-width="3">${
    [0,10,20,30].map(o=>`<path d="M${o} 0 L${o+10} 10 M${o+10} 0 L${o} 10 M${o} 20 L${o+10} 30 M${o+10} 20 L${o} 30" transform="translate(0,0)"/>`).join('')
  }</g></svg>`;
  if(k==='crosshatch') return `<svg ${common}><rect width="40" height="40" fill="#0d1b2a"/><g stroke="#fff" stroke-width="1.5">${
    [-10,0,10,20,30,40,50].map(x=>`<line x1="${x}" y1="40" x2="${x+40}" y2="0"/>`).join('')
  }${[-10,0,10,20,30,40,50].map(x=>`<line x1="${x}" y1="0" x2="${x+40}" y2="40"/>`).join('')}</g></svg>`;
  if(k==='chevron') return `<svg ${common}><rect width="40" height="40" fill="#0d1b2a"/><g stroke="#fff" stroke-width="3" fill="none">${
    [-8,4,16,28].map(y=>`<path d="M0 ${y+8} L10 ${y} L20 ${y+8} L30 ${y} L40 ${y+8}"/>`).join('')
  }</g></svg>`;
  if(k==='waves') return `<svg ${common}><rect width="40" height="40" fill="#0d1b2a"/><g stroke="#fff" stroke-width="2.5" fill="none">${
    [4,14,24,34].map(y=>`<path d="M0 ${y} Q5 ${y-6} 10 ${y} T20 ${y} T30 ${y} T40 ${y}"/>`).join('')
  }</g></svg>`;
  if(k==='brick') return `<svg ${common}><rect width="40" height="40" fill="#0d1b2a"/><g stroke="#fff" stroke-width="1.5" fill="none">${
    [0,10,20,30].map((y,i)=>`<line x1="0" y1="${y}" x2="40" y2="${y}"/>` + (i%2===0
      ? [0,13.3,26.6].map(x=>`<line x1="${x}" y1="${y}" x2="${x}" y2="${y+10}"/>`).join('')
      : [6.6,20].map(x=>`<line x1="${x}" y1="${y}" x2="${x}" y2="${y+10}"/>`).join(''))).join('')
  }</g></svg>`;
  if(k==='hex') return `<svg ${common}><rect width="40" height="40" fill="#0d1b2a"/><g stroke="#fff" stroke-width="1.5" fill="none">${
    [[8,7],[24,7],[16,20],[32,20],[8,33],[24,33]].map(([cx,cy])=>{
      const r=8, pts=Array.from({length:6}).map((_,i)=>{const a=Math.PI/6+i*Math.PI/3; return `${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`;}).join(' ');
      return `<polygon points="${pts}"/>`;
    }).join('')
  }</g></svg>`;
  if(k==='camo') return `<svg ${common}><rect width="40" height="40" fill="#0d1b2a"/>${
    [[6,8,'M6 8 Q0 4 8 2 Q16 0 14 8 Q20 14 10 16 Q2 16 6 8Z'],[28,10,'M28 10 Q22 6 30 4 Q38 2 36 10 Q40 16 32 18 Q24 18 28 10Z'],
     [16,28,'M16 28 Q10 24 18 22 Q26 20 24 28 Q30 34 20 36 Q12 36 16 28Z']].map(([,,d])=>`<path d="${d}" fill="#fff" opacity=".8"/>`).join('')
  }</svg>`;
  if(k==='stars') return `<svg ${common}><rect width="40" height="40" fill="#0d1b2a"/>${
    [[8,8],[28,10],[18,24],[32,32],[6,30]].map(([cx,cy])=>{
      const pts=Array.from({length:10}).map((_,i)=>{const r=i%2===0?4:1.8, a=-Math.PI/2+i*Math.PI/5; return `${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`;}).join(' ');
      return `<polygon points="${pts}" fill="#fff"/>`;
    }).join('')
  }</svg>`;
  if(k==='argyle') return `<svg ${common}><rect width="40" height="40" fill="#0d1b2a"/><g stroke="#fff" stroke-width="1.5" fill="none">${
    [0,20].map(oy=>[0,20].map(ox=>`<polygon points="${ox+10},${oy} ${ox+20},${oy+10} ${ox+10},${oy+20} ${ox},${oy+10}"/>`).join('')).join('')
  }</g></svg>`;
  if(k==='noise') return `<svg ${common}><rect width="40" height="40" fill="#0d1b2a"/>${
    Array.from({length:60}).map((_,i)=>{const x=(i*7)%40, y=(i*13)%40; return `<rect x="${x}" y="${y}" width="1.5" height="1.5" fill="#fff" opacity="${0.3+((i*3)%7)/10}"/>`;}).join('')
  }</svg>`;
  if(k==='cross') return `<svg ${common}><rect width="40" height="40" fill="#0d1b2a"/><g fill="#fff">${
    [[6,6],[22,6],[6,22],[22,22]].map(([x,y])=>`<path d="M${x+4} ${y} h4 v4 h4 v4 h-4 v4 h-4 v-4 h-4 v-4 h4 Z"/>`).join('')
  }</g></svg>`;
  if(k==='rings') return `<svg ${common}><rect width="40" height="40" fill="#0d1b2a"/><g stroke="#fff" stroke-width="2" fill="none">${
    [4,9,14,19].map(r=>`<circle cx="20" cy="20" r="${r}"/>`).join('')
  }</g></svg>`;
  return '';
}
function renderPatternCanvas(kind, colorA, colorB, pw, ph){
  const off = document.createElement('canvas');
  off.width = Math.max(1,Math.round(pw)); off.height = Math.max(1,Math.round(ph));
  const ctx = off.getContext('2d');
  // a colour may be a plain string, or {fade:{colors,angle}} to paint it as a multi-colour fade
  const mkStyle = s=>{
    if(!s || typeof s==='string') return s;
    const {colors, angle} = s.fade, rad = angle*Math.PI/180, w = off.width, h = off.height, n = colors.length;
    const g = ctx.createLinearGradient(w/2-Math.cos(rad)*w/2, h/2-Math.sin(rad)*h/2, w/2+Math.cos(rad)*w/2, h/2+Math.sin(rad)*h/2);
    if(s.fade.stops) s.fade.stops.forEach(st=> g.addColorStop(Math.min(1,Math.max(0,st.offset)), st.color)); else colors.forEach((c,i)=> g.addColorStop(n>1 ? i/(n-1) : 0, c));
    return g;
  };
  colorA = mkStyle(colorA); colorB = mkStyle(colorB);
  ctx.fillStyle = colorA; ctx.fillRect(0,0,off.width,off.height);
  ctx.fillStyle = colorB; ctx.strokeStyle = colorB;

  const W = off.width, H = off.height;
  if(kind === 'halftone'){
    const step = Math.max(10, Math.round(Math.min(W,H)/40));
    for(let y=step/2; y<H; y+=step){
      for(let x=step/2; x<W; x+=step){
        const r = (step*0.15) + ((x+y)%(step*2))/ (step*2) * (step*0.35);
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
      }
    }
  } else if(kind === 'stripes'){
    const step = Math.max(20, Math.round(Math.min(W,H)/20));
    ctx.lineWidth = step*0.6;
    for(let x=-H; x<W+H; x+=step*1.6){
      ctx.beginPath(); ctx.moveTo(x,H); ctx.lineTo(x+H,0); ctx.stroke();
    }
  } else if(kind === 'grid'){
    const step = Math.max(20, Math.round(Math.min(W,H)/24));
    ctx.lineWidth = Math.max(1, step*0.06);
    for(let x=0; x<=W; x+=step){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for(let y=0; y<=H; y+=step){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  } else if(kind === 'splatter'){
    let seed = 42;
    function rnd(){ seed = (seed*9301+49297)%233280; return seed/233280; }
    const blobs = Math.round((W*H)/9000);
    for(let i=0;i<blobs;i++){
      const x = rnd()*W, y = rnd()*H, r = rnd()*Math.min(W,H)*0.03 + 2;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
      if(rnd()>0.6){
        const dx=(rnd()-0.5)*r*6, dy=(rnd()-0.5)*r*6;
        ctx.beginPath(); ctx.ellipse(x+dx,y+dy, r*0.5, r*1.6, Math.atan2(dy,dx), 0, Math.PI*2); ctx.fill();
      }
    }
  } else if(kind === 'radial'){
    const cx=W/2, cy=H/2, rays=28, rOuter=Math.hypot(W,H)/1.4;
    ctx.lineWidth = Math.max(2, Math.min(W,H)*0.01);
    for(let i=0;i<rays;i++){
      const a = i*(Math.PI*2/rays);
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(a)*rOuter, cy+Math.sin(a)*rOuter); ctx.stroke();
    }
  } else if(kind === 'confetti'){
    let seed = 7;
    function rnd(){ seed = (seed*9301+49297)%233280; return seed/233280; }
    const n = Math.round((W*H)/6000);
    for(let i=0;i<n;i++){
      const x = rnd()*W, y = rnd()*H, s = rnd()*Math.min(W,H)*0.012 + 3, a = rnd()*Math.PI;
      ctx.save(); ctx.translate(x,y); ctx.rotate(a);
      if(rnd()>0.5) ctx.fillRect(-s/2,-s/2,s,s);
      else { ctx.beginPath(); ctx.arc(0,0,s/2,0,Math.PI*2); ctx.fill(); }
      ctx.restore();
    }
  } else if(kind === 'hstripes'){
    const step = Math.max(16, Math.round(H/16));
    for(let y=0; y<H; y+=step*2) ctx.fillRect(0,y,W,step);
  } else if(kind === 'vstripes'){
    const step = Math.max(16, Math.round(W/16));
    for(let x=0; x<W; x+=step*2) ctx.fillRect(x,0,step,H);
  } else if(kind === 'checkerboard'){
    const cols = 10, step = W/cols, rows = Math.ceil(H/step);
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) if((r+c)%2===0) ctx.fillRect(c*step, r*step, step, step);
  } else if(kind === 'polka'){
    const step = Math.max(24, Math.round(Math.min(W,H)/14)), r = step*0.28;
    let row=0;
    for(let y=step/2; y<H+step; y+=step*0.87){
      const offsetX = (row%2===0) ? 0 : step/2;
      for(let x=step/2+offsetX; x<W; x+=step){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); }
      row++;
    }
  } else if(kind === 'herringbone'){
    const s = Math.max(16, Math.round(Math.min(W,H)/20));
    ctx.lineWidth = s*0.35; ctx.lineCap='square';
    for(let y=-s; y<H+s; y+=s){
      for(let x=-s; x<W+s; x+=s*2){
        ctx.beginPath(); ctx.moveTo(x,y+s); ctx.lineTo(x+s,y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x+s,y+s); ctx.lineTo(x+2*s,y); ctx.stroke();
      }
    }
  } else if(kind === 'crosshatch'){
    const step = Math.max(14, Math.round(Math.min(W,H)/26));
    ctx.lineWidth = Math.max(1, step*0.08);
    for(let x=-H; x<W+H; x+=step){ ctx.beginPath(); ctx.moveTo(x,H); ctx.lineTo(x+H,0); ctx.stroke(); }
    for(let x=-H; x<W+H; x+=step){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+H,H); ctx.stroke(); }
  } else if(kind === 'chevron'){
    const step = Math.max(20, Math.round(Math.min(W,H)/12)), half = step/2;
    ctx.lineWidth = step*0.28; ctx.lineJoin='round'; ctx.fillStyle='none';
    for(let y=-step; y<H+step; y+=step){
      ctx.beginPath();
      for(let x=0; x<=W+step; x+=step*2){ ctx.lineTo(x, y+half); ctx.lineTo(x+step, y); }
      ctx.stroke();
    }
  } else if(kind === 'waves'){
    const step = Math.max(18, Math.round(Math.min(W,H)/14)), amp = step*0.35;
    ctx.lineWidth = step*0.22; ctx.fillStyle='none';
    for(let y=step/2; y<H+step; y+=step){
      ctx.beginPath(); ctx.moveTo(-step, y);
      for(let x=0; x<W+step*2; x+=step) ctx.quadraticCurveTo(x-step/2, y-amp*(((x/step)|0)%2?1:-1), x, y);
      ctx.stroke();
    }
  } else if(kind === 'brick'){
    const bw = Math.max(30, Math.round(W/10)), bh = bw*0.42;
    ctx.lineWidth = Math.max(1.5, bh*0.08);
    let row = 0;
    for(let y=0; y<H; y+=bh){
      const offset = (row%2===0) ? 0 : -bw/2;
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
      for(let x=offset; x<W; x+=bw){ ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+bh); ctx.stroke(); }
      row++;
    }
  } else if(kind === 'hex'){
    const r = Math.max(18, Math.round(Math.min(W,H)/12)), hexW = r*Math.sqrt(3), hexH = r*1.5;
    ctx.lineWidth = Math.max(1.5, r*0.08);
    let row=0;
    for(let cy=0; cy<H+hexH; cy+=hexH){
      const offsetX = (row%2===0) ? 0 : hexW/2;
      for(let cx=offsetX; cx<W+hexW; cx+=hexW){
        ctx.beginPath();
        for(let i=0;i<6;i++){ const a=Math.PI/6+i*Math.PI/3; const px=cx+r*Math.cos(a), py=cy+r*Math.sin(a); i===0?ctx.moveTo(px,py):ctx.lineTo(px,py); }
        ctx.closePath(); ctx.stroke();
      }
      row++;
    }
  } else if(kind === 'camo'){
    let seed = 99;
    function rnd(){ seed = (seed*9301+49297)%233280; return seed/233280; }
    const blobCount = Math.round((W*H)/16000);
    for(let i=0;i<blobCount;i++){
      const cx=rnd()*W, cy=rnd()*H, r=rnd()*Math.min(W,H)*0.09+Math.min(W,H)*0.03;
      ctx.beginPath();
      const pts=6+Math.floor(rnd()*3);
      for(let p=0;p<pts;p++){ const a=p*(Math.PI*2/pts), rr=r*(0.7+rnd()*0.6); const px=cx+rr*Math.cos(a), py=cy+rr*Math.sin(a); p===0?ctx.moveTo(px,py):ctx.lineTo(px,py); }
      ctx.closePath(); ctx.globalAlpha = 0.55+rnd()*0.35; ctx.fill(); ctx.globalAlpha=1;
    }
  } else if(kind === 'stars'){
    let seed = 15;
    function rnd(){ seed = (seed*9301+49297)%233280; return seed/233280; }
    const n = Math.round((W*H)/9000);
    for(let i=0;i<n;i++){
      const cx=rnd()*W, cy=rnd()*H, r=rnd()*Math.min(W,H)*0.02+Math.min(W,H)*0.012;
      ctx.beginPath();
      for(let p=0;p<10;p++){ const rad=p%2===0?r:r*0.42, a=-Math.PI/2+p*Math.PI/5; const px=cx+rad*Math.cos(a), py=cy+rad*Math.sin(a); p===0?ctx.moveTo(px,py):ctx.lineTo(px,py); }
      ctx.closePath(); ctx.fill();
    }
  } else if(kind === 'argyle'){
    const s = Math.max(24, Math.round(Math.min(W,H)/12));
    ctx.lineWidth = Math.max(1.5, s*0.05);
    for(let y=-s; y<H+s; y+=s) for(let x=-s; x<W+s; x+=s){
      ctx.beginPath(); ctx.moveTo(x+s/2,y); ctx.lineTo(x+s,y+s/2); ctx.lineTo(x+s/2,y+s); ctx.lineTo(x,y+s/2); ctx.closePath(); ctx.stroke();
    }
  } else if(kind === 'noise'){
    let seed = 3;
    function rnd(){ seed = (seed*9301+49297)%233280; return seed/233280; }
    const n = Math.round((W*H)/40);
    for(let i=0;i<n;i++){
      ctx.globalAlpha = 0.15+rnd()*0.5;
      ctx.fillRect(rnd()*W, rnd()*H, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
  } else if(kind === 'cross'){
    const s = Math.max(20, Math.round(Math.min(W,H)/14)), arm = s*0.32;
    for(let y=s/2; y<H; y+=s) for(let x=s/2; x<W; x+=s){
      ctx.fillRect(x-arm/2, y-s*0.38, arm, s*0.76);
      ctx.fillRect(x-s*0.38, y-arm/2, s*0.76, arm);
    }
  } else if(kind === 'rings'){
    const cx=W/2, cy=H/2, step = Math.max(14, Math.round(Math.min(W,H)/16));
    ctx.lineWidth = Math.max(1.5, step*0.16);
    for(let r=step; r<Math.hypot(W,H)/1.3; r+=step){ ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke(); }
  }

  return off;
}
MS.patterns = { list: BG_PATTERNS, icon: bgPatternIconSvg, render: renderPatternCanvas };
})();
