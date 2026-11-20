// Baustein „vorlagen“ – Statusbilder (und später Fotobuch-Seiten) zeichnen: Schriften, eingebaute Stile, Layouts, Collagen,
// Text-Hilfen und alle Vorlagen. Quelle: Repo imagicosmos/bausteine, vorlagen/vorlagen.js. In den Apps eine Kopie: NICHT VON HAND ÄNDERN.
// Herkunft: der Zeichenteil von Imagiclique (app/index.html), am 19.11.2026 unverändert hierher verschoben (Pixel für Pixel
// gleich geprüft), damit auch Imagicruise ihn nutzen kann (Status aus einer Reise, Fotobuch). Ohne fremden Code.
//
// Regel für alle Vorlagen: Jede Vorlage folgt dem Stil (stilGrund/stilPapier, Schrift auf Flächen über lesbar).
// Zeichenumgebung: Die Vorlagen zeichnen auf ctx in einer Fläche W × H (1080 × 1920) mit den sicheren Zonen SAFE_TOP/SAFE_BOTTOM.
// Die App liefert über einrichten() ihre Daten (daten: Titel, Text, Fußzeile, Schrift …, foto(i): Bild Nummer i,
// stilBild(stil, art): eigene Bilder eines Stils, beiSchrift(): nach dem Laden einer Schrift neu zeichnen).
// Neben dieser Datei liegen die Schriften (*.woff2) und der Stil-Katalog (stile/katalog.json, stile/<id>.imagistil); ORDNER ist ihr Pfad.
// Die gemeinsamen Werte (ctx, anim, dry, spill, moreFollows, tplInk, SAFE_TOP, SAFE_BOTTOM, ab 1.1.0 auch H) liest und setzt sie mit wert(name[, neu]).
// Formate (ab 1.1.0): Breite immer 1080, Höhe H frei (Status 1920, Fotobuch z. B. quadratisch 1080, A4 hoch 1527, A4 quer 764);
// für den Druck die Zeichenfläche größer anlegen und mit ctx.scale(Breite / 1080) zeichnen.
(function (wurzel) {
  var VERSION = "1.3.0";
  var dok = wurzel.document;

  // ---------- Zeichenumgebung ----------
  let W = 1080, H = 1920, PAD = 90, SAFE_TOP = 250, SAFE_BOTTOM = 260;
  let ctx = null, anim = null, dry = false, spill = '', moreFollows = false, tplInk = null;
  let state = { title: '', text: '', footer: '', font: 'sans', fit: 'cover', fx: 50, fy: 50, colN: 4, colLay: {}, tpl: 'photo', shape: 'heart', cdDate: '' };
  let photo = () => null, styleImg = () => null, beiSchrift = () => {};
  // Ordner dieses Bausteins (neben vorlagen.js liegen die Schriften und der Stil-Katalog stile/); unter Node leer
  const ORDNER = dok && dok.currentScript && dok.currentScript.src ? dok.currentScript.src.replace(/[^/]*$/, '') : '';
  const schriftPfad = ORDNER;
  function wert(name, neu) {
    const set = arguments.length > 1;
    switch (name) {
      case 'ctx': if (set) ctx = neu; return ctx;
      case 'anim': if (set) anim = neu; return anim;
      case 'dry': if (set) dry = neu; return dry;
      case 'spill': if (set) spill = neu; return spill;
      case 'moreFollows': if (set) moreFollows = neu; return moreFollows;
      case 'tplInk': if (set) tplInk = neu; return tplInk;
      case 'SAFE_TOP': if (set) SAFE_TOP = neu; return SAFE_TOP;
      case 'SAFE_BOTTOM': if (set) SAFE_BOTTOM = neu; return SAFE_BOTTOM;
      case 'H': if (set) H = neu; return H;   // Höhe der Seite (Breite bleibt 1080; für andere Formate, z. B. Fotobuch)
      case 'W': return W;
      case 'PAD': return PAD;
      default: throw new Error('vorlagen: unbekannter Wert ' + name);
    }
  }
  function einrichten(o) {
    if (o.daten) state = o.daten;
    if (o.foto) photo = o.foto;
    if (o.stilBild) styleImg = o.stilBild;
    if (o.beiSchrift) beiSchrift = o.beiSchrift;
    return api;
  }

// ---------- Schriften und eingebaute Stile ----------
// Stile als Daten (Konzept „Vorlagen und Stile von Nutzern“, Stufe 1): Ein Stil ist ein reines Datenobjekt, das sich
// später als Datei speichern und weitergeben lässt. colors: Verlauf des Hintergrunds (bg1 → bg2), Schriftfarbe fg,
// Akzentfarbe acc (jeweils #rrggbb). font: Schrift, die beim Wählen des Stils eingestellt wird. desc: Beschreibung für
// die KI. deco: Schmuck aus einfachen Formen – back liegt auf dem Hintergrund hinter Fotos und Text, photo über einem
// bildfüllenden Foto. Je Eintrag: shape (flake, dot, star, confetti, heart, flower, leaf), n Stück, size [von, bis] in px, alpha, colors,
// area [oben, unten] als Anteil der Bildhöhe, seed für die feste Zufallsverteilung.
// Schriften für den Titel (state.font, je Gruppe; ein Stil kann eine mitbringen). Der Fließtext bleibt Inter, damit er
// lesbar bleibt. fam: CSS-Familie, w: Strichstärke der Datei (ersetzt die Stärke der Vorlage), k: Größenfaktor für Schriften,
// die bei gleicher Größe kleiner wirken. Alle liegen als Datei neben diesem Baustein (Lizenzen in LIZENZEN-schriften.txt),
// auch Inter (Fließtext) und Playfair Display (Elegant). Neue Schriften nur mit neuer Kennung; ältere App-Fassungen
// übergehen unbekannte Kennungen in Stilen.
const FONTS = [
  { id: 'sans', name: 'Modern', fam: 'Inter', fb: 'system-ui, sans-serif' },
  { id: 'serif', name: 'Elegant', fam: 'Playfair Display', fb: 'Georgia, serif' },
  { id: 'klassisch', name: 'Klassisch', fam: 'Cormorant Garamond', w: 700, k: 1.08, fb: 'Georgia, serif', file: 'cormorant-garamond-latin-700-normal' },
  { id: 'hand', name: 'Handschrift', fam: 'Caveat', w: 700, k: 1.15, fb: 'cursive', file: 'caveat-latin-700-normal' },
  { id: 'schwung', name: 'Schwungvoll', fam: 'Dancing Script', w: 700, k: 1.05, fb: 'cursive', file: 'dancing-script-latin-700-normal' },
  { id: 'schreibschrift', name: 'Schreibschrift', fam: 'Great Vibes', w: 400, k: 1.15, fb: 'cursive', file: 'great-vibes-latin-400-normal' },
  { id: 'plakativ', name: 'Plakativ', fam: 'Bebas Neue', w: 400, k: 1.1, fb: 'Impact, sans-serif', file: 'bebas-neue-latin-400-normal' },
  { id: 'kraeftig', name: 'Kräftig', fam: 'Oswald', w: 600, k: 1, fb: 'Impact, sans-serif', file: 'oswald-latin-600-normal' },
  { id: 'verspielt', name: 'Verspielt', fam: 'Fredoka', w: 600, k: 1, fb: 'system-ui, sans-serif', file: 'fredoka-latin-600-normal' },
  { id: 'rund', name: 'Rund', fam: 'Comfortaa', w: 700, k: .95, fb: 'system-ui, sans-serif', file: 'comfortaa-latin-700-normal' },
  { id: 'retro', name: 'Retro', fam: 'Pacifico', w: 400, k: .9, fb: 'cursive', file: 'pacifico-latin-400-normal' },
  { id: 'nostalgie', name: 'Nostalgie', fam: 'Lobster', w: 400, k: 1, fb: 'cursive', file: 'lobster-latin-400-normal' },
  { id: 'schreibmaschine', name: 'Schreibmaschine', fam: 'Special Elite', w: 400, k: .92, fb: 'monospace', file: 'special-elite-latin-400-normal' },
  { id: 'marker', name: 'Marker', fam: 'Permanent Marker', w: 400, k: .92, fb: 'cursive', file: 'permanent-marker-latin-400-normal' },
];
const fontOf = id => FONTS.find(f => f.id === id) || FONTS[0];
if (dok) (() => {   // die Dateien bekannt machen; geladen werden sie beim Start (ready) bzw. beim ersten Zeichnen (needFont)
  const css = dok.createElement('style');
  const grund = [['Inter', 400, 'inter-latin-400-normal'], ['Inter', 600, 'inter-latin-600-normal'], ['Inter', 800, 'inter-latin-800-normal'],
    ['Playfair Display', 600, 'playfair-display-latin-600-normal'], ['Playfair Display', 800, 'playfair-display-latin-800-normal']]
    .map(([fam, w, file]) => ({ fam, w, file }));
  css.textContent = grund.concat(FONTS.filter(f => f.file)).map(f => `@font-face { font-family:"${f.fam}"; font-weight:${f.w}; font-display:swap; src:url(${schriftPfad}${f.file}.woff2) format("woff2"); }`).join('\n');
  dok.head.appendChild(css);
})();
// Die Reihenfolge ist Teil der gespeicherten Gruppen (state.pal ist die Nummer): neue Stile nur hinten anfügen.
const STYLES = [
  { id: 'wald', name: 'Wald', desc: 'dunkelgrün mit hellgrünem Akzent', colors: { bg1: '#0b3d2e', bg2: '#1f7a52', fg: '#ffffff', acc: '#9ff5c4' } },
  { id: 'nacht', name: 'Nacht', desc: 'nachtblau bis violett mit gelbem Akzent', colors: { bg1: '#1b1f3b', bg2: '#4b3f9e', fg: '#ffffff', acc: '#ffcf5c' } },
  { id: 'sand', name: 'Sand', desc: 'hell: creme und beige mit rostrotem Akzent', colors: { bg1: '#f6efe6', bg2: '#e8d9c4', fg: '#2b2118', acc: '#b5562b' } },
  { id: 'kohle', name: 'Kohle', desc: 'schwarz mit rotem Akzent', colors: { bg1: '#111111', bg2: '#333333', fg: '#ffffff', acc: '#ff5a5f' } },
  { id: 'himmel', name: 'Himmel', desc: 'hell: hellblau mit kräftig blauem Akzent', colors: { bg1: '#e6f2ff', bg2: '#b9d9ff', fg: '#0d2440', acc: '#0a66c2' } },
  { id: 'weihnachten', name: 'Weihnachten', icon: '❄', font: 'serif',
    desc: 'Weihnachten: dunkelrot mit goldenem Akzent, Schneeflocken und Sterne',
    colors: { bg1: '#8a1423', bg2: '#3f0a13', fg: '#fff8ec', acc: '#f2c14e' },
    deco: {
      back: [
        { shape: 'flake', n: 16, size: [50, 120], alpha: .13, colors: ['#ffffff'], area: [0, 1], seed: 11 },
        { shape: 'dot', n: 60, size: [3, 9], alpha: .32, colors: ['#ffffff'], area: [0, 1], seed: 12 },
        { shape: 'star', n: 10, size: [14, 30], alpha: .5, colors: ['#f2c14e'], area: [0, 1], seed: 13 },
      ],
      photo: [
        { shape: 'dot', n: 70, size: [3, 10], alpha: .75, colors: ['#ffffff'], area: [0, .55], seed: 21 },
        { shape: 'flake', n: 7, size: [40, 90], alpha: .55, colors: ['#ffffff'], area: [0, .4], seed: 22 },
      ],
    } },
  { id: 'geburtstag', name: 'Geburtstag', icon: '🎈', font: 'sans',
    desc: 'Geburtstag: kräftiges Pink bis Violett mit gelbem Akzent und buntem Konfetti',
    colors: { bg1: '#d81b60', bg2: '#6a1b9a', fg: '#ffffff', acc: '#ffe066' },
    deco: {
      back: [
        { shape: 'confetti', n: 70, size: [14, 30], alpha: .5, colors: ['#ffe066', '#4dd0e1', '#ffffff', '#ff8a65', '#aed581'], area: [0, 1], seed: 31 },
        { shape: 'dot', n: 24, size: [6, 14], alpha: .35, colors: ['#ffe066', '#ffffff'], area: [0, 1], seed: 32 },
      ],
      photo: [
        { shape: 'confetti', n: 60, size: [14, 32], alpha: .9, colors: ['#ffe066', '#4dd0e1', '#ffffff', '#ff8a65', '#aed581', '#f06292'], area: [0, .32], seed: 41 },
      ],
    } },
];
// Die Vorlagen zeichnen mit dem flachen Farbsatz; style verweist auf den ganzen Stil
const PALETTES = STYLES.map(st => ({ ...st.colors, style: st }));
// Hinzugefügte Stile (aus dem Katalog, aus einem Link oder einer Datei) stehen hinter den eingebauten und liegen in
// localStorage. Alles von außen läuft durch cleanStyle(): nur bekannte Felder, Farben als #rrggbb, begrenzte Mengen.
const BUILTIN = STYLES.length;
const SHAPES = ['flake', 'dot', 'star', 'confetti', 'heart', 'flower', 'leaf'], HEX = /^#[0-9a-f]{6}$/i;
function cleanStyle(o) {
  if (!o || typeof o !== 'object' || !o.colors || typeof o.colors !== 'object') return null;
  const colors = {};
  for (const k of ['bg1', 'bg2', 'fg', 'acc']) { const v = o.colors[k]; if (typeof v !== 'string' || !HEX.test(v)) return null; colors[k] = v.toLowerCase(); }
  const str = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, n) : '';
  const name = str(o.name, 24); if (!name) return null;
  const id = (str(o.id, 40) || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'stil';
  const num = (v, lo, hi, d) => typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  const layer = l => (Array.isArray(l) ? l : []).slice(0, 6).map(d => {
    if (!d || typeof d !== 'object' || !SHAPES.includes(d.shape)) return null;
    const cols = (Array.isArray(d.colors) ? d.colors : []).filter(x => typeof x === 'string' && HEX.test(x)).slice(0, 8);
    if (!cols.length) return null;
    const sz = Array.isArray(d.size) ? d.size : [], ar = Array.isArray(d.area) ? d.area : [];
    const s0 = num(sz[0], 1, 300, 10), a0 = num(ar[0], 0, 1, 0);
    return { shape: d.shape, n: Math.round(num(d.n, 0, 150, 20)), size: [s0, Math.max(s0, num(sz[1], 1, 300, s0))], alpha: num(d.alpha, 0, 1, .5),
             colors: cols, area: [a0, Math.max(a0, num(ar[1], 0, 1, 1))], seed: Math.round(num(d.seed, 0, 1e9, 1)) };
  }).filter(Boolean);
  const st = { id, name, desc: str(o.desc, 140) || name, colors };
  const icon = [...str(o.icon, 8)].slice(0, 2).join(''); if (icon) st.icon = icon;
  if (typeof o.font === 'string' && FONTS.some(f => f.id === o.font)) st.font = o.font;
  const back = layer(o.deco && o.deco.back), onPhoto = layer(o.deco && o.deco.photo);
  if (back.length || onPhoto.length) st.deco = { back, photo: onPhoto };
  return st;
}
// Stil als Datei (*.imagistil) bzw. im Link: dieselben Daten mit Kennung des Formats
const styleData = st => ({ format: 'imagistil', version: 1, ...st });

// ---------- Layouts und Collagen ----------
// --- Layouts als Daten (Konzept „Vorlagen und Stile von Nutzern“, letzte Stufe) ---
// Ein Layout legt fest, wo Fotos, Titel und Text stehen – als reine Daten in Anteilen der Bildfläche (0 bis 1):
// { id, name, photos: [[x, y, Breite, Höhe]], radius (px), title: { x, y, w, size (px), lines, align },
//   text: { x, y, w, size, align, bottom, follow }, gen }. text.follow: der Text beginnt direkt unter dem Titel;
// text.bottom: bis dorthin darf er reichen. gen: die Einstellungen des Editors (nur damit er das Layout wieder
// öffnen kann). Eine Gruppe benutzt ein Layout über die Vorlagen-Kennung „lay:<id>“. Farben, Schrift und Schmuck
// kommen weiter vom Stil; sichere Zonen, Textfluss, Fußzeile und Wasserzeichen bleiben Sache der App.
const LAYOUTS = {};
const isLay = tpl => typeof tpl === 'string' && tpl.startsWith('lay:');
const layOf = tpl => isLay(tpl) ? LAYOUTS[tpl.slice(4)] : undefined;
const LAY_GEN = { n: [1, 2, 3, 4, 5, 6], order: ['ptx', 'tpx', 'txp'], share: ['s', 'm', 'l'], edge: ['pad', 'full'], radius: ['0', '30', '70'], align: ['left', 'center'], tsize: ['n', 'l'] };
function cleanLayout(o) {
  if (!o || typeof o !== 'object') return null;
  const str = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, n) : '';
  const num = (v, lo, hi, d) => typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  const name = str(o.name, 24); if (!name) return null;
  const id = (str(o.id, 40) || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'layout';
  const photos = (Array.isArray(o.photos) ? o.photos : []).slice(0, 12)
    .map(c => Array.isArray(c) ? [num(c[0], 0, .95, 0), num(c[1], 0, .95, 0), num(c[2], .05, 1, .5), num(c[3], .05, 1, .5)] : null).filter(Boolean);
  const block = b => b && typeof b === 'object' ? { x: num(b.x, 0, .9, .08), y: num(b.y, 0, 1, .2), w: num(b.w, .1, 1, .84), align: b.align === 'center' ? 'center' : 'left' } : null;
  const title = block(o.title), text = block(o.text);
  if (title) { title.size = num(o.title.size, 40, 120, 80); title.lines = Math.round(num(o.title.lines, 1, 3, 2)); }
  if (text) { text.size = num(o.text.size, 30, 70, 44); text.bottom = num(o.text.bottom, 0, 1, 1); text.follow = o.text.follow === true; }
  if (!photos.length && !title && !text) return null;
  const lay = { id, name, photos, radius: num(o.radius, 0, 120, 30), title, text };
  if (o.gen && typeof o.gen === 'object') {
    const g = {};
    for (const k of Object.keys(LAY_GEN)) { if (!LAY_GEN[k].includes(o.gen[k])) { g.bad = 1; break; } g[k] = o.gen[k]; }
    if (!g.bad) { g.lay = Math.round(num(o.gen.lay, 0, 20, 0)); lay.gen = g; }
  }
  return lay;
}
// zeichnet eine Gruppe nach einem Layout; Titel und Text bleiben in den sicheren Zonen, egal was im Layout steht
function drawLayout(lay, p) {
  bgGradient(p);
  lay.photos.forEach(([x, y, w, h], i) => {
    const a = [x * W, y * H, Math.min(w, 1 - x) * W, Math.min(h, 1 - y) * H];
    if (photo(i)) place(photo(i), ...a, lay.radius); else placeholder(...a, lay.radius, p);
  });
  const top = SAFE_TOP - 40, bot = H - SAFE_BOTTOM - 40, t = lay.title, s = lay.text;
  let end = top;
  if (t) {
    const lh = t.size * 1.14, y = Math.min(Math.max(t.y * H, top), bot - lh);
    end = y;
    if (state.title.trim()) {
      font(800, t.size, 'head'); ctx.fillStyle = p.fg;
      end = clampBlock(state.title, t.x * W, y + t.size * .85, Math.min(t.w, 1 - t.x) * W, lh, t.lines, t.align) - lh + t.size * .3;
    }
  }
  if (s) {
    const lh = s.size * 1.36, y = Math.max(top, s.follow && t ? end + s.size * .4 : s.y * H);
    const max = Math.max(0, Math.floor((Math.min(s.bottom * H, bot) - y) / lh));
    font(400, s.size); ctx.fillStyle = p.fg; ctx.globalAlpha = .9;
    bodyBlock(state.text, s.x * W, y + s.size, Math.min(s.w, 1 - s.x) * W, lh, max, s.align); ctx.globalAlpha = 1;
  }
  footerLine(p);
}
// baut aus den Einstellungen des Editors (gen) die Flächen eines Layouts
function buildLayout(id, name, g) {
  const r4 = v => Math.round(v * 10000) / 10000;
  const X = PAD / W, WW = 1 - 2 * X, top = (SAFE_TOP - 40) / H, bot = (H - SAFE_BOTTOM - 40) / H, full = g.edge === 'full';
  const share = { s: .36, m: .5, l: .62 }[g.share], tsize = g.tsize === 'l' ? 96 : 74, gap = 36 / H;
  const tH = tsize * 1.14 * 2 / H, pH0 = (bot - top) * share;
  const list = COLLAGES[g.n] || [], cells = g.n === 1 ? [[0, 0, 1, 1]] : (list[g.lay] || list[0]).c;
  let py, pH = pH0, title, text;
  if (g.order === 'ptx') {
    py = full ? 0 : top; if (full) pH = top + pH0;
    title = { y: py + pH + gap }; text = { y: py + pH + gap + tH, bottom: bot, follow: true };
  } else if (g.order === 'tpx') {
    title = { y: top + 10 / H }; py = top + 10 / H + tH + gap / 2;
    text = { y: py + pH + gap, bottom: bot, follow: false };
  } else {
    title = { y: top + 10 / H }; py = bot - pH;
    text = { y: top + 10 / H + tH, bottom: py - gap, follow: true };
  }
  const px = full ? 0 : X, pw = full ? 1 : WW, e = 1e-6, m = 9;   // m: halber Abstand zwischen den Fotos in px
  const photos = cells.map(([cx, cy, cw, ch]) => {
    const l = cx > e ? m / W : 0, r = cx + cw < 1 - e ? m / W : 0, o = cy > e ? m / H : 0, u = cy + ch < 1 - e ? m / H : 0;
    return [r4(px + cx * pw + l), r4(py + cy * pH + o), r4(cw * pw - l - r), r4(ch * pH - o - u)];
  });
  const blk = b => ({ x: r4(X), w: r4(WW), align: g.align, ...b, y: r4(b.y) });
  return cleanLayout({ id, name, photos, radius: full && g.n === 1 ? 0 : +g.radius, title: { ...blk(title), size: tsize, lines: 2 },
                       text: { ...blk(text), size: 44, bottom: r4(text.bottom) }, gen: { ...g } });
}

// Collage-Anordnungen je Fotozahl: Zellen als [x, y, Breite, Höhe] in Anteilen der Collagefläche
const T = 1 / 3;
const COLLAGES = {
  2: [
    { n:'Übereinander', c:[[0,0,1,.5],[0,.5,1,.5]] },
    { n:'Nebeneinander', c:[[0,0,.5,1],[.5,0,.5,1]] },
    { n:'Groß oben, schmal unten', c:[[0,0,1,.64],[0,.64,1,.36]] },
  ],
  3: [
    { n:'Groß oben, zwei unten', c:[[0,0,1,.55],[0,.55,.5,.45],[.5,.55,.5,.45]] },
    { n:'Groß links, zwei rechts', c:[[0,0,.6,1],[.6,0,.4,.5],[.6,.5,.4,.5]] },
    { n:'Zwei oben, groß unten', c:[[0,0,.5,.45],[.5,0,.5,.45],[0,.45,1,.55]] },
    { n:'Drei Streifen', c:[[0,0,1,T],[0,T,1,T],[0,2*T,1,T]] },
  ],
  4: [
    { n:'Raster 2 × 2', c:[[0,0,.5,.5],[.5,0,.5,.5],[0,.5,.5,.5],[.5,.5,.5,.5]] },
    { n:'Groß oben, drei unten', c:[[0,0,1,.62],[0,.62,T,.38],[T,.62,T,.38],[2*T,.62,T,.38]] },
    { n:'Groß links, drei rechts', c:[[0,0,.62,1],[.62,0,.38,T],[.62,T,.38,T],[.62,2*T,.38,T]] },
    { n:'Vier Streifen', c:[[0,0,1,.25],[0,.25,1,.25],[0,.5,1,.25],[0,.75,1,.25]] },
  ],
  5: [
    { n:'Zwei oben, drei unten', c:[[0,0,.5,.56],[.5,0,.5,.56],[0,.56,T,.44],[T,.56,T,.44],[2*T,.56,T,.44]] },
    { n:'Groß oben, vier unten', c:[[0,0,1,.44],[0,.44,.5,.28],[.5,.44,.5,.28],[0,.72,.5,.28],[.5,.72,.5,.28]] },
    { n:'Groß in der Mitte', c:[[0,0,.5,.28],[.5,0,.5,.28],[0,.28,1,.44],[0,.72,.5,.28],[.5,.72,.5,.28]] },
  ],
  6: [
    { n:'Raster 2 × 3', c:[[0,0,.5,T],[.5,0,.5,T],[0,T,.5,T],[.5,T,.5,T],[0,2*T,.5,T],[.5,2*T,.5,T]] },
    { n:'Raster 3 × 2', c:[[0,0,T,.5],[T,0,T,.5],[2*T,0,T,.5],[0,.5,T,.5],[T,.5,T,.5],[2*T,.5,T,.5]] },
    { n:'Groß oben, zwei, drei', c:[[0,0,1,.42],[0,.42,.5,.3],[.5,.42,.5,.3],[0,.72,T,.28],[T,.72,T,.28],[2*T,.72,T,.28]] },
  ],
};
// 7–12 Fotos: Anordnungen aus Reihen erzeugt, z. B. [2,3,2] = drei Reihen mit 2, 3 und 2 Fotos;
// eine Reihe mit nur einem Foto wird höher
function rowsLayout(counts) {
  const wt = counts.map(n => n === 1 ? 1.5 : 1), sum = wt.reduce((a, b) => a + b, 0), c = [];
  let y = 0;
  counts.forEach((n, r) => { const h = wt[r] / sum; for (let i = 0; i < n; i++) c.push([i / n, y, 1 / n, h]); y += h; });
  return { n: (counts[0] === 1 ? 'Groß oben, dann ' + counts.slice(1).join(' · ') : 'Reihen ' + counts.join(' · ')), c };
}
Object.entries({
  7: [[2,3,2],[1,3,3],[3,4],[2,2,3]], 8: [[2,3,3],[3,2,3],[2,2,2,2],[1,3,4]], 9: [[3,3,3],[2,3,4],[1,4,4],[2,2,2,3]],
  10: [[3,4,3],[2,3,3,2],[1,3,3,3],[2,2,2,2,2]], 11: [[3,4,4],[2,3,3,3],[1,3,3,4]], 12: [[3,3,3,3],[4,4,4],[2,3,4,3],[1,3,4,4]],
}).forEach(([n, list]) => { COLLAGES[n] = list.map(rowsLayout); });

// --- Zeichnen ---
// Titel (kind 'head') in der Schrift der Gruppe, alles andere in Inter. Schriften aus einer Datei haben nur eine Stärke:
// die gilt statt der Stärke der Vorlage (sonst rechnet der Browser eine unschöne Fettung dazu), k gleicht die Größe an.
function fam(kind) {
  if (kind !== 'head') return 'Inter, system-ui, sans-serif';
  const f = fontOf(state.font);
  return `"${f.fam}", ${f.fb}`;
}
const fontWaits = new Set();
function needFont(f) {   // falls eine Schrift beim Zeichnen noch nicht geladen ist: laden und danach neu zeichnen
  if (!f.file || fontWaits.has(f.id) || !document.fonts || !document.fonts.load) return;
  fontWaits.add(f.id);
  if (!document.fonts.check(`${f.w} 40px "${f.fam}"`)) document.fonts.load(`${f.w} 40px "${f.fam}"`).then(() => beiSchrift(), () => {});
}
function font(weight, size, kind = 'body') {
  if (kind === 'head') {
    const f = fontOf(state.font);
    if (f.file) { weight = f.w; size = Math.round(size * f.k); needFont(f); }
  }
  ctx.font = `${weight} ${size}px ${fam(kind)}`;
}
function wrap(text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = word; }
      else line = test;
    }
    out.push(line);
  }
  return out;
}
// zeichnet umbrochenen Text, liefert das neue y
function textBlock(text, x, y, maxW, lh, align = 'left') {
  ctx.textAlign = align;
  const ax = align === 'center' ? x + maxW / 2 : x;
  for (const l of wrap(text, maxW)) { ctx.fillText(l, ax, y); y += lh; }
  ctx.textAlign = 'left';
  return y;
}
// wie textBlock, aber höchstens max Zeilen (die letzte endet dann mit …)
function clampBlock(text, x, y, maxW, lh, max, align = 'left') {
  let l = wrap(text, maxW);
  if (l.length > max) { l = l.slice(0, max); l[max - 1] = l[max - 1].replace(/[\s.,;:!?–-]*$/, '') + ' …'; }
  ctx.textAlign = align;
  const ax = align === 'center' ? x + maxW / 2 : x;
  for (const s of l) { ctx.fillText(s, ax, y); y += lh; }
  ctx.textAlign = 'left';
  return y;
}
// Fließtext der Vorlagen: zeichnet höchstens max Zeilen und merkt sich in spill, was nicht mehr passte.
// Der Rest läuft auf dem nächsten Bild weiter (siehe flow()); nur wenn kein Bild mehr folgt, endet die letzte Zeile mit …
// Getrennt wird nicht mitten im Satz: Folgt noch ein Bild, endet der Text am letzten Absatz- oder Satzende, das noch
// passt; gibt es keines, an einem Komma in den letzten beiden Zeilen, sonst am Zeilenende.
// spill, moreFollows und dry stehen oben bei der Umgebung (dry: nur messen, nichts Sichtbares zeichnen)
const ABBR = /^(?:\d+\.|[A-Za-zÄÖÜäöü]\.|(?:bzw|ca|Dr|Prof|Nr|St|Str|evtl|ggf|inkl|max|min|sog|vgl|Tel|Jh|Mo|Di|Mi|Do|Fr|Sa|So|Jan|Feb|Aug|Sept|Okt|Nov|Dez)\.)$/;
const sentEnd = (w, next) => /[.!?…]["“”»«‹›')\]]*$/.test(w) && !ABBR.test(w.replace(/^[("„“»«‚']+/, ''))
  && !(next && /^[a-zäöüß]/.test(next));
function bodyLayout(text, maxW, max) {
  const all = [];                                     // Zeilen als { w: Wörter, p: Absatz }
  String(text).split('\n').forEach((para, pi) => {
    let line = [], any = false;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line.length && ctx.measureText(line.join(' ') + ' ' + word).width > maxW) { all.push({ w: line, p: pi }); any = true; line = [word]; }
      else line.push(word);
    }
    if (line.length || !any) all.push({ w: line, p: pi });
  });
  const n = Math.max(0, Math.min(max, all.length));
  if (n >= all.length) return { lines: all.map(l => l.w.join(' ')), spill: '' };
  let li = n - 1, wi = n ? all[li].w.length : 0;      // Ende des Bilds: nach Wort wi - 1 der Zeile li
  if (n && moreFollows && all[n].p === all[li].p) {   // die letzte Zeile endet mitten im Absatz
    const nextWord = (i, j) => all[i].w[j + 1] || (all[i + 1] && all[i + 1].p === all[i].p ? all[i + 1].w[0] : null);
    let hit = null;
    for (let i = n - 1; i >= 0 && !hit; i--) {
      if (i < n - 1 && all[i + 1].p !== all[i].p) { hit = [i, all[i].w.length]; break; }
      for (let j = all[i].w.length - 1; j >= 0; j--) if (sentEnd(all[i].w[j], nextWord(i, j))) { hit = [i, j + 1]; break; }
    }
    for (let i = n - 1; i >= Math.max(0, n - 2) && !hit; i--)
      for (let j = all[i].w.length - 1; j >= 0; j--) if (/[,;:–—]$/.test(all[i].w[j])) { hit = [i, j + 1]; break; }
    if (hit) [li, wi] = hit;
  }
  const lines = all.slice(0, li + 1).map(l => l.w.join(' '));
  if (n) lines[li] = all[li].w.slice(0, wi).join(' ');
  let rest = n ? all[li].w.slice(wi).join(' ') : '';
  for (let i = li + 1; i < all.length; i++) rest += (i && all[i].p === all[i - 1].p ? ' ' : '\n') + all[i].w.join(' ');
  return { lines, spill: rest.replace(/^\s+|\s+$/g, '') };
}
function bodyBlock(text, x, y, maxW, lh, max, align = 'left') {
  const lay = bodyLayout(text, maxW, max), n = lay.lines.length;
  spill = lay.spill;
  ctx.textAlign = align;
  const ax = align === 'center' ? x + maxW / 2 : x;
  for (let i = 0; i < n; i++) {
    const cut = i === n - 1 && spill && !moreFollows;
    ctx.fillText(cut ? lay.lines[i].replace(/[\s.,;:!?–-]*$/, '') + ' …' : lay.lines[i], ax, y); y += lh;
  }
  ctx.textAlign = 'left';
  return y;
}
const isDark = c => parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) + parseInt(c.slice(5, 7), 16) < 384;
const oneLine = t => t.split('\n').filter(s => s.trim()).join(' · ');
function bgGradient(p) {
  if (dry) return;
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, p.bg1); g.addColorStop(1, p.bg2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const im = p.style && styleImg(p.style, 'back');           // eigenes Hintergrundbild des Stils statt des Verlaufs
  if (im) ctx.drawImage(im, 0, 0, W, H);
  deco(p, 'back');
}
// ---- Regel für alle Vorlagen (19.11.2026): Jede Vorlage folgt dem Stil. Hintergrund und Schmuck über stilGrund() bzw.
// stilPapier(), Schrift auf farbigen Flächen über lesbar(). Feste Farben nur für Dinge mit eigener Farbe (Fotos,
// Sofortbild-Rahmen, Karteikarten). werkzeuge/vorlagen_pruefen.mjs prüft das vor jedem Bau und Veröffentlichen. ----
// Farbe a nach b mischen (t = 0 … 1), beide als #rrggbb
function mischen(a, b, t) {
  const x = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), y = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
