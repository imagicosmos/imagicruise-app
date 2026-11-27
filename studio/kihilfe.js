// Imagicruise – KI-Hilfe ohne eigenen Server (Browser und Node). Idee aus Imagiclique; Kopieren, Teilen, Einfügen und
// das Lesen der Antwort seit 18.11.2026 im gemeinsamen Baustein „ki“ (bausteine/ki-kern.js, window.ImagicosmosKi).
//
// Imagicruise schickt selbst nichts an eine KI. Dieser Baustein baut nur eine Frage aus den Angaben eines Ereignisses
// oder Tages; der Nutzer kopiert oder teilt sie in seine KI-App und fügt die Antwort wieder ein. Die Antwort wird hier
// gelesen (JSON, auch mit Text oder Code-Rahmen drumherum) und als Vorschlag gezeigt – übernommen wird nur auf Knopfdruck.
(function (wurzel) {
  "use strict";
  var KI = wurzel.ImagicosmosKi || (typeof require === "function" ? require("./bausteine/ki-kern.js") : null);
  // [Kennung, Name im Studio, Anweisung in der Frage]
  var AUFGABEN = [
    ["verbessern", "Text verbessern", "Verbessere den vorhandenen Text: Rechtschreibung, Satzbau und Lesefluss. Inhalt, Länge und Ton bleiben."],
    ["ausformulieren", "Aus Stichpunkten schreiben", "Schreibe aus den Stichpunkten und Angaben einen flüssigen Text von 3 bis 6 Sätzen."],
    ["kuerzen", "Kürzen", "Kürze den vorhandenen Text auf das Wesentliche, höchstens halb so lang."],
    ["lebendig", "Lebendiger erzählen", "Erzähle den vorhandenen Text lebendiger und persönlicher, etwa gleich lang."]
  ];
  function zeile(name, wert) { wert = String(wert == null ? "" : wert).trim(); return wert ? name + ": " + wert + "\n" : ""; }

  // k: { was: "ereignis" | "tag", reise, reiseart, datum, ort, titel, art, zeit, text, ereignisse: [{ zeit, titel, text }] }
  function frage(k, aufgabe, wunsch) {
    var a = AUFGABEN.filter(function (x) { return x[0] === aufgabe; })[0] || AUFGABEN[0], tag = k.was === "tag";
    var s = "Du hilfst mir bei einem privaten Reisebericht. Es geht um " + (tag ? "die Zusammenfassung eines Reisetages" : "ein einzelnes Erlebnis der Reise") + ".\n\n" +
      "Aufgabe: " + a[2] + "\n" + (String(wunsch || "").trim() ? "Mein Wunsch dazu: " + String(wunsch).trim() + "\n" : "") + "\n" +
      "Regeln:\n" +
      "- Schreibe auf Deutsch, in der Wir-Form, natürlich und ohne Werbesprache.\n" +
      "- Erfinde nichts dazu. Benutze nur, was unten steht.\n" +
      "- Schlage zusätzlich eine kurze Überschrift vor (höchstens 6 Wörter).\n" +
      "- Reiner Text ohne Formatierung. Absätze durch eine Leerzeile.\n" +
      "- Nenne unter \"pruefen\" alles, was ich nachprüfen sollte (zum Beispiel Jahreszahlen oder Namen), sonst eine leere Liste.\n" +
      "- Antworte nur mit JSON in genau dieser Form, ohne weiteren Text:\n" +
      "{\"titel\": \"…\", \"text\": \"…\", \"pruefen\": [\"…\"]}\n\n" +
      "Angaben:\n" + zeile("Reise", k.reise) + zeile("Art der Reise", k.reiseart) + zeile("Datum", k.datum) + zeile("Ort", k.ort) +
      (tag ? zeile("Bisherige Überschrift des Tages", k.titel) : zeile("Art des Erlebnisses", k.art) + zeile("Bisheriger Titel", k.titel) + zeile("Uhrzeit", k.zeit));
    if (tag && k.ereignisse && k.ereignisse.length) {
      s += "Erlebnisse des Tages:\n" + k.ereignisse.map(function (e) {
        return "- " + [e.zeit, e.titel || "ohne Titel"].filter(Boolean).join(" ") + (String(e.text || "").trim() ? ": " + String(e.text).trim().replace(/\s+/g, " ").slice(0, 600) : "");
      }).join("\n") + "\n";
    }
    s += "\n" + (String(k.text || "").trim() ? "Vorhandener Text bzw. Stichpunkte:\n" + String(k.text).trim() : "Es gibt noch keinen Text. Schreibe aus den Angaben oben einen kurzen Entwurf von 2 bis 4 Sätzen.") + "\n";
    return s;
  }

  // Antwort der KI → { titel, text, pruefen: [] } oder null. Das Lesen (JSON finden, auch mit Text, Code-Rahmen,
  // typografischen Anführungszeichen oder echten Zeilenumbrüchen) macht der Baustein „ki“ (bausteine/ki-kern.js).
  function lesen(antwort) {
    var o = KI.objekt(antwort);
    if (!o) return null;
    var text = function (v, max) { return typeof v === "string" ? KI.text(v, max) : ""; };
    var erg = { titel: text(o.titel, 120).replace(/\s+/g, " "), text: text(o.text, 6000), pruefen: KI.liste(o.pruefen, 300, 8) };
    return erg.titel || erg.text ? erg : null;
  }

  var api = { AUFGABEN: AUFGABEN, frage: frage, lesen: lesen };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  wurzel.ImagicruiseKiHilfe = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
