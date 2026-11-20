// Imagicruise – ZIP-Dateien schreiben und lesen, ohne fremden Code (Browser und Node).
//
// Gebraucht für das Reisepaket (Abgleich PC ↔ Handy) und für den fertigen Reisebericht zum Herunterladen.
// Geschrieben wird ohne Verdichtung ("gespeichert"): Fotos sind als JPEG schon verdichtet.
// Gelesen werden gespeicherte und verdichtete Einträge (verdichtete über DecompressionStream des Browsers).
// Grenze: Dateien bis 4 GB (kein ZIP64) – für Reisen mehr als genug.
(function (wurzel) {
  "use strict";

  var TABELLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = TABELLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  var kodierer = new TextEncoder(), dekodierer = new TextDecoder("utf-8");

  function dosZeit(d) {
    var j = Math.max(1980, d.getFullYear());
    return { zeit: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), datum: ((j - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
  }

  function nameErlaubt(name) {
    return typeof name === "string" && name.length > 0 && name.length < 300 && !/^\/|\\|(^|\/)\.\.(\/|$)|\0|^[a-zA-Z]:/.test(name);
  }

  // eintraege: [{ name: "ordner/datei.jpg", daten: Uint8Array }] → Liste von Uint8Array-Stücken (für new Blob(stuecke))
  function schreiben(eintraege, zeitpunkt) {
    var dz = dosZeit(zeitpunkt || new Date()), stuecke = [], zentral = [], stelle = 0;
    eintraege.forEach(function (e) {
      if (!nameErlaubt(e.name)) throw new Error("Ungültiger Dateiname im Paket: " + e.name);
      var name = kodierer.encode(e.name), daten = e.daten, crc = crc32(daten);
      var kopf = new DataView(new ArrayBuffer(30));
      kopf.setUint32(0, 0x04034b50, true); kopf.setUint16(4, 20, true); kopf.setUint16(6, 0x0800, true);   // 0x0800: Namen in UTF-8
      kopf.setUint16(8, 0, true); kopf.setUint16(10, dz.zeit, true); kopf.setUint16(12, dz.datum, true);
      kopf.setUint32(14, crc, true); kopf.setUint32(18, daten.length, true); kopf.setUint32(22, daten.length, true);
      kopf.setUint16(26, name.length, true); kopf.setUint16(28, 0, true);
      stuecke.push(new Uint8Array(kopf.buffer), name, daten);

      var z = new DataView(new ArrayBuffer(46));
      z.setUint32(0, 0x02014b50, true); z.setUint16(4, 20, true); z.setUint16(6, 20, true); z.setUint16(8, 0x0800, true);
      z.setUint16(10, 0, true); z.setUint16(12, dz.zeit, true); z.setUint16(14, dz.datum, true);
      z.setUint32(16, crc, true); z.setUint32(20, daten.length, true); z.setUint32(24, daten.length, true);
      z.setUint16(28, name.length, true); z.setUint32(42, stelle, true);
      zentral.push(new Uint8Array(z.buffer), name);
      stelle += 30 + name.length + daten.length;
    });
    var zLaenge = zentral.reduce(function (s, x) { return s + x.length; }, 0);
    var ende = new DataView(new ArrayBuffer(22));
    ende.setUint32(0, 0x06054b50, true); ende.setUint16(8, eintraege.length, true); ende.setUint16(10, eintraege.length, true);
    ende.setUint32(12, zLaenge, true); ende.setUint32(16, stelle, true);
    return stuecke.concat(zentral, [new Uint8Array(ende.buffer)]);
  }

  function zusammen(stuecke) {
    var n = stuecke.reduce(function (s, x) { return s + x.length; }, 0), aus = new Uint8Array(n), p = 0;
    stuecke.forEach(function (x) { aus.set(x, p); p += x.length; });
    return aus;
  }

  function entpacken(bytes) {
    if (!wurzel.DecompressionStream || !wurzel.Response) return Promise.reject(new Error("Dieses Paket ist verdichtet und kann hier nicht gelesen werden."));
    var strom = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Response(strom).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  // bytes: Uint8Array einer ZIP-Datei → Promise<[{ name, daten: Uint8Array }]> (Ordner-Einträge werden ausgelassen)
  function lesen(bytes) {
    var v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), ende = -1;
    for (var i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
      if (v.getUint32(i, true) === 0x06054b50) { ende = i; break; }
    }
    if (ende < 0) return Promise.reject(new Error("Das ist keine ZIP-Datei."));
    var anzahl = v.getUint16(ende + 10, true), p = v.getUint32(ende + 16, true), aufgaben = [];
    for (var n = 0; n < anzahl; n++) {
      if (p + 46 > bytes.length || v.getUint32(p, true) !== 0x02014b50) return Promise.reject(new Error("Die ZIP-Datei ist beschädigt."));
      var art = v.getUint16(p + 10, true), crc = v.getUint32(p + 16, true), gepackt = v.getUint32(p + 20, true), gross = v.getUint32(p + 24, true);
      var nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), kl = v.getUint16(p + 32, true), ort = v.getUint32(p + 42, true);
      var name = dekodierer.decode(bytes.subarray(p + 46, p + 46 + nl));
      p += 46 + nl + xl + kl;
      if (/\/$/.test(name)) continue;
      if (!nameErlaubt(name)) return Promise.reject(new Error("Das Paket enthält einen unerlaubten Dateinamen."));
      if (ort + 30 > bytes.length || v.getUint32(ort, true) !== 0x04034b50) return Promise.reject(new Error("Die ZIP-Datei ist beschädigt."));
      var start = ort + 30 + v.getUint16(ort + 26, true) + v.getUint16(ort + 28, true);
      if (start + gepackt > bytes.length) return Promise.reject(new Error("Die ZIP-Datei ist unvollständig."));
      aufgaben.push((function (name, art, roh, crc, gross) {
        var fertig = art === 0 ? Promise.resolve(roh) : art === 8 ? entpacken(roh) : Promise.reject(new Error("Unbekannte Verdichtung im Paket."));
        return fertig.then(function (daten) {
          if (daten.length !== gross || crc32(daten) !== crc) throw new Error("Die Datei „" + name + "“ im Paket ist beschädigt.");
          return { name: name, daten: daten };
        });
      })(name, art, bytes.subarray(start, start + gepackt), crc, gross));
    }
    return Promise.all(aufgaben);
  }

  var api = { schreiben: schreiben, lesen: lesen, zusammen: zusammen, crc32: crc32, nameErlaubt: nameErlaubt };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  wurzel.ImagicruiseZip = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