// gut lesbare Schriftfarbe auf der Fläche c: weiß oder fast schwarz (nach der Helligkeit, wie sie das Auge sieht)
function lesbar(c) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b > .3 ? '#1f1a14' : '#ffffff';
}
// Hintergrund aus dem Stil (Farbverlauf oder eigenes Bild, dazu der Schmuck); struktur: 'kork' legt eine Körnung darüber
function stilGrund(p, o = {}) {
  bgGradient(p);
  if (dry || !o.struktur) return;
  const R = seeded(o.seed || 7);
  if (o.struktur === 'kork') {
    for (let i = 0; i < 2600; i++) { ctx.fillStyle = R() < .5 ? 'rgba(0,0,0,.16)' : 'rgba(255,255,255,.14)'; const r = 1 + R() * 3.2; ctx.beginPath(); ctx.arc(R() * W, R() * H, r, 0, 7); ctx.fill(); }
    const g = ctx.createRadialGradient(W / 2, H / 2, W * .3, W / 2, H / 2, H * .75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.3)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
}
// Albumseite: ein helles Blatt auf dem Hintergrund des Stils (am Rand sichtbar), getönt in der kräftigeren Farbe des Stils,
// mit Papierstruktur und zartem Schmuck; liefert Papier- und Schriftfarbe
function stilPapier(p, seed = 11) {
  const satt = c => { const v = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); return Math.max(...v) - Math.min(...v); };
  const farbig = satt(p.bg2) >= satt(p.bg1) ? p.bg2 : p.bg1, rand = 30;
  const papier = mischen(mischen('#fbf8f1', farbig, .2), p.acc, .05), ink = mischen(lesbar(papier), farbig, .3);
  if (dry) return { papier, ink };
  bgGradient(p);
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
  ctx.fillStyle = papier; ctx.fillRect(rand, rand, W - 2 * rand, H - 2 * rand); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(rand, rand, W - 2 * rand, H - 2 * rand); ctx.clip();
  const R = seeded(seed);
  for (let i = 0; i < 900; i++) { ctx.fillStyle = `rgba(120,90,50,${.04 + R() * .06})`; ctx.fillRect(R() * W, R() * H, 2 + R() * 3, 2 + R() * 3); }
  deco(p, 'back', .45);
  ctx.restore();
  return { papier, ink };
}
// Schmuck eines Stils (STYLES[..].deco[layer]): Formen an festen Zufallsstellen, bei jedem Zeichnen gleich; staerke dämpft (Papier)
function deco(p, layer, staerke = 1) {
  const list = !dry && p.style && p.style.deco && p.style.deco[layer];
  if (!list) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (const d of list) {
    let a = d.seed >>> 0;
    const rnd = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const [y0, y1] = d.area || [0, 1];
    for (let i = 0; i < d.n; i++) {
      const x = rnd() * W, y = (y0 + rnd() * (y1 - y0)) * H, sz = d.size[0] + rnd() * (d.size[1] - d.size[0]);
      const col = d.colors[Math.floor(rnd() * d.colors.length)], rot = rnd() * Math.PI * 2;
      // zum unteren Rand des Bereichs hin ausdünnen, damit der Schmuck nicht hart endet
      ctx.globalAlpha = staerke * d.alpha * (y1 - y0 < 1 && y1 > y0 ? Math.min(1, 1.6 * (1 - (y / H - y0) / (y1 - y0))) : 1);
      ctx.fillStyle = ctx.strokeStyle = col;
      ctx.save(); ctx.translate(x, y); ctx.rotate(d.shape === 'heart' ? (rot / Math.PI - 1) * .4 : rot);
      if (d.shape === 'dot') { ctx.beginPath(); ctx.arc(0, 0, sz / 2, 0, 7); ctx.fill(); }
      else if (d.shape === 'confetti') ctx.fillRect(-sz / 2, -sz / 5, sz, sz / 2.5);
      else if (d.shape === 'leaf') {                     // Blatt: zwei Bögen von Spitze zu Spitze
        const r = sz / 2; ctx.beginPath(); ctx.moveTo(0, -r);
        ctx.quadraticCurveTo(r * 1.05, -r * .15, 0, r); ctx.quadraticCurveTo(-r * 1.05, -r * .15, 0, -r); ctx.fill();
      } else if (d.shape === 'heart') {
        const r = sz / 2; ctx.beginPath(); ctx.moveTo(0, r * .9);
        ctx.bezierCurveTo(-r * 1.5, -r * .1, -r * .7, -r * 1.1, 0, -r * .35);
        ctx.bezierCurveTo(r * .7, -r * 1.1, r * 1.5, -r * .1, 0, r * .9); ctx.fill();
      } else if (d.shape === 'flower') {                 // fünf Blütenblätter um eine Mitte
        const r = sz / 2; ctx.beginPath();
        for (let k = 0; k < 5; k++) { const w = k * Math.PI * .4; ctx.moveTo(Math.cos(w) * r * .55 + r * .36, Math.sin(w) * r * .55); ctx.arc(Math.cos(w) * r * .55, Math.sin(w) * r * .55, r * .36, 0, 7); }
        ctx.moveTo(r * .28, 0); ctx.arc(0, 0, r * .28, 0, 7); ctx.fill();
      } else if (d.shape === 'star') {                   // vierzackiger Funkelstern
        ctx.beginPath();
        for (let k = 0; k < 8; k++) { const r = k % 2 ? sz * .22 : sz, w = k * Math.PI / 4; ctx.lineTo(Math.cos(w) * r, Math.sin(w) * r); }
        ctx.fill();
      } else {                                           // Schneeflocke: sechs Arme mit je zwei Seitenästen
        const r = sz / 2; ctx.lineWidth = Math.max(2, sz / 16);
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          ctx.moveTo(0, 0); ctx.lineTo(0, -r);
          ctx.moveTo(0, -r * .58); ctx.lineTo(-r * .24, -r * .82);
          ctx.moveTo(0, -r * .58); ctx.lineTo(r * .24, -r * .82);
          ctx.rotate(Math.PI / 3);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  ctx.restore();
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// wie CSS object-fit: cover, mit Fokuspunkt
function cover(img, x, y, w, h, r = 0) {
  if (dry) return;
  const fx = state.fx / 100, fy = state.fy / 100;
  const s = Math.max(w / img.width, h / img.height) * (anim ? anim.zoom : 1);
  const sw = w / s, sh = h / s;
  const sx = (img.width - sw) * fx, sy = (img.height - sh) * fy;
  ctx.save();
  if (r) { roundRect(x, y, w, h, r); ctx.clip(); }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}
// unbeschnitten wie object-fit: contain; die Ränder füllt eine weichgezeichnete Fassung des Fotos
function contain(img, x, y, w, h, r = 0) {
  if (dry) return;
  ctx.save();
  roundRect(x, y, w, h, r); ctx.clip();
  const b = img.blur || img, bs = Math.max(w / b.width, h / b.height);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(b, x + (w - b.width * bs) / 2, y + (h - b.height * bs) / 2, b.width * bs, b.height * bs);
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x, y, w, h);
  const s = Math.min(w / img.width, h / img.height);
  ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s);
  ctx.restore();
}
// Foto je nach Einstellung bildfüllend (Ausschnitt) oder ganz zeigen
function place(img, x, y, w, h, r = 0) { state.fit === 'contain' ? contain(img, x, y, w, h, r) : cover(img, x, y, w, h, r); }
function placeholder(x, y, w, h, r, p) {
  if (dry) return;
  ctx.save(); roundRect(x, y, w, h, r); ctx.fillStyle = p.fg + '22'; ctx.fill();
  font(600, w < 360 ? 60 : 34); ctx.fillStyle = p.fg + '99'; ctx.textAlign = 'center';
  ctx.fillText(w < 360 ? '+' : 'Foto hinzufügen', x + w / 2, y + h / 2 + (w < 360 ? 20 : 12)); ctx.restore();
}
function collageCells() {
  const list = COLLAGES[state.colN] || COLLAGES[4];
  return (list[state.colLay[state.colN] || 0] || list[0]).c;
}
function footerLine(p, color) {
  const f = state.footer.trim(); if (!f) return;
  font(600, 34); ctx.fillStyle = color || p.fg; ctx.globalAlpha = 0.85;
  ctx.fillText(f, PAD, H - SAFE_BOTTOM + 20); ctx.globalAlpha = 1;
}

// ---------- Vorlagen ----------
// ---- Formatfest (19.11.2026): Die Vorlagen passen sich der Höhe der Seite an (Status 1080 × 1920, Fotobuch-Seiten). Fotos und
// Flächen werden nur kleiner, wenn Titel und Text sonst nicht auf die Seite oder über die Fußzeile passen; was im Status schon passte,
// bleibt Pixel für Pixel gleich. Geprüft mit tests/formate-pruefung.mjs (kein Text außerhalb der Seite, keiner überdeckt anderen).
const fussOben = () => H - SAFE_BOTTOM - 8;                        // Oberkante der Fußzeile (Grundlinie bei H - SAFE_BOTTOM + 20, Schrift 34 px)
const passend = (soll, frei, min = 140) => Math.max(min, Math.min(soll, frei));   // so groß wie bisher, höchstens so groß wie frei
const TEMPLATES = {
  photo(p) {
    const img = photo(0);
    font(800, 92, 'head'); const tl = wrap(state.title, W - 2 * PAD);
    // der Text wächst von unten nach oben, höchstens bis etwa zur Bildmitte (auf kleinen Seiten bis knapp unter den oberen Rand)
    font(400, 44); const bmax = Math.max(1, Math.floor((Math.min(720, H - SAFE_BOTTOM - 85 - SAFE_TOP - 20) - tl.length * 104) / 60));
    const bn = bodyLayout(state.text, W - 2 * PAD, bmax).lines.length;
    let y = H - SAFE_BOTTOM - 85 - bn * 60 - tl.length * 104;   // die letzte Zeile endet über dem Wasserzeichen
    if (img) { place(img, 0, 0, W, H); deco(p, 'photo'); }
    else {                                                     // Platzhalter über dem Text; ist dafür kein Platz, entfällt er
      bgGradient(p); const py = Math.min(500, SAFE_TOP + 250, Math.max(SAFE_TOP, y - 20 - 300)), room = y - 20 - py;
      if (room >= 80) placeholder(PAD, py, W - 2 * PAD, Math.min(700, room), 40, p);
    }
    const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.45, W, H * 0.55);
    ctx.fillStyle = '#fff'; font(800, 92, 'head'); y = textBlock(state.title, PAD, y + 60, W - 2 * PAD, 104);
    font(400, 44); ctx.fillStyle = '#ffffffdd'; bodyBlock(state.text, PAD, y + 10, W - 2 * PAD, 60, bmax);
    footerLine(p, '#ffffff');
  },
  report(p) {
    bgGradient(p);
    let y = SAFE_TOP;
    font(800, 84, 'head'); ctx.fillStyle = p.fg; y = textBlock(state.title, PAD, y + 70, W - 2 * PAD, 96);   // ohne Etikett „BERICHT“ (Wunsch des Nutzers, 19.11.2026)
    const ph = passend(640, H - SAFE_BOTTOM - 60 - 120 - (y + 10), 120);   // darunter Platz für mindestens zwei Stichpunkte
    if (photo(0)) place(photo(0), PAD, y + 10, W - 2 * PAD, ph, 36);
    else placeholder(PAD, y + 10, W - 2 * PAD, ph, 36, p);
    y += ph + 100;
    font(400, 46);
    // Stichpunkte, solange Platz ist; ein zu langer Punkt wird geteilt, der Rest steht auf dem nächsten Bild
    const items = state.text.split('\n').filter(s => s.trim()), last = H - SAFE_BOTTOM - 60;
    let k = 0, rest = '';
    for (; k < items.length; k++) {
      const room = Math.floor((last - y) / 60) + 1;
      if (room < 1) break;
      ctx.fillStyle = p.acc; ctx.beginPath(); ctx.arc(PAD + 12, y - 15, 11, 0, 7); ctx.fill();
      ctx.fillStyle = p.fg; y = bodyBlock(items[k].trim(), PAD + 50, y, W - 2 * PAD - 50, 60, room) + 22;
      if (spill) { rest = spill; k++; break; }
    }
    spill = [rest, ...items.slice(k)].filter(Boolean).join('\n');
    footerLine(p);
  },
  collage(p) {
    bgGradient(p);
    const top = SAFE_TOP - 40, gap = 20, w = W - 2 * PAD, e = 1e-6;
    font(800, 80, 'head'); const tn = Math.max(1, wrap(state.title, w).length);
    const areaH = passend(1150, fussOben() - top - (110 + (tn - 1) * 92 + 30));   // darunter muss der Titel über die Fußzeile passen
    collageCells().forEach(([cx, cy, cw, ch], i) => {
      // halber Abstand an jeder Kante, die nicht am Rand der Collagefläche liegt
      const x0 = PAD + cx * w + (cx > e ? gap / 2 : 0), x1 = PAD + (cx + cw) * w - (cx + cw < 1 - e ? gap / 2 : 0);
      const y0 = top + cy * areaH + (cy > e ? gap / 2 : 0), y1 = top + (cy + ch) * areaH - (cy + ch < 1 - e ? gap / 2 : 0);
      photo(i) ? place(photo(i), x0, y0, x1 - x0, y1 - y0, 28) : placeholder(x0, y0, x1 - x0, y1 - y0, 28, p);
    });
    let y = top + areaH + 110;
    font(800, 80, 'head'); ctx.fillStyle = p.fg; y = textBlock(state.title, PAD, y, w, 92);
    font(400, 42); ctx.fillStyle = p.fg; ctx.globalAlpha = .85;
    const room = Math.floor((H - SAFE_BOTTOM - 30 - (y + 10)) / 56) + 1;   // nur so viele Zeilen, wie über der Fußzeile Platz haben
    bodyBlock(oneLine(state.text), PAD, y + 10, w, 56, Math.max(0, Math.min(2, room))); ctx.globalAlpha = 1;
    footerLine(p);
  },
  quote(p) {
    bgGradient(p);
    if (photo(0)) { ctx.globalAlpha = .18; cover(photo(0), 0, 0, W, H); ctx.globalAlpha = 1; }
    const my = Math.min(SAFE_TOP + 390, H / 3);                      // Grundlinie des Anführungszeichens (Status: 640)
    if (state.text.trim()) { font(800, Math.min(360, Math.round(my * 1.2)), 'head'); ctx.fillStyle = p.acc; ctx.fillText('“', PAD - 10, my); }
    font(600, 70, 'head'); ctx.fillStyle = p.fg;
    const body = state.text.replace(/\n/g, ' ');
    const platz = fussOben() - (state.title.trim() ? 92 + 50 + 14 : 25);   // letzte Grundlinie: Unterschrift steht 142 px tiefer, dann die Fußzeile
    const maxL = Math.max(1, Math.min(9, Math.floor((platz - (my + 80)) / 92) + 1));
    const lines = bodyLayout(body, W - 2 * PAD, maxL).lines.length;
    let y = Math.min(Math.max(my + 80, (H - lines * 92) / 2), platz - (lines - 1) * 92);
    y = bodyBlock(body, PAD, y, W - 2 * PAD, 92, maxL);
    if (state.title.trim()) { font(800, 44); ctx.fillStyle = p.acc; ctx.fillText('— ' + state.title, PAD, y + 50); }
    footerLine(p);
  },
  // Countdown: große Zahl der Tage bis zum Ereignis (state.cdDate), darunter Titel, Datum und kurzer Text.
  // Mit Foto liegt es abgedunkelt im Hintergrund, sonst der Verlauf des Stils. Gerechnet wird mit dem heutigen Tag.
  countdown(p) {
    if (dry) return;
    const bg = photo(0), ink = bg ? '#ffffff' : p.fg, cd = countdownInfo(state.cdDate);
    if (bg) {
      cover(bg, 0, 0, W, H);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(.5, 'rgba(0,0,0,.38)'); g.addColorStop(1, 'rgba(0,0,0,.62)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); tplInk = ink;
    } else bgGradient(p);
    // Maßstab s: 1 im Status; kleiner nur, wenn Ring, Titel, Datum und Text sonst nicht über die Fußzeile passen
    font(800, 78, 'head'); const tn = state.title.trim() ? Math.min(2, wrap(state.title, W - 2 * PAD).length) : 0;
    font(400, 42); const xn = state.text.trim() ? Math.min(3, wrap(oneLine(state.text), W - 2 * PAD).length) : 0;
    let yy = 1010, ende = 580 + 344;                                    // ab SAFE_TOP: erste Grundlinie des Titels, unterer Rand des Rings
    if (tn) { ende = yy + (tn - 1) * 90 + 16; yy += tn * 90 + 4; }
    if (cd.date) { ende = yy + 20; yy += 74; }
    if (xn) ende = yy + 20 + (xn - 1) * 58 + 14;
    const s = Math.min(1, (fussOben() - SAFE_TOP) / ende), fs = v => s === 1 ? v : Math.round(v * s);
    const cx = W / 2, cy = SAFE_TOP + 580 * s;
    ctx.save(); ctx.strokeStyle = p.acc; ctx.globalAlpha = .55; ctx.lineWidth = 10 * s;
    ctx.beginPath(); ctx.arc(cx, cy, 300 * s, 0, 7); ctx.stroke(); ctx.globalAlpha = .25; ctx.lineWidth = 4 * s;
    ctx.beginPath(); ctx.arc(cx, cy, 334 * s, 0, 7); ctx.stroke(); ctx.restore();
    ctx.textAlign = 'center'; ctx.fillStyle = ink;
    if (cd.top) { font(600, fs(60)); ctx.fillStyle = bg ? '#ffffff' : p.acc; ctx.fillText(cd.top, cx, cy - 190 * s); ctx.fillStyle = ink; }
    let size = fs(cd.big.length > 3 ? 260 : 330);
    font(800, size, 'head');
    const maxW = 520 * s, mw = ctx.measureText(cd.big).width;
    if (mw > maxW) { size = Math.floor(size * maxW / mw); font(800, size, 'head'); }
    const hs = +(ctx.font.match(/(\d+)px/) || [0, size])[1];
    ctx.fillText(cd.big, cx, cy + hs * .34);
    if (cd.unit) {                                   // muss in den Kreis passen (Sehne auf dieser Höhe gut 440 px)
      let us = fs(70); font(700, us); const uw = ctx.measureText(cd.unit).width;
      if (uw > 400 * s) { us = Math.floor(us * 400 * s / uw); font(700, us); }
      ctx.fillText(cd.unit, cx, cy + 200 * s);
    }
    let y = cy + 430 * s;
    if (state.title.trim()) { font(800, fs(78), 'head'); y = clampBlock(state.title, PAD, y, W - 2 * PAD, 90 * s, 2, 'center') + 4 * s; ctx.textAlign = 'center'; }   // clampBlock stellt auf links zurück
    if (cd.date) { font(500, fs(44)); ctx.globalAlpha = .85; ctx.fillText(cd.date, cx, y + 6 * s); ctx.globalAlpha = 1; y += 74 * s; }
    if (state.text.trim()) { font(400, fs(42)); ctx.globalAlpha = .9; clampBlock(oneLine(state.text), PAD, y + 20 * s, W - 2 * PAD, 58 * s, 3, 'center'); ctx.globalAlpha = 1; }
    ctx.textAlign = 'left';
    footerLine(p, bg ? '#ffffff' : undefined);
  },
  // Sofortbild: weißer Rahmen leicht gedreht, Titel als Bildunterschrift
  polaroid(p) {
    bgGradient(p);
    // Maßstab k des Sofortbilds: 1 im Status; kleiner nur, wenn der Text darunter sonst nicht über die Fußzeile passt
    font(400, 44); const xn = state.text.trim() ? Math.min(4, bodyLayout(state.text, W - 2 * PAD, 4).lines.length) : 0;
    const k = Math.max(.3, Math.min(1, (fussOben() - SAFE_TOP - 10 - (xn ? 120 + (xn - 1) * 60 + 14 : 20)) / 1010));
    const cw = 820 * k, ch = 1010 * k, m = 44 * k, ph = 760 * k, ink = '#26221d';
    ctx.save(); ctx.translate(W / 2, SAFE_TOP + 10 + ch / 2); ctx.rotate(-0.03);
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
    ctx.fillStyle = '#fdfcf8'; ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
    ctx.shadowColor = 'transparent';
    const x = -cw / 2 + m, y = -ch / 2 + m, w = cw - 2 * m;
    if (photo(0)) place(photo(0), x, y, w, ph); else placeholder(x, y, w, ph, 0, { fg: ink });
    font(700, k === 1 ? 56 : Math.round(56 * k), 'head'); ctx.fillStyle = ink;
    const two = wrap(state.title, w).length > 1;
    clampBlock(state.title, x, y + ph + (two ? 80 : 114) * k, w, 66 * k, 2, 'center');
    ctx.restore();
    const tz = Math.max(0, Math.min(4, Math.floor((fussOben() - 14 - (SAFE_TOP + ch + 120)) / 60) + 1));   // Zeilen, die noch passen
    font(400, 44); ctx.fillStyle = p.fg; ctx.globalAlpha = .9;
    bodyBlock(state.text, PAD, SAFE_TOP + ch + 120, W - 2 * PAD, 60, tz); ctx.globalAlpha = 1;
    footerLine(p);
  },
  // ---- Vorlagen vom 19.11.2026 (Wunsch des Nutzers): Pinwand, Album, Magazin, Formen-Collage ----
  // Pinwand: bis zu 6 Fotos als Sofortbilder auf einer Pinnwand in den Farben des Stils (Kork-Körnung, Schmuck), mit Pinnadeln
  // und Klebeband; Titel auf einem Zettel in der Akzentfarbe, Text auf einer Karteikarte. Die Fotos dürfen sich überlappen.
  pinboard(p) {
    stilGrund(p, { struktur: 'kork' });
    const zettel = p.acc, zettelInk = lesbar(zettel);
    const hasT = !!state.title.trim(), hasX = !!state.text.trim();
    let top = SAFE_TOP - 30;
    if (hasT) {                                                                  // Zettel mit dem Titel
      font(800, 74, 'head'); const tl = wrap(state.title, W - 2 * PAD - 80).slice(0, 2), nh = 70 + tl.length * 86;
      ctx.save(); ctx.translate(W / 2, top + nh / 2); ctx.rotate(-.025);
      ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10;
      ctx.fillStyle = zettel; ctx.fillRect(-(W - 2 * PAD) / 2, -nh / 2, W - 2 * PAD, nh); ctx.shadowColor = 'transparent';
      ctx.fillStyle = zettelInk; tl.forEach((l, i) => { ctx.textAlign = 'center'; ctx.fillText(l, 0, -nh / 2 + 100 + i * 86); }); ctx.textAlign = 'left';
      pin(0, -nh / 2 + 6, zettelInk === '#ffffff' ? '#f2f2f2' : '#d33'); ctx.restore();
      top += nh + 40;
    }
    const bottom = H - SAFE_BOTTOM - (hasX ? 330 : 40);
    const k = Math.max(1, slots(6)), aw = W - 2 * PAD, ah = bottom - top;
    const LAY = { 1: [[.5, .5, -2]], 2: [[.33, .29, -5], [.67, .71, 4]], 3: [[.3, .2, -6], [.7, .5, 5], [.32, .8, -3]],
      4: [[.27, .25, -5], [.73, .27, 4], [.29, .75, 3], [.71, .76, -6]], 5: [[.27, .19, -5], [.73, .21, 4], [.5, .5, -2], [.27, .81, 3], [.73, .8, -5]],
      6: [[.27, .17, -5], [.73, .18, 4], [.28, .5, 3], [.72, .5, -4], [.27, .83, -3], [.73, .82, 5]] }[k];
    const rows = k === 1 ? 1 : k === 2 ? 1.75 : k <= 4 ? 2 : 3, fw = Math.min(aw * (k === 1 ? .9 : .6), ah / rows / 1.2 * (k >= 5 ? 1.34 : 1.16));   // größer, sie dürfen überlappen
    LAY.forEach(([cx, cy, rot], i) => {
      const fh = fw * 1.18, m = fw * .06;
      ctx.save(); ctx.translate(PAD + cx * aw, top + cy * ah); ctx.rotate(rot * Math.PI / 180);
      ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 12;
      ctx.fillStyle = '#fbfaf5'; ctx.fillRect(-fw / 2, -fh / 2, fw, fh); ctx.shadowColor = 'transparent';
      const img = photo(i);
      if (img) place(img, -fw / 2 + m, -fh / 2 + m, fw - 2 * m, fw - 2 * m); else placeholder(-fw / 2 + m, -fh / 2 + m, fw - 2 * m, fw - 2 * m, 0, { fg: '#555' });
      if (i % 3 === 1) tape(0, -fh / 2, fw * .42, rot); else pin(0, -fh / 2 + m * .5, ['#d33', '#2a7de1', '#2bb673', '#f2a516'][i % 4]);
      ctx.restore();
    });
    if (hasX) {                                                                  // Karteikarte mit dem Text
      const ch = 280, cy = H - SAFE_BOTTOM - ch - 20;
      ctx.save(); ctx.translate(W / 2, cy + ch / 2); ctx.rotate(.015);
      ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-(W - 2 * PAD) / 2, -ch / 2, W - 2 * PAD, ch); ctx.shadowColor = 'transparent';
      ctx.strokeStyle = 'rgba(60,110,200,.25)'; ctx.lineWidth = 2;
      for (let y = -ch / 2 + 92; y < ch / 2 - 10; y += 56) { ctx.beginPath(); ctx.moveTo(-(W - 2 * PAD) / 2 + 20, y + 12); ctx.lineTo((W - 2 * PAD) / 2 - 20, y + 12); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(220,60,60,.4)'; ctx.beginPath(); ctx.moveTo(-(W - 2 * PAD) / 2, -ch / 2 + 50); ctx.lineTo((W - 2 * PAD) / 2, -ch / 2 + 50); ctx.stroke();
      font(400, 40); ctx.fillStyle = '#26303d';
      bodyBlock(state.text, -(W - 2 * PAD) / 2 + 36, -ch / 2 + 98, W - 2 * PAD - 72, 56, 3);
      pin(0, -ch / 2 + 4, p.acc); ctx.restore();
    }
    footerLine(p);
  },
  // Album: bis zu 4 Fotos mit Fotoecken auf Papier in den Farben des Stils (stilPapier: getönt, zarter Schmuck), Titel in Handschrift
  // (wenn keine Schrift gewählt ist), Text als Notiz. Die Fotos dürfen sich überlappen.
  scrapbook(p) {
    const { ink } = stilPapier(p), ecke = mischen(p.acc, '#000000', .45);
    ctx.strokeStyle = 'rgba(120,90,50,.18)'; ctx.lineWidth = 3; ctx.setLineDash([2, 14]);
    ctx.strokeRect(60, 60, W - 120, H - 120); ctx.setLineDash([]);
    tplInk = ink;
    const keepF = state.font; if (!state.font || state.font === 'sans') state.font = 'hand';
    let top = SAFE_TOP - 20;
    if (state.title.trim()) {
      font(700, 96, 'head'); ctx.fillStyle = ink; top = clampBlock(state.title, PAD, top + 80, W - 2 * PAD, 104, 2, 'center') + 10;
      ctx.strokeStyle = p.acc; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath();
      for (let x = W / 2 - 180; x <= W / 2 + 180; x += 10) ctx.lineTo(x, top + Math.sin(x / 18) * 6); ctx.stroke(); top += 50;
    }
    state.font = keepF;
    const hasX = !!state.text.trim(), bottom = H - SAFE_BOTTOM - (hasX ? 250 : 40);
    const k = Math.max(1, slots(4)), aw = W - 2 * PAD, ah = bottom - top;
    const LAY = { 1: [[0, 0, 1, 1, -1.5]], 2: [[0, 0, .78, .5, -2.5], [.22, .5, .78, .5, 2]], 3: [[0, 0, .6, .52, -3], [.4, .2, .6, .45, 3], [.1, .55, .7, .45, -1.5]],
      4: [[0, 0, .5, .5, -3], [.5, .02, .5, .48, 2.5], [0, .5, .5, .48, 2], [.5, .52, .5, .48, -2.5]] }[k];
    const gr = k === 1 ? 1.03 : 1.13;                                            // größer, sie dürfen überlappen
    LAY.forEach(([x, y, w, h, rot], i) => {
      const bw = (w * aw - 32) * gr, bh = (h * ah - 32) * gr, bx = PAD + (x + w / 2) * aw - bw / 2, by = top + (y + h / 2) * ah - bh / 2;
      ctx.save(); ctx.translate(bx + bw / 2, by + bh / 2); ctx.rotate(rot * Math.PI / 180);
      ctx.shadowColor = 'rgba(70,50,20,.3)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-bw / 2, -bh / 2, bw, bh); ctx.shadowColor = 'transparent';
      const m = 18, img = photo(i);
      if (img) place(img, -bw / 2 + m, -bh / 2 + m, bw - 2 * m, bh - 2 * m); else placeholder(-bw / 2 + m, -bh / 2 + m, bw - 2 * m, bh - 2 * m, 0, { fg: ink });
      ctx.fillStyle = ecke; const c = Math.min(bw, bh) * .13;                     // Fotoecken in einem dunklen Ton der Akzentfarbe
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => { const ex = sx * bw / 2, ey = sy * bh / 2;
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - sx * c, ey); ctx.lineTo(ex, ey - sy * c); ctx.closePath(); ctx.fill(); });
      ctx.restore();
    });
    if (hasX) {
      font(400, 42); ctx.fillStyle = ink;
      const y0 = H - SAFE_BOTTOM - 200;
      ctx.save(); ctx.translate(PAD + 20, y0); ctx.rotate(-.01);
      bodyBlock(state.text, 0, 0, W - 2 * PAD - 40, 58, 3); ctx.restore();
    }
    footerLine(p, ink);
  },
  // Magazin-Cover: ein Foto bildfüllend, der Titel groß oben wie der Name einer Zeitschrift, der Text als Schlagzeilen
  magazine(p) {
    const img = photo(0);
    // erst messen (Name der Zeitschrift, Linie, Schlagzeilen), dann zeichnen: so kann der Platzhalter ohne Foto Platz lassen
    const name = (state.title.trim() || 'Imagi').toUpperCase();
    let size = 230; font(900, size, 'head');
    while (size > 70 && ctx.measureText(name).width > W - 2 * PAD) { size -= 6; font(900, size, 'head'); }
    const zwei = ctx.measureText(name).width > W - 2 * PAD;                  // passt auch klein nicht: zwei Zeilen
    const ly = zwei ? SAFE_TOP + 40 + Math.min(2, wrap(name, W - 2 * PAD).length) * 80 - 50 : SAFE_TOP - 10 + size * .8;   // Linie unter dem Namen
    const lh = 66, maxS = Math.max(0, Math.min(6, Math.floor((H - SAFE_BOTTOM - 210 - (ly + 52 + 40)) / lh)));   // Schlagzeilen, die passen
    font(800, 52); const sn = state.text.trim() ? Math.min(maxS, bodyLayout(state.text, W - 2 * PAD - 60, maxS).lines.length) : 0;
    const sTop = H - SAFE_BOTTOM - 210 - sn * lh - 52;
    if (img) place(img, 0, 0, W, H);
    else {                                                     // Platzhalter zwischen Name und Schlagzeilen; ohne Platz entfällt er
      bgGradient(p); const py = Math.min(500, ly + 80), room = (sn ? sTop - 30 : H - SAFE_BOTTOM - 180) - py;
      if (room >= 80) placeholder(PAD, py, W - 2 * PAD, Math.min(900, room), 30, p);
    }
    let g = ctx.createLinearGradient(0, 0, 0, SAFE_TOP + 420); g.addColorStop(0, 'rgba(0,0,0,.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, SAFE_TOP + 420);
    g = ctx.createLinearGradient(0, H * .5, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.75)');
    ctx.fillStyle = g; ctx.fillRect(0, H * .5, W, H * .5);
    tplInk = '#ffffff';
    if (zwei) { font(900, 70, 'head'); ctx.fillStyle = '#fff'; clampBlock(name, PAD, SAFE_TOP + 40, W - 2 * PAD, 80, 2); }
    else { font(900, size, 'head'); ctx.fillStyle = '#fff'; ctx.fillText(name, PAD, SAFE_TOP - 40 + size * .8); }
    ctx.fillStyle = p.acc; ctx.fillRect(PAD, ly, W - 2 * PAD, 8);
    font(700, 30); ctx.fillStyle = '#fff'; ctx.globalAlpha = .9;
    const d = new Date(), mon = d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }).toUpperCase();
    ctx.fillText('AUSGABE ' + mon, PAD, ly + 52); ctx.textAlign = 'right'; ctx.fillText('IMAGICLIQUE', W - PAD, ly + 52); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    if (sn) {                                                                    // Schlagzeilen unten links
      font(800, 52); const max = maxS, y0 = H - SAFE_BOTTOM - 210 - sn * lh;
      ctx.fillStyle = p.acc; ctx.fillRect(PAD, y0 - 52, 14, 52);
      ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 14;
      bodyBlock(state.text, PAD + 34, y0, W - 2 * PAD - 60, lh, max); ctx.shadowColor = 'transparent';
    }
    const bx = PAD, by = H - SAFE_BOTTOM - 170, R = seeded(name.length + 3);   // kleiner Strichcode
    ctx.fillStyle = '#fff'; ctx.fillRect(bx - 8, by - 8, 150, 66); ctx.fillStyle = '#111';
    for (let x = 0; x < 134;) { const w = 1 + Math.floor(R() * 4); ctx.fillRect(bx + x, by, w, 50); x += w + 1 + Math.floor(R() * 3); }
    footerLine(p, '#ffffff');
  },
  // Formen-Collage: bis zu 7 Fotos in einem Herz (aufgeteilt wie die Collage), in Kreisen oder in Waben (state.shape)
  shapes(p) {
    bgGradient(p);
    const hasT = !!state.title.trim(), hasX = !!state.text.trim();
    let top = SAFE_TOP - 20;
    if (hasT) { font(800, 80, 'head'); ctx.fillStyle = p.fg; top = clampBlock(state.title, PAD, top + 70, W - 2 * PAD, 92, 2, 'center') + 30; }
    const bottom = H - SAFE_BOTTOM - (hasX ? 220 : 40), aw = W - 2 * PAD, ah = bottom - top, cx = W / 2, cy = top + ah / 2;
    const k = Math.max(1, slots(7)), shape = state.shape || 'heart';
    const rahmen = () => { ctx.lineWidth = 10; ctx.strokeStyle = p.fg; ctx.globalAlpha = .9; ctx.stroke(); ctx.globalAlpha = 1; };
    const inPath = (path, i, bx, by, bw, bh) => { ctx.save(); path(); ctx.clip(); const img = photo(i); if (img) place(img, bx, by, bw, bh); else { ctx.fillStyle = p.acc; ctx.globalAlpha = .3; ctx.fillRect(bx, by, bw, bh); ctx.globalAlpha = 1; } ctx.restore(); path(); rahmen(); };
    if (shape === 'heart') {
      const s = Math.min(aw, ah * 1.05), hw = s, hh = s * .92, x0 = cx - hw / 2, y0 = cy - hh / 2;
      const herz = () => { ctx.beginPath(); ctx.moveTo(cx, y0 + hh * .28);
        ctx.bezierCurveTo(cx, y0 + hh * .05, x0 + hw * .02, y0, x0 + hw * .02, y0 + hh * .32);
        ctx.bezierCurveTo(x0 + hw * .02, y0 + hh * .6, cx - hw * .1, y0 + hh * .78, cx, y0 + hh);
        ctx.bezierCurveTo(cx + hw * .1, y0 + hh * .78, x0 + hw * .98, y0 + hh * .6, x0 + hw * .98, y0 + hh * .32);
        ctx.bezierCurveTo(x0 + hw * .98, y0, cx, y0 + hh * .05, cx, y0 + hh * .28); ctx.closePath(); };
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 40; herz(); ctx.fillStyle = p.fg; ctx.fill(); ctx.restore();
      ctx.save(); herz(); ctx.clip();
      const cells = k === 1 ? [[0, 0, 1, 1]] : (COLLAGES[k] && COLLAGES[k][0] ? COLLAGES[k][0].c : [[0, 0, 1, 1]]);
      cells.forEach(([x, y, w, h], i) => { const img = photo(i), bx = x0 + x * hw, by = y0 + y * hh, bw = w * hw, bh = h * hh;
        if (img) place(img, bx, by, bw, bh); else { ctx.fillStyle = p.acc; ctx.globalAlpha = .3; ctx.fillRect(bx, by, bw, bh); ctx.globalAlpha = 1; }
        ctx.strokeStyle = p.fg; ctx.lineWidth = 8; ctx.strokeRect(bx, by, bw, bh); });
      ctx.restore(); herz(); rahmen();
    } else {
      const hex = shape === 'hex';
      // Mitte und Ring: bei 1 eine große Form, sonst Mitte plus bis zu 6 drumherum (bei 2–3 nebeneinander/Dreieck)
      const r = k === 1 ? Math.min(aw, ah) * .46 : k <= 3 ? Math.min(aw / (k === 2 ? 4.2 : 4.4), ah / 4.4) : Math.min(aw, ah) / (hex ? 6.1 : 6.3);
      let pos;
      if (k === 1) pos = [[0, 0]];
      else if (k === 2) pos = [[-1.05, -.55], [1.05, .55]];
      else if (k === 3) pos = [[0, -1.05], [-1.1, .75], [1.1, .75]];
      else { const d = hex ? 1.78 : 2.1; pos = [[0, 0]]; for (let j = 0; j < k - 1; j++) { const a = (-90 + j * 360 / Math.max(6, k - 1)) * Math.PI / 180 + (hex ? Math.PI / 6 : 0); pos.push([Math.cos(a) * d, Math.sin(a) * d]); } }
      pos.forEach(([dx, dy], i) => {
        const x = cx + dx * r, y = cy + dy * r;
        const path = hex ? () => { ctx.beginPath(); for (let j = 0; j < 6; j++) { const a = (60 * j - 30) * Math.PI / 180; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); }
                         : () => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 24; path(); ctx.fillStyle = p.fg; ctx.fill(); ctx.restore();
        inPath(path, i, x - r, y - r, 2 * r, 2 * r);
      });
    }
    if (hasX) { font(400, 42); ctx.fillStyle = p.fg; ctx.globalAlpha = .9; bodyBlock(state.text, PAD, H - SAFE_BOTTOM - 150, W - 2 * PAD, 56, 2, 'center'); ctx.globalAlpha = 1; }
    footerLine(p);
  },
  // Postkarte: Foto oben, darunter Schreibfeld mit Briefmarke, Stempel und Adresslinien
  postcard(p) {
    bgGradient(p);
    // Maßstab k der Karte: 1 im Status; kleiner nur, wenn die Karte sonst in die Fußzeile ragt (dann alles mit k, auch die Schrift)
    const k = Math.max(.3, Math.min(1, (fussOben() - (SAFE_TOP - 20)) / 1340)), fs = v => k === 1 ? v : Math.round(v * k);
    const x = PAD - 30, y = SAFE_TOP - 20, w = W - 2 * PAD + 60, h = 1340 * k, m = 34 * k, ph = 720 * k, ink = '#2b2118', paper = '#fbf6ea';
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 36; ctx.shadowOffsetY = 12;
    roundRect(x, y, w, h, 18); ctx.fillStyle = paper; ctx.fill(); ctx.restore();
    if (photo(0)) place(photo(0), x + m, y + m, w - 2 * m, ph, 8); else placeholder(x + m, y + m, w - 2 * m, ph, 8, { fg: ink });
    const ty = y + m + ph, split = x + w * .62;
    // Briefmarke mit gezacktem Rand
    const sw = 170 * k, sh = 210 * k, sx = x + w - m - sw, sy = ty + 40 * k;
    ctx.fillStyle = isDark(p.bg1) ? p.bg1 : p.acc; ctx.fillRect(sx, sy, sw, sh);
    ctx.fillStyle = paper;
    for (let i = 0; i <= 8; i++) for (const yy of [sy, sy + sh]) { ctx.beginPath(); ctx.arc(sx + i * sw / 8, yy, 9 * k, 0, 7); ctx.fill(); }
    for (let i = 0; i <= 10; i++) for (const xx of [sx, sx + sw]) { ctx.beginPath(); ctx.arc(xx, sy + i * sh / 10, 9 * k, 0, 7); ctx.fill(); }
    ctx.strokeStyle = paper; ctx.lineWidth = 4 * k; ctx.strokeRect(sx + 24 * k, sy + 24 * k, sw - 48 * k, sh - 48 * k);
    ctx.font = `700 ${fs(38)}px "Josefin Sans", Inter, sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('Imagi', sx + sw / 2, sy + sh / 2 + 14 * k); ctx.textAlign = 'left';
    // Poststempel
    ctx.save(); ctx.strokeStyle = ink; ctx.globalAlpha = .4; ctx.lineWidth = 4 * k;
    for (const r of [78, 58]) { ctx.beginPath(); ctx.arc(sx - 40 * k, sy + sh - 30 * k, r * k, 0, 7); ctx.stroke(); }
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      for (let j = 0; j <= 40; j++) { const px = sx + (30 + j * 4) * k, py = sy + sh + (-70 + i * 26 + Math.sin(j / 3) * 6) * k; j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke();
    }
    ctx.restore();
    // Trennlinie und Adresslinien rechts
    ctx.save(); ctx.strokeStyle = ink; ctx.globalAlpha = .3; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(split, ty + 40 * k); ctx.lineTo(split, y + h - m); ctx.stroke();
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(split + 30, ty + (370 + i * 70) * k); ctx.lineTo(x + w - m, ty + (370 + i * 70) * k); ctx.stroke(); }
    ctx.restore();
    // Titel und Text links
    const tw = split - 30 - (x + m);
    font(800, fs(54), 'head'); ctx.fillStyle = ink;
    const yy = clampBlock(state.title, x + m, ty + 100 * k, tw, 64 * k, 2);
    font(400, fs(38)); ctx.globalAlpha = .85;
    bodyBlock(state.text, x + m, yy + 6 * k, tw, 52 * k, Math.max(k === 1 ? 1 : 0, Math.floor((y + h - m - yy) / (52 * k))));
    ctx.globalAlpha = 1;
    footerLine(p);
  },
  // Weißrand: Foto mit breitem weißem Rand, schlicht
  minimal(p) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); tplInk = '#1d1d1f';
    const x = 70, y = SAFE_TOP - 20, w = W - 140;
    font(800, 70, 'head'); const tn = state.title.trim() ? Math.min(2, wrap(state.title, w - 40).length) : 0;
    font(400, 40); const xn = state.text.trim() ? Math.min(2, bodyLayout(oneLine(state.text), w - 40, 2).lines.length) : 0;
    const h = passend(1060, fussOben() - (y + 108 + tn * 82 + (xn ? (xn - 1) * 54 + 12 : -66)), 150);   // Foto kleiner nur, wenn der Text sonst nicht passt
    if (photo(0)) place(photo(0), x, y, w, h); else placeholder(x, y, w, h, 0, { fg: tplInk });
    font(800, 70, 'head'); ctx.fillStyle = tplInk;
    const ty = clampBlock(state.title, x + 20, y + h + 108, w - 40, 82, 2);
    font(400, 40); ctx.fillStyle = '#5a5a60';
    bodyBlock(oneLine(state.text), x + 20, ty, w - 40, 54, 2);
    footerLine(p, '#5a5a60');
  },
  // Filmstreifen: drei Fotos untereinander auf dunklem Streifen mit Lochreihen
  film(p) {
    bgGradient(p);
    const sw = 760, sx = (W - sw) / 2, sy = SAFE_TOP - 50, edge = 74, n = 3, gap = 22;
    font(800, 76, 'head'); const tn = state.title.trim() ? Math.min(2, wrap(state.title, W - 2 * PAD).length) : 1;
    const sh = passend(1180, fussOben() - sy - 110 - (tn - 1) * 88 - 16, 300);   // Streifen kürzer nur, wenn der Titel sonst nicht passt (die Textzeile entfällt bei Platzmangel wie bisher)
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 36; ctx.shadowOffsetY = 12;
    ctx.fillStyle = '#141414'; ctx.fillRect(sx, sy, sw, sh); ctx.restore();
    ctx.fillStyle = '#e9e6df';
    for (let yy = sy + 18; yy < sy + sh - 30; yy += 54) {
      roundRect(sx + 22, yy, 30, 34, 7); ctx.fill(); roundRect(sx + sw - 52, yy, 30, 34, 7); ctx.fill();
    }
    const fh = (sh - (n + 1) * gap) / n, fw = sw - 2 * edge;
    for (let i = 0; i < n; i++) {
      const fy = sy + gap + i * (fh + gap);
      photo(i) ? place(photo(i), sx + edge, fy, fw, fh, 6) : placeholder(sx + edge, fy, fw, fh, 6, { fg: '#ffffff' });
    }
    font(800, 76, 'head'); ctx.fillStyle = p.fg;
    const ty = clampBlock(state.title, PAD, sy + sh + 110, W - 2 * PAD, 88, 2);
    font(400, 42); ctx.globalAlpha = .85;
    bodyBlock(oneLine(state.text), PAD, ty + 4, W - 2 * PAD, 56, ty < H - SAFE_BOTTOM - 60 ? 1 : 0);
    ctx.globalAlpha = 1;
    footerLine(p);
  },
  // Vorher / Nachher: zwei Fotos übereinander mit Schild
  compare(p) {
    bgGradient(p);
    const top = SAFE_TOP - 40, gap = 20, w = W - 2 * PAD;
    font(800, 80, 'head'); const tn = state.title.trim() ? Math.min(2, wrap(state.title, w).length) : 1;
    const areaH = passend(1150, fussOben() - top - 110 - (tn - 1) * 92 - 16, 300), ch = (areaH - gap) / 2;   // Textzeile entfällt bei Platzmangel wie bisher
    ['VORHER', 'NACHHER'].forEach((t, i) => {
      const y = top + i * (ch + gap);
      photo(i) ? place(photo(i), PAD, y, w, ch, 28) : placeholder(PAD, y, w, ch, 28, p);
      font(800, 30); const tw = ctx.measureText(t).width + 48;
      roundRect(PAD + 24, y + 24, tw, 58, 29); ctx.fillStyle = p.bg1; ctx.globalAlpha = .88; ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = p.acc; ctx.fillText(t, PAD + 48, y + 64);
    });
    let y = top + areaH + 110;
    font(800, 80, 'head'); ctx.fillStyle = p.fg; y = clampBlock(state.title, PAD, y, w, 92, 2);
    font(400, 42); ctx.globalAlpha = .85;
    bodyBlock(oneLine(state.text), PAD, y + 10, w, 56, y < H - SAFE_BOTTOM - 60 ? 1 : 0);
    ctx.globalAlpha = 1;
    footerLine(p);
  },
};


// ---------- Zieldienste und Wasserzeichen (ab 1.2.0, vorher in Imagiclique) ----------
// Ziel des Status (Idee #14): Alle Dienste nehmen 9:16 in 1080×1920, sie unterscheiden sich in der Länge der Videos,
// in den verdeckten Rändern und darin, ob ein Link als Bildunterschrift mitgeht. Ein Profil ist reine Daten:
// maxSec = längstes Video je Teil, top/bottom = frei zu haltende Ränder in px, link: 'caption' (geht als
// Bildunterschrift mit) oder 'copy' (nur in die Zwischenablage, im Dienst von Hand einfügen).
// Neue Dienste hier anfügen; TikTok, Telegram und Signal fehlen, bis ihre Grenzen am Handy geprüft sind.
const TARGETS = [
  { id: 'wa', name: 'WhatsApp', label: 'WhatsApp-Status', where: 'In WhatsApp „Mein Status“ wählen', maxSec: 90, top: 250, bottom: 260, link: 'caption' },
  { id: 'ig', name: 'Instagram', label: 'Instagram-Story', where: 'In Instagram „Deine Story“ wählen (bei Facebook „Story“)', maxSec: 60, top: 250, bottom: 340, link: 'copy',
    note: 'Gilt genauso für Facebook-Storys.' },
];
// Logo als Wasserzeichen unten rechts: der Zauber-Schriftzug der App (imagicosmos/marke/zauber/, verkleinert auf 720 px).
// marke = { hell: Bild mit dunkler Schrift (für helle Flächen), dunkel: Bild mit heller Schrift, adresse: 'imagiclique.de' }.
// Auf dunklem Grund und auf Fotos die Fassung mit heller Schrift, auf hellen Farbschemata die mit dunkler Schrift.
// aufFoto: ein Foto füllt das Bild (dann mit Schatten). Wann es gezeichnet wird (z. B. erst nach 7 Tagen abschaltbar), entscheidet die App.
const MARK_W = 380, MARK_URL_FONT = '700 30px "Josefin Sans", Inter, system-ui, sans-serif';
function wasserzeichen(p, marke, aufFoto) {
  const onPhoto = aufFoto;
  const ink = onPhoto ? '#ffffff' : tplInk || p.fg;
  const lum = parseInt(ink.slice(1, 3), 16) + parseInt(ink.slice(3, 5), 16) + parseInt(ink.slice(5, 7), 16);
  const img = lum < 384 ? marke.hell : marke.dunkel;   // dunkle Schrift → heller Grund
  if (!img || !img.complete || !img.naturalWidth) return;
  const w = MARK_W, h = w * img.naturalHeight / img.naturalWidth;
  // Unterkante der Schrift auf Höhe der Fußzeile, die Adresse direkt darunter; ist die Fußzeile zu lang, beides eine Zeile höher
  let base = H - SAFE_BOTTOM + 20;
  const f = state.footer.trim();
  ctx.save();
  if (f) { font(600, 34); if (PAD + ctx.measureText(f).width + 30 > W - PAD - w) base -= 62; }
  const y = base - h * .79;                                 // Grundlinie des Schriftzugs liegt bei ca. 79 % der Bildhöhe
  if (onPhoto) { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 12; }
  ctx.globalAlpha = .95;
  ctx.drawImage(img, W - PAD - w + 8, y, w, h);
  ctx.font = MARK_URL_FONT; ctx.textAlign = 'right'; ctx.fillStyle = ink; ctx.globalAlpha = .9;
  ctx.fillText(marke.adresse, W - PAD, base + 50);
  ctx.restore();
}

// Teil-Tage (ab 1.3.0, vorher in Imagiclique): Tage, an denen wirklich geteilt oder gespeichert wurde. Das Wasserzeichen lässt sich
// erst ausblenden, wenn es FREE_AFTER verschiedene Tage sind (Werbung für die App; in einer Web-App nicht fälschungssicher).
// Jede App zählt für sich unter ihrem eigenen Schlüssel (z. B. 'imagiclique.teiltage'). Tag nach Ortszeit, JJJJ-MM-TT.
const FREE_AFTER = 7;
function teiltage(schluessel) {
  const speicher = () => { try { return wurzel.localStorage || null; } catch (e) { return null; } };
  let tage = [];
  try { const d = JSON.parse((speicher() && speicher().getItem(schluessel)) || '[]'); if (Array.isArray(d)) tage = d.filter(x => typeof x === 'string'); } catch (e) {}
  return {
    get anzahl() { return tage.length; },
    get tage() { return tage.slice(); },
    frei: () => tage.length >= FREE_AFTER,
    // heute als Teil-Tag merken; true, wenn der Tag neu dazukam
    merken() {
      const d = new Date(), day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (tage.includes(day)) return false;
      tage.push(day);
      try { speicher().setItem(schluessel, JSON.stringify(tage)); } catch (e) {}
      return true;
    },
  };
}

// ---------- Eine Seite zeichnen, ohne die Daten einer App (ab 1.2.0; für Imagicruise, später das Fotobuch) ----------
// seite(ctx, { vorlage, fotos: [Canvas | Bild | ImageBitmap], titel, text, fusszeile, stil, schrift, ziel | format, marke,
//   fotosJeBild, anordnung, form, datum, einpassen }) zeichnet auf ctx (Fläche 1080 × Höhe; für den Druck vorher ctx.scale()).
//   stil: Kennung ('wald', 'urlaub' …), ein Stil-Objekt (mit colors) oder ein Farbsatz { bg1, bg2, fg, acc };
//   ziel: 'wa' | 'ig' (Status, 1080 × 1920 mit dessen freien Rändern) oder format: { hoehe, oben, unten } (z. B. Fotobuch);
//   marke: Wasserzeichen (siehe wasserzeichen), weglassen = keins. Ergebnis: { schriftfarbe, rest } (rest: Text, der nicht passte).
// Die Umgebung der App (einrichten, wert) bleibt dabei unverändert.
function farbsatz(stil) {
  if (stil && typeof stil === 'object' && stil.bg1) return stil;
  const st = typeof stil === 'string' ? STYLES.find(s => s.id === stil) : stil && stil.colors ? stil : null;
  return st ? { ...st.colors, style: st } : PALETTES[0];
}
function seite(zf, o) {
  o = o || {};
  const ziel = TARGETS.find(t => t.id === o.ziel) || null;
  const fmt = o.format || (ziel ? { hoehe: 1920, oben: ziel.top, unten: ziel.bottom } : { hoehe: 1920, oben: 250, unten: 260 });
  const fotos = (o.fotos || []).filter(Boolean), tpl = TEMPLATES[o.vorlage] ? o.vorlage : 'photo';
  const colN = o.fotosJeBild || Math.max(2, Math.min(12, fotos.length));
  const merk = { state, photo, ctx, H, SAFE_TOP, SAFE_BOTTOM, tplInk, spill, moreFollows, dry, anim };
  try {
    state = { title: o.titel || '', text: o.text || '', footer: o.fusszeile || '', font: o.schrift || 'sans', fit: o.einpassen === 'ganz' ? 'contain' : 'cover',
      fx: 50, fy: 50, colN, colLay: o.anordnung != null ? { [colN]: o.anordnung } : {}, tpl, shape: o.form || 'heart', cdDate: o.datum || '', photos: fotos };
    photo = i => fotos[i] || null;
    ctx = zf; H = fmt.hoehe; SAFE_TOP = fmt.oben; SAFE_BOTTOM = fmt.unten; tplInk = null; spill = ''; moreFollows = false; dry = false; anim = null;
    const p = farbsatz(o.stil);
    ctx.save(); ctx.clearRect(0, 0, W, H); ctx.textBaseline = 'alphabetic';
    TEMPLATES[tpl](p);
    if (o.marke) wasserzeichen(p, o.marke, tpl === 'photo' && !!fotos[0]);
    ctx.restore();
    return { schriftfarbe: tplInk || p.fg, rest: spill };
  } finally {
    ({ state, photo, ctx, H, SAFE_TOP, SAFE_BOTTOM, tplInk, spill, moreFollows, dry, anim } = merk);
  }
}
// Schriften für eine Seite laden (Titel-Schrift, Inter, Josefin Sans des Wasserzeichens); danach zeichnet seite() ohne Nachladen
function schriftenLaden(schrift) {
  if (!dok || !dok.fonts || !dok.fonts.load) return Promise.resolve();
  const f = fontOf(schrift || 'sans'), l = [400, 500, 600, 700, 800, 900].map(w => dok.fonts.load(w + ' 40px Inter').catch(() => {}));
  l.push(dok.fonts.load(MARK_URL_FONT).catch(() => {}));
  if (f.file) l.push(dok.fonts.load(f.w + ' 40px "' + f.fam + '"').catch(() => {}));
  else if (f.fam === 'Playfair Display') l.push(dok.fonts.load('800 40px "Playfair Display"').catch(() => {}), dok.fonts.load('600 40px "Playfair Display"').catch(() => {}));
  return Promise.all(l).then(() => {});
}
// Vorschlag einer Vorlage für n Fotos (für „Als Status teilen“): keins Zitat, eins Foto + Text, sonst Collage
function vorlageFuer(n) { return n <= 0 ? 'quote' : n === 1 ? 'photo' : 'collage'; }

// Hilfen der Vorlagen vom 19.11.2026: Zufall mit festem Startwert (gleiches Bild bei jedem Zeichnen), Zahl der Fotos des Bilds,
// Pinnadel und Klebestreifen
function seeded(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function slots(max) { const n = Math.min(max, need(state.tpl, state.colN)); let k = 0; for (let i = 0; i < n; i++) if (photo(i)) k++; return k || (dry ? n : Math.min(n, 1)); }
function pin(x, y, col) {
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 5;
  const g = ctx.createRadialGradient(x - 6, y - 6, 2, x, y, 20); g.addColorStop(0, '#fff'); g.addColorStop(.25, col); g.addColorStop(1, col);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 19, 0, 7); ctx.fill(); ctx.restore();
}
function tape(x, y, w, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate((-rot * 1.6) * Math.PI / 180);
  ctx.fillStyle = 'rgba(245,240,220,.72)'; ctx.fillRect(-w / 2, -26, w, 52);
  ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 2; ctx.strokeRect(-w / 2, -26, w, 52); ctx.restore();
}

// Tage bis zum Datum (JJJJ-MM-TT) ab heute: { top, big, unit, date, days }; ohne Datum ein Fragezeichen
function countdownInfo(iso, heute = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return { top: 'Noch', big: '?', unit: 'Datum wählen', date: '', days: null };
  const ziel = new Date(+m[1], +m[2] - 1, +m[3]), tag = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate());
  const days = Math.round((ziel - tag) / 864e5);
  const date = ziel.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (days === 0) return { top: '', big: 'Heute', unit: 'ist es so weit!', date, days };
  if (days === 1) return { top: 'Morgen', big: '1', unit: 'Tag noch', date, days };
  if (days > 1) return { top: 'Noch', big: String(days), unit: 'Tage', date, days };
  return { top: 'Seit', big: String(-days), unit: days === -1 ? 'Tag' : 'Tagen', date, days };
}
const MULTI = { pinboard: 6, scrapbook: 4, shapes: 7 };      // Vorlagen mit wählbarer Fotozahl (bis …)
const need = (tpl, n) => isLay(tpl) ? (layOf(tpl) ? layOf(tpl).photos.length : 1) : tpl === 'collage' || tpl === 'show' ? n : MULTI[tpl] ? Math.max(1, Math.min(n, MULTI[tpl])) : ({ film: 3, compare: 2, quote: 0, countdown: 0 })[tpl] ?? 1;

  var api = {
    VERSION: VERSION, ORDNER: ORDNER, wert: wert, einrichten: einrichten,
    TARGETS, MARK_W, MARK_URL_FONT, wasserzeichen, seite, farbsatz, schriftenLaden, vorlageFuer, FREE_AFTER, teiltage,
    FONTS, fontOf, STYLES, PALETTES, BUILTIN, SHAPES, HEX, cleanStyle, styleData, LAYOUTS, isLay, layOf, LAY_GEN, cleanLayout, drawLayout, buildLayout, T, COLLAGES, rowsLayout,
    fam, needFont, font, wrap, textBlock, clampBlock, ABBR, sentEnd, bodyLayout, bodyBlock, isDark, oneLine, bgGradient, mischen, lesbar, stilGrund, stilPapier, deco, roundRect, cover, contain, place, placeholder, collageCells, footerLine,
    TEMPLATES, seeded, slots, pin, tape,
    countdownInfo, MULTI, need,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  wurzel.ImagicosmosVorlagen = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
