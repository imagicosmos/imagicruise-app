// Baustein „ki“ – kleiner Kern für die KI-Hilfe ohne eigenen Server: Auftrag kopieren oder an eine KI-App teilen,
// Antwort aus der Zwischenablage holen und robust lesen (JSON, auch mit Text, Code-Rahmen, typografischen
// Anführungszeichen oder echten Zeilenumbrüchen drumherum).
//
// Die App schickt selbst nichts an eine KI: Der Nutzer gibt den Auftrag in seine KI-App und bringt die Antwort zurück.
// Was gefragt wird, baut jede App selbst (das ist je App ganz anders); übernommen wird nur auf Knopfdruck.
//
// Zusammengeführt am 17.11.2026 aus Imagiclique (app/index.html: aiJson, Kopieren, Teilen, Einfügen),
// Imagicruise (studio/kihilfe.js: lesen, zeilenRetten) und Imagichron (studio/ki.js: jsonFinden, Code-Rahmen, Komma am Ende).
// Im Browser: window.ImagicosmosKi. Unter Node (Tests): require(), dort gehen die Teile ohne Zwischenablage.
(function (wurzel) {
  "use strict";
  var VERSION = "1.0.0";
  var KEIN_ZUGRIFF = "Kein Zugriff auf die Zwischenablage. Bitte lange ins Feld drücken und „Einfügen“ wählen.";

  // ---------- Antwort lesen ----------
  // Echte Zeilenumbrüche und Tabulatoren innerhalb von Zeichenketten sind in JSON nicht erlaubt, kommen beim Kopieren
  // aus einer KI-App aber vor: in die erlaubte Schreibweise bringen.
  function zeilenRetten(s) {
    var aus = "", inText = false, flucht = false;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (inText && !flucht && (c === "\n" || c === "\r" || c === "\t")) { aus += c === "\n" ? "\\n" : c === "\t" ? "\\t" : ""; continue; }
      if (c === "\"" && !flucht) inText = !inText;
      flucht = inText && c === "\\" && !flucht;
      aus += c;
    }
    return aus;
  }
  function ausschnitt(t, auf, zu) { var a = t.indexOf(auf), b = t.lastIndexOf(zu); return a >= 0 && b > a ? t.slice(a, b + 1) : ""; }
  function versuchen(k) {
    var varianten = [k, zeilenRetten(k), zeilenRetten(k.replace(/[“”„]/g, "\"").replace(/,\s*([}\]])/g, "$1"))];
    for (var i = 0; i < varianten.length; i++) { try { return { ok: true, wert: JSON.parse(varianten[i]) }; } catch (e) { /* nächste Variante */ } }
    return { ok: false };
  }
  // findet das JSON in einer KI-Antwort → Objekt oder Liste, sonst null. art = "objekt" oder "liste" verlangt diese Form.
  function jsonFinden(text, art) {
    var t = String(text == null ? "" : text), kandidaten = [];
    var block = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
    if (block) kandidaten.push(block[1].trim());
    if (art !== "liste") kandidaten.push(ausschnitt(t, "{", "}"));
    if (art !== "objekt") kandidaten.push(ausschnitt(t, "[", "]"));
    for (var i = 0; i < kandidaten.length; i++) {
      if (!kandidaten[i]) continue;
      var r = versuchen(kandidaten[i]);
      if (!r.ok || !r.wert || typeof r.wert !== "object") continue;
      var liste = Array.isArray(r.wert);
      if ((art === "objekt" && liste) || (art === "liste" && !liste)) continue;
      return r.wert;
    }
    return null;
  }
  // Schlüssel in Kleinbuchstaben, Umlaute ausgeschrieben („Prüfen“ → „pruefen“), nur die oberste Ebene
  function schluessel(k) { return String(k).toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").trim(); }
  function klein(o) {
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    var aus = {};
    Object.keys(o).forEach(function (k) { aus[schluessel(k)] = o[k]; });
    return aus;
  }
  // das Antwort-Objekt mit einheitlichen Schlüsseln, sonst null
  function objekt(text) { return klein(jsonFinden(text, "objekt")); }
  // reiner Text aus einem Wert: ohne HTML-Marken, höchstens max Zeichen (Listen werden zu Zeilen)
  function text(v, max) {
    if (Array.isArray(v)) v = v.filter(function (x) { return x != null && x !== ""; }).join("\n");
    if (v == null || typeof v === "object") return "";
    return String(v).replace(/\r/g, "").replace(/<[^>]*>/g, "").trim().slice(0, max || 6000);
  }
  // Liste aus einem Wert (Liste oder einzelner Text) → bis zu anzahl Texte mit höchstens max Zeichen
  function liste(v, max, anzahl) {
    var roh = Array.isArray(v) ? v : (typeof v === "string" && v.trim() ? [v] : []);
    return roh.map(function (x) { return text(x, max || 300); }).filter(Boolean).slice(0, anzahl || 8);
  }
  // Schluss des Auftrags: verlangt genau diese JSON-Form
  function antwortForm(muster) {
    return "Antworte ausschließlich mit JSON in genau dieser Form, ohne Text davor oder danach:\n" +
      (typeof muster === "string" ? muster : JSON.stringify(muster));
  }
  // Antwort ohne die verlangte Form: als reiner Text (ohne Code-Rahmen)
  function alsText(roh, max) { return String(roh == null ? "" : roh).replace(/```[a-z]*/gi, "").replace(/\r/g, "").trim().slice(0, max || 6000); }

  // ---------- Kopieren, Teilen, Einfügen (nur im Browser) ----------
  function nav() { return wurzel.navigator || {}; }
  function kannKopieren() { var c = nav().clipboard; return !!(c && c.writeText); }
  function kannEinfuegen() { var c = nav().clipboard; return !!(c && c.readText); }
  function kannTeilen() { return typeof nav().share === "function"; }
  // → Promise mit true (kopiert) oder false (dann die Frage markieren und von Hand kopieren lassen)
  function kopieren(t) {
    if (!kannKopieren()) return Promise.resolve(false);
    return nav().clipboard.writeText(String(t)).then(function () { return true; }, function () { return false; });
  }
  // → Promise mit "geteilt", "abgebrochen" oder "fehler" (dann „Kopieren“ anbieten)
  // o = { dateien: [File] (z. B. ein Übersichtsbild), nativ: function (text) für eine eigene Brücke der Android-App }
  function teilen(t, o) {
    o = o || {};
    if (typeof o.nativ === "function") {
      try { o.nativ(String(t)); return Promise.resolve("geteilt"); } catch (e) { return Promise.resolve("fehler"); }
    }
    if (!kannTeilen()) return Promise.resolve("fehler");
    var daten = { text: String(t) };
    if (o.dateien && o.dateien.length) daten.files = o.dateien;
    try {
      return nav().share(daten).then(function () { return "geteilt"; }, function (e) { return e && e.name === "AbortError" ? "abgebrochen" : "fehler"; });
    } catch (e) { return Promise.resolve("fehler"); }
  }
  // → Promise mit dem Text der Zwischenablage; ohne Zugriff ein Fehler mit verständlicher Meldung (KEIN_ZUGRIFF)
  function einfuegen() {
    if (!kannEinfuegen()) return Promise.reject(new Error(KEIN_ZUGRIFF));
    return nav().clipboard.readText().then(function (t) { return String(t || ""); }, function () { throw new Error(KEIN_ZUGRIFF); });
  }

  var api = {
    VERSION: VERSION, KEIN_ZUGRIFF: KEIN_ZUGRIFF,
    jsonFinden: jsonFinden, objekt: objekt, klein: klein, text: text, liste: liste, antwortForm: antwortForm, alsText: alsText,
    zeilenRetten: zeilenRetten,
    kannKopieren: kannKopieren, kannEinfuegen: kannEinfuegen, kannTeilen: kannTeilen, kopieren: kopieren, teilen: teilen, einfuegen: einfuegen
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  wurzel.ImagicosmosKi = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
