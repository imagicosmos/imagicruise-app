// Imagicruise – Fotos aufbereiten im Browser (PC und Handy). Übernommen aus Imagichron (studio/fotos.js).
//
// - Aufnahmezeit und Aufnahmeort werden vorher aus der Datei gelesen (Baustein fotos: bausteine/foto-daten.js) und nur als Vorschlag benutzt
// - Drehung laut EXIF (Handy-Fotos stehen sonst quer)
// - verkleinern: längste Seite höchstens 1920 Pixel, nie vergrößern
// - Metadaten weg: Das Bild wird neu gezeichnet und als JPEG gespeichert. Dabei fallen EXIF, Ortsdaten (GPS),
//   Kamera, Aufnahmedatum usw. vollständig weg.
// - Der Dateiname ist die Prüfsumme des fertigen Bildes: Dasselbe Foto heißt auf PC und Handy gleich.
//
// HEIC (iPhone) können Edge und Chrome nicht öffnen: Fehler "heic" mit verständlicher Meldung.
(function (wurzel) {
  "use strict";

  var STANDARD = { maxSeite: 1920, qualitaet: 0.85 };

  function istHeic(datei) {
    return /image\/hei[cf]/i.test(datei.type || "") || /\.hei[cf]$/i.test(datei.name || "");
  }
  function fehler(code, text) { var e = new Error(text); e.code = code; return e; }

  function laden(datei) {
    if (istHeic(datei)) {
      return Promise.reject(fehler("heic", "HEIC-Fotos (iPhone) kann der Browser nicht öffnen. Bitte als JPG exportieren " +
        "(iPhone: Einstellungen → Kamera → Formate → „Maximale Kompatibilität“)."));
    }
    if (wurzel.createImageBitmap) {
      return createImageBitmap(datei, { imageOrientation: "from-image" }).catch(function () { return ueberImg(datei); });
    }
    return ueberImg(datei);
  }
  function ueberImg(datei) {
    return new Promise(function (ok, nein) {
      var u = URL.createObjectURL(datei), im = new Image();
      im.onload = function () { URL.revokeObjectURL(u); ok(im); };
      im.onerror = function () { URL.revokeObjectURL(u); nein(fehler("bild", "Das Bild konnte nicht gelesen werden.")); };
      im.src = u;
    });
  }

  function pruefsumme(blob) {
    return blob.arrayBuffer().then(function (b) { return crypto.subtle.digest("SHA-256", b); }).then(function (h) {
      return Array.prototype.map.call(new Uint8Array(h).subarray(0, 16), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    });
  }

  // datei: File/Blob → { blob (JPEG ohne Metadaten), datei: "<Prüfsumme>.jpg", breite, hoehe, zeit, lat, lon }
  function aufbereiten(datei, optionen) {
    var o = { maxSeite: (optionen && optionen.maxSeite) || STANDARD.maxSeite, qualitaet: (optionen && optionen.qualitaet) || STANDARD.qualitaet };
    // datei.fotoAngaben: Aufnahmezeit und -ort sind schon gelesen (Android-App: das Bild kommt vorverkleinert und ohne Bilddaten an)
    var angaben = datei.fotoAngaben ? Promise.resolve(datei.fotoAngaben)
      : wurzel.ImagicosmosFotoDaten ? wurzel.ImagicosmosFotoDaten.ausDatei(datei) : Promise.resolve({ zeit: "", lat: null, lon: null });
    return Promise.all([laden(datei), angaben]).then(function (r) {
      var bild = r[0], exif = r[1];
      var W = bild.width || bild.naturalWidth, H = bild.height || bild.naturalHeight;
      if (!W || !H) throw fehler("bild", "Das Bild ist leer.");
      // datei.fotoFertig: Die Android-App hat das Foto schon fertig geliefert (verkleinert, als JPEG, ohne Bilddaten).
      // Dann wird nichts mehr neu gezeichnet – nur Größe und Prüfsumme bestimmt.
      if (datei.fotoFertig && datei.type === "image/jpeg" && Math.max(W, H) <= o.maxSeite) {
        if (bild.close) bild.close();
        return pruefsumme(datei).then(function (summe) {
          return { blob: datei, datei: summe + ".jpg", breite: W, hoehe: H, zeit: exif.zeit, lat: exif.lat, lon: exif.lon };
        });
      }
      var f = Math.min(1, o.maxSeite / Math.max(W, H));
      var w = Math.max(1, Math.round(W * f)), h = Math.max(1, Math.round(H * f));
      var c = document.createElement("canvas");
      c.width = w; c.height = h;
      var g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);   // durchsichtige PNG bekommen weißen Hintergrund
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
      g.drawImage(bild, 0, 0, w, h);
      if (bild.close) bild.close();
      return new Promise(function (ok, nein) {
        c.toBlob(function (b) { b ? ok(b) : nein(fehler("bild", "Das Bild konnte nicht gespeichert werden.")); }, "image/jpeg", o.qualitaet);
      }).then(function (blob) {
        c.width = c.height = 0;   // Speicher sofort freigeben (wichtig bei vielen großen Fotos)
        return pruefsumme(blob).then(function (summe) {
          return { blob: blob, datei: summe + ".jpg", breite: w, hoehe: h, zeit: exif.zeit, lat: exif.lat, lon: exif.lon };
        });
      });
    });
  }

  // Fotos einer Reise zu Ereignissen bündeln: nach Aufnahmezeit sortiert; eine Pause von mehr als "pause" Minuten
  // oder ein neuer Tag beginnt eine neue Gruppe. fotos: [{ zeit: "JJJJ-MM-TTThh:mm:ss" | "", lat, lon, … }]
  // Ergebnis: [{ datum: "JJJJ-MM-TT" | "", zeit: "hh:mm" | "", ende, lat, lon, fotos: […] }] – Fotos ohne Zeit als eine Gruppe am Schluss
  function gruppieren(fotos, pause) {
    var grenze = (pause || 45) * 60000, mit = [], ohne = [], gruppen = [], g = null, letzte = 0;
    fotos.forEach(function (f) { (f.zeit ? mit : ohne).push(f); });
    mit.sort(function (a, b) { return a.zeit < b.zeit ? -1 : a.zeit > b.zeit ? 1 : 0; });
    mit.forEach(function (f) {
      var t = Date.parse(f.zeit + "Z"), datum = f.zeit.slice(0, 10);
      if (!g || g.datum !== datum || t - letzte > grenze) {
        g = { datum: datum, zeit: f.zeit.slice(11, 16), ende: "", lat: null, lon: null, fotos: [] };
        gruppen.push(g);
      }
      g.fotos.push(f); g.ende = f.zeit.slice(11, 16); letzte = t;
      if (g.lat == null && typeof f.lat === "number") { g.lat = f.lat; g.lon = f.lon; }
    });
    gruppen.forEach(function (x) { if (x.ende === x.zeit) x.ende = ""; });
    if (ohne.length) gruppen.push({ datum: "", zeit: "", ende: "", lat: null, lon: null, fotos: ohne });
    return gruppen;
  }

  var api = { aufbereiten: aufbereiten, gruppieren: gruppieren, pruefsumme: pruefsumme, istHeic: istHeic, STANDARD: STANDARD };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  wurzel.ImagicruiseFotos = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
