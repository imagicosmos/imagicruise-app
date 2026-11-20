// Baustein „fotos“ – Foto-Daten lesen. Quelle: Repo imagicosmos/bausteine, fotos/foto-daten.js.
// In den Apps eine Kopie: NICHT VON HAND ÄNDERN, Fehler im Repo bausteine beheben und neu einbauen.
//
// Liest aus einem Foto, was die Apps zum Sortieren und Zuordnen brauchen – nur aus der Datei auf dem eigenen Gerät:
// - Aufnahmezeit (EXIF DateTimeOriginal, sonst DateTimeDigitized, sonst DateTime), Ortszeit der Kamera ohne Zeitzone
// - Aufnahmeort (GPS), falls vorhanden
// - Drehung (EXIF Orientation 1 bis 8), falls vorhanden
// Dazu das Datum aus Dateiname („IMG_20180714…“, WhatsApp „IMG-20190312-WA0001“) und Ordnername („1989 Urlaub“).
// Seit 1.1.0 auch aus Videos (MP4, MOV): Aufnahmezeit und Aufnahmeort (videoDaten), für beide Arten ausMedium.
//
// Zusammengeführt aus Imagicruise (studio/exif.js: Zeit und Ort) und Imagichron (studio/fotos-sortieren.js:
// Datum aus Name und Ordner, Reihenfolge der Quellen). Läuft im Browser und unter Node.js (Tests), ohne fremden Code.
// HEIC (iPhone) wird nicht gelesen: Ergebnis wie ohne Angaben; istHeic() hilft, eine verständliche Meldung zu zeigen.
(function (wurzel) {
  "use strict";

  var VERSION = "1.1.0";
  var LESELAENGE = 262144;   // die ersten 256 KB der Datei reichen fast immer
  var BILD = /\.(jpe?g|png|webp|gif)$/i, VIDEO = /\.(mp4|mov|m4v|avi|3gp|mkv|webm|mpe?g|vob)$/i, HEIC = /\.(heic|heif)$/i;

  function leer() { return { zeit: "", datum: "", lat: null, lon: null, drehung: null }; }

  // ---------- EXIF aus einem JPEG ----------
  // bytes: Uint8Array oder ArrayBuffer mit dem Anfang der Datei
  // Ergebnis: { zeit: "2026-05-10T14:23:05" | "", datum: "2026-05-10" | "", lat, lon (null ohne Ort), drehung: 1..8 | null }
  function lesen(bytes) {
    var b = bytes instanceof Uint8Array ? bytes : bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : null;
    if (!b || b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return leer();
    var i = 2, n = b.length;
    while (i + 4 <= n && b[i] === 0xff) {
      var marke = b[i + 1], laenge = (b[i + 2] << 8) | b[i + 3];
      if (marke === 0xda || marke === 0xd9) break;   // Bilddaten beginnen: kein EXIF mehr
      if (marke === 0xe1 && i + 10 <= n && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66 &&
          b[i + 8] === 0 && b[i + 9] === 0) {
        var aus = tiff(b, i + 10, Math.min(n, i + 2 + laenge));
        if (aus) return aus;
      }
      if (laenge < 2) break;
      i += 2 + laenge;
    }
    return leer();
  }

  // b: Bytes, t: Anfang des TIFF-Teils, ende: erste Stelle dahinter. Alle Lesezugriffe sind geprüft:
  // Beschädigte Angaben liefern „keine Angabe“, nie einen Absturz.
  function tiff(b, t, ende) {
    if (t + 8 > ende) return null;
    var klein = b[t] === 0x49 && b[t + 1] === 0x49;
    if (!klein && !(b[t] === 0x4d && b[t + 1] === 0x4d)) return null;
    function u16(o) { o += t; return o < t || o + 2 > ende ? -1 : klein ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]; }
    function u32(o) {
      o += t;
      if (o < t || o + 4 > ende) return -1;
      return (klein ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3])) >>> 0;
    }
    if (u16(2) !== 42) return null;

    function verzeichnis(start) {
      var e = {}, anzahl = u16(start);
      if (start <= 0 || anzahl < 0 || anzahl > 500) return e;
      for (var k = 0; k < anzahl; k++) {
        var o = start + 2 + k * 12;
        if (t + o + 12 > ende) break;
        e[u16(o)] = { typ: u16(o + 2), anzahl: u32(o + 4), stelle: o + 8 };
      }
      return e;
    }
    function text(e) {
      if (!e || e.typ !== 2 || e.anzahl < 1) return "";
      var o = e.anzahl > 4 ? u32(e.stelle) : e.stelle, s = "";
      if (o < 0) return "";
      for (var k = 0; k < e.anzahl && k < 64 && t + o + k < ende; k++) { var c = b[t + o + k]; if (!c) break; s += String.fromCharCode(c); }
      return s.trim();
    }
    function brueche(e, anzahl) {
      if (!e || e.typ !== 5 || e.anzahl < anzahl) return null;
      var o = u32(e.stelle), aus = [];
      if (o < 0) return null;
      for (var k = 0; k < anzahl; k++) {
        var z = u32(o + k * 8), nenner = u32(o + k * 8 + 4);
        if (z < 0 || nenner < 0) return null;
        aus.push(nenner ? z / nenner : 0);
      }
      return aus;
    }
    function zahl(e) {
      if (!e || e.anzahl < 1) return -1;
      return e.typ === 3 ? u16(e.stelle) : e.typ === 4 ? u32(e.stelle) : -1;
    }

    var haupt = verzeichnis(u32(4));
    var exif = haupt[0x8769] ? verzeichnis(u32(haupt[0x8769].stelle)) : {};
    var gps = haupt[0x8825] ? verzeichnis(u32(haupt[0x8825].stelle)) : {};
    var aus = leer();

    // "2026:05:10 14:23:05" → "2026-05-10T14:23:05"; Kameras ohne Uhr schreiben "0000:00:00 00:00:00"
    var kandidaten = [text(exif[0x9003]), text(exif[0x9004]), text(haupt[0x0132])];
    for (var k = 0; k < kandidaten.length && !aus.zeit; k++) {
      var m = /^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(kandidaten[k]);
      if (m && +m[1] >= 1800 && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31 && +m[4] < 24 && +m[5] < 60) {
        aus.datum = m[1] + "-" + m[2] + "-" + m[3];
        aus.zeit = aus.datum + "T" + m[4] + ":" + m[5] + ":" + (m[6] || "00");
      }
    }

    var la = brueche(gps[2], 3), lo = brueche(gps[4], 3), ns = text(gps[1]), ow = text(gps[3]);
    if (la && lo && ns && ow) {
      var lat = (la[0] + la[1] / 60 + la[2] / 3600) * (/^s/i.test(ns) ? -1 : 1);
      var lon = (lo[0] + lo[1] / 60 + lo[2] / 3600) * (/^w/i.test(ow) ? -1 : 1);
      if (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0)) {
        aus.lat = Math.round(lat * 1e5) / 1e5; aus.lon = Math.round(lon * 1e5) / 1e5;
      }
    }

    var d = zahl(haupt[0x0112]);
    if (d >= 1 && d <= 8) aus.drehung = d;
    return aus;
  }

  // Datei (File/Blob) → Promise<{ zeit, datum, lat, lon, drehung }>; nie abgelehnt
  function ausDatei(datei) {
    try {
      return datei.slice(0, LESELAENGE).arrayBuffer().then(function (puffer) { return lesen(new Uint8Array(puffer)); })
        .catch(function () { return leer(); });
    } catch (e) { return Promise.resolve(leer()); }
  }

  // ---------- Videos (MP4, MOV; ab 1.1.0) ----------
  // Gelesen werden nur die Kopfdaten (Box „moov“, auch wenn sie am Ende der Datei steht), nie die Bilddaten.
  // Aufnahmezeit: bei iPhones „com.apple.quicktime.creationdate“ (Ortszeit mit Zeitzone), sonst die Erstellungszeit aus „mvhd“
  // (Weltzeit, umgerechnet in die Ortszeit dieses Geräts – so zeigt es auch die Galerie). Aufnahmeort: „©xyz“ (Android, viele
  // Kameras) oder „com.apple.quicktime.location.ISO6709“ (iPhone), beides als Text wie „+54.1458+011.7590/“.
  var MOOV_MAX = 32 << 20;   // größer ist keine Kopfbox; sonst wäre die Datei kaputt
  function zahl32(b, i) { return ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]; }
  function typ(b, i) { return String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]); }
  function text(b, von, bis) { var s = ""; for (var i = von; i < bis; i++) s += String.fromCharCode(b[i]); try { return decodeURIComponent(escape(s)); } catch (e) { return s; } }
  // Kinder einer Box: [{ typ, von (Inhalt), bis }]
  function kinder(b, von, bis) {
    var out = [], i = von;
    while (i + 8 <= bis) {
      var g = zahl32(b, i), t = typ(b, i + 4), kopf = 8;
      if (g === 1 && i + 16 <= bis) { g = zahl32(b, i + 8) * 4294967296 + zahl32(b, i + 12); kopf = 16; }
      else if (g === 0) g = bis - i;
      if (g < kopf || i + g > bis) break;
      out.push({ typ: t, von: i + kopf, bis: i + g });
      i += g;
    }
    return out;
  }
  function finde(liste, t) { for (var i = 0; i < liste.length; i++) if (liste[i].typ === t) return liste[i]; return null; }
  function iso6709(s) {
    var m = /([+-]\d{1,2}(?:\.\d+)?)([+-]\d{1,3}(?:\.\d+)?)/.exec(String(s || ""));
    if (!m) return null;
    var lat = parseFloat(m[1]), lon = parseFloat(m[2]);
    return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0) ? { lat: lat, lon: lon } : null;
  }
  function zwei(n) { return (n < 10 ? "0" : "") + n; }
  function ortszeit(d) { return d.getFullYear() + "-" + zwei(d.getMonth() + 1) + "-" + zwei(d.getDate()) + "T" + zwei(d.getHours()) + ":" + zwei(d.getMinutes()) + ":" + zwei(d.getSeconds()); }
  // moov: Uint8Array mit dem Inhalt der Box „moov“ → { zeit, datum, lat, lon, drehung: null }
  function videoKopf(b) {
    var aus = leer(), oben = kinder(b, 0, b.length);
    var mvhd = finde(oben, "mvhd");
    if (mvhd && mvhd.bis - mvhd.von >= 12) {
      var v = b[mvhd.von], sek = v === 1 ? zahl32(b, mvhd.von + 4) * 4294967296 + zahl32(b, mvhd.von + 8) : zahl32(b, mvhd.von + 4);
      var ms = (sek - 2082844800) * 1000;                       // Sekunden seit 1904 → seit 1970
      if (sek > 2082844800 + 31536000 && ms < Date.now() + 864e5 * 366) aus.zeit = ortszeit(new Date(ms));   // 0 oder Unsinn: keine Zeit
    }
    var udta = finde(oben, "udta");
    if (udta) {
      var xyz = finde(kinder(b, udta.von, udta.bis), "\u00a9xyz");
      if (xyz && xyz.bis - xyz.von > 4) { var o = iso6709(text(b, xyz.von + 4, xyz.bis)); if (o) { aus.lat = o.lat; aus.lon = o.lon; } }
    }
    // iPhone: meta → keys (Namen) und ilst (Werte, Nummer = Stelle in keys)
    var meta = finde(oben, "meta") || (udta && finde(kinder(b, udta.von, udta.bis), "meta"));
    if (meta) {
      var innen = kinder(b, meta.von, meta.bis);
      if (!finde(innen, "hdlr") && !finde(innen, "keys")) innen = kinder(b, meta.von + 4, meta.bis);   // „meta“ mit Version/Flags
      var keys = finde(innen, "keys"), ilst = finde(innen, "ilst"), namen = [];
      if (keys) {
        var anz = zahl32(b, keys.von + 4), k = keys.von + 8;
        for (var n = 0; n < anz && k + 8 <= keys.bis; n++) { var g = zahl32(b, k); if (g < 8) break; namen.push(text(b, k + 8, k + g)); k += g; }
      }
      if (ilst) kinder(b, ilst.von, ilst.bis).forEach(function (eintrag) {
        var nr = zahl32(b, eintrag.von - 4) - 1, name = namen[nr];   // Typ der Box ist die Nummer (ab 1)
        var d = finde(kinder(b, eintrag.von, eintrag.bis), "data");
        if (!name || !d || d.bis - d.von < 8) return;
        var wert = text(b, d.von + 8, d.bis);
        if (name === "com.apple.quicktime.location.ISO6709") { var o = iso6709(wert); if (o) { aus.lat = o.lat; aus.lon = o.lon; } }
        if (name === "com.apple.quicktime.creationdate") {
          var m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(wert);
          if (m) aus.zeit = m[1] + "T" + m[2];                  // Ortszeit der Aufnahme, wie bei Fotos
        }
      });
    }
    aus.datum = aus.zeit ? aus.zeit.slice(0, 10) : "";
    return aus;
  }
  // Datei (File/Blob) → Promise<{ zeit, datum, lat, lon, drehung: null }>; nie abgelehnt
  function videoDaten(datei) {
    function lies(von, bis) { return datei.slice(von, bis).arrayBuffer().then(function (p) { return new Uint8Array(p); }); }
    function weiter(pos, schritte) {
      if (pos + 8 > datei.size || schritte > 64) return Promise.resolve(leer());
      return lies(pos, Math.min(datei.size, pos + 16)).then(function (k) {
        var g = zahl32(k, 0), t = typ(k, 4), kopf = 8;
        if (g === 1) { g = zahl32(k, 8) * 4294967296 + zahl32(k, 12); kopf = 16; }
        else if (g === 0) g = datei.size - pos;
        if (g < kopf) return leer();
        if (t === "moov") return g > MOOV_MAX ? leer() : lies(pos + kopf, Math.min(datei.size, pos + g)).then(videoKopf);
        return weiter(pos + g, schritte + 1);
      });
    }
    try { return weiter(0, 0).catch(function () { return leer(); }); } catch (e) { return Promise.resolve(leer()); }
  }
  function istVideo(datei) { return /^video\//i.test((datei && datei.type) || "") || VIDEO.test((datei && datei.name) || ""); }
  // Foto oder Video: das Passende von beidem
  function ausMedium(datei) { return istVideo(datei) ? videoDaten(datei) : ausDatei(datei); }

  // ---------- Datum aus Dateiname und Ordner ----------
  // „IMG_20180714_123456.jpg“, „IMG-20190312-WA0001.jpg“, „2018-07-14 Strand.jpg“ → "2018-07-14", sonst null
  function datumAusName(name) {
    var m = /(?:^|[^0-9])((?:19|20)\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?=[^0-9]|$)/.exec(String(name || ""));
    return m ? m[1] + "-" + m[2] + "-" + m[3] : null;
  }
  // Jahreszahl aus dem Ordnerpfad (tiefster Ordner mit einer alleinstehenden Jahreszahl), z. B. „Fotos/1989 Urlaub/x.jpg“ → 1989
  function jahrAusPfad(pfad) {
    var teile = String(pfad || "").replace(/\\/g, "/").split("/").slice(0, -1);
    for (var k = teile.length - 1; k >= 0; k--) {
      var m = /(?:^|[^0-9])((?:19|20)\d{2})(?=[^0-9]|$)/.exec(teile[k]);
      if (m) return +m[1];
    }
    return null;
  }

  // Das beste Datum in fester Reihenfolge: Bilddaten, Dateiname, Ordner, Änderungsdatum der Datei.
  // f: { datum: "JJJJ-MM-TT" aus lesen() (auch als „exif“ erlaubt), name, pfad, geaendert: Zeitstempel in ms }
  // Ergebnis: { jahr, datum, quelle: "exif" | "name" | "ordner" | "datei" | null, sicher }
  // „datei“ ist bei Kopien und Scans oft falsch, daher sicher: false.
  function datumFinden(f) {
    f = f || {};
    var d = f.datum || f.exif || null;
    if (d) return { jahr: +String(d).slice(0, 4), datum: String(d).slice(0, 10), quelle: "exif", sicher: true };
    d = datumAusName(f.name);
    if (d) return { jahr: +d.slice(0, 4), datum: d, quelle: "name", sicher: true };
    var j = jahrAusPfad(f.pfad);
    if (j) return { jahr: j, datum: null, quelle: "ordner", sicher: true };
    if (f.geaendert) {
      var z = new Date(f.geaendert);
      if (!isNaN(z)) return { jahr: z.getFullYear(), datum: z.toISOString().slice(0, 10), quelle: "datei", sicher: false };
    }
    return { jahr: null, datum: null, quelle: null, sicher: false };
  }

  // ---------- Dateiart ----------
  function istHeic(datei) {
    return /image\/hei[cf]/i.test((datei && datei.type) || "") || HEIC.test((datei && datei.name) || "");
  }
  // "foto" | "video" | "heic" | null, nach der Endung
  function art(name) { return VIDEO.test(name) ? "video" : BILD.test(name) ? "foto" : HEIC.test(name) ? "heic" : null; }

  var api = { VERSION: VERSION, lesen: lesen, ausDatei: ausDatei, datumAusName: datumAusName, jahrAusPfad: jahrAusPfad,
              datumFinden: datumFinden, istHeic: istHeic, art: art, videoDaten: videoDaten, videoKopf: videoKopf, ausMedium: ausMedium, istVideo: istVideo };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  wurzel.ImagicosmosFotoDaten = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
