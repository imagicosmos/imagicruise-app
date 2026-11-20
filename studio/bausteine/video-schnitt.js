// Baustein „videoschnitt“ – Video zuschneiden und verkleinern. Quelle: Repo imagicosmos/bausteine, videoschnitt/video-schnitt.js.
// In den Apps eine Kopie: NICHT VON HAND ÄNDERN, Fehler im Repo bausteine beheben und neu einbauen.
//
// Ein Handy-Video wird im Browser zugeschnitten (Anfang/Ende) und neu geschrieben: H.264 mit Ton (AAC), 30 Bilder je
// Sekunde, verkleinert. Dabei entsteht eine ganz neue Datei: Aufnahmeort, Aufnahmedatum und Gerätedaten des Originals
// sind nicht mehr enthalten. Wahlweise im eigenen Format (z. B. Hochformat 720 × 1280) mit Zuschnitt, ganzem Bild oder
// ganzem Bild auf unscharfem Hintergrund, mit eigener Lautstärke und mit einer Ebene darüber (Wasserzeichen, „1/3“).
//
// Zusammengeführt am 17.11.2026 aus Imagicruise (studio/video.js) und Imagiclique (app/clip.js).
// mp4box.js (BSD-3) liest nur die Kopfdaten; die Bilder werden stückweise aus der Datei geholt, sodass auch große Videos
// nicht in den Arbeitsspeicher müssen. mp4-muxer (MIT) schreibt das Ergebnis. Beide liegen neben dieser Datei und
// werden erst geladen, wenn sie gebraucht werden. Die Rechenteile laufen auch unter Node.js (Tests).
(function (wurzel) {
  "use strict";

  var VERSION = "1.3.0";
  var BILDER = 30, MAX_SEITE = 1280, MAX_DAUER = 60, STILLSTAND = 45000;

  // Ordner der Fremd-Bausteine: derselbe wie der dieser Datei (änderbar mit einstellen({ ordner }))
  var ordner = (function () {
    try { var s = wurzel.document && wurzel.document.currentScript; return s && s.src ? s.src.replace(/[^\/]*$/, "") : ""; }
    catch (e) { return ""; }
  })();
  function einstellen(o) { if (o && typeof o.ordner === "string") ordner = o.ordner.replace(/\/?$/, "/"); }

  var geladen = {};
  function skript(datei, name) {
    if (wurzel[name]) return Promise.resolve(wurzel[name]);
    var pfad = ordner + datei;
    if (!geladen[pfad]) geladen[pfad] = new Promise(function (ok) {
      var s = wurzel.document.createElement("script");
      s.src = pfad;
      s.onload = function () { ok(wurzel[name] || null); };
      s.onerror = function () { delete geladen[pfad]; ok(null); };
      wurzel.document.head.appendChild(s);
    });
    return geladen[pfad];
  }

  // Warten auf den nächsten Schritt der Video-Bausteine: Jede Ausgabe und jede abgearbeitete Aufgabe gibt ein Signal
  // (anstoss). So hängt das Tempo nicht an Zeitgebern – die bremst der Browser stark, sobald die Seite nicht im
  // Vordergrund ist. Der Zeitgeber ist nur die Rückfallebene.
  var wartende = [];
  function anstoss() { var w = wartende; wartende = []; w.forEach(function (f) { f(); }); }
  function puls(ms) { return new Promise(function (r) { wartende.push(r); setTimeout(r, ms || 50); }); }
  function warte(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  // kurz Luft holen (Oberfläche zeichnen lassen), ohne Zeitgeber
  function atem() { return new Promise(function (r) { var k = new MessageChannel(); k.port1.onmessage = function () { r(); }; k.port2.postMessage(0); }); }
  function melder(x) { try { x.ondequeue = anstoss; } catch (e) { /* älterer Browser: dann nur über die Ausgabe */ } return x; }
  // Wartet, solange bedingung() gilt – höchstens `frist` Millisekunden, sonst Fehler (nie endlos hängen)
  async function solange(bedingung, pause, frist, was) {
    var ende = Date.now() + frist;
    while (bedingung()) {
      if (Date.now() > ende) throw new Error(was);
      await puls(pause);
    }
  }

  function kann() { return "VideoDecoder" in wurzel && "VideoEncoder" in wurzel && "VideoFrame" in wurzel; }

  // ---------- Rechenteile (auch unter Node.js) ----------

  function gerade(n) { return Math.max(2, Math.round(n / 2) * 2); }
  // Drehung aus der Matrix des Videos: 0, 90, 180 oder 270 Grad
  function drehung(m) { return m ? ((Math.round(Math.atan2(m[1], m[0]) * 180 / Math.PI) % 360) + 360) % 360 : 0; }
  // Zielgröße: wie das Video (angezeigt), lange Seite höchstens maxSeite, gerade Zahlen (verlangt H.264)
  function zielmasse(k, maxSeite) {
    var s = Math.min(1, (maxSeite || MAX_SEITE) / Math.max(k.breite, k.hoehe));
    return { breite: gerade(k.breite * s), hoehe: gerade(k.hoehe * s) };
  }
  // Datenrate fürs Bild (Bit je Sekunde): 1280 × 720 ≈ 3,3 Mbit/s, höchstens 4,5, mindestens 1,2
  function bitrate(breite, hoehe) { return Math.round(Math.min(4.5e6, Math.max(1.2e6, breite * hoehe * 3.6))); }
  // Ausschnitt auf das Video begrenzen: mindestens 0,2 s, höchstens maxDauer (0 = ohne Grenze)
  function begrenzen(a, b, dauer, maxDauer) {
    a = Math.max(0, Math.min(+a || 0, dauer));
    var grenze = maxDauer > 0 ? a + maxDauer : Infinity;
    b = Math.max(a + 0.2, Math.min(isFinite(+b) ? +b : dauer, dauer, grenze));
    return { a: a, b: b };
  }
  // Ausschnitt a…b in gleich lange Teile von höchstens maxTeil Sekunden
  function teile(a, b, maxTeil) {
    var laenge = b - a, n = maxTeil > 0 ? Math.max(1, Math.ceil((laenge - 0.05) / maxTeil)) : 1, aus = [];
    for (var i = 0; i < n; i++) aus.push({ a: a + laenge * i / n, b: a + laenge * (i + 1) / n });
    return aus;
  }
  // Welche Proben gebraucht werden: ab dem Schlüsselbild vor a, bis 1 s nach b (wegen umsortierter Bilder)
  function ausschnitt(proben, ts, a, b) {
    var erster = 0, letzter = proben.length, i;
    for (i = 0; i < proben.length; i++) { if (proben[i].cts / ts > a) break; if (proben[i].is_sync) erster = i; }
    for (i = erster; i < proben.length; i++) if (proben[i].dts / ts > b + 1) { letzter = i; break; }
    return { erster: erster, letzter: letzter };
  }
  // ---------- Schnellweg (seit 1.2.0): ohne Neurechnen schneiden ----------
  // Zeiten (Sekunden, Anzeige) der Schlüsselbilder; nur ab ihnen lässt sich ein Video ohne Neurechnen anfangen
  function schluesselbilder(k) {
    var aus = [];
    (k.vs || []).forEach(function (p) { if (p.is_sync) aus.push(p.cts / k.vts); });
    return aus.sort(function (x, y) { return x - y; });
  }
  function davor(zeiten, t) { var z = -1; for (var i = 0; i < zeiten.length && zeiten[i] <= t + 1e-6; i++) z = zeiten[i]; return z; }
  // Teile für den Schnellweg: jeder beginnt an einem Schlüsselbild (der erste am letzten Schlüsselbild bis a), keiner länger als
  // maxTeil, möglichst gleich lang. zeiten = schluesselbilder(k). → [{ a, b }]
  function schnellTeile(a, b, maxTeil, zeiten) {
    var start = davor(zeiten, a); if (start < 0) start = a;
    var laenge = b - start, abstand = 0, i;
    for (i = 1; i < zeiten.length; i++) abstand = Math.max(abstand, zeiten[i] - zeiten[i - 1]);
    var n = maxTeil > 0 ? Math.max(1, Math.ceil((laenge + Math.min(abstand, maxTeil / 4) - 0.05) / maxTeil)) : 1, aus = [], von = start;
    for (var t = 1; t < n; t++) {
      var ziel = Math.min(von + maxTeil, start + laenge * t / n), schnitt = davor(zeiten, ziel);
      if (schnitt <= von + 1) schnitt = ziel;                    // kein Schlüsselbild dazwischen: dann dort (wird ungenauer)
      aus.push({ a: von, b: schnitt }); von = schnitt;
    }
    aus.push({ a: von, b: b });
    return aus;
  }
  // ungefähre Größe (Bytes) eines Ausschnitts ohne Neurechnen: Summe der Proben von Bild und Ton
  function groesse(k, a, b) {
    var summe = 0;
    [[k.vs, k.vts], [k.as, k.ats]].forEach(function (x) {
      (x[0] || []).forEach(function (p) { var t = p.cts / x[1]; if (t >= a - 1e-6 && t < b) summe += p.size; });
    });
    return summe;
  }

  // Ton linear auf eine andere Abtastrate bringen (für den zusätzlichen Ton)
  function umtasten(daten, von, nach) {
    if (!von || !nach || von === nach) return daten;
    var n = Math.max(1, Math.round(daten.length * nach / von)), aus = new Float32Array(n), f = von / nach, letzt = daten.length - 1;
    for (var i = 0; i < n; i++) {
      var x = i * f, j = Math.floor(x), r = x - j, u = daten[Math.min(j, letzt)], v = daten[Math.min(j + 1, letzt)];
      aus[i] = u + (v - u) * r;
    }
    return aus;
  }
  // Zusätzlicher Ton (AudioBuffer oder { abtastrate, kanaele: [links, rechts] }) → { l, r } in der Abtastrate rate
  function tonVorbereiten(t, rate) {
    if (!t) return null;
    var r0 = t.sampleRate || t.abtastrate, n = t.numberOfChannels || (t.kanaele ? t.kanaele.length : 0);
    if (!r0 || !n) return null;
    var hol = function (i) { return t.getChannelData ? t.getChannelData(i) : t.kanaele[i]; };
    var l = hol(0), r = n > 1 ? hol(1) : l;
    return { l: umtasten(l, r0, rate), r: r === l ? null : umtasten(r, r0, rate) };
  }
  // Ebene zum Zeitpunkt t (Sekunden ab Anfang des Ausschnitts): feste Zeichenfläche oder Funktion t → Zeichenfläche,
  // { bild, deckkraft } oder null → { bild, deckkraft } oder null
  function ebeneBei(e, t) {
    if (!e) return null;
    var x = typeof e === "function" ? e(t) : e;
    if (!x) return null;
    var d = x.bild ? (x.deckkraft == null ? 1 : +x.deckkraft) : 1;
    return d > 0 ? { bild: x.bild || x, deckkraft: Math.min(1, d) } : null;
  }
  // Median; ohneNull: nur Werte über 0 (Lautstärke: Stille zählt nicht als üblich)
  function mittelwert(feld, ohneNull) {
    var w = Array.prototype.slice.call(feld).filter(function (x) { return !ohneNull || x > 0; }).sort(function (x, y) { return x - y; });
    return w.length ? w[Math.floor(w.length / 2)] : 0;
  }
  // Teile mit klugen Schnittstellen für einen Ausschnitt a…b, der länger als maxTeil ist. Es entstehen so viele Teile
  // wie bei teile(), keiner länger als maxTeil. Jede Schnittstelle liegt nahe der gleichmäßigen Teilung (höchstens 15 s
  // daneben); dort wird bevorzugt ein Bildwechsel in einer Sprechpause genommen, sonst eine Pause, sonst ein Bildwechsel,
  // sonst die gleichmäßige Stelle. an = Ergebnis von untersuchen() (darf fehlen).
  // → [{ a, b, grund }], grund = Art der Schnittstelle am Ende: "szene+pause" | "pause" | "szene" | "gleich" (letzter Teil: null)
  function schnitte(a, b, maxTeil, an) {
    var laenge = b - a, n = maxTeil > 0 ? Math.max(1, Math.ceil((laenge - 0.05) / maxTeil)) : 1, aus = [], start = a;
    var P = an && an.pegel, Wc = an && an.wechsel, sch = an && an.schritt, m = P ? P.length : Wc ? Wc.length : 0;
    var a0 = an && typeof an.a === "number" ? an.a : a;
    var ref = P ? mittelwert(P, true) : 0, wRef = Wc ? mittelwert(Wc) : 0;
    var ruhe = function (i) {                                   // 0 (laut wie üblich) … 1 (still), über die Schnittstelle geglättet
      if (!P || !(ref > 0)) return 0;
      var s = 0, c = 0;
      for (var j = i - 2; j <= i + 1; j++) if (j >= 0 && j < m) { s += P[j]; c++; }
      return c ? Math.max(0, 1 - s / c / ref) : 0;
    };
    var szene = function (i) { return Wc && i > 0 && i < m && Wc[i] >= Math.max(0.12, wRef * 4) ? Wc[i] : 0; };
    for (var t = 1; t < n; t++) {
      var ideal = a + laenge * t / n, d = Math.min(15, laenge / n * 0.2);
      var lo = Math.max(start + 1, ideal - d, b - (n - t) * maxTeil), hi = Math.min(start + maxTeil, ideal + d), best = null;
      if (m && sch > 0 && lo <= hi) {
        for (var i = Math.max(1, Math.ceil((lo - a0) / sch - 1e-9)); i < m && a0 + i * sch <= hi + 1e-9; i++) {
          var z = a0 + i * sch, w = szene(i), r = ruhe(i), pause = r >= 0.65;
          if (!w && !pause) continue;
          var wert = (w ? 2 + w : 0) + (pause ? 1.5 + r : 0) - 0.3 * Math.abs(z - ideal) / Math.max(d, 1);
          if (!best || wert > best.wert) best = { z: z, wert: wert, grund: w && pause ? "szene+pause" : w ? "szene" : "pause" };
        }
      }
      var schnitt = best ? best.z : Math.min(start + maxTeil, Math.max(b - (n - t) * maxTeil, ideal));
      aus.push({ a: start, b: schnitt, grund: best ? best.grund : "gleich" });
      start = schnitt;
    }
    aus.push({ a: start, b: b, grund: null });
    return aus;
  }

  // Wo ein Bild (bw × bh, gedreht um rot) im Ziel W × H landet: Maßstab s und Verschiebung dx/dy vom Mittelpunkt.
  // art "fuellen": füllt das Ziel, Überstand wird abgeschnitten (fx/fy 0…1 wählt den Ausschnitt, 0,5 = Mitte);
  // "ganz": ganzes Bild, Ränder bleiben frei
  function lage(bw, bh, rot, W, H, art, fx, fy) {
    var quer = rot % 180 !== 0, w = quer ? bh : bw, h = quer ? bw : bh, fuellen = art !== "ganz";
    var s = fuellen ? Math.max(W / w, H / h) : Math.min(W / w, H / h);
    fx = typeof fx === "number" ? fx : 0.5; fy = typeof fy === "number" ? fy : 0.5;
    return { s: s, dx: fuellen ? (W - w * s) * (fx - 0.5) : 0, dy: fuellen ? (H - h * s) * (fy - 0.5) : 0 };
  }

  // ---------- Zeichnen (Browser) ----------

  function bildZeichnen(c, bild, bw, bh, rot, W, H, art, fx, fy) {
    var l = lage(bw, bh, rot, W, H, art, fx, fy);
    c.save(); c.translate(W / 2 + l.dx, H / 2 + l.dy); c.rotate(rot * Math.PI / 180);
    c.drawImage(bild, -bw * l.s / 2, -bh * l.s / 2, bw * l.s, bh * l.s); c.restore();
  }
  // art "unscharf": ganzes Bild auf einem unscharfen, abgedunkelten Hintergrund aus demselben Bild
  // Seit 1.1.1 wird nur die kleine Fassung weichgezeichnet und danach vergrößert: Der Weichzeichner über die ganze Fläche
  // kostete je Bild viel Zeit (ein Video mit unscharfem Hintergrund brauchte etwa 50 % länger, Handy-Test Imagiclique 12.4).
  var klein = null, weich = null;
  function zeichnen(c, bild, bw, bh, rot, W, H, art, fx, fy) {
    if (art !== "unscharf") { bildZeichnen(c, bild, bw, bh, rot, W, H, art, fx, fy); return; }
    var kw = 90, kh = Math.max(2, Math.round(90 * H / W)), r = Math.max(1, Math.round(Math.max(W, H) / 70 * kw / W));
    if (!klein) { klein = wurzel.document.createElement("canvas"); weich = wurzel.document.createElement("canvas"); }
    if (klein.width !== kw || klein.height !== kh) { klein.width = weich.width = kw; klein.height = weich.height = kh; }
    bildZeichnen(klein.getContext("2d"), bild, bw, bh, rot, kw, kh, "fuellen");          // stark verkleinert …
    var wx = weich.getContext("2d");
    wx.filter = "blur(" + r + "px) brightness(.7)"; wx.drawImage(klein, -r * 2, -r * 2, kw + r * 4, kh + r * 4); wx.filter = "none";
    c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high";
    c.drawImage(weich, 0, 0, W, H); c.restore();                                          // … weich, dann vergrößert
    bildZeichnen(c, bild, bw, bh, rot, W, H, "ganz");
  }

  // ---------- Kopfdaten lesen (auch wenn sie am Dateiende stehen); die Bilddaten bleiben in der Datei ----------
  async function kopf(datei) {
    var lib = await skript("mp4box.all.min.js", "MP4Box");
    if (!lib || !kann()) throw new Error("Dieser Browser kann Videos nicht verarbeiten. Am besten geht es mit Chrome oder Edge.");
    var mp4 = lib.createFile(false), info = null, fehler = null;
    mp4.onReady = function (i) { info = i; }; mp4.onError = function (e) { fehler = e; };
    var pos = 0, n = 0, STUECK = 1 << 20;
    while (!info && !fehler && pos < datei.size) {
      var buf = await datei.slice(pos, pos + STUECK).arrayBuffer(); buf.fileStart = pos;
      var weiter = mp4.appendBuffer(buf);
      pos = typeof weiter === "number" && weiter !== pos ? weiter : pos + buf.byteLength;
      if (++n > 4000) break;
    }
    if (fehler || !info || !info.videoTracks[0]) throw new Error("Das Video konnte nicht gelesen werden (nur MP4 und MOV).");
    var vt = info.videoTracks[0], at = info.audioTracks[0];
    var vtrak = mp4.getTrackById(vt.id), atrak = at ? mp4.getTrackById(at.id) : null;
    var eintrag = vtrak.mdia.minf.stbl.stsd.entries[0], box = eintrag.avcC || eintrag.hvcC || eintrag.vpcC || eintrag.av1C, beschreibung;
    if (box) { var st = new wurzel.DataStream(undefined, 0, wurzel.DataStream.BIG_ENDIAN); box.write(st); beschreibung = new Uint8Array(st.buffer, 8); }
    var vcfg = { codec: vt.codec.indexOf("vp08") === 0 ? "vp8" : vt.codec, codedWidth: vt.video.width, codedHeight: vt.video.height, description: beschreibung };
    var ok = false;
    try { ok = (await VideoDecoder.isConfigSupported(vcfg)).supported; } catch (e) { ok = false; }
    if (!ok) throw new Error("Dieses Videoformat (" + vt.codec.split(".")[0] + ") kann der Browser nicht lesen.");
    var acfg = null;
    if (at && "AudioDecoder" in wurzel && "AudioEncoder" in wurzel) {
      var c = { codec: at.codec, sampleRate: at.audio.sample_rate, numberOfChannels: at.audio.channel_count };
      var e0 = atrak.mdia.minf.stbl.stsd.entries[0], esd = e0 && e0.esds && e0.esds.esd;
      var dcd = esd && esd.descs.filter(function (d) { return d.tag === 4; })[0], dsi = dcd && dcd.descs.filter(function (d) { return d.tag === 5; })[0];
      if (dsi) c.description = dsi.data;
      try { if ((await AudioDecoder.isConfigSupported(c)).supported) acfg = c; } catch (er) { acfg = null; }
    }
    var rot = drehung(vt.matrix), quer = rot % 180 !== 0, colr = eintrag.colr;
    return {
      dauer: vt.movie_duration / vt.movie_timescale, rot: rot,
      breite: quer ? vt.video.height : vt.video.width, hoehe: quer ? vt.video.width : vt.video.height,   // wie angezeigt
      bildrate: vt.samples_duration ? vt.nb_samples / (vt.samples_duration / vt.timescale) : 0,
      hdr: !!(colr && colr.colour_type === "nclx" && [16, 18].indexOf(colr.transfer_characteristics) >= 0),
      ton: !!acfg,
      // für standbild() und umrechnen()
      vcfg: vcfg, acfg: acfg, vs: vtrak.samples, vts: vt.timescale, as: atrak ? atrak.samples : null, ats: at ? at.timescale : 0,
    };
  }
  // Bytes der Proben in Reihenfolge; zusammenhängende Bereiche werden am Stück gelesen
  async function* stuecke(datei, proben, von, bis) {
    var MAX = 8 << 20, i = von;
    while (i < bis) {
      var j = i, a = proben[i].offset, b = a + proben[i].size;
      while (j + 1 < bis && proben[j + 1].offset >= a && proben[j + 1].offset + proben[j + 1].size - a <= MAX) { j++; b = Math.max(b, proben[j].offset + proben[j].size); }
      var buf = new Uint8Array(await datei.slice(a, b).arrayBuffer());
      for (var k = i; k <= j; k++) yield { s: proben[k], daten: buf.subarray(proben[k].offset - a, proben[k].offset - a + proben[k].size) };
      i = j + 1;
    }
  }
  function bildStueck(p, ts) {
    return new EncodedVideoChunk({ type: p.s.is_sync ? "key" : "delta", timestamp: Math.round(p.s.cts * 1e6 / ts), duration: Math.round(p.s.duration * 1e6 / ts), data: p.daten });
  }

  // ---------- Standbild an einer Stelle t (Sekunden) ----------
  // → Zeichenfläche in Anzeige-Ausrichtung, lange Seite höchstens o.maxSeite (1280)
  async function standbild(datei, k, t, o) {
    o = o || {};
    var vs = k.vs, ts = k.vts, erster = 0, i;
    t = Math.max(0, Math.min(k.dauer - 0.05, t));
    for (i = 0; i < vs.length; i++) { if (vs[i].cts / ts > t) break; if (vs[i].is_sync) erster = i; }
    var aus = null, fehler = null, fertig = false, z = zielmasse(k, o.maxSeite);
    var dec = new VideoDecoder({
      output: function (f) {
        anstoss();
        if (!fertig && f.timestamp >= (t - 1 / 60) * 1e6) {
          fertig = true;
          var c = wurzel.document.createElement("canvas"); c.width = z.breite; c.height = z.hoehe;
          bildZeichnen(c.getContext("2d"), f, f.displayWidth, f.displayHeight, k.rot, z.breite, z.hoehe, "fuellen");
          aus = c;
        }
        f.close();
      },
      error: function (e) { fehler = e; },
    });
    dec.configure(k.vcfg);
    try {
      for await (var p of stuecke(datei, vs, erster, vs.length)) {
        if (fertig || fehler) break;
        dec.decode(bildStueck(p, ts));
        await solange(function () { return dec.decodeQueueSize > 4 && !fertig && !fehler; }, 50, STILLSTAND, "Das Video ließ sich an dieser Stelle nicht lesen.");
        if (p.s.cts / ts > t + 2) break;
      }
      if (!fertig && !fehler) await dec.flush();
    } catch (e) { fehler = fehler || e; }
    try { dec.close(); } catch (e) { /* war schon zu */ }
    if (!aus) throw fehler || new Error("An dieser Stelle gibt es kein Bild.");
    return aus;
  }

  // ---------- Ausschnitt a…b (Sekunden) neu schreiben ----------
  // o (alles freiwillig):
  //   breite, hoehe     Zielgröße (gerade Zahlen); sonst wie das Video, lange Seite höchstens maxSeite (1280)
  //   darstellung       "fuellen" (Grundeinstellung) | "ganz" | "unscharf";  fx, fy: Ausschnitt bei "fuellen" (0…1)
  //   lautstaerke       0…1 (1 = Original, 0 = ohne Ton)
  //   ebene             Zeichenfläche in Zielgröße, wird über jedes Bild gelegt (Wasserzeichen, „1/3“); oder eine
  //                     Funktion t → Zeichenfläche | { bild, deckkraft } | null (t = Sekunden ab a), z. B. Text nur am Anfang
  //   tonDazu           zusätzlicher Ton ab a (AudioBuffer oder { abtastrate, kanaele: [links, rechts] }), wird zum
  //                     Originalton gemischt (Musik, Sprache); geht auch bei Videos ohne Ton oder mit lautstaerke 0
  //   bitrate           Bit je Sekunde fürs Bild; sonst nach Größe
  //   maxDauer          höchstens so viele Sekunden (60); 0 = ohne Grenze. Längeres vorher mit teile() aufteilen
  //   fortschritt(v)    0…1;  abbrechen() → true bricht ab, dann ist das Ergebnis null
  // → { blob (MP4), breite, hoehe, dauer, ton, bilder } oder null (abgebrochen)
  async function umrechnen(datei, k, a, b, o) {
    if (typeof o === "function") o = { fortschritt: o };
    o = o || {};
    var lib = await skript("mp4-muxer.min.js", "Mp4Muxer");
    if (!lib || !kann()) throw new Error("Dieser Browser kann kein Video erzeugen.");
    var fortschritt = o.fortschritt || function () {}, abbrechen = o.abbrechen || function () { return false; };
    var g = begrenzen(a, b, k.dauer, o.maxDauer == null ? MAX_DAUER : o.maxDauer); a = g.a; b = g.b;
    var z = o.breite && o.hoehe ? { breite: gerade(o.breite), hoehe: gerade(o.hoehe) } : zielmasse(k, o.maxSeite);
    var W = z.breite, H = z.hoehe, art = o.darstellung || "fuellen";
    var rate = o.bitrate || bitrate(W, H);
    var ecfg = null, codecs = ["avc1.640028", "avc1.4d0028", "avc1.42e028", "avc1.42001f"], i;
    for (i = 0; i < codecs.length && !ecfg; i++) {
      var c = { codec: codecs[i], width: W, height: H, bitrate: rate, framerate: BILDER };
      try { if ((await VideoEncoder.isConfigSupported(c)).supported) ecfg = c; } catch (e) { /* nächster */ }
    }
    if (!ecfg) throw new Error("Dieser Browser kann kein H.264-Video erzeugen.");
    var laut = o.lautstaerke == null ? 1 : Math.max(0, +o.lautstaerke || 0), aecfg = null;
    var mitOriginal = !!(k.acfg && laut > 0), dazuRoh = o.tonDazu && (o.tonDazu.sampleRate || o.tonDazu.abtastrate) ? o.tonDazu : null;
    var tonRate = mitOriginal ? k.acfg.sampleRate : dazuRoh ? Math.round(dazuRoh.sampleRate || dazuRoh.abtastrate) : 0;
    if ((mitOriginal || dazuRoh) && "AudioEncoder" in wurzel) {
      var ac = { codec: "mp4a.40.2", sampleRate: tonRate, numberOfChannels: 2, bitrate: 128000 };
      try { if ((await AudioEncoder.isConfigSupported(ac)).supported) aecfg = ac; } catch (e) { aecfg = null; }
      if (!aecfg && !mitOriginal && tonRate !== 48000) {                        // fremde Abtastrate: auf 48 kHz bringen
        ac.sampleRate = tonRate = 48000;
        try { if ((await AudioEncoder.isConfigSupported(ac)).supported) aecfg = ac; } catch (e) { aecfg = null; }
      }
    }
    var fehler = null, scheitern = function (e) { if (!fehler) fehler = e instanceof Error ? e : new Error(String((e && e.message) || e)); anstoss(); };
    var einstellung = { target: new lib.ArrayBufferTarget(), fastStart: "in-memory", firstTimestampBehavior: "offset", video: { codec: "avc", width: W, height: H, frameRate: BILDER } };
    if (aecfg) einstellung.audio = { codec: "aac", numberOfChannels: 2, sampleRate: aecfg.sampleRate };
    var muxer = new lib.Muxer(einstellung);
    var venc = melder(new VideoEncoder({ output: function (ch, meta) { muxer.addVideoChunk(ch, meta); anstoss(); }, error: scheitern })); venc.configure(ecfg);
    var aus = wurzel.document.createElement("canvas"); aus.width = W; aus.height = H;
    var octx = aus.getContext("2d", { alpha: false });
    var vs = k.vs, ts = k.vts, schritt = 1e6 / BILDER, bereich = ausschnitt(vs, ts, a, b), erster = bereich.erster, letzter = bereich.letzter;
    var schlange = [], geschrieben = 0, zuletzt = -1, bekommen = 0;
    var vdec = melder(new VideoDecoder({ output: function (f) { schlange.push(f); anstoss(); }, error: scheitern }));
    vdec.configure(k.vcfg);
    var allesZu = function () { schlange.splice(0).forEach(function (f) { f.close(); }); [vdec, venc].forEach(function (x) { try { x.close(); } catch (e) { /* schon zu */ } }); };
    var abnehmen = async function () {
      while (schlange.length) {
        var f = schlange.shift(); bekommen++;
        try {
          var t = f.timestamp - a * 1e6;
          if (t >= -1 && f.timestamp < b * 1e6) {
            var n = Math.round(t / schritt);                         // Bildnummer im Zielraster; doppelte (60 Bilder je Sekunde) entfallen
            if (n > zuletzt) {
              zeichnen(octx, f, f.displayWidth, f.displayHeight, k.rot, W, H, art, o.fx, o.fy);
              var eb = ebeneBei(o.ebene, n * schritt / 1e6);
              if (eb) { octx.globalAlpha = eb.deckkraft; octx.drawImage(eb.bild, 0, 0, W, H); octx.globalAlpha = 1; }
              var bild = new VideoFrame(aus, { timestamp: Math.round(n * schritt), duration: Math.round(schritt) });
              venc.encode(bild, { keyFrame: geschrieben % 60 === 0 }); bild.close(); geschrieben++; zuletzt = n;
            }
          }
        } finally { f.close(); }
        await solange(function () { return venc.encodeQueueSize > 3 && !fehler; }, 50, STILLSTAND, "Das Video ließ sich nicht schreiben (der Browser kommt nicht voran).");
      }
    };
    var gefuettert = 0;
    for await (var p of stuecke(datei, vs, erster, letzter)) {
      if (fehler) break;
      if (abbrechen()) { allesZu(); return null; }
      vdec.decode(bildStueck(p, ts));
      gefuettert++;
      var fristLesen = Date.now() + STILLSTAND, standLesen = bekommen;
      while ((vdec.decodeQueueSize > 6 || schlange.length > 4) && !fehler) {
        await abnehmen(); await puls(50);
        if (bekommen !== standLesen) { standLesen = bekommen; fristLesen = Date.now() + STILLSTAND; }
        else if (Date.now() > fristLesen) scheitern(new Error("Das Video ließ sich nicht lesen (der Browser kommt nicht voran)."));
      }
      await abnehmen();
      if (gefuettert % 10 === 0) { fortschritt(gefuettert / (letzter - erster) * (aecfg ? 0.92 : 1)); await atem(); }
    }
    // Rest abholen. Während flush() weiter Bilder abnehmen: Der Decoder eines Handys hat nur wenige Ausgabepuffer
    // und bleibt sonst stehen (Erfahrung aus Imagiclique, Galaxy S25).
    if (!fehler) {
      var fertig = false, fristEnde = Date.now() + STILLSTAND, fl = vdec.flush().then(function () { fertig = true; anstoss(); }, scheitern);
      while (!fertig && !fehler) {
        var vorher = bekommen; await abnehmen(); await puls(50);
        if (bekommen !== vorher) fristEnde = Date.now() + STILLSTAND;
        else if (Date.now() > fristEnde) scheitern(new Error("Das Video ließ sich nicht bis zum Ende lesen."));
      }
      if (!fehler) { await fl; await abnehmen(); }
    }
    if (fehler) { allesZu(); throw fehler; }
    try { vdec.close(); } catch (e) { /* schon zu */ }
    if (abbrechen()) { allesZu(); return null; }
    // Ton: Original entschlüsseln, auf zwei Kanäle bringen, Lautstärke anwenden, zusätzlichen Ton dazumischen, als AAC
    // neu schreiben. Ist der zusätzliche Ton länger als das Original (oder gibt es keins), kommt der Rest danach allein.
    if (aecfg) {
      var aenc = melder(new AudioEncoder({ output: function (ch, meta) { muxer.addAudioChunk(ch, meta); anstoss(); }, error: scheitern })); aenc.configure(aecfg);
      var adec = null, offen = [], dazuJe = {}, tonBis = 0;
      var dazuBei = function (rate) { if (!dazuRoh) return null; if (!dazuJe[rate]) dazuJe[rate] = tonVorbereiten(dazuRoh, rate); return dazuJe[rate]; };
      var mischen = function (w, n, rate, ab) {                  // w: zwei Kanäle hintereinander, ab: erste Probe im Ausschnitt
        var z = dazuBei(rate); if (!z) return;
        var r = z.r || z.l, bis = Math.min(n, z.l.length - ab);
        for (var x = Math.max(0, -ab); x < bis; x++) { w[x] += z.l[ab + x]; w[n + x] += r[ab + x]; }
        for (var y = 0; y < w.length; y++) w[y] = w[y] > 1 ? 1 : w[y] < -1 ? -1 : w[y];
      };
      var tonZu = function () { offen.splice(0).forEach(function (d) { d.close(); }); [adec, aenc].forEach(function (x) { try { if (x) x.close(); } catch (e) { /* schon zu */ } }); };
      if (mitOriginal) {
        var as = k.as, ats = k.ats, a0 = 0;
        while (a0 < as.length - 1 && (as[a0].cts + as[a0].duration) / ats <= a) a0++;
        var a1 = a0; while (a1 < as.length && as[a1].cts / ats < b) a1++;
        adec = melder(new AudioDecoder({ output: function (d) { offen.push(d); anstoss(); }, error: scheitern })); adec.configure(k.acfg);
        var pumpen = function () {
          while (offen.length) {
            var d = offen.shift();
            try {
              var n = d.numberOfFrames, w = new Float32Array(n * 2), tmp = new Float32Array(n);
              d.copyTo(tmp, { planeIndex: 0, format: "f32-planar" }); w.set(tmp, 0);
              if (d.numberOfChannels > 1) d.copyTo(tmp, { planeIndex: 1, format: "f32-planar" });
              w.set(tmp, n);
              if (laut !== 1) for (var x = 0; x < w.length; x++) w[x] *= laut;
              var t = d.timestamp - a * 1e6;
              if (t >= -30000 && d.timestamp < b * 1e6) {
                var t0 = Math.max(0, Math.round(t)), ab = Math.round(t0 * d.sampleRate / 1e6);
                mischen(w, n, d.sampleRate, ab);
                var ad = new AudioData({ format: "f32-planar", sampleRate: d.sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: t0, data: w });
                aenc.encode(ad); ad.close();
                tonBis = Math.max(tonBis, Math.round((t0 + n * 1e6 / d.sampleRate) * tonRate / 1e6));
              }
            } finally { d.close(); }
          }
        };
        for await (var q of stuecke(datei, as, a0, a1)) {
          if (fehler) break;
          if (abbrechen()) { tonZu(); allesZu(); return null; }
          adec.decode(new EncodedAudioChunk({ type: "key", timestamp: Math.round(q.s.cts * 1e6 / ats), duration: Math.round(q.s.duration * 1e6 / ats), data: q.daten }));
          var fristTon = Date.now() + STILLSTAND;
          while ((adec.decodeQueueSize > 20 || aenc.encodeQueueSize > 20) && !fehler) {
            pumpen(); await puls(50);
            if (Date.now() > fristTon) scheitern(new Error("Der Ton des Videos ließ sich nicht umrechnen."));
          }
          pumpen();
        }
        if (!fehler) {
          var tonFertig = false, tfl = adec.flush().then(function () { tonFertig = true; anstoss(); }, scheitern);
          var fristTonEnde = Date.now() + STILLSTAND;
          while (!tonFertig && !fehler) { pumpen(); await puls(50); if (Date.now() > fristTonEnde) scheitern(new Error("Der Ton des Videos ließ sich nicht bis zum Ende umrechnen.")); }
          if (!fehler) { await tfl; pumpen(); }
        }
      }
      var rest = dazuBei(tonRate);
      if (rest && !fehler) {
        var ende = Math.min(rest.l.length, Math.round((b - a) * tonRate)), STUECK = 4096;
        for (var pos = tonBis; pos < ende && !fehler; pos += STUECK) {
          if (abbrechen()) { tonZu(); allesZu(); return null; }
          var m = Math.min(STUECK, ende - pos), w2 = new Float32Array(m * 2);
          mischen(w2, m, tonRate, pos);
          var ad2 = new AudioData({ format: "f32-planar", sampleRate: tonRate, numberOfFrames: m, numberOfChannels: 2, timestamp: Math.round(pos * 1e6 / tonRate), data: w2 });
          aenc.encode(ad2); ad2.close();
          await solange(function () { return aenc.encodeQueueSize > 20 && !fehler; }, 50, STILLSTAND, "Der Ton ließ sich nicht schreiben.");
        }
      }
      if (!fehler) await aenc.flush();
      tonZu();
      if (fehler) { try { venc.close(); } catch (e) { /* schon zu */ } throw fehler; }
    }
    await Promise.race([venc.flush(), warte(STILLSTAND).then(function () { throw new Error("Das Video ließ sich nicht fertig schreiben."); })]);
    venc.close();
    if (fehler) throw fehler;
    if (!geschrieben) throw new Error("In diesem Ausschnitt gibt es keine Bilder.");
    muxer.finalize();
    fortschritt(1);
    return { blob: new Blob([muxer.target.buffer], { type: "video/mp4" }), breite: W, hoehe: H, dauer: Math.round(geschrieben / BILDER * 10) / 10, ton: !!aecfg, bilder: geschrieben };
  }

  // ---------- Schnellweg: Ausschnitt ohne Neurechnen in eine neue Datei kopieren (seit 1.2.0) ----------
  // Die Bild- und Tonproben bleiben unverändert (volle Qualität, in Sekunden fertig); es gibt also keine Ebene, kein eigenes
  // Format und keine Lautstärke. Der Anfang rückt auf das Schlüsselbild davor. Aufnahmeort und Gerätedaten des Originals stehen
  // nicht in der neuen Datei. o: fortschritt(v), abbrechen()
  // → { blob (MP4), a (tatsächlicher Anfang), b, dauer, ton, bilder } oder null (abgebrochen)
  async function kopieren(datei, k, a, b, o) {
    o = o || {};
    var fortschritt = o.fortschritt || function () {}, abbrechen = o.abbrechen || function () { return false; };
    var lib = await skript("mp4-muxer.min.js", "Mp4Muxer");
    if (!lib) throw new Error("Dieser Browser kann kein Video schreiben.");
    var c = k.vcfg.codec, art = /^(avc1|avc3)/.test(c) ? "avc" : /^(hvc1|hev1)/.test(c) ? "hevc" : /^vp09/.test(c) ? "vp9" : /^av01/.test(c) ? "av1" : null;
    if (!art) throw new Error("Dieses Videoformat lässt sich nicht ohne Neurechnen schneiden.");
    var vs = k.vs, ts = k.vts, i0 = 0, i;
    for (i = 0; i < vs.length; i++) { if (vs[i].cts / ts > a + 1e-6) break; if (vs[i].is_sync) i0 = i; }
    var t0 = vs[i0].cts, d0 = vs[i0].dts, ende = b * ts, i1 = i0;
    while (i1 < vs.length && vs[i1].dts < ende + ts) i1++;            // in Decodier-Reihenfolge bis 1 s nach dem Ende
    var mitTon = !!(k.as && k.acfg && /^mp4a/.test(k.acfg.codec)), a0 = 0, a1 = 0;
    if (mitTon) {
      var as = k.as, ats = k.ats;
      while (a0 < as.length && as[a0].cts / ats < t0 / ts - 1e-6) a0++;
      a1 = a0; while (a1 < as.length && as[a1].cts / ats < b) a1++;
    }
    var einstellung = { target: new lib.ArrayBufferTarget(), fastStart: "in-memory", firstTimestampBehavior: "cross-track-offset",
      video: { codec: art, width: k.vcfg.codedWidth, height: k.vcfg.codedHeight, rotation: k.rot } };
    if (mitTon) einstellung.audio = { codec: "aac", numberOfChannels: k.acfg.numberOfChannels, sampleRate: k.acfg.sampleRate };
    var muxer = new lib.Muxer(einstellung), bilder = 0, erstes = true, gesamt = Math.max(1, i1 - i0 + a1 - a0), fertig = 0, letztes = 0;
    for await (var p of stuecke(datei, vs, i0, i1)) {
      if (abbrechen()) return null;
      fertig++;
      if (p.s.cts < t0 || p.s.cts >= ende) continue;               // Bilder vor dem Schlüsselbild (offene Gruppe) oder nach dem Ende
      var meta = erstes ? { decoderConfig: { codec: c, codedWidth: k.vcfg.codedWidth, codedHeight: k.vcfg.codedHeight, description: k.vcfg.description } } : undefined;
      muxer.addVideoChunkRaw(p.daten, p.s.is_sync ? "key" : "delta", (p.s.cts - d0) * 1e6 / ts, p.s.duration * 1e6 / ts, meta, (p.s.cts - p.s.dts) * 1e6 / ts);
      erstes = false; bilder++; letztes = Math.max(letztes, (p.s.cts + p.s.duration) / ts);
      if (fertig % 60 === 0) { fortschritt(fertig / gesamt); await atem(); }
    }
    if (!bilder) throw new Error("In diesem Ausschnitt gibt es keine Bilder.");
    if (mitTon) {
      var erst = true;
      for await (var q of stuecke(datei, k.as, a0, a1)) {
        if (abbrechen()) return null;
        fertig++;
        muxer.addAudioChunkRaw(q.daten, "key", Math.max(0, (q.s.cts / k.ats - d0 / ts)) * 1e6, q.s.duration * 1e6 / k.ats,
          erst ? { decoderConfig: { codec: k.acfg.codec, numberOfChannels: k.acfg.numberOfChannels, sampleRate: k.acfg.sampleRate, description: k.acfg.description } } : undefined);
        erst = false;
        if (fertig % 200 === 0) { fortschritt(fertig / gesamt); await atem(); }
      }
    }
    muxer.finalize();
    fortschritt(1);
    return { blob: new Blob([muxer.target.buffer], { type: "video/mp4" }), a: t0 / ts, b: Math.min(b, letztes), dauer: Math.round((Math.min(b, letztes) - t0 / ts) * 10) / 10, ton: mitTon, bilder: bilder };
  }

  // ---------- Ausschnitt untersuchen: Lautstärke und Bildwechsel (für kluges Aufteilen mit schnitte()) ----------
  // Liest den Ausschnitt einmal ganz (Bilder entschlüsseln, ohne zu schreiben). o (alles freiwillig):
  //   schritt (0,25 s), bilder (true), ton (true), fortschritt(v), abbrechen()
  // → { a, b, schritt, pegel: Float32Array (Lautstärke 0…1 je Schritt) | null, wechsel: Float32Array (Unterschied
  //   zum vorigen Schritt, 0…1) | null } oder null (abgebrochen)
  async function untersuchen(datei, k, a, b, o) {
    o = o || {};
    if (!kann()) throw new Error("Dieser Browser kann Videos nicht verarbeiten.");
    var fortschritt = o.fortschritt || function () {}, abbrechen = o.abbrechen || function () { return false; };
    a = Math.max(0, +a || 0); b = Math.min(k.dauer, isFinite(+b) ? +b : k.dauer);
    var sch = o.schritt || 0.25, m = Math.max(1, Math.ceil((b - a) / sch - 1e-9)), fehler = null;
    var scheitern = function (e) { if (!fehler) fehler = e instanceof Error ? e : new Error(String((e && e.message) || e)); anstoss(); };
    var mitTon = o.ton !== false && !!(k.acfg && k.as), mitBild = o.bilder !== false;
    var anteilBild = mitBild ? (mitTon ? 0.85 : 1) : 0;
    var pegel = null, wechsel = null;
    if (mitBild) {
      wechsel = new Float32Array(m);
      var G = 24, kc = wurzel.document.createElement("canvas"); kc.width = G; kc.height = G;
      var kx = kc.getContext("2d", { willReadFrequently: true }), vorher = null, zuletzt = -1, schlange = [], bekommen = 0;
      var vs = k.vs, ts = k.vts, bereich = ausschnitt(vs, ts, a, b);
      var vdec = melder(new VideoDecoder({ output: function (f) { schlange.push(f); anstoss(); }, error: scheitern }));
      vdec.configure(k.vcfg);
      var abnehmen = function () {
        while (schlange.length) {
          var f = schlange.shift(); bekommen++;
          try {
            var i = Math.floor((f.timestamp / 1e6 - a) / sch + 1e-6);
            if (i >= 0 && i < m && i > zuletzt) {
              kx.drawImage(f, 0, 0, G, G);
              var px = kx.getImageData(0, 0, G, G).data, hell = new Float32Array(G * G);
              for (var p = 0; p < hell.length; p++) hell[p] = 0.299 * px[p * 4] + 0.587 * px[p * 4 + 1] + 0.114 * px[p * 4 + 2];
              if (vorher) { var s = 0; for (var q = 0; q < hell.length; q++) s += Math.abs(hell[q] - vorher[q]); wechsel[i] = s / hell.length / 255; }
              vorher = hell; zuletzt = i;
            }
          } finally { f.close(); }
        }
      };
      var gefuettert = 0, gesamt = Math.max(1, bereich.letzter - bereich.erster);
      try {
        for await (var p of stuecke(datei, vs, bereich.erster, bereich.letzter)) {
          if (fehler) break;
          if (abbrechen()) { schlange.splice(0).forEach(function (f) { f.close(); }); try { vdec.close(); } catch (e) { /* zu */ } return null; }
          vdec.decode(bildStueck(p, ts)); gefuettert++;
          var frist = Date.now() + STILLSTAND, stand = bekommen;
          while ((vdec.decodeQueueSize > 6 || schlange.length > 4) && !fehler) {
            abnehmen(); await puls(50);
            if (bekommen !== stand) { stand = bekommen; frist = Date.now() + STILLSTAND; }
            else if (Date.now() > frist) scheitern(new Error("Das Video ließ sich nicht lesen (der Browser kommt nicht voran)."));
          }
          abnehmen();
          if (gefuettert % 15 === 0) { fortschritt(gefuettert / gesamt * anteilBild); await atem(); }
        }
        if (!fehler) {
          var fertig = false, fl = vdec.flush().then(function () { fertig = true; anstoss(); }, scheitern), fristEnde = Date.now() + STILLSTAND;
          while (!fertig && !fehler) {
            var vor = bekommen; abnehmen(); await puls(50);
            if (bekommen !== vor) fristEnde = Date.now() + STILLSTAND;
            else if (Date.now() > fristEnde) scheitern(new Error("Das Video ließ sich nicht bis zum Ende lesen."));
          }
          if (!fehler) { await fl; abnehmen(); }
        }
      } finally { schlange.splice(0).forEach(function (f) { f.close(); }); try { vdec.close(); } catch (e) { /* zu */ } }
      if (fehler) throw fehler;
    }
    if (mitTon) {
      var summe = new Float64Array(m), zahl = new Float64Array(m), offen = [];
      var as = k.as, ats = k.ats, a0 = 0;
      while (a0 < as.length - 1 && (as[a0].cts + as[a0].duration) / ats <= a) a0++;
      var a1 = a0; while (a1 < as.length && as[a1].cts / ats < b) a1++;
      var adec = melder(new AudioDecoder({ output: function (d) { offen.push(d); anstoss(); }, error: scheitern }));
      adec.configure(k.acfg);
      var pumpen = function () {
        while (offen.length) {
          var d = offen.shift();
          try {
            var n = d.numberOfFrames, kan = Math.min(2, d.numberOfChannels), tmp = new Float32Array(n), t0 = d.timestamp / 1e6 - a;
            for (var c = 0; c < kan; c++) {
              d.copyTo(tmp, { planeIndex: c, format: "f32-planar" });
              for (var x = 0; x < n; x++) {
                var i = Math.floor((t0 + x / d.sampleRate) / sch);
                if (i >= 0 && i < m) { summe[i] += tmp[x] * tmp[x]; zahl[i]++; }
              }
            }
          } finally { d.close(); }
        }
      };
      try {
        var nr = 0, ton = a1 - a0 || 1;
        for await (var qq of stuecke(datei, as, a0, a1)) {
          if (fehler) break;
          if (abbrechen()) return null;
          adec.decode(new EncodedAudioChunk({ type: "key", timestamp: Math.round(qq.s.cts * 1e6 / ats), duration: Math.round(qq.s.duration * 1e6 / ats), data: qq.daten }));
          var fristT = Date.now() + STILLSTAND;
          while (adec.decodeQueueSize > 20 && !fehler) { pumpen(); await puls(50); if (Date.now() > fristT) scheitern(new Error("Der Ton des Videos ließ sich nicht lesen.")); }
          pumpen();
          if (++nr % 200 === 0) { fortschritt(anteilBild + nr / ton * (1 - anteilBild)); await atem(); }
        }
        if (!fehler) { await Promise.race([adec.flush(), warte(STILLSTAND).then(function () { throw new Error("Der Ton des Videos ließ sich nicht bis zum Ende lesen."); })]); pumpen(); }
      } finally { offen.splice(0).forEach(function (d) { d.close(); }); try { adec.close(); } catch (e) { /* zu */ } }
      if (fehler) throw fehler;
      pegel = new Float32Array(m);
      for (var j = 0; j < m; j++) pegel[j] = zahl[j] ? Math.sqrt(summe[j] / zahl[j]) : 0;
    }
    fortschritt(1);
    return { a: a, b: b, schritt: sch, pegel: pegel, wechsel: wechsel };
  }

  // ---------- Video bei der App stückweise lesen (seit 1.3.0) ----------
  // In einer Android-App muss die Oberfläche ein großes Video nicht erst ganz herüberholen: Der Baustein liest ohnehin nur
  // Kopfdaten und einzelne Stücke (slice). fernDatei() ist ein Stellvertreter, der sich wie eine Datei verhält (name, type,
  // size, slice(a, b).arrayBuffer()) und jedes Stück erst bei Bedarf von der App holt – in Blöcken von 1 MB, die letzten
  // FERN_BLOECKE bleiben im Speicher (beim Umrechnen liegen die Bilder dicht hintereinander). Die App liefert unter der
  // Adresse: „?info“ → { groesse, art, name } und „?von=A&bis=B“ → genau die Bytes A bis B-1 (siehe LIESMICH.md).
  // adresse: z. B. "/_quelle/q123.mp4"; angaben: { groesse, art, name } (auch size, type). Funktioniert mit allem in diesem
  // Baustein und mit dem Baustein fotos (videoDaten). Für ein <video> nimmt man datei.adresse (die App muss dann „Range“ können).
  var FERN_BLOCK = 1 << 20, FERN_BLOECKE = 24;
  function fernDatei(adresse, angaben) {
    angaben = angaben || {};
    var groesse = Math.max(0, Math.floor(+(angaben.groesse != null ? angaben.groesse : angaben.size) || 0));
    var art = String(angaben.art || angaben.type || "video/mp4"), name = String(angaben.name || "video.mp4");
    var trenner = adresse.indexOf("?") >= 0 ? "&" : "?", bloecke = new Map();
    function block(n) {
      var p = bloecke.get(n);
      if (p) { bloecke.delete(n); bloecke.set(n, p); return p; }      // zuletzt benutzt ans Ende
      var von = n * FERN_BLOCK, bis = Math.min(groesse, von + FERN_BLOCK);
      p = fetch(adresse + trenner + "von=" + von + "&bis=" + bis).then(function (r) {
        if (!r.ok) throw new Error("Das Video ließ sich nicht lesen (" + r.status + ").");
        return r.arrayBuffer();
      }).then(function (b) {
        var u = new Uint8Array(b);
        if (u.length !== bis - von) throw new Error("Das Video ließ sich nicht vollständig lesen.");
        return u;
      });
      p.catch(function () { if (bloecke.get(n) === p) bloecke.delete(n); });
      bloecke.set(n, p);
      while (bloecke.size > FERN_BLOECKE) bloecke.delete(bloecke.keys().next().value);
      return p;
    }
    function lesen(a, b) {
      if (b <= a) return Promise.resolve(new ArrayBuffer(0));
      var erster = Math.floor(a / FERN_BLOCK), letzter = Math.floor((b - 1) / FERN_BLOCK), liste = [];
      for (var n = erster; n <= letzter; n++) liste.push(block(n));
      return Promise.all(liste).then(function (teile) {
        var aus = new Uint8Array(b - a), pos = 0;
        teile.forEach(function (u, i) {
          var start = (erster + i) * FERN_BLOCK, s = Math.max(a, start) - start, e = Math.min(b, start + u.length) - start;
          aus.set(u.subarray(s, e), pos); pos += e - s;
        });
        return aus.buffer;
      });
    }
    // wie Blob.slice: negative Werte zählen vom Ende, alles wird auf den Bereich begrenzt
    function stelle(v, standard, g) {
      if (v == null) return standard;
      v = Math.floor(+v) || 0;
      return v < 0 ? Math.max(0, g + v) : Math.min(v, g);
    }
    function stueck(a, b, typ) {
      return {
        size: b - a, type: typ || "",
        arrayBuffer: function () { return lesen(a, b); },
        text: function () { return lesen(a, b).then(function (buf) { return new TextDecoder().decode(buf); }); },
        slice: function (x, y, t) { var g = b - a, s = stelle(x, 0, g), e = stelle(y, g, g); return stueck(a + s, a + Math.max(s, e), t); },
      };
    }
    var d = stueck(0, groesse, art);
    d.name = name; d.adresse = adresse; d.fern = true; d.lastModified = Date.now();
    // die ganze Datei als echtes File (nur, wo es nicht anders geht – das dauert wie früher)
    d.ganz = function () {
      return fetch(adresse).then(function (r) { if (!r.ok) throw new Error("Das Video ließ sich nicht lesen (" + r.status + ")."); return r.blob(); })
        .then(function (b) { return typeof File === "function" ? new File([b], name, { type: art }) : b; });
    };
    return d;
  }
  // fragt die App nach Größe, Art und Namen und liefert dann fernDatei(); angaben überschreiben, was die App meldet
  function fernOeffnen(adresse, angaben) {
    var trenner = adresse.indexOf("?") >= 0 ? "&" : "?";
    return fetch(adresse + trenner + "info").then(function (r) {
      if (!r.ok) throw new Error("Das Video ließ sich nicht lesen (" + r.status + ").");
      return r.json();
    }).then(function (info) {
      var a = {}, k;
      for (k in (info || {})) if (info[k] != null && info[k] !== "") a[k] = info[k];
      for (k in (angaben || {})) if (angaben[k] != null && angaben[k] !== "") a[k] = angaben[k];
      if (!(+a.groesse > 0)) throw new Error("Das Video ist leer oder nicht lesbar.");
      return fernDatei(adresse, a);
    });
  }

  var api = {
    VERSION: VERSION, BILDER: BILDER, MAX_DAUER: MAX_DAUER,
    kann: kann, einstellen: einstellen, kopf: kopf, standbild: standbild, umrechnen: umrechnen, untersuchen: untersuchen, kopieren: kopieren,
    schluesselbilder: schluesselbilder, schnellTeile: schnellTeile, groesse: groesse,
    zielmasse: zielmasse, bitrate: bitrate, begrenzen: begrenzen, teile: teile, schnitte: schnitte, ausschnitt: ausschnitt, lage: lage, drehung: drehung,
    umtasten: umtasten, tonVorbereiten: tonVorbereiten, ebeneBei: ebeneBei,
    fernDatei: fernDatei, fernOeffnen: fernOeffnen, FERN_BLOCK: FERN_BLOCK,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  wurzel.ImagicosmosVideoSchnitt = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
