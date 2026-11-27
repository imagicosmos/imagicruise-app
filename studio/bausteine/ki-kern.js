// Baustein „ki“ – kleiner Kern für die KI-Hilfe ohne eigenen Server: Auftrag kopieren oder an eine KI-App teilen,
// Antwort aus der Zwischenablage holen und robust lesen (JSON, auch mit Text, Code-Rahmen, typografischen
// Anführungszeichen oder echten Zeilenumbrüchen drumherum). Seit 1.1.0 auch: Antwort per „Teilen“ aus der KI-App annehmen
// (geteiltLesen) und sich bis dahin merken, wofür die Frage war (auftragMerken, offenerAuftrag).
//
// Die App schickt selbst nichts an eine KI: Der Nutzer gibt den Auftrag in seine KI-App und bringt die Antwort zurück.
// Was gefragt wird, baut jede App selbst (das ist je App ganz anders); übernommen wird nur auf Knopfdruck.
//
// Zusammengeführt am 17.11.2026 aus Imagiclique (app/index.html: aiJson, Kopieren, Teilen, Einfügen),
// Imagicruise (studio/kihilfe.js: lesen, zeilenRetten) und Imagichron (studio/ki.js: jsonFinden, Code-Rahmen, Komma am Ende).
// Im Browser: window.ImagicosmosKi. Unter Node (Tests): require(), dort gehen die Teile ohne Zwischenablage.
(function (wurzel) {
  "use strict";
  var VERSION = "1.1.0";
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

  // ---------- Antwort per Teilen zurück (seit 1.1.0) ----------
  // Der Nutzer kann die Antwort in der KI-App über „Teilen“ an die App schicken, statt sie zu kopieren. Bis sie ankommt,
  // kann das Handy die App neu gestartet haben: deshalb merkt sich die App beim Kopieren oder Teilen, wofür die Frage war.
  var SCHLUESSEL = "imagicosmos.ki.auftrag";
  var NUR_LINK = "Die KI-App hat nur einen Link zum Chat geteilt, nicht die Antwort. Bitte in der KI-App die Antwort selbst lange antippen und „Kopieren“ oder „Teilen“ wählen.";
  // Betreff, den KI-Apps beim Teilen mitschicken, bzw. was von einem geteilten Chat-Link übrig bleibt
  var KI_NAMEN = /^(?:chatgpt|claude|gemini|google gemini|copilot|microsoft copilot|perplexity|mistral|le chat|deepseek|grok)$/i;
  var LEER = "Es ist kein Text angekommen. Bitte die Antwort in der KI-App kopieren und hier einfügen.";
  // Links, die KI-Apps über ihren Teilen-Knopf verschicken (nur ein Verweis auf den Chat, nicht die Antwort)
  var CHAT_LINKS = /^https?:\/\/(?:www\.)?(?:chatgpt\.com\/(?:share|s|c)\/|chat\.openai\.com\/(?:share|c)\/|claude\.ai\/(?:share|chat)\/|g\.co\/gemini\/share\/|gemini\.google\.com\/(?:share|app)\/|copilot\.microsoft\.com\/(?:shares|chats)\/|(?:www\.)?perplexity\.ai\/search\/|chat\.mistral\.ai\/chat\/|chat\.deepseek\.com\/(?:share|a\/chat)\/|grok\.com\/(?:share|chat)\/|x\.com\/i\/grok\/share\/)/i;

  function speicherVon(o) {
    if (o && o.speicher) return o.speicher;
    try { return wurzel.localStorage || null; } catch (e) { return null; }
  }
  function schluesselVon(o) { return (o && o.schluessel) || SCHLUESSEL; }
  function jetztVon(o) { return o && typeof o.jetzt === "number" ? o.jetzt : Date.now(); }
  // merkt sich, wofür die Frage war (daten = beliebige Angaben der App, z. B. { wer: "e", tag: "…", aufgabe: "…" }) → true/false
  // o = { schluessel (Apps auf derselben Adresse: eigenen nehmen), speicher (statt localStorage), jetzt (Zeit in ms) }
  function auftragMerken(daten, o) {
    var sp = speicherVon(o);
    if (!sp) return false;
    try { sp.setItem(schluesselVon(o), JSON.stringify({ zeit: jetztVon(o), daten: daten == null ? null : daten })); return true; } catch (e) { return false; }
  }
  // → die gemerkten Angaben, solange sie nicht älter als o.maxMinuten (60) sind, sonst null (ein zu alter Auftrag wird gelöscht)
  function offenerAuftrag(o) {
    var sp = speicherVon(o), roh = null;
    if (!sp) return null;
    try { roh = JSON.parse(sp.getItem(schluesselVon(o)) || "null"); } catch (e) { roh = null; }
    if (!roh || typeof roh.zeit !== "number") return null;
    var alter = jetztVon(o) - roh.zeit, max = ((o && o.maxMinuten) || 60) * 60000;
    if (alter < 0 || alter > max) { auftragErledigt(o); return null; }
    return roh.daten;
  }
  function auftragErledigt(o) {
    var sp = speicherVon(o);
    if (sp) try { sp.removeItem(schluesselVon(o)); } catch (e) { /* egal */ }
  }

  // nimmt, was eine KI-App geteilt hat: Text oder { titel|title, text, link|url } (Teilen-Ziel im Browser, Android-Hülle)
  // → { art: "antwort" | "link" | "leer", text, objekt (Antwort-Objekt wie objekt() oder null), link, meldung }
  function geteiltLesen(eingang) {
    var e = eingang == null ? {} : typeof eingang === "object" ? eingang : { text: eingang };
    var teile = [e.titel != null ? e.titel : e.title, e.text, e.link != null ? e.link : e.url]
      .map(function (x) { return x == null ? "" : String(x).replace(/\r/g, "").trim(); })
      .filter(function (x, i) { return x && !(i === 0 && KI_NAMEN.test(x)); });   // Betreff „ChatGPT“ o. Ä. weglassen
    // ein Teil, der schon in einem anderen steht (z. B. Betreff = Anfang des Textes), zählt nicht doppelt
    teile = teile.filter(function (t, i) { return !teile.some(function (u, j) { return j !== i && u.length > t.length && u.indexOf(t) >= 0; }) && teile.indexOf(t) === i; });
    var links = [], gesamt = teile.join("\n\n");
    gesamt.replace(/https?:\/\/[^\s<>"'„“”]+/g, function (l) { links.push(l.replace(/[.,;:!?)\]]+$/, "")); return l; });
    // Chat-Links entfernen, andere Links (z. B. Quellen in der Antwort) bleiben stehen
    var rest = gesamt.replace(/https?:\/\/[^\s<>"'„“”]+/g, function (l) { return CHAT_LINKS.test(l) ? "" : l; })
      .split("\n").map(function (z) { return z.replace(/\s+$/, ""); }).join("\n")
      .replace(/\n{3,}/g, "\n\n").trim();
    // was nach dem Entfernen nur noch aus Satzzeichen oder dem Namen der KI-App besteht, ist kein Text
    // ebenso ein kurzer Begleitsatz neben einem Chat-Link („Schau dir diesen Chat an“)
    var ohneLink = rest.replace(/https?:\/\/\S+/g, "").replace(/[\s\-–—:|·•]+/g, " ").trim();
    var mitChat = links.some(function (l) { return CHAT_LINKS.test(l); });
    if (!ohneLink || (mitChat && ohneLink.length < 80 && !jsonFinden(rest)) || KI_NAMEN.test(ohneLink)) {
      var chat = links.filter(function (l) { return CHAT_LINKS.test(l); })[0];
      if (links.length) return { art: "link", text: "", objekt: null, link: chat || links[0], meldung: NUR_LINK };
      return { art: "leer", text: "", objekt: null, link: "", meldung: LEER };
    }
    var t = rest.slice(0, 20000);
    return { art: "antwort", text: t, objekt: objekt(t), link: links.filter(function (l) { return CHAT_LINKS.test(l); })[0] || "", meldung: "" };
  }

  var api = {
    VERSION: VERSION, KEIN_ZUGRIFF: KEIN_ZUGRIFF,
    jsonFinden: jsonFinden, objekt: objekt, klein: klein, text: text, liste: liste, antwortForm: antwortForm, alsText: alsText,
    zeilenRetten: zeilenRetten,
    kannKopieren: kannKopieren, kannEinfuegen: kannEinfuegen, kannTeilen: kannTeilen, kopieren: kopieren, teilen: teilen, einfuegen: einfuegen,
    NUR_LINK: NUR_LINK, LEER: LEER, auftragMerken: auftragMerken, offenerAuftrag: offenerAuftrag, auftragErledigt: auftragErledigt,
    geteiltLesen: geteiltLesen, istChatLink: function (l) { return CHAT_LINKS.test(String(l || "")); }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  wurzel.ImagicosmosKi = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
