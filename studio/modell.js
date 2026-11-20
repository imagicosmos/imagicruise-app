// Imagicruise – Datenmodell einer Reise (Browser und Node). Beschreibung: docs/DATENFORMAT.md
//
// Eine Reise hat Tage (je Kalendertag einer), ein Tag hat Ereignisse. Alles, was sich ändert, bekommt einen
// Zeitstempel "geaendert" – daran erkennt der Abgleich zwischen PC und Handy, welcher Stand neuer ist.
(function (wurzel) {
  "use strict";

  var FORMAT = "imagicruise-reise", VERSION = 1;
  var STAMM = ["titel", "untertitel", "art", "von", "bis", "reisende", "einleitung", "schluss", "titelbild"];
  var WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  var MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  var MAX_TAGE = 400;

  function jetzt() { return new Date().toISOString(); }

  function neueId(vorsatz) {
    var z = "abcdefghijklmnopqrstuvwxyz0123456789", s = "", b = new Uint8Array(10), i;
    if (wurzel.crypto && wurzel.crypto.getRandomValues) wurzel.crypto.getRandomValues(b);
    else for (i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
    for (i = 0; i < b.length; i++) s += z[b[i] % z.length];
    return (vorsatz || "x") + "-" + s;
  }

  // ---- Datum (immer "JJJJ-MM-TT", ohne Zeitzone gerechnet) ----
  function istDatum(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = new Date(s + "T00:00:00Z");
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
  }
  function datumPlus(s, tage) {
    var d = new Date(s + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + tage);
    return d.toISOString().slice(0, 10);
  }
  function tageZwischen(von, bis) { return Math.round((new Date(bis + "T00:00:00Z") - new Date(von + "T00:00:00Z")) / 86400000); }
  function datumsliste(von, bis) {
    var liste = [];
    if (!istDatum(von) || !istDatum(bis) || bis < von) return liste;
    for (var d = von; d <= bis && liste.length < MAX_TAGE; d = datumPlus(d, 1)) liste.push(d);
    return liste;
  }
  function wochentag(s) { return WOCHENTAGE[new Date(s + "T00:00:00Z").getUTCDay()]; }
  // "10. Mai 2026", kurz: "10.05."
  function datumText(s, kurz) {
    if (!istDatum(s)) return "";
    var t = +s.slice(8, 10), m = +s.slice(5, 7), j = s.slice(0, 4);
    return kurz ? ("0" + t).slice(-2) + "." + ("0" + m).slice(-2) + "." : t + ". " + MONATE[m - 1] + " " + j;
  }
  // "10. – 17. Mai 2026", "28. April – 3. Mai 2026", "30. Dezember 2026 – 2. Januar 2027"
  function zeitraumText(von, bis) {
    if (!istDatum(von)) return "";
    if (!istDatum(bis) || bis === von) return datumText(von);
    var vt = +von.slice(8, 10), vm = +von.slice(5, 7), vj = von.slice(0, 4), bj = bis.slice(0, 4), bm = +bis.slice(5, 7);
    if (vj !== bj) return datumText(von) + " – " + datumText(bis);
    if (vm !== bm) return vt + ". " + MONATE[vm - 1] + " – " + datumText(bis);
    return vt + ". – " + datumText(bis);
  }

  function istZeit(s) { return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }

  // ---- Ort ----
  function ortLeer() { return { name: "", lat: null, lon: null }; }
  function hatKoordinaten(ort) {
    return !!ort && typeof ort.lat === "number" && typeof ort.lon === "number" && isFinite(ort.lat) && isFinite(ort.lon) &&
      Math.abs(ort.lat) <= 90 && Math.abs(ort.lon) <= 180;
  }
  // "48.137, 11.575" oder "48,137; 11,575" oder "48°08'13"N 11°34'30"E" → {lat, lon} oder null
  function koordinatenLesen(text) {
    var t = String(text || "").trim();
    if (!t) return null;
    var grad = t.match(/(\d+(?:[.,]\d+)?)\s*°\s*(?:(\d+(?:[.,]\d+)?)\s*['′]\s*)?(?:(\d+(?:[.,]\d+)?)\s*["″]\s*)?([NSns])[\s,;]+(\d+(?:[.,]\d+)?)\s*°\s*(?:(\d+(?:[.,]\d+)?)\s*['′]\s*)?(?:(\d+(?:[.,]\d+)?)\s*["″]\s*)?([EOWeow])/);
    var z = function (s) { return s ? parseFloat(s.replace(",", ".")) : 0; }, lat, lon;
    if (grad) {
      lat = (z(grad[1]) + z(grad[2]) / 60 + z(grad[3]) / 3600) * (/s/i.test(grad[4]) ? -1 : 1);
      lon = (z(grad[5]) + z(grad[6]) / 60 + z(grad[7]) / 3600) * (/w/i.test(grad[8]) ? -1 : 1);
    } else {
      var m = t.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/) || t.match(/^(-?\d+(?:,\d+)?)\s*[;\s]\s*(-?\d+(?:,\d+)?)$/);
      if (!m) return null;
      lat = z(m[1]); lon = z(m[2]);
    }
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 };
  }

  // ---- Anlegen ----
  function neuerTag(datum) {
    return { datum: datum, titel: "", art: "normal", ort: ortLeer(), text: "", ereignisse: [], geaendert: "" };
  }
  function neuesEreignis(art) {
    return { id: neueId("e"), art: art || "sehenswuerdigkeit", titel: "", zeit: "", ende: "", ort: ortLeer(), text: "",
      fotos: [], bewertung: 0, geaendert: jetzt() };
  }
  function neueReise(angaben) {
    var a = angaben || {}, t = jetzt();
    var reise = {
      format: FORMAT, version: VERSION, id: a.id || neueId("r"),
      titel: a.titel || "", untertitel: a.untertitel || "", art: a.art || "andere",
      von: a.von || "", bis: a.bis || a.von || "", reisende: a.reisende || "",
      einleitung: "", schluss: "", titelbild: "",
      tage: [], geloescht: {}, stamm_geaendert: t, geaendert: t
    };
    tageAnpassen(reise);
    return reise;
  }

  function tagHatInhalt(tag) {
    return !!(tag.titel || tag.text || (tag.ort && (tag.ort.name || hatKoordinaten(tag.ort))) || (tag.ereignisse && tag.ereignisse.length) ||
      (tag.art && tag.art !== "normal"));
  }

  // Für jeden Kalendertag von "von" bis "bis" genau einen Tag. Tage außerhalb bleiben nur, wenn sie Inhalt haben.
  function tageAnpassen(reise) {
    var soll = datumsliste(reise.von, reise.bis), nach = {};
    (reise.tage || []).forEach(function (t) { if (t && istDatum(t.datum) && !nach[t.datum]) nach[t.datum] = t; });
    soll.forEach(function (d) { if (!nach[d]) nach[d] = neuerTag(d); });
    reise.tage = Object.keys(nach).sort().map(function (d) { return nach[d]; }).filter(function (t) {
      return soll.indexOf(t.datum) >= 0 || tagHatInhalt(t);
    });
    return reise;
  }

  function ereignisseSortiert(tag) {
    return (tag.ereignisse || []).map(function (e, i) { return { e: e, i: i }; }).sort(function (a, b) {
      var za = istZeit(a.e.zeit) ? a.e.zeit : "99:99", zb = istZeit(b.e.zeit) ? b.e.zeit : "99:99";
      return za < zb ? -1 : za > zb ? 1 : a.i - b.i;
    }).map(function (x) { return x.e; });
  }

  // Alles in die gültige Form bringen (fehlende Felder ergänzen, Unbekanntes behalten). Wirft bei fremden Dateien.
  function pruefen(reise) {
    if (!reise || typeof reise !== "object") throw new Error("Das ist keine Reise von Imagicruise.");
    if (reise.format !== FORMAT) throw new Error("Das ist keine Reise von Imagicruise.");
    if (!(reise.version >= 1) || reise.version > VERSION) throw new Error("Diese Reise stammt aus einer neueren Fassung von Imagicruise. Bitte Imagicruise aktualisieren.");
    if (typeof reise.id !== "string" || !/^[a-z0-9-]{3,40}$/.test(reise.id)) throw new Error("Die Reise hat keine gültige Kennung.");
    var text = function (v) { return typeof v === "string" ? v : ""; };
    var ort = function (o) {
      o = o && typeof o === "object" ? o : {};
      var ok = hatKoordinaten(o);
      return { name: text(o.name), lat: ok ? o.lat : null, lon: ok ? o.lon : null };
    };
    STAMM.forEach(function (k) { reise[k] = text(reise[k]); });
    if (!istDatum(reise.von)) reise.von = "";
    if (!istDatum(reise.bis) || reise.bis < reise.von) reise.bis = reise.von;
    reise.geaendert = text(reise.geaendert) || jetzt();
    reise.stamm_geaendert = text(reise.stamm_geaendert) || reise.geaendert;
    reise.geloescht = reise.geloescht && typeof reise.geloescht === "object" && !Array.isArray(reise.geloescht) ? reise.geloescht : {};
    reise.tage = (Array.isArray(reise.tage) ? reise.tage : []).filter(function (t) { return t && istDatum(t.datum); }).map(function (t) {
      t.titel = text(t.titel); t.text = text(t.text); t.art = text(t.art) || "normal"; t.ort = ort(t.ort); t.geaendert = text(t.geaendert);
      anreiseSauber(t);
      t.ereignisse = (Array.isArray(t.ereignisse) ? t.ereignisse : []).filter(function (e) { return e && typeof e === "object"; }).map(function (e) {
        if (typeof e.id !== "string" || !e.id) e.id = neueId("e");
        e.art = text(e.art) || "sonstiges"; e.titel = text(e.titel); e.text = text(e.text);
        e.zeit = istZeit(e.zeit) ? e.zeit : ""; e.ende = istZeit(e.ende) ? e.ende : "";
        e.ort = ort(e.ort); e.geaendert = text(e.geaendert);
        anreiseSauber(e);
        e.bewertung = Math.max(0, Math.min(5, Math.round(+e.bewertung || 0)));
        e.fotos = (Array.isArray(e.fotos) ? e.fotos : []).filter(function (f) { return f && istMediendatei(f.datei); }).map(function (f) {
          var foto = { datei: f.datei, text: text(f.text), breite: +f.breite || 0, hoehe: +f.hoehe || 0 };
          // bearbeitetes Foto: `datei` ist das Ergebnis, `original` das eingelesene Foto, `bearbeitung` die Einstellung
          var b = bearbeitungSauber(f.bearbeitung);
          if (b && !bearbeitungIstStandard(b) && istMediendatei(f.original) && f.original !== f.datei) { foto.original = f.original; foto.bearbeitung = b; }
          // kurzes Video: `datei` ist dann sein Standbild, `video` die MP4-Datei, `dauer` die Länge in Sekunden
          if (istVideodatei(f.video)) { foto.video = f.video; foto.dauer = Math.max(0, Math.min(600, Math.round((+f.dauer || 0) * 10) / 10)); }
          return foto;
        });
        return e;
      });
      return t;
    });
    return tageAnpassen(reise);
  }

  // Verkehrsmittel zum Ort (seit 20.11.2026, freiwillig): Kennung aus abspieler/arten.js (VERKEHRSMITTEL). Unbekannte, aber
  // gültig geschriebene Kennungen bleiben stehen (vielleicht aus einer neueren Fassung); die Karte schätzt dann selbst.
  function anreiseSauber(o) {
    if (typeof o.anreise === "string" && /^[a-z]{2,20}$/.test(o.anreise)) return;
    delete o.anreise;
  }

  // Mediendateien heißen nach ihrem Inhalt (Prüfsumme) – gleicher Name heißt gleiches Bild, auf PC und Handy.
  function istMediendatei(name) { return typeof name === "string" && /^[a-f0-9]{16,64}\.jpg$/.test(name); }
  function istVideodatei(name) { return typeof name === "string" && /^[a-f0-9]{16,64}\.mp4$/.test(name); }

  // Einstellung der Bildbearbeitung prüfen → saubere Kopie oder null (siehe bildbearbeitung.js)
  var BILDFILTER = ["none", "vivid", "soft", "warm", "bw", "sepia"];
  function bearbeitungSauber(e) {
    if (!e || typeof e !== "object") return null;
    var zahl = function (v, a, b) { return Math.min(b, Math.max(a, Math.round(+v || 0))); };
    var c = Array.isArray(e.crop) && e.crop.length === 4 ? e.crop.map(function (v) { return Math.min(1, Math.max(0, +v || 0)); }) : [0, 0, 1, 1];
    if (c[2] < .02 || c[3] < .02 || c[0] + c[2] > 1.0001 || c[1] + c[3] > 1.0001) c = [0, 0, 1, 1];
    return { rot: [0, 90, 180, 270].indexOf(+e.rot) >= 0 ? +e.rot : 0, flip: !!e.flip, crop: c, auto: !!e.auto,
      bri: zahl(e.bri, -100, 100), con: zahl(e.con, -100, 100), sat: zahl(e.sat, -100, 100),
      fil: BILDFILTER.indexOf(e.fil) >= 0 ? e.fil : "none" };
  }
  function bearbeitungIstStandard(e) {
    return !e || (!e.rot && !e.flip && !e.auto && !e.bri && !e.con && !e.sat && e.fil === "none" &&
      e.crop[0] < .001 && e.crop[1] < .001 && e.crop[2] > .999 && e.crop[3] > .999);
  }

  function alleFotos(reise) {
    var liste = [];
    (reise.tage || []).forEach(function (t) {
      (t.ereignisse || []).forEach(function (e) { (e.fotos || []).forEach(function (f) { liste.push({ foto: f, ereignis: e, tag: t }); }); });
    });
    return liste;
  }
  // mitOriginal: auch die unbearbeiteten Fassungen bearbeiteter Fotos (fürs Reisepaket, nicht für den Reisebericht)
  function mediendateien(reise, mitOriginal) {
    var s = {};
    alleFotos(reise).forEach(function (x) { s[x.foto.datei] = true; if (x.foto.video) s[x.foto.video] = true; if (mitOriginal && x.foto.original) s[x.foto.original] = true; });
    if (istMediendatei(reise.titelbild)) s[reise.titelbild] = true;
    return Object.keys(s).sort();
  }

  // Stationen für die Karte in Reihenfolge der Reise: Tagesorte und Ereignisorte mit Koordinaten.
  // Liegen zwei aufeinanderfolgende Stationen fast am selben Punkt, wird nur die erste gezeigt.
  function stationen(reise) {
    var liste = [];
    (reise.tage || []).forEach(function (t, ti) {
      var punkte = [];
      if (hatKoordinaten(t.ort)) punkte.push({ lat: t.ort.lat, lon: t.ort.lon, name: t.ort.name || t.titel, tag: ti, datum: t.datum, art: "tag", anreise: t.anreise || "" });
      ereignisseSortiert(t).forEach(function (e) {
        if (hatKoordinaten(e.ort)) punkte.push({ lat: e.ort.lat, lon: e.ort.lon, name: e.ort.name || e.titel, tag: ti, datum: t.datum, art: "ereignis", ereignis: e.id, anreise: e.anreise || "" });
      });
      punkte.forEach(function (p) {
        var l = liste[liste.length - 1];
        if (l && Math.abs(l.lat - p.lat) < 0.0005 && Math.abs(l.lon - p.lon) < 0.0005) { if (!l.name && p.name) l.name = p.name; return; }
        liste.push(p);
      });
    });
    return liste;
  }

  function zahlen(reise) {
    var e = 0, f = 0, orte = {};
    (reise.tage || []).forEach(function (t) {
      e += (t.ereignisse || []).length;
      (t.ereignisse || []).forEach(function (x) { f += (x.fotos || []).length; });
      if (t.ort && t.ort.name) orte[t.ort.name.toLowerCase()] = true;
    });
    return { tage: (reise.tage || []).length, ereignisse: e, fotos: f, orte: Object.keys(orte).length };
  }

  // Hinweise vor dem Veröffentlichen. art: "fehler" (so geht es nicht), "warnung", "hinweis".
  function pruefliste(reise) {
    var l = [], z = zahlen(reise);
    if (!reise.titel.trim()) l.push({ art: "fehler", text: "Die Reise hat noch keinen Titel.", ziel: "reise" });
    if (!istDatum(reise.von)) l.push({ art: "fehler", text: "Der Zeitraum der Reise fehlt.", ziel: "reise" });
    if (!z.ereignisse) l.push({ art: "warnung", text: "Es gibt noch kein Ereignis.", ziel: "tage" });
    if (!reise.titelbild && z.fotos) l.push({ art: "hinweis", text: "Noch kein Titelbild gewählt. Ohne Wahl nimmt der Reisebericht das erste Foto.", ziel: "reise" });
    if (!z.fotos) l.push({ art: "hinweis", text: "Die Reise hat noch keine Fotos.", ziel: "tage" });
    (reise.tage || []).forEach(function (t, i) {
      var n = "Tag " + (i + 1) + " (" + datumText(t.datum, true) + ")";
      if (!tagHatInhalt(t)) l.push({ art: "hinweis", text: n + " ist noch leer.", ziel: "tag", tag: i });
      (t.ereignisse || []).forEach(function (e) {
        if (!e.titel.trim()) l.push({ art: "warnung", text: n + ": Ein Ereignis hat keinen Titel.", ziel: "tag", tag: i });
      });
    });
    if (stationen(reise).length < 2 && z.tage > 1) l.push({ art: "hinweis", text: "Für die Karte braucht es mindestens zwei Orte mit Position.", ziel: "karte" });
    return l;
  }

  var api = {
    FORMAT: FORMAT, VERSION: VERSION, STAMM: STAMM,
    jetzt: jetzt, neueId: neueId, istDatum: istDatum, istZeit: istZeit, datumPlus: datumPlus, tageZwischen: tageZwischen,
    datumsliste: datumsliste, wochentag: wochentag, datumText: datumText, zeitraumText: zeitraumText,
    ortLeer: ortLeer, hatKoordinaten: hatKoordinaten, koordinatenLesen: koordinatenLesen,
    neueReise: neueReise, neuerTag: neuerTag, neuesEreignis: neuesEreignis, tageAnpassen: tageAnpassen, tagHatInhalt: tagHatInhalt,
    ereignisseSortiert: ereignisseSortiert, pruefen: pruefen, istMediendatei: istMediendatei, istVideodatei: istVideodatei, alleFotos: alleFotos,
    bearbeitungSauber: bearbeitungSauber, bearbeitungIstStandard: bearbeitungIstStandard,
    mediendateien: mediendateien, stationen: stationen, zahlen: zahlen, pruefliste: pruefliste
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  wurzel.ImagicruiseModell = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
