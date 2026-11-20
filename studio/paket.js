// Imagicruise – Reisepaket und fertiger Reisebericht als Dateiliste (Browser und Node).
//
// Reisepaket (Abgleich PC ↔ Handy): eine ZIP-Datei mit reise.json und den Fotos unter medien/.
// Reisebericht (Veröffentlichen): die Dateien des Abspielers, reise.js mit den Daten und die Fotos unter medien/.
// Beides entsteht im Browser. Der PC schreibt den Reisebericht zusätzlich als Ordner (siehe speicher.js).
(function (wurzel) {
  "use strict";
  var M = wurzel.ImagicruiseModell || (typeof require !== "undefined" ? require("./modell.js") : null);
  var Z = wurzel.ImagicruiseZip || (typeof require !== "undefined" ? require("./zip.js") : null);
  var K = wurzel.ImagicruiseKarte || (typeof require !== "undefined" ? require("../abspieler/karte.js") : null);
  function weltDaten() { return wurzel.IMAGICRUISE_WELT || (typeof require !== "undefined" ? require("../abspieler/weltkarte.js") : null); }

  // Gegend der Reise für die Kartendaten im Reisebericht: alle Stationen mit reichlich Rand (mindestens 3 Grad),
  // damit man dort auch etwas herauszoomen kann. Ohne Stationen ein winziger Ausschnitt (der Bericht zeigt dann keine Karte).
  function gegend(reise) {
    var st = M.stationen(reise);
    if (!st.length) return { west: 0, sued: 0, ost: 0.01, nord: 0.01 };
    var w = 180, o = -180, s = 90, n = -90;
    st.forEach(function (p) { w = Math.min(w, p.lon); o = Math.max(o, p.lon); s = Math.min(s, p.lat); n = Math.max(n, p.lat); });
    var rx = Math.max(3, (o - w) * 0.6), ry = Math.max(3, (n - s) * 0.6);
    return { west: Math.max(-180, w - rx), ost: Math.min(180, o + rx), sued: Math.max(-85, s - ry), nord: Math.min(85, n + ry) };
  }

  // Dateien des Abspielers, die in jeden Reisebericht gehören (Pfade unter abspieler/)
  var ABSPIELER = ["index.html", "style.css", "app.js", "arten.js", "karte.js", "weltkarte.js", "modus.js", "favicon.svg",
    "schriften/josefin-sans-latin-700-normal.woff2", "schriften/OFL-josefin-sans.txt"];

  var kodierer = new TextEncoder(), dekodierer = new TextDecoder("utf-8");
  function bytes(x) {
    if (x instanceof Uint8Array) return Promise.resolve(x);
    if (x && typeof x.arrayBuffer === "function") return x.arrayBuffer().then(function (b) { return new Uint8Array(b); });
    return Promise.resolve(kodierer.encode(String(x)));
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  // "Westliches Mittelmeer 2026" → "westliches-mittelmeer-2026"
  function dateiname(reise) {
    var s = String(reise.titel || "reise").toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
    return s || "reise";
  }

  // der Reihe nach holen (nicht alle Fotos gleichzeitig im Speicher anfordern)
  function nacheinander(liste, tun) {
    var aus = [];
    return liste.reduce(function (p, x, i) { return p.then(function () { return tun(x, i); }).then(function (r) { aus.push(r); }); }, Promise.resolve())
      .then(function () { return aus; });
  }

  // ---- Reisepaket ----
  // holeMedium(datei) → Promise<Blob|Uint8Array|null>; fortschritt(erledigt, gesamt)
  function paketBauen(reise, holeMedium, fortschritt) {
    var medien = M.mediendateien(reise, true), eintraege = [{ name: "reise.json", daten: kodierer.encode(JSON.stringify(reise, null, 1)) }];
    return nacheinander(medien, function (datei, i) {
      return Promise.resolve(holeMedium(datei)).then(function (m) {
        if (fortschritt) fortschritt(i + 1, medien.length);
        if (!m) return;   // fehlendes Foto: Paket trotzdem bauen
        return bytes(m).then(function (b) { eintraege.push({ name: "medien/" + datei, daten: b }); });
      });
    }).then(function () { return Z.schreiben(eintraege); });
  }

  // zipBytes → Promise<{ reise, medien: { "<datei>": Uint8Array } }>
  function paketLesen(zipBytes) {
    return Z.lesen(zipBytes).then(function (eintraege) {
      var roh = null, medien = {};
      eintraege.forEach(function (e) {
        if (e.name === "reise.json") roh = e.daten;
        else if (/^medien\//.test(e.name) && (M.istMediendatei(e.name.slice(7)) || M.istVideodatei(e.name.slice(7)))) medien[e.name.slice(7)] = e.daten;
      });
      if (!roh) throw new Error("In dieser Datei steckt keine Reise von Imagicruise (reise.json fehlt).");
      var reise;
      try { reise = JSON.parse(dekodierer.decode(roh)); } catch (e) { throw new Error("Die Reise in dieser Datei ist beschädigt."); }
      return { reise: M.pruefen(reise), medien: medien };
    });
  }

  // ---- Reisebericht ----
  // Nur was Leser sehen sollen: keine Lösch-Liste, keine Zeitstempel der einzelnen Einträge.
  function oeffentlich(reise) {
    var r = {
      format: "imagicruise-bericht", version: 1, titel: reise.titel, untertitel: reise.untertitel, art: reise.art,
      von: reise.von, bis: reise.bis, reisende: reise.reisende, einleitung: reise.einleitung, schluss: reise.schluss,
      titelbild: M.istMediendatei(reise.titelbild) ? reise.titelbild : "", stand: M.jetzt().slice(0, 10), tage: []
    };
    (reise.tage || []).forEach(function (t) {
      r.tage.push({
        datum: t.datum, titel: t.titel, art: t.art, ort: t.ort, text: t.text,
        ereignisse: M.ereignisseSortiert(t).map(function (e) {
          return { id: e.id, art: e.art, titel: e.titel, zeit: e.zeit, ende: e.ende, ort: e.ort, text: e.text, bewertung: e.bewertung,
            fotos: e.fotos.map(function (f) {
              var o = { datei: f.datei, text: f.text, breite: f.breite, hoehe: f.hoehe };
              if (f.video) { o.video = f.video; o.dauer = f.dauer; }
              return o;
            }) };
        })
      });
    });
    if (!r.titelbild) { var erstes = M.alleFotos(reise)[0]; if (erstes) r.titelbild = erstes.foto.datei; }
    return r;
  }

  function reiseJs(reise) {
    // U+2028/2029 und "</" entschärfen, damit die Datei in jedem Browser ein gültiges Skript ist
    var json = JSON.stringify(oeffentlich(reise)).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029").replace(/<\//g, "<\\/");
    return "// Erzeugt von Imagicruise. Die Daten dieses Reiseberichts.\nwindow.IMAGICRUISE_REISE = " + json + ";\n";
  }

  // holeAbspieler(pfad) → Promise<Blob|Uint8Array|Text>; Ergebnis: Promise<[{ name, daten: Uint8Array }]>
  function berichtBauen(reise, holeMedium, holeAbspieler, fortschritt) {
    var medien = M.mediendateien(reise), gesamt = ABSPIELER.length + medien.length, n = 0, eintraege = [];
    var weiter = function () { n++; if (fortschritt) fortschritt(n, gesamt); };
    return nacheinander(ABSPIELER, function (pfad) {
      return Promise.resolve(holeAbspieler(pfad)).then(bytes).then(function (b) {
        if (pfad === "index.html") {
          var html = dekodierer.decode(b), titel = esc(reise.titel || "Reisebericht");
          var kurz = esc((reise.untertitel || M.zeitraumText(reise.von, reise.bis) || "Reisebericht").slice(0, 200));
          html = html.replace(/<title>[^<]*<\/title>/, "<title>" + titel + " – Reisebericht</title>")
            .replace(/(<meta name="description" content=")[^"]*(")/, "$1" + titel + ": " + kurz + "$2");
          b = kodierer.encode(html);
        }
        // Kartendaten: nur die Gegend der Reise (statt der ganzen Welt, 3 MB)
        if (pfad === "weltkarte.js" && K && weltDaten()) b = kodierer.encode(K.datenJs(K.datenAusschnitt(weltDaten(), gegend(reise))));
        eintraege.push({ name: pfad, daten: b }); weiter();
      });
    }).then(function () {
      eintraege.push({ name: "reise.js", daten: kodierer.encode(reiseJs(reise)) });
      return nacheinander(medien, function (datei) {
        return Promise.resolve(holeMedium(datei)).then(function (m) {
          weiter();
          if (!m) return;
          return bytes(m).then(function (b) { eintraege.push({ name: "medien/" + datei, daten: b }); });
        });
      });
    }).then(function () { return eintraege; });
  }

  var api = { ABSPIELER: ABSPIELER, dateiname: dateiname, paketBauen: paketBauen, paketLesen: paketLesen,
    oeffentlich: oeffentlich, reiseJs: reiseJs, berichtBauen: berichtBauen, gegend: gegend };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  wurzel.ImagicruisePaket = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
