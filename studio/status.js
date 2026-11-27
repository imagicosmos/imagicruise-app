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
// Sticker (seit 22.11.2026, Baustein „sticker“; Reiter je Anlass, vorgewählt nach Jahreszeit): antippen setzt einen aufs Bild, im Bild verschieben, Größe
// und Drehen mit den Griffen, nach vorn/hinten, entfernen (Umschalter „Fotos | Sticker“ des Bausteins vorschau). Im Statusbild
// (JPEG) stehen sie in ihrer Ruhe-Stellung. Gemerkt wird nur die Kennung aus dem Baustein (seit Auftrag 42 je Ereignis/Tag, siehe unten).
// Fotos im Bild (seit 22.11.2026): ein Foto antippen wählt es; ziehen verschiebt seinen Ausschnitt, der Regler zoomt; im Modus
// „Tauschen“ ein Foto auf ein anderes ziehen (oder das andere antippen), dann tauschen beide die Plätze. Die Felder liefert der Baustein
// vorlagen, die Bedienung (antippen, ziehen, Rahmen, Leiste) der Baustein „vorschau“ (bausteine/vorschau.js, ImagicosmosVorschau);
// hier bleiben Reihenfolge (reihe), Ausschnitte (aus) und freie Lagen (lagen). Seit Auftrag 42 auch nach dem Schließen gemerkt (siehe unten).
// „Anordnen“ (seit 24.11.2026, vorlagen ab 1.8.0): In Sofortbild, Pinwand und Album lassen sich Fotos samt Rahmen (Pinwand auch Zettel und
// Karteikarte) frei verschieben, vergrößern, drehen und nach vorn oder hinten legen; die Lagen gelten je Vorlage.
// Merken (seit 27.11.2026, Auftrag 42): Vorlage, gewählte Fotos samt Reihenfolge, Ausschnitte, freie Lagen und Sticker bleiben je
// Ereignis bzw. Tag erhalten. Aufruf mit o.gemerkt (gespeicherter Stand oder nichts) und o.merken(stand | null); gerufen beim
// Schließen, wenn sich etwas geändert hat (null = wieder wie am Anfang). Fotos stehen darin mit ihrem Namen (`original`, sonst
// `datei`), damit Bearbeiten und neue Fotos den Stand nicht durcheinanderbringen. Form: docs/DATENFORMAT.md (`status`).
(function (wurzel) {
  "use strict";
  var V = wurzel.ImagicosmosVorlagen, D = wurzel.ImagicosmosDesign, ST = wurzel.ImagicosmosSticker, VS = wurzel.ImagicosmosVorschau;
  var STICKER_MAX = 8, STICKER_GROESSE = 320;
  // Anlass, der gerade passt: 27.12.–6.1. Silvester, Nov./Dez. Weihnachten, Jan.–März Winter, Sept./Okt. Herbst
  function anlassJetzt(heute) {
    var m = heute.getMonth() + 1, t = heute.getDate();
    if ((m === 12 && t >= 27) || (m === 1 && t <= 6)) return "silvester";
    if (m >= 11) return "weihnachten";
    if (m <= 3) return "winter";
    if (m >= 9) return "herbst";
    return null;
  }
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
    var sticker = [], sauber = false;   // sticker: [{ a: Kennung, x, y (Mitte im Bild 1080 × 1920), g: Breite, r: Grad }], hinten zuerst; sauber = ohne Auswahlrahmen (fürs Bild)
    // Fotos im Bild: reihe = Reihenfolge der Fotos (Nummern in fotos), aus = Ausschnitt je Foto { fx, fy, zoom },
    // felder/felderNr = wo die Vorlage zuletzt welches Foto gezeichnet hat; die Bedienung (Auswahl, Tauschen) steckt in bedienung
    var reihe = fotos.map(function (f, i) { return i; }), aus = {}, felder = [], felderNr = [], bedienung = null;
    // lagen = freie Lage je Vorlage { Vorlage: { Nummer des Fotos | 'titel' | 'text': { x, y, s, r, z } } }; teile = lose Teile der letzten Zeichnung
    var lagen = {}, teile = [], gezeichnet = null;
    function lageVon(nr) { var m = lagen[gezeichnet]; return (m && m[nr]) || null; }
    function lageSetzen(nr, l) { var m = lagen[gezeichnet] || (lagen[gezeichnet] = {}); if (l) m[nr] = l; else delete m[nr]; }
    function auswahl() { return reihe.filter(function (i) { return wahl.fotos[i] && bilder[i]; }); }
    function anzahl() { return wahl.fotos.filter(Boolean).length; }
    if (!wahl.vorlage) wahl.vorlage = V.vorlageFuer(anzahl());

    // ---- gemerkter Stand je Ereignis/Tag (Auftrag 42) ----
    function schluessel(i) { var f = fotos[i]; return f.original || f.datei; }
    function kopie(x) { return JSON.parse(JSON.stringify(x)); }
    function stand() {
      var s = { vorlage: wahl.vorlage, fotos: reihe.filter(function (i) { return wahl.fotos[i]; }).map(schluessel), aus: {}, lagen: {}, sticker: kopie(sticker) };
      Object.keys(aus).forEach(function (i) { if (fotos[+i]) s.aus[schluessel(+i)] = kopie(aus[i]); });
      Object.keys(lagen).forEach(function (v) {
        var m = {};
        Object.keys(lagen[v]).forEach(function (n) { var k = n === "titel" || n === "text" ? n : fotos[+n] ? schluessel(+n) : null; if (k) m[k] = kopie(lagen[v][n]); });
        if (Object.keys(m).length) s.lagen[v] = m;
      });
      return s;
    }
    var standardStand = JSON.stringify(stand()), anfangStand = standardStand, gemerkt0 = o.gemerkt && typeof o.gemerkt === "object" ? o.gemerkt : null;
    function zuruecksetzen() {
      wahl.fotos = fotos.map(function (f, i) { return i < 4; }); reihe = fotos.map(function (f, i) { return i; });
      aus = {}; lagen = {}; sticker.length = 0; wahl.vorlage = V.vorlageFuer(anzahl());
    }
    if (gemerkt0) {
      var nrVon = {};
      fotos.forEach(function (f, i) { if (!(schluessel(i) in nrVon)) nrVon[schluessel(i)] = i; });
      if (Array.isArray(gemerkt0.fotos)) {
        var gew = [];
        gemerkt0.fotos.forEach(function (k) { var i = nrVon[k]; if (i != null && gew.indexOf(i) < 0) gew.push(i); });
        wahl.fotos = fotos.map(function (f, i) { return gew.indexOf(i) >= 0; });
        reihe = gew.concat(reihe.filter(function (i) { return gew.indexOf(i) < 0; }));
      }
      var g0 = gemerkt0.aus && typeof gemerkt0.aus === "object" ? gemerkt0.aus : {};
      Object.keys(g0).forEach(function (k) { if (k in nrVon) aus[nrVon[k]] = kopie(g0[k]); });
      var l0 = gemerkt0.lagen && typeof gemerkt0.lagen === "object" ? gemerkt0.lagen : {};
      Object.keys(l0).forEach(function (v) {
        if (VORLAGEN.indexOf(v) < 0 || !l0[v] || typeof l0[v] !== "object") return;
        var m = {};
        Object.keys(l0[v]).forEach(function (k) { if (k === "titel" || k === "text") m[k] = kopie(l0[v][k]); else if (k in nrVon) m[nrVon[k]] = kopie(l0[v][k]); });
        lagen[v] = m;
      });
      if (ST && Array.isArray(gemerkt0.sticker)) gemerkt0.sticker.forEach(function (s) { if (s && ST.angaben(s.a) && sticker.length < STICKER_MAX) sticker.push(kopie(s)); });
      var n0 = anzahl();
      if (VORLAGEN.indexOf(gemerkt0.vorlage) >= 0 && !(n0 && V.need(gemerkt0.vorlage, n0) === 0)) wahl.vorlage = gemerkt0.vorlage;
      else wahl.vorlage = V.vorlageFuer(n0);
      anfangStand = JSON.stringify(stand());
    }

    d.innerHTML = '<div class="blatt-kopf"><h2 id="status-titel">Als Status teilen</h2></div>' +
      '<div class="st-inhalt"><div class="st-buehne"><canvas id="st-bild" width="1080" height="1920" aria-label="Vorschau des Statusbilds"></canvas></div>' +
      '<div class="st-wahl"><div id="st-foto-wahl"></div>' +
      '<div class="feld"><span class="feldname">Vorlage</span><div class="arten" id="st-vorlagen">' + VORLAGEN.map(function (t) {
        return '<button type="button" data-v="' + t + '">' + esc(NAMEN[t]) + "</button>"; }).join("") + "</div></div>" +
      '<div class="feld"><span class="feldname">Stil</span><div class="st-stile" id="st-stile"></div></div>' +
      (fotos.length ? '<div class="feld"><span class="feldname" id="st-fotos-titel">Fotos</span><div class="st-fotos" id="st-fotos">' + fotos.map(function (f, i) {
        return '<button type="button" data-i="' + i + '" aria-pressed="false"><img alt="' + esc(f.text || "Foto " + (i + 1)) + '"></button>'; }).join("") + "</div></div>" : "") +
      '<div class="feld"><span class="feldname">Für</span><div class="arten" id="st-ziel">' + V.TARGETS.map(function (t) {
        return '<button type="button" data-z="' + t.id + '">' + esc(t.name) + "</button>"; }).join("") + "</div></div>" +
      (ST ? '<div class="feld"><span class="feldname">Sticker</span><div class="arten st-anlaesse" id="st-anlaesse"></div><div class="st-sticker" id="st-sticker"></div>' +
        '<p class="klein-text leise">Antippen setzt einen Sticker aufs Bild. Dort lässt er sich verschieben, vergrößern und drehen.</p></div>' : "") +
      '<label class="schalter st-logo"><input type="checkbox" id="st-logo"' + (wahl.logo ? " checked" : "") + (frei ? "" : " disabled") + '><span><b>Logo im Bild</b><small>' +
      (frei ? "Unten rechts „Imagicruise“ mit imagicruise.de." : "Ausblenden geht, wenn du an " + FREI_AB + " verschiedenen Tagen geteilt hast (bisher " + tage + ").") + "</small></span></label>" +
      (o.weiter ? '<div class="st-weiter"><p class="klein-text">Mehr Möglichkeiten – Collage mit bis zu 12 Fotos, Diashow mit Musik, mehrere Beiträge, bewegte Sticker im Video – bietet Imagiclique. ' +
        "Die gewählten Fotos, Titel und Text gehen dorthin.</p>" +
        '<button type="button" class="ds-knopf ds-zweit ds-klein" id="st-imagiclique">In Imagiclique gestalten</button></div>'
        : o.weiterHinweis ? '<p class="klein-text leise st-weiter">' + esc(o.weiterHinweis) + "</p>" : "") +
      '<p class="klein-text leise">Das Bild wird neu gezeichnet: Aufnahmeort und Kameradaten der Fotos sind nicht darin.</p>' +
      '<div class="st-gemerkt" id="st-gemerkt"' + (anfangStand !== standardStand ? "" : " hidden") + '><p class="klein-text leise">Deine Anordnung von hier bleibt gespeichert, auch für das nächste Mal.</p>' +
      '<button type="button" class="ds-knopf ds-klein ds-zweit" id="st-vergessen">↺ Neu beginnen</button></div>' +
      "</div></div>" +
      '<div class="blatt-fuss"><button type="button" class="ds-knopf ds-zweit" id="st-nein">Abbrechen</button><span class="knoepfe">' +
      '<button type="button" class="ds-knopf ds-zweit" id="st-speichern">Speichern</button><button type="button" class="ds-knopf' + (o.direkt ? " ds-zweit" : "") + '" id="st-teilen">Teilen</button>' +
      (o.direkt ? '<button type="button" class="ds-knopf" id="st-direkt">WhatsApp-Status</button>' : "") + "</span></div>";
    var $ = function (s) { return d.querySelector(s); };
    // für Tests und Fehlersuche: der Zustand der Fotos im Bild (nur lesen)
    d.statusZustand = function () {
      var b = bedienung ? bedienung.zustand() : { aktiv: null, tauschen: false };
      return { felder: felder, felderNr: felderNr.slice(), reihe: reihe.slice(), aus: JSON.parse(JSON.stringify(aus)), fotoAktiv: b.aktiv == null || b.was === "sticker" ? -1 : b.aktiv, tauschen: b.tauschen,
        modus: b.modus, was: b.was, aktiv: b.aktiv, teile: teile, lagen: JSON.parse(JSON.stringify(lagen)), sticker: JSON.parse(JSON.stringify(sticker)) };
    };

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
        // Die Schriftzug-Sticker brauchen Great Vibes, Caveat und Pacifico aus dem Baustein vorlagen
        if (sticker.length) return Promise.all(["schreibschrift", "hand", "retro"].map(function (s) { return V.schriftenLaden(s); }));
      }).then(function () {
        if (zu) return;
        var cv = $("#st-bild"), liste = auswahl(), m = lagen[wahl.vorlage] || {};
        var erg = V.seite(cv.getContext("2d"), {
          vorlage: wahl.vorlage, fotos: liste.map(function (i) { return bilder[i]; }), titel: o.titel || "", text: o.text || "", fusszeile: o.fusszeile || "",
          stil: stil, schrift: stil.font || "sans", ziel: wahl.ziel, marke: wahl.logo ? marke() : null,
          ausschnitte: liste.map(function (i) { return aus[i] || null; }),
          lagen: { fotos: liste.map(function (i) { return m[i] || null; }), titel: m.titel || null, text: m.text || null }
        });
        felder = (erg && erg.felder) || []; teile = (erg && erg.teile) || []; felderNr = liste; gezeichnet = wahl.vorlage;
        if (ST) stickerZeichnen(cv.getContext("2d"));
        if (bedienung) { bedienung.pruefen(); bedienung.anzeigen(); /* Leiste: erst jetzt sind die Teile neu */ if (!sauber) bedienung.rahmen(cv.getContext("2d")); }
      }).catch(function (e) { if (o.melden) o.melden("Das Statusbild ließ sich nicht zeichnen: " + (e && e.message || e), "fehler"); })
        .then(function () { zeichnenLaeuft = null; if (nochmal) { nochmal = false; return zeichnen(); } });
      return zeichnenLaeuft;
    }
    function stickerZeichnen(x) {
      sticker.forEach(function (s) {
        x.save(); x.translate(s.x, s.y); x.rotate((s.r || 0) * Math.PI / 180);
        x.shadowColor = "rgba(0,0,0,.35)"; x.shadowBlur = s.g * 0.05; x.shadowOffsetY = s.g * 0.02;   // Schatten wie bei Emoji-Stickern
        ST.zeichnen(x, s.a, s.g, null);
        x.restore();
      });
    }
    // Sticker als lose Teile für den Baustein vorschau: Feld um die Mitte, 1,16-mal so breit wie der Sticker
    function stickerTeile() {
      var cv = $("#st-bild"), W = cv.width, H = cv.height;
      return sticker.map(function (s, i) {
        var a = s.g * 1.16, h = a / 2, w = (s.r || 0) * Math.PI / 180, c = Math.cos(w), n = Math.sin(w);
        var q = function (u, v) { return [s.x + u * c - v * n, s.y + u * n + v * c]; };
        return { id: i, ecken: [q(-h, -h), q(h, -h), q(h, h), q(-h, h)], mitte: [s.x, s.y], w: a, h: a, seite: { w: W, h: H }, lage: { x: s.x / W, y: s.y / H, s: s.g / W, r: s.r || 0 } };
      });
    }
    function stickerSetzen(a) {
      if (sticker.length >= STICKER_MAX) { if (o.melden) o.melden("Höchstens " + STICKER_MAX + " Sticker je Bild.", ""); return; }
      var n = sticker.length;
      sticker.push({ a: a, x: 540 + [0, 300, -300][n % 3], y: 760 + Math.floor(n / 3) % 3 * 340, g: STICKER_GROESSE, r: 0 });
      bedienung.ziel("sticker"); bedienung.waehlen(sticker.length - 1);
      zeichnen();
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
        if (!wahl.fotos[i] && bedienung && bedienung.ziel() === "fotos" && bedienung.aktiv() === i) bedienung.waehlen(null);
        var n = anzahl(); if (n && V.need(wahl.vorlage, n) === 0) wahl.vorlage = V.vorlageFuer(n);
      } else return;
      markieren(); zeichnen();
    };
    $("#st-logo").onchange = function () { wahl.logo = this.checked; merken(); zeichnen(); };

    // Sticker: Kacheln je Anlass, im Bild wählen und verschieben
    if (ST) {
      // Reiter je Anlass; Kacheln nur für den gewählten (jede Kachel bewegt sich, solange sie in der Seite steht)
      var anlassZeigen = function (anlass) {
        var gruppe = ST.KATALOG.filter(function (g) { return g.anlass === anlass; })[0] || ST.KATALOG[0], ort = $("#st-sticker");
        Array.prototype.forEach.call(d.querySelectorAll("#st-anlaesse button"), function (b) { var an = b.dataset.anlass === gruppe.anlass; b.classList.toggle("an", an); b.setAttribute("aria-pressed", an); });
        ort.innerHTML = "";
        gruppe.anim.forEach(function (k) {
          var knopf = ST.kachel(k, { klasse: "st-kachel", px: 48 }), an = ST.angaben(k);
          knopf.title = an.name; knopf.setAttribute("aria-label", "Sticker " + an.name + " setzen"); knopf.dataset.sticker = k;
          knopf.addEventListener("click", function (ev) { ev.stopPropagation(); stickerSetzen(k); });
          ort.appendChild(knopf);
        });
      };
      $("#st-anlaesse").innerHTML = ST.KATALOG.map(function (g) { return '<button type="button" data-anlass="' + esc(g.anlass) + '">' + esc(g.name) + "</button>"; }).join("");
      $("#st-anlaesse").addEventListener("click", function (ev) {
        var b = ev.target.closest("button"); if (!b) return;
        ev.stopPropagation(); anlassZeigen(b.dataset.anlass);
      });
      anlassZeigen(anlassJetzt(new Date()));
    }

    function platzTauschen(a, b) {
      var ia = reihe.indexOf(a), ib = reihe.indexOf(b); if (ia < 0 || ib < 0) return;
      reihe[ia] = b; reihe[ib] = a;
      var la = lageVon(a), lb = lageVon(b);   // frei angeordnet: die Plätze tauschen mit
      if (la || lb) { lageSetzen(a, lb); lageSetzen(b, la); }
    }

    // Im Bild antippen und ziehen (Baustein vorschau): der Umschalter „Fotos | Sticker“ bestimmt, was ein Tipp trifft
    var cv = $("#st-bild");
    bedienung = VS.bedienen(cv, {
      vorlagen: V,
      felder: function () { return felder; },
      nr: function (f) { return felderNr[f.i]; },
      bild: function (nr) { return bilder[nr]; },
      ausschnitt: function (nr) { return aus[nr] || null; },
      ausschnittSetzen: function (nr, a) { if (a) aus[nr] = a; else delete aus[nr]; },
      tauschen: platzTauschen,
      neuZeichnen: zeichnen,
      sticker: ST ? {
        teile: stickerTeile,
        setzen: function (i, l) { var s = sticker[i]; if (s) { s.x = l.x * cv.width; s.y = l.y * cv.height; s.g = l.s * cv.width; s.r = l.r; } },
        ebene: function (i, vorn) {
          var s = sticker.splice(i, 1)[0]; if (!s) return;
          if (vorn) sticker.push(s); else sticker.unshift(s);
          return vorn ? sticker.length - 1 : 0;
        },
        entfernen: function (i) { sticker.splice(i, 1); }
      } : null,
      teile: function () { return teile; },
      lage: lageVon,
      lageSetzen: lageSetzen,
      leiste: $("#st-foto-wahl"),
      texte: { modusAus: "Ausschnitt", vorn: "Vorn", hinten: "Hinten", stickerLeer: "Noch kein Sticker im Bild. Unter „Sticker“ einen antippen." }
    });
    if (!fotos.length && ST) bedienung.ziel("sticker");

    function bildBlob() {
      sauber = true;   // ohne Auswahlrahmen
      return zeichnen().then(function () {
        return new Promise(function (ok) { $("#st-bild").toBlob(ok, "image/jpeg", .9); });
      }).then(function (b) { sauber = false; return b; }, function (e) { sauber = false; throw e; });
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
      var gewaehlt = reihe.filter(function (i) { return wahl.fotos[i]; }).map(function (i) { return fotos[i]; });
      o.weiter(gewaehlt.length ? gewaehlt : fotos).then(function (r) { if (r !== "abgebrochen") d.close("ja"); })
        .catch(function (e) { if (o.melden) o.melden((e && e.message) || "Die Übergabe an Imagiclique hat nicht geklappt.", "fehler"); });
    };
    $("#st-speichern").onclick = function () {
      bildBlob().then(function (b) { return o.speichern(b, dateiname); }).then(function () { TEILTAGE.merken(); d.close("ja"); })
        .catch(function (e) { if (o.melden) o.melden((e && e.message) || "Speichern hat nicht geklappt.", "fehler"); });
    };
    $("#st-nein").onclick = function () { d.close("nein"); };
    $("#st-vergessen").onclick = function () {
      if (bedienung) bedienung.waehlen(null);
      zuruecksetzen(); $("#st-gemerkt").hidden = true; markieren(); zeichnen();
    };

    return new Promise(function (ok) {
      d.returnValue = "nein";
      d.onclose = function () {
        zu = true; var erg = d.returnValue, jetzt = JSON.stringify(stand());
        if (o.merken && jetzt !== anfangStand) { try { o.merken(jetzt === standardStand ? null : JSON.parse(jetzt)); } catch (e) { /* Merken ist nur ein Zusatz */ } }
        d.onclick = null; d.statusZustand = null; d.innerHTML = ""; ok(erg);
      };
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

  wurzel.ImagicruiseStatus = { oeffnen: oeffnen, FREI_AB: FREI_AB, VORLAGEN: VORLAGEN, STICKER_MAX: STICKER_MAX, anlassJetzt: anlassJetzt };
})(typeof globalThis !== "undefined" ? globalThis : this);
