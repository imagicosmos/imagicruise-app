// Baustein „ueber“ – Inhalt der Seite „Über …“ und die Versionsangabe, gleich in allen Apps.
// Quelle: Repo imagicosmos/bausteine, ueber/ueber.js. In den Apps eine Kopie: NICHT VON HAND ÄNDERN.
//
// Bringt mit: Marke (Imagi + farbiger Teil), Version, Stand (Datum und Commit), Betrieb (Browser, installiert, Android-App, PC),
// Aktualisieren über den Baustein „aktualisieren“ („Jetzt aktualisieren“ bzw. „Jetzt nachsehen“ mit Schalter), eigene Knöpfe
// der App, „Deine Daten“ und „Verwendete Bausteine“ mit Lizenzen aus bausteine.json. Dazu die kurze Versionszeile für andere
// Stellen der App (versionsZeile). Der Baustein „menue“ benutzt ihn für seine Seite „Über“; eine App ohne Menü baut die Seite
// mit bauen() in ein eigenes Element. Die Rechenteile laufen auch unter Node.js (Tests). Ohne fremden Code.
(function (wurzel) {
  "use strict";

  var VERSION = "1.0.0";
  var skriptAdresse = (wurzel.document && wurzel.document.currentScript && wurzel.document.currentScript.src) || "";

  // --- Rechenteile (auch unter Node.js) ----------------------------------------------------------------

  // Versionsangabe der App lesen. Erlaubt:
  //   "1.0.99 · 18.11.2026 17:36 (5534473)", "0.1.38 · 18.11. 17:36 (fd69ec6+)", "18.11. 16:59 (c495be1)", "0.1.37",
  //   { nummer | fassung, datum, stand }. Platzhalter wie "@@VERSION@@" oder nichts: lokale Testfassung → {}.
  // → { nummer, datum, stand } (fehlende Teile leer)
  function fassungLesen(x) {
    var aus = { nummer: "", datum: "", stand: "" };
    if (x && typeof x === "object") {
      aus.nummer = String(x.nummer || x.fassung || x.version || "").trim();
      aus.datum = String(x.datum || "").trim();
      aus.stand = String(x.stand || "").trim();
    } else {
      var s = x == null ? "" : String(x).trim();
      if (!s || s.indexOf("@@") === 0) return aus;
      var m = /^v?(\d+(?:\.\d+)+(?![.\d]))?\s*(?:·\s*)?(\d{1,2}\.\d{1,2}\.(?:\d{4})?(?:,?\s+\d{1,2}:\d{2})?)?\s*(?:\(([^)]*)\))?/.exec(s);
      if (m) { aus.nummer = m[1] || ""; aus.datum = (m[2] || "").trim(); aus.stand = (m[3] || "").trim(); }
      if (!aus.nummer && !aus.datum && !aus.stand) aus.nummer = s;
    }
    if (/^@@/.test(aus.nummer)) aus.nummer = "";
    aus.datum = datumText(aus.datum);
    return aus;
  }

  // "18.11.2026 17:36" → "18.11.2026, 17:36" (Datum und Uhrzeit immer mit Komma getrennt)
  function datumText(d) {
    d = String(d || "").trim();
    var m = /^(\d{1,2}\.\d{1,2}\.(?:\d{4})?),?\s+(\d{1,2}:\d{2})$/.exec(d);
    return m ? m[1] + ", " + m[2] : d;
  }

  function istLeer(f) { return !f.nummer && !f.datum && !f.stand; }

  // Zeilen der Karte auf „Über“: [[links, rechts], …]
  function zeilen(f, betrieb) {
    var z = [["Version", f.nummer || "lokale Testfassung"]];
    if (f.datum || f.stand) z.push(["Stand", [f.datum, f.stand ? "(" + f.stand + ")" : ""].filter(Boolean).join(" ")]);
    if (betrieb) z.push(["Betrieb", betrieb]);
    return z;
  }

  // Kurze Zeile für andere Stellen der App, z. B. unter einer Liste:
  // "Imagicruise 0.1.37 · 18.11.2026, 17:36 (6a9a8d5) · Android-App"
  function versionsZeile(name, fassung, betrieb) {
    var f = fassungLesen(fassung);
    var teile = [String(name || "") + (f.nummer ? " " + f.nummer : "")];
    if (istLeer(f)) teile.push("lokale Testfassung");
    else if (f.datum || f.stand) teile.push([f.datum, f.stand ? "(" + f.stand + ")" : ""].filter(Boolean).join(" "));
    if (betrieb) teile.push(betrieb);
    return teile.join(" · ");
  }

  // o.android: läuft in der Android-Hülle; o.installiert: als Web-App installiert (display-mode standalone)
  function betriebText(o) {
    o = o || {};
    if (o.android) return "Android-App";
    return o.installiert ? "als App installiert" : "im Browser";
  }

  // Text nach „Jetzt nachsehen“ (Ergebnis von ImagicosmosAktualisieren.pruefen)
  function nachsehenText(e) {
    var s = e && e.status;
    if (s === "neu") return "Neue Fassung " + e.neueste + " ist da.";
    if (s === "aktuell") return "Du hast die neueste Fassung.";
    if (s === "unbekannt") return "Testfassung: kein Vergleich möglich.";
    return "Nachsehen hat nicht geklappt. Mit Internet später noch einmal versuchen.";
  }

  // Liste der eingebauten Bausteine aus dem Inhalt von bausteine.json (Objekt oder Text).
  // → [{ name, version, beschreibung, fremd: [{ name, lizenz }] }], ohne das Prüfwerkzeug; Unsinn ergibt []
  function bausteinListe(j) {
    if (typeof j === "string") { try { j = JSON.parse(j); } catch (e) { return []; } }
    var b = j && typeof j === "object" && j.bausteine;
    if (!b || typeof b !== "object") return [];
    return Object.keys(b).filter(function (n) { return n.charAt(0) !== "_" && b[n] && typeof b[n] === "object"; }).map(function (n) {
      var x = b[n];
      return {
        name: n,
        version: typeof x.version === "string" ? x.version : "",
        beschreibung: typeof x.beschreibung === "string" && x.beschreibung ? x.beschreibung : n,
        fremd: (Array.isArray(x.fremd) ? x.fremd : []).filter(function (f) { return f && typeof f.name === "string" && f.name; })
          .map(function (f) { return { name: f.name, lizenz: typeof f.lizenz === "string" ? f.lizenz : "" }; }),
      };
    });
  }

  // Eine Zeile der Liste „Verwendete Bausteine“
  function bausteinZeile(b) {
    var t = b.beschreibung + " (Baustein " + b.name + (b.version ? " " + b.version : "") + ")";
    if (b.fremd.length) {
      t += ", enthält " + b.fremd.map(function (f) { return f.name + (f.lizenz ? " (" + f.lizenz + "-Lizenz)" : ""); }).join(" und ");
    }
    return t;
  }

  // Adresse von bausteine.json neben dem Skript
  function standardDatei(adresse) {
    adresse = String(adresse || "");
    return adresse ? adresse.replace(/[?#].*$/, "").replace(/[^\/]*$/, "") + "bausteine.json" : "bausteine.json";
  }

  // "Imagiclique" → { vorne: "Imagi", hinten: "clique" } (der hintere Teil wird farbig)
  function markeTeile(name) {
    name = String(name || "");
    var m = /^(Imagi)(.+)$/.exec(name);
    return m ? { vorne: m[1], hinten: m[2] } : { vorne: name, hinten: "" };
  }

  // --- Im Browser --------------------------------------------------------------------------------------

  function el(art, klasse, text) {
    var x = wurzel.document.createElement(art);
    if (klasse) x.className = klasse;
    if (text != null) x.textContent = text;
    return x;
  }
  function karte(titel) {
    var k = el("div", "im-karte");
    if (titel) k.appendChild(el("h3", null, titel));
    return k;
  }

  // Baut den Inhalt der Seite „Über“ in das Element ziel. Angaben siehe LIESMICH.md.
  // → { fassung, geladen (Promise: „Verwendete Bausteine“ steht), meldung (Element) }
  function bauen(ziel, o) {
    if (!ziel || !ziel.appendChild) throw new Error("ueber: bauen() braucht ein Element.");
    o = o || {};
    if (typeof o.name !== "string" || !o.name.trim()) throw new Error("ueber: „name“ fehlt (z. B. \"Imagiclique\").");
    var d = wurzel.document, A = o.aktualisieren === undefined ? wurzel.ImagicosmosAktualisieren || null : o.aktualisieren;
    var f = fassungLesen(o.fassung);
    var installiert = !!(wurzel.matchMedia && wurzel.matchMedia("(display-mode: standalone)").matches);
    var betrieb = o.betrieb || betriebText({ android: o.android, installiert: installiert });
    ziel.classList.add("im-ueber-inhalt");

    var kopf = el("div", "im-ueber-kopf"), marke = el("div", "im-marke"), teile = markeTeile(o.name);
    marke.appendChild(d.createTextNode(teile.vorne));
    if (teile.hinten) marke.appendChild(el("b", null, teile.hinten));
    kopf.appendChild(marke);
    if (o.untertitel) kopf.appendChild(el("p", null, o.untertitel));
    ziel.appendChild(kopf);

    var stand = karte(null);
    zeilen(f, betrieb).forEach(function (z) {
      var zeile = el("div", "im-zeile");
      zeile.appendChild(el("span", null, z[0])); zeile.appendChild(el("span", null, z[1]));
      stand.appendChild(zeile);
    });
    var knoepfe = el("div", "im-knoepfe"), meldung = el("p", "im-meldung");
    meldung.hidden = true; meldung.setAttribute("role", "status");
    function knopf(text, sym, aktion) {
      var b = el("button", "im-btn");
      b.type = "button";
      var s = sym && typeof o.symbol === "function" ? o.symbol(sym) : null;
      if (s) b.appendChild(s);
      b.appendChild(d.createTextNode(text));
      b.addEventListener("click", aktion);
      knoepfe.appendChild(b);
      return b;
    }
    if (A && !o.android && A.webApp) knopf("Jetzt aktualisieren", null, function () { A.webApp.jetztAktualisieren(); });
    if (A && o.android && typeof A.pruefen === "function") {
      var nach = knopf("Jetzt nachsehen", null, function () {
        nach.disabled = true; meldung.hidden = false; meldung.textContent = "Sehe nach …";
        A.pruefen({ app: o.app, fassung: f.nummer, seite: o.seite, erzwingen: true }).then(function (e) {
          meldung.textContent = nachsehenText(e);
          if (e && e.status === "neu" && typeof A.hinweisZeigen === "function") A.hinweisZeigen(e, { app: o.app, name: o.name });
        }).catch(function () { meldung.textContent = nachsehenText(null); }).then(function () { nach.disabled = false; });
      });
    }
    (o.eintraege || []).forEach(function (x) { knopf(x.text, x.symbol, function () { x.aktion(); }); });
    if (knoepfe.children.length) stand.appendChild(knoepfe);
    stand.appendChild(meldung);
    if (A && o.android && typeof A.schalter === "function") {
      var sch = A.schalter({ app: o.app, speicher: o.speicher });
      sch.classList.add("im-schalter");
      stand.appendChild(sch);
    }
    ziel.appendChild(stand);

    if (o.deineDaten != null) {
      var daten = karte("Deine Daten");
      if (Array.isArray(o.deineDaten)) {
        var ul = el("ul");
        o.deineDaten.forEach(function (t) { ul.appendChild(el("li", null, t)); });
        daten.appendChild(ul);
      } else if (typeof o.deineDaten === "string") daten.insertAdjacentHTML("beforeend", o.deineDaten);
      else if (o.deineDaten.nodeType) daten.appendChild(o.deineDaten);
      ziel.appendChild(daten);
    }

    var lizenzen = karte("Verwendete Bausteine"), liste = el("ul");
    lizenzen.appendChild(liste);
    var weitere = Array.isArray(o.weitereLizenzen) ? o.weitereLizenzen : [];
    function listeZeigen(bausteine) {
      liste.textContent = "";
      bausteine.forEach(function (b) { liste.appendChild(el("li", null, bausteinZeile(b))); });
      weitere.forEach(function (t) { liste.appendChild(el("li", null, t)); });
      lizenzen.hidden = !liste.children.length;
    }
    listeZeigen([]);
    ziel.appendChild(lizenzen);
    var quelle = o.bausteineDatei === undefined ? standardDatei(skriptAdresse) : o.bausteineDatei, geladen;
    if (quelle && typeof quelle === "object") { listeZeigen(bausteinListe(quelle)); geladen = Promise.resolve(); }
    else if (quelle && wurzel.fetch) {
      geladen = wurzel.fetch(quelle, { cache: "no-cache" }).then(function (r) { return r.ok ? r.text() : ""; })
        .then(function (t) { listeZeigen(bausteinListe(t)); }).catch(function () {});
    } else geladen = Promise.resolve();

    return { fassung: f, betrieb: betrieb, geladen: geladen, meldung: meldung };
  }

  var api = {
    VERSION: VERSION,
    bauen: bauen, fassungLesen: fassungLesen, datumText: datumText, zeilen: zeilen, versionsZeile: versionsZeile,
    betriebText: betriebText, nachsehenText: nachsehenText, bausteinListe: bausteinListe, bausteinZeile: bausteinZeile,
    standardDatei: standardDatei, markeTeile: markeTeile,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  wurzel.ImagicosmosUeber = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
