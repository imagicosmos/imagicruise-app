// Imagicruise – Abgleich zwischen zwei Ständen derselben Reise (PC und Handy), Browser und Node.
//
// Regel: Es gewinnt jeweils der neuere Stand – aber getrennt für die Angaben zur Reise, für jeden Tag und für
// jedes Ereignis. Wer am Handy Tag 3 schreibt und am PC Tag 1 verbessert, verliert also nichts.
// Gelöschte Ereignisse stehen mit Zeitpunkt in "geloescht", damit sie beim Abgleich nicht wiederkommen.
(function (wurzel) {
  "use strict";
  var M = wurzel.ImagicruiseModell || (typeof require !== "undefined" ? require("./modell.js") : null);

  function neuer(a, b) { return String(a || "") > String(b || ""); }   // ISO-Zeitstempel lassen sich als Text vergleichen
  function kopie(x) { return JSON.parse(JSON.stringify(x)); }

  // Ergebnis: { reise, bericht: { neu, geaendert, entfernt, tage, stamm } } – gezählt aus Sicht von "hier".
  function zusammenfuehren(hier, dort) {
    if (hier.id !== dort.id) throw new Error("Das sind zwei verschiedene Reisen.");
    var a = kopie(hier), b = kopie(dort), bericht = { neu: 0, geaendert: 0, entfernt: 0, tage: 0, stamm: false };

    // 1) Angaben zur Reise
    if (neuer(b.stamm_geaendert, a.stamm_geaendert)) {
      M.STAMM.forEach(function (k) { a[k] = b[k]; });
      a.stamm_geaendert = b.stamm_geaendert; bericht.stamm = true;
    }

    // 2) Gelöschtes: jeweils der spätere Zeitpunkt
    var weg = {};
    [a.geloescht || {}, b.geloescht || {}].forEach(function (g) {
      Object.keys(g).forEach(function (id) { if (neuer(g[id], weg[id])) weg[id] = g[id]; });
    });

    // 3) Alle Ereignisse beider Seiten einsammeln: je Kennung der neuere Stand, mit dem Tag, an dem er liegt
    var stand = {};
    var sammeln = function (reise, seite) {
      (reise.tage || []).forEach(function (t) {
        (t.ereignisse || []).forEach(function (e, i) {
          var s = stand[e.id];
          if (!s || neuer(e.geaendert, s.e.geaendert)) stand[e.id] = { e: e, datum: t.datum, seite: seite, platz: i, alt: s ? s.seite : null };
          else if (s) s.alt = s.alt || seite;
        });
      });
    };
    var hierIds = {};
    (a.tage || []).forEach(function (t) { (t.ereignisse || []).forEach(function (e) { hierIds[e.id] = e.geaendert; }); });
    sammeln(a, "hier"); sammeln(b, "dort");

    // 4) Tage: Angaben des Tages vom neueren Stand
    var tage = {};
    (a.tage || []).forEach(function (t) { tage[t.datum] = t; });
    (b.tage || []).forEach(function (t) {
      var m = tage[t.datum];
      if (!m) { tage[t.datum] = t; if (M.tagHatInhalt(t)) bericht.tage++; return; }
      if (neuer(t.geaendert, m.geaendert)) {
        ["titel", "art", "ort", "text", "anreise", "geaendert"].forEach(function (k) { if (k in t) m[k] = t[k]; else delete m[k]; });
        bericht.tage++;
      }
    });
    Object.keys(tage).forEach(function (d) { tage[d].ereignisse = []; });

    // 5) Ereignisse auf ihre Tage verteilen
    Object.keys(stand).sort(function (x, y) { return stand[x].platz - stand[y].platz; }).forEach(function (id) {
      var s = stand[id];
      if (weg[id] && !neuer(s.e.geaendert, weg[id])) { if (id in hierIds) bericht.entfernt++; return; }
      if (weg[id]) delete weg[id];   // nach dem Löschen noch einmal bearbeitet: Das Ereignis bleibt
      if (!tage[s.datum]) tage[s.datum] = M.neuerTag(s.datum);
      tage[s.datum].ereignisse.push(s.e);
      if (!(id in hierIds)) bericht.neu++;
      else if (s.seite === "dort" && s.e.geaendert !== hierIds[id]) bericht.geaendert++;
    });

    a.tage = Object.keys(tage).sort().map(function (d) { return tage[d]; });
    a.geloescht = weg;
    a.geaendert = neuer(b.geaendert, a.geaendert) ? b.geaendert : a.geaendert;
    M.tageAnpassen(a);
    return { reise: a, bericht: bericht };
  }

  function berichtText(b) {
    var teile = [];
    if (b.neu) teile.push(b.neu + (b.neu === 1 ? " neues Ereignis" : " neue Ereignisse"));
    if (b.geaendert) teile.push(b.geaendert + (b.geaendert === 1 ? " geändertes Ereignis" : " geänderte Ereignisse"));
    if (b.entfernt) teile.push(b.entfernt + (b.entfernt === 1 ? " gelöschtes Ereignis" : " gelöschte Ereignisse"));
    if (b.tage) teile.push(b.tage + (b.tage === 1 ? " geänderter Tag" : " geänderte Tage"));
    if (b.stamm) teile.push("neue Angaben zur Reise");
    return teile.length ? "Übernommen: " + teile.join(", ") + "." : "Beide Stände waren schon gleich.";
  }

  var api = { zusammenfuehren: zusammenfuehren, berichtText: berichtText };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  wurzel.ImagicruiseAbgleich = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
