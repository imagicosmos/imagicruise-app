// Baustein „aktualisieren“ – Version zeigen, neue Fassung melden. Quelle: Repo imagicosmos/bausteine, aktualisieren/aktualisieren.js.
// In den Apps eine Kopie: NICHT VON HAND ÄNDERN, Fehler im Repo bausteine beheben und neu einbauen.
//
// Zwei Wege, je nachdem, wie die App läuft:
//   Android-App (Datei .apk von der Webseite): pruefen() liest höchstens einmal am Tag die kleine Datei version.json
//     von der Webseite der App und vergleicht sie mit der eigenen Fassung. hinweisZeigen() meldet eine neue Fassung
//     mit einem Link zur Webseite. Die Prüfung lässt sich abschalten (schalter() für die Einstellungen).
//   Web-App (mit Service Worker): Der Browser lädt neue Fassungen selbst. webApp.beobachten() meldet, wenn eine neue
//     Fassung geladen ist; webApp.jetztAktualisieren() lädt neu.
// Dazu hilfetext() für die Hilfe der App. Kommt die App später aus dem Play Store, aktualisiert der Store sie,
// dann pruefen() dort nicht mehr aufrufen.
//
// Datenschutz: Beim Abruf von version.json sieht der Anbieter der Webseite (GitHub) die Internet-Adresse des Geräts,
// wie bei jedem Seitenaufruf. Sonst wird nichts gesendet. Gebraucht wird aktualisieren.css. Ohne fremden Code.
(function (wurzel) {
  "use strict";

  var VERSION = "1.1.0";
  var ABSTAND = 20 * 3600 * 1000;      // höchstens so oft im Netz nachsehen (20 Stunden: einmal am Tag, auch bei wechselnder Uhrzeit)
  var RUHE = 3 * 24 * 3600 * 1000;      // „Später“: so lange dieselbe Fassung nicht wieder melden
  var WARTEN = 8000;                    // so lange auf die Webseite warten (Millisekunden)
  var SCHLUESSEL = "imagicosmos.aktualisieren.";

  // --- Versionsnummern ---------------------------------------------------------------------------

  // "1.0.245" → [1, 0, 245]. Erlaubt "v1.0.245" und Zusätze wie "1.0.245+" (mit nicht committeten Änderungen gebaut).
  // Unlesbar (z. B. "lokale Testfassung", "") → null
  function zerlegen(v) {
    if (typeof v !== "string") return null;
    var m = /^\s*v?(\d+(?:\.\d+)*)/i.exec(v);
    if (!m) return null;
    return m[1].split(".").map(Number);
  }

  // -1: a ist älter, 0: gleich, 1: a ist neuer, null: nicht vergleichbar
  function vergleichen(a, b) {
    var x = zerlegen(a), y = zerlegen(b);
    if (!x || !y) return null;
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var p = x[i] || 0, q = y[i] || 0;
      if (p !== q) return p < q ? -1 : 1;
    }
    return 0;
  }

  // --- Gespeicherter Stand (je App, im Speicher des Browsers) --------------------------------------

  function speicherVon(o) {
    if (o && o.speicher) return o.speicher;
    if (!wurzel.document) return null;                                        // nur im Browser
    try { return wurzel.localStorage || null; } catch (e) { return null; }   // kann gesperrt sein
  }
  function stand(app, speicher) {
    try { var s = JSON.parse(speicher.getItem(SCHLUESSEL + app) || "{}"); return s && typeof s === "object" ? s : {}; }
    catch (e) { return {}; }
  }
  function merken(app, speicher, s) {
    try { speicher.setItem(SCHLUESSEL + app, JSON.stringify(s)); } catch (e) { /* voll oder gesperrt: dann eben ohne Gedächtnis */ }
  }

  // Ist die Prüfung eingeschaltet? (Grundeinstellung: ja)
  function istAn(app, speicher) {
    speicher = speicher || speicherVon();
    return !speicher || stand(app, speicher).an !== false;
  }
  function einschalten(app, an, speicher) {
    speicher = speicher || speicherVon();
    if (!speicher) return;
    var s = stand(app, speicher);
    s.an = !!an;
    merken(app, speicher, s);
  }

  // --- Prüfen ---------------------------------------------------------------------------------------

  function hostVon(adresse) {
    var m = /^https:\/\/([^\/?#:]+)/i.exec(adresse || "");
    return m ? m[1].toLowerCase() : "";
  }
  // Die Webseite in version.json darf nur auf denselben Rechner zeigen wie die Webseite der App (kein fremder Link)
  function sichereSeite(vorschlag, seite) {
    return typeof vorschlag === "string" && hostVon(vorschlag) && hostVon(vorschlag) === hostVon(seite) ? vorschlag : seite;
  }
  function dateiAdresse(seite) { return seite.replace(/[?#].*$/, "").replace(/\/?$/, "/") + "version.json"; }

  function ergebnis(status, o, s) {
    return { status: status, eigene: o.fassung || "", neueste: (s && s.neueste) || "", datum: (s && s.datum) || "",
             seite: sichereSeite(s && s.link, o.seite) };
  }

  function holen(adresse, abrufen, warten) {
    var abbruch = typeof wurzel.AbortController === "function" ? new wurzel.AbortController() : null;
    var uhr = abbruch ? setTimeout(function () { abbruch.abort(); }, warten) : null;
    return Promise.resolve()
      .then(function () { return abrufen(adresse, { cache: "no-store", credentials: "omit", signal: abbruch ? abbruch.signal : undefined }); })
      .then(function (r) { if (!r || !r.ok) throw new Error("Antwort " + (r && r.status)); return r.json(); })
      .then(function (j) { if (uhr) clearTimeout(uhr); return j; },
            function (e) { if (uhr) clearTimeout(uhr); throw e; });
  }

  // Sieht nach, ob es eine neuere Fassung gibt. Lehnt nie ab.
  //   o.app      "imagiclique"  (Name in version.json und für den gespeicherten Stand)
  //   o.fassung  eigene Fassung, z. B. "1.0.245"
  //   o.seite    Webseite der App, z. B. "https://imagiclique.de/"; dort liegt version.json
  //   o.erzwingen  true: jetzt nachsehen, auch wenn heute schon geschehen und auch wenn abgeschaltet („Jetzt nachsehen“)
  // → { status: "neu" | "aktuell" | "aus" | "unbekannt" | "fehler", eigene, neueste, datum, seite }
  //   "unbekannt": eigene Fassung nicht lesbar (Testfassung vom PC) – dann wird nicht nachgesehen
  function pruefen(o) {
    o = o || {};
    var speicher = speicherVon(o), jetzt = typeof o.jetzt === "number" ? o.jetzt : Date.now();
    var s = speicher ? stand(o.app, speicher) : {};
    if (!o.app || !hostVon(o.seite)) return Promise.resolve(ergebnis("fehler", o, null));
    if (!o.erzwingen && s.an === false) return Promise.resolve(ergebnis("aus", o, null));
    if (!zerlegen(o.fassung)) return Promise.resolve(ergebnis("unbekannt", o, null));

    function bewerten(st) {
      var v = vergleichen(o.fassung, st.neueste);
      return ergebnis(v === -1 ? "neu" : v === null ? "fehler" : "aktuell", o, st);
    }
    if (!o.erzwingen && s.zeit && jetzt - s.zeit >= 0 && jetzt - s.zeit < ABSTAND && s.neueste) return Promise.resolve(bewerten(s));

    var abrufen = o.abrufen || (typeof wurzel.fetch === "function" ? wurzel.fetch.bind(wurzel) : null);
    if (!abrufen) return Promise.resolve(ergebnis("fehler", o, s));
    return holen(dateiAdresse(o.seite), abrufen, o.warten || WARTEN).then(function (j) {
      if (!j || j.app !== o.app || !zerlegen(j.version)) throw new Error("version.json passt nicht");
      var neu = speicher ? stand(o.app, speicher) : {};
      neu.zeit = jetzt; neu.neueste = String(j.version); neu.datum = typeof j.datum === "string" ? j.datum : "";
      neu.link = sichereSeite(j.seite, o.seite);
      if (speicher) merken(o.app, speicher, neu);
      return bewerten(neu);
    }).catch(function () {
      return ergebnis("fehler", o, s);     // ohne Netz oder Webseite nicht erreichbar: still bleiben, morgen wieder
    });
  }

  // „Später“: dieselbe Fassung ein paar Tage nicht wieder melden
  function zurueckstellen(app, version, o) {
    var speicher = speicherVon(o);
    if (!speicher) return;
    var s = stand(app, speicher);
    s.ruheFassung = version; s.ruheBis = ((o && o.jetzt) || Date.now()) + RUHE;
    merken(app, speicher, s);
  }
  function sollMelden(app, e, o) {
    if (!e || e.status !== "neu") return false;
    var speicher = speicherVon(o), s = speicher ? stand(app, speicher) : {};
    var jetzt = (o && o.jetzt) || Date.now();
    return !(s.ruheFassung === e.neueste && s.ruheBis > jetzt);
  }

  // --- Texte -----------------------------------------------------------------------------------------

  function schuetzen(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (z) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[z]; });
  }
  function datumText(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || "");
    return m ? (+m[3]) + "." + (+m[2]) + "." + m[1] : "";
  }
  // Text des Hinweises auf eine neue Fassung
  function hinweisText(e, name) {
    var d = datumText(e.datum);
    return {
      titel: "Neue Version von " + name,
      text: "Fassung " + e.neueste + (d ? " vom " + d : "") + " ist da, du hast " + e.eigene + ". " +
            "Die neue Fassung holst du auf der Webseite und installierst sie über die alte; deine Daten bleiben erhalten.",
      los: "Zur Webseite", spaeter: "Später",
    };
  }

  // Hilfe zum Aktualisieren als HTML (Absätze). o.art: "android" | "web"; o.name: "Imagiclique"; o.seite: Webseite
  function hilfetext(o) {
    o = o || {};
    var name = schuetzen(o.name || "die App"), seite = schuetzen(o.seite || "");
    var link = seite ? '<a href="' + seite + '" target="_blank" rel="noopener">' + seite.replace(/^https:\/\//, "").replace(/\/$/, "") + "</a>" : "der Webseite";
    if (o.art === "web") {
      return "<p><b>Aktualisieren:</b> Neue Fassungen lädt " + name + " beim Öffnen mit Internet von selbst. " +
             "Ist eine neue Fassung geladen, erscheint unten ein Hinweis; „Neu laden“ startet sie. " +
             "Sonst: App ganz schließen und mit Internet neu öffnen.</p>" +
             "<p><b>Welche Fassung läuft,</b> steht unter „Über " + name + "“.</p>";
    }
    return "<p><b>Aktualisieren:</b> " + name + " sieht einmal am Tag auf " + link + " nach, ob es eine neue Fassung gibt, " +
           "und meldet sie. Dort lädst du die neue Datei und installierst sie über die alte. Deine Daten bleiben erhalten.</p>" +
           "<p>Android fragt dabei, ob der Browser Apps installieren darf: einmal erlauben. " +
           "Meldet Android „App nicht installiert“, war die alte Fassung mit einem anderen Schlüssel gebaut. Dann muss die alte App zuerst entfernt werden; " +
           "<b>dabei gehen die Daten in der App verloren</b>, vorher also sichern, was du behalten willst.</p>" +
           "<p><b>Abschalten:</b> In den Einstellungen „Nach neuen Versionen sehen“ ausschalten. Beim Nachsehen erfährt der Anbieter der Webseite " +
           "(GitHub) wie bei jedem Seitenaufruf die Internet-Adresse des Handys; sonst wird nichts gesendet.</p>";
  }

  // Inhalt von version.json (für die Werkzeuge, die die Webseite der App bauen)
  function versionsdatei(o) {
    return JSON.stringify({ app: o.app, version: o.version, datum: o.datum || "", seite: o.seite || "" }, null, 2) + "\n";
  }

  // --- Im Browser: Hinweis, Schalter, Web-App ---------------------------------------------------------

  function element(art, klasse, text) {
    var el = wurzel.document.createElement(art);
    if (klasse) el.className = klasse;
    if (text != null) el.textContent = text;
    return el;
  }
  function leiste(titel, text, ziel) {
    var alt = wurzel.document.querySelector(".ia-hinweis");
    if (alt) alt.remove();
    var el = element("div", "ia-hinweis");
    el.setAttribute("role", "status");
    el.appendChild(element("strong", "ia-titel", titel));
    el.appendChild(element("p", "ia-text", text));
    var knoepfe = element("div", "ia-knoepfe");
    el.appendChild(knoepfe);
    (ziel || wurzel.document.body).appendChild(el);
    return { el: el, knoepfe: knoepfe };
  }

  // Zeigt unten einen Hinweis, wenn e.status "neu" ist und die Fassung nicht zurückgestellt wurde.
  // o.app, o.name ("Imagiclique"), o.ziel (Element, sonst body). → das Element oder null
  // Der Link öffnet die Webseite; in den Android-Apps öffnet die Hülle fremde Adressen im Browser des Geräts.
  function hinweisZeigen(e, o) {
    o = o || {};
    if (!wurzel.document || !sollMelden(o.app, e, o)) return null;
    var t = hinweisText(e, o.name || "der App"), l = leiste(t.titel, t.text, o.ziel);
    var los = element("a", "ia-los", t.los);
    los.href = e.seite; los.target = "_blank"; los.rel = "noopener";
    los.addEventListener("click", function () { l.el.remove(); });
    var spaeter = element("button", "ia-spaeter", t.spaeter);
    spaeter.type = "button";
    spaeter.addEventListener("click", function () { zurueckstellen(o.app, e.neueste, o); l.el.remove(); });
    l.knoepfe.appendChild(los); l.knoepfe.appendChild(spaeter);
    return l.el;
  }

  // Schalter für die Einstellungen: <label><input type="checkbox"> Nach neuen Versionen sehen</label>
  // o.app; o.text (freiwillig). → das Element
  function schalter(o) {
    o = o || {};
    var label = element("label", "ia-schalter"), kasten = element("input");
    kasten.type = "checkbox";
    kasten.checked = istAn(o.app, o.speicher);
    kasten.addEventListener("change", function () { einschalten(o.app, kasten.checked, o.speicher); });
    label.appendChild(kasten);
    label.appendChild(wurzel.document.createTextNode(" " + (o.text || "Nach neuen Versionen sehen (einmal am Tag, auf der Webseite der App)")));
    return label;
  }

  var webApp = {
    // Ruft rueckruf() auf, sobald eine neue Fassung der Web-App geladen ist (Service Worker installiert,
    // die Seite läuft aber noch mit der alten). Ohne Service Worker geschieht nichts.
    beobachten: function (rueckruf, sw) {
      sw = sw || (wurzel.navigator && wurzel.navigator.serviceWorker);
      if (!sw || typeof sw.getRegistration !== "function") return;
      var gemeldet = false;
      function melden() { if (!gemeldet) { gemeldet = true; rueckruf(); } }
      function verfolgen(neu) {
        if (!neu) return;
        neu.addEventListener("statechange", function () {
          if ((neu.state === "installed" || neu.state === "activated") && sw.controller) melden();
        });
      }
      sw.getRegistration().then(function (r) {
        if (!r) return;
        if (r.waiting && sw.controller) melden();
        verfolgen(r.installing);
        r.addEventListener("updatefound", function () { verfolgen(r.installing); });
      }).catch(function () {});
    },
    // Holt die neueste Fassung und lädt die Seite neu
    jetztAktualisieren: function () {
      var sw = wurzel.navigator && wurzel.navigator.serviceWorker;
      var p = sw && typeof sw.getRegistration === "function"
        ? sw.getRegistration().then(function (r) { return r && r.update(); }).catch(function () {})
        : Promise.resolve();
      return p.then(function () { wurzel.location.reload(); });
    },
    // Hinweis „Neue Fassung geladen“ mit „Neu laden“. o.name, o.ziel
    hinweisZeigen: function (o) {
      o = o || {};
      if (!wurzel.document) return null;
      var l = leiste("Neue Version von " + (o.name || "der App") + " geladen",
                     "Sie startet beim nächsten Öffnen. Jetzt neu laden? Was du gerade machst, vorher speichern.", o.ziel);
      var los = element("button", "ia-los", "Neu laden");
      los.type = "button";
      los.addEventListener("click", function () { webApp.jetztAktualisieren(); });
      var spaeter = element("button", "ia-spaeter", "Später");
      spaeter.type = "button";
      spaeter.addEventListener("click", function () { l.el.remove(); });
      l.knoepfe.appendChild(los); l.knoepfe.appendChild(spaeter);
      return l.el;
    },
  };

  var api = {
    VERSION: VERSION,
    vergleichen: vergleichen, pruefen: pruefen, istAn: istAn, einschalten: einschalten,
    zurueckstellen: zurueckstellen, sollMelden: sollMelden,
    hinweisText: hinweisText, hilfetext: hilfetext, versionsdatei: versionsdatei,
    hinweisZeigen: hinweisZeigen, schalter: schalter, webApp: webApp,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  wurzel.ImagicosmosAktualisieren = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
