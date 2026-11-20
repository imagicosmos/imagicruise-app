// „Als Status teilen“: ein Ereignis oder einen Tag der Reise als Statusbild (WhatsApp, Instagram) zeichnen, teilen oder speichern.
// Gezeichnet wird mit dem Baustein „vorlagen“ (bausteine/vorlagen.js: dieselben Vorlagen, Stile, Schriften und dasselbe Wasserzeichen
// wie in Imagiclique). Das Bild entsteht neu auf einer Zeichenfläche: Aufnahmeort und Kameradaten der Fotos sind nicht darin.
// Wasserzeichen wie in Imagiclique: der Schriftzug „Imagicruise“ mit imagicruise.de; ausblenden erst, wenn an 7 verschiedenen Tagen
// geteilt oder gespeichert wurde (gemerkt unter imagicruise.teiltage).
// Aufruf aus studio.js: ImagicruiseStatus.oeffnen({ titel, text, fusszeile, fotos: [{ datei, text }], bild(datei) → Promise<Adresse>,
//   teilen(blob, name) → Promise, speichern(blob, name) → Promise, melden(text, art), name,
//   direkt(blob, name) → Promise (nur Android-App: direkt an den WhatsApp-Status; dann ist das der Hauptknopf),
//   weiter(fotos) → Promise (seit 20.11.2026: die gewählten Fotos samt Titel und Text an Imagiclique, „In Imagiclique gestalten“),
//   weiterHinweis (Text, wenn Imagiclique nicht erreichbar ist) }).
(function (wurzel) {
  "use strict";
  var V = wurzel.ImagicosmosVorlagen, D = wurzel.ImagicosmosDesign;
  var STIL_SCHLUESSEL = "imagicruise.status", FREI_AB = V.FREE_AFTER;
  var TEILTAGE = V.teiltage("imagicruise.teiltage");   // Regel fürs Wasserzeichen aus dem Baustein vorlagen, gleich wie in Imagiclique
  var VORLAGEN = ["photo", "collage", "pinboard", "scrapbook", "polaroid", "postcard", "minimal", "film", "magazine", "shapes", "report", "quote"];
  var NAMEN = { photo: "Foto + Text", collage: "Collage", pinboard: "Pinwand", scrapbook: "Album", polaroid: "Sofortbild", postcard: "Postkarte",
    minimal: "Weißrand", film: "Filmstreifen", magazine: "Magazin", shapes: "Formen", report: "Bericht", quote: "Zitat" };
  var MARKE = null;
  function marke() {
    if (MARKE) return MARKE;
    var hell = new Image(), dunkel = new Image();
    hell.src = "marke/zauber-auf-hell.png"; dunkel.src = "marke/zauber-auf-dunkel.png";
    MARKE = { hell: hell, dunkel: dunkel, adresse: "imagicruise.de" };
    return MARKE;
  }
  function lesen(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function schreiben(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* dann eben nicht gemerkt */ } }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function bildLaden(url) {
    return new Promise(function (ok) {
      if (!url) return ok(null);
      var im = new Image(); im.onload = function () { ok(im); }; im.onerror = function () { ok(null); }; im.src = url;
    });
  }
  function kreis(c) { return "linear-gradient(135deg," + c.bg1 + " 0 55%," + c.bg2 + " 55% 100%)"; }

  // Stile: eingebaute sofort, die aus dem Katalog bei Bedarf (Datei erst beim Wählen)
  var katalog = null;
  function katalogLaden() {
    if (!katalog) katalog = fetch(V.ORDNER + "stile/katalog.json").then(function (r) { return r.json(); }).then(function (k) {
      return k.stile.filter(function (e) { return !e.eingebaut; });
    }).catch(function () { return []; });
    return katalog;
  }
  var stilDateien = {};
  function stilHolen(id) {
    var eingebaut = V.STYLES.filter(function (s) { return s.id === id; })[0];
    if (eingebaut) return Promise.resolve(eingebaut);
    if (!stilDateien[id]) stilDateien[id] = fetch(V.ORDNER + "stile/" + id + ".imagistil").then(function (r) { return r.json(); }).then(function (o) { return V.cleanStyle(o); });
    return stilDateien[id];
  }

  function oeffnen(o) {
    var d = wurzel.document.getElementById("status");
    var fotos = (o.fotos || []).filter(function (f) { return f && f.datei; }).slice(0, 12);
    var gemerkt = lesen(STIL_SCHLUESSEL, {}) || {};
    var wahl = {
      vorlage: null, stil: gemerkt.stil || "urlaub", ziel: gemerkt.ziel === "ig" ? "ig" : "wa",
      fotos: fotos.map(function (f, i) { return i < 4; }), logo: true
    };
    var tage = TEILTAGE.anzahl, frei = TEILTAGE.frei();
    if (frei && gemerkt.logo === false) wahl.logo = false;
    var bilder = [], stil = null, zu = false, zeichnenLaeuft = null, nochmal = false;
    function gewaehlt() { return fotos.map(function (f, i) { return wahl.fotos[i] ? bilder[i] : null; }).filter(Boolean); }
    function anzahl() { return wahl.fotos.filter(Boolean).length; }
    if (!wahl.vorlage) wahl.vorlage = V.vorlageFuer(anzahl());

    d.innerHTML = '<div class="blatt-kopf"><h2 id="status-titel">Als Status teilen</h2></div>' +
      '<div class="st-inhalt"><div class="st-buehne"><canvas id="st-bild" width="1080" height="1920" aria-label="Vorschau des Statusbilds"></canvas></div>' +
      '<div class="st-wahl">' +
      '<div class="feld"><span class="feldname">Vorlage</span><div class="arten" id="st-vorlagen">' + VORLAGEN.map(function (t) {
        return '<button type="button" data-v="' + t + '">' + esc(NAMEN[t]) + "</button>"; }).join("") + "</div></div>" +
      '<div class="feld"><span class="feldname">Stil</span><div class="st-stile" id="st-stile"></div></div>' +
      (fotos.length ? '<div class="feld"><span class="feldname" id="st-fotos-titel">Fotos</span><div class="st-fotos" id="st-fotos">' + fotos.map(function (f, i) {
        return '<button type="button" data-i="' + i + '" aria-pressed="false"><img alt="' + esc(f.text || "Foto " + (i + 1)) + '"></button>'; }).join("") + "</div></div>" : "") +
      '<div class="feld"><span class="feldname">Für</span><div class="arten" id="st-ziel">' + V.TARGETS.map(function (t) {
        return '<button type="button" data-z="' + t.id + '">' + esc(t.name) + "</button>"; }).join("") + "</div></div>" +
      '<label class="schalter st-logo"><input type="checkbox" id="st-logo"' + (wahl.logo ? " checked" : "") + (frei ? "" : " disabled") + '><span><b>Logo im Bild</b><small>' +
      (frei ? "Unten rechts „Imagicruise“ mit imagicruise.de." : "Ausblenden geht, wenn du an " + FREI_AB + " verschiedenen Tagen geteilt hast (bisher " + tage + ").") + "</small></span></label>" +
      (o.weiter ? '<div class="st-weiter"><p class="klein-text">Mehr Möglichkeiten – Collage mit bis zu 12 Fotos, Diashow mit Musik, mehrere Beiträge, Sticker – bietet Imagiclique. ' +
        "Die gewählten Fotos, Titel und Text gehen dorthin.</p>" +
        '<button type="button" class="ds-knopf ds-zweit ds-klein" id="st-imagiclique">In Imagiclique gestalten</button></div>'
        : o.weiterHinweis ? '<p class="klein-text leise st-weiter">' + esc(o.weiterHinweis) + "</p>" : "") +
      '<p class="klein-text leise">Das Bild wird neu gezeichnet: Aufnahmeort und Kameradaten der Fotos sind nicht darin.</p>' +
      "</div></div>" +
      '<div class="blatt-fuss"><button type="button" class="ds-knopf ds-zweit" id="st-nein">Abbrechen</button><span class="knoepfe">' +
      '<button type="button" class="ds-knopf ds-zweit" id="st-speichern">Speichern</button><button type="button" class="ds-knopf' + (o.direkt ? " ds-zweit" : "") + '" id="st-teilen">Teilen</button>' +
      (o.direkt ? '<button type="button" class="ds-knopf" id="st-direkt">WhatsApp-Status</button>' : "") + "</span></div>";
    var $ = function (s) { return d.querySelector(s); };

    function markieren() {
      Array.prototype.forEach.call(d.querySelectorAll("#st-vorlagen button"), function (b) { var an = b.dataset.v === wahl.vorlage; b.classList.toggle("an", an); b.setAttribute("aria-pressed", an); });
      Array.prototype.forEach.call(d.querySelectorAll("#st-ziel button"), function (b) { var an = b.dataset.z === wahl.ziel; b.classList.toggle("an", an); b.setAttribute("aria-pressed", an); });
      Array.prototype.forEach.call(d.querySelectorAll("#st-stile button"), function (b) { var an = b.dataset.s === wahl.stil; b.classList.toggle("an", an); b.setAttribute("aria-pressed", an); });
      Array.prototype.forEach.call(d.querySelectorAll("#st-fotos button"), function (b) { var an = !!wahl.fotos[+b.dataset.i]; b.classList.toggle("an", an); b.setAttribute("aria-pressed", an); });
      var t = $("#st-fotos-titel"); if (t) t.textContent = "Fotos (" + anzahl() + " von " + fotos.length + " gewählt)";
    }
    // zeichnen: immer nur einmal gleichzeitig, der letzte Wunsch gewinnt
    function zeichnen() {
      if (zu) return Promise.resolve();
      if (zeichnenLaeuft) { nochmal = true; return zeichnenLaeuft; }
      zeichnenLaeuft = stilHolen(wahl.stil).catch(function () { return null; }).then(function (st) {
        stil = st || V.STYLES[0];
        return V.schriftenLaden(stil.font || "sans");
      }).then(function () {
        if (zu) return;
        var cv = $("#st-bild");
        V.seite(cv.getContext("2d"), {
          vorlage: wahl.vorlage, fotos: gewaehlt(), titel: o.titel || "", text: o.text || "", fusszeile: o.fusszeile || "",
          stil: stil, schrift: stil.font || "sans", ziel: wahl.ziel, marke: wahl.logo ? marke() : null
        });
      }).catch(function (e) { if (o.melden) o.melden("Das Statusbild ließ sich nicht zeichnen: " + (e && e.message || e), "fehler"); })
        .then(function () { zeichnenLaeuft = null; if (nochmal) { nochmal = false; return zeichnen(); } });
      return zeichnenLaeuft;
    }
    function merken() { schreiben(STIL_SCHLUESSEL, { stil: wahl.stil, ziel: wahl.ziel, logo: wahl.logo }); }

    // Stile anzeigen: eingebaute, dann Katalog
    function stilKnopf(id, name, farben, icon) {
      return '<button type="button" data-s="' + esc(id) + '" title="' + esc(name) + '" aria-label="Stil ' + esc(name) + '" style="background:' + kreis(farben) + '">' + esc(icon || "") + "</button>";
    }
    $("#st-stile").innerHTML = V.STYLES.map(function (s) { return stilKnopf(s.id, s.name, s.colors, s.icon); }).join("");
    katalogLaden().then(function (liste) {
      if (zu) return;
      $("#st-stile").insertAdjacentHTML("beforeend", liste.map(function (e) { return stilKnopf(e.id, e.name, e.farben, e.icon); }).join(""));
      markieren();
    });

    d.onclick = function (ev) {
      var b = ev.target.closest("button"); if (!b || !d.contains(b)) return;
      if (b.dataset.v) { wahl.vorlage = b.dataset.v; }
      else if (b.dataset.z) { wahl.ziel = b.dataset.z; merken(); }
      else if (b.dataset.s) { wahl.stil = b.dataset.s; merken(); }
      else if (b.dataset.i != null && b.closest("#st-fotos")) {
        var i = +b.dataset.i; wahl.fotos[i] = !wahl.fotos[i];
        var n = anzahl(); if (n && V.need(wahl.vorlage, n) === 0) wahl.vorlage = V.vorlageFuer(n);
      } else return;
      markieren(); zeichnen();
    };
    $("#st-logo").onchange = function () { wahl.logo = this.checked; merken(); zeichnen(); };

    function bildBlob() {
      return zeichnen().then(function () {
        return new Promise(function (ok) { $("#st-bild").toBlob(ok, "image/jpeg", .9); });
      });
    }
    var dateiname = "imagicruise-" + String(o.name || o.titel || "status").toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) + ".jpg";
    $("#st-teilen").onclick = function () {
      bildBlob().then(function (b) { return o.teilen(b, dateiname); }).then(function (r) { if (r !== "abgebrochen") { TEILTAGE.merken(); d.close("ja"); } })
        .catch(function (e) { if (o.melden) o.melden((e && e.message) || "Teilen hat nicht geklappt.", "fehler"); });
    };
    if (o.direkt) $("#st-direkt").onclick = function () {
      bildBlob().then(function (b) { return o.direkt(b, dateiname); }).then(function () { TEILTAGE.merken(); d.close("ja"); })
        .catch(function (e) { if (o.melden) o.melden((e && e.message) || "Teilen hat nicht geklappt.", "fehler"); });
    };
    if (o.weiter) $("#st-imagiclique").onclick = function () {
      var auswahl = fotos.filter(function (f, i) { return wahl.fotos[i]; });
      o.weiter(auswahl.length ? auswahl : fotos).then(function (r) { if (r !== "abgebrochen") d.close("ja"); })
        .catch(function (e) { if (o.melden) o.melden((e && e.message) || "Die Übergabe an Imagiclique hat nicht geklappt.", "fehler"); });
    };
    $("#st-speichern").onclick = function () {
      bildBlob().then(function (b) { return o.speichern(b, dateiname); }).then(function () { TEILTAGE.merken(); d.close("ja"); })
        .catch(function (e) { if (o.melden) o.melden((e && e.message) || "Speichern hat nicht geklappt.", "fehler"); });
    };
    $("#st-nein").onclick = function () { d.close("nein"); };

    return new Promise(function (ok) {
      d.returnValue = "nein";
      d.onclose = function () { zu = true; var erg = d.returnValue; d.onclick = null; d.innerHTML = ""; ok(erg); };
      d.showModal();
      markieren();
      // Fotos laden (Vorschaubilder sofort, die Bilder für die Vorlage nach und nach), dann zeichnen
      Promise.all(fotos.map(function (f, i) {
        return Promise.resolve(o.bild(f.datei)).then(function (url) {
          var img = d.querySelector('#st-fotos button[data-i="' + i + '"] img'); if (img && url) img.src = url;
          return bildLaden(url);
        }).then(function (im) { bilder[i] = im; });
      })).then(zeichnen);
      zeichnen();
    });
  }

  wurzel.ImagicruiseStatus = { oeffnen: oeffnen, FREI_AB: FREI_AB, VORLAGEN: VORLAGEN };
})(typeof globalThis !== "undefined" ? globalThis : this);
