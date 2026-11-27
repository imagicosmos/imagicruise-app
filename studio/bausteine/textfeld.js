// Baustein „textfeld“ – Textfelder mit Diktieren, Leeren (mit Rückgängig), Zeichenzähler und mitwachsender Höhe, gleich in
// allen Apps. Quelle: Repo imagicosmos/bausteine, textfeld/textfeld.js. In den Apps eine Kopie: NICHT VON HAND ÄNDERN.
//
// Die App liefert: Beschriftung, Platzhalter, eigene Knöpfe (z. B. „KI-Hilfe“), wohin der Text gespeichert wird (der Baustein
// meldet jede Änderung als „input“-Ereignis wie beim Tippen), Meldungen (melden) und Rückfragen (fragen) in ihrem Aussehen.
// Diktieren: im Browser über dessen Spracherkennung (weiter zuhören bis „Stopp“), in der Android-App über die Spracheingabe
// des Handys (angaben.android). Vor dem ersten Diktieren fragt der Baustein einmal, wer die Aufnahme verarbeitet.
// Die Rechenteile laufen auch unter Node.js (Tests). Ohne fremden Code.
(function (wurzel) {
  "use strict";

  var VERSION = "1.0.2";

  // --- Rechenteile (auch unter Node.js) ----------------------------------------------------------------

  // Gesprochenes in das Feld übernehmen. modus "ersetzen": das erste Stück ersetzt den Inhalt (Titel), danach wird angehängt.
  // Großer Anfangsbuchstabe, wenn das Feld leer ist oder der Text mit einem Satzzeichen endet.
  function zusammenfuegen(basis, neu, ersetzen) {
    neu = String(neu || "").trim();
    basis = ersetzen ? "" : String(basis || "").replace(/\s+$/, "");
    if (!neu) return basis;
    if (!basis || /[.!?…:]$/.test(basis)) neu = neu.charAt(0).toUpperCase() + neu.slice(1);
    return basis ? basis + " " + neu : neu;
  }

  // Zähler unter dem Feld: "182 / 300" (mit Grenze) oder "182 Zeichen"
  function zaehlerText(anzahl, max) { return max ? anzahl + " / " + max : anzahl + " Zeichen"; }
  // "" | "fast" (ab 90 %) | "zuviel"
  function zaehlerStufe(anzahl, max) {
    if (!max) return "";
    if (anzahl > max) return "zuviel";
    return anzahl >= max * 0.9 ? "fast" : "";
  }

  // Meldung zu einem Fehler der Spracherkennung (Fehlerkennung des Browsers); "" heißt: nichts melden
  function fehlerText(code) {
    if (code === "not-allowed" || code === "service-not-allowed") return "Das Mikrofon ist nicht erlaubt. Bitte in den Einstellungen des Browsers bzw. der App freigeben.";
    if (code === "no-speech") return "Nichts gehört.";
    if (code === "network") return "Diktieren braucht eine Internetverbindung.";
    if (code === "audio-capture") return "Es wurde kein Mikrofon gefunden.";
    if (code === "aborted") return "";
    return "Diktieren hat nicht geklappt" + (code ? " (" + code + ")" : "") + ".";
  }
  function istFehler(code) { return code !== "no-speech" && code !== "aborted"; }

  // Text der einmaligen Rückfrage vor dem ersten Diktieren
  function einwilligungText(android) {
    return android
      ? "Diktieren nutzt die Spracheingabe deines Handys (meist von Google). Je nach Einstellung des Handys geht das Gesprochene dafür über das Internet an diesen Anbieter und kommt als Text zurück.\n\nFotos und andere Angaben werden nicht übertragen. Diese Frage kommt nur einmal."
      : "Diktieren nutzt die Spracherkennung deines Browsers. Das Gesprochene geht dafür über das Internet an den Anbieter des Browsers (bei Chrome an Google, bei Edge an Microsoft) und kommt als Text zurück.\n\nFotos und andere Angaben werden nicht übertragen. Diese Frage kommt nur einmal.";
  }

  function schuetzen(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (z) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[z]; });
  }

  // --- Im Browser --------------------------------------------------------------------------------------

  var MIKRO = '<svg class="tf-sym" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V22h2v-3.08A7 7 0 0 0 19 12h-2z" fill="currentColor"/></svg>';
  var E = { app: "", melden: null, fragen: null, android: null, einwilligungAlt: null, speicher: null };
  var eingerichtet = false, lauf = null, vorher = typeof WeakMap === "function" ? new WeakMap() : null, nr = 0;

  function spracherkennung() { return wurzel.SpeechRecognition || wurzel.webkitSpeechRecognition || null; }
  function androidKann() { try { return !!(E.android && E.android.kann && E.android.kann()); } catch (e) { return false; } }
  // Kann dieses Gerät diktieren? Im Browser die Spracherkennung, in der Android-App die Spracheingabe des Handys.
  function kannDiktieren() { return !!spracherkennung() || androidKann(); }
  function melden(text, art) {
    if (!text) return;
    if (typeof E.melden === "function") E.melden(text, art || "");
    else if (wurzel.ImagicosmosDesign && wurzel.document) wurzel.ImagicosmosDesign.melden(text, art || "");   // Baustein design ab 1.1.0
  }
  function fragen(text, ja) {
    if (typeof E.fragen === "function") return Promise.resolve(E.fragen(text, { ja: ja }));
    if (wurzel.ImagicosmosDesign && wurzel.document) return wurzel.ImagicosmosDesign.fragen(text, { ja: ja });   // Fenster aus design
    return Promise.resolve(wurzel.confirm ? wurzel.confirm(text) : true);
  }
  function speicher() { if (E.speicher) return E.speicher; try { return wurzel.localStorage || null; } catch (e) { return null; } }
  function schluessel() { return "imagicosmos." + (E.app || "app") + ".diktieren"; }
  function einwilligung() {
    var s = speicher();
    try { return !!s && (s.getItem(schluessel()) === "ja" || (!!E.einwilligungAlt && s.getItem(E.einwilligungAlt) === "ja")); } catch (e) { return false; }
  }
  function einwilligungMerken() { var s = speicher(); try { if (s) s.setItem(schluessel(), "ja"); } catch (e) { /* dann eben jedes Mal fragen */ } }

  function teile(el) {
    var box = el && el.closest ? el.closest(".tf") : null;
    return box ? { box: box, feld: box.querySelector(".tf-feld"), diktat: box.querySelector(".tf-diktat"), leeren: box.querySelector(".tf-leeren"), zaehler: box.querySelector(".tf-zaehler") } : null;
  }
  function melde(feld) { feld.dispatchEvent(new Event("input", { bubbles: true })); }   // speichert wie getippter Text

  // --- Höhe und Zähler ---
  function anpassen(feld) {
    var t = teile(feld); if (!t) return;
    var box = t.box;
    if (feld.tagName === "TEXTAREA" && box.hasAttribute("data-tf-wachsen") && feld.offsetParent) {
      var min = parseFloat(box.getAttribute("data-tf-min")) || 0, max = parseFloat(box.getAttribute("data-tf-hoehe")) || 0.5;
      feld.style.height = "auto";
      feld.style.height = Math.max(min, Math.min(feld.scrollHeight + 2, Math.round(wurzel.innerHeight * max))) + "px";
    }
    if (t.zaehler) {
      var m = parseInt(box.getAttribute("data-tf-max"), 10) || 0, n = feld.value.length;
      t.zaehler.textContent = zaehlerText(n, m);
      t.zaehler.setAttribute("data-stufe", zaehlerStufe(n, m));
    }
  }

  // --- Leeren mit Rückgängig ---
  function leerenKnopf(knopf, rueck) { knopf.textContent = rueck ? "Rückgängig" : "Leeren"; knopf.setAttribute("data-rueck", rueck ? "1" : ""); }
  function leeren(knopf) {
    var t = teile(knopf); if (!t || !t.feld) return;
    if (knopf.getAttribute("data-rueck") === "1" && vorher && vorher.has(t.feld)) {
      t.feld.value = vorher.get(t.feld); vorher.delete(t.feld); leerenKnopf(knopf, false);
      melde(t.feld); anpassen(t.feld); return;
    }
    if (!t.feld.value) { melden("Da steht nichts."); return; }
    if (lauf && lauf.feld === t.feld) stopp();
    if (vorher) vorher.set(t.feld, t.feld.value);
    t.feld.value = ""; melde(t.feld); anpassen(t.feld);
    if (vorher) leerenKnopf(knopf, true);
  }

  // --- Diktieren ---
  function diktatKnopf(knopf, an) {
    if (!knopf) return;
    knopf.classList.toggle("tf-an", an); knopf.setAttribute("aria-pressed", an ? "true" : "false");
    var s = knopf.querySelector("span"); if (s) s.textContent = an ? "Ich höre … (Stopp)" : "Diktieren";
  }
  // Laufende Aufnahme beenden (auch wenn das Fenster zugeht oder die App in den Hintergrund geht)
  function stopp() {
    var d = lauf; if (!d) return;
    lauf = null; d.gestoppt = true;
    if (d.r) { try { d.r.stop(); } catch (e) { /* lief schon nicht mehr */ } }
    if (d.knopf && d.knopf.isConnected) diktatKnopf(d.knopf, false);
  }
  function hoeren(d) {
    var SR = spracherkennung(), r = new SR(), basis = d.feld.value, ersetzen = d.ersetzen && !d.gehoert;
    d.r = r;
    r.lang = "de-DE"; r.interimResults = true; r.continuous = false;
    r.onresult = function (ev) {
      if (lauf !== d) return;
      if (!d.feld.isConnected) { stopp(); return; }
      var t = "";
      for (var i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
      if (!t.trim()) return;
      d.gehoert = true;
      d.feld.value = zusammenfuegen(basis, t, ersetzen);
      melde(d.feld); anpassen(d.feld);
      d.feld.scrollTop = d.feld.scrollHeight;
    };
    r.onerror = function (ev) {
      if (lauf !== d) return;
      if (ev.error !== "no-speech" || !d.gehoert) melden(fehlerText(ev.error), istFehler(ev.error) ? "fehler" : "");
      d.gestoppt = true;
    };
    r.onend = function () {
      if (lauf !== d) return;
      // Nach einer Sprechpause beendet der Browser die Aufnahme. Wurde etwas verstanden, weiter zuhören, bis „Stopp“ kommt.
      if (!d.gestoppt && d.gehoert && d.feld.isConnected) { hoeren(d); return; }
      lauf = null; diktatKnopf(d.knopf, false);
    };
    try { r.start(); } catch (e) { lauf = null; diktatKnopf(d.knopf, false); melden(fehlerText(""), "fehler"); }
  }
  function diktieren(knopf) {
    var t = teile(knopf); if (!t || !t.feld) return Promise.resolve(false);
    if (lauf) { var derselbe = lauf.knopf === knopf; stopp(); if (derselbe) return Promise.resolve(false); }
    var imBrowser = !!spracherkennung(), inApp = !imBrowser && androidKann();
    if (!imBrowser && !inApp) { melden("Auf diesem Gerät gibt es kein Diktieren.", "fehler"); return Promise.resolve(false); }
    return (einwilligung() ? Promise.resolve(true) : fragen(einwilligungText(inApp), "Diktieren")).then(function (ok) {
      if (!ok) return false;
      einwilligungMerken();
      var d = { feld: t.feld, knopf: knopf, ersetzen: t.box.getAttribute("data-tf-modus") === "ersetzen", gestoppt: false, gehoert: false, r: null, android: inApp };
      lauf = d;
      if (t.leeren) leerenKnopf(t.leeren, false);
      diktatKnopf(knopf, true);
      if (inApp) { try { E.android.starten(); } catch (e) { lauf = null; diktatKnopf(knopf, false); melden(fehlerText(""), "fehler"); } }
      else hoeren(d);
      return true;
    });
  }
  // Ergebnis der Spracheingabe des Handys (die Android-Hülle ruft das über die App auf)
  function androidErgebnis(text) {
    var d = lauf;
    if (!d || !d.android) return;
    lauf = null; diktatKnopf(d.knopf, false);
    text = String(text || "").trim();
    if (!d.feld.isConnected) return;
    if (!text) { melden("Nichts gehört."); return; }
    d.feld.value = zusammenfuegen(d.feld.value, text, d.ersetzen);
    melde(d.feld); anpassen(d.feld);
    d.feld.scrollTop = d.feld.scrollHeight;
  }

  // --- Aufbau ---
  function knopfHtml(o) {
    return (o.knoepfe || "") +
      (o.diktat !== false && kannDiktieren() ? '<button type="button" class="tf-knopf tf-diktat" data-tf-aktion="diktieren" aria-pressed="false">' + MIKRO + "<span>Diktieren</span></button>" : "") +
      (o.leeren !== false ? '<button type="button" class="tf-knopf tf-leeren" data-tf-aktion="leeren"' + (o.name ? ' aria-label="' + schuetzen(o.name) + ' leeren"' : "") + ">Leeren</button>" : "");
  }
  function boxAttribute(o) {
    var mehrzeilig = o.mehrzeilig !== false;
    return ' class="tf' + (o.klasse ? " " + schuetzen(o.klasse) : "") + '"' +
      ' data-tf-modus="' + (o.diktat === "ersetzen" ? "ersetzen" : "anhaengen") + '"' +
      (o.max ? ' data-tf-max="' + (parseInt(o.max, 10) || 0) + '"' : "") +
      (mehrzeilig && o.wachsen !== false ? ' data-tf-wachsen' + (o.min ? ' data-tf-min="' + (parseFloat(o.min) || 0) + '"' : "") + (o.hoehe ? ' data-tf-hoehe="' + (parseFloat(o.hoehe) || 0.5) + '"' : "") : "") +
      (o.fuer ? ' data-tf-fuer="' + schuetzen(o.fuer) + '"' : "");
  }
  // HTML für ein neues Textfeld (für Apps, die ihre Ansichten als HTML-Text bauen). Angaben siehe LIESMICH.md.
  function html(o) {
    o = o || {};
    var id = o.id || ("tf-" + (++nr)), mehrzeilig = o.mehrzeilig !== false, attr = "";
    Object.keys(o.attribute || {}).forEach(function (k) { attr += " " + k + '="' + schuetzen(o.attribute[k]) + '"'; });
    var feld = mehrzeilig
      ? '<textarea id="' + schuetzen(id) + '" class="tf-feld' + (o.feldKlasse ? " " + schuetzen(o.feldKlasse) : "") + '"' + (o.platzhalter ? ' placeholder="' + schuetzen(o.platzhalter) + '"' : "") + attr + ">" + schuetzen(o.wert) + "</textarea>"
      : '<input type="text" id="' + schuetzen(id) + '" class="tf-feld' + (o.feldKlasse ? " " + schuetzen(o.feldKlasse) : "") + '"' + (o.platzhalter ? ' placeholder="' + schuetzen(o.platzhalter) + '"' : "") + ' value="' + schuetzen(o.wert) + '"' + attr + ">";
    return "<div" + boxAttribute(Object.assign({ fuer: id }, o)) + '><div class="tf-kopf"><label class="tf-name" for="' + schuetzen(id) + '">' + schuetzen(o.name) + "</label>" +
      '<span class="tf-knoepfe">' + knopfHtml(o) + "</span></div>" + feld +
      (o.max || o.zaehler ? '<div class="tf-zaehler" aria-live="polite">' + zaehlerText(String(o.wert || "").length, o.max) + "</div>" : "") + "</div>";
  }
  // Ein vorhandenes Feld (<input> oder <textarea> in der Seite) zum Textfeld machen: Kopf mit Beschriftung und Knöpfen
  // davor, Zähler danach. → das umschließende Element
  function aufbauen(feld, o) {
    o = o || {};
    if (!feld || !feld.parentNode) throw new Error("textfeld: aufbauen() braucht ein Feld in der Seite.");
    var schon = feld.classList.contains("tf-feld") && feld.closest(".tf");
    if (schon) return schon;                             // schon aufgebaut: nichts doppelt
    var d = wurzel.document, huelle = d.createElement("div");
    huelle.innerHTML = "<div" + boxAttribute(Object.assign({ fuer: feld.id, mehrzeilig: feld.tagName === "TEXTAREA" }, o)) + "></div>";
    var box = huelle.firstChild;
    var kopf = d.createElement("div"); kopf.className = "tf-kopf";
    kopf.innerHTML = '<label class="tf-name"' + (feld.id ? ' for="' + schuetzen(feld.id) + '"' : "") + ">" + schuetzen(o.name) + '</label><span class="tf-knoepfe">' +
      knopfHtml(Object.assign({ mehrzeilig: feld.tagName === "TEXTAREA" }, o)) + "</span>";
    feld.parentNode.insertBefore(box, feld);
    box.appendChild(kopf); box.appendChild(feld);
    feld.classList.add("tf-feld");
    if (o.max || o.zaehler) { var z = d.createElement("div"); z.className = "tf-zaehler"; z.setAttribute("aria-live", "polite"); box.appendChild(z); }
    anpassen(feld);
    return box;
  }
  // Höhe und Zähler aller Textfelder in einem Bereich neu berechnen (z. B. nachdem eine Ansicht sichtbar wurde)
  function aktualisieren(bereich) {
    var wo = bereich || wurzel.document;
    Array.prototype.forEach.call(wo.querySelectorAll(".tf .tf-feld"), anpassen);
  }

  // Einmal je Seite: Angaben der App und die Ereignisse für alle Textfelder. o = { app, melden, fragen, android, einwilligungAlt }
  function einrichten(o) {
    o = o || {};
    if (!wurzel.document) throw new Error("textfeld: einrichten() geht nur im Browser.");
    E.app = o.app || ""; E.melden = o.melden || null; E.fragen = o.fragen || null; E.android = o.android || null;
    E.einwilligungAlt = o.einwilligungAlt || null; E.speicher = o.speicher || null;
    if (eingerichtet) return api;
    eingerichtet = true;
    var d = wurzel.document;
    d.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-tf-aktion]");
      if (!b || !b.closest(".tf")) return;
      e.preventDefault();
      if (b.getAttribute("data-tf-aktion") === "diktieren") diktieren(b);
      else if (b.getAttribute("data-tf-aktion") === "leeren") leeren(b);
    });
    d.addEventListener("input", function (e) {
      var f = e.target;
      if (!f || !f.classList || !f.classList.contains("tf-feld")) return;
      if (e.isTrusted && vorher && vorher.has(f)) { vorher.delete(f); var t = teile(f); if (t && t.leeren) leerenKnopf(t.leeren, false); }   // getippt: Rückgängig verfällt
      anpassen(f);
    });
    wurzel.addEventListener("resize", function () { aktualisieren(); });
    wurzel.addEventListener("hashchange", stopp);
    d.addEventListener("visibilitychange", function () { if (d.hidden && lauf && !lauf.android) stopp(); });
    return api;
  }

  var api = {
    VERSION: VERSION,
    einrichten: einrichten, html: html, aufbauen: aufbauen, aktualisieren: aktualisieren,
    stopp: stopp, androidErgebnis: androidErgebnis, kannDiktieren: kannDiktieren, diktieren: diktieren, leeren: leeren,
    laeuft: function () { return !!lauf; },
    zusammenfuegen: zusammenfuegen, zaehlerText: zaehlerText, zaehlerStufe: zaehlerStufe, fehlerText: fehlerText, einwilligungText: einwilligungText,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  wurzel.ImagicosmosTextfeld = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
