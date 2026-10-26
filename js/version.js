/* Imagination Studio version. ALWAYS count up when something ships, and keep this the only place the number lives.
   3.x = the animation / GIF studio releases. */
window.IMAGINATION_VERSION = '3.92 beta';
// always visible, bottom right of the editor
document.addEventListener('DOMContentLoaded', ()=>{ const sb = document.getElementById('statusbar'); if(!sb) return; const s = document.createElement('span'); s.className = 'sb-ver'; s.textContent = 'v' + window.IMAGINATION_VERSION; s.style.cssText = 'margin-left:auto;padding:0 10px;color:var(--dim);font-size:11px;white-space:nowrap'; sb.appendChild(s); });
