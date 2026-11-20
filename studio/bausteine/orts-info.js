// Baustein „ortsinfo“ – Infos zum Ort aus der deutschsprachigen Wikipedia: Einträge in der Nähe einer Position oder
// zu einem Namen, kurz gefasst, mit Entfernung und Quelle.
//
// Datenschutz: Übertragen wird nur der Name ODER die Position – nie Fotos, Texte oder anderes. Ohne Absender-Adresse
// (kein Referrer) und ohne Cookies. Die App fragt nur auf Knopfdruck und sagt vorher, was übertragen wird.
// Die Texte der Wikipedia stehen unter CC BY-SA: Wer einen Auszug übernimmt, nennt die Quelle (alsText).
//
// Zusammengeführt am 17.11.2026 aus Imagiclique (app/index.html, „Infos zum Ort“) und Imagicruise (studio/ortsinfo.js).
// Im Browser: window.ImagicosmosOrtsInfo. Unter Node (Tests): require().
(function (wurzel) {
  "use strict";
  var VERSION = "1.0.0";
  var WIKI = "https://de.wikipedia.org/w/api.php?format=json&origin=*&action=query" +
    "&prop=coordinates%7Cdescription%7Cextracts&exintro=1&explaintext=1&exsentences=3&exlimit=10&colimit=10";
  var LIZENZ = "Texte: Wikipedia, Lizenz CC BY-SA.";
  var FEHLER = "Die Wikipedia ist gerade nicht erreichbar (braucht Internet).";

  function istPosition(was) { return !!was && typeof was.lat === "number" && typeof was.lon === "number" && isFinite(was.lat) && isFinite(was.lon); }
  function name(was) { return String((was && was.name) || "").replace(/\s+/g, " ").trim().slice(0, 120); }
  function zahl(v, std, min, max) { v = Math.round(+v); return isFinite(v) && v > 0 ? Math.min(max, Math.max(min, v)) : std; }

  // was: { name } oder { lat, lon } (der Name hat Vorrang); o = { radius (Meter, 1500), anzahl (8 in der Nähe, 5 beim Namen) }
  function adresse(was, o) {
    o = o || {};
    var n = name(was);
    if (!n && istPosition(was)) {
      return WIKI + "&generator=geosearch&ggsradius=" + zahl(o.radius, 1500, 10, 10000) + "&ggslimit=" + zahl(o.anzahl, 8, 1, 10) +
        "&ggscoord=" + was.lat.toFixed(5) + "%7C" + was.lon.toFixed(5);
    }
    return WIKI + "&generator=search&gsrlimit=" + zahl(o.anzahl, 5, 1, 10) + "&gsrsearch=" + encodeURIComponent(n);
  }
  // Abstand zweier Positionen in Metern (genau genug für einige Kilometer)
  function meter(a, b) {
    var r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos((a.lat + b.lat) / 2 * r), y = (b.lat - a.lat) * r;
    return Math.sqrt(x * x + y * y) * 6371000;
  }
  function entfernung(m) { return m < 950 ? Math.round(m / 10) * 10 + " m" : (m / 1000).toFixed(1).replace(".", ",") + " km"; }
  // kürzt auf ganze Sätze (max Zeichen)
  function kuerzen(t, max) {
    max = max || 420;
    t = String(t || "").replace(/\s+/g, " ").trim();
    if (t.length <= max) return t;
    var stueck = t.slice(0, max), ende = Math.max(stueck.lastIndexOf(". "), stueck.lastIndexOf("! "), stueck.lastIndexOf("? "));
    return ende > 80 ? stueck.slice(0, ende + 1) : stueck.replace(/\s+\S*$/, "") + " …";
  }
  // Antwort der Wikipedia → [{ titel, kurz, text, abstand (Meter oder null) }]; mit Position nach Nähe sortiert,
  // sonst in der Reihenfolge der Suche. o = { max (Zeichen je Text, 420) }
  function lesen(antwort, hier, o) {
    o = o || {};
    var seiten = (antwort && antwort.query && antwort.query.pages) || {}, mitOrt = istPosition(hier);
    var liste = Object.keys(seiten).map(function (k) {
      var p = seiten[k] || {}, c = p.coordinates && p.coordinates[0];
      return { titel: String(p.title || ""), kurz: String(p.description || ""), text: kuerzen(p.extract, o.max), nr: p.index || 0,
        abstand: mitOrt && c && typeof c.lat === "number" ? meter(hier, { lat: c.lat, lon: c.lon }) : null };
    }).filter(function (p) { return p.titel && p.text; });
    liste.sort(function (a, b) { return mitOrt ? (a.abstand == null ? 1e9 : a.abstand) - (b.abstand == null ? 1e9 : b.abstand) : a.nr - b.nr; });
    return liste.map(function (p) { return { titel: p.titel, kurz: p.kurz, text: p.text, abstand: p.abstand }; });
  }
  // fragt die Wikipedia → Promise mit der Liste (siehe lesen). Bei Fehlern eine verständliche Meldung (FEHLER).
  // o = { radius, anzahl, max, weiter (zweiter Versuch mit diesem Radius, wenn in der Nähe weniger als „mindestens“
  //       Einträge sind; 0 = kein zweiter Versuch), mindestens (3), abrufen (statt fetch, für Tests) }
  function suchen(was, o) {
    o = o || {};
    var abrufen = o.abrufen || (wurzel.fetch && wurzel.fetch.bind(wurzel));
    if (!name(was) && !istPosition(was)) return Promise.reject(new Error("Bitte einen Namen oder eine Position angeben."));
    var hier = name(was) ? null : was;
    function einmal(radius) {
      return Promise.resolve()
        .then(function () { return abrufen(adresse(was, { radius: radius, anzahl: o.anzahl }), { referrerPolicy: "no-referrer", credentials: "omit" }); })
        .then(function (r) { if (!r || !r.ok) throw new Error("HTTP " + (r && r.status)); return r.json(); })
        .then(function (antwort) { return lesen(antwort, hier, o); });
    }
    return einmal(o.radius).then(function (liste) {
      if (!hier || !o.weiter || liste.length >= (o.mindestens || 3)) return liste;
      return einmal(o.weiter);
    }).catch(function (e) {
      if (e && e.message === "Bitte einen Namen oder eine Position angeben.") throw e;
      var f = new Error(FEHLER); f.ursache = e; throw f;
    });
  }
  // So steht ein übernommener Auszug im Text (mit Quelle)
  function alsText(eintrag) { return eintrag.text + " (Quelle: Wikipedia, „" + eintrag.titel + "“)"; }
  // Hinweis vor dem ersten Nachschlagen: was übertragen wird
  function hinweis(was) {
    var n = name(was);
    return "„Infos zum Ort“ fragt die Wikipedia (de.wikipedia.org). Übertragen wird " +
      (n ? "nur der Name „" + n + "“" : "nur die Position") + ", keine Fotos und keine Texte.";
  }

  var api = {
    VERSION: VERSION, LIZENZ: LIZENZ, FEHLER: FEHLER,
    adresse: adresse, lesen: lesen, suchen: suchen, kuerzen: kuerzen, meter: meter, entfernung: entfernung,
    alsText: alsText, hinweis: hinweis
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  wurzel.ImagicosmosOrtsInfo = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
