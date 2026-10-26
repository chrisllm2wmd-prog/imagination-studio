/* Imagination Studio - Help centre and guided tours. Every feature has a short explanation and a "show me" tour that spotlights
   the real buttons on screen, one step at a time (Next / Back / Esc). Tours that need something to work on add a small sample first. */
(function(){
'use strict';
const MS = window.MS, S = MS.S;
const { $, $$, esc, toast } = MS;
const cv = ()=> MS.canvas;

/* ---------- helpers that prepare the screen for a step ---------- */
function sampleText(){ const a = cv().getActiveObject(); if(a && MS.isTextObj(a)) return; MS.tools.set('move'); MS.tools.addText({ text:'Hello', select:false }); MS.showPage('design'); MS.emitSelection(); }
function sampleShape(){ const a = cv().getActiveObject(); if(a && !MS.isTextObj(a) && a.type !== 'image' && a.type !== 'activeSelection') return; MS.tools.set('move'); const d = S.doc, s = Math.min(d.wPx, d.hPx) * .3, r = new fabric.Rect({ left:d.wPx / 2, top:d.hPx / 2, width:s, height:s * .7, rx:s * .08, ry:s * .08, fill:'#4c8dff', originX:'center', originY:'center', strokeUniform:true }); r.name = 'Sample shape'; cv().add(r); cv().setActiveObject(r); MS.commit('Add sample'); MS.showPage('design'); MS.emitSelection(); }
function sampleAny(){ MS.tools.set('move'); if(!cv().getActiveObject()) sampleShape(); MS.showPage('design'); }
const page = (p, bottom)=> ()=>{ MS.showPage(p); };
const tool = id=> ()=>{ MS.tools.set(id); };
const open = (sel)=> ()=>{ const el = $(sel); if(el && el.closest('.sect')) el.closest('.sect').classList.remove('collapsed'); };
const noAnim = ()=>{ if(MS.anim && MS.anim.state.on) MS.anim.toggle(false); };
const needAnim = ()=>{ if(MS.anim){ if(!MS.anim.state.on) MS.anim.toggle(true); MS.showPage('anim'); } };

/* ---------- the topics ---------- */
const TOPICS = [
  { id:'why', group:'Start here', title:'Why Imagination Studio exists', sum:'Our mission: one honest place to design your own merch — no tab-hopping, no sketchy downloads, no spam.',
    story:{
      paras:[
        'I set out to create my own line of merch. It should have been simple. It wasn\u2019t.',
        'Every editor I tried was different from the last, and each one was missing something I needed — a key feature here, a basic tool there — or boxed me in with restrictions. To finish a single design I was bouncing between several browser tools, hunting down downloads I didn\u2019t trust, and carrying files back and forth between them. It slowed my workflow right down and stressed me out. And every free trial I signed up for, just to get one thing done, left my mailbox full of spam.',
        'Imagination Studio was born out of that frustration.',
      ],
      standsFor:[
        ['Everything in one place.', 'Logos, ads, merch mock-ups, animation and every export format, in one editor with one set of tools.'],
        ['No restrictions.', 'The tools you actually need, not a stripped-down version that nudges you to upgrade.'],
        ['No sign-ups, no spam.', 'No accounts and no free trials to start, so nothing lands in your inbox.'],
        ['Nothing sketchy to download.', 'Use it in your browser, or install it as an app straight from the page.'],
        ['Private by design.', 'It runs on your computer. Your designs are not uploaded anywhere.'],
        ['Always getting better.', 'Installed copies update themselves, with new tools and improvements added regularly.'],
      ],
      sign:'Created by Chris Chapman \u00b7 Powered by your Imagination' },
    bullets:[], steps:[] },
  { id:'contact', group:'Start here', title:'Contact & more from the creator', sum:'Questions, ideas or a bug to report? Get in touch, or see what else I make.',
    links:[
      { title:'Contact me', text:'Feedback, feature ideas, bug reports, or just say hi. Click to open your email app.', show:'chris.llm2wmd@gmail.com', href:'mailto:chris.llm2wmd@gmail.com', mail:true },
      { title:'Other products', text:'More from the same creator.', show:'www.llm2wmd.com', href:'https://www.llm2wmd.com' },
      { title:'Merch store', text:'Browse and buy the merch.', show:'www.llm2wmd.com/#shop', href:'https://www.llm2wmd.com/#shop' },
    ],
    sign:'Created by Chris Chapman \u00b7 Powered by your Imagination',
    bullets:[], steps:[] },
  { id:'start', group:'Start here', title:'Getting around', sum:'The screen in one minute: menus, tools, canvas, panels, save and export.', bullets:['Pick a size on the start screen, or Blank canvas for a huge square.', 'Tools on the left, settings for the tool along the top, panels on the right.', 'Everything stays editable — Ctrl+Z undoes anything.'],
    steps:[
      { sel:'#menubar', title:'Menus', text:'File, Edit, Object, Type, Effects, View, Window and Help. Almost every command lives here — and Ctrl+K searches all of them.', before:noAnim },
      { sel:'#wsSwitch', title:'Three workspaces', text:'Logo is for print artwork, Ad for banners and flyers, Merch for live product mock-ups. It is one canvas — switching never loses work.' },
      { sel:'#toolbox', title:'The tools', text:'Select / move, node edit, hand, zoom, shapes, pen, pencil, text, pictures, magic wand, eraser and eyedropper. Drawing tools lock the canvas — you go back to Select automatically after drawing.', place:'right' },
      { sel:'#optionsbar', title:'Tool settings', text:'This bar changes with the tool: colours and corner radius for shapes, fonts for text, and buttons for the selected object (align, flip, Shadow / Glow / Outline).' },
      { sel:'#zoomPill', title:'Zoom', text:'Fit, zoom in/out, or drag the slider. Ctrl + mouse wheel zooms at the cursor; hold Space and drag to pan.', place:'top' },
      { sel:'#dock', title:'The panels', text:'Design (size, colour, text, effects), Background, Canvas, and Claude (design and animate by prompt). Below: Layers, History and Swatches.', place:'left', before:page('design') },
      { sel:'#btnSaveProject', title:'Save', text:'Saves an editable project file you can reopen later. With the .bat running it goes straight into MERCH\\logos.' },
      { sel:'#btnExport', title:'Export', text:'PNG, JPG, SVG, PDF and more — with exact size, DPI and file-size limit. Animated GIFs are under Animate.' },
    ] },
  { id:'shapes', group:'Draw', title:'Shapes: square, circle, rounded corners', sum:'Draw rectangles, circles and rounded squares that snap to perfect.', bullets:['Drag to draw — near-equal sides snap to a perfect square or circle (Shift forces it, Alt draws from the centre).', 'Rounded square: pick a corner radius, or Full for pill / circle ends.', 'Click without dragging to drop a standard-size shape.'],
    steps:[
      { sel:'#toolbox [data-tool="rect"]', title:'Rectangle', text:'Drag on the canvas to draw. Hold the button or right-click it for more shapes: triangle, polygon, star, line, arrow.', place:'right', before:tool('rect') },
      { sel:'#obRadius', title:'Corner radius', text:'The Rectangle and Rounded square tools both have a corner radius. 0 is sharp; set it before you draw, or change it later on a selected rectangle.', before:tool('rect'), fallback:'#optionsbar' },
      { sel:'#toolbox [data-tool="rrect"]', title:'Rounded square', text:'Same idea with rounded corners from the start (shortcut Q). Try the quick chips 8 · 24 · 48 · 100 and Full for pill shapes.', place:'right', before:tool('rrect') },
      { sel:'#toolbox [data-tool="ellipse"]', title:'Circle / ellipse', text:'Drag a near-equal width and height and it snaps to a perfect circle. Shift forces it; Alt draws from the centre.', place:'right', before:tool('ellipse') },
      { sel:'#optionsbar', title:'Fill and stroke', text:'Pick the fill and stroke colour, stroke width, or None, before you draw — or change them afterwards in the Design panel.', before:tool('ellipse') },
    ] },
  { id:'text', group:'Draw', title:'Text', sum:'Type, style, space out and recolour text.', bullets:['Press T and click the canvas, then type in the Text box on the right.', 'Text colour is the highlighted swatch at the top of the Text section.', 'Line spacing and letter spacing are sliders.'],
    steps:[
      { sel:'#toolbox [data-tool="text"]', title:'Add text', text:'Press T (or click this) and click the canvas. I have added a sample "Hello" so you can see the settings.', place:'right', before:sampleText },
      { sel:'#propTextContent', title:'Type here', text:'Whatever you type in this box appears on the canvas. Press Enter for a new line.', before:()=>{ sampleText(); page('design')(); }, place:'left' },
      { sel:'.textstyle', title:'Text colour & effects', text:'The big swatch is the text colour. "Effects…" opens shadow, glow and outline right next to it.', place:'left', before:sampleText },
      { sel:'#propFontFamilyBtn', title:'Fonts', text:'Over 700 fonts. Click to browse and search; the whole family is previewed.', place:'left', before:sampleText },
      { sel:'#propLineHeightR', title:'Line & letter spacing', text:'Line spacing pulls lines together or apart; letter spacing tracks the letters. Both work on curved and warped text too.', place:'left', before:sampleText },
    ] },
  { id:'warptext', group:'Draw', title:'Curve and warp text', sum:'Arches, waves, bulges, stairs and spin — your text stays editable.', bullets:['Curve slider bends the text into an arch or circle.', 'Presets: Arch, Wave, Flag, Bulge, Pinch, Fan, Tumble…', 'Gradients, shadows and distress all follow the warped letters.'],
    steps:[
      { sel:'#propCurve', title:'Curve', text:'Drag to bend your text into an arch. Negative bends the other way; 100 is nearly a full circle.', place:'left', before:()=>{ sampleText(); open('#propCurve')(); } },
      { sel:'#tlPresets', title:'Layout presets', text:'One click for Arch up/down, Wave, Flag, Stairs, Bulge, Pinch, Bounce, Fan, Slant and Tumble. "Straight" puts it back.', place:'left', before:sampleText },
      { sel:'#tlWave', title:'Fine tune', text:'Step, Wave, Wave count, Bulge, Rotate each, Spin along, Skew and Slope combine freely. Multi-line text warps line by line.', place:'left', before:sampleText },
      { sel:'#tlReset', title:'Reset', text:'Reset layout returns to normal straight text any time.', place:'left', before:sampleText },
    ] },
  { id:'warpshape', group:'Draw', title:'Warp shapes', sum:'Bend, wave, bulge, taper and twist squares, circles, triangles, polygons and stars.', bullets:['Select a shape — the Warp shape section appears in the Design panel.', 'Every slider works from the original outline, so Reset always restores it.'],
    steps:[
      { sel:'#propShapeWarp', title:'Warp shape', text:'This section shows for rectangles, circles, triangles, polygons and stars. I have added a sample shape.', place:'left', before:()=>{ sampleShape(); }, },
      { sel:'#swPresets', title:'Presets', text:'Arch, Wave, Flag, Bulge, Pinch, Taper, Flare, Twist, Slant, Lean and Melt.', place:'left', before:sampleShape },
      { sel:'#swArch', title:'Sliders', text:'Arch, Side bend, Wave, Bulge, Taper, Twist, Skew and Slope — mix any of them.', place:'left', before:sampleShape },
      { sel:'#swReset', title:'Reset warp', text:'Back to the original shape in one click.', place:'left', before:sampleShape },
    ] },
  { id:'colour', group:'Colour', title:'Fill, stroke and gradients', sum:'Solid colours, fades, patterns and outlines for any shape or text.', bullets:['Fill and Stroke each have a colour, None, and width.', '"Gradient / pattern…" opens fades and 50 patterns for the selection.', 'Gradients run across the whole word on warped text.'],
    steps:[
      { sel:'#propFillGroup', title:'Fill & stroke', text:'Colour swatches for fill and stroke, a None tick for each, stroke width, dashed or dotted lines and corner style.', place:'left', before:()=>{ sampleShape(); open('#propFill')(); } },
      { sel:'#btnMoreFills', title:'Gradients and patterns', text:'Opens the Background page in "selected objects" mode: choose a fade (up to 6 colours, any angle) or a pattern and apply it to the selection.', place:'left', before:sampleShape },
      { sel:'#toolbox .tool-colors', title:'Default colours', text:'The two chips at the bottom of the toolbox are the fill and stroke used for the next thing you draw. Click the arrows to swap them (X).', place:'right' },
    ] },
  { id:'backgrounds', group:'Colour', title:'Backgrounds, scenes and colour grade', sum:'Solid, fade, 50 patterns, 51 scenes — then set the mood with a colour grade.', bullets:['Scenes: stars, galaxy, aurora, synthwave, skyline, ocean, marble and many more.', 'Change a scene\'s three colours, amount, size and variation.', 'Colour grade: Cinematic, Vintage, Noir, Neon… plus hue, saturation, glow, vignette, grain.'],
    steps:[
      { sel:'#dock .dock-tab[data-page="fill"]', title:'Background tab', text:'Everything about the page behind your design lives here. It is part of the exported file.', place:'left', before:page('fill') },
      { sel:'#bgTopSect', title:'Switch it on', text:'Off means transparent. Turn it on, then pick a mode.', place:'left', before:page('fill') },
      { sel:'#bgModes', title:'Modes', text:'Solid colour, Fade (gradient), Pattern (50 designs), Scenes (51 ready-made pictures) or your own Picture.', place:'left', before:()=>{ page('fill')(); const b = $('#bgOn'); if(b && !b.checked){ b.checked = true; b.dispatchEvent(new Event('change', { bubbles:true })); } } },
      { sel:'#bgSceneGrid', title:'Scenes', text:'Click a scene to use it. Then change Base / Accent / Glow colours, Amount, Size and press the shuffle button for new variations.', place:'left', before:()=>{ page('fill')(); const b = $('#bgOn'); if(b && !b.checked){ b.checked = true; b.dispatchEvent(new Event('change', { bubbles:true })); } const m = $('#bgModes button[data-m="scene"]'); if(m) m.click(); } },
      { sel:'#bgGradePresets', title:'Colour grade', text:'One click for a mood — Cinematic, Vintage, Noir, Neon, Golden hour, Dreamy… then fine-tune with the sliders. It works on Scenes and Patterns.', place:'left', before:()=>{ page('fill')(); const m = $('#bgModes button[data-m="scene"]'); if(m) m.click(); } },
    ] },
  { id:'effects', group:'Colour', title:'Shadow, glow, outline and distress', sum:'Stack as many effects as you like on the same element.', bullets:['Select something, then use Shadow / Glow / Outline in the top bar — the controls pop up right there.', 'They can all be on together; the glow always stays attached behind the element.', 'Distress wears the print away (grunge, scratches, halftone…).'],
    steps:[
      { sel:'#optionsbar .fxbtns', title:'Shadow · Glow · Outline', text:'With an element selected, click one of these. It switches on and opens its controls beside the button. I selected a sample for you.', before:sampleAny },
      { sel:'#propTextShadowBtn', fallback:'#propTextGroup', title:'Also in the Text section', text:'Text has an "Effects…" button next to the colour swatch that opens the same pop-up.', place:'left', before:()=>{ sampleText(); } },
      { sel:'#fxStack', title:'The full stack', text:'The same controls sit permanently in the Effects section: shadow (colour, opacity, blur, distance, angle), glow (colour, size, brightness) and outline (colour, width). Turn on any combination.', place:'left', before:()=>{ sampleAny(); open('#fxStack')(); } },
      { sel:'#fxDistressKind', title:'Distress', text:'Grunge wear, scratches, spray speckle, halftone fade, cracked paint, rubber stamp or edge fade — with amount, grain size and a dice for new patterns.', place:'left', before:()=>{ sampleAny(); open('#fxDistressKind')(); } },
    ] },
  { id:'layers', group:'Organise', title:'Layers and groups', sum:'Reorder, hide, lock and group things — and save groups for reuse.', bullets:['Drag a box around several things and they become a locked group.', 'Save a group to your library; it is stored as a file in MERCH\\groups.', 'Hold Alt to pick one item inside a locked group.'],
    steps:[
      { sel:'#tabsBottom .dock-tab[data-page="layers"]', title:'Layers', text:'Top of the list is the front. Drag to reorder, eye to hide, padlock to lock, double-click a name to rename.', place:'left', before:()=>{ MS.showPage('layers'); } },
      { sel:'#leftPanel', title:'Groups panel', text:'Select several things and they group here, locked together: they move, rotate and scale as one. Click the padlock to release them.', place:'right', before:()=>{ const p = $('#leftPanel'); if(p && p.classList.contains('collapsed')) $('#lpToggle').click(); } },
      { sel:'#grpFolder', title:'Saved groups', text:'The save icon on a group keeps it in your library. This folder button browses and opens saved files, including your saved groups.', place:'right', before:()=>{ const p = $('#leftPanel'); if(p && p.classList.contains('collapsed')) $('#lpToggle').click(); } },
    ] },
  { id:'files', group:'Organise', title:'Saving and opening files', sum:'Projects, exports and groups — and a browser for loading them back in.', bullets:['Save keeps an editable project; Export makes a picture.', 'File ▸ Open from saved files shows thumbnails of everything you saved.', 'Browse another folder (such as Downloads) to open files saved by Chrome.'],
    steps:[
      { sel:'#btnSaveProject', title:'Save', text:'Saves an editable project (.json). With the .bat running it lands in MERCH\\logos and never overwrites — the next one gets -2, -3…' },
      { sel:'#menus', title:'Open from saved files', text:'File ▸ Open from saved files… (Ctrl+Shift+O) lists your logos, ads and groups with thumbnails. Click one to open it. "Browse another folder…" reaches anywhere, like Downloads.' },
      { sel:'#docName', title:'Name it', text:'The name here becomes the default file name for saves and exports.' },
    ] },
  { id:'pictures', group:'Organise', title:'Pictures, cut-outs and tracing', sum:'Bring in pictures, remove backgrounds, erase, trace to vectors.', bullets:['Drop pictures on the canvas, or File ▸ Import picture / SVG.', 'Magic wand removes a colour; Eraser rubs out; Trace turns a picture into editable shapes.'],
    steps:[
      { sel:'#toolbox [data-tool="image"]', title:'Add a picture', text:'Opens a file picker. You can also drag pictures straight onto the canvas or paste with Ctrl+V.', place:'right' },
      { sel:'#toolbox [data-tool="wand"]', title:'Magic wand', text:'Click a colour to remove it — tolerance slider and "all matching colour" are in the bar.', place:'right', before:tool('wand') },
      { sel:'#toolbox [data-tool="eraser"]', title:'Eraser', text:'Size and softness in the bar. Works on pictures.', place:'right', before:tool('eraser') },
      { sel:'#toolbox [data-tool="dropper"]', title:'Eyedropper', text:'Click any colour on the canvas to pick it. Alt-click picks the stroke.', place:'right', before:tool('dropper') },
    ] },
  { id:'mirror', group:'Organise', title:'Mirror and kaleidoscope', sum:'Symmetry copies for logos and patterns.', bullets:['Mirror copy: left-right or up-down.', 'Kaleidoscope / radial: repeat around a centre.'],
    steps:[
      { sel:'#optionsbar', title:'Symmetry buttons', text:'With something selected the bar shows Mirror copy and Kaleidoscope. They are also under Object ▸ Copy.', before:()=>{ tool('move')(); sampleAny(); } },
    ] },
  { id:'animate', group:'Animate', title:'Animation and GIFs', sum:'Make elements move, loop them cleanly and export an animated GIF.', bullets:['Click an effect to animate the selected element instantly.', 'Keyframes: move the element at different times and it records.', 'Morph melts text from another font (or a warped shape) into its own.', 'Preview plays it full screen; Make seamless loop, then Export GIF.', 'Or just ask Claude: it can build and edit animations from a sentence.'],
    steps:[
      { sel:'#sbAnim', title:'Open the timeline', text:'Click Animate (or Ctrl+Shift+A). A timeline opens under the canvas.', place:'top', before:noAnim },
      { sel:'#animBar', title:'The timeline', text:'One row per animated element. Diamonds are keyframes; coloured bars are motion effects. The red line is the playhead — drag the ruler to scrub.', place:'top', before:()=>{ sampleAny(); needAnim(); } },
      { sel:'#anChips', title:'One-click effects', text:'Select an element, then click Pulse, Bounce, Spin, Float, Glow pulse… Entrances and exits (Fade in, Pop in, Slide in…) too. It plays straight away.', place:'left', before:()=>{ sampleAny(); needAnim(); } },
      { sel:'#anOnEl', title:'Add or remove animation', text:'This list shows every effect on the selected element. Click × to take one away, or Remove all. The element goes back exactly where it started — it is never deleted.', place:'left', before:()=>{ sampleAny(); needAnim(); } },
      { sel:'#anSnapBtn', title:'Add keyframe', text:'The camera button on the edge of the drawing area (or a click of the mouse wheel on the canvas) adds a keyframe at the playhead: it records the selected element exactly as it is now. Move the playhead, move the element, click it again — that is a keyframe animation.', place:'left', before:()=>{ needAnim(); } },
      { sel:'#anOnEl', title:'Settings for each effect', text:'Every effect on the selected element has its own card: Amount, Cycles, direction, start and length. Change anything and it plays back at once. Add several effects to stack them. Stagger (above) offsets several selected elements.', place:'left', before:()=>{ sampleAny(); needAnim(); } },
      { sel:'#anAuto', title:'Keyframes', text:'With Auto-key on, move / scale / rotate an element at any time on the timeline and a keyframe is recorded. "◆ Add key" records one at the playhead; drag diamonds to retime; easing sets the feel.', place:'bottom', before:()=>{ needAnim(); } },
      { sel:'#btnPreview', title:'Preview', text:'Plays the animation live, full screen, so you can judge it before exporting. Press Esc to come back.', place:'bottom', before:()=>{ needAnim(); } },
      { sel:'#dock .dock-tab[data-page="claude"]', title:'Let Claude do it', text:'In the Claude tab describe the motion in plain words — "bounce in, then wiggle forever" — and Claude adds the effects and keyframes. You can still tweak everything on the timeline afterwards.', place:'left', before:page('claude') },
      { sel:'#anLoopFix', title:'Seamless loop', text:'Makes the last frame identical to the first and rounds loop effects to whole cycles, so the GIF repeats with no jump. The badge turns green when it is perfect.', place:'bottom', before:()=>{ needAnim(); } },
      { sel:'#anGif', title:'Export GIF', text:'Choose width, speed, colours, background and how many times it plays — you get a size estimate first. "Frames" saves every frame as a PNG in a ZIP.', place:'bottom', before:()=>{ needAnim(); } },
    ] },
  { id:'export', group:'Share', title:'Exporting', sum:'PNG, JPG, WebP, SVG, PDF, GIF, TIFF and more at exact sizes.', bullets:['Set the size in pixels or inches and DPI.', 'Limit the file size and it finds the best quality that fits.', 'SVG / PDF warn about anything that will not stay vector (shadows, distress…).'],
    steps:[
      { sel:'#btnExport', title:'Export', text:'Ctrl+E. Choose a format, size and quality and watch the live file size. Ctrl+Shift+E is a quick transparent PNG.' },
      { sel:'#statusbar', title:'Compatibility check', text:'The green "Ready" chip (or an orange "n to check") in the status bar tells you if anything will not survive the format you are building for.', place:'top' },
    ] },
  { id:'shortcuts', group:'Share', title:'Shortcuts and search', sum:'The fast way around: Ctrl+K searches every command.', bullets:['V move · R rectangle · O ellipse · T text · P pen · Q rounded square', 'Ctrl+K command search · ? all shortcuts · F1 this help'],
    steps:[
      { sel:'#menus', title:'Ctrl+K', text:'Opens the command palette — type what you want to do ("shadow", "export", "group") and press Enter.' },
      { sel:'#sbSnap', title:'Snap and grid', text:'Snap pulls things to guides, the grid and other objects; Grid shows the grid. Drag from a ruler to pull out a guide.', place:'top' },
      { sel:'#menus', title:'Everything else', text:'Help ▸ Keyboard shortcuts lists them all.' },
    ] },
  { id:'claude', group:'Share', title:'The Claude tab', sum:'Describe what you want and Claude designs it, edits it or animates it.', bullets:['Connect your own Claude: either Claude Code on this PC (start with the .bat) or paste your own Claude API key (kept only in your browser, sent only to Anthropic).', 'Claude can add text and shapes, recolour, align, set backgrounds and mock-ups.', 'Claude can ANIMATE: ask for "slide in, pulse, then loop" and it adds effects, keyframes, length and a seamless loop for you.', 'Every change is one step in Undo, so Ctrl+Z always gets you back.'],
    steps:[
      { sel:'#dock .dock-tab[data-page="claude"]', title:'Claude', text:'Describe your design in plain words and Claude builds it on the canvas. It uses your own Claude: Claude Code on this PC, or your own API key.', place:'left', before:page('claude') },
      { sel:'#claudeStatus', title:'Connection', text:'Shows how you are connected. Claude Code is picked up automatically when you start with the .bat; otherwise open "Use my own Claude API key" below it.', place:'left', before:page('claude') },
      { sel:'#claudeKeyBox', title:'Your own API key', text:'Paste a key from console.anthropic.com and press Save. It stays in this browser only and is sent only to Anthropic. Forget removes it. Usage is billed by Anthropic, separate from a Claude subscription.', place:'left', before:page('claude') },
      { sel:'#claudeInput', title:'Ask for animation', text:'Try "make the text fly in, pulse gently, then fade out as a seamless loop". The timeline opens and plays it. Ask for changes ("slower", "add a glow pulse") and Claude edits the same animation.', place:'left', before:page('claude') },
    ] },
  { id:'install', group:'Share', title:'Install the app and updates', sum:'Install Imagination Studio like a normal program: it works offline and updates itself.', bullets:['On the web version, click the green Install app button in the top bar (or on the title screen).', 'Installed, it opens in its own window with a Start menu and taskbar icon, and works offline with all 777 fonts.', 'New versions download quietly. When one is ready a bar says "Update now" — nothing changes while you are designing until you click it.', 'Your saved projects and your Claude key are not touched by updates.', 'Chrome and Edge install in one click. Safari: File ▸ Add to Dock. iPhone / iPad: Share ▸ Add to Home Screen. Firefox cannot install web apps on desktop.'],
    steps:[
      { sel:'#btnInstall', fallback:'#wsSwitch', title:'Install app', text:'The green button in the top bar installs Imagination Studio as an app. It disappears once installed (and is not shown on the offline .bat version, which does not need it).', place:'bottom' },
      { sel:'#statusbar', title:'Version', text:'The version number sits at the bottom right. Installed copies pick up new versions automatically and ask before switching.', place:'top' },
    ] },
];

/* ---------- the guided-tour overlay ---------- */
let tour = null;
function visible(el){ if(!el) return false; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden'; }
function endTour(){ if(!tour) return; document.removeEventListener('keydown', tour.key, true); window.removeEventListener('resize', tour.pos); tour.hl.remove(); tour.card.remove(); tour = null; }
function startTour(id, from){
  const t = TOPICS.find(x=> x.id === id); if(!t) return; endTour(); document.querySelectorAll('.modal-overlay').forEach(m=> m.remove());
  const hl = document.createElement('div'); hl.className = 'tour-hl'; const card = document.createElement('div'); card.className = 'tour-card';
  document.body.appendChild(hl); document.body.appendChild(card);
  tour = { t, i:from || 0, hl, card };
  const go = n=>{ tour.i = Math.max(0, Math.min(t.steps.length - 1, n)); show(); };
  tour.key = e=>{ if(e.key === 'Escape'){ e.stopPropagation(); endTour(); } else if(e.key === 'ArrowRight' || e.key === 'Enter'){ if(!/input|textarea|select/i.test(e.target.tagName)){ e.preventDefault(); e.stopPropagation(); tour.i < t.steps.length - 1 ? go(tour.i + 1) : endTour(); } } else if(e.key === 'ArrowLeft' && !/input|textarea|select/i.test(e.target.tagName)){ e.preventDefault(); go(tour.i - 1); } };
  document.addEventListener('keydown', tour.key, true);
  function place(){
    if(!tour) return; const st = t.steps[tour.i]; let el = $(st.sel); if(!visible(el) && st.fallback) el = $(st.fallback); const c = tour.card, pad = 6;
    if(visible(el)){
      const r = el.getBoundingClientRect(); Object.assign(hl.style, { display:'block', left:(r.left - pad) + 'px', top:(r.top - pad) + 'px', width:(r.width + pad * 2) + 'px', height:(r.height + pad * 2) + 'px' });
      const cw = c.offsetWidth, ch = c.offsetHeight, vw = innerWidth, vh = innerHeight, gap = 14;
      const fit = { right:r.right + gap + cw < vw, left:r.left - gap - cw > 0, bottom:r.bottom + gap + ch < vh, top:r.top - gap - ch > 0 };
      let p = st.place && fit[st.place] ? st.place : (fit.bottom ? 'bottom' : fit.top ? 'top' : fit.right ? 'right' : fit.left ? 'left' : 'center'), x, y;
      if(p === 'right'){ x = r.right + gap; y = r.top + r.height / 2 - ch / 2; } else if(p === 'left'){ x = r.left - gap - cw; y = r.top + r.height / 2 - ch / 2; } else if(p === 'bottom'){ x = r.left + r.width / 2 - cw / 2; y = r.bottom + gap; } else if(p === 'top'){ x = r.left + r.width / 2 - cw / 2; y = r.top - gap - ch; } else { x = vw / 2 - cw / 2; y = vh / 2 - ch / 2; }
      c.style.left = Math.max(10, Math.min(vw - cw - 10, x)) + 'px'; c.style.top = Math.max(10, Math.min(vh - ch - 10, y)) + 'px';
    } else { hl.style.display = 'none'; c.style.left = (innerWidth / 2 - c.offsetWidth / 2) + 'px'; c.style.top = (innerHeight / 2 - c.offsetHeight / 2) + 'px'; }
  }
  tour.pos = place; window.addEventListener('resize', place);
  function show(){
    const st = t.steps[tour.i], n = t.steps.length, last = tour.i === n - 1;
    try{ st.before && st.before(); }catch(e){ console.error(e); }
    card.innerHTML = `<div class="tc-h"><span>${esc(t.title)}</span><b>${tour.i + 1} / ${n}</b><button class="ib" data-x title="Close (Esc)">${MS.icon('x')}</button></div><h3>${esc(st.title)}</h3><p>${esc(st.text)}</p>
      <div class="tc-dots">${t.steps.map((_, k)=> `<i class="${k === tour.i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="tc-f"><button class="btn sm" data-all>All topics</button><span class="sp"></span>${tour.i ? '<button class="btn sm" data-back>Back</button>' : ''}<button class="btn sm primary" data-next>${last ? 'Done' : 'Next'}</button></div>`;
    card.querySelector('[data-x]').onclick = endTour; card.querySelector('[data-all]').onclick = ()=>{ endTour(); openHelp(t.id); };
    const b = card.querySelector('[data-back]'); if(b) b.onclick = ()=> go(tour.i - 1); card.querySelector('[data-next]').onclick = ()=> last ? endTour() : go(tour.i + 1);
    window.MSI.hydrate && window.MSI.hydrate(card); hl.style.display = 'none'; setTimeout(()=>{ const el = $(st.sel); if(el && el.scrollIntoView) el.scrollIntoView({ block:'nearest', inline:'nearest' }); place(); setTimeout(place, 220); }, 160);
  }
  show();
}

/* ---------- the help centre ---------- */
function openHelp(select){
  endTour(); const groups = []; TOPICS.forEach(t=>{ let g = groups.find(x=> x.n === t.group); if(!g) groups.push(g = { n:t.group, items:[] }); g.items.push(t); });
  let cur = TOPICS.find(t=> t.id === select) || TOPICS[0];
  const body = document.createElement('div'); body.className = 'hc';
  body.innerHTML = `<div class="hc-side"><input type="search" id="hcFind" placeholder="Search help…"><div id="hcList"></div></div><div class="hc-main" id="hcMain"></div>`;
  const api = MS.modal({ title:'Help centre', body, wide:true, footer:false });
  const list = $('#hcList', body), main = $('#hcMain', body), find = $('#hcFind', body);
  function drawList(){ const q = find.value.toLowerCase().trim(); list.innerHTML = groups.map(g=>{ const its = g.items.filter(t=> !q || (t.title + ' ' + t.sum + ' ' + t.bullets.join(' ') + ' ' + t.steps.map(s=> s.title + ' ' + s.text).join(' ') + ' ' + (t.links ? t.links.map(l=> l.title + ' ' + l.text + ' ' + l.show).join(' ') : '') + ' ' + (t.story ? t.story.paras.join(' ') + ' ' + t.story.standsFor.map(x=> x.join(' ')).join(' ') : '')).toLowerCase().includes(q)); return its.length ? `<div class="hc-g">${esc(g.n)}</div>` + its.map(t=> `<button class="${t === cur ? 'on' : ''}" data-id="${t.id}">${esc(t.title)}</button>`).join('') : ''; }).join('') || '<div class="hint" style="padding:10px">Nothing matches.</div>'; $$('button', list).forEach(b=> b.onclick = ()=>{ cur = TOPICS.find(t=> t.id === b.dataset.id); drawList(); drawMain(); }); }
  function drawStory(){
    const st = cur.story;
    main.innerHTML = `<h2>${esc(cur.title)}</h2><div class="hc-mission">${esc(cur.sum)}</div>${st.paras.map(p=> `<p class="hc-p">${esc(p)}</p>`).join('')}<h3 class="hc-h3">What Imagination Studio stands for</h3><ul class="hc-stand">${st.standsFor.map(x=> `<li><b>${esc(x[0])}</b> ${esc(x[1])}</li>`).join('')}</ul><div class="hc-sign">${esc(st.sign)}</div>`;
  }
  function drawLinks(){
    const mailHref = l=> l.mail ? l.href + '?subject=' + encodeURIComponent('Imagination Studio feedback (v' + (window.IMAGINATION_VERSION || '') + ')') : l.href;
    main.innerHTML = `<h2>${esc(cur.title)}</h2><p class="hc-sum">${esc(cur.sum)}</p><div class="hc-links">${cur.links.map(l=> `<a class="hc-link" href="${esc(mailHref(l))}"${l.mail ? '' : ' target="_blank" rel="noopener noreferrer"'}><b>${esc(l.title)}</b><span>${esc(l.text)}</span><em>${esc(l.show)}</em></a>`).join('')}</div><div class="hc-sign">${esc(cur.sign)}</div>`;
  }
  function drawMain(){ if(cur.story) return drawStory(); if(cur.links) return drawLinks(); main.innerHTML = `<h2>${esc(cur.title)}</h2><p class="hc-sum">${esc(cur.sum)}</p><ul>${cur.bullets.map(b=> `<li>${esc(b)}</li>`).join('')}</ul>
    <button class="btn primary" id="hcTour">${MS.icon('play')}Show me — guided tour (${cur.steps.length} steps)</button>
    <div class="hc-steps">${cur.steps.map((s, i)=> `<div class="hc-step" data-i="${i}"><b>${i + 1}</b><div><strong>${esc(s.title)}</strong><span>${esc(s.text)}</span></div></div>`).join('')}</div><div class="hint">Click any step to jump straight to it on screen.</div>`;
    $('#hcTour', main).onclick = ()=> startTour(cur.id); $$('.hc-step', main).forEach(el=> el.onclick = ()=> startTour(cur.id, +el.dataset.i)); }
  find.oninput = drawList; drawList(); drawMain(); setTimeout(()=> find.focus(), 50);
}

MS.help = { open:openHelp, tour:startTour, end:endTour, topics:TOPICS };
MS.initHelp = function(){
  document.addEventListener('keydown', e=>{ if(e.key === 'F1'){ e.preventDefault(); openHelp(); } });
  MS.addCommand && MS.addCommand({ title:'Help centre', cat:'Help', run:()=> openHelp() });
  MS.addCommand && MS.addCommand({ title:'Contact the creator', cat:'Help', run:()=> openHelp('contact') });
  MS.addCommand && MS.addCommand({ title:'Why Imagination Studio exists (our mission)', cat:'Help', run:()=> openHelp('why') });
  TOPICS.filter(t=> t.steps.length).forEach(t=> MS.addCommand && MS.addCommand({ title:'Guided tour: ' + t.title, cat:'Help', run:()=> startTour(t.id) }));
  if(!MS.store.get('helpHinted', false)){ setTimeout(()=>{ MS.store.set('helpHinted', true); toast('New here? Help ▸ Help centre (or F1) has a guided tour for every feature.', 7000); }, 9000); }
};
})();
