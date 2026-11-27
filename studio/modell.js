// Imagicruise – Datenmodell einer Reise (Browser und Node). Beschreibung: docs/DATENFORMAT.md
//
// Eine Reise hat Tage (je Kalendertag einer), ein Tag hat Ereignisse. Alles, was sich ändert, bekommt einen
// Zeitstempel "geaendert" – daran erkennt der Abgleich zwischen PC und Handy, welcher Stand neuer ist.
(function (wurzel) {
  "use strict";

  var FORMAT = "imagicruise-reise", VERSION = 1;
  var STAMM = ["titel", "untertitel", "art", "von", "bis", "reisende", "einleitung", "schluss", "titelbild", "waehrung"];   // waehrung: seit 27.11.2026 (Ausgaben je Tag)
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
      (tag.art && tag.art !== "normal") || typeof tag.kosten === "number");
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
      if (t.status != null) { t.status = statusSauber(t.status); if (!t.status) delete t.status; }
      if (typeof t.geplant !== "boolean") delete t.geplant;   // Reiseplan Stufe 2 (Auftrag 42): ganze Tage
      if (t.kosten != null) { var k = Math.round(+t.kosten * 100) / 100; if (isFinite(k) && k >= 0 && k < 1e9) t.kosten = k; else delete t.kosten; }
      t.ereignisse = (Array.isArray(t.ereignisse) ? t.ereignisse : []).filter(function (e) { return e && typeof e === "object"; }).map(function (e) {
        if (typeof e.id !== "string" || !e.id) e.id = neueId("e");
        e.art = text(e.art) || "sonstiges"; e.titel = text(e.titel); e.text = text(e.text);
        e.zeit = istZeit(e.zeit) ? e.zeit : ""; e.ende = istZeit(e.ende) ? e.ende : "";
        e.ort = ort(e.ort); e.geaendert = text(e.geaendert);
        anreiseSauber(e);
        if (typeof e.geplant !== "boolean") delete e.geplant;
        if (e.status != null) { e.status = statusSauber(e.status); if (!e.status) delete e.status; }
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

  // Gemerkte Anordnung von „Als Status teilen“ (seit 27.11.2026, Auftrag 42, freiwillig) → saubere Kopie oder null.
  // { vorlage, fotos: [Name], aus: { Name: { fx, fy (0…100), zoom } }, lagen: { Vorlage: { Name|titel|text: { x, y, s, r, z? } } }, sticker: [{ a, x, y, g, r }] }
  function statusSauber(s) {
    if (!s || typeof s !== "object" || Array.isArray(s)) return null;
    var zahl = function (v, a, b) { v = +v; return isFinite(v) ? Math.min(b, Math.max(a, Math.round(v * 10000) / 10000)) : 0; };
    var obj = function (o) { return o && typeof o === "object" && !Array.isArray(o) ? o : {}; };
    var name = function (k) { return istMediendatei(k); };
    var erg = { vorlage: typeof s.vorlage === "string" && /^[a-z]{2,20}$/.test(s.vorlage) ? s.vorlage : "", fotos: [], aus: {}, lagen: {}, sticker: [] };
    (Array.isArray(s.fotos) ? s.fotos : []).forEach(function (k) { if (name(k) && erg.fotos.indexOf(k) < 0 && erg.fotos.length < 12) erg.fotos.push(k); });
    var a = obj(s.aus);
    Object.keys(a).slice(0, 50).forEach(function (k) {
      var x = obj(a[k]); if (name(k)) erg.aus[k] = { fx: x.fx == null ? 50 : zahl(x.fx, 0, 100), fy: x.fy == null ? 50 : zahl(x.fy, 0, 100), zoom: zahl(x.zoom, 1, 8) || 1 };
    });
    var l = obj(s.lagen);
    Object.keys(l).slice(0, 20).forEach(function (v) {
      if (!/^[a-z]{2,20}$/.test(v)) return;
      var m = {}, q = obj(l[v]);
      Object.keys(q).slice(0, 50).forEach(function (k) {
        if (!(name(k) || k === "titel" || k === "text")) return;
        var x = obj(q[k]);
        m[k] = { x: zahl(x.x, -1, 2), y: zahl(x.y, -1, 2), s: zahl(x.s, 0, 4), r: zahl(x.r, -360, 360) };
        if (typeof x.z === "number") m[k].z = Math.round(zahl(x.z, -1000, 1000));
      });
      if (Object.keys(m).length) erg.lagen[v] = m;
    });
    (Array.isArray(s.sticker) ? s.sticker : []).slice(0, 20).forEach(function (x) {
      x = obj(x); if (typeof x.a !== "string" || !/^[a-z0-9-]{1,40}$/.test(x.a)) return;
      erg.sticker.push({ a: x.a, x: zahl(x.x, -2000, 4000), y: zahl(x.y, -2000, 4000), g: zahl(x.g, 10, 4000), r: zahl(x.r, -360, 360) });
    });
    return erg;
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
      fil: BILDFILTER.indexOf(e.fil) >= 0 ? e.fil : "none",
      // seit 27.11.2026 (Auftrag 42, Baustein bildbearbeitung 1.1.0): Begradigen in halben Grad, Wärme, Vignette
      str: Math.min(15, Math.max(-15, Math.round((+e.str || 0) * 2) / 2)), wrm: zahl(e.wrm, -100, 100), vig: zahl(e.vig, 0, 100) };
  }
  function bearbeitungIstStandard(e) {
    return !e || (!e.rot && !e.flip && !e.auto && !e.bri && !e.con && !e.sat && e.fil === "none" && !e.str && !e.wrm && !e.vig &&
      e.crop[0] < .001 && e.crop[1] < .001 && e.crop[2] > .999 && e.crop[3] > .999);
  }

  // Reiseplan (freiwillig, seit 25.11.2026): geplante Ereignisse (geplant: true) stehen nicht im Reisebericht und nicht auf der Karte.
  // geplant: false heißt: war geplant, ist abgehakt – ein gewöhnliches Ereignis, dem weitere Aufnahmen vorgeschlagen werden.
  function erlebt(ereignisse) { return (ereignisse || []).filter(function (e) { return !e.geplant; }); }
  // Seit 27.11.2026 (Auftrag 42) auch ganze Tage: Überschrift, Art, Ort, Text eines geplanten Tages (geplant: true) gelten erst nach dem Abhaken.
  function tagGeplant(t) { return !!t && t.geplant === true; }
  function ohneGeplante(reise) {
    var r = Object.assign({}, reise, { tage: (reise.tage || []).map(function (t) {
      var o = Object.assign({}, t, { ereignisse: erlebt(t.ereignisse) });
      if (tagGeplant(t)) { o.titel = ""; o.text = ""; o.art = "normal"; o.ort = { name: "", lat: null, lon: null }; delete o.anreise; delete o.status; }
      return o;
    }) });
    // Titelbild nur aus einem geplanten Ereignis: gilt erst nach dem Abhaken
    var hat = function (x) { return alleFotos(x).some(function (f) { return f.foto.datei === reise.titelbild; }); };
    if (reise.titelbild && hat(reise) && !hat(r)) r.titelbild = "";
    return r;
  }
  // Kilometer je Tag (Auftrag 42): Strecke entlang der Stationen der Karte (Luftlinie), gezählt beim Tag, an dem sie ankommt
  function kilometerJeTag(reise) {
    var st = stationen(reise), km = (reise.tage || []).map(function () { return 0; });
    for (var i = 1; i < st.length; i++) if (st[i].tag in km) km[st[i].tag] += kilometer(st[i - 1], st[i]);
    return km.map(function (k) { return Math.round(k); });
  }
  // Ausgaben (Auftrag 42): Betrag je Tag in tage[].kosten, Währung der Reise in waehrung (leer = €)
  function ausgaben(reise) {
    var s = 0, n = 0;
    (reise.tage || []).forEach(function (t) { if (typeof t.kosten === "number" && !tagGeplant(t)) { s += t.kosten; n++; } });   // Geplantes zählt erst nach dem Abhaken
    return { summe: Math.round(s * 100) / 100, tage: n, waehrung: (reise.waehrung || "").trim() || "€" };
  }
  function betragText(b) {
    if (typeof b !== "number" || !isFinite(b)) return "";
    var ganz = Math.round(b * 100) % 100 === 0, t = ganz ? String(Math.round(b)) : b.toFixed(2);
    var teile = t.split("."); teile[0] = teile[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return teile.join(",");
  }
  // „45,50“, „1.234,5“, „12.5“ → Zahl; leer → null; Unsinn → NaN
  function betragLesen(t) {
    t = String(t == null ? "" : t);
    if (/\d\s*[eE]\s*\d/.test(t)) return NaN;   // „1e3“ ist kein Betrag
    t = t.replace(/[^0-9.,-]/g, "");
    if (!t) return null;
    var k = t.lastIndexOf(","), p = t.lastIndexOf(".");
    if (k >= 0 && p >= 0) t = k > p ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");   // das hintere Zeichen trennt die Cents
    else if (k >= 0) t = t.replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
    var z = +t;
    return isFinite(z) && z >= 0 ? Math.round(z * 100) / 100 : NaN;
  }
  function minuten(zeit) { return istZeit(zeit) ? +zeit.slice(0, 2) * 60 + +zeit.slice(3, 5) : null; }
  function kilometer(a, b) {
    var r = Math.PI / 180, h = Math.pow(Math.sin((b.lat - a.lat) * r / 2), 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.pow(Math.sin((b.lon - a.lon) * r / 2), 2);
    return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  // Welches geplante (oder einmal geplante) Ereignis des Tages passt zu dieser Fotogruppe (fotos.js: gruppieren)? Liegt beides vor, muss der Ort stimmen
  // (1 km) und die Uhrzeit ungefähr (3 Stunden Verspätung oder Vorsprung); ohne Ort muss die Uhrzeit genauer stimmen (1 Stunde).
  // Ein Ort allein genügt nur, wenn die Uhrzeit auf einer Seite fehlt. Ergebnis: Ereignis oder null
  function geplantPassend(tag, gruppe) {
    if (!tag || !gruppe || (gruppe.datum && gruppe.datum !== tag.datum)) return null;
    var bestes = null, wert = Infinity, gv = minuten(gruppe.zeit), gb = minuten(gruppe.ende);
    if (gb == null) gb = gv;
    ereignisseSortiert(tag).forEach(function (e) {
      if (typeof e.geplant !== "boolean") return;
      var von = minuten(e.zeit), bis = minuten(e.ende), abstand = null, km = null;
      if (bis == null || (von != null && bis < von)) bis = von;
      if (von != null && gv != null) abstand = Math.max(0, von - gb, gv - bis);
      if (hatKoordinaten(e.ort) && hatKoordinaten(gruppe)) km = kilometer(e.ort, gruppe);
      if (km == null && abstand == null) return;
      if (km != null ? km > 1 || (abstand != null && abstand > 180) : abstand > 60) return;
      var w = (abstand || 0) + (km != null ? km * 60 : 120);
      if (w < wert) { wert = w; bestes = e; }
    });
    return bestes;
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
      if (!tagGeplant(t) && hatKoordinaten(t.ort)) punkte.push({ lat: t.ort.lat, lon: t.ort.lon, name: t.ort.name || t.titel, tag: ti, datum: t.datum, art: "tag", anreise: t.anreise || "" });
      erlebt(ereignisseSortiert(t)).forEach(function (e) {
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
    (reise.tage || []).forEach(function (t, i) {
      if (tagGeplant(t)) l.push({ art: "hinweis", text: "Tag " + (i + 1) + " (" + datumText(t.datum, true) + ") ist noch geplant: Überschrift, Ort und Text stehen erst nach dem Abhaken im Reisebericht.", ziel: "tag", tag: i });
      var g = (t.ereignisse || []).length - erlebt(t.ereignisse).length;
      if (g) l.push({ art: "hinweis", text: "Tag " + (i + 1) + " (" + datumText(t.datum, true) + "): " + (g === 1 ? "1 Ereignis ist" : g + " Ereignisse sind") + " noch geplant und " + (g === 1 ? "steht" : "stehen") + " nicht im Reisebericht.", ziel: "tag", tag: i });
    });
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
    erlebt: erlebt, ohneGeplante: ohneGeplante, geplantPassend: geplantPassend, statusSauber: statusSauber, tagGeplant: tagGeplant,
    kilometerJeTag: kilometerJeTag, ausgaben: ausgaben, betragText: betragText, betragLesen: betragLesen,
    mediendateien: mediendateien, stationen: stationen, zahlen: zahlen, pruefliste: pruefliste
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  wurzel.ImagicruiseModell = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
