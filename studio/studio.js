// Imagicruise – Studio-Oberfläche (PC und Handy). Kennt den Speicher nur über studio/speicher.js.
//
// Adressen:  #/                              Liste der Reisen
//            #/reise/<id>/<bereich>/<tag>    eine Reise; Bereiche: tage, reise, karte, fertig
// Bedienung: Knöpfe tragen data-a="<aktion>", Eingabefelder data-f="<wer>.<feld>" (wer: reise, tag, e, foto).
// Jede Änderung setzt den Zeitstempel "geaendert" (für den Abgleich) und speichert kurz darauf von selbst.
(function () {
  "use strict";
  var M = window.ImagicruiseModell, A = window.ImagicruiseAbgleich, Z = window.ImagicruiseZip, F = window.ImagicruiseFotos,
    P = window.ImagicruisePaket, B = window.ImagicruiseBild, O = window.ImagicosmosOrtsInfo, K = window.ImagicruiseKiHilfe, KI = window.ImagicosmosKi, V = window.ImagicosmosVideoSchnitt, Arten = window.ImagicruiseArten, Karte = window.ImagicruiseKarte;
  var speicher = window.ImagicruiseSpeicher.oeffnen(), amPc = speicher.art === "pc";
  // In der Android-App stellt die App dieses Objekt bereit (android/…/MainActivity.java, Klasse Bruecke); sonst gibt es es nicht.
  var APP = window.ImagicruiseApp || null;
  var BEISPIEL = "../beispiel/";
  var z = { fehler: [], reise: null, bereich: "tage", tag: 0, ereignis: null, urls: {}, timer: null, schreibt: null, offen: false, fotoZiel: null, exportOrdner: "" };

  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  var ansicht = $("#ansicht");

  // ---------- Meldungen, Rückfragen, Fortschritt: Baustein „design“ (bausteine/design.js), gleich in allen Apps ----------
  var Design = window.ImagicosmosDesign;
  // art: "fehler", "gut" (grün) oder leer. Fehler merkt sich das Studio zum Nachsehen (Tests, Konsole).
  function melden(text, art, dauer) {
    if (art === "fehler") { z.fehler.push(new Date().toISOString().slice(11, 19) + " " + text); if (z.fehler.length > 20) z.fehler.shift(); }
    Design.melden(text, art === "gut" ? "ok" : art, dauer);
  }
  function fehlerMelden(e) { melden((e && e.message) || "Das hat nicht geklappt.", "fehler"); }

  // Rückfrage als Fenster. o: { ja: "Text des Knopfs", gefahr: true, eingabe: "Platzhalter", wert: "" }
  // Ergebnis: true/false, mit Eingabe der eingegebene Text oder null.
  function fragen(text, o) { return Design.fragen(text, Object.assign({ ja: "Ja" }, o)); }

  function arbeit(text, erledigt, gesamt) { Design.arbeit(text, erledigt, gesamt); }
  function arbeitEnde() { Design.arbeitEnde(); }

  function standZeigen(text, fehler) {
    var s = $("#stand");
    s.textContent = text; s.classList.toggle("fehler", !!fehler);
  }

  // ---------- Fotos anzeigen ----------
  // Jedes Foto wird einmal aus dem Speicher geholt und bekommt eine Adresse im Browser (gilt, bis die Reise geschlossen wird).
  function bildUrl(datei, reiseId) {
    var id = reiseId || (z.reise && z.reise.id), k = id + "/" + datei;
    if (!z.urls[k]) {
      z.urls[k] = speicher.medium(id, datei).then(function (b) { return b ? URL.createObjectURL(b) : ""; }).catch(function () { return ""; });
    }
    return z.urls[k];
  }
  function urlsFreigeben() {
    Object.keys(z.urls).forEach(function (k) { z.urls[k].then(function (u) { if (u) URL.revokeObjectURL(u); }); });
    z.urls = {};
  }
  function bild(datei, alt, reiseId) {
    return '<img data-datei="' + esc(datei) + '"' + (reiseId ? ' data-reise="' + esc(reiseId) + '"' : "") + ' alt="' + esc(alt || "") + '" src="data:," loading="lazy">';
  }
  function bilderLaden(wurzel) {
    Array.prototype.forEach.call((wurzel || document).querySelectorAll("img[data-datei]"), function (im) {
      var datei = im.dataset.datei, id = im.dataset.reise;
      im.removeAttribute("data-datei");
      bildUrl(datei, id).then(function (u) { if (u) im.src = u; });
    });
  }

  // ---------- Speichern ----------
  function stempel(was) {
    var t = M.jetzt();
    if (was === "stamm") z.reise.stamm_geaendert = t;
    else if (was === "tag") tag().geaendert = t;
    else if (was === "e" && z.ereignis) z.ereignis.geaendert = t;
    z.reise.geaendert = t;
    speichernBald();
  }
  function speichernBald() {
    z.offen = true;
    standZeigen("Speichert …");
    clearTimeout(z.timer);
    z.timer = setTimeout(speichernJetzt, 700);
  }
  function speichernJetzt() {
    clearTimeout(z.timer);
    if (!z.reise || !z.offen) return z.schreibt || Promise.resolve();
    z.offen = false;
    var stand = z.reise;
    z.schreibt = (z.schreibt || Promise.resolve()).then(function () { return speicher.speichern(stand); }).then(function () {
      if (!z.offen) standZeigen("Gespeichert ✓");
    }, function (e) {
      z.offen = true;
      standZeigen("Nicht gespeichert!", true);
      fehlerMelden(e);
    });
    return z.schreibt;
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) speichernJetzt(); });
  window.addEventListener("pagehide", speichernJetzt);

  // ---------- Wege ----------
  function tag() { return z.reise.tage[z.tag]; }
  function adresse(bereich, nr) {
    return "#/reise/" + z.reise.id + "/" + (bereich || z.bereich) + ((bereich || z.bereich) === "tage" ? "/" + ((nr != null ? nr : z.tag) + 1) : "");
  }
  function weg() {
    var m = location.hash.match(/^#\/reise\/([a-z0-9-]+)(?:\/(tage|reise|karte|fertig))?(?:\/(\d+))?$/);
    if (!m) { reiseSchliessen().then(liste); return; }
    var bereich = m[2] || "tage", nr = m[3] ? +m[3] - 1 : null;
    var bereit = z.reise && z.reise.id === m[1] ? Promise.resolve() : reiseSchliessen().then(function () { return speicher.laden(m[1]); }).then(function (r) {
      z.reise = r; z.tag = 0; z.exportOrdner = "";
      // am Handy unterwegs: gleich den heutigen Tag zeigen
      var heute = new Date(), h = heute.getFullYear() + "-" + ("0" + (heute.getMonth() + 1)).slice(-2) + "-" + ("0" + heute.getDate()).slice(-2);
      r.tage.forEach(function (t, i) { if (t.datum === h) z.tag = i; });
      standZeigen("");
    });
    bereit.then(function () {
      z.bereich = bereich;
      if (nr != null) z.tag = nr;
      z.tag = Math.max(0, Math.min(z.tag, z.reise.tage.length - 1));
      zeichneReise(true);
      geteiltAnbieten();
    }).catch(function (e) { fehlerMelden(e); location.hash = "#/"; });
  }
  function reiseSchliessen() {
    return speichernJetzt().then(function () { z.reise = null; z.ereignis = null; urlsFreigeben(); standZeigen(""); kopfOrt(""); });
  }
  window.addEventListener("hashchange", weg);

  // ---------- Welche Fassung läuft? ----------
  // Web-App und Android-App: beim Bauen nach fassung.js geschrieben. PC: vom Studio-Server in der Seite vermerkt.
  // Beispiel: „Imagicruise 0.1.87 · 17.11.2026 16:40 (4f1311d) · Android-App“
  function pcAngaben() {
    try { return JSON.parse(document.querySelector('meta[name="imagicruise-studio"]').content) || {}; } catch (e) { return {}; }
  }
  // nur die Nummer, z. B. „0.1.87“. Android-App: aus der App selbst (versionName), damit der Vergleich mit version.json stimmt
  function fassungNummer() {
    if (APP && APP.fassung) { try { var a = APP.fassung(); if (a) return a; } catch (e) { /* weiter unten */ } }
    return (amPc ? pcAngaben().version : (window.ImagicruiseFassung || {}).fassung) || "";
  }
  // Versionsangabe für „Über“ und die Zeile unter der Liste der Reisen: Nummer, Zeitpunkt des Baus, Commit
  function fassungAngaben() {
    var f = window.ImagicruiseFassung || {}, pc = amPc ? pcAngaben() : {};
    return { nummer: fassungNummer(), datum: (amPc ? pc.datum : f.datum) || "", stand: (amPc ? pc.stand : f.stand) || "" };
  }
  // Betrieb: am PC „PC“, sonst wie der Baustein ueber („im Browser“, „als App installiert“, „Android-App“)
  function betriebText() {
    if (amPc) return "PC";
    var U = window.ImagicosmosUeber, installiert = !!(window.matchMedia && matchMedia("(display-mode: standalone)").matches);
    return U ? U.betriebText({ android: !!APP, installiert: installiert }) : (APP ? "Android-App" : "im Browser");
  }
  // Zeile unter der Liste der Reisen, gleiches Format wie in allen Apps (Baustein ueber)
  function fassungText() {
    var U = window.ImagicosmosUeber;
    return U ? U.versionsZeile("Imagicruise", fassungAngaben(), betriebText()) : "Imagicruise " + (fassungNummer() || "lokale Testfassung");
  }

  // ---------- Liste der Reisen ----------
  function liste() {
    speicher.liste().then(function (reisen) {
      var h = '<div class="seite"><div class="seitenkopf"><h1>Meine Reisen</h1><div class="knoepfe">' +
        '<button type="button" class="ds-knopf" data-a="neu">+ Neue Reise</button>' +
        '<button type="button" class="ds-knopf ds-zweit" data-a="paket-einlesen">Reisepaket einlesen</button></div></div>';
      h += geteiltHinweis();
      h += '<p class="hinweis">' + (amPc ? "Die Reisen liegen auf diesem PC im Ordner <b>" + esc(speicher.ordner) + "</b>."
        : "Die Reisen liegen nur auf diesem Gerät, im Speicher " + (APP ? "der App" : "des Browsers") + ". Sichere sie zwischendurch als Reisepaket (in der Reise unter „Fertigstellen“) – damit holst du sie auch auf den PC.") + "</p>";
      if (!reisen.length) {
        h += '<div class="kasten leer-zustand"><div class="gross" aria-hidden="true">🧭</div><h2>Noch keine Reise</h2>' +
          '<p class="leise">Lege deine erste Reise an: Titel und Zeitraum genügen. Für jeden Tag der Reise entsteht dann eine Seite, auf der du Ereignisse und Fotos sammelst.</p>' +
          '<div class="knoepfe"><button type="button" class="ds-knopf" data-a="neu">+ Neue Reise</button>' +
          '<button type="button" class="ds-knopf ds-zweit" data-a="beispiel">Beispielreise ansehen</button></div></div>';
      } else {
        h += '<div class="reisen">' + reisen.map(function (r) {
          return '<button type="button" class="reisekarte" data-a="oeffnen" data-id="' + esc(r.id) + '"><span class="bild">' +
            (r.titelbild ? bild(r.titelbild, "", r.id) : "<span aria-hidden=\"true\">🧭</span>") + '</span><span class="inhalt"><b>' + esc(r.titel || "Reise ohne Titel") + "</b>" +
            '<span class="leise klein-text">' + esc(M.zeitraumText(r.von, r.bis) || "ohne Zeitraum") + "</span>" +
            '<span class="leise klein-text">' + r.tage + (r.tage === 1 ? " Tag" : " Tage") + " · " + r.ereignisse + (r.ereignisse === 1 ? " Ereignis" : " Ereignisse") + " · " + r.fotos + (r.fotos === 1 ? " Foto" : " Fotos") + "</span></span></button>";
        }).join("") + "</div>" + '<p class="klein-text leise"><button type="button" class="ds-knopf ds-klein ds-zweit" data-a="beispiel">Beispielreise ansehen</button></p>';
      }
      ansicht.innerHTML = h + '<p class="fassung klein-text leise">' + esc(fassungText()) + "</p></div>";
      bilderLaden(ansicht);
      window.scrollTo(0, 0);
      rundgangVielleicht("liste");
    }).catch(function (e) {
      ansicht.innerHTML = '<div class="seite"><p class="hinweis warn">' + esc((e && e.message) || "Die Reisen konnten nicht geladen werden.") + "</p></div>";
    });
  }

  function neueReiseFragen() {
    var d = $("#frage"), heute = new Date().toISOString().slice(0, 10);
    d.innerHTML = '<form method="dialog"><h2>Neue Reise</h2>' +
      '<label class="feld"><span>Titel</span><input type="text" id="neu-titel" placeholder="z. B. Westliches Mittelmeer 2026" required autocomplete="off"></label>' +
      '<label class="feld"><span>Art der Reise</span><select id="neu-art">' + Arten.REISEARTEN.map(function (a) { return '<option value="' + a.id + '">' + esc(a.name) + "</option>"; }).join("") + "</select></label>" +
      '<div class="felder zwei"><label class="feld"><span>Erster Tag</span><input type="date" id="neu-von" value="' + heute + '" required></label>' +
      '<label class="feld"><span>Letzter Tag</span><input type="date" id="neu-bis" value="' + heute + '" required></label></div>' +
      '<p class="klein-text leise">Den Zeitraum kannst du später ändern. Für jeden Tag entsteht eine eigene Seite.</p>' +
      '<div class="knoepfe"><button type="button" class="ds-knopf ds-zweit" id="frage-nein">Abbrechen</button><button type="submit" class="ds-knopf" value="ja">Reise anlegen</button></div></form>';
    $("#frage-nein").onclick = function () { d.close("nein"); };
    $("#neu-von").onchange = function () { if ($("#neu-bis").value < this.value) $("#neu-bis").value = this.value; };
    d.returnValue = "nein";
    d.onclose = function () {
      if (d.returnValue !== "ja") return;
      var von = $("#neu-von").value, bis = $("#neu-bis").value;
      if (!M.istDatum(von)) { melden("Bitte den ersten Tag der Reise angeben.", "fehler"); return; }
      if (!M.istDatum(bis) || bis < von) bis = von;
      if (M.tageZwischen(von, bis) > 365) { melden("Eine Reise kann höchstens ein Jahr dauern.", "fehler"); return; }
      var r = M.neueReise({ titel: $("#neu-titel").value.trim(), art: $("#neu-art").value, von: von, bis: bis });
      speicher.speichern(r).then(function () { location.hash = "#/reise/" + r.id + "/tage/1"; }).catch(fehlerMelden);
    };
    d.showModal();
    $("#neu-titel").focus();
  }

  // ---------- Eine Reise ----------
  function reiter() {
    var namen = { tage: "Tage", reise: "Reise", karte: "Karte", fertig: "Fertigstellen" };
    return '<nav class="reiter" aria-label="Bereiche der Reise"><a class="zurueck" href="#/" aria-label="Zur Liste der Reisen">← Reisen</a>' +
      Object.keys(namen).map(function (b) {
        return '<a href="' + adresse(b) + '"' + (b === z.bereich ? ' aria-current="page"' : "") + ">" + namen[b] + "</a>";
      }).join("") + "</nav>";
  }
  function zeichneReise(nachOben) {
    var y = window.scrollY, bereiche = { tage: tageBereich, reise: reiseBereich, karte: kartenBereich, fertig: fertigBereich };
    kopfOrt(z.reise.titel || "Reise ohne Titel");
    if (z.route) { z.route.stopp(); z.route = null; }
    ansicht.innerHTML = reiter() + '<div class="seite">' + bereiche[z.bereich]() + "</div>";
    bilderLaden(ansicht);
    var karte = ansicht.querySelector("#studio-karte");
    if (karte) { z.karteSteuerung = Karte.bedienen(karte, kartenOptionen(M.stationen(z.reise))); if (z.punkteZiehen) punkteZiehenAn(karte); }
    var an = ansicht.querySelector(".tagesleiste .an");
    if (an) an.parentNode.scrollLeft = an.offsetLeft - an.parentNode.clientWidth / 2 + an.clientWidth / 2;
    window.scrollTo(0, nachOben ? 0 : y);
    rundgangVielleicht(z.bereich);
  }

  function auswahl(liste, wert, mitZeichen) {
    return liste.map(function (a) {
      return '<option value="' + a.id + '"' + (a.id === wert ? " selected" : "") + ">" + (mitZeichen && a.zeichen ? a.zeichen + " " : "") + esc(a.name) + "</option>";
    }).join("");
  }

  // ----- Bereich „Tage“ -----
  function tagesleiste() {
    return '<div class="tagesleiste" role="tablist" aria-label="Tage der Reise">' + z.reise.tage.map(function (t, i) {
      return '<button type="button" role="tab" data-a="tag" data-nr="' + i + '" class="' + (i === z.tag ? "an" : "") + (M.tagHatInhalt(t) ? " voll" : "") + '" aria-selected="' + (i === z.tag) + '">' +
        "<b>Tag " + (i + 1) + "</b><span>" + esc(M.wochentag(t.datum).slice(0, 2) + " " + M.datumText(t.datum, true)) + (t.ort.name ? " · " + esc(t.ort.name) : "") + "</span></button>";
    }).join("") + "</div>";
  }
  function ortfeld(wer) {
    var o = (wer === "tag" ? tag() : z.ereignis).ort, hat = M.hatKoordinaten(o);
    return '<div class="ortfeld" id="ort-' + wer + '"><label class="feld"><span>Ort</span><input type="text" data-f="' + wer + '.ort.name" value="' + esc(o.name) + '" placeholder="' +
      (wer === "tag" ? "z. B. Barcelona" : "z. B. Sagrada Família") + '" autocomplete="off"></label><div class="ort-zeile">' +
      (hat ? '<span class="ort-pos">📍 Position für die Karte: ' + String(o.lat.toFixed(4)).replace(".", ",") + " / " + String(o.lon.toFixed(4)).replace(".", ",") +
        '<button type="button" data-a="ort-weg" data-wer="' + wer + '" aria-label="Position entfernen">×</button></span>'
        : '<span class="ort-ohne">Noch keine Position für die Karte.</span>') + '</div><div class="knoepfe">' +
      '<button type="button" class="ds-knopf ds-klein ds-zweit" data-a="ort-suchen" data-wer="' + wer + '">Position suchen</button>' +
      '<button type="button" class="ds-knopf ds-klein ds-zweit" data-a="ort-hier" data-wer="' + wer + '">Mein Standort</button>' +
      '<button type="button" class="ds-knopf ds-klein ds-zweit" data-a="ort-eingeben" data-wer="' + wer + '">Koordinaten eingeben</button>' +
      '<button type="button" class="ds-knopf ds-klein ds-zweit" data-a="ort-infos" data-wer="' + wer + '">Infos zum Ort</button></div>' +
      '<div class="treffer" id="treffer-' + wer + '"></div></div>';
  }
  function ereigniskarte(e) {
    var a = Arten.ereignisart(e.art), n = e.fotos.length;
    return '<li><button type="button" class="ereignis" data-a="ereignis" data-id="' + esc(e.id) + '"><span class="zeichen" aria-hidden="true">' + a.zeichen + "</span><span>" +
      '<span class="kopfzeile">' + (e.zeit ? "<b>" + esc(e.zeit) + (e.ende ? " – " + esc(e.ende) : "") + " Uhr</b>" : "") + "<span>" + esc(a.name) + "</span>" +
      (e.ort.name ? "<span>📍 " + esc(e.ort.name) + "</span>" : "") + (e.bewertung ? "<span>" + "★".repeat(e.bewertung) + "</span>" : "") + "</span>" +
      (e.titel ? '<span class="titel">' + esc(e.titel) + "</span>" : '<span class="titel fehlt">Noch ohne Titel – antippen zum Ergänzen</span>') +
      (e.text ? '<span class="auszug">' + esc(e.text) + "</span>" : "") +
      (n ? '<span class="streifen">' + e.fotos.slice(0, 5).map(function (f) { return bild(f.datei, f.text); }).join("") + (n > 5 ? '<span class="mehr">+' + (n - 5) + "</span>" : "") + "</span>" : "") +
      "</span></button></li>";
  }
  function tageBereich() {
    var t = tag();
    if (!t) return '<div class="kasten leer-zustand"><h2>Die Reise hat noch keinen Zeitraum</h2><p class="leise">Trage im Bereich „Reise“ den ersten und den letzten Tag ein.</p>' +
      '<a class="ds-knopf" href="' + adresse("reise") + '">Zeitraum eintragen</a></div>';
    var ereignisse = M.ereignisseSortiert(t);
    return tagesleiste() + '<div class="tag-raster"><section class="kasten" aria-label="Angaben zum Tag">' +
      '<div class="tagkopf"><button type="button" class="rund" data-a="tag" data-nr="' + (z.tag - 1) + '" aria-label="Vorheriger Tag"' + (z.tag ? "" : " disabled") + ">‹</button>" +
      '<div><div class="nr">Tag ' + (z.tag + 1) + " von " + z.reise.tage.length + "</div><h1>" + esc(M.wochentag(t.datum) + ", " + M.datumText(t.datum)) + "</h1></div>" +
      '<button type="button" class="rund" data-a="tag" data-nr="' + (z.tag + 1) + '" aria-label="Nächster Tag"' + (z.tag < z.reise.tage.length - 1 ? "" : " disabled") + ">›</button></div>" +
      '<div class="felder"><label class="feld"><span>Überschrift des Tages</span><input type="text" data-f="tag.titel" value="' + esc(t.titel) + '" placeholder="z. B. Ankunft in Barcelona" autocomplete="off"></label>' +
      '<label class="feld"><span>Art des Tages</span><select data-f="tag.art">' + auswahl(Arten.TAGESARTEN, t.art, true) + "</select></label>" + ortfeld("tag") +
      '' + textfeld("Was war heute?", "tag.text", t.text, "Ein paar Sätze zum Tag: Wetter, Stimmung, was euch aufgefallen ist.") + "</div>" +
      (tagAussen(t) ? '<p class="hinweis">Dieser Tag liegt außerhalb des Zeitraums der Reise. Er ist entstanden, weil ein Foto von diesem Tag eingelesen wurde.</p>' : "") +
      '<div class="knoepfe"><button type="button" class="ds-knopf ds-klein ds-zweit" data-a="status-tag">Als Status teilen</button>' +
      (tagAussen(t) || M.tagHatInhalt(t) ? '<button type="button" class="ds-knopf ds-klein ds-zweit" data-a="tag-leeren">' + (tagAussen(t) ? "Tag löschen" : "Tag leeren") + "</button>" : "") + "</div>" +
      "</section>" +
      '<section class="kasten" aria-label="Ereignisse des Tages"><h2>Ereignisse <span class="leise klein-text">' + (ereignisse.length || "") + '</span></h2><div class="knoepfe">' +
      '<button type="button" class="ds-knopf" data-a="ereignis-neu">+ Ereignis</button>' +
      '<button type="button" class="ds-knopf ds-zweit" data-a="fotos-tag">Fotos zum Tag</button></div>' +
      (ereignisse.length ? '<ol class="ereignisse">' + ereignisse.map(ereigniskarte).join("") + "</ol>"
        : '<p class="leise">Noch kein Ereignis. Ein Ereignis ist alles, was ihr an diesem Tag erlebt habt: eine Sehenswürdigkeit, ein Ausflug, ein Abendessen, ein Konzert.</p>' +
          '<p class="leise klein-text">Tipp: Über „Fotos zum Tag“ entstehen die Ereignisse von selbst – die Fotos werden nach Aufnahmezeit gebündelt.</p>') +
      "</section></div>";
  }

  // Liegt der Tag außerhalb des Zeitraums der Reise? (So ein Tag entsteht, wenn ein Foto von einem anderen Tag eingelesen wird.)
  function tagAussen(t) { return !!t && M.istDatum(z.reise.von) && M.istDatum(z.reise.bis) && (t.datum < z.reise.von || t.datum > z.reise.bis); }
  // Leere Tage außerhalb des Zeitraums entfernen; der gezeigte Tag bleibt derselbe, wenn es ihn noch gibt
  function tageAufraeumen() {
    var jetzt = tag(), vorher = z.reise.tage.length;
    M.tageAnpassen(z.reise);
    var nr = z.reise.tage.indexOf(jetzt);
    z.tag = nr >= 0 ? nr : Math.max(0, Math.min(z.tag, z.reise.tage.length - 1));
    return vorher - z.reise.tage.length;
  }

  // ----- Ereignis bearbeiten -----
  function ereignisBlatt() {
    var e = z.ereignis, b = $("#blatt");
    b.innerHTML = '<div class="blatt-kopf"><h2 id="blatt-titel">Ereignis</h2><button type="button" class="ds-knopf ds-klein" data-a="blatt-zu">Fertig</button></div><div class="blatt-inhalt">' +
      '<div class="feld"><span class="feldname">Art</span><div class="arten" id="e-arten">' + Arten.EREIGNISARTEN.map(function (a) {
        return '<button type="button" data-a="e-art" data-art="' + a.id + '" class="' + (a.id === e.art ? "an" : "") + '" aria-pressed="' + (a.id === e.art) + '">' + a.zeichen + " " + esc(a.name) + "</button>";
      }).join("") + "</div></div>" +
      '<label class="feld"><span>Titel</span><input type="text" data-f="e.titel" value="' + esc(e.titel) + '" placeholder="z. B. Sagrada Família" autocomplete="off"></label>' +
      '<div class="felder zwei"><label class="feld"><span>Uhrzeit von</span><input type="time" data-f="e.zeit" value="' + esc(e.zeit) + '"></label>' +
      '<label class="feld"><span>bis (wenn du magst)</span><input type="time" data-f="e.ende" value="' + esc(e.ende) + '"></label></div>' + ortfeld("e") +
      '' + textfeld("Was habt ihr erlebt?", "e.text", e.text, "Erzähle, was ihr gesehen und erlebt habt.", "", true) +
      '<div class="feld"><span class="feldname">Wie war es?</span><div class="sterne-wahl" id="e-sterne"></div></div>' +
      '<div class="feld"><span class="feldname" id="e-fotos-titel"></span><div class="fotoliste" id="e-fotos"></div>' +
      '<div class="knoepfe"><button type="button" class="ds-knopf ds-zweit" data-a="fotos-ereignis">+ Fotos hinzufügen</button>' +
      '<button type="button" class="ds-knopf ds-zweit" data-a="status-ereignis">Als Status teilen</button>' +
      (V.kann() ? '<button type="button" class="ds-knopf ds-zweit" data-a="video-ereignis">+ Video</button>' : "") + "</div>" +
      '<small class="leise">Fotos werden verkleinert gespeichert. Aufnahmeort und Kameradaten bleiben nicht im Bild.</small></div>' +
      (z.reise.tage.length > 1 ? '<label class="feld"><span>Gehört zu</span><select data-f="e.tag">' + z.reise.tage.map(function (t, i) {
        return '<option value="' + i + '"' + (i === z.tag ? " selected" : "") + ">Tag " + (i + 1) + " · " + esc(M.wochentag(t.datum).slice(0, 2) + " " + M.datumText(t.datum, true)) + "</option>";
      }).join("") + "</select></label>" : "") +
      '</div><div class="blatt-fuss"><button type="button" class="ds-knopf ds-gefahr" data-a="e-loeschen">Löschen</button><button type="button" class="ds-knopf" data-a="blatt-zu">Fertig</button></div>';
    sterneZeichnen(); fotolisteZeichnen();
  }
  function sterneZeichnen() {
    var e = z.ereignis, h = "";
    for (var i = 1; i <= 5; i++) h += '<button type="button" data-a="e-sterne" data-n="' + i + '" class="' + (i <= e.bewertung ? "an" : "") + '" aria-label="' + i + (i === 1 ? " Stern" : " Sterne") + '" aria-pressed="' + (i === e.bewertung) + '">★</button>';
    $("#e-sterne").innerHTML = h + (e.bewertung ? '<button type="button" class="ds-knopf ds-klein ds-zweit" data-a="e-sterne" data-n="0">keine</button>' : "");
  }
  function fotolisteZeichnen() {
    var e = z.ereignis, n = e.fotos.length;
    $("#e-fotos-titel").textContent = n ? "Fotos (" + n + ")" : "Fotos";
    $("#e-fotos").innerHTML = e.fotos.map(function (f, i) {
      return '<div class="fotokarte' + (f.video ? " video" : "") + '">' + (f.video ? '<span class="videomarke">▶ ' + dauerText(f.dauer) + "</span>" : "") + bild(f.datei, f.text) + '<input type="text" data-f="foto.text" data-i="' + i + '" value="' + esc(f.text) + '" placeholder="Bildtext" aria-label="Bildtext zu Foto ' + (i + 1) + '" autocomplete="off">' +
        '<div class="leiste"><button type="button" data-a="foto-schieben" data-i="' + i + '" data-um="-1" aria-label="Foto nach vorn"' + (i ? "" : " disabled") + ">←</button>" +
        '<button type="button" data-a="foto-schieben" data-i="' + i + '" data-um="1" aria-label="Foto nach hinten"' + (i < n - 1 ? "" : " disabled") + ">→</button>" +
        '<button type="button" data-a="foto-bearbeiten" data-i="' + i + '"' + (f.video ? " disabled" : "") + ' class="' + (f.bearbeitung ? "bearbeitet" : "") + '" aria-label="Foto bearbeiten' + (f.bearbeitung ? " (ist bearbeitet)" : "") + '" title="Foto bearbeiten: drehen, zuschneiden, Licht, Filter">✎</button>' +
        '<button type="button" data-a="foto-titelbild" data-i="' + i + '" class="' + (z.reise.titelbild === f.datei ? "an" : "") + '" aria-label="Als Titelbild der Reise" title="Als Titelbild der Reise">★</button>' +
        '<button type="button" data-a="foto-weg" data-i="' + i + '" aria-label="Foto entfernen" title="Foto entfernen">🗑</button></div></div>';
    }).join("");
    bilderLaden($("#e-fotos"));
  }
  function ortfeldNeu(wer) {
    var alt = $("#ort-" + wer);
    if (!alt) return;
    var d = document.createElement("div");
    d.innerHTML = ortfeld(wer);
    alt.replaceWith(d.firstChild);
  }
  function ereignisOeffnen(e) { z.ereignis = e; ereignisBlatt(); $("#blatt").showModal(); rundgangVielleicht("ereignis"); }
  function blattSchliessen() {
    var b = $("#blatt");
    if (b.open) b.close();
  }
  $("#blatt").addEventListener("close", function () { diktatEnde(); z.ereignis = null; if (z.reise) zeichneReise(); });

  // ----- Bereich „Reise“ -----
  function reiseBereich() {
    var r = z.reise, fotos = M.alleFotos(r), gesehen = {};
    fotos = fotos.filter(function (x) { if (gesehen[x.foto.datei]) return false; gesehen[x.foto.datei] = true; return true; });
    return '<section class="kasten"><h2>Angaben zur Reise</h2><div class="felder zwei">' +
      '<label class="feld breit"><span>Titel</span><input type="text" data-f="reise.titel" value="' + esc(r.titel) + '" placeholder="z. B. Westliches Mittelmeer 2026" autocomplete="off"></label>' +
      '<label class="feld breit"><span>Unterzeile</span><input type="text" data-f="reise.untertitel" value="' + esc(r.untertitel) + '" placeholder="z. B. Sieben Tage, fünf Häfen, viel Sonne" autocomplete="off"></label>' +
      '<label class="feld"><span>Art der Reise</span><select data-f="reise.art">' + auswahl(Arten.REISEARTEN, r.art) + "</select></label>" +
      '<label class="feld"><span>Wer war dabei?</span><input type="text" data-f="reise.reisende" value="' + esc(r.reisende) + '" placeholder="z. B. Anna &amp; Paul" autocomplete="off"></label>' +
      '<label class="feld"><span>Erster Tag</span><input type="date" data-f="reise.von" value="' + esc(r.von) + '"></label>' +
      '<label class="feld"><span>Letzter Tag</span><input type="date" data-f="reise.bis" value="' + esc(r.bis) + '"></label>' +
      '<p class="klein-text leise breit">Verkürzt du den Zeitraum, bleiben Tage mit Inhalt erhalten. Leere Tage außerhalb verschwinden.</p>' +
      '' + textfeld("Einleitung", "reise.einleitung", r.einleitung, "Wie kam es zu der Reise? Worauf habt ihr euch gefreut?", "breit") +
      '' + textfeld("Schlusswort", "reise.schluss", r.schluss, "Was bleibt? Was war das Schönste?", "breit") + "</div></section>" +
      '<section class="kasten"><h2>Fotos der ganzen Reise</h2><p class="leise">Wähle alle Fotos der Reise auf einmal. Imagicruise ordnet sie nach dem Aufnahmedatum den Tagen zu und bündelt sie zu Ereignissen ' +
      "(neues Ereignis nach einer Pause von 45 Minuten). Danach ergänzt du nur noch Titel und Text.</p>" +
      '<div class="knoepfe"><button type="button" class="ds-knopf" data-a="fotos-reise">Fotos der Reise einlesen</button></div></section>' +
      '<section class="kasten"><h2>Titelbild</h2>' + (fotos.length ? '<p class="leise klein-text">Das Titelbild steht groß auf der ersten Seite des Reiseberichts. Ohne Wahl nimmt Imagicruise das erste Foto.</p>' +
        '<div class="bildwahl">' + fotos.map(function (x) {
          return '<button type="button" data-a="titelbild" data-datei="' + esc(x.foto.datei) + '" class="' + (r.titelbild === x.foto.datei ? "an" : "") + '" aria-pressed="' + (r.titelbild === x.foto.datei) + '" aria-label="Als Titelbild wählen">' + bild(x.foto.datei, x.foto.text) + "</button>";
        }).join("") + "</div>" : '<p class="leise">Sobald die Reise Fotos hat, kannst du hier das Titelbild wählen.</p>') + "</section>";
  }

  // ----- Bereich „Karte“ -----
  function kartenBereich() {
    var st = M.stationen(z.reise), ohne = [];
    z.reise.tage.forEach(function (t, i) {
      if (t.ort.name && !M.hatKoordinaten(t.ort)) ohne.push({ tag: i, text: "Tag " + (i + 1) + ": " + t.ort.name });
      t.ereignisse.forEach(function (e) { if (e.ort.name && !M.hatKoordinaten(e.ort)) ohne.push({ tag: i, text: "Tag " + (i + 1) + ": " + e.ort.name }); });
    });
    var h = '<section class="kasten"><h2>Karte der Reise</h2>';
    if (!st.length) h += '<p class="leise">Die Karte entsteht aus den Orten der Tage und Ereignisse. Trage bei einem Ort eine Position ein („Position suchen“, „Mein Standort“ oder „Koordinaten eingeben“) – ' +
      "oder füge Fotos mit Ortsangabe hinzu, dann schlägt Imagicruise die Position vor.</p>";
    else h += '<div class="karte" id="studio-karte">' + Karte.svg(kartenOptionen(st)) + "</div>" +
      '<div class="knoepfe">' + (st.length > 1 && !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) ? '<button type="button" class="ds-knopf ds-zweit ds-klein" data-a="route-abspielen" id="route-abspielen">▶ Route abspielen</button>' : "") +
        '<button type="button" class="ds-knopf ds-zweit ds-klein" data-a="punkte-ziehen" id="punkte-ziehen" aria-pressed="' + !!z.punkteZiehen + '">' + (z.punkteZiehen ? "✓ Punkte verschieben: an" : "✋ Punkte verschieben") + "</button>" +
        (rueckSchritte().length ? '<button type="button" class="ds-knopf ds-zweit ds-klein" data-a="punkt-zurueck" id="punkt-zurueck">↶ Rückgängig</button>' : "") + "</div>" +
      (z.punkteZiehen ? '<p class="hinweis">Ziehe eine Marke mit Maus oder Finger an die richtige Stelle. Am genauesten geht es, wenn du vorher mit + heranzoomst. ' +
        "Die neue Position gilt für den Tag bzw. das Ereignis, zu dem die Marke gehört.</p>" : "") +
      '<p class="klein-text leise">Die Zahlen sind die Tage der Reise. Die Karte ist gezeichnet: Küstenlinien und Route, keine Straßen. Es wird nichts aus dem Internet geladen. ' +
      "Mit + und − oder dem Mausrad zoomst du, auf dem Handy mit zwei Fingern; ziehen (Maus oder ein Finger) verschiebt den Ausschnitt. " +
      "Im Reisebericht zeigt die Übersichtskarte je Tag eine Marke; dort lässt sich die Route ebenfalls abspielen und zoomen.</p>" + streckenListe(st);
    if (ohne.length) h += '<div class="hinweis warn"><b>Ohne Position – fehlt auf der Karte:</b><ul>' + ohne.map(function (o) {
      return '<li><a href="' + adresse("tage", o.tag) + '">' + esc(o.text) + "</a></li>";
    }).join("") + "</ul></div>";
    return h + "</section>";
  }

  function kartenOptionen(st) {
    return { stationen: st, breite: window.innerWidth < 700 ? 440 : 900, hoehe: window.innerWidth < 700 ? 360 : 520, reiseart: z.reise.art,
      ansicht: z.kartenAnsicht && z.kartenAnsicht.reise === z.reise.id ? z.kartenAnsicht.v : null,
      beiAnsicht: function (v) { z.kartenAnsicht = v ? { reise: z.reise.id, v: v } : null; }, ziehbar: !!z.punkteZiehen, sofort: true };
  }
  // ----- Routenpunkte verschieben -----
  // Mit dem Schalter „Punkte verschieben“ lassen sich die Marken ziehen. Gespeichert wird die Position am Tag bzw. am
  // Ereignis, zu dem die Station gehört (M.stationen: art, tag, ereignis); „Rückgängig“ holt bis zu 20 Schritte zurück.
  function rueckSchritte() { return (z.punktRueck || []).filter(function (x) { return x.reise === z.reise.id; }); }
  function stationsZiel(s) {
    var t = s && z.reise.tage[s.tag];
    if (!t) return null;
    return s.art === "ereignis" ? t.ereignisse.filter(function (e) { return e.id === s.ereignis; })[0] || null : t;
  }
  function positionSetzen(ziel, lat, lon) {
    ziel.ort.lat = lat; ziel.ort.lon = lon;
    var jetzt = M.jetzt();
    ziel.geaendert = jetzt; z.reise.geaendert = jetzt;
    speichernBald();
  }
  function punktSetzen(i, x, y) {
    var a = z.karteSteuerung && z.karteSteuerung.ausschnitt(), s = M.stationen(z.reise)[i], ziel = stationsZiel(s);
    if (!a || !ziel) return;
    var lat = Math.round(Math.max(-85, Math.min(85, a.lat(y))) * 1e5) / 1e5, lon = Math.round(Math.max(-180, Math.min(180, a.lon(x))) * 1e5) / 1e5;
    z.punktRueck = (z.punktRueck || []).concat([{ reise: z.reise.id, tag: s.tag, art: s.art, ereignis: s.ereignis || null, lat: ziel.ort.lat, lon: ziel.ort.lon, name: s.name }]).slice(-20);
    positionSetzen(ziel, lat, lon);
    zeichneReise();
    melden("Neue Position für „" + (s.name || "ohne Namen") + "“.", "gut");
  }
  function punkteZiehenAn(karte) {
    karte.classList.add("ik-ziehen");
    karte.addEventListener("pointerdown", function (ev) {
      var g = ev.target.closest(".ik-punkt.ik-ziehbar"), svgEl = karte.querySelector("svg.ik-karte");
      if (!g || !svgEl || (ev.pointerType === "mouse" && ev.button !== 0)) return;
      ev.preventDefault();
      var r = svgEl.getBoundingClientRect(), f = r.width / svgEl.viewBox.baseVal.width, id = ev.pointerId, x = null, y = null;
      g.classList.add("ik-zieht");
      g.parentNode.appendChild(g);                                      // obenauf
      try { karte.setPointerCapture(id); } catch (e) { /* egal */ }
      var bewegen = function (e) {
        if (e.pointerId !== id) return;
        x = Math.max(0, Math.min(r.width, e.clientX - r.left)) / f; y = Math.max(0, Math.min(r.height, e.clientY - r.top)) / f;
        g.setAttribute("transform", "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ")");
      };
      var los = function (e) {
        if (e.pointerId !== id) return;
        karte.removeEventListener("pointermove", bewegen); karte.removeEventListener("pointerup", los); karte.removeEventListener("pointercancel", los);
        g.classList.remove("ik-zieht");
        if (x != null && e.type === "pointerup") punktSetzen(+g.dataset.i, x, y); else zeichneReise();
      };
      karte.addEventListener("pointermove", bewegen); karte.addEventListener("pointerup", los); karte.addEventListener("pointercancel", los);
    });
  }
  // Strecken zwischen den Stationen mit ihrem Verkehrsmittel. Gespeichert wird es am Ziel der Strecke (Feld `anreise` an Tag
  // oder Ereignis); ohne Eintrag schätzt die Karte (karte.js: verkehrsmittel), die Auswahl zeigt dann „Automatisch: …“.
  function streckenListe(st) {
    if (st.length < 2) return '<ol class="stationen">' + st.map(function (s) { return "<li><b>Tag " + (s.tag + 1) + "</b> " + esc(s.name || "ohne Namen") + "</li>"; }).join("") + "</ol>";
    return '<h3 class="strecken-titel">Strecken und Verkehrsmittel</h3><p class="klein-text leise">Wie bist du von Ort zu Ort gekommen? Ohne Wahl schätzt Imagicruise ' +
      "aus der Art der Reise und der Entfernung.</p>" +
      '<ol class="strecken">' + st.slice(1).map(function (s, i) {
        var vor = st[i], g = Karte.verkehrsmittel(vor, s, z.reise.art);
        var auto = g.geschaetzt ? g.id : Karte.verkehrsmittel(vor, Object.assign({}, s, { anreise: "" }), z.reise.art).id, autoArt = Arten.verkehrsmittel(auto);
        var kennung = "strecke-" + (i + 1);
        return '<li><label for="' + kennung + '"><b>Tag ' + (s.tag + 1) + "</b> " + esc(vor.name || "ohne Namen") + " → " + esc(s.name || "ohne Namen") +
          ' <span class="leise klein-text">' + Math.round(Karte.km(vor, s)) + " km</span></label>" +
          '<select id="' + kennung + '" class="anreise-wahl" data-tag="' + s.tag + '"' + (s.ereignis ? ' data-e="' + esc(s.ereignis) + '"' : "") + ">" +
          '<option value=""' + (g.geschaetzt ? " selected" : "") + ">Automatisch: " + (autoArt ? autoArt.zeichen + " " + esc(autoArt.name) : "") + "</option>" +
          Arten.VERKEHRSMITTEL.map(function (v) { return '<option value="' + v.id + '"' + (!g.geschaetzt && v.id === g.id ? " selected" : "") + ">" + v.zeichen + " " + esc(v.name) + "</option>"; }).join("") +
          "</select></li>";
      }).join("") + "</ol>";
  }
  function anreiseSetzen(el) {
    var t = z.reise.tage[+el.dataset.tag], ziel = t;
    if (!t) return;
    if (el.dataset.e) ziel = t.ereignisse.filter(function (e) { return e.id === el.dataset.e; })[0];
    if (!ziel) return;
    if (el.value) ziel.anreise = el.value; else delete ziel.anreise;
    var jetzt = M.jetzt();
    ziel.geaendert = jetzt; z.reise.geaendert = jetzt;
    speichernBald();
    zeichneReise();
    var neu = document.getElementById(el.id);
    if (neu) neu.focus();
  }

  // ----- Bereich „Fertigstellen“ -----
  function fertigBereich() {
    var pl = M.pruefliste(z.reise), zahl = M.zahlen(z.reise), teilen = !!(APP || (navigator.canShare && window.File));
    var ziel = function (p) {
      var a = p.ziel === "tag" ? adresse("tage", p.tag) : p.ziel === "tage" ? adresse("tage") : adresse(p.ziel);
      return '<a href="' + a + '">ansehen</a>';
    };
    var h = '<section class="kasten"><h2>Prüfliste</h2><ul class="pruefliste">' + (pl.length ? pl.map(function (p) {
      return '<li class="' + p.art + '"><span>' + esc(p.text) + "</span>" + ziel(p) + "</li>";
    }).join("") : '<li class="gut"><span>Alles da: ' + zahl.tage + " Tage, " + zahl.ereignisse + " Ereignisse, " + zahl.fotos + " Fotos.</span></li>") + "</ul></section>";

    h += '<section class="kasten"><h2>Reisebericht</h2><p class="leise">Der Reisebericht ist eine kleine Webseite: Titelseite mit Karte, dann jeder Tag mit seinen Ereignissen und Fotos. ' +
      "Er braucht keinen besonderen Server und lädt nichts von fremden Servern.</p>" +
      '<div class="knoepfe"><button type="button" class="ds-knopf" data-a="vorschau">Vorschau ansehen</button>' +
      (amPc ? '<button type="button" class="ds-knopf ds-zweit" data-a="bericht-ordner">Reisebericht erzeugen</button>' : "") +
      '<button type="button" class="ds-knopf ds-zweit" data-a="bericht-zip">Als ZIP-Datei speichern</button></div>';
    if (z.exportOrdner) h += '<p class="hinweis"><b>Fertig.</b> Der Reisebericht liegt in diesem Ordner:</p><p class="pfad">' + esc(z.exportOrdner) + "</p>" +
      '<div class="knoepfe"><button type="button" class="ds-knopf ds-klein ds-zweit" data-a="ordner" data-welcher="veroeffentlicht">Ordner öffnen</button></div>';
    h += '<details><summary>So kommt der Reisebericht ins Internet</summary><ol class="schritte">' +
      "<li>Reisebericht erzeugen (Ordner) oder als ZIP-Datei speichern und entpacken.</li>" +
      "<li>Den <b>ganzen Ordner</b> auf einen Webspace laden – zum Beispiel beim eigenen Anbieter, bei Netlify („Drop“) oder Cloudflare Pages.</li>" +
      "<li>Die Adresse weitergeben. Zum Ansehen ohne Internet genügt ein Doppelklick auf <b>index.html</b> im Ordner.</li></ol>" +
      '<p class="hinweis warn">In dieser Beta hat der Reisebericht <b>kein Passwort</b>: Wer die Adresse kennt, kann ihn lesen. Suchmaschinen werden gebeten, ihn nicht aufzunehmen.</p></details></section>';

    h += '<section class="kasten"><h2>Abgleich zwischen PC und Handy</h2><p class="leise">Ein Reisepaket ist eine Datei mit der ganzen Reise samt Fotos. ' +
      "Speichere es auf dem einen Gerät und lies es auf dem anderen ein. Imagicruise führt beide Stände zusammen: Für jeden Tag und jedes Ereignis gilt der neuere Stand, nichts wird doppelt.</p>" +
      '<div class="knoepfe"><button type="button" class="ds-knopf" data-a="paket-speichern">Reisepaket speichern</button>' +
      (teilen ? '<button type="button" class="ds-knopf ds-zweit" data-a="paket-teilen">Reisepaket teilen</button>' : "") +
      '<button type="button" class="ds-knopf ds-zweit" data-a="paket-einlesen">Reisepaket einlesen</button></div>' +
      (amPc ? '<div class="knoepfe"><button type="button" class="ds-knopf ds-klein ds-zweit" data-a="ordner" data-welcher="reise">Ordner der Reise öffnen</button></div>' : "") + "</section>";

    h += '<section class="kasten"><h2>Reise löschen</h2><p class="leise">' + (amPc ? "Die Reise wandert in den Ordner „Papierkorb“ im Reisen-Ordner und lässt sich von dort zurückholen."
      : "Die Reise wird mit allen Fotos von diesem Gerät gelöscht. Das lässt sich nicht rückgängig machen – vorher ein Reisepaket speichern.") +
      '</p><div class="knoepfe"><button type="button" class="ds-knopf ds-gefahr" data-a="reise-loeschen">Reise löschen</button></div></section>';
    return h;
  }

  // ---------- Felder ----------
  function setzen(pfad, wert, el) {
    var t = pfad.split("."), wer = t[0], feld = t[1];
    if (wer === "reise") { z.reise[feld] = wert; stempel("stamm"); if (feld === "titel") kopfOrt(wert || "Reise ohne Titel"); }
    else if (wer === "tag") { if (feld === "ort") tag().ort.name = wert; else tag()[feld] = wert; stempel("tag"); }
    else if (wer === "e" && z.ereignis) {
      if (feld === "ort") z.ereignis.ort.name = wert;
      else if (feld === "tag") { ereignisVerschieben(+wert); return; }
      else z.ereignis[feld] = wert;
      stempel("e");
    } else if (wer === "foto" && z.ereignis) { z.ereignis.fotos[+el.dataset.i].text = wert; stempel("e"); }
  }
  document.addEventListener("input", function (ev) {
    var f = ev.target.dataset && ev.target.dataset.f;
    if (!f || !z.reise || /^(date|time)$/.test(ev.target.type) || ev.target.tagName === "SELECT") return;
    setzen(f, ev.target.value, ev.target);
  });
  document.addEventListener("change", function (ev) {
    var el = ev.target, f = el.dataset && el.dataset.f;
    if (el.id === "datei-fotos") { if (el.files.length) fotosEinlesen(Array.prototype.slice.call(el.files), z.fotoZiel); return; }
    if (el.id === "datei-paket") { if (el.files[0]) paketEinlesen(el.files[0]); return; }
    if (el.id === "datei-video") { if (el.files[0]) videoEinlesen(el.files[0]); return; }
    if (el.classList && el.classList.contains("anreise-wahl") && z.reise) { anreiseSetzen(el); return; }
    if (!f || !z.reise) return;
    if (f === "reise.von" || f === "reise.bis") { zeitraumAendern(f.slice(6), el.value); return; }
    if (/^(date|time)$/.test(el.type) || el.tagName === "SELECT") setzen(f, el.value, el);
    if (f === "tag.art" || f === "tag.ort.name" || f === "tag.titel") zeichneLeiste();
  });
  function zeichneLeiste() {
    var alt = ansicht.querySelector(".tagesleiste");
    if (!alt) return;
    var d = document.createElement("div"), links = alt.scrollLeft;
    d.innerHTML = tagesleiste();
    alt.replaceWith(d.firstChild);
    ansicht.querySelector(".tagesleiste").scrollLeft = links;
  }
  function zeitraumAendern(feld, wert) {
    var r = z.reise;
    if (!M.istDatum(wert)) { zeichneReise(); return; }
    var von = feld === "von" ? wert : r.von, bis = feld === "bis" ? wert : r.bis;
    if (!M.istDatum(von)) von = bis;
    if (!M.istDatum(bis) || bis < von) { if (feld === "von") bis = von; else von = bis; }
    if (M.tageZwischen(von, bis) > 365) { melden("Eine Reise kann höchstens ein Jahr dauern.", "fehler"); zeichneReise(); return; }
    var aktuell = tag() ? tag().datum : "";
    r.von = von; r.bis = bis;
    M.tageAnpassen(r);
    z.tag = 0;
    r.tage.forEach(function (t, i) { if (t.datum === aktuell) z.tag = i; });
    stempel("stamm");
    zeichneReise();
  }
  function ereignisVerschieben(nr) {
    var e = z.ereignis, von = tag(), nach = z.reise.tage[nr];
    if (!nach || nach === von) return;
    von.ereignisse = von.ereignisse.filter(function (x) { return x !== e; });
    nach.ereignisse.push(e);
    z.tag = nr;
    stempel("e");
    history.replaceState(null, "", adresse());
    melden("Das Ereignis gehört jetzt zu Tag " + (nr + 1) + ".");
  }

  // ---------- Ort ----------
  function ortVon(wer) { return (wer === "tag" ? tag() : z.ereignis).ort; }
  function ortSetzen(wer, lat, lon, name) {
    var o = ortVon(wer);
    o.lat = Math.round(lat * 1e5) / 1e5; o.lon = Math.round(lon * 1e5) / 1e5;
    if (name && !o.name) o.name = name;
    stempel(wer);
    ortfeldNeu(wer);
  }
  function ortSuchen(wer, knopf) {
    var name = ortVon(wer).name.trim();
    if (!name) {
      // Ohne Namen im Feld „Ort“: gleich danach fragen und den Namen dort eintragen
      fragen("Welchen Ort soll Imagicruise suchen?\nAm besten mit Land oder Insel, z. B. „Palma, Mallorca“.", { eingabe: "Name des Ortes", ja: "Weiter" }).then(function (t) {
        t = (t || "").trim();
        if (!t) return;
        ortVon(wer).name = t; stempel(wer);
        var f = $('[data-f="' + wer + '.ort.name"]');
        if (f) f.value = t;
        if (wer === "tag") zeichneLeiste();
        ortSuchen(wer, $('[data-a="ort-suchen"][data-wer="' + wer + '"]') || knopf);
      });
      return;
    }
    var erlaubt = false;
    try { erlaubt = localStorage.getItem("imagicruise-ortssuche") === "ja"; } catch (e) { erlaubt = false; }
    (erlaubt ? Promise.resolve(true) : fragen("Die Suche schickt den Ortsnamen „" + name + "“ an OpenStreetMap (nominatim.openstreetmap.org), um die Position zu finden.\n\n" +
      "Fotos, Texte und andere Angaben werden nicht übertragen. Diese Frage kommt nur einmal.", { ja: "Suchen" })).then(function (ok) {
      if (!ok) return;
      try { localStorage.setItem("imagicruise-ortssuche", "ja"); } catch (e) { /* dann eben jedes Mal fragen */ }
      knopf.disabled = true;
      setTimeout(function () { knopf.disabled = false; }, 1500);   // höchstens eine Anfrage je Sekunde (Regel von OpenStreetMap)
      var feld = $("#treffer-" + wer);
      feld.innerHTML = '<p class="klein-text leise">Suche …</p>';
      return fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=de&q=" + encodeURIComponent(name), { referrerPolicy: "no-referrer" })
        .then(function (r) { if (!r.ok) throw new Error("Die Ortssuche ist gerade nicht erreichbar."); return r.json(); })
        .then(function (liste) {
          feld = $("#treffer-" + wer);
          if (!feld) return;
          if (!liste.length) { feld.innerHTML = '<p class="klein-text leise">Nichts gefunden. Versuche es mit Ort und Land, z. B. „Palma, Mallorca“.</p>'; return; }
          feld.innerHTML = liste.map(function (x) {
            return '<button type="button" data-a="ort-treffer" data-wer="' + wer + '" data-lat="' + esc(x.lat) + '" data-lon="' + esc(x.lon) + '">' + esc(x.display_name) + "</button>";
          }).join("") + '<p class="klein-text leise">Tippe den passenden Ort an. Suche: © OpenStreetMap-Mitwirkende</p>';
          if (feld.scrollIntoView) feld.scrollIntoView({ block: "nearest" });
        });
    }).catch(function () { var f = $("#treffer-" + wer); if (f) f.innerHTML = ""; melden("Die Ortssuche braucht Internet und ist gerade nicht erreichbar. Du kannst die Koordinaten auch eingeben.", "fehler"); });
  }
  // Infos zum Ort aus der Wikipedia: gesucht wird nach dem Namen (Ort, sonst Titel des Ereignisses), ohne Namen in der
  // Nähe der Position. Die Treffer stehen unter dem Ortsfeld; „Übernehmen“ hängt den Auszug mit Quelle an den Text.
  function ortInfos(wer, knopf) {
    var o = ortVon(wer), name = (o.name || (wer === "e" ? z.ereignis.titel : "") || "").trim();
    var was = name ? { name: name } : M.hatKoordinaten(o) ? { lat: o.lat, lon: o.lon } : null;
    if (!was) { melden("Bitte zuerst den Ort eintragen oder eine Position setzen."); return; }
    var erlaubt = false;
    try { erlaubt = localStorage.getItem("imagicruise-wikipedia") === "ja"; } catch (e) { erlaubt = false; }
    (erlaubt ? Promise.resolve(true) : fragen("„Infos zum Ort“ fragt die Wikipedia (de.wikipedia.org). Übertragen wird " +
      (name ? "der Name „" + name + "“" : "die Position dieses Eintrags") + " – ohne Namen eines Ortes die Position.\n\n" +
      "Fotos und Texte werden nicht übertragen. Diese Frage kommt nur einmal.", { ja: "Nachschlagen" })).then(function (ok) {
      if (!ok) return;
      try { localStorage.setItem("imagicruise-wikipedia", "ja"); } catch (e) { /* dann eben jedes Mal fragen */ }
      knopf.disabled = true;
      var feld = $("#treffer-" + wer);
      feld.innerHTML = '<p class="klein-text leise">Schlage nach …</p>';
      return O.suchen(was)
        .then(function (liste) {
          liste = liste.slice(0, 4);
          feld = $("#treffer-" + wer);
          var k = $('[data-a="ort-infos"][data-wer="' + wer + '"]'); if (k) k.disabled = false;
          if (!feld) return;
          z.infos = liste;
          if (!liste.length) { feld.innerHTML = '<p class="klein-text leise">Dazu hat die Wikipedia nichts gefunden' + (was.name ? " („" + esc(was.name) + "“)." : " (in der Nähe der Position).") + "</p>"; return; }
          feld.innerHTML = liste.map(function (p, i) {
            return '<div class="ortsinfo"><b>' + esc(p.titel) + "</b>" + (p.kurz || p.abstand != null ? '<span class="klein-text leise">' + esc([p.kurz, p.abstand != null ? O.entfernung(p.abstand) + " entfernt" : ""].filter(Boolean).join(" · ")) + "</span>" : "") +
              "<p>" + esc(p.text) + '</p><button type="button" class="ds-knopf ds-klein ds-zweit" data-a="info-nehmen" data-wer="' + wer + '" data-i="' + i + '">In den Text übernehmen</button></div>';
          }).join("") + '<p class="klein-text leise">' + esc(O.LIZENZ) + ' Bitte prüfen, ob der Eintrag wirklich euren Ort meint.</p>';
          if (feld.scrollIntoView) feld.scrollIntoView({ block: "nearest" });
        });
    }).catch(function () {
      var f = $("#treffer-" + wer); if (f) f.innerHTML = "";
      var k = $('[data-a="ort-infos"][data-wer="' + wer + '"]'); if (k) k.disabled = false;
      melden("Die Wikipedia ist gerade nicht erreichbar (braucht Internet).", "fehler");
    });
  }
  function infoNehmen(wer, i) {
    var p = (z.infos || [])[i], feld = $("#tf-" + wer + "-text");
    if (!p || !feld) return;
    var alt = feld.value.replace(/\s+$/, "");
    feld.value = (alt ? alt + "\n\n" : "") + O.alsText(p);
    feld.dispatchEvent(new Event("input", { bubbles: true }));
    feld.scrollIntoView({ block: "center" });
    melden("Auszug übernommen. Du kannst ihn im Text kürzen und umschreiben.", "gut");
  }
  function ortHier(wer) {
    if (!navigator.geolocation) { melden("Dieses Gerät kann keinen Standort bestimmen.", "fehler"); return; }
    melden("Standort wird bestimmt …", "", 2500);
    navigator.geolocation.getCurrentPosition(function (p) {
      if ((wer === "e" && !z.ereignis) || !z.reise) return;
      ortSetzen(wer, p.coords.latitude, p.coords.longitude);
      melden("Position übernommen.", "gut");
    }, function (f) {
      melden(f.code === 1 ? "Der Zugriff auf den Standort wurde nicht erlaubt." : "Der Standort ließ sich nicht bestimmen.", "fehler");
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }
  function ortEingeben(wer) {
    var o = ortVon(wer);
    fragen("Koordinaten eingeben, Breite und Länge, zum Beispiel 41.4036, 2.1744\n\nTipp: In vielen Karten-Apps lange auf den Ort tippen und die Zahlen kopieren.",
      { ja: "Übernehmen", eingabe: "41.4036, 2.1744", wert: M.hatKoordinaten(o) ? o.lat + ", " + o.lon : "" }).then(function (text) {
      if (text == null) return;
      var k = M.koordinatenLesen(text);
      if (!k) { melden("Das habe ich nicht verstanden. Beispiel: 41.4036, 2.1744", "fehler"); return; }
      ortSetzen(wer, k.lat, k.lon);
    });
  }

  // ---------- Fotos ----------
  function fotosWaehlen(ziel) {
    z.fotoZiel = ziel;
    // In der App: Auswahl wie in der Galerie (appGalerie); eine ältere App ohne diese Möglichkeit öffnet den Dateien-Wähler (appAuswahl)
    if (APP) { if (APP.galerieOeffnen) APP.galerieOeffnen(); else APP.fotosWaehlen(); return; }
    var f = $("#datei-fotos");
    f.value = ""; f.click();
  }
  // Fotos aufbereiten und im Speicher ablegen → Liste { datei, breite, hoehe, zeit, lat, lon }
  function fotosVorbereiten(dateien) {
    var fertig = [], fehler = 0, heic = false;
    var beginn = Date.now(), naechstes = 0, erledigt = 0;
    // Vorverkleinerte Fotos aus der App (datei.schnell) sind klein: drei gleichzeitig. Volle Originale einzeln (Arbeitsspeicher).
    var gleichzeitig = dateien.length && dateien.every(function (d) { return d.schnell; }) ? 3 : 1;
    function zeigen() { arbeit("Fotos werden vorbereitet … " + Math.min(erledigt + 1, dateien.length) + " von " + dateien.length, erledigt, dateien.length); }
    function einer() {
      if (naechstes >= dateien.length) return Promise.resolve();
      var i = naechstes++, datei = dateien[i];
      // In der App kommt ein Foto erst jetzt aus dem Speicher des Handys (datei.holen), nicht alle auf einmal
      return (datei.holen ? datei.holen() : Promise.resolve(datei)).then(F.aufbereiten).then(function (b) {
        return speicher.mediumSpeichern(z.reise.id, b.datei, b.blob).then(function () {
          z.urls[z.reise.id + "/" + b.datei] = Promise.resolve(URL.createObjectURL(b.blob));
          fertig[i] = { datei: b.datei, breite: b.breite, hoehe: b.hoehe, zeit: b.zeit, lat: b.lat, lon: b.lon };
        });
      }, function (e) { fehler++; if (e && e.code === "heic") heic = true; }).then(function () { erledigt++; zeigen(); return einer(); });
    }
    return speichernJetzt().then(function () {
      zeigen();
      var reihen = [];
      for (var k = 0; k < gleichzeitig; k++) reihen.push(einer());
      return Promise.all(reihen);
    }).then(function () {
      fertig = fertig.filter(Boolean);   // Reihenfolge wie gewählt, Lücken (nicht lesbare Dateien) entfernen
      z.vorbereitung = { fotos: dateien.length, gleichzeitig: gleichzeitig, ms: Date.now() - beginn };   // für Tests und Fehlersuche
      arbeitEnde();
      if (heic) melden("HEIC-Fotos (iPhone) kann der Browser nicht öffnen. Bitte als JPG exportieren.", "fehler");
      else if (fehler) melden(fehler + (fehler === 1 ? " Datei konnte" : " Dateien konnten") + " nicht gelesen werden.", "fehler");
      return fertig;
    }, function (e) { arbeitEnde(); throw e; });
  }
  function fotoEintrag(f) { return { datei: f.datei, text: "", breite: f.breite, hoehe: f.hoehe }; }
  // Videos (seit 19.11.2026) laufen beim Einteilen mit: { video: true, zeit, lat, lon, eintrag } – mit Aufnahmezeit und -ort wie Fotos.
  // Ins Ereignis kommen sie erst danach, einzeln über videoEinlesen (Zuschneiden); gruppeAlsEreignis merkt sie in auftraege vor.
  function gruppeAlsEreignis(g, auftraege) {
    var e = M.neuesEreignis("sonstiges");
    e.zeit = g.zeit; e.ende = g.ende;
    if (g.lat != null) { e.ort.lat = g.lat; e.ort.lon = g.lon; }
    e.fotos = g.fotos.filter(function (f) { return !f.video; }).map(fotoEintrag);
    g.fotos.forEach(function (f) { if (f.video && auftraege) auftraege.push({ ereignis: e, video: f, neu: !e.fotos.length }); });
    return e;
  }
  // Fotos einlesen und einteilen; videos: vorgemerkte Videos (siehe oben). Ergebnis: Promise mit den Video-Aufträgen
  // [{ ereignis, video, neu }] – neu: das Ereignis entstand nur für Videos (bleibt es leer, wird es wieder entfernt)
  function fotosEinlesen(dateien, ziel, videos) {
    videos = videos || [];
    if (!z.reise || !ziel) return Promise.resolve([]);
    return fotosVorbereiten(dateien).then(function (fotos) {
      var auftraege = [];
      if (!fotos.length && !videos.length) return auftraege;
      if (ziel === "ereignis" && z.ereignis) {
        var e = z.ereignis, da = {}, neu = 0, alle = fotos.concat(videos);
        e.fotos.forEach(function (f) { da[f.datei] = true; });
        fotos.forEach(function (f) { if (!da[f.datei]) { da[f.datei] = true; e.fotos.push(fotoEintrag(f)); neu++; } });
        videos.forEach(function (v) { auftraege.push({ ereignis: e, video: v, neu: false }); });
        var mitOrt = alle.filter(function (f) { return f.lat != null; })[0], mitZeit = alle.filter(function (f) { return f.zeit; }).sort(function (a, b) { return a.zeit < b.zeit ? -1 : 1; })[0];
        var hinweis = [];
        if (!e.zeit && mitZeit) { e.zeit = mitZeit.zeit.slice(11, 16); hinweis.push("Uhrzeit"); }
        if (!M.hatKoordinaten(e.ort) && mitOrt) { e.ort.lat = mitOrt.lat; e.ort.lon = mitOrt.lon; hinweis.push("Position"); }
        stempel("e");
        ereignisBlatt();
        if (neu || hinweis.length) melden((neu ? neu + (neu === 1 ? " Foto" : " Fotos") + " hinzugefügt." : "") + (hinweis.length ? " " + hinweis.join(" und ") + " aus " + (mitZeit && mitZeit.video ? "dem Video" : "dem Foto") + " übernommen." : ""), "gut");
        return auftraege;
      }
      var gruppen = F.gruppieren(fotos.concat(videos)), n = 0, ohneTag = 0;
      if (ziel === "tag") {
        gruppen.forEach(function (g) { tag().ereignisse.push(gruppeAlsEreignis(g, auftraege)); n++; });
        tag().geaendert = M.jetzt();
      } else {
        // ganze Reise: ohne Zeitraum ergibt er sich aus den Fotos; Fotos außerhalb des Zeitraums bekommen einen eigenen Tag
        var daten = gruppen.map(function (g) { return g.datum; }).filter(Boolean).sort();
        if (!M.istDatum(z.reise.von) && daten.length) { z.reise.von = daten[0]; z.reise.bis = daten[daten.length - 1]; z.reise.stamm_geaendert = M.jetzt(); M.tageAnpassen(z.reise); }
        gruppen.forEach(function (g) {
          var t = null;
          z.reise.tage.forEach(function (x) { if (x.datum === g.datum) t = x; });
          if (!t && g.datum) { t = M.neuerTag(g.datum); z.reise.tage.push(t); }
          if (!t) { t = z.reise.tage[0]; ohneTag += g.fotos.length; }
          if (!t) return;
          t.ereignisse.push(gruppeAlsEreignis(g, auftraege)); t.geaendert = M.jetzt(); n++;
        });
        M.tageAnpassen(z.reise);
      }
      z.reise.geaendert = M.jetzt();
      speichernBald();
      if (ziel === "reise") { z.bereich = "tage"; history.replaceState(null, "", adresse()); }
      zeichneReise(ziel === "reise");
      var was = [fotos.length ? fotos.length + (fotos.length === 1 ? " Foto" : " Fotos") : "", videos.length ? videos.length + (videos.length === 1 ? " Video" : " Videos") : ""].filter(Boolean).join(" und ");
      melden(was + " in " + n + (n === 1 ? " Ereignis" : " Ereignissen") + (videos.length ? " eingeteilt." + (videos.length === 1 ? " Jetzt das Video zuschneiden." : " Jetzt die Videos nacheinander zuschneiden.") : " angelegt. Jetzt Titel und Text ergänzen.") +
        (ohneTag ? " " + ohneTag + " ohne Aufnahmedatum liegen am ersten Tag." : ""), "gut", 7000);
      return auftraege;
    }).catch(function (f) { fehlerMelden(f); return []; });
  }
  // Die vorgemerkten Videos nacheinander holen, zuschneiden und in ihr Ereignis legen. Bleibt ein nur für Videos angelegtes
  // Ereignis leer (Video abgebrochen oder nicht lesbar), wird es wieder entfernt.
  function videosAbarbeiten(auftraege, holen) {
    return auftraege.reduce(function (kette, a, i) {
      return kette.then(function () {
        arbeit("Das Video wird geholt …" + (auftraege.length > 1 ? " " + (i + 1) + " von " + auftraege.length : ""));
        return holen(a.video).then(function (datei) {
          arbeitEnde();
          return videoEinlesen(datei, a.ereignis, auftraege.length > 1 ? "Video " + (i + 1) + " von " + auftraege.length : "");
        }, function (f) { arbeitEnde(); fehlerMelden(f); });
      });
    }, Promise.resolve()).then(function () {
      var weg = 0;
      auftraege.forEach(function (a) {
        if (!a.neu || a.ereignis.fotos.length || !z.reise) return;
        z.reise.tage.forEach(function (t) { var i = t.ereignisse.indexOf(a.ereignis); if (i >= 0) { t.ereignisse.splice(i, 1); t.geaendert = M.jetzt(); weg++; } });
      });
      if (weg) { z.reise.geaendert = M.jetzt(); speichernBald(); zeichneReise(); }
    });
  }

  // ---------- Kurze Videos (Baustein videoschnitt in bausteine/) ----------
  function dauerText(s) { s = Math.round(+s || 0); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function sekunden(t) { return String(Math.round(t * 10) / 10).replace(".", ",") + " s"; }
  // Fenster „Video zuschneiden“ → { a, b } in Sekunden oder null
  function videoFenster(datei, k, zusatz) {
    var d = $("#video"), max = V.MAX_DAUER, lauf = null, wartet = null, zu = false;
    var dauer = Math.floor(k.dauer * 10) / 10;
    d.innerHTML = '<div class="blatt-kopf"><h2 id="video-titel">Video zuschneiden' + (zusatz ? " – " + esc(zusatz) : "") + '</h2></div><div class="bb-inhalt">' +
      '<div class="bb-buehne"><canvas id="vd-bild" width="16" height="9"></canvas></div>' +
      '<p id="vd-info" class="vd-info"></p>' +
      '<label class="feld"><span id="vd-a-l">Anfang</span><input type="range" id="vd-a" min="0" max="' + dauer + '" step="0.1" value="0"></label>' +
      '<label class="feld"><span id="vd-b-l">Ende</span><input type="range" id="vd-b" min="0" max="' + dauer + '" step="0.1" value="' + Math.min(dauer, max) + '"></label>' +
      '<p class="klein-text leise">Ein Video darf höchstens ' + max + " Sekunden lang sein. Es wird verkleinert und neu geschrieben: Aufnahmeort und Gerätedaten stehen danach nicht mehr darin. Das Original auf deinem Gerät bleibt unverändert.</p></div>" +
      '<div class="blatt-fuss"><button type="button" class="ds-knopf ds-zweit" id="vd-nein">Abbrechen</button><button type="button" class="ds-knopf" id="vd-ja">Video übernehmen</button></div>';
    var a = $("#vd-a"), b = $("#vd-b");
    function zeigen(t) {
      // immer nur ein Standbild gleichzeitig rechnen; das zuletzt gewünschte gewinnt
      if (zu) return;
      if (lauf) { wartet = t; return; }
      lauf = V.standbild(datei, k, t).then(function (c) {
        var cv = $("#vd-bild"); if (!cv || zu) return;
        cv.width = c.width; cv.height = c.height; cv.getContext("2d").drawImage(c, 0, 0);
      }, function () { /* an dieser Stelle kein Bild: altes bleibt stehen */ }).then(function () {
        lauf = null;
        if (wartet != null && !zu) { var w = wartet; wartet = null; zeigen(w); }
      });
    }
    function abgleichen(wer) {
      var va = +a.value, vb = +b.value;
      if (wer === "a") { if (vb < va + .5) vb = Math.min(dauer, va + .5); if (vb - va > max) vb = va + max; if (vb - va < .5) va = Math.max(0, vb - .5); }
      else { if (va > vb - .5) va = Math.max(0, vb - .5); if (vb - va > max) va = vb - max; if (vb - va < .5) vb = Math.min(dauer, va + .5); }
      a.value = va; b.value = vb;
      $("#vd-a-l").textContent = "Anfang bei " + sekunden(+a.value);
      $("#vd-b-l").textContent = "Ende bei " + sekunden(+b.value);
      $("#vd-info").textContent = "Ausschnitt: " + sekunden(+b.value - +a.value) + " von " + sekunden(dauer);
      zeigen(wer === "b" ? Math.max(0, +b.value - .1) : +a.value);
    }
    a.oninput = function () { abgleichen("a"); };
    b.oninput = function () { abgleichen("b"); };
    abgleichen("a");
    return new Promise(function (ok) {
      d.returnValue = "nein";
      $("#vd-nein").onclick = function () { d.close("nein"); };
      $("#vd-ja").onclick = function () { d.close("ja"); };
      d.onclose = function () {
        var erg = d.returnValue === "ja" ? { a: +a.value, b: +b.value } : null;
        zu = true; wartet = null; d.innerHTML = "";
        (lauf || Promise.resolve()).then(function () { ok(erg); });   // erst weiter, wenn kein Standbild mehr gerechnet wird
      };
      d.showModal();
    });
  }
  // Video wählen → zuschneiden → umrechnen → mit Standbild im Ereignis ablegen
  function videoEinlesen(datei, ereignis, zusatz) {
    var e = ereignis || z.ereignis, id = z.reise && z.reise.id, k;
    if (!e || !id) return Promise.resolve();
    // Aufnahmezeit und -ort aus dem Video (Baustein fotos 1.1.0): füllen Uhrzeit und Position eines Ereignisses, wo sie fehlen
    var vd = {}, daten = window.ImagicosmosFotoDaten && window.ImagicosmosFotoDaten.videoDaten ? window.ImagicosmosFotoDaten.videoDaten(datei) : Promise.resolve({});
    arbeit("Das Video wird gelesen …");
    return Promise.all([V.kopf(datei), daten]).then(function (r) {
      var kopf = r[0]; vd = r[1] || {};
      k = kopf; arbeitEnde();
      return videoFenster(datei, k, zusatz);
    }).then(function (bereich) {
      if (!bereich) return;
      arbeit("Das Video wird umgerechnet …", 0, 100);
      return V.standbild(datei, k, bereich.a).then(function (c) {
        return new Promise(function (ok, nein) { c.toBlob(function (b) { b ? ok(b) : nein(new Error("Das Standbild konnte nicht gespeichert werden.")); }, "image/jpeg", 0.85); });
      }).then(function (bild) {
        return V.umrechnen(datei, k, bereich.a, bereich.b, function (anteil) { arbeit("Das Video wird umgerechnet …", Math.round(anteil * 100), 100); }).then(function (v) {
          return Promise.all([F.pruefsumme(bild), F.pruefsumme(v.blob)]).then(function (summen) {
            var bildName = summen[0] + ".jpg", videoName = summen[1] + ".mp4";
            arbeit("Das Video wird gespeichert …");
            return speicher.mediumSpeichern(id, bildName, bild).then(function () { return speicher.mediumSpeichern(id, videoName, v.blob); }).then(function () {
              arbeitEnde();
              // Das Ereignis-Fenster kann inzwischen zu sein: Das Video kommt trotzdem ins Ereignis, solange es die Reise noch gibt.
              var nochDa = z.reise && z.reise.id === id && z.reise.tage.some(function (t) { return t.ereignisse.indexOf(e) >= 0; });
              if (!nochDa) { melden("Das Video wurde nicht hinzugefügt, weil das Ereignis inzwischen nicht mehr geöffnet ist.", "fehler"); return; }
              z.urls[id + "/" + bildName] = Promise.resolve(URL.createObjectURL(bild));
              e.fotos.push({ datei: bildName, text: "", breite: v.breite, hoehe: v.hoehe, video: videoName, dauer: v.dauer });
              if (!e.zeit && vd.zeit) e.zeit = vd.zeit.slice(11, 16);
              if (!M.hatKoordinaten(e.ort) && vd.lat != null) { e.ort.lat = vd.lat; e.ort.lon = vd.lon; }
              e.geaendert = z.reise.geaendert = M.jetzt(); speichernBald();
              if (z.ereignis === e) fotolisteZeichnen(); else zeichneReise();
              melden("Video hinzugefügt (" + sekunden(v.dauer) + ", " + (v.blob.size / 1048576).toFixed(1).replace(".", ",") + " MB" + (v.ton ? "" : ", ohne Ton") + ").", "gut", 7000);
            });
          });
        });
      });
    }).catch(function (f) { arbeitEnde(); fehlerMelden(f); });
  }

  // Foto bearbeiten: Das eingelesene Foto bleibt als `original` erhalten, das Ergebnis wird eine neue Datei.
  function fotoBearbeiten(e, i) {
    var f = e.fotos[i], id = z.reise.id, quelle = f.original || f.datei;
    speicher.medium(id, quelle).then(function (blob) {
      if (!blob) throw new Error("Das Foto fehlt auf diesem Gerät und lässt sich deshalb nicht bearbeiten.");
      return B.oeffnen(blob, f.bearbeitung);
    }).then(function (erg) {
      if (!erg || z.ereignis !== e || e.fotos[i] !== f) return;
      var alt = f.datei;
      var fertig = function (neu) {
        f.datei = neu; f.breite = erg.breite; f.hoehe = erg.hoehe;
        if (erg.einstellung) { f.original = quelle; f.bearbeitung = erg.einstellung; } else { delete f.original; delete f.bearbeitung; }
        // war das Foto das Titelbild (und kommt in alter Fassung nirgends mehr vor), zieht das Titelbild mit
        if (z.reise.titelbild === alt && !M.alleFotos(z.reise).some(function (x) { return x.foto.datei === alt; })) { z.reise.titelbild = neu; z.reise.stamm_geaendert = M.jetzt(); }
        stempel("e"); fotolisteZeichnen();
        // die vorige bearbeitete Fassung braucht niemand mehr: aus dem Speicher nehmen (das Original bleibt immer)
        if (alt !== neu && alt !== quelle && M.mediendateien(z.reise, true).indexOf(alt) < 0) {
          var k = id + "/" + alt, u = z.urls[k];
          delete z.urls[k];
          if (u) u.then(function (x) { if (x) URL.revokeObjectURL(x); });
          speichernJetzt().then(function () { return speicher.mediumLoeschen(id, alt); }).catch(function () { /* bleibt dann eben liegen */ });
        }
        melden(erg.einstellung ? "Bearbeitung übernommen. Das Original bleibt erhalten." : "Das Foto ist wieder im Original.", "gut");
      };
      if (!erg.einstellung) { fertig(quelle); return; }
      return F.pruefsumme(erg.blob).then(function (summe) {
        var neu = summe + ".jpg";
        return speicher.mediumSpeichern(id, neu, erg.blob).then(function () {
          z.urls[id + "/" + neu] = Promise.resolve(URL.createObjectURL(erg.blob));
          fertig(neu);
        });
      });
    }).catch(fehlerMelden);
  }

  // ---------- Reisebericht, Reisepaket ----------
  function herunterladen(blob, name) {
    if (APP) { appDatei(blob, name, "speichern").catch(fehlerMelden); return; }
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 30000);
  }
  function holeMedium(datei) { return speicher.medium(z.reise.id, datei); }

  // ---------- Als Status teilen (status.js, Baustein vorlagen) ----------
  // Fußzeile des Statusbilds: Wochentag, Datum und Ort, z. B. „So, 10. Mai 2026 · Barcelona“
  function statusFusszeile(t, ort) { return M.wochentag(t.datum).slice(0, 2) + ", " + M.datumText(t.datum) + (ort ? " · " + ort : ""); }
  function statusTeilen(blob, name) {
    if (APP) return appDatei(blob, name, "teilen");
    var datei = new File([blob], name, { type: "image/jpeg" });
    if (!navigator.canShare || !navigator.canShare({ files: [datei] })) {
      herunterladen(blob, name); melden("Teilen geht hier nicht – das Statusbild wurde gespeichert (Downloads).", "gut"); return Promise.resolve("gespeichert");
    }
    return navigator.share({ files: [datei], title: name }).then(function () { return "geteilt"; }, function (e) { if (e && e.name === "AbortError") return "abgebrochen"; throw e; });
  }
  // Nur in der Android-App: direkt an den WhatsApp-Status (ohne Teilen-Menü, „Mein Status“ ist schon gewählt)
  function statusDirekt(blob, name) { return appDatei(blob, name, "status"); }
  function statusSpeichern(blob, name) {
    if (APP) return appDatei(blob, name, "speichern").then(function (ort) { melden("Gespeichert in " + ort + ".", "gut"); });
    herunterladen(blob, name); melden("Das Statusbild wurde gespeichert (Downloads).", "gut"); return Promise.resolve();
  }
  function statusOeffnen(o) {
    var weiter = imagicliqueMoeglich();
    return ImagicruiseStatus.oeffnen(Object.assign({ bild: function (datei) { return bildUrl(datei); }, teilen: statusTeilen, direkt: APP ? statusDirekt : null, speichern: statusSpeichern, melden: melden,
      weiter: weiter ? function (fotos) { return anImagiclique(fotos, o.titel, o.text); } : null,
      weiterHinweis: weiter ? "" : "Mehr Möglichkeiten (Collage, Diashow mit Musik, mehrere Beiträge) bietet die App Imagiclique – zu finden unter imagiclique.de." }, o));
  }

  // ---------- In Imagiclique gestalten (seit 20.11.2026) ----------
  // Gibt die Fotos und Videos eines Ereignisses oder Tages samt Titel und Text an Imagiclique weiter. In der Android-App direkt
  // (ohne Teilen-Menü) und nur, wenn Imagiclique installiert ist; im Browser über das Teilen-Menü (dort Imagiclique wählen), nur
  // Fotos, weil die Web-App von Imagiclique keine Videos annimmt. Imagiclique bekommt einen Text (Titel, Leerzeile, Text) und
  // die Fotos ohne Aufnahmeort (Imagicruise speichert sie so). Eine Übergabe mit getrennten Angaben ist Stufe 2 (IDEEN.md).
  var WEITER_MAX = 20;
  function imagicliqueMoeglich() {
    if (APP) return !!(APP.imagicliqueDa && APP.imagicliqueDa());
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(4)], "probe.jpg", { type: "image/jpeg" })] })); } catch (e) { return false; }
  }
  function weiterText(titel, text) { return [titel, text].map(function (s) { return String(s || "").trim(); }).filter(Boolean).join("\n\n"); }
  function anImagiclique(fotos, titel, text) {
    var liste = (fotos || []).filter(function (f) { return APP || !f.video; }).slice(0, WEITER_MAX), weg = (fotos || []).length - liste.length;
    if (!liste.length) return Promise.reject(new Error(APP ? "Es gibt keine Fotos zum Weitergeben." : "Im Browser lassen sich nur Fotos an Imagiclique geben, keine Videos."));
    var n = liste.length, holen = function (f) { return Promise.resolve(holeMedium(f.video || f.datei)); };
    if (APP) {
      if (!APP.weiterNeu()) return Promise.reject(new Error("Auf dem Gerät ist kein Platz für die Übergabe."));
      return liste.reduce(function (p, f, i) {
        return p.then(function () {
          arbeit("Die Fotos werden an Imagiclique übergeben …", i, n);
          return holen(f).then(function (blob) {
            if (!blob) return;
            return appHochladen(blob).then(function () { if (!APP.weiterAblegen(f.video || f.datei)) throw new Error("Die Datei konnte nicht abgelegt werden (Speicher voll?)."); });
          });
        });
      }, Promise.resolve()).then(function () {
        arbeitEnde();
        if (!APP.anImagiclique(weiterText(titel, text))) throw new Error("Imagiclique ließ sich nicht öffnen. Ist es noch installiert?");
        melden("An Imagiclique übergeben: " + n + (n === 1 ? " Datei" : " Dateien") + (weg ? " (höchstens " + WEITER_MAX + ")" : "") + ", dazu Titel und Text.", "gut", 6000);
        return "geteilt";
      }, function (e) { arbeitEnde(); throw e; });
    }
    return Promise.all(liste.map(function (f) { return holen(f).then(function (blob) { return blob ? new File([blob], f.datei, { type: "image/jpeg" }) : null; }); })).then(function (dateien) {
      dateien = dateien.filter(Boolean);
      if (!navigator.canShare({ files: dateien })) throw new Error("Teilen geht hier nicht.");
      melden("Im Teilen-Menü jetzt Imagiclique wählen." + (weg ? " Videos gehen im Browser nicht mit." : ""), "", 6000);
      return navigator.share({ files: dateien, text: weiterText(titel, text) }).then(function () { return "geteilt"; }, function (e) { if (e && e.name === "AbortError") return "abgebrochen"; throw e; });
    });
  }
  function holeAbspieler(pfad) {
    return fetch("../abspieler/" + pfad).then(function (r) {
      if (!r.ok) throw new Error("Eine Datei des Reiseberichts fehlt (" + pfad + ")." + (amPc ? "" : " Bitte einmal mit Internet öffnen."));
      return r.blob();
    });
  }
  function berichtBauen() {
    var fehler = M.pruefliste(z.reise).filter(function (p) { return p.art === "fehler"; });
    if (fehler.length) return Promise.reject(new Error(fehler[0].text + " Bitte zuerst ergänzen."));
    return speichernJetzt().then(function () {
      arbeit("Der Reisebericht wird gebaut …");
      return P.berichtBauen(z.reise, holeMedium, holeAbspieler, function (i, n) { arbeit("Der Reisebericht wird gebaut …", i, n); });
    });
  }
  function paketBlob() {
    return speichernJetzt().then(function () {
      arbeit("Das Reisepaket wird gepackt …");
      return P.paketBauen(z.reise, holeMedium, function (i, n) { arbeit("Das Reisepaket wird gepackt …", i, n); });
    }).then(function (stuecke) { arbeitEnde(); return new Blob(stuecke, { type: "application/zip" }); }, function (e) { arbeitEnde(); throw e; });
  }
  function paketName() { return "imagicruise-" + P.dateiname(z.reise) + "-" + M.jetzt().slice(0, 10) + ".zip"; }

  // Gibt es die Reise hier schon? (Über die Liste gefragt: Ein Abruf einer fehlenden Reise wäre ein Fehler im Protokoll.)
  function gibtEs(id) { return speicher.liste().then(function (l) { return l.some(function (r) { return r.id === id; }); }); }

  function paketEinlesen(datei) {
    var offeneId = z.reise ? z.reise.id : null;
    arbeit("Das Reisepaket wird gelesen …");
    speichernJetzt().then(function () { return datei.arrayBuffer(); }).then(function (b) { return P.paketLesen(new Uint8Array(b)); }).then(function (paket) {
      if (offeneId && paket.reise.id !== offeneId) throw new Error("Dieses Paket gehört zu einer anderen Reise („" + (paket.reise.titel || "ohne Titel") + "“). Bitte in der Liste der Reisen einlesen.");
      return gibtEs(paket.reise.id).then(function (da) {
        return da ? speicher.laden(paket.reise.id).then(function (hier) { return A.zusammenfuehren(hier, paket.reise); }) : { reise: paket.reise, bericht: null };
      }).then(function (erg) {
        return speicher.speichern(erg.reise).then(function () { return speicher.medienliste(erg.reise.id); }).then(function (vorhanden) {
          var da = {}, fehlend = Object.keys(paket.medien).filter(function (d) { return vorhanden.indexOf(d) < 0 && !da[d] && (da[d] = true); });
          return fehlend.reduce(function (p, d, i) {
            return p.then(function () {
              arbeit("Fotos werden übernommen …", i, fehlend.length);
              return speicher.mediumSpeichern(erg.reise.id, d, new Blob([paket.medien[d]], { type: /\.mp4$/.test(d) ? "video/mp4" : "image/jpeg" }));
            });
          }, Promise.resolve());
        }).then(function () {
          arbeitEnde();
          melden(erg.bericht ? A.berichtText(erg.bericht) : "Die Reise „" + (erg.reise.titel || "ohne Titel") + "“ wurde übernommen.", "gut", 8000);
          if (offeneId) { z.reise = erg.reise; z.tag = Math.min(z.tag, z.reise.tage.length - 1); urlsFreigeben(); zeichneReise(); }
          else if (location.hash === "#/reise/" + erg.reise.id) weg();
          else location.hash = "#/reise/" + erg.reise.id;
        });
      });
    }).catch(function (e) { arbeitEnde(); fehlerMelden(e); });
  }

  function beispielLaden() {
    arbeit("Die Beispielreise wird geladen …");
    fetch(BEISPIEL + "reise.json").then(function (r) { if (!r.ok) throw new Error("Die Beispielreise ist hier nicht verfügbar."); return r.json(); }).then(function (roh) {
      var reise = M.pruefen(roh);
      return gibtEs(reise.id).then(function (da) {
        if (da) return reise.id;
        var medien = M.mediendateien(reise);
        return speicher.speichern(reise).then(function () {
          return medien.reduce(function (p, d, i) {
            return p.then(function () {
              arbeit("Die Beispielreise wird geladen …", i, medien.length);
              return fetch(BEISPIEL + "medien/" + d).then(function (r) { if (!r.ok) throw new Error("Ein Foto der Beispielreise fehlt."); return r.blob(); })
                .then(function (b) { return speicher.mediumSpeichern(reise.id, d, b); });
            });
          }, Promise.resolve());
        }).then(function () { return reise.id; });
      });
    }).then(function (id) { arbeitEnde(); location.hash = "#/reise/" + id; }).catch(function (e) { arbeitEnde(); fehlerMelden(e); });
  }

  // ---------- Vorschau ----------
  window.ImagicruiseVorschau = { reise: function () { return P.oeffentlich(z.reise); }, medienUrl: function (datei) { return bildUrl(datei); } };
  function vorschauOeffnen() {
    $("#vorschau-seite").src = "../abspieler/index.html" + (z.bereich === "tage" && tag() && M.tagHatInhalt(tag()) ? "#/tag/" + (z.tag + 1) : "#/");
    $("#vorschau").showModal();
  }
  $("#vorschau").addEventListener("close", function () { $("#vorschau-seite").src = "about:blank"; });

  // ---------- Diktieren (Spracherkennung des Browsers, wie in Imagiclique) ----------
  // Der Knopf steht über jedem großen Textfeld, rechts neben dessen Namen. Das Gesprochene wird an den vorhandenen Text angehängt.
  // Ohne Spracherkennung im Browser (z. B. Firefox) gibt es den Knopf nicht.
  // ---------- Textfelder mit Diktieren und Leeren: Baustein „textfeld“ (studio/bausteine/textfeld.js) ----------
  // Diktieren im Browser über dessen Spracherkennung, in der Android-App über die Spracheingabe des Handys (Ergebnis über
  // appDiktat); einmalige Rückfrage (früher gemerkte Zustimmung unter „imagicruise-diktieren“ gilt weiter). Gespeichert wird
  // wie beim Tippen: Der Baustein meldet jede Änderung als „input“.
  var T = window.ImagicosmosTextfeld;
  T.einrichten({
    app: "imagicruise", melden: melden, fragen: fragen, einwilligungAlt: "imagicruise-diktieren",
    android: APP ? { kann: function () { return APP.kannDiktieren(); }, starten: function () { APP.diktieren(); } } : null
  });
  function textfeld(name, pfad, wert, platzhalter, klasse, gross) {
    var wer = pfad.split(".")[0];
    return T.html({
      id: "tf-" + pfad.replace(/\./g, "-"), name: name, wert: wert, platzhalter: platzhalter,
      klasse: "textfeld" + (klasse ? " " + klasse : ""), feldKlasse: gross ? "gross" : "", attribute: { "data-f": pfad },
      knoepfe: pfad === "e.text" || pfad === "tag.text" ? '<button type="button" class="tf-knopf" data-a="ki-hilfe" data-wer="' + wer + '">✨ KI-Hilfe</button>' : ""
    });
  }
  function diktatEnde() { T.stopp(); }

  // ---------- KI-Hilfe ohne eigenen Server (wie in Imagiclique) ----------
  // Imagicruise sendet nichts an eine KI: Die Frage wird kopiert oder an eine KI-App geteilt, die Antwort eingefügt.
  var ki = null;   // { wer: "e" | "tag", aufgabe, vorschlag, alt: { titel, text } }
  function kiKontext() {
    var t = tag(), e = z.ereignis, name = function (liste, id) { var a = liste.filter(function (x) { return x.id === id; })[0]; return a ? a.name : ""; };
    var k = { reise: z.reise.titel, reiseart: name(Arten.REISEARTEN, z.reise.art), datum: M.wochentag(t.datum) + ", " + M.datumText(t.datum) };
    if (ki.wer === "e") {
      k.was = "ereignis"; k.ort = e.ort.name || t.ort.name; k.titel = e.titel; k.art = name(Arten.EREIGNISARTEN, e.art);
      k.zeit = e.zeit + (e.ende ? " bis " + e.ende : ""); k.text = e.text;
    } else {
      k.was = "tag"; k.ort = t.ort.name; k.titel = t.titel; k.text = t.text;
      k.ereignisse = M.ereignisseSortiert(t).map(function (x) { return { zeit: x.zeit, titel: x.titel, text: x.text }; });
    }
    return k;
  }
  function kiFrage() { return K.frage(kiKontext(), ki.aufgabe, $("#ki-wunsch") ? $("#ki-wunsch").value : ""); }
  function kiFelder() {
    return ki.wer === "e" ? { titel: $('[data-f="e.titel"]'), text: $("#tf-e-text") } : { titel: $('[data-f="tag.titel"]'), text: $("#tf-tag-text") };
  }
  function kiOeffnen(wer) {
    if (wer === "e" && !z.ereignis) return;
    diktatEnde();
    var felder, text;
    ki = { wer: wer, aufgabe: "verbessern", vorschlag: null, alt: null };
    felder = kiFelder(); text = felder.text ? felder.text.value.trim() : "";
    ki.aufgabe = text.length > 200 ? "verbessern" : "ausformulieren";
    var d = $("#hilfe");
    d.innerHTML = '<div class="blatt-kopf"><h2 id="hilfe-titel">KI-Hilfe für ' + (wer === "e" ? "dieses Ereignis" : "diesen Tag") + '</h2><button type="button" class="ds-knopf ds-klein" data-a="ki-zu">Fertig</button></div>' +
      '<div class="blatt-inhalt"><p class="hinweis">Imagicruise schickt selbst nichts an eine KI. Du gibst die Frage an deine KI-App weiter (zum Beispiel Claude, ChatGPT oder Gemini) und fügst die Antwort hier ein. ' +
      "In der Frage stehen nur die Angaben und Texte " + (wer === "e" ? "dieses Ereignisses" : "dieses Tages") + ", keine Fotos.</p>" +
      '<div class="feld"><span class="feldname">1. Was soll die KI tun?</span><div class="arten" id="ki-aufgaben">' + K.AUFGABEN.map(function (a) {
        return '<button type="button" data-a="ki-aufgabe" data-v="' + a[0] + '" class="' + (a[0] === ki.aufgabe ? "an" : "") + '" aria-pressed="' + (a[0] === ki.aufgabe) + '">' + esc(a[1]) + "</button>";
      }).join("") + "</div></div>" +
      '<label class="feld"><span>Dein Wunsch dazu (wenn du magst)</span><input type="text" id="ki-wunsch" placeholder="z. B. mit etwas Humor, für die Großeltern" autocomplete="off"></label>' +
      '<div class="feld"><span class="feldname">2. Frage an die KI weitergeben</span><div class="knoepfe"><button type="button" class="ds-knopf" data-a="ki-kopieren">Frage kopieren</button>' +
      (KI.kannTeilen() || APP ? '<button type="button" class="ds-knopf ds-zweit" data-a="ki-teilen">An KI-App teilen</button>' : "") + "</div>" +
      '<details class="ki-frage"><summary>Frage ansehen</summary><pre id="ki-fragetext"></pre></details></div>' +
      '<div class="feld"><label class="feldname" for="ki-antwort">3. Antwort der KI hier einfügen</label><textarea id="ki-antwort" class="gross" placeholder="Antwort der KI einfügen (lange tippen → Einfügen)"></textarea>' +
      '<div class="knoepfe">' + (KI.kannEinfuegen() ? '<button type="button" class="ds-knopf ds-zweit" data-a="ki-einfuegen">Aus der Zwischenablage einfügen</button>' : "") +
      '<button type="button" class="ds-knopf" data-a="ki-lesen">Vorschlag ansehen</button></div></div>' +
      '<div id="ki-vorschlag" hidden></div></div>';
    $("#ki-fragetext").textContent = kiFrage();
    $("#ki-wunsch").oninput = function () { $("#ki-fragetext").textContent = kiFrage(); };
    d.showModal();
  }
  function kiVorschlag() {
    var v = ki.vorschlag, feld = $("#ki-vorschlag");
    feld.hidden = false;
    feld.innerHTML = '<div class="kasten ki-kasten"><h3>Vorschlag der KI</h3>' +
      (v.titel ? '<div class="feld"><span class="feldname">' + (ki.wer === "e" ? "Titel" : "Überschrift des Tages") + '</span><p class="ki-text" id="ki-v-titel"></p><div class="knoepfe"><button type="button" class="ds-knopf ds-klein" data-a="ki-nehmen" data-was="titel">Übernehmen</button></div></div>' : "") +
      (v.text ? '<div class="feld"><span class="feldname">Text</span><p class="ki-text" id="ki-v-text"></p><div class="knoepfe"><button type="button" class="ds-knopf ds-klein" data-a="ki-nehmen" data-was="text">Text ersetzen</button></div></div>' : "") +
      (v.pruefen.length ? '<div class="hinweis warn"><b>Bitte prüfen:</b><ul id="ki-v-pruefen"></ul></div>' : "") +
      '<p class="klein-text leise">Eine KI kann sich irren. Lies den Vorschlag durch, bevor du ihn übernimmst.</p>' +
      '<div class="knoepfe"><button type="button" class="ds-knopf ds-klein ds-zweit" data-a="ki-zurueck" id="ki-zurueck" hidden>Rückgängig</button></div></div>';
    if (v.titel) $("#ki-v-titel").textContent = v.titel;
    if (v.text) $("#ki-v-text").textContent = v.text;
    v.pruefen.forEach(function (x) { var li = document.createElement("li"); li.textContent = x; $("#ki-v-pruefen").appendChild(li); });
    feld.scrollIntoView({ block: "start" });
  }
  function kiSetzen(was, wert) {
    var f = kiFelder()[was];
    if (!f) return;
    f.value = wert;
    f.dispatchEvent(new Event("input", { bubbles: true }));
    if (ki.wer === "tag" && was === "titel") zeichneLeiste();
  }
  var kiAktionen = {
    "ki-hilfe": function (el) { kiOeffnen(el.dataset.wer); },
    "ki-zu": function () { $("#hilfe").close(); },
    "ki-aufgabe": function (el) {
      ki.aufgabe = el.dataset.v;
      Array.prototype.forEach.call($("#ki-aufgaben").children, function (b) { b.classList.toggle("an", b === el); b.setAttribute("aria-pressed", b === el); });
      $("#ki-fragetext").textContent = kiFrage();
    },
    "ki-kopieren": function () {
      var text = kiFrage();
      KI.kopieren(text).then(function (ok) {
        if (ok) { melden("Die Frage ist kopiert. Jetzt in deiner KI-App einfügen und die Antwort hierher bringen.", "gut", 7000); return; }
        $(".ki-frage").open = true;
        var bereich = document.createRange(); bereich.selectNodeContents($("#ki-fragetext"));
        var auswahl = getSelection(); auswahl.removeAllRanges(); auswahl.addRange(bereich);
        melden("Kopieren geht hier nicht von selbst. Die Frage ist markiert – bitte von Hand kopieren.");
      });
    },
    "ki-teilen": function () {
      KI.teilen(kiFrage(), APP ? { nativ: function (t) { APP.textTeilen(t); } } : {}).then(function (r) { if (r === "fehler") melden("Teilen hat nicht geklappt. Nimm „Frage kopieren“.", "fehler"); });
    },
    "ki-einfuegen": function () {
      KI.einfuegen().then(function (t) { $("#ki-antwort").value = t; kiAktionen["ki-lesen"](); },
        function () { melden("Der Zugriff auf die Zwischenablage wurde nicht erlaubt. Bitte von Hand einfügen."); });
    },
    "ki-lesen": function () {
      var roh = $("#ki-antwort").value;
      if (!roh.trim()) { melden("Bitte zuerst die Antwort der KI einfügen."); return; }
      var v = K.lesen(roh);
      // Antwort ohne die verlangte Form: als reinen Text anbieten
      if (!v) v = { titel: "", text: KI.alsText(roh, 6000), pruefen: ["Die Antwort hatte nicht die verlangte Form. Sie steht hier unverändert als Text."] };
      ki.vorschlag = v; kiVorschlag();
    },
    "ki-nehmen": function (el) {
      var was = el.dataset.was, f = kiFelder()[was];
      if (!f) return;
      ki.alt = ki.alt || {};
      if (!(was in ki.alt)) ki.alt[was] = f.value;
      kiSetzen(was, ki.vorschlag[was]);
      $("#ki-zurueck").hidden = false;
      melden(was === "titel" ? "Überschrift übernommen." : "Text übernommen.", "gut");
    },
    "ki-zurueck": function () {
      Object.keys(ki.alt || {}).forEach(function (was) { kiSetzen(was, ki.alt[was]); });
      ki.alt = null; $("#ki-zurueck").hidden = true;
      melden("Wieder wie vorher.");
    }
  };

  // ---------- Geteilte Fotos (Handy: „Teilen“ aus der Galerie an Imagicruise) ----------
  // Der Service Worker legt die Dateien ab (app/sw.js). Hier werden sie abgeholt: Ein Reisepaket wird gleich eingelesen,
  // Fotos warten, bis eine Reise gewählt ist, und werden dann nach Aufnahmedatum auf die Tage verteilt.
  function geteiltHolen() {
    if (!/[?&]geteilt=1/.test(location.search) || !window.caches) return Promise.resolve();
    history.replaceState(null, "", location.pathname + location.hash);
    return caches.open("imagicruise-geteilt").then(function (ablage) {
      return ablage.keys().then(function (schluessel) {
        return Promise.all(schluessel.map(function (k) {
          return ablage.match(k).then(function (r) {
            var name = "datei";
            try { name = decodeURIComponent(r.headers.get("X-Name") || "datei"); } catch (e) { /* Name bleibt */ }
            var typ = r.headers.get("Content-Type") || "";
            return r.blob().then(function (b) { return new File([b], name, { type: typ }); });
          });
        }));
      });
    }).then(function (dateien) {
      caches.delete("imagicruise-geteilt");
      var pakete = dateien.filter(function (d) { return /zip/i.test(d.type) || /\.zip$/i.test(d.name); });
      var fotos = dateien.filter(function (d) { return pakete.indexOf(d) < 0 && (/^image\//i.test(d.type) || /\.(jpe?g|png|webp)$/i.test(d.name)); });
      if (fotos.length) z.geteilt = fotos;
      if (pakete.length) paketEinlesen(pakete[0]);
      else if (!fotos.length) melden("Mit den geteilten Dateien kann Imagicruise nichts anfangen. Es nimmt Fotos (JPG, PNG, WebP) und Reisepakete (ZIP).", "fehler");
    }).catch(function () { /* nichts angekommen */ });
  }
  function geteiltHinweis() {
    if (!z.geteilt) return "";
    var n = z.geteilt.length;
    return '<div class="kasten geteilt"><h2>' + n + (n === 1 ? " Foto erhalten" : " Fotos erhalten") + "</h2><p>Tippe die Reise an, in die " + (n === 1 ? "es soll" : "sie sollen") +
      ', oder lege eine neue Reise an.</p><div class="knoepfe"><button type="button" class="ds-knopf ds-klein ds-zweit" data-a="geteilt-weg">Verwerfen</button></div></div>';
  }
  function geteiltAnbieten() {
    if (!z.geteilt || !z.reise) return;
    var fotos = z.geteilt, n = fotos.length, reise = z.reise;
    fragen((n === 1 ? "Das geteilte Foto" : "Die " + n + " geteilten Fotos") + " in die Reise „" + (reise.titel || "ohne Titel") + "“ einlesen?\n\n" +
      "Imagicruise ordnet sie nach dem Aufnahmedatum den Tagen zu und bündelt sie zu Ereignissen.", { ja: "Einlesen" }).then(function (ok) {
      if (!ok || z.reise !== reise) return;
      z.geteilt = null;
      fotosEinlesen(fotos, "reise");
    });
  }

  // ---------- Rundgang (wie in Imagiclique): erklärt jede Ansicht beim ersten Besuch Schritt für Schritt ----------
  // Jeder Schritt: [Element (CSS-Auswahl) oder null, Titel, Text]. Schritte, deren Element gerade nicht zu sehen ist,
  // werden ausgelassen. Gemerkt wird im Browser (localStorage „imagicruise-rundgang“), welche Ansichten erklärt sind.
  // „Rundgang starten“ im Menü ⋮ startet den Rundgang wieder. Das Fenster #rundgang ist ein <dialog>, damit es auch über dem
  // Ereignis-Blatt liegt und bedienbar bleibt.
  var mitDiktat = T.kannDiktieren();
  var RUNDGANG = {
    liste: [
      [null, "Willkommen bei Imagicruise", "Hier wird aus deinen Fotos und Notizen ein Reisebericht – Tag für Tag, mit Karte. Der Rundgang zeigt dir in wenigen Schritten, wie es geht."],
      ['.seitenkopf [data-a="neu"]', "Neue Reise", "Titel und Zeitraum genügen. Für jeden Tag der Reise entsteht eine eigene Seite."],
      [".reisen", "Deine Reisen", "Antippen öffnet eine Reise zum Weiterarbeiten."],
      ['[data-a="beispiel"]', "Beispielreise", "Zum Ausprobieren: eine erfundene Reise durchs Mittelmeer mit Tagen, Ereignissen und Fotos."],
      ['.seitenkopf [data-a="paket-einlesen"]', "Reisepaket einlesen", "Holt eine Reise von deinem anderen Gerät oder aus einer Sicherung. Das Reisepaket speicherst du in der Reise unter „Fertigstellen“."],
      [".kopf .im-knopf", "Menü", "Hier startest du diesen Rundgang jederzeit wieder. Dazu Hilfe und Design (hell oder dunkel)."]
    ],
    tage: [
      [".reiter", "Die Bereiche der Reise", "„Tage“: was ihr erlebt habt. „Reise“: Titel, Zeitraum und alle Fotos auf einmal. „Karte“: die Route. „Fertigstellen“: Reisebericht und Sicherung."],
      [".tagesleiste", "Die Tage", "Jeder Tag der Reise hat eine eigene Seite. Tippe einen Tag an, um ihn zu bearbeiten."],
      ["#ort-tag", "Ort des Tages", "Trage ein, wo ihr wart. Mit einer Position erscheint der Tag auf der Karte – über „Position suchen“, „Mein Standort“ oder als Koordinaten. „Infos zum Ort“ schlägt in der Wikipedia nach."],
      [".tag-raster .textfeld", "Was war heute?", "Ein paar Sätze zum Tag." + (mitDiktat ? " Lieber sprechen als tippen? „Diktieren“ schreibt mit." : "") + " Die „KI-Hilfe“ hilft beim Formulieren."],
      ['[data-a="fotos-tag"]', "Fotos zum Tag", "Der schnellste Weg: Wähle die Fotos des Tages. Imagicruise bündelt sie nach der Aufnahmezeit zu Ereignissen" + (APP || amPc ? " und übernimmt den Aufnahmeort für die Karte." : ".")],
      ['[data-a="ereignis-neu"]', "Ereignis anlegen", "Oder lege von Hand an, was ihr erlebt habt: eine Sehenswürdigkeit, einen Ausflug, ein Abendessen."],
      [".ereignisse", "Ereignisse des Tages", "Hier stehen die Ereignisse nach Uhrzeit. Antippen öffnet ein Ereignis zum Ändern."]
    ],
    ereignis: [
      ["#e-arten", "Art des Ereignisses", "Wähle, was es war. Das Zeichen der Art steht später im Reisebericht."],
      ["#ort-e", "Ort und Position", "Hat ein Foto einen Aufnahmeort, übernimmt Imagicruise die Position von selbst – du siehst sie hier an der Zeile mit 📍. Sonst setzt du sie mit den Knöpfen darunter."],
      ["#blatt .textfeld", "Was habt ihr erlebt?", "Erzähle in ein paar Sätzen." + (mitDiktat ? " „Diktieren“ schreibt mit, was du sprichst." : "") + " Die „KI-Hilfe“ glättet den Text oder erklärt den Ort."],
      ['#blatt [data-a="fotos-ereignis"]', "Fotos hinzufügen", "Hole Fotos zu diesem Ereignis. Unter jedem Foto: Bildtext, Reihenfolge, der Stift für die Bildbearbeitung und der Stern für das Titelbild der Reise."],
      ['#blatt [data-a="video-ereignis"]', "Kurzes Video", "Ein Video von höchstens einer Minute. Du wählst den Ausschnitt, Imagicruise verkleinert es."],
      ["#blatt .blatt-fuss", "Fertig", "Gespeichert wird von selbst. „Fertig“ schließt das Ereignis, „Löschen“ entfernt es."]
    ],
    reise: [
      ['[data-f="reise.titel"]', "Angaben zur Reise", "Titel, Unterzeile, Zeitraum, Einleitung und Schlusswort stehen später auf der ersten und letzten Seite des Reiseberichts."],
      ['[data-a="fotos-reise"]', "Fotos der ganzen Reise", "Wähle alle Fotos der Reise auf einmal. Imagicruise verteilt sie nach dem Aufnahmedatum auf die Tage und bündelt sie zu Ereignissen."],
      [".bildwahl", "Titelbild", "Tippe das Foto an, das groß auf der ersten Seite stehen soll."]
    ],
    karte: [
      [null, "Die Karte der Route", "Auf der Karte erscheint jeder Tag und jedes Ereignis, das eine Position hat. Die Karte ist gezeichnet – es wird nichts aus dem Internet geladen."],
      [".karte", "Eure Route", "Die Zahlen sind die Tage der Reise, die Linie verbindet sie in der Reihenfolge."],
      [".seite .hinweis.warn", "Ohne Position", "Diese Orte fehlen noch auf der Karte. Antippen führt zum Tag – dort setzt du die Position."]
    ],
    fertig: [
      [".pruefliste", "Prüfliste", "Zeigt, was noch fehlt. „ansehen“ führt direkt zur Stelle."],
      ['[data-a="vorschau"]', "Vorschau", "So sieht der Reisebericht aus – als Handy oder als großer Bildschirm."],
      ['[data-a="bericht-zip"]', "Reisebericht speichern", "Der Reisebericht ist eine kleine Webseite in einer ZIP-Datei" + (APP ? ". Sie landet im Ordner „Download/Imagicruise“ des Handys." : " zum Weitergeben oder Hochladen.")],
      ['[data-a="paket-speichern"]', "Reisepaket", "Deine Sicherung – und der Weg, die Reise auf dein anderes Gerät zu bringen. Speichere es zwischendurch immer wieder."]
    ]
  };
  var rg = { schritte: null, nr: 0 };
  function rgGesehen() {
    try { var g = JSON.parse(localStorage.getItem("imagicruise-rundgang") || "{}"); return g && typeof g === "object" ? g : {}; } catch (e) { return {}; }
  }
  function rgMerken(g) { try { localStorage.setItem("imagicruise-rundgang", JSON.stringify(g)); } catch (e) { /* dann kommt der Rundgang eben wieder */ } }
  function rgElement(q) {
    var el = q ? document.querySelector(q) : null;
    if (!el || el.closest("[hidden]")) return null;
    var r = el.getBoundingClientRect();
    return r.width > 8 && r.height > 8 ? el : null;
  }
  // Passt der Rundgang zu dem, was gerade zu sehen ist? (Nicht über einer Rückfrage und nicht während einer Arbeit.)
  function rgPasst(name) {
    var offen = Array.prototype.filter.call(document.querySelectorAll("dialog[open]"), function (d) { return d.id !== "rundgang"; });
    if (Design.arbeitLaeuft()) return false;
    if (name === "ereignis") return offen.length === 1 && offen[0].id === "blatt";
    if (offen.length) return false;
    return name === "liste" ? !z.reise && !!ansicht.querySelector(".seitenkopf") : !!z.reise && z.bereich === name;
  }
  function rundgangStarten(name) {
    if (rg.schritte || !RUNDGANG[name] || !rgPasst(name)) return false;
    var schritte = RUNDGANG[name].filter(function (s) { return !s[0] || rgElement(s[0]); });
    var g = rgGesehen(); g[name] = true; rgMerken(g);
    if (!schritte.length) return false;
    rg.schritte = schritte; rg.nr = 0;
    $("#rundgang").showModal();
    rgSchritt();
    return true;
  }
  // Beim ersten Besuch einer Ansicht von selbst starten – kurz warten, bis die Ansicht steht
  function rundgangVielleicht(name) {
    var g = rgGesehen();
    if (g.aus || g[name]) return;
    setTimeout(function () {
      if (startLaeuft) { rundgangWartet = name; return; }   // erst nach dem Startbildschirm
      var h = rgGesehen(); if (!h.aus && !h[name]) rundgangStarten(name);
    }, 400);
  }
  function rgSchritt() {
    var d = $("#rundgang"), s = rg.schritte[rg.nr], el = rgElement(s[0]), licht = d.querySelector(".rg-licht"), blase = d.querySelector(".rg-blase");
    var letzter = rg.nr === rg.schritte.length - 1;
    if (el) el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    blase.innerHTML = '<h2 id="rg-titel">' + esc(s[1]) + "</h2><p>" + esc(s[2]) + '</p><div class="rg-zeile"><span class="rg-punkte" aria-hidden="true">' +
      rg.schritte.map(function (x, i) { return '<i class="' + (i === rg.nr ? "an" : "") + '"></i>'; }).join("") + "</span>" +
      '<button type="button" class="ds-knopf ds-klein ds-zweit" data-a="rg-ende">' + (letzter ? "Schließen" : "Überspringen") + "</button>" +
      (letzter ? "" : '<button type="button" class="ds-knopf ds-klein" data-a="rg-weiter">Weiter</button>') + "</div>";
    d.classList.toggle("ohne-ziel", !el);
    var vh = window.innerHeight, vw = window.innerWidth, bh = blase.offsetHeight, mitte = Math.max(8, (vh - bh) / 2);
    if (el) {
      var r = el.getBoundingClientRect(), m = 6, oben = Math.max(r.top - m, 4), unten = Math.min(r.bottom + m, vh - 4);
      var links = Math.max(r.left - m, 4), rechts = Math.min(r.right + m, vw - 4);
      licht.style.left = links + "px"; licht.style.top = oben + "px"; licht.style.width = (rechts - links) + "px"; licht.style.height = (unten - oben) + "px";
      blase.style.top = (vh - unten > bh + 20 ? unten + 12 : oben > bh + 20 ? oben - bh - 12 : mitte) + "px";
    } else blase.style.top = mitte + "px";
    var knopf = blase.querySelector('[data-a="rg-weiter"]') || blase.querySelector('[data-a="rg-ende"]');
    knopf.focus({ preventScroll: true });
  }
  // Ende über „Überspringen“/„Schließen“, die Esc-Taste oder die Zurück-Taste des Handys
  $("#rundgang").addEventListener("close", function () {
    rg.schritte = null;
    if (z.geteilt && z.reise && !document.querySelector("dialog[open]")) geteiltAnbieten();
  });
  window.addEventListener("resize", function () { if (rg.schritte) rgSchritt(); });

  // ---------- Android-App: was die App meldet und was die Oberfläche von ihr braucht ----------
  // Die App (android/…/MainActivity.java) ruft diese Funktionen über ImagicruiseStudio.app…(…) auf.
  // Gewählte oder geteilte Dateien liegen unter /_wahl/<runde>/<nr> bereit – Fotos dort im Original, also mit Aufnahmeort.
  // Ein Foto aus der App holen. adressen: { original, bild, kopf }.
  // Schneller Weg: Die App liefert das Foto schon fertig (bild: verkleinert, JPEG, ohne Bilddaten) und dazu den Anfang
  // des Originals (kopf), aus dem Aufnahmezeit und -ort gelesen werden. Die Seite zeichnet dann nichts mehr neu.
  // Klappt das nicht (z. B. ein Format, das Android nicht öffnen kann), kommt das ganze Original – der langsame Weg.
  function appFoto(name, adressen) {
    function original() {
      return fetch(adressen.original).then(function (r) {
        if (!r.ok) throw new Error("„" + name + "“ ließ sich nicht lesen.");
        return r.blob();
      }).then(function (b) { return new File([b], name, { type: b.type }); });
    }
    // Videos in der Android-App (seit 20.11.2026, Baustein videoschnitt 1.3.0): nicht ganz herüberholen, sondern ein Stellvertreter,
    // der nur die Stücke holt, die Zuschneiden und Umrechnen brauchen (bei großen Videos sonst viele Sekunden; Wunsch Mario)
    if (adressen.stueck && window.ImagicosmosVideoSchnitt && window.ImagicosmosVideoSchnitt.fernOeffnen) return { name: name, holen: function () {
      return window.ImagicosmosVideoSchnitt.fernOeffnen(adressen.stueck, { name: name }).catch(original);
    } };
    if (!adressen.bild) return { name: name, holen: original };
    return { name: name, schnell: true, holen: function () {
      var angaben = fetch(adressen.kopf).then(function (r) { if (!r.ok) throw new Error("kopf"); return r.arrayBuffer(); })
        .then(function (b) { return window.ImagicosmosFotoDaten.lesen(b); });
      var fertig = fetch(adressen.bild).then(function (r) { if (!r.ok) throw new Error("bild"); return r.blob(); });
      return Promise.all([fertig, angaben]).then(function (r) {
        var f = new File([r[0]], name, { type: "image/jpeg" });
        f.fotoAngaben = r[1];
        f.fotoFertig = true;
        return f;
      }).catch(original);
    } };
  }
  function appDateien(runde, namen) {
    return namen.map(function (name, i) {
      var basis = "/_wahl/" + runde + "/" + i;
      // Reisepakete (ZIP) und Videos immer im Original; Fotos auf dem schnellen Weg
      return appFoto(name, /\.(zip|mp4|mov|m4v)$/i.test(name) ? { original: basis } : { original: basis, bild: basis + "/bild", kopf: basis + "/kopf" });
    });
  }
  // Hinweis, wenn die App den Aufnahmeort nicht lesen darf (dann kommen die Fotos wie im Browser ohne Ort an)
  function appOrtHinweis() {
    if (APP && !APP.ortAusFotosErlaubt()) melden("Imagicruise darf den Aufnahmeort der Fotos nicht lesen. Erlaube in den Einstellungen des Handys unter Apps → Imagicruise → Berechtigungen den Zugriff auf „Fotos und Videos“ (alle).", "", 12000);
  }
  var appRufe = {
    appAuswahl: function (runde, namen) {
      if (!z.reise || !z.fotoZiel || !namen.length) return;
      appOrtHinweis();
      fotosEinlesen(appDateien(runde, namen), z.fotoZiel);
    },
    // Auswahl wie in der Galerie (Baustein fotoauswahl): Die App liefert die Fotos des Handys unter /_galerie/…
    // erlaubt = false: kein Zugriff auf die Fotos – dann der Dateien-Wähler von Android.
    // Videos (seit fotoauswahl 1.2.0): beim Ereignis direkt dorthin; bei Tag und Reise werden sie mit Aufnahmezeit und -ort wie Fotos
    // in Ereignisse eingeteilt (fotosEinlesen). Danach kommt jedes Video einzeln mit dem Fenster zum Zuschneiden ins Ereignis.
    appGalerie: function (erlaubt) {
      var ziel = z.fotoZiel, nurVideo = !!z.videoWahl;
      z.videoWahl = false;
      if (!z.reise || !ziel) return;
      if (!erlaubt) { if (nurVideo) { var dv = $("#datei-video"); dv.value = ""; dv.click(); } else APP.fotosWaehlen(); return; }
      var t = ziel === "reise" ? null : tag();
      window.ImagicosmosFotoAuswahl.oeffnen({
        quelle: {
          liste: function () { return fetch("/_galerie/liste").then(function (r) { if (!r.ok) throw new Error("Die Fotos des Handys konnten nicht gelesen werden."); return r.json(); }); },
          vorschau: function (e) { return "/_galerie/vorschau/" + e.id; }
        },
        titel: nurVideo ? "Video zum Ereignis" : ziel === "reise" ? "Fotos der Reise" : ziel === "tag" ? "Fotos zum Tag" : "Fotos zum Ereignis",
        knopf: "Einlesen", filter: nurVideo ? "video" : "alle", hoechstens: nurVideo ? 1 : 0,
        von: t ? t.datum : z.reise.von, bis: t ? t.datum : z.reise.bis,
        weitere: { text: "Aus Dateien wählen", aktion: function () {
          z.fotoZiel = ziel;
          if (nurVideo) { var dv = $("#datei-video"); dv.value = ""; dv.click(); } else APP.fotosWaehlen();
        } }
      }).then(function (gewaehlt) {
        if (!gewaehlt || !gewaehlt.length || !z.reise) return;
        var fotos = gewaehlt.filter(function (e) { return !e.video; }), videos = gewaehlt.filter(function (e) { return e.video; });
        appOrtHinweis();
        // Aufnahmeort der Videos liest die App (MediaMetadataRetriever); Aufnahmezeit steht schon in der Liste
        return Promise.all(videos.map(function (e) {
          return fetch("/_galerie/videoort/" + e.id).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(function (o) {
            return { video: true, eintrag: e, zeit: e.zeit || "", lat: typeof o.lat === "number" ? o.lat : null, lon: typeof o.lon === "number" ? o.lon : null };
          });
        })).then(function (vorgemerkt) {
          return fotosEinlesen(fotos.map(function (e) {
            return appFoto(e.name || "foto.jpg", { original: "/_galerie/original/" + e.id, bild: "/_galerie/bild/" + e.id, kopf: "/_galerie/kopf/" + e.id });
          }), ziel, vorgemerkt);
        }).then(function (auftraege) {
          return videosAbarbeiten(auftraege, function (v) { return appFoto(v.eintrag.name || "video.mp4", { original: "/_galerie/original/" + v.eintrag.id, stueck: "/_galerie/stueck/" + v.eintrag.id }).holen(); });
        });
      }).catch(fehlerMelden);
    },
    appGeteilt: function (runde, namen) {
      var alle = appDateien(runde, namen);
      var pakete = alle.filter(function (d) { return /\.zip$/i.test(d.name); });
      var fotos = alle.filter(function (d) { return pakete.indexOf(d) < 0; });
      if (pakete.length) { pakete[0].holen().then(paketEinlesen).catch(fehlerMelden); return; }
      if (!fotos.length) return;
      appOrtHinweis();
      z.geteilt = fotos;
      if (z.reise && !document.querySelector("dialog[open]")) geteiltAnbieten(); else if (!z.reise) liste();
    },
    appDiktat: function (text) { T.androidErgebnis(text); },   // Ergebnis der Spracheingabe des Handys (Android-Hülle)
    appMeldung: function (text) { melden(String(text), "fehler"); },
    // Zurück-Taste des Handys: oberstes Fenster schließen, sonst aus der Reise zur Liste. false = die App darf in den Hintergrund.
    appZurueck: function () {
      var offen = Array.prototype.filter.call(document.querySelectorAll("dialog[open]"), function (d) { return d.matches(":modal"); });
      if (Design.arbeitLaeuft()) return true;                    // während einer Arbeit nichts tun
      if (offen.length) { offen[offen.length - 1].close(); return true; }
      if (menue && !menue.menue.hidden) { menue.menueSchliessen(); return true; }
      if (menue && (!menue.ueber.hidden || !menue.hilfe.hidden)) { history.back(); return true; }   // der Baustein schließt die Seite beim Zurückgehen
      if (z.reise) { location.hash = "#/"; return true; }
      return false;
    }
  };
  // Datei über die App speichern oder teilen (eine Seite in der App kann nicht von selbst in „Downloads“ schreiben)
  // Inhalt einer Datei in Stücken (Base64) an die App schicken; danach dateiFertig oder weiterAblegen
  function appHochladen(blob) {
    return blob.arrayBuffer().then(function (puffer) {
      var bytes = new Uint8Array(puffer), STUECK = 3 * 200000, i, j;
      if (!APP.dateiBeginnen()) throw new Error("Auf dem Gerät ist kein Platz für die Datei.");
      for (i = 0; i < bytes.length; i += STUECK) {
        var teil = bytes.subarray(i, i + STUECK), text = "";
        for (j = 0; j < teil.length; j += 30000) text += String.fromCharCode.apply(null, teil.subarray(j, j + 30000));
        if (!APP.dateiTeil(btoa(text))) throw new Error("Die Datei konnte nicht geschrieben werden (Speicher voll?).");
      }
    });
  }
  function appDatei(blob, name, aktion) {
    arbeit(aktion === "speichern" ? "Die Datei wird gespeichert …" : "Die Datei wird zum Teilen vorbereitet …");
    return appHochladen(blob).then(function () {
      var ort = APP.dateiFertig(name, blob.type || "application/octet-stream", aktion);
      arbeitEnde();
      if (!ort) throw new Error("Die Datei konnte nicht gespeichert werden.");
      if (aktion === "teilen") melden("Zum Teilen bereit. Eine Kopie liegt in " + ort + ".", "gut", 7000);
      if (aktion === "status") melden("An WhatsApp übergeben – dort nur noch „Senden“ antippen. Eine Kopie liegt in " + ort + ".", "gut", 9000);
      return ort;
    }, function (e) { arbeitEnde(); throw e; }).catch(function (e) { arbeitEnde(); throw e; });
  }

  // ---------- Aktionen ----------
  var aktionen = {
    "punkte-ziehen": function () { z.punkteZiehen = !z.punkteZiehen; zeichneReise(); var k = document.getElementById("punkte-ziehen"); if (k) k.focus(); },
    "punkt-zurueck": function () {
      var liste = rueckSchritte(), r = liste[liste.length - 1], t = r && z.reise.tage[r.tag];
      if (r) z.punktRueck.splice(z.punktRueck.lastIndexOf(r), 1);
      var ziel = t && (r.art === "ereignis" ? t.ereignisse.filter(function (e) { return e.id === r.ereignis; })[0] : t);
      if (!ziel) { zeichneReise(); return; }
      positionSetzen(ziel, r.lat, r.lon);
      zeichneReise();
      melden("Position von „" + (r.name || "ohne Namen") + "“ wie vorher.");
    },
    "route-abspielen": function (el) {
      var svg = ansicht.querySelector(".karte .ik-karte");
      if (z.route && z.route.laeuft()) { z.route.pause(); el.textContent = "▶ Weiter"; return; }
      if (z.route) { z.route.weiter(); el.textContent = "⏸ Anhalten"; return; }
      z.route = Karte.abspielen(svg, { fertig: function () { z.route = null; el.textContent = "↻ Noch einmal"; } });
      if (z.route) el.textContent = "⏸ Anhalten";
    },
    "rg-weiter": function () { if (rg.schritte && rg.nr < rg.schritte.length - 1) { rg.nr++; rgSchritt(); } },
    "rg-ende": function () { $("#rundgang").close(); },
    "rundgang-zeigen": function () {
      rgMerken({});
      if (!rundgangStarten(z.reise ? z.bereich : "liste")) melden("Der Rundgang erscheint wieder, sobald du die Bereiche öffnest.");
    },
    "geteilt-weg": function () { z.geteilt = null; liste(); melden("Die geteilten Fotos wurden verworfen."); },
    "neu": neueReiseFragen,
    "beispiel": beispielLaden,
    "oeffnen": function (el) { location.hash = "#/reise/" + el.dataset.id; },
    "tag": function (el) {
      var nr = +el.dataset.nr;
      if (nr < 0 || nr >= z.reise.tage.length) return;
      z.tag = nr;
      history.replaceState(null, "", adresse());
      zeichneReise();
    },
    "ereignis-neu": function () {
      var e = M.neuesEreignis();
      tag().ereignisse.push(e);
      z.ereignis = e; stempel("e");
      ereignisOeffnen(e);
    },
    "ereignis": function (el) {
      var e = tag().ereignisse.filter(function (x) { return x.id === el.dataset.id; })[0];
      if (e) ereignisOeffnen(e);
    },
    "blatt-zu": blattSchliessen,
    "status-ereignis": function () {
      var e = z.ereignis, t = tag();
      statusOeffnen({ titel: e.titel, text: e.text, fusszeile: statusFusszeile(t, e.ort.name || t.ort.name), fotos: e.fotos, name: e.titel || "ereignis" });
    },
    "status-tag": function () {
      var t = tag(), fotos = [];
      M.ereignisseSortiert(t).forEach(function (e) { fotos = fotos.concat(e.fotos); });
      statusOeffnen({ titel: t.titel, text: t.text, fusszeile: statusFusszeile(t, t.ort.name), fotos: fotos, name: t.titel || ("tag-" + t.datum) });
    },
    "e-art": function (el) {
      z.ereignis.art = el.dataset.art; stempel("e");
      Array.prototype.forEach.call($("#e-arten").children, function (b) { b.classList.toggle("an", b === el); b.setAttribute("aria-pressed", b === el); });
    },
    "e-sterne": function (el) { z.ereignis.bewertung = +el.dataset.n; stempel("e"); sterneZeichnen(); },
    "e-loeschen": function () {
      var e = z.ereignis;
      fragen("Dieses Ereignis" + (e.titel ? " („" + e.titel + "“)" : "") + " löschen?" + (e.fotos.length ? "\nSeine " + e.fotos.length + " Fotos verschwinden aus dem Reisebericht." : ""), { ja: "Löschen", gefahr: true }).then(function (ok) {
        if (!ok) return;
        z.reise.tage.forEach(function (t) { t.ereignisse = t.ereignisse.filter(function (x) { return x !== e; }); });
        z.reise.geloescht[e.id] = M.jetzt();
        z.reise.geaendert = M.jetzt();
        tageAufraeumen();
        speichernBald();
        blattSchliessen();
      });
    },
    // Tag leeren: alle Ereignisse und Angaben des Tages weg. Liegt er außerhalb des Zeitraums, verschwindet er damit ganz.
    "tag-leeren": function () {
      var t = tag(), aussen = tagAussen(t), n = t.ereignisse.length, fotos = 0;
      t.ereignisse.forEach(function (e) { fotos += e.fotos.length; });
      fragen((aussen ? "Diesen Tag löschen?" : "Diesen Tag leeren?") + "\n\n" + M.wochentag(t.datum) + ", " + M.datumText(t.datum) +
        (n ? "\n" + n + (n === 1 ? " Ereignis" : " Ereignisse") + (fotos ? " mit " + fotos + (fotos === 1 ? " Foto" : " Fotos") : "") + " verschwinden aus dem Reisebericht." : "") +
        (aussen ? "" : "\n\nDer Tag selbst bleibt, weil er im Zeitraum der Reise liegt. Den Zeitraum änderst du im Bereich „Reise“."),
        { ja: aussen ? "Tag löschen" : "Tag leeren", gefahr: true }).then(function (ok) {
        if (!ok) return;
        var jetzt = M.jetzt();
        t.ereignisse.forEach(function (e) { z.reise.geloescht[e.id] = jetzt; });
        t.ereignisse = []; t.titel = ""; t.text = ""; t.art = "normal"; t.ort = M.neuerTag(t.datum).ort;
        t.geaendert = jetzt; z.reise.geaendert = jetzt;
        tageAufraeumen();
        speichernBald();
        history.replaceState(null, "", adresse());
        zeichneReise(true);
        melden(aussen ? "Der Tag wurde gelöscht." : "Der Tag wurde geleert.", "gut");
      });
    },
    "fotos-ereignis": function () { fotosWaehlen("ereignis"); },
    // In der App: Auswahl wie in der Galerie mit dem Filter „Videos“ (appGalerie); sonst der Dateien-Wähler für Videos
    "video-ereignis": function () {
      if (APP && APP.galerieOeffnen) { z.fotoZiel = "ereignis"; z.videoWahl = true; APP.galerieOeffnen(); return; }
      var f = $("#datei-video"); f.value = ""; f.click();
    },
    "fotos-tag": function () { fotosWaehlen("tag"); },
    "fotos-reise": function () { fotosWaehlen("reise"); },
    "foto-schieben": function (el) {
      var f = z.ereignis.fotos, i = +el.dataset.i, j = i + +el.dataset.um;
      if (j < 0 || j >= f.length) return;
      var x = f[i]; f[i] = f[j]; f[j] = x;
      stempel("e"); fotolisteZeichnen();
    },
    "foto-weg": function (el) {
      var f = z.ereignis.fotos.splice(+el.dataset.i, 1)[0];
      if (f && z.reise.titelbild === f.datei && !M.alleFotos(z.reise).some(function (x) { return x.foto.datei === f.datei; })) { z.reise.titelbild = ""; z.reise.stamm_geaendert = M.jetzt(); }
      stempel("e"); fotolisteZeichnen();
    },
    "foto-bearbeiten": function (el) { fotoBearbeiten(z.ereignis, +el.dataset.i); },
    "foto-titelbild": function (el) {
      var f = z.ereignis.fotos[+el.dataset.i];
      z.reise.titelbild = z.reise.titelbild === f.datei ? "" : f.datei;
      stempel("stamm"); fotolisteZeichnen();
      melden(z.reise.titelbild ? "Dieses Foto ist jetzt das Titelbild der Reise." : "Titelbild entfernt.");
    },
    "titelbild": function (el) {
      z.reise.titelbild = z.reise.titelbild === el.dataset.datei ? "" : el.dataset.datei;
      stempel("stamm"); zeichneReise();
    },
    "ort-suchen": function (el) { ortSuchen(el.dataset.wer, el); },
    "ort-hier": function (el) { ortHier(el.dataset.wer); },
    "ort-eingeben": function (el) { ortEingeben(el.dataset.wer); },
    "ort-infos": function (el) { ortInfos(el.dataset.wer, el); },
    "info-nehmen": function (el) { infoNehmen(el.dataset.wer, +el.dataset.i); },
    "ort-treffer": function (el) { ortSetzen(el.dataset.wer, +el.dataset.lat, +el.dataset.lon); melden("Position übernommen.", "gut"); },
    "ort-weg": function (el) { var o = ortVon(el.dataset.wer); o.lat = o.lon = null; stempel(el.dataset.wer); ortfeldNeu(el.dataset.wer); },
    "vorschau": vorschauOeffnen,
    "vorschau-zu": function () { $("#vorschau").close(); },
    "vorschau-breite": function (el) {
      $(".vorschau-rahmen").classList.toggle("handy", el.dataset.breite === "handy");
      Array.prototype.forEach.call(el.parentNode.children, function (b) { b.classList.toggle("an", b === el); });
    },
    "bericht-ordner": function () {
      berichtBauen().then(function (eintraege) {
        return speicher.exportieren(z.reise.id, eintraege, function (i, n) { arbeit("Der Reisebericht wird geschrieben …", i, n); });
      }).then(function (erg) { arbeitEnde(); z.exportOrdner = erg.ordner; zeichneReise(); melden("Der Reisebericht ist fertig.", "gut"); })
        .catch(function (e) { arbeitEnde(); fehlerMelden(e); });
    },
    "bericht-zip": function () {
      berichtBauen().then(function (eintraege) {
        arbeitEnde();
        herunterladen(new Blob(Z.schreiben(eintraege), { type: "application/zip" }), "reisebericht-" + P.dateiname(z.reise) + ".zip");
        melden("Der Reisebericht wurde als ZIP-Datei gespeichert (Downloads).", "gut");
      }).catch(function (e) { arbeitEnde(); fehlerMelden(e); });
    },
    "ordner": function (el) { speicher.ordnerOeffnen(z.reise.id, el.dataset.welcher).catch(fehlerMelden); },
    "paket-speichern": function () {
      paketBlob().then(function (b) { herunterladen(b, paketName()); melden("Das Reisepaket wurde gespeichert (Downloads). Auf dem anderen Gerät „Reisepaket einlesen“ wählen.", "gut", 8000); }).catch(fehlerMelden);
    },
    "paket-teilen": function () {
      paketBlob().then(function (b) {
        if (APP) return appDatei(b, paketName(), "teilen");
        var datei = new File([b], paketName(), { type: "application/zip" });
        if (!navigator.canShare || !navigator.canShare({ files: [datei] })) { herunterladen(b, paketName()); melden("Teilen geht hier nicht – das Reisepaket wurde gespeichert (Downloads)."); return; }
        return navigator.share({ files: [datei], title: z.reise.titel });
      }).catch(function (e) { if (!e || e.name !== "AbortError") fehlerMelden(e); });
    },
    "paket-einlesen": function () { var f = $("#datei-paket"); f.value = ""; f.click(); },
    "reise-loeschen": function () {
      var id = z.reise.id;
      fragen("Die Reise „" + (z.reise.titel || "ohne Titel") + "“ wirklich löschen?" + (amPc ? "" : "\nAlle Fotos dieser Reise werden von diesem Gerät entfernt."), { ja: "Reise löschen", gefahr: true }).then(function (ok) {
        if (!ok) return;
        z.offen = false; clearTimeout(z.timer);
        (z.schreibt || Promise.resolve()).then(function () { return speicher.loeschen(id); }).then(function () {
          z.reise = null; urlsFreigeben(); melden("Die Reise wurde gelöscht.");
          location.hash = "#/";
        }).catch(fehlerMelden);
      });
    }
  };
  Object.keys(kiAktionen).forEach(function (k) { aktionen[k] = kiAktionen[k]; });
  document.addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-a]");
    if (!el || el.disabled) return;
    var a = aktionen[el.dataset.a];
    if (a) { ev.preventDefault(); a(el); }
  });

  // ---------- Web-App auf dem Gerät: installieren, ohne Netz nutzbar ----------
  if (!amPc && !APP) {
    var l = document.createElement("link");
    l.rel = "manifest"; l.href = "../manifest.webmanifest";
    document.head.appendChild(l);
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
      navigator.serviceWorker.register("../sw.js").catch(function () { /* ohne Service Worker läuft die App nur mit Netz */ });
    }
  }

  // ---------- Menü ⋮ mit Design, Hilfe und „Über“ (Baustein menue), neue Versionen melden (Baustein aktualisieren) ----------
  var WEBSEITE = "https://imagicruise.de/";
  var AKT = window.ImagicosmosAktualisieren || null;
  // Welcher Abschnitt der Hilfe aufgeklappt ist (data-schritt im <template id="hilfetext">)
  function hilfeSchritt() { return z.reise ? ({ tage: 2, reise: 3, karte: 4, fertig: 5 })[z.bereich] || 2 : 1; }
  var menue = null;
  // Untertitel im Kopf: Name der offenen Reise (vor dem Einrichten des Menüs nur gemerkt)
  var kopfText = "";
  function kopfOrt(t) { kopfText = t || ""; if (menue && menue.kopf) menue.kopf.untertitel(kopfText); }
  if (window.ImagicosmosMenue) {
    menue = window.ImagicosmosMenue.einrichten({
      app: "imagicruise", name: "Imagicruise",
      untertitel: "Reiseberichte: eure Reise, Station für Station · Teil von Imagicosmos",
      ort: $(".kopf"),
      fassung: fassungAngaben(), betrieb: betriebText(),
      android: !!APP,
      seite: WEBSEITE,
      farben: { hell: "#ffffff", dunkel: "#171a20" },      // Farbe der Statusleiste = Farbe des Kopfes
      kopf: { ort: $(".kopf"), icon: "favicon.svg", ziel: "#/", zielText: "Zur Liste der Reisen" },
      eintraege: [{ text: "Rundgang starten", symbol: "rundgang", aktion: function () { aktionen["rundgang-zeigen"](); } }],
      hilfe: document.getElementById("hilfetext").content.cloneNode(true),
      schritt: hilfeSchritt,
      deineDaten: [
        amPc ? "Deine Reisen liegen als Ordner auf deinem PC (im Ordner „Imagicruise“ in deinem Benutzerordner), nicht im Internet."
             : "Deine Reisen und Fotos bleiben auf diesem Gerät, im Speicher " + (APP ? "der App" : "des Browsers") + ". Imagicruise hat keinen eigenen Server und kein Konto.",
        "Aufnahmeort und Kameradaten der Fotos werden nur gelesen, um Tag, Uhrzeit und Position vorzuschlagen. In den gespeicherten Fotos stehen sie nicht.",
        "Fremde Dienste nur auf Knopfdruck und nach Rückfrage: Ortssuche bei OpenStreetMap, Infos zum Ort aus der Wikipedia (nur Name oder Position) und Diktieren (Spracherkennung des Browsers).",
        APP ? "Neue Versionen: Die App liest einmal am Tag eine kleine Datei auf imagicruise.de. Dabei sieht GitHub die Internet-Adresse des Handys, sonst nichts. Abschaltbar oben unter „Nach neuen Versionen sehen“."
            : "Die KI-Hilfe schickt nichts selbst an eine KI: Du kopierst die Frage in deine eigene KI-App.",
        "Der fertige Reisebericht ist für jeden lesbar, der seine Adresse kennt. Suchmaschinen werden gebeten, ihn nicht aufzunehmen.",
        "Sicherung: Das Reisepaket (unter „Fertigstellen“) speicherst du selbst. Ohne Reisepaket ist eine Reise weg, wenn " + (amPc ? "der Ordner gelöscht wird." : (APP ? "die App" : "der Browser") + " seine Daten löscht.")
      ],
      weitereLizenzen: ["Ortstexte aus der Wikipedia (CC BY-SA 4.0)", "Ortssuche: Daten von OpenStreetMap (ODbL)", "Fotos der Beispielreise: siehe Bildnachweis im Reisebericht"]
    });
    if (menue.kopf) menue.kopf.untertitel(kopfText);
  }
  // Startbildschirm „Zauberstab“ (Baustein zauberstab), Schriftzug und Farben aus dem Kopf; ein wartender Rundgang kommt danach
  var startLaeuft = false, rundgangWartet = null;
  if (menue && menue.kopf && window.ImagicosmosZauberstab) {
    startLaeuft = true;
    window.ImagicosmosZauberstab.startbildschirm({
      wort: menue.kopf.wort,
      stern: { hell: "#4338ca", dunkel: "#818cf8" }, band: { hell: "#818cf8", dunkel: "#c7d2fe" },
      beiEnde: function () { startLaeuft = false; if (rundgangWartet) { var n = rundgangWartet; rundgangWartet = null; rundgangVielleicht(n); } }
    });
  }
  if (AKT && APP) {
    // Android-App von der Webseite: einmal am Tag nach einer neuen Fassung sehen (abschaltbar unter „Über“)
    AKT.pruefen({ app: "imagicruise", fassung: fassungNummer(), seite: WEBSEITE })
      .then(function (e) { AKT.hinweisZeigen(e, { app: "imagicruise", name: "Imagicruise" }); });
  } else if (AKT && !amPc) {
    // Web-App: Der Browser lädt neue Fassungen selbst; Hinweis „Neu laden“, sobald eine geladen ist
    AKT.webApp.beobachten(function () { AKT.webApp.hinweisZeigen({ name: "Imagicruise" }); });
  }

  // Für Tests und zum Nachsehen in der Konsole
  window.ImagicruiseStudio = { menue: menue, zustand: z, speicher: speicher, speichernJetzt: speichernJetzt, fotosEinlesen: fotosEinlesen, paketEinlesen: paketEinlesen, videoEinlesen: videoEinlesen };
  Object.keys(appRufe).forEach(function (k) { window.ImagicruiseStudio[k] = appRufe[k]; });

  geteiltHolen().then(weg).then(function () { if (APP) APP.bereit(); });
})();
