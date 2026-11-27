// Baustein „fotoauswahl“ – Fotos auswählen wie in der Galerie. Quelle: Repo imagicosmos/bausteine, fotoauswahl/foto-auswahl.js.
// In den Apps eine Kopie: NICHT VON HAND ÄNDERN, Fehler im Repo bausteine beheben und neu einbauen.
//
// Zeigt die Fotos einer Quelle als Raster, nach Tagen geordnet (neueste oben). Einmal antippen wählt ein Foto aus,
// nochmal antippen wählt es wieder ab; je Tag gibt es „Alle“. Oben steht die Anzahl, „Übernehmen“ gibt die Auswahl zurück.
//
// Der Baustein weiß nicht, woher die Fotos kommen und was die App damit macht. Die App übergibt eine Quelle:
//   quelle.liste()          → Promise mit [{ id, zeit: "2026-05-10T14:23:05" oder "", name: "IMG_1.jpg" }, …]
//                             Videos (ab 1.2.0) zusätzlich mit video: true und dauer (Sekunden): Sie zeigen ▶ und ihre Länge,
//                             und oben erscheint der Filter „Alle · Fotos · Videos“ (wahl.filter: Start-Filter "alle" | "foto" | "video")
//   quelle.vorschau(eintrag) → Adresse eines kleinen Vorschaubilds (Text oder Promise darauf)
// und bekommt die gewählten Einträge zurück (dieselben Objekte, nach Aufnahmezeit aufsteigend). Das Original holt die App selbst.
//
// Gebraucht wird die Gestaltung aus foto-auswahl.css. Die Rechenteile (gruppieren, Auswahl, Sprungziel) laufen auch
// unter Node.js (Tests), das Fenster nur im Browser. Ohne fremden Code.
(function (wurzel) {
  "use strict";

  var VERSION = "1.2.0";
  var MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  var WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  var TAGE_JE_SCHUB = 40;   // so viele Tage werden auf einmal gezeichnet; weitere beim Blättern

  function istDatum(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function datumVon(eintrag) {
    var z = eintrag && typeof eintrag.zeit === "string" ? eintrag.zeit.slice(0, 10) : "";
    return istDatum(z) ? z : "";
  }
  function heuteText(jetzt) {
    var d = jetzt || new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function tagDavor(datum) {
    var t = datum.split("-"), d = new Date(+t[0], +t[1] - 1, +t[2] - 1);
    return heuteText(d);
  }

  // "2026-05-10" → "Sonntag, 10. Mai 2026"; heute und gestern heißen so. "" → "Ohne Datum"
  function tagTitel(datum, heute) {
    if (!istDatum(datum)) return "Ohne Datum";
    heute = istDatum(heute) ? heute : heuteText();
    var t = datum.split("-"), d = new Date(+t[0], +t[1] - 1, +t[2]);
    var text = WOCHENTAGE[d.getDay()] + ", " + (+t[2]) + ". " + MONATE[+t[1] - 1] + " " + t[0];
    if (datum === heute) return "Heute – " + text;
    if (datum === tagDavor(heute)) return "Gestern – " + text;
    return text;
  }
  // "2026-05-10", "2026-05-17" → "10.–17. Mai 2026" (kurz, für den Knopf „Zum Zeitraum“)
  function zeitraumText(von, bis) {
    if (!istDatum(von) && !istDatum(bis)) return "";
    if (!istDatum(von)) von = bis;
    if (!istDatum(bis) || bis < von) bis = von;
    var a = von.split("-"), b = bis.split("-");
    if (von === bis) return (+a[2]) + ". " + MONATE[+a[1] - 1] + " " + a[0];
    if (a[0] === b[0] && a[1] === b[1]) return (+a[2]) + ".–" + (+b[2]) + ". " + MONATE[+b[1] - 1] + " " + b[0];
    if (a[0] === b[0]) return (+a[2]) + ". " + MONATE[+a[1] - 1] + " – " + (+b[2]) + ". " + MONATE[+b[1] - 1] + " " + b[0];
    return (+a[2]) + ". " + MONATE[+a[1] - 1] + " " + a[0] + " – " + (+b[2]) + ". " + MONATE[+b[1] - 1] + " " + b[0];
  }

  // Einträge nach Tagen bündeln: neueste Tage zuerst, im Tag die neuesten Fotos zuerst; ohne Datum ganz unten.
  // Ergebnis: [{ datum: "2026-05-10" | "", eintraege: [...] }]. Einträge ohne id werden ausgelassen.
  function gruppieren(eintraege) {
    var gut = (eintraege || []).filter(function (e) { return e && e.id != null && e.id !== ""; });
    var mit = gut.map(function (e, i) { return { e: e, d: datumVon(e), z: datumVon(e) ? e.zeit : "", i: i }; });
    mit.sort(function (a, b) {
      if (a.d !== b.d) return !a.d ? 1 : !b.d ? -1 : a.d < b.d ? 1 : -1;
      if (a.z !== b.z) return a.z < b.z ? 1 : -1;
      return a.i - b.i;
    });
    var gruppen = [], letzte = null;
    mit.forEach(function (x) {
      if (!letzte || letzte.datum !== x.d) { letzte = { datum: x.d, eintraege: [] }; gruppen.push(letzte); }
      letzte.eintraege.push(x.e);
    });
    return gruppen;
  }

  // Filter „Alle · Fotos · Videos“ (ab 1.2.0): art "foto" | "video" | sonst alle
  function istVideo(e) { return !!(e && e.video); }
  function filtern(eintraege, art) {
    return (eintraege || []).filter(function (e) { return art === "video" ? istVideo(e) : art === "foto" ? !istVideo(e) : true; });
  }
  // Länge eines Videos: 42 → "0:42", 3725 → "1:02:05"; ohne Angabe ""
  function dauerText(s) {
    s = Math.round(+s);
    if (!(s >= 0) || !isFinite(s)) return "";
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sek = ("0" + s % 60).slice(-2);
    return h ? h + ":" + ("0" + m).slice(-2) + ":" + sek : m + ":" + sek;
  }

  // Wohin soll das Fenster beim Öffnen springen? Zum neuesten Tag im Zeitraum von–bis.
  // Ergebnis: Nummer der Gruppe oder -1 (kein Foto im Zeitraum oder kein Zeitraum genannt).
  function sprungziel(gruppen, von, bis) {
    if (!istDatum(von) && !istDatum(bis)) return -1;
    if (!istDatum(von)) von = bis;
    if (!istDatum(bis) || bis < von) bis = von;
    for (var i = 0; i < gruppen.length; i++) {
      var d = gruppen[i].datum;
      if (d && d >= von && d <= bis) return i;
    }
    return -1;
  }
  function imZeitraum(datum, von, bis) {
    if (!datum || (!istDatum(von) && !istDatum(bis))) return false;
    if (!istDatum(von)) von = bis;
    if (!istDatum(bis) || bis < von) bis = von;
    return datum >= von && datum <= bis;
  }

  // Die Auswahl: merkt sich die gewählten ids. hoechstens (Zahl > 0) begrenzt die Anzahl.
  function neueAuswahl(hoechstens) {
    var an = {}, zahl = 0, max = hoechstens > 0 ? Math.floor(hoechstens) : 0;
    function hat(id) { return Object.prototype.hasOwnProperty.call(an, String(id)); }
    function setzen(id, soll) {
      var k = String(id);
      if (soll && !hat(k)) { if (max && zahl >= max) return false; an[k] = true; zahl++; return true; }
      if (!soll && hat(k)) { delete an[k]; zahl--; return true; }
      return false;
    }
    return {
      hat: hat,
      anzahl: function () { return zahl; },
      voll: function () { return !!max && zahl >= max; },
      // Antippen: aus wird an, an wird aus. Ergebnis: neuer Zustand (false auch, wenn die Höchstzahl erreicht ist)
      umschalten: function (id) { if (hat(id)) { setzen(id, false); return false; } return setzen(id, true); },
      // Mehrere auf einmal („Alle“ eines Tages). Ergebnis: wie viele sich geändert haben
      setzen: function (ids, soll) { var n = 0; ids.forEach(function (id) { if (setzen(id, soll)) n++; }); return n; },
      alleAn: function (ids) { return ids.length > 0 && ids.every(hat); },
      // Knopf eines Tages zeigt „Keine“: alle Fotos des Tages gewählt – oder die Höchstzahl ist erreicht und einige davon
      // sind gewählt (sonst bliebe „Alle“ stehen und ließe sich nicht mehr zurücknehmen, wenn ein Tag mehr Fotos hat als frei sind)
      tagFertig: function (ids) { return ids.length > 0 && (ids.every(hat) || (!!max && zahl >= max && ids.some(hat))); },
      leeren: function () { an = {}; zahl = 0; }
    };
  }

  // Die gewählten Einträge, nach Aufnahmezeit aufsteigend (ohne Zeit am Ende, sonst in der Reihenfolge der Liste)
  function gewaehlte(eintraege, auswahl) {
    var mit = (eintraege || []).map(function (e, i) { return { e: e, i: i }; }).filter(function (x) { return x.e && auswahl.hat(x.e.id); });
    mit.sort(function (a, b) {
      var za = datumVon(a.e) ? a.e.zeit : "", zb = datumVon(b.e) ? b.e.zeit : "";
      if (za !== zb) return !za ? 1 : !zb ? -1 : za < zb ? -1 : 1;
      return a.i - b.i;
    });
    return mit.map(function (x) { return x.e; });
  }

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function uhrzeit(e) { return datumVon(e) && e.zeit.length >= 16 ? e.zeit.slice(11, 16) + " Uhr" : ""; }

  // ---------- Das Fenster (nur im Browser) ----------
  // wahl: { quelle (Pflicht), titel, knopf, von, bis, hoechstens, weitere: { text, aktion }, filter: "alle" | "foto" | "video" }
  // Ergebnis: Promise mit den gewählten Einträgen; null, wenn abgebrochen wurde (oder „weitere“ gewählt wurde).
  // Lässt sich die Liste nicht lesen, wird das Promise abgelehnt (Fehler mit verständlicher Meldung).
  function oeffnen(wahl) {
    var doc = wurzel.document;
    if (!doc || !wahl || !wahl.quelle || typeof wahl.quelle.liste !== "function" || typeof wahl.quelle.vorschau !== "function")
      return Promise.reject(new Error("Fotoauswahl: Es fehlt die Quelle der Fotos."));
    var heute = heuteText(), auswahl = neueAuswahl(wahl.hoechstens), eintraege = [], gruppen = [], gezeichnet = 0, nachId = {};
    var hatZeitraum = istDatum(wahl.von) || istDatum(wahl.bis), art = wahl.filter === "foto" || wahl.filter === "video" ? wahl.filter : "alle", mitVideos = false;

    var d = doc.createElement("dialog");
    d.className = "fa-fenster";
    d.setAttribute("aria-labelledby", "fa-titel");
    d.innerHTML = '<div class="fa-kopf"><button type="button" class="fa-zu" aria-label="Abbrechen" title="Abbrechen">✕</button>' +
      '<h2 id="fa-titel">' + esc(wahl.titel || "Fotos wählen") + '</h2><span class="fa-zahl" role="status" aria-live="polite"></span>' +
      '<button type="button" class="fa-fertig" disabled>' + esc(wahl.knopf || "Übernehmen") + "</button></div>" +
      '<div class="fa-leiste" hidden></div><div class="fa-inhalt" tabindex="-1"><p class="fa-hinweis">Fotos werden gesucht …</p></div>';
    doc.body.appendChild(d);
    var inhalt = d.querySelector(".fa-inhalt"), leiste = d.querySelector(".fa-leiste"), fertig = d.querySelector(".fa-fertig"), zahl = d.querySelector(".fa-zahl");

    var ergebnis = null, aktionDanach = null, erledigt, abgelehnt;
    var versprechen = new Promise(function (ja, nein) { erledigt = ja; abgelehnt = nein; });
    var fehler = null;

    // Vorschaubilder erst laden, wenn sie in die Nähe des sichtbaren Bereichs kommen
    var beobachter = wurzel.IntersectionObserver ? new wurzel.IntersectionObserver(function (treffer) {
      treffer.forEach(function (t) { if (t.isIntersecting) { beobachter.unobserve(t.target); bildLaden(t.target); } });
    }, { root: inhalt, rootMargin: "600px 0px" }) : null;
    function bildLaden(im) {
      var e = nachId[im.getAttribute("data-id")];
      if (!e) return;
      Promise.resolve().then(function () { return wahl.quelle.vorschau(e); }).then(function (adresse) {
        if (adresse && d.isConnected) im.src = adresse;
      }).catch(function () { im.parentNode.classList.add("fa-fehlt"); });
    }
    // Weitere Tage zeichnen, wenn das Ende näher kommt
    var nachschub = wurzel.IntersectionObserver ? new wurzel.IntersectionObserver(function (treffer) {
      if (treffer.some(function (t) { return t.isIntersecting; })) zeichneBis(gezeichnet + TAGE_JE_SCHUB);
    }, { root: inhalt, rootMargin: "1200px 0px" }) : null;

    function tagHtml(g, nr) {
      var ids = g.eintraege.map(function (e) { return e.id; });
      return '<section class="fa-tag' + (imZeitraum(g.datum, wahl.von, wahl.bis) ? " fa-im-zeitraum" : "") + '" data-nr="' + nr + '"><div class="fa-tagkopf"><h3>' + esc(tagTitel(g.datum, heute)) +
        ' <span class="fa-tagzahl">' + g.eintraege.length + '</span></h3><button type="button" class="fa-alle" data-nr="' + nr + '" aria-pressed="' + auswahl.tagFertig(ids) + '">' +
        (auswahl.tagFertig(ids) ? "Keine" : "Alle") + '</button></div><div class="fa-raster">' + g.eintraege.map(function (e) {
          var an = auswahl.hat(e.id), v = istVideo(e), dauer = v ? dauerText(e.dauer) : "", name = [uhrzeit(e), e.name, dauer].filter(Boolean).join(", ");
          return '<button type="button" class="fa-bild' + (an ? " fa-an" : "") + (v ? " fa-video" : "") + '" data-id="' + esc(e.id) + '" aria-pressed="' + an + '" aria-label="' + (v ? "Video" : "Foto") + (name ? " " + esc(name) : "") + '">' +
            '<img alt="" data-id="' + esc(e.id) + '" decoding="async" draggable="false"><span class="fa-haken" aria-hidden="true">✓</span>' +
            (v ? '<span class="fa-dauer" aria-hidden="true">▶' + (dauer ? " " + esc(dauer) : "") + "</span>" : "") + "</button>";
        }).join("") + "</div></section>";
    }
    function zeichneBis(n) {
      n = Math.min(n, gruppen.length);
      if (n <= gezeichnet) return;
      var ende = inhalt.querySelector(".fa-ende"), h = "";
      for (var i = gezeichnet; i < n; i++) h += tagHtml(gruppen[i], i);
      var halter = doc.createElement("div");
      halter.innerHTML = h;
      Array.prototype.slice.call(halter.children).forEach(function (abschnitt) {
        inhalt.insertBefore(abschnitt, ende);
        Array.prototype.forEach.call(abschnitt.querySelectorAll("img"), function (im) { if (beobachter) beobachter.observe(im); else bildLaden(im); });
      });
      gezeichnet = n;
      if (gezeichnet >= gruppen.length && ende) { if (nachschub) nachschub.disconnect(); ende.remove(); }
    }
    function zahlZeigen() {
      var n = auswahl.anzahl();
      zahl.textContent = n ? n + " gewählt" : "";
      fertig.disabled = !n;
      d.classList.toggle("fa-voll", auswahl.voll());
    }
    function tagAuffrischen(nr) {
      var abschnitt = inhalt.querySelector('.fa-tag[data-nr="' + nr + '"]');
      if (!abschnitt) return;
      Array.prototype.forEach.call(abschnitt.querySelectorAll(".fa-bild"), function (b) {
        var an = auswahl.hat(b.getAttribute("data-id"));
        b.classList.toggle("fa-an", an); b.setAttribute("aria-pressed", an);
      });
      knopfAuffrischen(abschnitt.querySelector(".fa-alle"), nr);
    }
    function knopfAuffrischen(alle, nr) {
      var an = auswahl.tagFertig(gruppen[nr].eintraege.map(function (e) { return e.id; }));
      alle.textContent = an ? "Keine" : "Alle"; alle.setAttribute("aria-pressed", an);
    }
    // Ist die Höchstzahl erreicht oder wieder frei, ändern sich auch die Knöpfe der anderen Tage
    function alleKnoepfe() {
      Array.prototype.forEach.call(inhalt.querySelectorAll(".fa-alle"), function (b) { knopfAuffrischen(b, +b.getAttribute("data-nr")); });
    }
    function zumZeitraum() {
      var nr = sprungziel(gruppen, wahl.von, wahl.bis);
      if (nr < 0) return false;
      zeichneBis(nr + TAGE_JE_SCHUB);
      var abschnitt = inhalt.querySelector('.fa-tag[data-nr="' + nr + '"]');
      // Die Höhe der Tage darüber steht erst fest, wenn sie gezeichnet sind: deshalb messen, blättern und nachmessen
      var hin = function () {
        if (abschnitt && d.isConnected) inhalt.scrollTop += abschnitt.getBoundingClientRect().top - inhalt.getBoundingClientRect().top;
      };
      hin();
      if (wurzel.requestAnimationFrame) wurzel.requestAnimationFrame(function () { hin(); wurzel.requestAnimationFrame(hin); });
      return true;
    }
    function leisteZeigen() {
      var h = "";
      if (mitVideos) h += '<span class="fa-filter" role="group" aria-label="Zeigen">' + [["alle", "Alle"], ["foto", "Fotos"], ["video", "Videos"]].map(function (f) {
        return '<button type="button" class="fa-art' + (art === f[0] ? " fa-art-an" : "") + '" data-art="' + f[0] + '" aria-pressed="' + (art === f[0]) + '">' + f[1] + "</button>"; }).join("") + "</span>";
      if (hatZeitraum && gruppen.length) h += sprungziel(gruppen, wahl.von, wahl.bis) >= 0
        ? '<button type="button" class="fa-sprung">Zum Zeitraum ' + esc(zeitraumText(wahl.von, wahl.bis)) + "</button>"
        : '<span class="fa-leise">Keine Fotos vom ' + esc(zeitraumText(wahl.von, wahl.bis)) + " gefunden.</span>";
      if (wahl.weitere && wahl.weitere.text) h += '<button type="button" class="fa-weitere">' + esc(wahl.weitere.text) + "</button>";
      leiste.innerHTML = h;
      leiste.hidden = !h;
    }

    // Raster neu aufbauen (beim Öffnen und nach einem Wechsel des Filters); die Auswahl bleibt dabei erhalten
    function neuZeichnen() {
      gruppen = gruppieren(filtern(eintraege, art));
      gezeichnet = 0;
      if (beobachter) beobachter.disconnect();
      if (nachschub) nachschub.disconnect();
      leisteZeigen();
      inhalt.scrollTop = 0;
      if (!gruppen.length) { inhalt.innerHTML = '<p class="fa-hinweis">' + (art === "video" ? "Keine Videos gefunden." : "Keine Fotos gefunden.") + "</p>"; return; }
      inhalt.innerHTML = '<div class="fa-ende" aria-hidden="true"></div>';
      if (nachschub) nachschub.observe(inhalt.querySelector(".fa-ende"));
      zeichneBis(nachschub ? TAGE_JE_SCHUB : gruppen.length);
    }

    d.addEventListener("click", function (ereignis) {
      var el = ereignis.target.closest ? ereignis.target.closest("button") : null;
      if (!el || !d.contains(el)) return;
      if (el.classList.contains("fa-bild")) {
        var id = el.getAttribute("data-id"), war = auswahl.hat(id), ist = auswahl.umschalten(id);
        if (!war && !ist) { zahl.textContent = "Höchstens " + wahl.hoechstens + " Fotos"; return; }
        tagAuffrischen(+el.closest(".fa-tag").getAttribute("data-nr"));
        alleKnoepfe(); zahlZeigen();
      } else if (el.classList.contains("fa-alle")) {
        var nr = +el.getAttribute("data-nr"), ids = gruppen[nr].eintraege.map(function (e) { return e.id; });
        var weg = auswahl.tagFertig(ids), vorher = auswahl.anzahl();
        auswahl.setzen(ids, !weg);
        tagAuffrischen(nr); alleKnoepfe(); zahlZeigen();
        if (!weg && auswahl.voll() && !auswahl.alleAn(ids)) zahl.textContent = auswahl.anzahl() + " gewählt · höchstens " + wahl.hoechstens;
      } else if (el.classList.contains("fa-art")) { if (art !== el.getAttribute("data-art")) { art = el.getAttribute("data-art"); neuZeichnen(); zumZeitraum(); } }
      else if (el.classList.contains("fa-sprung")) zumZeitraum();
      else if (el.classList.contains("fa-weitere")) { aktionDanach = wahl.weitere.aktion; d.close(); }
      else if (el.classList.contains("fa-zu")) d.close();
      else if (el.classList.contains("fa-fertig")) { ergebnis = gewaehlte(eintraege, auswahl); d.close(); }
    });
    d.addEventListener("close", function () {
      if (beobachter) beobachter.disconnect();
      if (nachschub) nachschub.disconnect();
      d.remove();
      if (fehler) { abgelehnt(fehler); return; }
      erledigt(ergebnis);
      // erst nachdem die App das Ergebnis (null) bekommen hat
      if (typeof aktionDanach === "function") wurzel.setTimeout(aktionDanach, 0);
    });

    d.showModal();
    Promise.resolve().then(function () { return wahl.quelle.liste(); }).then(function (liste) {
      if (!d.isConnected) return;
      eintraege = (liste || []).filter(function (e) { return e && e.id != null && e.id !== ""; });
      eintraege.forEach(function (e) { nachId[String(e.id)] = e; });
      mitVideos = eintraege.some(istVideo);
      if (!mitVideos) art = "alle";
      neuZeichnen();
      zumZeitraum();
      zahlZeigen();
    }).catch(function (e) {
      fehler = e instanceof Error ? e : new Error("Die Fotos konnten nicht gelesen werden.");
      if (d.open) d.close(); else abgelehnt(fehler);
    });
    return versprechen;
  }

  var api = { VERSION: VERSION, oeffnen: oeffnen, gruppieren: gruppieren, tagTitel: tagTitel, zeitraumText: zeitraumText,
              sprungziel: sprungziel, neueAuswahl: neueAuswahl, gewaehlte: gewaehlte, filtern: filtern, dauerText: dauerText };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  wurzel.ImagicosmosFotoAuswahl = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
