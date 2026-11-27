// Baustein „bildbearbeitung“ – Rechenkern der Bildbearbeitung: Foto drehen, spiegeln, zuschneiden, automatisch
// verbessern, Helligkeit, Kontrast, Farbe und Filter. Die Bedienung (Fenster, Knöpfe, Regler) baut jede App selbst.
//
// Grundsatz: Das Original bleibt erhalten. Die Bearbeitung ist nur eine Einstellung
//   { rot: 0/90/180/270, flip, crop: [x, y, b, h] als Anteile des gedrehten Bilds, auto, bri, con, sat (−100…100), fil,
//     str (Begradigen, −15…15 Grad in halben Graden), wrm (Wärme, −100…100), vig (Vignette, 0…100) }   – die letzten drei seit 1.1.0
// und daraus wird bei Bedarf ein neues Bild gerechnet. Ältere Einstellungen ohne str, wrm, vig gelten unverändert.
//
// Zusammengeführt am 17.11.2026 aus Imagiclique (app/edit.js) und Imagicruise (studio/bildbearbeitung.js).
// Im Browser: window.ImagicosmosBildBearbeitung. Unter Node (Tests): require(), dort gehen nur die Rechenteile ohne Bild.
(function (wurzel) {
  "use strict";
  var VERSION = "1.1.0";

  // [Kennung, Name, Filter des Zeichenkontexts]
  var FILTER = [
    ["none", "Original", ""],
    ["vivid", "Kräftig", "saturate(1.35) contrast(1.08)"],
    ["soft", "Weich", "contrast(.9) brightness(1.06) saturate(.88)"],
    ["warm", "Warm", "sepia(.28) saturate(1.15)"],
    ["bw", "Schwarz-Weiß", "grayscale(1) contrast(1.06)"],
    ["sepia", "Sepia", "sepia(.8) saturate(.9)"]
  ];
  var MIN_RAHMEN = 0.12;          // kleinster Ausschnitt beim Ziehen (Anteil)

  function grenze(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function standard() { return { rot: 0, flip: false, crop: [0, 0, 1, 1], auto: false, bri: 0, con: 0, sat: 0, fil: "none", str: 0, wrm: 0, vig: 0 }; }

  // ---------- Einstellung ----------
  // prüft eine (gespeicherte) Einstellung und liefert eine saubere Kopie; null, wenn keine da ist
  function sauber(e) {
    if (!e || typeof e !== "object") return null;
    var zahl = function (v, a, b) { return grenze(Math.round(+v || 0), a, b); };
    var c = Array.isArray(e.crop) && e.crop.length === 4 ? e.crop.map(function (v) { return grenze(+v || 0, 0, 1); }) : [0, 0, 1, 1];
    if (c[2] < .02 || c[3] < .02 || c[0] + c[2] > 1.0001 || c[1] + c[3] > 1.0001) c = [0, 0, 1, 1];
    return {
      rot: [0, 90, 180, 270].indexOf(+e.rot) >= 0 ? +e.rot : 0, flip: !!e.flip, crop: c, auto: !!e.auto,
      bri: zahl(e.bri, -100, 100), con: zahl(e.con, -100, 100), sat: zahl(e.sat, -100, 100),
      fil: FILTER.some(function (f) { return f[0] === e.fil; }) ? e.fil : "none",
      str: grenze(Math.round((+e.str || 0) * 2) / 2, -15, 15), wrm: zahl(e.wrm, -100, 100), vig: zahl(e.vig, 0, 100)
    };
  }
  // true, wenn die Einstellung nichts verändert (dann gilt das Original)
  function istStandard(e) {
    return !e || (!e.rot && !e.flip && !e.auto && !e.bri && !e.con && !e.sat && (!e.fil || e.fil === "none") && !e.str && !e.wrm && !e.vig &&
      e.crop[0] < .001 && e.crop[1] < .001 && e.crop[2] > .999 && e.crop[3] > .999);
  }
  // Breite und Höhe nach dem Drehen
  function gedreht(breite, hoehe, rot) { return rot % 180 !== 0 ? { breite: hoehe, hoehe: breite } : { breite: breite, hoehe: hoehe }; }

  // Begradigen um grad Grad: so stark vergrößern, dass das gedrehte Bild die Fläche breite × hoehe ganz füllt (keine leeren Ecken)
  function begradigenMass(breite, hoehe, grad) {
    var a = Math.abs(grad || 0) * Math.PI / 180, q = Math.max(breite / hoehe, hoehe / breite);
    return Math.cos(a) + q * Math.sin(a);
  }
  // Farben und Filter (auto, bri, con, sat, fil, wrm, vig) von einer Einstellung auf eine andere übertragen; Drehen,
  // Spiegeln, Zuschnitt und Begradigen des Ziels bleiben (die gehören zum einzelnen Foto). Liefert eine neue Einstellung.
  function uebertragen(von, auf) {
    var v = sauber(von) || standard(), n = sauber(auf) || standard();
    ["auto", "bri", "con", "sat", "fil", "wrm", "vig"].forEach(function (k) { n[k] = v[k]; });
    return n;
  }
  // Drehen nimmt den Ausschnitt mit; q = Vierteldrehungen im Uhrzeigersinn (3 = links). Liefert eine neue Einstellung.
  function drehen(e, q) {
    var n = sauber(e) || standard(), c = n.crop.slice(), i;
    q = ((Math.round(q) % 4) + 4) % 4;
    for (i = 0; i < q; i++) c = [1 - (c[1] + c[3]), c[0], c[3], c[2]];
    n.crop = c; n.rot = (n.rot + 90 * q) % 360;
    return n;
  }
  // waagerecht spiegeln, so wie das Bild gerade zu sehen ist (der Ausschnitt wandert mit)
  function spiegeln(e) {
    var n = sauber(e) || standard(), c = n.crop;
    n.crop = [1 - (c[0] + c[2]), c[1], c[2], c[3]]; n.rot = (360 - n.rot) % 360; n.flip = !n.flip; n.str = -n.str || 0;   // gespiegelt kippt das Begradigen andersherum
    return n;
  }
  // größter mittiger Ausschnitt mit dem Seitenverhältnis r (Breite : Höhe) im gedrehten Bild rw × rh
  function formatAusschnitt(r, rw, rh) {
    var k = r * rh / rw, w = 1, h = w / k;
    if (h > 1) { h = 1; w = k; }
    return [(1 - w) / 2, (1 - h) / 2, w, h];
  }
  // Rahmen ziehen: griff "move" (verschieben) oder eine Ecke "nw", "ne", "sw", "se"; dx, dy als Anteil der
  // angezeigten Breite/Höhe; r = festes Seitenverhältnis (0 = frei) im gedrehten Bild rw × rh. Liefert den neuen Ausschnitt.
  function ziehen(crop, griff, dx, dy, r, rw, rh, min) {
    min = min || MIN_RAHMEN;
    var x = crop[0], y = crop[1], w = crop[2], h = crop[3];
    if (griff === "move") return [grenze(x + dx, 0, 1 - w), grenze(y + dy, 0, 1 - h), w, h];
    var west = griff.indexOf("w") >= 0, nord = griff.indexOf("n") >= 0, x1 = x, y1 = y, x2 = x + w, y2 = y + h;
    if (west) x1 = grenze(x1 + dx, 0, x2 - min); else x2 = grenze(x2 + dx, x1 + min, 1);
    if (nord) y1 = grenze(y1 + dy, 0, y2 - min); else y2 = grenze(y2 + dy, y1 + min, 1);
    if (r) {                                       // festes Seitenverhältnis: die Breite führt, die Höhe folgt
      var k = r * rh / rw, maxH = nord ? y2 : 1 - y1, nw = x2 - x1, nh = nw / k;
      if (nh > maxH) { nh = maxH; nw = nh * k; }
      if (west) x1 = x2 - nw; else x2 = x1 + nw;
      if (nord) y1 = y2 - nh; else y2 = y1 + nh;
    }
    return [x1, y1, x2 - x1, y2 - y1];
  }

  // ---------- Farben ----------
  var kannFilterWert = null;
  // kann der Browser Farbfilter beim Zeichnen? (sonst Regler und Filter ausblenden)
  function kannFilter() {
    if (kannFilterWert === null) {
      try { kannFilterWert = !!wurzel.document && typeof wurzel.document.createElement("canvas").getContext("2d").filter === "string"; }
      catch (e) { kannFilterWert = false; }
    }
    return kannFilterWert;
  }
  // Text für ctx.filter aus Helligkeit, Kontrast, Farbe und Filter; mitFilter = false liefert ihn auch ohne Browser (Tests)
  function filterText(e, mitFilter) {
    if (mitFilter === undefined ? !kannFilter() : !mitFilter) return "";
    var f = [];
    if (e.bri) f.push("brightness(" + (1 + e.bri / 200).toFixed(3) + ")");
    if (e.con) f.push("contrast(" + (1 + e.con / 200).toFixed(3) + ")");
    if (e.sat) f.push("saturate(" + (1 + e.sat / 100).toFixed(3) + ")");
    var p = (FILTER.filter(function (x) { return x[0] === e.fil; })[0] || [])[2];
    if (p) f.push(p);
    return f.join(" ");
  }
  // „Automatisch verbessern“, Rechenteil: aus den Bildpunkten (RGBA) eine Tonwertkurve (256 Werte) oder null, wenn das
  // Bild schon gut ist. Tonwerte spreizen (dunkelste und hellste 0,5 % abschneiden) und die Mitte Richtung mittlere
  // Helligkeit ziehen – vorsichtig begrenzt, damit Abend- und Schneebilder ihren Charakter behalten.
  function tonwertKurve(d) {
    var hist = new Uint32Array(256), n = d.length / 4, sum = 0, i, l;
    if (!n) return null;
    for (i = 0; i < d.length; i += 4) { l = (d[i] * 54 + d[i + 1] * 183 + d[i + 2] * 19) >> 8; hist[l]++; sum += l; }
    var lo = 0, hi = 255, acc = 0;
    for (; lo < 255; lo++) { acc += hist[lo]; if (acc > n * .005) break; }
    for (acc = 0; hi > 0; hi--) { acc += hist[hi]; if (acc > n * .005) break; }
    lo = Math.min(lo, 60); hi = Math.max(hi, 195);
    var mitte = grenze((sum / n - lo) / (hi - lo), .05, .95), gamma = grenze(Math.log(.47) / Math.log(mitte), .78, 1.3);
    if (lo < 3 && hi > 252 && Math.abs(gamma - 1) < .03) return null;
    var lut = new Uint8ClampedArray(256);
    for (var v = 0; v < 256; v++) lut[v] = Math.round(255 * Math.pow(grenze((v - lo) / (hi - lo), 0, 1), gamma));
    return lut;
  }

  // ---------- Bilder (nur im Browser) ----------
  function leinwand(b, h) { var c = wurzel.document.createElement("canvas"); c.width = b; c.height = h; return c; }
  // wendet „Automatisch verbessern“ auf eine Zeichenfläche an (gemessen an einer kleinen Fassung)
  function verbessern(c) {
    var k = Math.min(1, 160 / Math.max(c.width, c.height));
    var s = leinwand(Math.max(1, Math.round(c.width * k)), Math.max(1, Math.round(c.height * k)));
    var sx = s.getContext("2d"); sx.drawImage(c, 0, 0, s.width, s.height);
    var lut = tonwertKurve(sx.getImageData(0, 0, s.width, s.height).data);
    if (!lut) return;
    var x = c.getContext("2d"), im = x.getImageData(0, 0, c.width, c.height), q = im.data;
    for (var i = 0; i < q.length; i += 4) { q[i] = lut[q[i]]; q[i + 1] = lut[q[i + 1]]; q[i + 2] = lut[q[i + 2]]; }
    x.putImageData(im, 0, 0);
  }
  // Wärme (Rot/Gelb mehr, Blau weniger bzw. umgekehrt) und Vignette (Ränder dunkler) direkt auf die Bildpunkte
  function farbtoene(c, e) {
    var w = (e.wrm || 0) / 100, v = (e.vig || 0) / 100;
    if (!w && !v) return;
    var x = c.getContext("2d"), im = x.getImageData(0, 0, c.width, c.height), q = im.data, B = c.width, H = c.height;
    var kr = 1 + 0.14 * w, kg = 1 + 0.03 * w, kb = 1 - 0.14 * w, i, px, py, k;
    var stufen = 512, abfall = new Float32Array(stufen + 1);       // Abdunkeln nach Abstand zur Mitte (0 Mitte … 1 Ecke)
    for (k = 0; k <= stufen; k++) abfall[k] = 1 - v * 0.62 * Math.pow(Math.max(0, (k / stufen - 0.18) / 0.82), 1.6);
    var mx = B / 2, my = H / 2;
    for (py = 0, i = 0; py < H; py++) {
      var dy = (py - my) / my, dy2 = dy * dy;
      for (px = 0; px < B; px++, i += 4) {
        var f = 1;
        if (v) { var dx = (px - mx) / mx; f = abfall[Math.min(stufen, Math.round((dx * dx + dy2) / 2 * stufen))]; }
        q[i] = q[i] * kr * f; q[i + 1] = q[i + 1] * kg * f; q[i + 2] = q[i + 2] * kb * f;
      }
    }
    x.putImageData(im, 0, 0);
  }
  // rechnet aus dem Original (Zeichenfläche oder Bild) das bearbeitete Bild; max begrenzt die längere Seite (0 = volle Größe)
  function backen(src, einstellung, max) {
    var e = sauber(einstellung) || standard();
    var g = gedreht(src.width, src.height, e.rot), rw = g.breite, rh = g.hoehe;
    var cx = e.crop[0], cy = e.crop[1], sw = Math.max(8, e.crop[2] * rw), sh = Math.max(8, e.crop[3] * rh);
    var k = max ? Math.min(1, max / Math.max(sw, sh)) : 1, f = filterText(e);
    var aus = leinwand(Math.max(1, Math.round(sw * k)), Math.max(1, Math.round(sh * k)));
    var x = aus.getContext("2d"); x.imageSmoothingQuality = "high";
    if (f && !e.auto) x.filter = f;
    x.save(); x.scale(k, k); x.translate(-cx * rw + rw / 2, -cy * rh + rh / 2);
    if (e.str) { var m = begradigenMass(rw, rh, e.str); x.rotate(e.str * Math.PI / 180); x.scale(m, m); }   // Begradigen um die Mitte
    x.rotate(e.rot * Math.PI / 180); if (e.flip) x.scale(-1, 1);
    x.drawImage(src, -src.width / 2, -src.height / 2); x.restore();
    if (!e.auto) { farbtoene(aus, e); return aus; }
    verbessern(aus);                               // erst die Tonwerte, dann die Farben
    if (!f) { farbtoene(aus, e); return aus; }
    var o2 = leinwand(aus.width, aus.height), x2 = o2.getContext("2d"); x2.filter = f; x2.drawImage(aus, 0, 0);
    farbtoene(o2, e);
    return o2;
  }
  // verkleinerte Fassung (z. B. für die Vorschau beim Bearbeiten); lange Seite höchstens max
  function verkleinern(src, max) {
    var k = Math.min(1, max / Math.max(src.width, src.height));
    var c = leinwand(Math.max(1, Math.round(src.width * k)), Math.max(1, Math.round(src.height * k)));
    var x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  // Datei/Blob → Zeichenfläche in voller Größe
  function laden(blob) {
    return createImageBitmap(blob).then(function (bmp) {
      var c = leinwand(bmp.width, bmp.height);
      c.getContext("2d").drawImage(bmp, 0, 0); if (bmp.close) bmp.close();
      return c;
    });
  }
  // Zeichenfläche → JPEG-Blob
  function alsJpeg(c, qualitaet) {
    return new Promise(function (ok, nein) {
      c.toBlob(function (b) { b ? ok(b) : nein(new Error("Das Bild konnte nicht gespeichert werden.")); }, "image/jpeg", qualitaet || 0.85);
    });
  }
  // Blob + Einstellung → { blob (JPEG), breite, hoehe }; o = { maxSeite (0 = volle Größe), qualitaet (0,85) }
  function anwenden(blob, einstellung, o) {
    o = o || {};
    return laden(blob).then(function (src) {
      var c = backen(src, einstellung, o.maxSeite || 0);
      return alsJpeg(c, o.qualitaet).then(function (b) { return { blob: b, breite: c.width, hoehe: c.height }; });
    });
  }

  var api = {
    VERSION: VERSION, FILTER: FILTER, MIN_RAHMEN: MIN_RAHMEN,
    standard: standard, sauber: sauber, istStandard: istStandard, gedreht: gedreht,
    drehen: drehen, spiegeln: spiegeln, formatAusschnitt: formatAusschnitt, ziehen: ziehen, begradigenMass: begradigenMass, uebertragen: uebertragen,
    kannFilter: kannFilter, filterText: filterText, tonwertKurve: tonwertKurve,
    verbessern: verbessern, farbtoene: farbtoene, backen: backen, verkleinern: verkleinern, laden: laden, alsJpeg: alsJpeg, anwenden: anwenden
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  wurzel.ImagicosmosBildBearbeitung = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
