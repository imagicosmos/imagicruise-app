// Baustein „menue“ – Drei-Punkte-Menü mit Design, „App installieren“, Hilfe und „Über“. Quelle: Repo imagicosmos/bausteine, menue/menue.js.
// In den Apps eine Kopie: NICHT VON HAND ÄNDERN, Fehler im Repo bausteine beheben und neu einbauen.
//
// Bringt mit: den Knopf ⋮ und das Menü, die Wahl des Designs (Automatisch, Hell, Dunkel; wird je App gemerkt),
// „App installieren“ (nur wenn der Browser es anbietet), die Seite „Über“ (Marke, Version, Betrieb, Aktualisieren,
// „Deine Daten“, „Verwendete Bausteine“ automatisch aus bausteine.json) und den Rahmen der Hilfe-Seite.
// Die App liefert: Namen, eigene Einträge, den Hilfetext und den Text „Deine Daten“. Beispiel in LIESMICH.md.
// Seit 1.1.0 auf Wunsch auch den Kopf links in der Menüzeile (Icon, Schriftzug „Imagi…“ im Farbverlauf, Untertitel),
// damit alle Apps gleich auftreten.
//
// Das Design setzt der Baustein als <html data-theme="light|dark">; die App gestaltet ihre Farben danach.
// Aktualisieren geht über den Baustein „aktualisieren“ (window.ImagicosmosAktualisieren), falls er geladen ist.
// Seit 2.0.0 kommt der Inhalt der Seite „Über“ (Version, Stand, Betrieb, Aktualisieren, Deine Daten, Bausteine) aus dem
// Baustein „ueber“ (window.ImagicosmosUeber, ueber.js und ueber.css vor menue.js einbinden).
// Die Rechenteile laufen auch unter Node.js (Tests), Menü und Seiten nur im Browser. Ohne fremden Code.
(function (wurzel) {
  "use strict";

  var VERSION = "2.0.0";
  // Baustein „ueber“: im Browser vorher geladen, unter Node aus demselben Ordner (App) oder dem Nachbarordner (Repo bausteine)
  function ueberLaden() {
    if (wurzel.ImagicosmosUeber) return wurzel.ImagicosmosUeber;
    if (typeof require === "function") {
      try { return require("./ueber.js"); } catch (e) { /* weiter */ }
      try { return require("../ueber/ueber.js"); } catch (e) { /* weiter */ }
    }
    return null;
  }
  var DESIGNS = ["auto", "light", "dark"];
  var DESIGN_NAMEN = { auto: "Automatisch", light: "Hell", dark: "Dunkel" };

  // Pfad dieses Skripts beim Laden merken: bausteine.json liegt im selben Ordner
  var skriptAdresse = (wurzel.document && wurzel.document.currentScript && wurzel.document.currentScript.src) || "";

  // --- Rechenteile (auch unter Node.js) ----------------------------------------------------------------

  // Prüft die Angaben der App; wirft bei Fehlern eine verständliche Meldung
  function angabenPruefen(o) {
    if (!o || typeof o !== "object") throw new Error("menue: Angaben fehlen.");
    if (typeof o.app !== "string" || !/^[a-z0-9-]+$/.test(o.app)) throw new Error("menue: „app“ fehlt oder enthält mehr als kleine Buchstaben, Ziffern und Bindestriche.");
    if (typeof o.name !== "string" || !o.name.trim()) throw new Error("menue: „name“ fehlt (z. B. \"Imagiclique\").");
    var e = o.eintraege == null ? [] : o.eintraege;
    if (!Array.isArray(e)) throw new Error("menue: „eintraege“ muss eine Liste sein.");
    e.forEach(function (x, i) {
      if (!x || typeof x.text !== "string" || !x.text) throw new Error("menue: Eintrag " + (i + 1) + " hat keinen Text.");
      if (typeof x.aktion !== "function") throw new Error("menue: Eintrag „" + x.text + "“ hat keine Aktion.");
      if (x.ort != null && x.ort !== "menue" && x.ort !== "ueber") throw new Error("menue: Eintrag „" + x.text + "“: „ort“ muss \"menue\" oder \"ueber\" sein.");
    });
    if (o.kopf != null) {
      var k = o.kopf;
      if (typeof k !== "object" || !k.ort) throw new Error("menue: „kopf“ braucht „ort“ (die Kopfzeile, in die der Schriftzug kommt).");
      if (k.ziel != null && typeof k.ziel !== "string" && typeof k.ziel !== "function") throw new Error("menue: „kopf.ziel“ muss eine Adresse oder eine Funktion sein.");
      if (k.knoepfe != null && !Array.isArray(k.knoepfe)) throw new Error("menue: „kopf.knoepfe“ muss eine Liste sein.");
      (k.knoepfe || []).forEach(function (x, i) {
        if (!x || typeof x.text !== "string" || !x.text || typeof x.aktion !== "function") throw new Error("menue: Knopf " + (i + 1) + " im Kopf braucht „text“ und „aktion“.");
      });
    }
    return true;
  }

  // "Imagiclique" → { vorne: "Imagi", hinten: "clique" } (der hintere Teil wird farbig)
  function markeTeile(name) {
    name = String(name || "");
    var m = /^(Imagi)(.+)$/.exec(name);
    return m ? { vorne: m[1], hinten: m[2] } : { vorne: name, hinten: "" };
  }

  function istDesign(w) { return DESIGNS.indexOf(w) >= 0; }

  // gewählt: "auto" | "light" | "dark"; dunkelBevorzugt: Einstellung des Geräts → "light" | "dark"
  function designAufloesen(gewaehlt, dunkelBevorzugt) {
    if (gewaehlt === "light" || gewaehlt === "dark") return gewaehlt;
    return dunkelBevorzugt ? "dark" : "light";
  }

  function speicherVon(s) {
    if (s) return s;
    try { return wurzel.localStorage || null; } catch (e) { return null; }
  }
  function designSchluessel(app) { return "imagicosmos." + app + ".design"; }

  // Gemerktes Design der App. Ist noch nichts gemerkt, gilt start (z. B. der alte Wert der App), sonst "auto".
  function designLesen(app, speicher, start) {
    var s = speicherVon(speicher), w = null;
    try { w = s && s.getItem(designSchluessel(app)); } catch (e) { w = null; }
    if (istDesign(w)) return w;
    if (istDesign(start)) { designMerken(app, start, s); return start; }
    return "auto";
  }
  function designMerken(app, wert, speicher) {
    if (!istDesign(wert)) return false;
    var s = speicherVon(speicher);
    try { if (s) s.setItem(designSchluessel(app), wert); return !!s; } catch (e) { return false; }
  }

  // Passt ein Hilfe-Abschnitt (data-schritt="2" oder "2 3") zum aktuellen Schritt?
  function passtZumSchritt(wert, schritt) {
    if (wert == null || schritt == null || schritt === "") return false;
    return String(wert).split(/[\s,]+/).indexOf(String(schritt)) >= 0;
  }

  // Abschnitte, die der Baustein selbst an die Hilfe hängt: [{ titel, symbol, html }]
  function hilfeZusatz(o, A) {
    var name = schuetzen(o.name), teile = [];
    var seite = o.seite ? String(o.seite).replace(/^https?:\/\//, "").replace(/\/$/, "") : "";
    var aktualisieren = A && typeof A.hilfetext === "function"
      ? A.hilfetext({ art: o.android ? "android" : "web", name: o.name, seite: o.seite })
      : o.android   // Android-App von der Webseite ohne den Baustein aktualisieren: neue Fassung selbst laden
        ? "<p><b>Aktualisieren:</b> Eine neue Fassung lädst du " + (seite ? "von der Webseite <b>" + schuetzen(seite) + "</b>" : "von der Webseite der App") +
          " und installierst sie über die alte; deine Daten bleiben erhalten. Welche Fassung läuft, steht unter „Über " + name + "“.</p>"
        : "<p><b>Aktualisieren:</b> App ganz schließen und mit Internet neu öffnen. Welche Fassung läuft, steht unter „Über " + name + "“.</p>";
    var installieren = o.android ? "" :
      "<p><b>Installieren:</b> im Menü (⋮) „App installieren“ wählen oder im Menü des Browsers „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.</p>";
    teile.push({ titel: o.android ? "Aktualisieren" : "Installieren und aktualisieren", symbol: "installieren", html: installieren + aktualisieren });
    teile.push({ titel: "Design", symbol: "design", html:
      "<p>Im Menü (⋮) wählst du zwischen hellem und dunklem Design; „Automatisch“ folgt der Einstellung des Geräts. " +
      name + " merkt sich die Wahl auf diesem Gerät.</p>" });
    return teile;
  }

  function schuetzen(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (z) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[z]; });
  }

  // --- Im Browser --------------------------------------------------------------------------------------

  // Zeichen (Linien, 24 × 24), nach dem Vorbild von Imagiclique
  var SYMBOLE = {
    mehr: '<path d="M12 5.5v.1M12 12v.1M12 18.5v.1" stroke-width="2.8"/>',
    hilfe: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.7 2.2c-.8.5-1.3 1-1.3 2"/><path d="M12 16.9v.1"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.1"/>',
    zurueck: '<path d="M15 5l-7 7 7 7"/>',
    neu: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4.5H15"/>',
    installieren: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M12 8v6M9.5 11.8l2.5 2.5 2.5-2.5"/>',
    design: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17A8.5 8.5 0 0 0 12 3.5z" fill="currentColor"/>',
    stern: '<path d="M12 3.5l2.5 5.3 5.7.7-4.2 3.9 1.1 5.7L12 16.3l-5.1 2.8 1.1-5.7-4.2-3.9 5.7-.7z"/>',
    einstellungen: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
    teilen: '<circle cx="6" cy="12" r="2.5"/><circle cx="17.5" cy="5.5" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.1-4M8.2 13.2l7.1 4"/>',
    speichern: '<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14"/>',
    loeschen: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
    vorschau: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    rundgang: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  };

  // Das Ereignis „App installieren“ kann vor einrichten() kommen: gleich beim Laden mithören
  var installEreignis = null, installGeaendert = null;
  if (wurzel.addEventListener && wurzel.document) {
    wurzel.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installEreignis = e; if (installGeaendert) installGeaendert(); });
    wurzel.addEventListener("appinstalled", function () { installEreignis = null; if (installGeaendert) installGeaendert(); });
  }

  function el(art, klasse, text) {
    var x = wurzel.document.createElement(art);
    if (klasse) x.className = klasse;
    if (text != null) x.textContent = text;
    return x;
  }
  function symbol(name) {
    var s = SYMBOLE[name];
    if (!s) return null;
    var x = wurzel.document.createElementNS("http://www.w3.org/2000/svg", "svg");
    x.setAttribute("class", "im-sym"); x.setAttribute("viewBox", "0 0 24 24"); x.setAttribute("aria-hidden", "true");
    x.innerHTML = s;
    return x;
  }
  function knopf(klasse, text, sym) {
    var b = el("button", klasse);
    b.type = "button";
    var s = sym && symbol(sym);
    if (s) b.appendChild(s);
    b.appendChild(wurzel.document.createTextNode(text));
    return b;
  }
  function inhaltSetzen(ziel, inhalt) {
    if (inhalt == null) return;
    if (typeof inhalt === "string") ziel.insertAdjacentHTML("beforeend", inhalt);
    else if (inhalt.nodeType) ziel.appendChild(inhalt);
  }
  function karte(titel) {
    var k = el("div", "im-karte");
    if (titel) k.appendChild(el("h3", null, titel));
    return k;
  }
  function seiteBauen(id, titel) {
    var s = el("section", "im-seite");
    s.id = id; s.hidden = true; s.setAttribute("aria-label", titel);
    var kopf = el("header", "im-kopf"), wrap = el("div", "im-wrap");
    var zurueck = el("button", "im-ibtn");
    zurueck.type = "button"; zurueck.setAttribute("aria-label", "Zurück"); zurueck.appendChild(symbol("zurueck"));
    wrap.appendChild(zurueck); wrap.appendChild(el("h2", null, titel));
    kopf.appendChild(wrap); s.appendChild(kopf);
    var inhalt = el("div", "im-inhalt"), innen = el("div", "im-wrap");
    inhalt.appendChild(innen); s.appendChild(inhalt);
    return { seite: s, zurueck: zurueck, innen: innen, inhalt: inhalt };
  }

  // Kopf links in der Menüzeile: [Icon] Imagi<farbig> / Untertitel, dahinter Schnellknöpfe der App (seit 1.3.0) und der Knopf ⋮.
  // k = { ort, leiste?, icon?, untertitel?, ziel?, zielText?, knoepfe?: [{ text, symbol, aktion }] }
  function kopfBauen(k, name) {
    var d = wurzel.document, ziel = k.ziel;
    var art = typeof ziel === "string" ? "a" : typeof ziel === "function" ? "button" : "div";
    var marke = el(art, "im-kopf-marke");
    if (art === "a") marke.href = ziel;
    if (art === "button") { marke.type = "button"; marke.addEventListener("click", function (e) { ziel(e); }); }
    if (art !== "div") { marke.setAttribute("aria-label", name + (k.zielText ? " – " + k.zielText : "")); if (k.zielText) marke.title = k.zielText; }
    if (k.icon) {
      var bild = el("img", "im-kopf-icon");
      bild.src = k.icon; bild.alt = ""; bild.width = 32; bild.height = 32;
      marke.appendChild(bild);
    }
    var text = el("span", "im-kopf-text"), wort = el("span", "im-kopf-wort"), teile = markeTeile(name);
    wort.appendChild(d.createTextNode(teile.vorne));
    if (teile.hinten) wort.appendChild(el("span", "im-kopf-teil", teile.hinten));
    var unter = el("span", "im-kopf-unter", k.untertitel || "");
    text.appendChild(wort); text.appendChild(unter); marke.appendChild(text);
    (k.leiste || k.ort).classList.add("im-kopfleiste");
    k.ort.classList.add("im-kopfreihe");
    k.ort.insertBefore(marke, k.ort.firstChild);
    var danach = marke, knoepfe = (k.knoepfe || []).map(function (x) {
      var b = el("button", "im-ibtn im-kopf-knopf");
      b.type = "button"; b.setAttribute("aria-label", x.text); b.title = x.text;
      var sym = symbol(x.symbol);
      if (sym) b.appendChild(sym); else b.textContent = x.text;
      b.addEventListener("click", function (e) { x.aktion(e); });
      k.ort.insertBefore(b, danach.nextSibling); danach = b;
      return b;
    });
    return {
      marke: marke, wort: wort, knoepfe: knoepfe,
      untertitel: function (t) { if (t !== undefined) unter.textContent = t == null ? "" : String(t); return unter.textContent; },
    };
  }

  var eingerichtet = false;

  // Richtet Menü, Hilfe und „Über“ ein. Angaben siehe LIESMICH.md. → Steuerung { knopf, menue, ueber, hilfe, … }
  function einrichten(o) {
    angabenPruefen(o);
    if (!wurzel.document) throw new Error("menue: einrichten() geht nur im Browser.");
    var U = ueberLaden();
    if (!U) throw new Error("menue: Der Baustein „ueber“ fehlt (bausteine/ueber.js vor menue.js einbinden).");
    if (eingerichtet) throw new Error("menue: einrichten() wurde schon aufgerufen; es gibt nur ein Menü je Seite.");
    eingerichtet = true;
    var d = wurzel.document, A = o.aktualisieren || wurzel.ImagicosmosAktualisieren || null;
    var eintraege = o.eintraege || [], name = o.name;
    var dunkelMq = wurzel.matchMedia ? wurzel.matchMedia("(prefers-color-scheme: dark)") : null;

    // --- Design ---
    var gewaehlt = designLesen(o.app, o.speicher, o.designStart);
    function designAnwenden() {
      var t = designAufloesen(gewaehlt, dunkelMq && dunkelMq.matches);
      d.documentElement.setAttribute("data-theme", t);
      var farben = o.farben || {}, farbe = t === "light" ? farben.hell : farben.dunkel;
      if (farbe) {
        var meta = d.querySelector('meta[name="theme-color"]');
        if (!meta) { meta = el("meta"); meta.name = "theme-color"; d.head.appendChild(meta); }
        meta.content = farbe;
      }
      if (typeof o.beiDesign === "function") o.beiDesign(t, gewaehlt);
    }
    if (dunkelMq) {
      var wechsel = function () { if (gewaehlt === "auto") designAnwenden(); };
      if (dunkelMq.addEventListener) dunkelMq.addEventListener("change", wechsel); else if (dunkelMq.addListener) dunkelMq.addListener(wechsel);
    }

    // --- Knopf und Menü ---
    var mehr = el("button", "im-knopf im-ibtn");
    mehr.type = "button"; mehr.setAttribute("aria-label", "Menü"); mehr.setAttribute("title", "Menü");
    mehr.setAttribute("aria-haspopup", "menu"); mehr.setAttribute("aria-expanded", "false");
    mehr.appendChild(symbol("mehr"));
    var menue = el("div", "im-menue");
    menue.setAttribute("role", "menu"); menue.hidden = true;

    function menuePunkt(text, sym, aktion) {
      var b = knopf("im-punkt", text, sym);
      b.setAttribute("role", "menuitem");
      b.addEventListener("click", function () { menueZu(); aktion(); });
      menue.appendChild(b);
      return b;
    }
    var eigene = eintraege.filter(function (x) { return x.ort !== "ueber"; }).length;
    eintraege.forEach(function (x) { if (x.ort !== "ueber") menuePunkt(x.text, x.symbol, x.aktion); });
    var install = menuePunkt("App installieren", "installieren", function () {
      if (!installEreignis) return;
      var e = installEreignis;
      e.prompt();
      Promise.resolve(e.userChoice).catch(function () {}).then(function () { installEreignis = null; installZeigen(); });
    });
    var obereLinie = el("hr");
    // ohne eigene Einträge und ohne „App installieren“ keine leere Trennlinie ganz oben
    function installZeigen() { install.hidden = !installEreignis || !!o.android; obereLinie.hidden = !eigene && install.hidden; }
    menue.appendChild(obereLinie);
    installGeaendert = installZeigen; installZeigen();
    menue.appendChild(el("div", "im-titel", "Design"));
    var wahl = el("div", "im-wahl");
    wahl.setAttribute("role", "group"); wahl.setAttribute("aria-label", "Design");
    DESIGNS.forEach(function (w) {
      var b = el("button", null, DESIGN_NAMEN[w]);
      b.type = "button"; b.setAttribute("data-wert", w);
      wahl.appendChild(b);
    });
    function wahlMarkieren() {
      Array.prototype.forEach.call(wahl.children, function (b) {
        var an = b.getAttribute("data-wert") === gewaehlt;
        b.classList.toggle("im-an", an); b.setAttribute("aria-pressed", an ? "true" : "false");
      });
    }
    wahl.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      e.stopPropagation();                                // Menü bleibt offen, damit man das Ergebnis sieht
      design(b.getAttribute("data-wert"));
    });
    menue.appendChild(wahl);
    menue.appendChild(el("hr"));
    menuePunkt("Hilfe", "hilfe", function () { hilfeOeffnen(); });
    menuePunkt("Über " + name, "info", function () { ueberOeffnen(); });

    function menueAuf() {
      var r = mehr.getBoundingClientRect();
      menue.style.top = Math.round(r.bottom + 4) + "px";
      menue.style.right = Math.max(8, Math.round(d.documentElement.clientWidth - r.right)) + "px";
      menue.hidden = false; mehr.setAttribute("aria-expanded", "true");
    }
    function menueZu() { menue.hidden = true; mehr.setAttribute("aria-expanded", "false"); }
    mehr.addEventListener("click", function (e) { e.stopPropagation(); if (menue.hidden) menueAuf(); else menueZu(); });
    menue.addEventListener("click", function (e) { e.stopPropagation(); });
    d.addEventListener("click", menueZu);
    d.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menue.hidden) { menueZu(); mehr.focus(); } });

    // --- Seiten öffnen und schließen (Zurück-Taste des Handys schließt sie) ---
    var offen = null;
    function seiteZeigen(s) {
      menueZu();
      if (typeof o.seiteOeffnen === "function") { o.seiteOeffnen(s); return; }   // App mit eigenen Ebenen
      if (offen === s) return;
      if (offen) offen.hidden = true; else if (wurzel.history) wurzel.history.pushState({ imMenue: 1 }, "");
      offen = s; s.hidden = false;
    }
    function seiteZu(s) {
      if (typeof o.seiteSchliessen === "function") { o.seiteSchliessen(s); return; }
      if (offen && wurzel.history) wurzel.history.back();
    }
    if (typeof o.seiteOeffnen !== "function") {
      wurzel.addEventListener("popstate", function () { if (offen) { offen.hidden = true; offen = null; } });
    }

    // --- Seite „Über“: Inhalt vom Baustein „ueber“ ---
    var u = seiteBauen("im-ueber", "Über " + name);
    var ue = U.bauen(u.innen, {
      app: o.app, name: name, untertitel: o.untertitel, fassung: o.fassung, android: o.android, betrieb: o.betrieb, seite: o.seite,
      eintraege: eintraege.filter(function (x) { return x.ort === "ueber"; }), deineDaten: o.deineDaten, weitereLizenzen: o.weitereLizenzen,
      bausteineDatei: o.bausteineDatei === undefined ? U.standardDatei(skriptAdresse) : o.bausteineDatei,
      aktualisieren: A, speicher: o.speicher, symbol: symbol,
    });
    var geladen = ue.geladen;
    u.zurueck.addEventListener("click", function () { seiteZu(u.seite); });

    // --- Seite „Hilfe“ ---
    var h = seiteBauen("im-hilfe", "Hilfe");
    var appHilfe = el("div", "im-hilfe-app");
    inhaltSetzen(appHilfe, o.hilfe);
    h.innen.appendChild(appHilfe);
    hilfeZusatz({ name: name, android: o.android, seite: o.seite }, A).forEach(function (t) {
      var det = el("details", "im-zusatz"), sum = el("summary"), sym = symbol(t.symbol);
      if (sym) sum.appendChild(sym);
      sum.appendChild(d.createTextNode(t.titel));
      det.appendChild(sum);
      var innen = el("div", "im-in");
      innen.innerHTML = t.html;
      det.appendChild(innen);
      h.innen.appendChild(det);
    });
    h.zurueck.addEventListener("click", function () { seiteZu(h.seite); });

    // --- Kopf: Icon, Schriftzug und Untertitel vorne in der Kopfzeile der App (seit 1.1.0) ---
    var kopf = null;
    if (o.kopf) kopf = kopfBauen(o.kopf, name);

    d.body.appendChild(menue);
    d.body.appendChild(u.seite);
    d.body.appendChild(h.seite);
    if (o.ort && o.ort.appendChild) o.ort.appendChild(mehr);

    // --- Steuerung für die App ---
    function design(wert) {
      if (wert === undefined) return gewaehlt;
      if (!istDesign(wert)) return gewaehlt;
      gewaehlt = wert; designMerken(o.app, wert, o.speicher); wahlMarkieren(); designAnwenden();
      return gewaehlt;
    }
    function hilfeOeffnen(schritt) {
      if (schritt === undefined && typeof o.schritt === "function") schritt = o.schritt();
      Array.prototype.forEach.call(appHilfe.querySelectorAll("details"), function (x) {
        x.open = passtZumSchritt(x.getAttribute("data-schritt"), schritt);
      });
      Array.prototype.forEach.call(h.innen.querySelectorAll("details.im-zusatz"), function (x) { x.open = false; });
      seiteZeigen(h.seite);
      h.inhalt.scrollTop = 0;
    }
    function ueberOeffnen() { seiteZeigen(u.seite); u.inhalt.scrollTop = 0; }

    wahlMarkieren(); designAnwenden();

    return {
      knopf: mehr, menue: menue, ueber: u.seite, hilfe: h.seite,
      hilfeOeffnen: hilfeOeffnen, ueberOeffnen: ueberOeffnen,
      menueSchliessen: menueZu, design: design,
      kopf: kopf,                     // { marke, wort, untertitel(text?) } oder null
      bausteineGeladen: geladen,      // Promise, erfüllt, sobald die Liste „Verwendete Bausteine“ steht (für Tests)
    };
  }

  var api = {
    VERSION: VERSION, DESIGNS: DESIGNS.slice(),
    einrichten: einrichten,
    angabenPruefen: angabenPruefen, markeTeile: markeTeile, designAufloesen: designAufloesen,
    designLesen: designLesen, designMerken: designMerken, passtZumSchritt: passtZumSchritt, hilfeZusatz: hilfeZusatz,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  wurzel.ImagicosmosMenue = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
