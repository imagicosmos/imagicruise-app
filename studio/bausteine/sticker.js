// Baustein „sticker“ – bewegte Sticker als Zeichnungen aus Formen (keine Bilder, nichts aus dem Netz), scharf in jeder Größe.
// Jeder Sticker zeichnet sich mit der Zeit t (Sekunden) in einem Feld von −50 … 50; ohne Zeit (null) steht er in seiner
// Ruhe-Stellung (für Standbilder). Katalog nach Anlass (Weihnachten, Silvester, Winter, Herbst), Kachel für ein Auswahl-Blatt.
// Seit 1.1.0 im Comic-Stil mit dunkler Kontur (Hilfen linie, malen, auge, zwinkern …); alles selbst gezeichnet, keine fremden Bilder.
//
// Entstanden am 22.11.2026 aus Imagiclique (app/sticker-anim.js, Idee #17), damit auch Imagicruise (Status, Fotobuch) sie nutzen kann.
// Die Schriftzüge brauchen Schriften aus dem Baustein „vorlagen“: Great Vibes („Frohe Weihnachten“), Caveat („Hallo Herbst“,
// „Winterzauber“) und Pacifico („Prosit Neujahr!“); ohne sie nimmt der Browser eine Ersatzschrift.
// Im Browser: window.ImagicosmosSticker. Unter Node (Tests): require().
(function (wurzel) {
  "use strict";
  var VERSION = "1.1.0";
  const TAU = Math.PI * 2;
  const sw = (t, per, ph = 0) => Math.sin((t / per + ph) * TAU);
  // fester Zufall je Sticker (gleiche Stellen in jedem Bild)
  const zufall = n => { let s = n * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); };
  function sternPfad(c, ra, ri, n = 5, dreh = -Math.PI / 2) {
    c.beginPath();
    for (let i = 0; i < n * 2; i++) { const r = i % 2 ? ri : ra, w = dreh + i * Math.PI / n; c.lineTo(Math.cos(w) * r, Math.sin(w) * r); }
    c.closePath();
  }
  function schein(c, x, y, r, farbe, a) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, farbe.replace('A', a)); g.addColorStop(1, farbe.replace('A', 0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  function funkeln(c, x, y, r, a) {             // vierzackiger Glanzpunkt
    if (a <= 0.02) return;
    c.save(); c.globalAlpha *= Math.min(1, a); c.fillStyle = '#fffbe6';
    c.beginPath(); c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r);
    c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r); c.fill(); c.restore();
  }
  function flocke(c, x, y, r, dreh) {
    c.save(); c.translate(x, y); c.rotate(dreh);
    c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(0.8, r * 0.22); c.lineCap = 'round';
    c.shadowColor = 'rgba(40,70,120,.55)'; c.shadowBlur = r * 0.5;
    for (let i = 0; i < 6; i++) {
      c.rotate(Math.PI / 3); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -r);
      c.moveTo(0, -r * 0.55); c.lineTo(r * 0.28, -r * 0.8); c.moveTo(0, -r * 0.55); c.lineTo(-r * 0.28, -r * 0.8); c.stroke();
    }
    c.restore();
  }
  const gold = (c, y0, y1) => { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#fff2a8'); g.addColorStop(0.45, '#f2c230'); g.addColorStop(1, '#b07a12'); return g; };

  // ---- Comic-Stil (seit 1.1.0): dunkle Kontur, flache Farben ----
  const K = '#2b1d16';
  function linie(c, lw = 2.4, farbe = K) { c.lineWidth = lw; c.strokeStyle = farbe; c.lineJoin = 'round'; c.lineCap = 'round'; }
  function malen(c, farbe, lw = 2.4) { if (farbe) { c.fillStyle = farbe; c.fill(); } linie(c, lw); c.stroke(); }
  function kreis(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); }
  function oval(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); }
  // Augen zwinkern kurz in jedem Abschnitt der Länge per: 1 = offen, 0,15 = zu
  function zwinkern(t, per = 3.1, ph = 0) { const p = ((t / per + ph) % 1 + 1) % 1; return p < 0.05 ? 0.15 + Math.abs(p - 0.025) / 0.025 * 0.85 : 1; }
  function auge(c, x, y, r, auf = 1) {
    c.save(); c.translate(x, y); c.scale(1, Math.max(0.12, auf));
    oval(c, 0, 0, r, r * 1.15); malen(c, '#ffffff', 1.5);
    kreis(c, r * 0.2, r * 0.15, r * 0.56); c.fillStyle = K; c.fill();
    kreis(c, r * 0.38, -r * 0.12, r * 0.2); c.fillStyle = '#ffffff'; c.fill();
    c.restore();
  }
  function blattPfad(c, s) { c.beginPath(); c.moveTo(0, -s); c.quadraticCurveTo(s * 0.8, -s * 0.25, 0, s); c.quadraticCurveTo(-s * 0.8, -s * 0.25, 0, -s); c.closePath(); }
  function herzPfad(c, s) {   // Spitze bei (0, 0), Herz nach oben
    c.beginPath(); c.moveTo(0, 0);
    c.bezierCurveTo(-s * 0.95, -s * 0.35, -s * 0.75, -s * 1.3, 0, -s * 0.95);
    c.bezierCurveTo(s * 0.75, -s * 1.3, s * 0.95, -s * 0.35, 0, 0); c.closePath();
  }
  function flauschPfad(c, x, y, r, n = 14) {   // flauschiger Rand (Bommel, Fell)
    c.beginPath();
    for (let i = 0; i <= n * 2; i++) { const w = i / (n * 2) * TAU, rr = i % 2 ? r * 1.12 : r * 0.94; c.lineTo(x + Math.cos(w) * rr, y + Math.sin(w) * rr); }
    c.closePath();
  }
  // Schriftzug Buchstabe für Buchstabe, jeder wippt leicht; passt sich auf höchstens breit Einheiten an
  function wellenText(c, text, y, gr, fam, gewicht, fuell, t, ph = 0, breit = 94, kontur = 2) {
    const buchst = [...text];
    c.font = `${gewicht} ${gr}px ${fam}`;
    let br = buchst.map(b => c.measureText(b).width), summe = br.reduce((a, b) => a + b, 0);
    if (summe > breit) { gr *= breit / summe; c.font = `${gewicht} ${gr}px ${fam}`; br = buchst.map(b => c.measureText(b).width); summe = br.reduce((a, b) => a + b, 0); }
    c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.lineJoin = 'round';
    let x = -summe / 2;
    buchst.forEach((b, i) => {
      const dy = sw(t, 1.5, ph + i * 0.09) * 2.2;
      c.lineWidth = kontur * 2.2; c.strokeStyle = '#ffffff'; c.strokeText(b, x, y + dy);
      c.lineWidth = kontur; c.strokeStyle = K; c.strokeText(b, x, y + dy);
      c.fillStyle = fuell; c.fillText(b, x, y + dy);
      x += br[i];
    });
  }

  const ANIM = {
    'w-schnee': { name: 'Schneefall', symbol: '❄️', ruhe: 1.3, zeichne(c, t) {
      const z = zufall(7);
      for (let i = 0; i < 16; i++) {
        const x0 = z() * 90 - 45, v = 0.16 + z() * 0.14, ph = z(), r = 3.5 + z() * 4.5, dr = (z() - 0.5) * 2;
        const p = (t * v + ph) % 1, y = p * 100 - 50, x = x0 + sw(t, 2.6 + i * 0.2, ph) * 5;
        c.save(); c.globalAlpha = Math.min(1, p * 6, (1 - p) * 6); flocke(c, x, y, r, t * dr + ph * 6); c.restore();
      }
    } },
    'w-stern': { name: 'Funkelnder Stern', symbol: '⭐', ruhe: 0.4, zeichne(c, t) {
      const puls = 0.5 + 0.5 * sw(t, 1.6);
      schein(c, 0, 0, 48, 'rgba(255,214,90,A)', 0.35 + 0.3 * puls);
      c.save(); c.rotate(sw(t, 4) * 0.1); c.scale(1 + 0.04 * puls, 1 + 0.04 * puls);
      sternPfad(c, 34, 14); c.fillStyle = gold(c, -34, 30); c.fill();
      c.lineWidth = 1.6; c.strokeStyle = '#9a6a0c'; c.stroke();
      sternPfad(c, 16, 7); c.fillStyle = 'rgba(255,255,230,.55)'; c.fill(); c.restore();
      for (let i = 0; i < 4; i++) {
        const w = t * 0.6 + i * TAU / 4, a = Math.max(0, sw(t, 1.3, i * 0.25));
        funkeln(c, Math.cos(w) * 42, Math.sin(w) * 42, 5 + 3 * a, a);
      }
    } },
    'w-kerze': { name: 'Kerze', symbol: '🕯️', ruhe: 0.2, zeichne(c, t) {
      const n = sw(t, 0.61) * 0.5 + sw(t, 0.29, 0.3) * 0.3 + sw(t, 0.13, 0.7) * 0.2;
      schein(c, 0, -20, 40, 'rgba(255,190,80,A)', 0.32 + 0.14 * n);
      const k = c.createLinearGradient(-13, 0, 13, 0); k.addColorStop(0, '#9e1424'); k.addColorStop(0.45, '#e2364a'); k.addColorStop(1, '#8a1020');
      c.fillStyle = k; c.beginPath(); c.roundRect(-13, -4, 26, 50, 3); c.fill();
      c.fillStyle = '#f04e60'; c.beginPath(); c.ellipse(0, -4, 13, 3.5, 0, 0, TAU); c.fill();
      c.fillStyle = '#e2364a'; c.beginPath(); c.moveTo(4, -4); c.quadraticCurveTo(8, 8, 6, 12); c.quadraticCurveTo(3, 14, 3, 6); c.fill();   // Wachstropfen
      c.strokeStyle = '#3a2a1a'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, -4); c.lineTo(0, -11); c.stroke();
      const h = 22 * (1 + 0.24 * n), dx = n * 4;
      c.save(); c.translate(0, -10);
      const f = c.createLinearGradient(0, 0, 0, -h); f.addColorStop(0, '#ff8a1e'); f.addColorStop(0.5, '#ffc93c'); f.addColorStop(1, '#fff6c2');
      c.fillStyle = f; c.beginPath(); c.moveTo(0, 2); c.bezierCurveTo(-8, -2, -6, -h * 0.55, dx, -h); c.bezierCurveTo(6, -h * 0.55, 8, -2, 0, 2); c.fill();
      c.fillStyle = 'rgba(80,140,255,.55)'; c.beginPath(); c.ellipse(0, -2, 2.6, 4, 0, 0, TAU); c.fill();
      c.restore();
    } },
    'w-kugel': { name: 'Christbaumkugel', symbol: '🔴', ruhe: 0.55, zeichne(c, t) {
      c.save(); c.translate(0, -48); c.rotate(sw(t, 2.2) * 0.24);
      c.strokeStyle = '#c9a227'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 30); c.stroke();
      c.fillStyle = gold(c, 28, 38); c.beginPath(); c.roundRect(-6, 28, 12, 9, 2); c.fill();
      const g = c.createRadialGradient(-9, 52, 3, 0, 62, 30); g.addColorStop(0, '#ff7a85'); g.addColorStop(0.5, '#d01c30'); g.addColorStop(1, '#6e0814');
      c.fillStyle = g; c.beginPath(); c.arc(0, 62, 27, 0, TAU); c.fill();
      c.save(); c.beginPath(); c.arc(0, 62, 27, 0, TAU); c.clip();
      c.strokeStyle = '#f2c230'; c.lineWidth = 3; c.beginPath();
      for (let x = -28; x <= 28; x += 7) c.lineTo(x, 62 + ((x / 7) % 2 ? -4 : 4));
      c.stroke();
      c.fillStyle = '#ffe28a'; for (let x = -21; x <= 21; x += 14) { c.beginPath(); c.arc(x, 50, 1.8, 0, TAU); c.arc(x + 7, 74, 1.8, 0, TAU); c.fill(); }
      c.restore();
      c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.ellipse(-10, 50, 6, 3.2, -0.6, 0, TAU); c.fill();
      funkeln(c, 12, 46, 5, Math.max(0, sw(t, 2.2, 0.15)));
      c.restore();
    } },
    'w-lichter': { name: 'Lichterkette', symbol: '💡', ruhe: 0.1, zeichne(c, t) {
      const farben = ['#ff3b4e', '#ffcf3a', '#3ad16b', '#3aa0ff', '#ff6ad5', '#ff8c2a', '#7a6bff'];
      const P = s => ({ x: -48 + 96 * s, y: -18 + 4 * 30 * s * (1 - s) });   // Kurve des Drahts
      c.strokeStyle = '#2d4a2a'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(-48, -18); c.quadraticCurveTo(0, 42, 48, -18); c.stroke();
      for (let i = 0; i < 7; i++) {
        const s = (i + 0.5) / 7, p = P(s), an = ((Math.floor(t * 2.5) + i) % 3) === 0, hell = an ? 1 : 0.35;
        if (an) schein(c, p.x, p.y + 9, 14, hexA(farben[i]), 0.55);
        c.fillStyle = '#3b3b3b'; c.fillRect(p.x - 2.5, p.y - 1, 5, 4);
        c.save(); c.globalAlpha = 0.45 + 0.55 * hell; c.fillStyle = farben[i];
        c.beginPath(); c.ellipse(p.x, p.y + 9, 4.6, 7, 0, 0, TAU); c.fill(); c.restore();
        if (an) { c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.ellipse(p.x - 1.4, p.y + 6.5, 1.4, 2.4, 0, 0, TAU); c.fill(); }
      }
    } },
    'w-baum': { name: 'Weihnachtsbaum', symbol: '🎄', ruhe: 0.8, zeichne(c, t) {
      c.fillStyle = '#6b4123'; c.fillRect(-6, 34, 12, 12);
      const stufe = (y, b, h) => { const g = c.createLinearGradient(0, y - h, 0, y); g.addColorStop(0, '#2fa456'); g.addColorStop(1, '#14683a');
        c.fillStyle = g; c.beginPath(); c.moveTo(0, y - h); c.lineTo(b, y); c.quadraticCurveTo(0, y + 5, -b, y); c.closePath(); c.fill(); };
      stufe(36, 34, 30); stufe(16, 27, 28); stufe(-6, 19, 26);
      const lichter = [[-20, 30], [-4, 32], [14, 30], [26, 33], [-12, 12], [6, 13], [19, 10], [-6, -6], [8, -8], [0, -20]];
      const farben = ['#ffcf3a', '#ff3b4e', '#3aa0ff', '#ffcf3a', '#ff6ad5', '#ffcf3a', '#ff3b4e', '#3aa0ff', '#ffcf3a', '#ff6ad5'];
      lichter.forEach(([x, y], i) => {
        const a = 0.35 + 0.65 * Math.max(0, sw(t, 1.1 + (i % 4) * 0.17, i * 0.37));
        if (a > 0.6) schein(c, x, y, 7, hexA(farben[i]), (a - 0.6) * 1.6);
        c.save(); c.globalAlpha = a; c.fillStyle = farben[i]; c.beginPath(); c.arc(x, y, 2.6, 0, TAU); c.fill(); c.restore();
      });
      const puls = 0.5 + 0.5 * sw(t, 1.5);
      schein(c, 0, -34, 14, 'rgba(255,214,90,A)', 0.4 + 0.4 * puls);
      c.save(); c.translate(0, -34); c.rotate(sw(t, 3) * 0.08); sternPfad(c, 9 + puls, 4); c.fillStyle = gold(c, -10, 10); c.fill(); c.restore();
    } },
    'w-geschenk': { name: 'Geschenk', symbol: '🎁', ruhe: 0.4, zeichne(c, t) {
      const p = t % 1.6, sprung = p < 0.8 ? Math.sin(p / 0.8 * Math.PI) : 0;
      const quetsch = p >= 0.8 && p < 1.0 ? Math.sin((p - 0.8) / 0.2 * Math.PI) : 0;
      c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(0, 46, 30 - 10 * sprung, 4, 0, 0, TAU); c.fill();
      c.save(); c.translate(0, 44 - sprung * 14); c.scale(1 + 0.08 * quetsch, 1 - 0.1 * quetsch);
      const k = c.createLinearGradient(-28, 0, 28, 0); k.addColorStop(0, '#b3162b'); k.addColorStop(0.5, '#e8344a'); k.addColorStop(1, '#a01226');
      c.fillStyle = k; c.fillRect(-26, -40, 52, 40);
      c.fillStyle = gold(c, -40, 0); c.fillRect(-5, -40, 10, 40);
      const deckel = -40 - sprung * 6;
      c.fillStyle = '#d42a40'; c.fillRect(-30, deckel - 10, 60, 11);
      c.fillStyle = gold(c, deckel - 10, deckel); c.fillRect(-5, deckel - 10, 10, 11);
      c.fillStyle = '#f2c230'; c.strokeStyle = '#a8790f'; c.lineWidth = 1.2;
      [-1, 1].forEach(s => { c.beginPath(); c.ellipse(s * 10, deckel - 15, 10, 6, s * 0.5, 0, TAU); c.fill(); c.stroke(); });
      c.beginPath(); c.arc(0, deckel - 12, 4, 0, TAU); c.fill(); c.stroke();
      c.restore();
      if (sprung > 0.6) for (let i = 0; i < 3; i++) funkeln(c, -30 + i * 30, -30 - i % 2 * 8, 4, (sprung - 0.6) * 2.5);
    } },
    'w-glocke': { name: 'Glocke', symbol: '🔔', ruhe: 0.15, zeichne(c, t) {
      const s = sw(t, 1.4), w = s * 0.32;
      c.save(); c.translate(0, -36); c.rotate(w);
      c.save(); c.rotate(-sw(t, 1.4, -0.1) * 0.25 + 0); c.fillStyle = '#7a5410'; c.beginPath(); c.arc(0, 66, 6, 0, TAU); c.fill(); c.restore();   // Klöppel
      c.fillStyle = gold(c, 4, 62); c.strokeStyle = '#8f6410'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-8, 6); c.bezierCurveTo(-22, 10, -18, 40, -32, 58); c.quadraticCurveTo(0, 66, 32, 58);
      c.bezierCurveTo(18, 40, 22, 10, 8, 6); c.quadraticCurveTo(0, 2, -8, 6); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,230,.5)'; c.beginPath(); c.ellipse(-10, 28, 3, 13, 0.25, 0, TAU); c.fill();
      c.fillStyle = '#1f7a3a'; [-1, 1].forEach(d => { c.beginPath(); c.ellipse(d * 9, 0, 9, 4.5, d * -0.5, 0, TAU); c.fill(); });
      c.fillStyle = '#d0202f'; [[-3, -3], [3, -3], [0, 1]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 3, 0, TAU); c.fill(); });
      c.restore();
      const a = Math.max(0, Math.abs(s) - 0.6) / 0.4;
      if (a > 0) { c.save(); c.globalAlpha = a; c.strokeStyle = '#f2c230'; c.lineWidth = 2.4; c.lineCap = 'round';
        const sd = s > 0 ? 1 : -1;
        const w0 = sd > 0 ? 0 : Math.PI;
        for (let i = 0; i < 2; i++) { c.beginPath(); c.arc(sd * 22, 10, 8 + i * 7, w0 - 0.6, w0 + 0.6); c.stroke(); }
        c.restore(); }
    } },
    'w-schneemann': { name: 'Schneemann', symbol: '⛄', ruhe: 0.25, zeichne(c, t) {
      const weiss = (x, y, r) => { const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#cfdcec');
        c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.strokeStyle = '#8ea4c0'; c.lineWidth = 1.2; c.stroke(); };
      c.strokeStyle = '#5a3a1e'; c.lineWidth = 2.6; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-14, 6); c.lineTo(-34, -6); c.moveTo(-28, -3); c.lineTo(-33, -12); c.stroke();          // linker Arm
      c.save(); c.translate(14, 6); c.rotate(-0.5 + sw(t, 1.0) * 0.45);                                                // winkender Arm
      c.beginPath(); c.moveTo(0, 0); c.lineTo(22, -10); c.moveTo(16, -7); c.lineTo(20, -16); c.moveTo(16, -7); c.lineTo(25, -5); c.stroke(); c.restore();
      weiss(0, 30, 20); weiss(0, 2, 15); weiss(0, -22, 12);
      c.fillStyle = '#2a2a2a'; [8, 0].forEach(y => { c.beginPath(); c.arc(0, y, 1.8, 0, TAU); c.fill(); });
      c.fillStyle = '#d0202f'; c.fillRect(-13, -12, 26, 6);                                                             // Schal
      c.save(); c.translate(7, -7); c.rotate(0.15 + sw(t, 0.8) * 0.12); c.fillRect(0, 0, 6, 16); c.restore();
      const zu = (t % 3.2) > 3.05;
      c.fillStyle = '#1e1e1e';
      if (zu) { c.fillRect(-6, -26, 4, 1.4); c.fillRect(2, -26, 4, 1.4); } else [-4, 4].forEach(x => { c.beginPath(); c.arc(x, -25.5, 1.8, 0, TAU); c.fill(); });
      c.fillStyle = '#f07a1a'; c.beginPath(); c.moveTo(0, -22); c.lineTo(12, -20); c.lineTo(0, -19); c.closePath(); c.fill();   // Karotte
      c.fillStyle = '#1e1e1e'; c.fillRect(-14, -34, 28, 3.5); c.fillRect(-9, -50, 18, 17);                              // Hut
      c.fillStyle = '#d0202f'; c.fillRect(-9, -38, 18, 3.5);
    } },
    'w-schrift': { name: 'Frohe Weihnachten', symbol: '✍️', ruhe: 0.9, zeichne(c, t) {
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      const fam = '"Great Vibes", "Dancing Script", cursive';
      const verlauf = c.createLinearGradient(-60 + ((t * 30) % 120), 0, 0 + ((t * 30) % 120), 0);
      verlauf.addColorStop(0, '#d9a520'); verlauf.addColorStop(0.5, '#fff6c8'); verlauf.addColorStop(1, '#d9a520');
      c.lineJoin = 'round';
      [['Frohe', -4, 34], ['Weihnachten', 26, 30]].forEach(([w, y, gr]) => {
        c.font = `${gr}px ${fam}`;
        const breite = c.measureText(w).width; if (breite > 96) c.font = `${gr * 96 / breite}px ${fam}`;
        c.lineWidth = 1.6; c.strokeStyle = 'rgba(70,30,10,.8)'; c.strokeText(w, 0, y);
        c.fillStyle = verlauf; c.fillText(w, 0, y);
      });
      [[-36, -26], [38, -16], [-40, 22], [42, 30], [6, -32]].forEach(([x, y], i) => funkeln(c, x, y, 4.5, Math.max(0, sw(t, 1.7, i * 0.21))));
    } },
    // ===================== Weihnachten, dazu seit 1.1.0 =====================
    'w-rentier': { name: 'Rentier', symbol: '🦌', ruhe: 0.4, zeichne(c, t) {
      c.save(); c.translate(0, 30); c.rotate(sw(t, 2.5) * 0.06); c.translate(0, -30);
      [[-1, -10], [1, 10]].forEach(([s, x]) => {
        c.save(); c.scale(s, 1);
        c.beginPath(); c.moveTo(10, -14); c.quadraticCurveTo(14, -30, 24, -44); c.moveTo(16, -27); c.lineTo(30, -31); c.moveTo(20, -36); c.lineTo(13, -47); c.moveTo(23, -42); c.lineTo(33, -45);
        linie(c, 6.5); c.stroke(); linie(c, 3.4, '#c8a165'); c.stroke();
        c.restore();
      });
      [[-1], [1]].forEach(([s]) => { c.save(); c.translate(s * 21, -4); c.rotate(s * (0.9 + sw(t, 1.5, s > 0 ? 0 : 0.3) * 0.15)); oval(c, 0, -7, 6, 11); malen(c, '#a0522d', 2); oval(c, 0, -7, 3, 7); c.fillStyle = '#e8b4a0'; c.fill(); c.restore(); });
      oval(c, 0, 8, 21, 24); malen(c, '#a0522d', 2.4);
      oval(c, 0, 22, 14, 11); malen(c, '#d2a679', 2);
      oval(c, 0, 16, 6, 4.5); malen(c, '#3b2416', 1.6);
      kreis(c, -2, 14.8, 1.4); c.fillStyle = 'rgba(255,255,255,.7)'; c.fill();
      linie(c, 1.6); c.beginPath(); c.arc(0, 23, 5, 0.3, Math.PI - 0.3); c.stroke();
      const auf = zwinkern(t, 3.3);
      auge(c, -9, 1, 4, auf); auge(c, 9, 1, 4, auf);
      c.fillStyle = 'rgba(255,120,150,.4)'; oval(c, -14, 12, 3.5, 2.2); c.fill(); oval(c, 14, 12, 3.5, 2.2); c.fill();
      c.beginPath(); c.moveTo(-15, 30); c.quadraticCurveTo(0, 38, 15, 30); linie(c, 6); c.stroke(); linie(c, 3.4, '#c92a2a'); c.stroke();
      c.save(); c.translate(0, 35); c.rotate(sw(t, 1.2) * 0.35);
      c.beginPath(); c.moveTo(-6, 9); c.quadraticCurveTo(-6, 0, 0, 0); c.quadraticCurveTo(6, 0, 6, 9); c.closePath(); c.fillStyle = gold(c, 0, 9); c.fill(); linie(c, 1.4); c.stroke();
      kreis(c, 0, 10, 1.8); malen(c, '#9a6a0c', 1);
      c.restore();
      c.restore();
    } },
    'w-lebkuchen': { name: 'Lebkuchenmann', symbol: '🍪', ruhe: 0.3, zeichne(c, t) {
      const hop = -Math.abs(sw(t, 1.6)) * 3, wink = -0.5 - (sw(t, 0.8) * 0.5 + 0.5) * 0.9;
      c.save(); c.translate(0, hop);
      const armR = () => { c.save(); c.translate(10, -8); c.rotate(wink); oval(c, 12, 0, 13, 6.5); c.restore(); };
      const teile = [() => oval(c, -8, 27, 7.5, 14, 0.25), () => oval(c, 8, 27, 7.5, 14, -0.25), () => oval(c, 0, 5, 15, 20), () => oval(c, -17, -2, 13, 6.5, 0.45), armR, () => kreis(c, 0, -27, 13)];
      teile.forEach(f => { f(); linie(c, 5.2); c.stroke(); });
      teile.forEach(f => { f(); c.fillStyle = '#c87533'; c.fill(); });
      linie(c, 1.8, '#ffffff');
      const zack = (x, y, w, rot) => { c.save(); c.translate(x, y); c.rotate(rot); c.beginPath(); for (let k = 0; k <= 4; k++) c.lineTo(-w / 2 + k * w / 4, k % 2 ? 2 : -2); c.stroke(); c.restore(); };
      zack(-8, 36, 10, 0.25); zack(8, 36, 10, -0.25); zack(-25, 1, 9, 1.95);
      c.save(); c.translate(10, -8); c.rotate(wink); zack(21, 0, 9, Math.PI / 2); c.restore();
      [['#e03131', -4], ['#2f9e44', 5], ['#e03131', 14]].forEach(([f, y]) => { kreis(c, 0, y, 2.6); malen(c, f, 1.2); });
      const auf = zwinkern(t, 2.9);
      c.fillStyle = K; [[-4.5], [4.5]].forEach(([x]) => { oval(c, x, -30, 1.9, 2.3 * auf); c.fill(); });
      linie(c, 1.8, '#ffffff'); c.beginPath(); c.arc(0, -25, 5, 0.35, Math.PI - 0.35); c.stroke();
      c.fillStyle = 'rgba(255,150,150,.55)'; oval(c, -8, -23, 2.4, 1.6); c.fill(); oval(c, 8, -23, 2.4, 1.6); c.fill();
      c.restore();
    } },
    'w-zuckerstange': { name: 'Zuckerstange', symbol: '🍬', ruhe: 0.5, zeichne(c, t) {
      c.save(); c.translate(6, 44); c.rotate(sw(t, 2.6) * 0.08); c.translate(-6, -44);
      const pfad = () => { c.beginPath(); c.moveTo(6, 44); c.lineTo(6, -20); c.arc(-8, -20, 14, 0, Math.PI, true); c.lineTo(-22, -10); };
      pfad(); linie(c, 14); c.lineCap = 'round'; c.stroke();
      pfad(); linie(c, 10, '#ffffff'); c.stroke();
      pfad(); linie(c, 10, '#e03131'); c.lineCap = 'butt'; c.setLineDash([6, 6]); c.lineDashOffset = -t * 12; c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
      linie(c, 2.4, 'rgba(255,255,255,.6)'); c.beginPath(); c.moveTo(3, 40); c.lineTo(3, -18); c.stroke();
      c.save(); c.translate(6, 8); c.rotate(sw(t, 1.4) * 0.12);
      [[-1], [1]].forEach(([s]) => { oval(c, s * 8, -2, 8, 5, s * -0.4); malen(c, '#2f9e44', 1.8); });
      [[-1], [1]].forEach(([s]) => { c.beginPath(); c.moveTo(0, 0); c.lineTo(s * 5, 14); c.lineTo(s * 9, 12); c.closePath(); malen(c, '#2f9e44', 1.6); });
      kreis(c, 0, 0, 3.5); malen(c, '#2b8a3e', 1.6);
      c.restore();
      c.restore();
      funkeln(c, -22, -36, 5, Math.max(0, sw(t, 1.5))); funkeln(c, 18, -26, 4, Math.max(0, sw(t, 1.5, 0.5)));
    } },
    'w-muetze': { name: 'Weihnachtsmütze', symbol: '🎅', ruhe: 0.3, zeichne(c, t) {
      const tx = 28 + sw(t, 1.4) * 6, ty = -8 + sw(t, 1.4, 0.25) * 4;
      c.beginPath(); c.moveTo(-28, 20); c.quadraticCurveTo(-24, -30, 2, -34); c.quadraticCurveTo(tx - 6, ty - 20, tx, ty); c.quadraticCurveTo(14, -12, 28, 20); c.closePath(); malen(c, '#e03131', 2.4);
      c.save(); c.clip(); linie(c, 7, 'rgba(120,0,0,.22)'); c.beginPath(); c.moveTo(6, 20); c.quadraticCurveTo(12, -10, tx, ty); c.stroke(); c.restore();
      c.beginPath(); c.moveTo(-34, 16);
      const bw = 68 / 6;
      for (let k = 0; k < 6; k++) c.quadraticCurveTo(-34 + k * bw + bw / 2, 11, -34 + (k + 1) * bw, 16);
      c.quadraticCurveTo(38, 24, 34, 32); for (let k = 5; k >= 0; k--) c.quadraticCurveTo(-34 + k * bw + bw / 2, 37, -34 + k * bw, 32);
      c.quadraticCurveTo(-38, 24, -34, 16);
      c.closePath(); malen(c, '#f8f9fa', 2.2);
      flauschPfad(c, tx, ty, 9); malen(c, '#f8f9fa', 2);
      funkeln(c, -16, -12, 4.5, Math.max(0, sw(t, 1.8)));
    } },
    // ===================== Silvester (seit 1.1.0) =====================
    's-feuerwerk': { name: 'Feuerwerk', symbol: '🎆', ruhe: 1.1, zeichne(c, t) {
      [[-22, -16, '#ff6b6b', 0], [20, -26, '#ffd43b', 0.33], [4, 8, '#4dabf7', 0.66]].forEach(([cx, cy, f, ph]) => {
        const p = (t / 2.4 + ph) % 1;
        if (p < 0.3) {
          const q = p / 0.3, y = 50 + (cy - 50) * (1 - (1 - q) ** 2);
          c.beginPath(); c.moveTo(cx, Math.min(50, y + 12)); c.lineTo(cx, y); linie(c, 3.6, 'rgba(43,29,22,.45)'); c.stroke(); linie(c, 2, '#ffc078'); c.stroke();
          kreis(c, cx, y, 2.6); malen(c, '#fff3bf', 1.2);
        } else {
          const q = (p - 0.3) / 0.7, r = 6 + (1 - (1 - q) ** 2) * 26, a = 1 - q * q;
          if (q < 0.18) schein(c, cx, cy, 18, hexA(f), 0.7 * (1 - q / 0.18));
          c.save(); c.globalAlpha = a;
          for (let k = 0; k < 14; k++) {
            const w = k / 14 * TAU, x1 = cx + Math.cos(w) * r * 0.55, y1 = cy + Math.sin(w) * r * 0.55 + q * q * 8, x2 = cx + Math.cos(w) * r, y2 = cy + Math.sin(w) * r + q * q * 10;
            c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); linie(c, 4.6, 'rgba(43,29,22,.6)'); c.stroke(); linie(c, 2.6, f); c.stroke();
            kreis(c, x2, y2, 2.2); malen(c, '#ffffff', 1);
          }
          c.restore();
        }
      });
    } },
    's-wunderkerze': { name: 'Wunderkerze', symbol: '✨', ruhe: 0.45, zeichne(c, t) {
      const z = zufall(41), sx = 12, sy = -10;
      c.beginPath(); c.moveTo(-32, 46); c.lineTo(sx, sy); linie(c, 4.6); c.stroke(); linie(c, 2.4, '#adb5bd'); c.stroke();
      c.beginPath(); c.moveTo(-2, 8); c.lineTo(sx, sy); linie(c, 3.2, '#495057'); c.stroke();
      schein(c, sx, sy, 24, 'rgba(255,236,153,A)', 0.75 + 0.2 * sw(t, 0.21));
      for (let k = 0; k < 24; k++) {
        const w = z() * TAU, l0 = 0.5 + z() * 0.5, f = (Math.sin(t * 23 + k * 1.7) + 1) / 2, l = 8 + f * 20 * l0;
        const ex = sx + Math.cos(w) * l, ey = sy + Math.sin(w) * l, mx = sx + Math.cos(w) * l * 0.62, my = sy + Math.sin(w) * l * 0.62;
        c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.moveTo(mx, my); c.lineTo(mx + Math.cos(w + 0.7) * l * 0.25, my + Math.sin(w + 0.7) * l * 0.25);
        linie(c, 2.6, 'rgba(120,70,0,.35)'); c.stroke(); linie(c, 1.3, k % 3 ? '#ffe066' : '#ffffff'); c.stroke();
      }
      kreis(c, sx, sy, 4); c.fillStyle = '#ffffff'; c.fill();
    } },
    's-sekt': { name: 'Sektflasche', symbol: '🍾', ruhe: 0.1, zeichne(c, t) {
      const p = (t / 2.6) % 1;
      c.save(); c.translate(-6, 14); c.rotate(0.45);
      c.beginPath(); c.moveTo(-12, 36); c.lineTo(-12, 2); c.quadraticCurveTo(-12, -8, -5, -16); c.lineTo(-5, -30); c.lineTo(5, -30); c.lineTo(5, -16); c.quadraticCurveTo(12, -8, 12, 2); c.lineTo(12, 36); c.quadraticCurveTo(12, 40, 8, 40); c.lineTo(-8, 40); c.quadraticCurveTo(-12, 40, -12, 36); c.closePath();
      malen(c, '#2b8a3e', 2.4);
      c.beginPath(); c.moveTo(-6, -32); c.lineTo(6, -32); c.lineTo(6, -16); c.quadraticCurveTo(0, -13, -6, -16); c.closePath(); c.fillStyle = gold(c, -32, -14); c.fill(); linie(c, 1.6); c.stroke();
      c.beginPath(); c.rect(-10, 10, 20, 15); malen(c, '#fff4d6', 1.6);
      c.save(); c.translate(0, 17.5); sternPfad(c, 5, 2.2, 5); c.fillStyle = '#e8b923'; c.fill(); c.restore();
      linie(c, 2.2, 'rgba(255,255,255,.4)'); c.beginPath(); c.moveTo(-8, 30); c.lineTo(-8, 2); c.stroke();
      if (p < 0.45) {
        const zit = sw(t, 0.07) * p * 2;
        c.beginPath(); c.rect(-4.5 + zit, -40, 9, 9); malen(c, '#d9a066', 1.6);
      } else {
        const q = (p - 0.45) / 0.55;
        c.save(); c.globalAlpha = 1 - q; c.translate(sw(t, 0.4) * 2, -40 - q * 34); c.rotate(q * 6); c.beginPath(); c.rect(-4.5, -4.5, 9, 9); malen(c, '#d9a066', 1.6); c.restore();
        if (q < 0.25) { c.save(); c.globalAlpha = 1 - q / 0.25; linie(c, 2.2, '#fab005'); for (let k = 0; k < 6; k++) { const w = -Math.PI / 2 + (k - 2.5) * 0.45; c.beginPath(); c.moveTo(Math.cos(w) * 10, -34 + Math.sin(w) * 10); c.lineTo(Math.cos(w) * 17, -34 + Math.sin(w) * 17); c.stroke(); } c.restore(); }
        if (q < 0.75) { c.save(); c.globalAlpha = 1 - q / 0.75; for (let k = 0; k < 10; k++) { const w = -Math.PI / 2 + (k - 4.5) * 0.12, d = 6 + q * 30 * (0.7 + (k % 3) * 0.15); kreis(c, Math.cos(w) * d, -32 + Math.sin(w) * d, 2.4 - (k % 2) * 0.8); malen(c, '#ffffff', 1); } c.restore(); }
      }
      c.restore();
    } },
    's-anstossen': { name: 'Anstoßen', symbol: '🥂', ruhe: 0, zeichne(c, t) {
      const p = (t / 2.2) % 1, d = (1 - Math.cos(p * TAU)) / 2;
      [[-1], [1]].forEach(([s], gi) => {
        c.save(); c.translate(s * (13 + d * 9), 14); c.rotate(-s * (0.28 - d * 0.14)); c.translate(0, -14);
        const kelch = () => { c.beginPath(); c.moveTo(-8, -36); c.lineTo(8, -36); c.quadraticCurveTo(9.5, -2, 0, 3); c.quadraticCurveTo(-9.5, -2, -8, -36); c.closePath(); };
        kelch(); c.fillStyle = 'rgba(230,245,255,.6)'; c.fill();
        c.save(); kelch(); c.clip(); c.fillStyle = '#ffd43b'; c.fillRect(-12, -26, 24, 32);
        for (let k = 0; k < 4; k++) { const y = 0 - ((t * 20 + k * 7 + gi * 3) % 26); kreis(c, -3 + k * 2, y, 1.1); c.fillStyle = '#ffffff'; c.fill(); }
        c.restore();
        kelch(); malen(c, null, 2);
        linie(c, 1.6, 'rgba(255,255,255,.8)'); c.beginPath(); c.moveTo(-5, -32); c.quadraticCurveTo(-5.5, -14, -3, -6); c.stroke();
        c.beginPath(); c.moveTo(0, 3); c.lineTo(0, 30); linie(c, 4.4); c.stroke(); linie(c, 2, 'rgba(230,245,255,1)'); c.stroke();
        oval(c, 0, 31, 10, 3); malen(c, 'rgba(230,245,255,1)', 1.8);
        c.restore();
      });
      if (d < 0.2) {
        const a = 1 - d / 0.2; c.save(); c.globalAlpha = a; linie(c, 2.2, '#fab005');
        for (let k = 0; k < 5; k++) { const w = -Math.PI / 2 + (k - 2) * 0.5; c.beginPath(); c.moveTo(Math.cos(w) * 7, -26 + Math.sin(w) * 7); c.lineTo(Math.cos(w) * 15, -26 + Math.sin(w) * 15); c.stroke(); }
        c.restore(); funkeln(c, 0, -26, 6, a);
      }
    } },
    's-uhr': { name: 'Mitternacht', symbol: '🕛', ruhe: 0.75, zeichne(c, t) {
      const p = (t / 3) % 1, q = p < 0.7 ? 0 : (p - 0.7) / 0.3;
      const minute = p < 0.7 ? (-3 + p / 0.7 * 3) / 60 * TAU : 0, stunde = minute / 12;
      c.save(); c.rotate(q > 0 ? sw(t, 0.12) * 0.06 * (1 - q) : 0);
      [[-1], [1]].forEach(([s]) => { c.save(); c.translate(s * 22, -30); c.rotate(s * 0.5); c.beginPath(); c.arc(0, 0, 9, Math.PI, 0); c.closePath(); c.fillStyle = gold(c, -9, 0); c.fill(); linie(c, 2); c.stroke(); c.restore(); });
      linie(c, 3); c.beginPath(); c.moveTo(-18, 30); c.lineTo(-26, 42); c.moveTo(18, 30); c.lineTo(26, 42); c.stroke();
      kreis(c, 0, 0, 34); malen(c, '#e8b923', 2.6);
      kreis(c, 0, 0, 28); malen(c, '#fff8e1', 1.8);
      linie(c, 2); for (let i = 0; i < 12; i++) { const w = i * TAU / 12; c.beginPath(); c.moveTo(Math.sin(w) * 23, -Math.cos(w) * 23); c.lineTo(Math.sin(w) * (i % 3 ? 25 : 27), -Math.cos(w) * (i % 3 ? 25 : 27)); c.stroke(); }
      c.fillStyle = K; c.font = '700 9px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('12', 0, -16);
      linie(c, 4.4); c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.sin(stunde) * 13, -Math.cos(stunde) * 13); c.stroke();
      linie(c, 2.8); c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.sin(minute) * 21, -Math.cos(minute) * 21); c.stroke();
      kreis(c, 0, 0, 2.8); malen(c, '#e03131', 1.2);
      c.restore();
      if (q > 0) {
        c.save(); c.globalAlpha = 1 - q;
        ['#ff6b6b', '#ffd43b', '#4dabf7', '#69db7c', '#da77f2'].forEach((f, i) => { for (let k = 0; k < 2; k++) { const w = (i * 2 + k) / 10 * TAU + 0.3, r1 = 37 + q * 4, r2 = 42 + q * 9; c.beginPath(); c.moveTo(Math.cos(w) * r1, Math.sin(w) * r1); c.lineTo(Math.cos(w) * r2, Math.sin(w) * r2); linie(c, 2.6, f); c.stroke(); } });
        c.restore();
      }
    } },
    's-klee': { name: 'Glücksklee', symbol: '🍀', ruhe: 0.5, zeichne(c, t) {
      const puls = 1 + 0.04 * sw(t, 1.2);
      c.save(); c.rotate(sw(t, 3) * 0.2); c.scale(puls, puls);
      linie(c, 6); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(6, 26, 16, 44); c.stroke(); linie(c, 3.2, '#2f9e44'); c.stroke();
      for (let i = 0; i < 4; i++) {
        c.save(); c.rotate(Math.PI / 4 + i * Math.PI / 2); herzPfad(c, 24); malen(c, i % 2 ? '#40c057' : '#51cf66', 2.2);
        linie(c, 1.2, 'rgba(255,255,255,.6)'); c.beginPath(); c.moveTo(0, -3); c.lineTo(0, -18); c.stroke();
        c.restore();
      }
      kreis(c, 0, 0, 3); malen(c, '#2f9e44', 1.4);
      c.restore();
      [[-34, -30], [36, -22], [-30, 34]].forEach(([x, y], i) => funkeln(c, x, y, 5, Math.max(0, sw(t, 1.7, i * 0.33))));
    } },
    's-schwein': { name: 'Glücksschwein', symbol: '🐷', ruhe: 0.3, zeichne(c, t) {
      const b = Math.abs(sw(t, 1.5)), sy = 1 - (1 - b) * 0.05;
      c.save(); c.translate(0, -b * 4); c.scale(1, sy);
      [[-1], [1]].forEach(([s]) => { c.save(); c.translate(s * 16, -18); c.rotate(s * (0.25 + sw(t, 1.3, s > 0 ? 0 : 0.4) * 0.2)); c.beginPath(); c.moveTo(-7, 4); c.lineTo(s * 4, -16); c.lineTo(9, 2); c.closePath(); malen(c, '#f783ac', 2); c.restore(); });
      oval(c, 0, 4, 30, 26); malen(c, '#ffa8c5', 2.4);
      oval(c, 0, 14, 12, 8.5); malen(c, '#f783ac', 2);
      oval(c, -4, 14, 2, 3); c.fillStyle = '#a61e4d'; c.fill(); oval(c, 4, 14, 2, 3); c.fill();
      const auf = zwinkern(t, 3.2);
      auge(c, -11, -3, 4, auf); auge(c, 11, -3, 4, auf);
      c.fillStyle = 'rgba(255,90,140,.4)'; oval(c, -19, 9, 4, 2.6); c.fill(); oval(c, 19, 9, 4, 2.6); c.fill();
      linie(c, 1.6); c.beginPath(); c.arc(0, 21, 5, 0.4, Math.PI - 0.4); c.stroke();
      c.save(); c.translate(19, 26); c.rotate(0.5 + sw(t, 1.5) * 0.1); c.scale(0.38, 0.38);
      for (let i = 0; i < 4; i++) { c.save(); c.rotate(Math.PI / 4 + i * Math.PI / 2); herzPfad(c, 24); malen(c, '#40c057', 4); c.restore(); }
      c.restore();
      c.restore();
    } },
    's-konfetti': { name: 'Konfetti', symbol: '🎊', ruhe: 0.9, zeichne(c, t) {
      const z = zufall(53), farben = ['#ff6b6b', '#ffd43b', '#4dabf7', '#69db7c', '#da77f2', '#ff922b'];
      for (let i = 0; i < 3; i++) {
        const x0 = -30 + i * 30 + z() * 8, p = (t * 0.22 + z()) % 1, y0 = p * 120 - 70;
        c.save(); c.globalAlpha = Math.min(1, p * 5, (1 - p) * 5); c.beginPath();
        for (let k = 0; k <= 14; k++) { const y = y0 + k * 2.4, x = x0 + Math.sin(k * 0.7 + t * 3 + i) * 5; k ? c.lineTo(x, y) : c.moveTo(x, y); }
        linie(c, 4.4); c.stroke(); linie(c, 2.6, farben[(i * 2 + 1) % farben.length]); c.stroke(); c.restore();
      }
      for (let i = 0; i < 20; i++) {
        const x0 = z() * 92 - 46, v = 0.2 + z() * 0.15, ph = z(), p = (t * v + ph) % 1, y = p * 100 - 50, x = x0 + sw(t, 1.6 + i * 0.1, ph) * 5;
        c.save(); c.globalAlpha = Math.min(1, p * 6, (1 - p) * 6); c.translate(x, y); c.rotate(ph * 6 + t * (1 + i % 3)); c.scale(Math.cos(t * 4 + i), 1);
        c.beginPath(); c.rect(-2, -3.5, 4, 7); malen(c, farben[i % farben.length], 0.8); c.restore();
      }
    } },
    's-schrift': { name: 'Prosit Neujahr', symbol: '✍️', ruhe: 0.6, zeichne(c, t) {
      const fam = 'Pacifico, "Comic Sans MS", cursive', s = (t * 30) % 120;
      const v = c.createLinearGradient(-60 + s, 0, s, 0); v.addColorStop(0, '#d9a520'); v.addColorStop(0.5, '#fff6c8'); v.addColorStop(1, '#d9a520');
      wellenText(c, 'Prosit', -6, 30, fam, 400, v, t, 0);
      wellenText(c, 'Neujahr!', 26, 30, fam, 400, v, t, 0.4);
      [[-40, -30, '#ff6b6b', 0], [40, -34, '#4dabf7', 0.5]].forEach(([x, y, f, ph]) => {
        const q = (t / 1.8 + ph) % 1, r = 3 + q * 9; c.save(); c.globalAlpha = 1 - q; linie(c, 1.6, f);
        for (let k = 0; k < 8; k++) { const w = k / 8 * TAU; c.beginPath(); c.moveTo(x + Math.cos(w) * r * 0.5, y + Math.sin(w) * r * 0.5); c.lineTo(x + Math.cos(w) * r, y + Math.sin(w) * r); c.stroke(); }
        c.restore();
      });
      [[-34, 42], [36, 42], [0, -36]].forEach(([x, y], i) => funkeln(c, x, y, 4.5, Math.max(0, sw(t, 1.7, i * 0.21))));
    } },
    // ===================== Herbst (seit 1.1.0) =====================
    'h-blaetter': { name: 'Blätterfall', symbol: '🍂', ruhe: 1.1, zeichne(c, t) {
      const z = zufall(11), farben = ['#e8590c', '#c92a2a', '#f59f00', '#a0522d', '#d9480f', '#fab005'];
      for (let i = 0; i < 9; i++) {
        const x0 = z() * 84 - 42, v = 0.13 + z() * 0.1, ph = z(), s = 6 + z() * 5, ahorn = z() < 0.5, d0 = z() * 6;
        const p = (t * v + ph) % 1, y = p * 100 - 50, x = x0 + sw(t, 2.2 + i * 0.3, ph) * 9;
        c.save(); c.globalAlpha = Math.min(1, p * 6, (1 - p) * 6); c.translate(x, y); c.rotate(d0 + sw(t, 1.8 + i * 0.2, ph) * 0.9);
        if (ahorn) sternPfad(c, s, s * 0.48, 5); else blattPfad(c, s);
        malen(c, farben[i % farben.length], 1.3);
        linie(c, 0.9, 'rgba(60,30,10,.55)'); c.beginPath(); c.moveTo(0, s * 0.95); c.lineTo(0, -s * 0.45); c.stroke();
        c.restore();
      }
    } },
    'h-drache': { name: 'Drachen', symbol: '🪁', ruhe: 0.6, zeichne(c, t) {
      const kx = 20 + sw(t, 2.6) * 4, ky = -20 + sw(t, 1.9, 0.2) * 3, rot = 0.25 + sw(t, 2.6) * 0.18;
      linie(c, 1.2, '#6b5a48'); c.beginPath(); c.moveTo(-44, 48); c.quadraticCurveTo(-12 + sw(t, 2.2) * 6, 22, kx, ky); c.stroke();
      c.save(); c.translate(kx, ky); c.rotate(rot);
      // Schwanz mit Schleifen
      linie(c, 1.4, K); c.beginPath(); c.moveTo(0, 20);
      const pkt = [];
      for (let j = 1; j <= 5; j++) { const px = Math.sin(t * 4 - j * 0.9) * 5, py = 20 + j * 6.5; pkt.push([px, py]); c.lineTo(px, py); }
      c.stroke();
      pkt.forEach(([px, py], j) => {
        c.beginPath(); c.moveTo(px, py); c.lineTo(px - 4.5, py - 3); c.lineTo(px - 4.5, py + 3); c.closePath();
        c.moveTo(px, py); c.lineTo(px + 4.5, py - 3); c.lineTo(px + 4.5, py + 3); c.closePath();
        malen(c, j % 2 ? '#4dabf7' : '#69db7c', 1);
      });
      // Drachen in vier Feldern
      const P = [[0, -20], [14, -2], [0, 20], [-14, -2]], M = [0, -2];
      ['#e03131', '#fcc419', '#e03131', '#fcc419'].forEach((f, i) => {
        c.beginPath(); c.moveTo(M[0], M[1]); c.lineTo(...P[i]); c.lineTo(...P[(i + 1) % 4]); c.closePath(); c.fillStyle = f; c.fill();
      });
      c.beginPath(); P.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); malen(c, null, 2.2);
      linie(c, 1.2); c.beginPath(); c.moveTo(0, -20); c.lineTo(0, 20); c.moveTo(-14, -2); c.lineTo(14, -2); c.stroke();
      c.restore();
    } },
    'h-kuerbis': { name: 'Kürbis', symbol: '🎃', ruhe: 0.3, zeichne(c, t) {
      const b = Math.abs(sw(t, 1.4)), sx = 1 + (1 - b) * 0.06, sy = 1 - (1 - b) * 0.06;
      c.save(); c.globalAlpha = 0.18; oval(c, 0, 40, 26 * (1 - b * 0.2), 4); c.fillStyle = '#000'; c.fill(); c.restore();
      c.save(); c.translate(0, 12 - b * 7); c.scale(sx, sy);
      [[-17, 13, 24, '#e8590c'], [17, 13, 24, '#e8590c'], [-8, 15, 26, '#f76707'], [8, 15, 26, '#f76707'], [0, 13, 27, '#fd7e14']].forEach(([x, rx, ry, f]) => { oval(c, x, 0, rx, ry); malen(c, f, 2); });
      c.beginPath(); c.moveTo(-4, -24); c.lineTo(4, -24); c.lineTo(6, -34); c.lineTo(-1, -37); c.closePath(); malen(c, '#5c940d', 1.8);
      linie(c, 1.6, '#5c940d'); c.beginPath(); c.arc(-9, -28, 5, -0.3, Math.PI * 1.4); c.stroke();
      c.save(); c.translate(11, -30); c.rotate(1.1 + sw(t, 1.4) * 0.1); blattPfad(c, 8); malen(c, '#74b816', 1.4); c.restore();
      linie(c, 2.6, 'rgba(255,255,255,.45)'); c.beginPath(); c.arc(-4, -2, 18, Math.PI * 1.1, Math.PI * 1.35); c.stroke();
      c.restore();
    } },
    'h-igel': { name: 'Igel', symbol: '🦔', ruhe: 0.5, zeichne(c, t) {
      const atem = 1 + sw(t, 1.6) * 0.03, schnuppern = Math.max(0, sw(t, 2.2)) * sw(t, 0.25) * 1.2;
      c.save(); c.translate(0, 22); c.scale(atem, atem); c.translate(0, -22);
      [[-18, 33], [8, 33]].forEach(([x, y]) => { oval(c, x, y, 6, 3.5); malen(c, '#6b4226', 1.6); });
      oval(c, -4, 12, 30, 22); malen(c, '#8d5a3b', 2);
      c.beginPath();
      for (let k = 0; k <= 28; k++) { const w = Math.PI * 0.9 + k / 28 * Math.PI * 1.2, r = k % 2 ? 1.38 : 1.02; c.lineTo(-6 + Math.cos(w) * 28 * r, 12 + Math.sin(w) * 21 * r); }
      c.closePath(); malen(c, '#5b3a29', 2);
      linie(c, 1, 'rgba(255,255,255,.25)');
      for (let k = 1; k < 28; k += 2) { const w = Math.PI * 0.9 + k / 28 * Math.PI * 1.2; c.beginPath(); c.moveTo(-6 + Math.cos(w) * 22, 12 + Math.sin(w) * 16); c.lineTo(-6 + Math.cos(w) * 34, 12 + Math.sin(w) * 25); c.stroke(); }
      c.beginPath(); c.moveTo(12, 0); c.quadraticCurveTo(30, 2, 39 + schnuppern, 12); c.quadraticCurveTo(30, 24, 10, 24); c.closePath(); malen(c, '#d9a679', 2);
      kreis(c, 39.5 + schnuppern, 11.5, 3.2); malen(c, K, 1);
      auge(c, 23, 8, 3.2, zwinkern(t));
      oval(c, 27, 16, 3, 2); c.fillStyle = 'rgba(240,120,120,.45)'; c.fill();
      c.save(); c.translate(-10, -14); c.rotate(0.5 + sw(t, 2.4) * 0.08); sternPfad(c, 8, 4, 5); malen(c, '#f08c00', 1.3); c.restore();
      c.restore();
    } },
    'h-pilz': { name: 'Fliegenpilz', symbol: '🍄', ruhe: 0.7, zeichne(c, t) {
      linie(c, 2, '#2f9e44');
      [[-24, 46, -28, 34], [-20, 46, -16, 35], [20, 46, 26, 35], [24, 46, 20, 36]].forEach(([a, b, x, y]) => { c.beginPath(); c.moveTo(a, b); c.quadraticCurveTo(a, y + 4, x, y); c.stroke(); });
      c.save(); c.translate(0, 44); c.rotate(sw(t, 2.4) * 0.06); c.translate(0, -44);
      c.beginPath(); c.moveTo(-9, 44); c.quadraticCurveTo(-7, 20, -7, 2); c.lineTo(7, 2); c.quadraticCurveTo(7, 20, 9, 44); c.closePath(); malen(c, '#fff4e6', 2);
      oval(c, 0, 12, 12, 4); malen(c, '#f1e3d3', 1.6);
      c.beginPath(); c.ellipse(0, 4, 34, 28, 0, Math.PI, 0); c.quadraticCurveTo(0, 12, -34, 4); c.closePath(); malen(c, '#e03131', 2.2);
      [[-18, -8, 4.5], [0, -18, 5], [17, -8, 4], [-6, -4, 3], [26, -1, 2.6], [-27, -1, 2.6]].forEach(([x, y, r]) => { oval(c, x, y, r, r * 0.8); malen(c, '#ffffff', 1.2); });
      c.restore();
      // Regentropfen, die vom Hut abprallen
      for (let i = 0; i < 6; i++) {
        const x = -27 + i * 11, p = (t * 0.9 + i * 0.37) % 1, hut = 4 - 28 * Math.sqrt(Math.max(0, 1 - (x / 34) ** 2));
        if (p < 0.8) {
          const y = -54 + (hut + 54) * (p / 0.8);
          c.beginPath(); c.moveTo(x, y - 5); c.quadraticCurveTo(x + 3, y + 1, x, y + 2); c.quadraticCurveTo(x - 3, y + 1, x, y - 5); malen(c, '#74c0fc', 1);
        } else {
          const q = (p - 0.8) / 0.2; c.save(); c.globalAlpha = 1 - q; linie(c, 1.2, '#4dabf7');
          c.beginPath(); c.moveTo(x - 2 - q * 4, hut - 2 - q * 3); c.lineTo(x - 4 - q * 6, hut - 4 - q * 4); c.moveTo(x + 2 + q * 4, hut - 2 - q * 3); c.lineTo(x + 4 + q * 6, hut - 4 - q * 4); c.stroke(); c.restore();
        }
      }
    } },
    'h-schirm': { name: 'Regenschirm', symbol: '☂️', ruhe: 0.2, zeichne(c, t) {
      const z = zufall(23), rot = sw(t, 2.8) * 0.12;
      linie(c, 1.6, '#4dabf7');
      for (let i = 0; i < 16; i++) {
        const x0 = z() * 100 - 50, v = 0.9 + z() * 0.5, ph = z(), p = (t * v + ph) % 1, y = p * 110 - 55, x = x0 - p * 6;
        if (y > -36 && y < 30 && Math.abs(x) < 38) continue;   // unter dem Schirm bleibt es trocken
        c.beginPath(); c.moveTo(x, y); c.lineTo(x - 1.5, y + 6); c.stroke();
      }
      c.save(); c.rotate(rot);
      const dach = () => { c.beginPath(); c.moveTo(-40, -2); c.ellipse(0, -2, 40, 34, 0, Math.PI, 0); for (let k = 3; k >= 0; k--) c.quadraticCurveTo(-30 + k * 20, -10, -40 + k * 20, -2); c.closePath(); };
      c.save(); dach(); c.clip();
      for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(0, -40); c.lineTo(-40 + k * 20, 2); c.lineTo(-20 + k * 20, 2); c.closePath(); c.fillStyle = k % 2 ? '#fab005' : '#4263eb'; c.fill(); }
      c.restore();
      dach(); malen(c, null, 2.2);
      linie(c, 1.4); for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(0, -36); c.lineTo(-40 + k * 20, -2); c.stroke(); }
      linie(c, 5.5); c.beginPath(); c.moveTo(0, -40); c.lineTo(0, 30); c.arc(6, 30, 6, Math.PI, 0, true); c.stroke();
      linie(c, 2.8, '#8d5a3b'); c.beginPath(); c.moveTo(0, -2); c.lineTo(0, 30); c.arc(6, 30, 6, Math.PI, 0, true); c.stroke();
      kreis(c, 0, -41, 2.6); malen(c, '#fab005', 1.2);
      c.restore();
    } },
    'h-schrift': { name: 'Hallo Herbst', symbol: '✍️', ruhe: 0.5, zeichne(c, t) {
      const fam = 'Caveat, "Comic Sans MS", cursive';
      const v = c.createLinearGradient(-40, 0, 40, 0); v.addColorStop(0, '#e8590c'); v.addColorStop(0.5, '#f59f00'); v.addColorStop(1, '#c92a2a');
      wellenText(c, 'Hallo', -4, 36, fam, 700, v, t, 0);
      wellenText(c, 'Herbst', 28, 40, fam, 700, v, t, 0.4);
      c.save(); c.translate(34 + sw(t, 2) * 5, -32 + sw(t, 1.3) * 3); c.rotate(sw(t, 2) * 0.6); sternPfad(c, 8, 4, 5); malen(c, '#e8590c', 1.3); c.restore();
      c.save(); c.translate(-38, -34 + sw(t, 1.7, 0.3) * 3); c.rotate(-0.6 + sw(t, 1.7) * 0.5); blattPfad(c, 7); malen(c, '#fab005', 1.3); c.restore();
    } },
    // ===================== Winter (seit 1.1.0) =====================
    'wi-pinguin': { name: 'Pinguin', symbol: '🐧', ruhe: 0.4, zeichne(c, t) {
      const w = sw(t, 1.1), links = Math.max(0, w) * 3, rechts = Math.max(0, -w) * 3, flap = sw(t, 0.55) * 0.35;
      c.save(); c.globalAlpha = 0.16; oval(c, 0, 44, 20, 3.5); c.fillStyle = '#000'; c.fill(); c.restore();
      c.save(); c.translate(0, 44); c.rotate(w * 0.12); c.translate(0, -44);
      oval(c, -9, 41 - links, 8, 4); malen(c, '#fd7e14', 1.6); oval(c, 9, 41 - rechts, 8, 4); malen(c, '#fd7e14', 1.6);
      oval(c, 0, 6, 24, 35); malen(c, '#1c2733', 2.4);
      oval(c, 0, 13, 17, 26); c.fillStyle = '#f8f9fa'; c.fill(); oval(c, 0, -14, 15, 13); c.fill();
      [[-1, -22], [1, 22]].forEach(([s, x]) => { c.save(); c.translate(x, -2); c.rotate(s * (0.35 + flap)); oval(c, 0, 12, 6, 16); malen(c, '#1c2733', 2); c.restore(); });
      oval(c, 0, -3, 19, 5); malen(c, '#e03131', 1.8);
      c.save(); c.translate(11, -1); c.rotate(0.2 + sw(t, 0.9) * 0.2); c.beginPath(); c.moveTo(-3, 0); c.lineTo(3, 0); c.lineTo(5, 16); c.lineTo(-1, 16); c.closePath(); malen(c, '#e03131', 1.6); c.restore();
      const auf = zwinkern(t, 2.7);
      auge(c, -6, -16, 3.3, auf); auge(c, 6, -16, 3.3, auf);
      c.beginPath(); c.moveTo(-4.5, -10); c.lineTo(4.5, -10); c.lineTo(0, -4); c.closePath(); malen(c, '#fd7e14', 1.4);
      c.fillStyle = 'rgba(255,120,150,.45)'; oval(c, -10, -9, 3, 2); c.fill(); oval(c, 10, -9, 3, 2); c.fill();
      c.restore();
    } },
    'wi-tasse': { name: 'Heiße Schokolade', symbol: '☕', ruhe: 0.8, zeichne(c, t) {
      for (let j = 0; j < 3; j++) {
        const x0 = -12 + j * 10;
        c.beginPath();
        for (let k = 0; k <= 12; k++) { const y = -12 - k * 3, x = x0 + Math.sin(k * 0.6 - t * 3 + j * 2) * 3.5; k ? c.lineTo(x, y) : c.moveTo(x, y); }
        c.save(); c.globalAlpha = 0.55 + 0.35 * sw(t, 1.3, j * 0.3); linie(c, 4.6, 'rgba(110,120,140,.45)'); c.stroke(); linie(c, 2.2, '#ffffff'); c.stroke(); c.restore();
      }
      linie(c, 7.5); c.beginPath(); c.arc(21, 16, 10, -1.25, 1.25); c.stroke();
      linie(c, 4, '#1098ad'); c.beginPath(); c.arc(21, 16, 10, -1.25, 1.25); c.stroke();
      c.beginPath(); c.moveTo(-24, -4); c.lineTo(20, -4); c.lineTo(18, 34); c.quadraticCurveTo(17, 42, 9, 42); c.lineTo(-15, 42); c.quadraticCurveTo(-23, 42, -23, 34); c.closePath(); malen(c, '#1098ad', 2.4);
      c.save(); c.clip(); c.fillStyle = '#ffffff'; c.fillRect(-30, 14, 60, 6); c.restore();
      c.save(); c.translate(-2, 36); herzPfad(c, 9); malen(c, '#ff6b6b', 1.4); c.restore();
      oval(c, -2, -4, 22, 6); malen(c, '#6f3b1f', 2);
      [[-9, -7, 0.3], [4, -8, -0.4]].forEach(([x, y, r], i) => { c.save(); c.translate(x, y + sw(t, 1.7, i * 0.4) * 0.9); c.rotate(r); c.beginPath(); c.rect(-4, -3.5, 8, 7); malen(c, i ? '#ffe3ec' : '#ffffff', 1.3); c.restore(); });
    } },
    'wi-schneekugel': { name: 'Schneekugel', symbol: '🔮', ruhe: 1, zeichne(c, t) {
      c.save(); c.rotate(sw(t, 4) * 0.04);
      c.beginPath(); c.moveTo(-24, 28); c.lineTo(24, 28); c.lineTo(31, 46); c.lineTo(-31, 46); c.closePath(); malen(c, '#8b5a2b', 2.2);
      c.fillStyle = gold(c, 32, 38); c.fillRect(-27, 33, 54, 4);
      kreis(c, 0, -2, 32); c.save(); c.clip();
      const g = c.createLinearGradient(0, -34, 0, 30); g.addColorStop(0, '#e7f5ff'); g.addColorStop(1, '#a5d8ff'); c.fillStyle = g; c.fillRect(-34, -36, 68, 70);
      oval(c, 0, 26, 32, 10); c.fillStyle = '#ffffff'; c.fill();
      c.beginPath(); c.rect(-18, 6, 15, 13); malen(c, '#e03131', 1.6);
      c.beginPath(); c.moveTo(-21, 7); c.lineTo(-10.5, -3); c.lineTo(0, 7); c.closePath(); malen(c, '#ffffff', 1.6);
      c.beginPath(); c.rect(-12.5, 12, 4, 7); c.fillStyle = '#ffd43b'; c.fill();
      c.beginPath(); c.moveTo(14, -10); c.lineTo(23, 14); c.lineTo(5, 14); c.closePath(); malen(c, '#2f9e44', 1.6);
      const z = zufall(31);
      for (let i = 0; i < 24; i++) {
        const w0 = z() * TAU, rr = 4 + z() * 24, v = (0.35 + z() * 0.4) * (i % 2 ? 1 : -1), ph = z();
        const w = w0 + t * v, x = Math.cos(w) * rr, y = -2 + Math.sin(w) * rr * 0.7 + sw(t, 3, ph) * 4;
        kreis(c, x, y, 1.1 + z() * 1.1); c.fillStyle = '#ffffff'; c.fill(); linie(c, 0.5, 'rgba(70,110,160,.6)'); c.stroke();
      }
      c.restore();
      kreis(c, 0, -2, 32); malen(c, null, 2.4);
      linie(c, 3, 'rgba(255,255,255,.75)'); c.beginPath(); c.arc(0, -2, 26, Math.PI * 1.1, Math.PI * 1.4); c.stroke();
      c.restore();
    } },
    'wi-eiszapfen': { name: 'Eiszapfen', symbol: '🧊', ruhe: 0.3, zeichne(c, t) {
      c.beginPath(); c.rect(-48, -48, 96, 9); malen(c, '#8b5a2b', 2);
      const zapfen = [[-36, 30], [-22, 20], [-8, 44], [7, 26], [21, 38], [35, 18]];
      zapfen.forEach(([x, l], i) => {
        const g = c.createLinearGradient(0, -36, 0, -36 + l); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#a5d8ff');
        c.beginPath(); c.moveTo(x - 6, -36); c.lineTo(x + 6, -36); c.lineTo(x + sw(t, 3, i * 0.2) * 0.6, -36 + l); c.closePath(); c.fillStyle = g; c.fill(); linie(c, 1.6); c.stroke();
        linie(c, 1.4, 'rgba(255,255,255,.9)'); c.beginPath(); c.moveTo(x - 2.5, -32); c.lineTo(x - 0.8, -36 + l * 0.7); c.stroke();
        funkeln(c, x - 2, -30 + l * 0.4, 3.5, Math.max(0, sw(t, 1.9, i * 0.31)));
      });
      c.beginPath(); c.moveTo(-50, -42); c.lineTo(50, -42); c.lineTo(50, -33);
      for (let k = 5; k >= 0; k--) c.quadraticCurveTo(-42 + k * 17, -26, -50 + k * 17, -33);
      c.closePath(); malen(c, '#ffffff', 2);
      const p = (t / 1.8) % 1, x = -8, spitze = 8;
      if (p < 0.6) { const r = 1 + p / 0.6 * 2.4; c.beginPath(); c.moveTo(x, spitze - 1); c.quadraticCurveTo(x + r, spitze + r, x, spitze + r * 1.8); c.quadraticCurveTo(x - r, spitze + r, x, spitze - 1); malen(c, '#74c0fc', 1); }
      else { const q = (p - 0.6) / 0.4, y = spitze + 6 + q * q * 36; c.save(); c.globalAlpha = 1 - q * 0.6; c.beginPath(); c.moveTo(x, y - 5); c.quadraticCurveTo(x + 3.4, y + 1, x, y + 2.5); c.quadraticCurveTo(x - 3.4, y + 1, x, y - 5); malen(c, '#74c0fc', 1); c.restore(); }
    } },
    'wi-kristall': { name: 'Eiskristall', symbol: '❄️', ruhe: 0.5, zeichne(c, t) {
      const puls = 0.5 + 0.5 * sw(t, 2);
      schein(c, 0, 0, 48, 'rgba(165,216,255,A)', 0.35 + 0.3 * puls);
      c.save(); c.rotate(t * 0.25); c.scale(1 + 0.03 * puls, 1 + 0.03 * puls);
      const arm = () => { c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -38); [[-14, 10], [-26, 8]].forEach(([y, l]) => { c.moveTo(0, y); c.lineTo(-l, y - l * 0.8); c.moveTo(0, y); c.lineTo(l, y - l * 0.8); }); };
      [[7.5, '#1c7ed6'], [3.6, '#e7f5ff']].forEach(([lw, f]) => { for (let i = 0; i < 6; i++) { c.save(); c.rotate(i * TAU / 6); arm(); linie(c, lw, f); c.stroke(); c.beginPath(); c.moveTo(0, -46); c.lineTo(4, -41); c.lineTo(0, -36); c.lineTo(-4, -41); c.closePath(); c.fillStyle = f; c.fill(); if (lw > 4) { c.stroke(); } c.restore(); } });
      c.beginPath(); for (let i = 0; i < 6; i++) { const w = i * TAU / 6; c.lineTo(Math.cos(w) * 8, Math.sin(w) * 8); } c.closePath(); malen(c, '#e7f5ff', 2);
      c.restore();
      for (let i = 0; i < 6; i++) { const w = i * TAU / 6 + t * 0.25; funkeln(c, Math.cos(w - Math.PI / 2) * 44, Math.sin(w - Math.PI / 2) * 44, 4.5, Math.max(0, sw(t, 1.6, i * 0.17))); }
    } },
    'wi-muetze': { name: 'Bommelmütze', symbol: '🧶', ruhe: 0.25, zeichne(c, t) {
      const bx = sw(t, 1.3) * 6, by = -36 + sw(t, 0.65) * 2.5;
      c.beginPath(); c.moveTo(-30, 22); c.bezierCurveTo(-32, -18, -14, -28, 0, -28); c.bezierCurveTo(14, -28, 32, -18, 30, 22); c.closePath();
      malen(c, '#e03131', 2.4);
      c.save(); c.clip();
      c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(-34, -6); for (let k = 0; k <= 12; k++) c.lineTo(-34 + k * 6, k % 2 ? -1 : -6); c.lineTo(38, 6); for (let k = 12; k >= 0; k--) c.lineTo(-34 + k * 6, k % 2 ? 1 : 6); c.closePath(); c.fill();
      linie(c, 1, 'rgba(0,0,0,.16)');
      for (let r = 0; r < 5; r++) for (let k = 0; k < 9; k++) { const x = -28 + k * 7 + (r % 2) * 3.5, y = -18 + r * 9; if (y > -8 && y < 8) continue; c.beginPath(); c.moveTo(x - 2, y - 2); c.lineTo(x, y + 1.5); c.lineTo(x + 2, y - 2); c.stroke(); }
      c.restore();
      c.beginPath(); c.moveTo(-34, 18); c.lineTo(34, 18); c.quadraticCurveTo(37, 26, 34, 34); c.lineTo(-34, 34); c.quadraticCurveTo(-37, 26, -34, 18); c.closePath(); malen(c, '#f1f3f5', 2.2);
      linie(c, 1, 'rgba(0,0,0,.18)'); for (let k = 0; k < 13; k++) { c.beginPath(); c.moveTo(-30 + k * 5, 21); c.lineTo(-30 + k * 5, 31); c.stroke(); }
      linie(c, 2.2); c.beginPath(); c.moveTo(0, -27); c.quadraticCurveTo(bx * 0.4, -31, bx, by + 6); c.stroke();
      flauschPfad(c, bx, by, 11); malen(c, '#f8f9fa', 2);
    } },
    'wi-schrift': { name: 'Winterzauber', symbol: '✍️', ruhe: 0.6, zeichne(c, t) {
      const fam = 'Caveat, "Comic Sans MS", cursive', s = (t * 30) % 120;
      const v = c.createLinearGradient(-60 + s, 0, s, 0); v.addColorStop(0, '#1971c2'); v.addColorStop(0.5, '#a5d8ff'); v.addColorStop(1, '#1971c2');
      wellenText(c, 'Winter', -4, 40, fam, 700, v, t, 0);
      wellenText(c, 'zauber', 28, 40, fam, 700, v, t, 0.4);
      [[-40, -32, 5], [38, -30, 6], [-36, 38, 4], [40, 34, 4.5]].forEach(([x, y, r], i) => { c.save(); c.globalAlpha = 0.55 + 0.45 * sw(t, 1.8, i * 0.25); c.save(); flocke(c, x, y, r, t * 0.8 + i); c.restore(); c.restore(); });
    } },
  };
  // #rrggbb → Vorlage für schein() mit Platzhalter A für die Deckkraft
  function hexA(h) { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},A)`; }

  // Katalog: Reiter im Auswahl-Blatt, je Anlass die Kennungen in ANIM
  const KATALOG = [
    { name: '✨ Weihnachten', anlass: 'weihnachten', anim: ['w-schnee', 'w-stern', 'w-kerze', 'w-kugel', 'w-lichter', 'w-baum', 'w-geschenk', 'w-glocke', 'w-schneemann', 'w-rentier', 'w-lebkuchen', 'w-zuckerstange', 'w-muetze', 'w-schrift'] },
    { name: '🎆 Silvester', anlass: 'silvester', anim: ['s-feuerwerk', 's-wunderkerze', 's-sekt', 's-anstossen', 's-uhr', 's-klee', 's-schwein', 's-konfetti', 's-schrift'] },
    { name: '❄️ Winter', anlass: 'winter', anim: ['wi-pinguin', 'wi-tasse', 'wi-schneekugel', 'wi-eiszapfen', 'wi-kristall', 'wi-muetze', 'wi-schrift'] },
    { name: '🍂 Herbst', anlass: 'herbst', anim: ['h-blaetter', 'h-drache', 'h-kuerbis', 'h-igel', 'h-pilz', 'h-schirm', 'h-schrift'] },
  ];

  const gibt = kennung => typeof kennung === 'string' && Object.prototype.hasOwnProperty.call(ANIM, kennung);

  // zeichnet einen Sticker mit der Mitte auf (0, 0) des Zeichenkontexts c; groesse = Breite in Bildpunkten,
  // t = Zeit in Sekunden oder null für die Ruhe-Stellung. Unbekannte Kennungen zeichnen nichts.
  function zeichnen(c, kennung, groesse, t) {
    if (!gibt(kennung)) return false;
    const d = ANIM[kennung];
    c.save(); c.scale(groesse / 100, groesse / 100);
    try { d.zeichne(c, t == null ? d.ruhe : t); } finally { c.restore(); }
    return true;
  }

  // Angaben zu einem Sticker ohne die Zeichnung: { kennung, name, symbol, ruhe } oder null
  function angaben(kennung) {
    if (!gibt(kennung)) return null;
    const d = ANIM[kennung];
    return { kennung: kennung, name: d.name, symbol: d.symbol, ruhe: d.ruhe };
  }

  // Knopf mit bewegtem Vorschaubild für ein Auswahl-Blatt; läuft, solange der Knopf in der Seite steht.
  // o = { px: Kantenlänge in CSS-Pixeln (56), klasse: CSS-Klasse des Knopfs }
  function kachel(kennung, o) {
    o = o || {};
    const b = document.createElement('button'); b.type = 'button';
    if (o.klasse) b.className = o.klasse;
    const d = angaben(kennung);
    b.setAttribute('aria-label', 'Sticker ' + (d ? d.name : kennung));
    const cvs = document.createElement('canvas'), px = Math.round((o.px || 56) * Math.min(3, window.devicePixelRatio || 1));
    cvs.width = cvs.height = px; b.appendChild(cvs);
    const c = cvs.getContext('2d'), t0 = performance.now();
    const tick = now => {
      if (!b.isConnected && now - t0 > 500) return;
      c.clearRect(0, 0, px, px); c.save(); c.translate(px / 2, px / 2); zeichnen(c, kennung, px * 0.92, (now - t0) / 1000); c.restore();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return b;
  }

  const api = { VERSION: VERSION, ANIM: ANIM, KATALOG: KATALOG, gibt: gibt, zeichnen: zeichnen, angaben: angaben, kachel: kachel };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  wurzel.ImagicosmosSticker = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
