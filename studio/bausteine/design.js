// Baustein „design“ – gemeinsame Bedienteile: Meldung unten, Rückfrage und Ladeanzeige, gleich in allen Apps von Imagicosmos.
// Quelle: Repo imagicosmos/bausteine, design/design.js. In den Apps eine Kopie: NICHT VON HAND ÄNDERN.
// Das Aussehen steht in design.css (Klassen ds-meldung, ds-frage, ds-arbeit, ds-knopf). Im Browser: window.ImagicosmosDesign.
//
//   ImagicosmosDesign.melden("Gespeichert");                     // kurze Meldung unten
//   ImagicosmosDesign.melden("Das hat nicht geklappt.", "fehler"); // rot, bleibt länger; "ok" = grün
//   const ja = await ImagicosmosDesign.fragen("Die 3 Fotos löschen?", { ja: "Löschen", gefahr: true });
//   const name = await ImagicosmosDesign.fragen("Name der Reise?", { ja: "Anlegen", eingabe: "z. B. Rom", wert: "" }); // Text oder null
//   ImagicosmosDesign.arbeit("Fotos werden vorbereitet …", 3, 20);   // Ladeanzeige (ohne Zahlen nur der Kreisel)
//   ImagicosmosDesign.arbeitEnde();
//
// Die Rechenteile (Dauer, Fortschritt, Knopf-Klassen) laufen auch unter Node.js (Tests). Ohne fremden Code.
(function (wurzel) {
  "use strict";

  var VERSION = "1.1.1";
  var HOECHSTENS = 3;   // Meldungen übereinander

  // --- Rechenteile (auch unter Node.js) ----------------------------------------------------------------

  // Wie lange eine Meldung stehen bleibt (ms): Fehler länger, lange Texte etwas länger. dauer: eigene Angabe der App.
  function meldungDauer(text, art, dauer) {
    if (dauer > 0) return dauer;
    var grund = art === "fehler" ? 8000 : 3500;
    return Math.min(grund + Math.max(0, String(text || "").length - 60) * 40, 12000);
  }

  // Balken der Ladeanzeige: null (nur Kreisel) oder { wert, max } – nie mehr als max, nie weniger als 0
  function fortschritt(erledigt, gesamt) {
    gesamt = Number(gesamt);
    if (!(gesamt > 0)) return null;
    var w = Math.max(0, Math.min(Number(erledigt) || 0, gesamt));
    return { wert: w, max: gesamt };
  }

  // Klassen eines Knopfs: knopfKlasse({ zweit, gefahr, klein, voll }) → "ds-knopf ds-zweit …"
  function knopfKlasse(o) {
    o = o || {};
    return ["ds-knopf"].concat(["zweit", "gefahr", "klein", "voll"].filter(function (k) { return o[k]; }).map(function (k) { return "ds-" + k; })).join(" ");
  }

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  // HTML der Rückfrage (auch für die Tests unter Node)
  function frageHtml(text, o) {
    o = o || {};
    return '<form method="dialog">' +
      (o.titel ? '<h2 id="ds-frage-titel">' + esc(o.titel) + "</h2>" : "") +
      '<p id="ds-frage-text">' + esc(text) + "</p>" +
      (o.eingabe != null ? '<input type="text" id="ds-frage-eingabe" autocomplete="off" placeholder="' + esc(o.eingabe) + '" value="' + esc(o.wert || "") + '">' : "") +
      '<div class="ds-knoepfe">' +
      (o.nein === false ? "" : '<button type="button" class="ds-knopf ds-zweit" id="ds-frage-nein" value="nein">' + esc(o.nein || "Abbrechen") + "</button>") +
      '<button type="submit" class="' + knopfKlasse({ gefahr: o.gefahr }) + '" id="ds-frage-ja" value="ja">' + esc(o.ja || "OK") + "</button>" +
      "</div></form>";
  }

  // --- Im Browser --------------------------------------------------------------------------------------

  var d = wurzel.document;

  // in die oberste Ebene des Browsers holen (über offene Fenster); ältere Browser: bleibt ein normales Element mit z-index
  function nachOben(el) {
    if (!el.showPopover) return;
    try { if (el.matches(":popover-open")) el.hidePopover(); el.showPopover(); } catch (e) { /* dann eben ohne */ }
  }
  function nachUnten(el) { if (el.hidePopover) { try { el.hidePopover(); } catch (e) { /* war schon zu */ } } }

  function element(id, tag, klasse, html) {
    var el = d.getElementById(id);
    if (el) return el;
    el = d.createElement(tag); el.id = id; el.className = klasse;
    if (html) el.innerHTML = html;
    d.body.appendChild(el);
    return el;
  }

  // Meldung unten. art: "fehler" (rot), "ok" (grün) oder leer. Gibt das Element der Meldung zurück.
  function melden(text, art, dauer) {
    var feld = element("ds-meldungen", "div", "ds-meldungen");
    if (!feld.hasAttribute("popover")) { feld.setAttribute("popover", "manual"); feld.setAttribute("aria-live", "polite"); }
    var m = d.createElement("div");
    m.className = "ds-meldung" + (art === "fehler" ? " ds-fehler" : art === "ok" ? " ds-ok" : "");
    m.setAttribute("role", art === "fehler" ? "alert" : "status");
    m.textContent = text;
    feld.appendChild(m);
    while (feld.children.length > HOECHSTENS) feld.removeChild(feld.firstChild);
    nachOben(feld);
    setTimeout(function () {
      if (m.parentNode) m.parentNode.removeChild(m);
      if (!feld.children.length) nachUnten(feld);
    }, meldungDauer(text, art, dauer));
    return m;
  }

  // Rückfrage als Fenster. o: { ja: "Löschen", nein: "Abbrechen" (false = kein zweiter Knopf), gefahr, titel, eingabe: Platzhalter,
  // wert }. Ergebnis (Promise): true/false; mit eingabe der Text (getrimmt nicht, wie eingegeben) oder null.
  // Eine neue Rückfrage beendet eine noch offene mit „nein“.
  var offeneFrage = null;
  function fragen(text, o) {
    o = o || {};
    var dlg = element("ds-frage", "dialog", "ds-frage");
    if (offeneFrage) offeneFrage(false);
    dlg.innerHTML = frageHtml(text, o);
    dlg.setAttribute("aria-labelledby", o.titel ? "ds-frage-titel" : "ds-frage-text");
    if (!dlg.showModal) {   // sehr alte Browser: einfache Fenster
      var a = o.eingabe != null ? wurzel.prompt(text, o.wert || "") : wurzel.confirm(text);
      return Promise.resolve(o.eingabe != null ? a : !!a);
    }
    return new Promise(function (ok) {
      var fertig = false;
      function ende(ja) {
        if (fertig) return; fertig = true; offeneFrage = null;
        var feld = d.getElementById("ds-frage-eingabe");
        var wert = feld ? feld.value : null;
        dlg.onclose = null;
        if (dlg.open) dlg.close();
        ok(o.eingabe != null ? (ja ? wert : null) : ja);
      }
      offeneFrage = ende;
      dlg.returnValue = "nein";
      var nein = d.getElementById("ds-frage-nein");
      if (nein) nein.onclick = function () { ende(false); };
      dlg.querySelector("form").onsubmit = function (e) { e.preventDefault(); ende(true); };
      // Zurück-Taste / Esc. Das Ereignis „close“ kommt verspätet an: Ist das Fenster schon wieder offen (nächste Rückfrage),
      // gehört es zur vorigen und wird übergangen.
      dlg.onclose = function () { if (!dlg.open) ende(dlg.returnValue === "ja"); };
      if (dlg.open) dlg.close();
      dlg.showModal();
      var feld = d.getElementById("ds-frage-eingabe");
      // Fokus: ins Eingabefeld; bei Gefahr (Löschen) auf „Abbrechen“, damit Enter nichts löscht; sonst auf den Knopf „ja“
      if (feld) { feld.focus(); feld.select(); } else ((o.gefahr && nein) || d.getElementById("ds-frage-ja")).focus();
    });
  }

  // Ladeanzeige: arbeit(text) nur mit Kreisel, arbeit(text, erledigt, gesamt) mit Balken. Mehrmals aufrufen = Text erneuern.
  function arbeit(text, erledigt, gesamt) {
    var el = element("ds-arbeit", "div", "ds-arbeit",
      '<div><div class="ds-kreisel" aria-hidden="true"></div><p id="ds-arbeit-text"></p><progress id="ds-arbeit-balken" max="1" value="0"></progress></div>');
    el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
    d.getElementById("ds-arbeit-text").textContent = text || "Bitte warten …";
    var b = d.getElementById("ds-arbeit-balken"), f = fortschritt(erledigt, gesamt);
    if (f) { b.hidden = false; b.max = f.max; b.value = f.wert; } else b.hidden = true;
    var neu = el.hidden || !el.hasAttribute("data-an");
    el.hidden = false; el.setAttribute("data-an", "");
    if (el.showPopover) {
      if (!el.hasAttribute("popover")) el.setAttribute("popover", "manual");
      if (neu || !el.matches(":popover-open")) nachOben(el);
    }
  }
  function arbeitEnde() {
    var el = d && d.getElementById("ds-arbeit");
    if (!el) return;
    el.removeAttribute("data-an"); el.hidden = true; nachUnten(el);
  }
  function arbeitLaeuft() { var el = d && d.getElementById("ds-arbeit"); return !!(el && el.hasAttribute("data-an")); }

  var api = {
    VERSION: VERSION,
    melden: melden, fragen: fragen, arbeit: arbeit, arbeitEnde: arbeitEnde, arbeitLaeuft: arbeitLaeuft,
    meldungDauer: meldungDauer, fortschritt: fortschritt, knopfKlasse: knopfKlasse, frageHtml: frageHtml,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  wurzel.ImagicosmosDesign = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
