// Imagicruise – Bildbearbeitung: Foto drehen, spiegeln, zuschneiden, automatisch verbessern, Helligkeit, Kontrast,
// Farbe und Filter; seit 27.11.2026 auch Begradigen, Wärme, Vignette und „Auf andere Fotos übertragen“ (Auftrag 42). Das Rechnen macht der gemeinsame Baustein „bildbearbeitung“ (bausteine/bild-bearbeitung.js,
// window.ImagicosmosBildBearbeitung, seit 17.11.2026); hier bleibt das Fenster mit der Bedienung.
//
// Grundsatz: Das eingelesene Foto bleibt erhalten. Die Bearbeitung ist nur eine Einstellung
//   { rot: 0/90/180/270, flip, crop: [x, y, b, h] als Anteile des gedrehten Bilds, auto, bri, con, sat (−100…100), fil,
//     str (Begradigen −15…15 Grad), wrm (Wärme −100…100), vig (Vignette 0…100) }
// Daraus wird ein neues Bild gerechnet und als eigene Datei gespeichert (siehe studio.js, „foto-bearbeiten“);
// im Foto der Reise stehen dann `datei` (bearbeitet), `original` und `bearbeitung` (docs/DATENFORMAT.md).
//
//   ImagicruiseBild.oeffnen(blob, einstellung, { andere: Zahl }) → Promise<null | { einstellung | null, blob, breite, hoehe, uebertragen }>
//   (null = abgebrochen; einstellung null = wieder das Original; uebertragen: true = danach auf die anderen Fotos übertragen)
//   ImagicruiseBild.uebertragen(von, auf) → Einstellung: Farben und Filter von `von`, Zuschnitt, Drehen, Begradigen von `auf`
(function (wurzel) {
  "use strict";
  var BB = wurzel.ImagicosmosBildBearbeitung, FILTER = BB.FILTER;
  // [Kennung, Beschriftung, Breite : Höhe] – 0 = frei, -1 = wie das Foto
  var FORMATE = [["frei", "Frei", 0], ["ganz", "Ganzes Foto", -1], ["4:3", "4:3", 4 / 3], ["3:2", "3:2", 1.5], ["16:9", "16:9", 16 / 9], ["1:1", "1:1", 1], ["3:4", "3:4", .75]];
  var KANN_FILTER = BB.kannFilter();
  var MAX_SEITE = 1920, QUALITAET = 0.85;

  function $(s) { return document.querySelector(s); }
  function backen(src, e, max) { return BB.backen(src, e, max); }
  // Blob + Einstellung → { blob, breite, hoehe } (für Tests und für „Übernehmen“)
  function anwenden(blob, einstellung) { return BB.anwenden(blob, einstellung, { maxSeite: MAX_SEITE, qualitaet: QUALITAET }); }

  // ---------- Fenster „Foto bearbeiten“ ----------
  var ed = null, bild = 0;   // ed: { src, pv, e, werkzeug, format, rw, rh, zieh, fertig }
  function geruest() {
    var d = $("#bild");
    if (d.firstChild) return d;
    d.innerHTML = '<div class="blatt-kopf"><h2 id="bild-titel">Foto bearbeiten</h2><button type="button" class="ds-knopf ds-klein ds-zweit" id="bb-zurueck">Zurücksetzen</button></div>' +
      '<div class="bb-inhalt"><div class="bb-buehne"><div class="bb-rahmen" id="bb-rahmen"><canvas id="bb-bild"></canvas>' +
      '<div class="bb-ausschnitt" id="bb-ausschnitt"><i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i></div></div></div>' +
      '<div class="arten bb-werkzeuge" id="bb-werkzeuge" role="group" aria-label="Werkzeug"><button type="button" data-v="schnitt">Zuschnitt</button><button type="button" data-v="licht">Licht &amp; Farbe</button><button type="button" data-v="filter">Filter</button></div>' +
      '<div id="bb-schnitt"><div class="knoepfe"><button type="button" class="ds-knopf ds-klein ds-zweit" id="bb-links">↺ Links drehen</button><button type="button" class="ds-knopf ds-klein ds-zweit" id="bb-rechts">↻ Rechts drehen</button>' +
      '<button type="button" class="ds-knopf ds-klein ds-zweit" id="bb-spiegeln">⇋ Spiegeln</button></div><div class="arten bb-formate" id="bb-formate"></div><p class="klein-text leise" id="bb-groesse"></p>' +
      '<div class="bb-regler"><label class="feld"><span id="bb-str-l">Begradigen</span><input type="range" id="bb-str" min="-15" max="15" step="0.5"></label></div></div>' +
      '<div id="bb-licht"><button type="button" class="ds-knopf ds-klein ds-zweit" id="bb-auto" aria-pressed="false">✨ Automatisch verbessern</button>' +
      '<div id="bb-regler"><label class="feld"><span id="bb-bri-l">Helligkeit</span><input type="range" id="bb-bri" min="-100" max="100" step="1"></label>' +
      '<label class="feld"><span id="bb-con-l">Kontrast</span><input type="range" id="bb-con" min="-100" max="100" step="1"></label>' +
      '<label class="feld"><span id="bb-sat-l">Farbe</span><input type="range" id="bb-sat" min="-100" max="100" step="1"></label></div>' +
      '<div class="bb-regler"><label class="feld"><span id="bb-wrm-l">Wärme</span><input type="range" id="bb-wrm" min="-100" max="100" step="1"></label>' +
      '<label class="feld"><span id="bb-vig-l">Vignette</span><input type="range" id="bb-vig" min="0" max="100" step="1"></label></div></div>' +
      '<div id="bb-filter" class="bb-filter"></div>' +
      '<div class="bb-weiter" id="bb-weiter"><button type="button" class="ds-knopf ds-zweit" id="bb-uebertragen">Auch auf andere Fotos</button>' +
      '<p class="klein-text leise">Übernimmt die Bearbeitung und überträgt Licht, Farbe und Filter. Zuschnitt, Drehen und Begradigen bleiben bei jedem Foto.</p></div></div>' +
      '<div class="blatt-fuss"><button type="button" class="ds-knopf ds-zweit" id="bb-abbrechen">Abbrechen</button><button type="button" class="ds-knopf" id="bb-fertig">Übernehmen</button></div>';
    FORMATE.forEach(function (f) {
      var b = document.createElement("button"); b.type = "button"; b.dataset.v = f[0]; b.textContent = f[1];
      b.onclick = function () { formatSetzen(f[0]); };
      $("#bb-formate").appendChild(b);
    });
    $("#bb-werkzeuge").onclick = function (ev) { var b = ev.target.closest("button"); if (b && ed) { ed.werkzeug = b.dataset.v; abgleichen(); } };
    $("#bb-links").onclick = function () { drehen(3); };
    $("#bb-rechts").onclick = function () { drehen(1); };
    $("#bb-spiegeln").onclick = spiegeln;
    $("#bb-auto").onclick = function () { ed.e.auto = !ed.e.auto; abgleichen(); };
    ["bri", "con", "sat", "str", "wrm", "vig"].forEach(function (k) {
      $("#bb-" + k).oninput = function () { ed.e[k] = +this.value; beschriften(); cancelAnimationFrame(bild); bild = requestAnimationFrame(zeichnen); };
    });
    $("#bb-zurueck").onclick = function () { ed.e = BB.sauber({}); ed.format = "frei"; abgleichen(); };
    $("#bb-abbrechen").onclick = function () { d.close("nein"); };
    $("#bb-fertig").onclick = function () { d.close("ja"); };
    $("#bb-uebertragen").onclick = function () { d.close("uebertragen"); };
    var r = $("#bb-rahmen");
    r.addEventListener("pointerdown", ziehAnfang); r.addEventListener("pointermove", ziehen);
    r.addEventListener("pointerup", ziehEnde); r.addEventListener("pointercancel", ziehEnde);
    return d;
  }
  function masse() { var q = ed.e.rot % 180 !== 0; ed.rw = q ? ed.pv.height : ed.pv.width; ed.rh = q ? ed.pv.width : ed.pv.height; }
  function verhaeltnis() { var r = (FORMATE.filter(function (x) { return x[0] === ed.format; })[0] || [])[2] || 0; return r < 0 ? ed.rw / ed.rh : r; }
  function beschriften() {
    var e = ed.e, vz = function (v) { return (v > 0 ? "+" : "") + v; };
    $("#bb-bri-l").textContent = "Helligkeit " + vz(e.bri); $("#bb-con-l").textContent = "Kontrast " + vz(e.con); $("#bb-sat-l").textContent = "Farbe " + vz(e.sat);
    $("#bb-str-l").textContent = "Begradigen " + vz(e.str).replace(".", ",") + "°"; $("#bb-wrm-l").textContent = "Wärme " + vz(e.wrm); $("#bb-vig-l").textContent = "Vignette " + e.vig;
    $("#bb-zurueck").disabled = BB.istStandard(e);
  }
  function abgleichen() {
    masse();
    var e = ed.e;
    Array.prototype.forEach.call($("#bb-werkzeuge").children, function (b) { b.classList.toggle("an", b.dataset.v === ed.werkzeug); b.hidden = !KANN_FILTER && b.dataset.v === "filter"; });
    $("#bb-schnitt").hidden = ed.werkzeug !== "schnitt"; $("#bb-licht").hidden = ed.werkzeug !== "licht"; $("#bb-filter").hidden = ed.werkzeug !== "filter";
    $("#bb-regler").hidden = !KANN_FILTER;
    Array.prototype.forEach.call($("#bb-formate").children, function (b) { b.classList.toggle("an", b.dataset.v === ed.format); });
    $("#bb-auto").classList.toggle("an", e.auto); $("#bb-auto").setAttribute("aria-pressed", e.auto);
    $("#bb-bri").value = e.bri; $("#bb-con").value = e.con; $("#bb-sat").value = e.sat;
    $("#bb-str").value = e.str; $("#bb-wrm").value = e.wrm; $("#bb-vig").value = e.vig;
    $("#bb-weiter").hidden = !ed.andere;
    $("#bb-uebertragen").textContent = "Übernehmen und auf " + (ed.andere === 1 ? "das andere Foto übertragen" : "die " + ed.andere + " anderen Fotos übertragen");
    beschriften();
    if (ed.werkzeug === "filter") filterKacheln();
    zeichnen();
  }
  function zeichnen() {
    if (!ed) return;
    var schnitt = ed.werkzeug === "schnitt", e = ed.e;
    var c = backen(ed.pv, schnitt ? Object.assign({}, e, { crop: [0, 0, 1, 1] }) : e, 900), cv = $("#bb-bild");
    cv.width = c.width; cv.height = c.height; cv.getContext("2d").drawImage(c, 0, 0);
    rahmenZeigen();
  }
  function rahmenZeigen() {
    var b = $("#bb-ausschnitt"), c = ed.e.crop, quer = ed.e.rot % 180 !== 0;
    b.hidden = ed.werkzeug !== "schnitt";
    b.style.left = c[0] * 100 + "%"; b.style.top = c[1] * 100 + "%"; b.style.width = c[2] * 100 + "%"; b.style.height = c[3] * 100 + "%";
    var pw = Math.round(c[2] * (quer ? ed.src.height : ed.src.width)), ph = Math.round(c[3] * (quer ? ed.src.width : ed.src.height));
    $("#bb-groesse").textContent = "Ausschnitt " + pw + " × " + ph + " Bildpunkte. Rahmen verschieben oder an den Ecken ziehen.";
  }
  function filterKacheln() {
    var feld = $("#bb-filter"); feld.innerHTML = "";
    FILTER.forEach(function (f) {
      var b = document.createElement("button"); b.type = "button"; b.className = ed.e.fil === f[0] ? "an" : ""; b.dataset.v = f[0];
      var s = document.createElement("span"); s.textContent = f[1];
      b.appendChild(backen(ed.pv, Object.assign({}, ed.e, { fil: f[0] }), 150)); b.appendChild(s);
      b.onclick = function () { ed.e.fil = f[0]; abgleichen(); };
      feld.appendChild(b);
    });
  }
  // Drehen und Spiegeln nehmen den Ausschnitt mit; q = Vierteldrehungen im Uhrzeigersinn
  function drehen(q) { ed.e = BB.drehen(ed.e, q); ed.format = "frei"; abgleichen(); }
  function spiegeln() { ed.e = BB.spiegeln(ed.e); abgleichen(); }      // waagerecht, so wie das Bild gerade zu sehen ist
  function formatSetzen(id) {
    ed.format = id; masse();
    var r = verhaeltnis();
    if (r) ed.e.crop = BB.formatAusschnitt(r, ed.rw, ed.rh);
    abgleichen();
  }
  // Ausschnitt mit Finger oder Maus: Rahmen verschieben oder an einer Ecke ziehen
  function ziehAnfang(ev) {
    if (!ed || ed.werkzeug !== "schnitt") return;
    var h = ev.target.dataset.h || (ev.target.id === "bb-ausschnitt" ? "move" : ""); if (!h) return;
    ev.preventDefault();
    var r = $("#bb-rahmen").getBoundingClientRect();
    ed.zieh = { h: h, x0: ev.clientX, y0: ev.clientY, c: ed.e.crop.slice(), W: r.width, H: r.height };
    try { $("#bb-rahmen").setPointerCapture(ev.pointerId); } catch (e) { /* geht auch ohne */ }
  }
  function ziehen(ev) {
    var d = ed && ed.zieh; if (!d) return;
    ed.e.crop = BB.ziehen(d.c, d.h, (ev.clientX - d.x0) / d.W, (ev.clientY - d.y0) / d.H, verhaeltnis(), ed.rw, ed.rh);
    rahmenZeigen(); beschriften();
  }
  function ziehEnde() { if (ed) ed.zieh = null; }

  function oeffnen(blob, einstellung, optionen) {
    if (ed) return Promise.resolve(null);
    return BB.laden(blob).then(function (src) {
      var pv = BB.verkleinern(src, 900);
      var d = geruest();
      ed = { src: src, pv: pv, e: BB.sauber(einstellung) || BB.sauber({}), werkzeug: "schnitt", format: "frei", rw: 1, rh: 1, zieh: null, andere: (optionen && optionen.andere) || 0 };
      abgleichen();
      return new Promise(function (ok, nein) {
        d.returnValue = "nein";
        d.onclose = function () {
          var e = BB.sauber(ed.e), weiter = d.returnValue === "uebertragen", ja = d.returnValue === "ja" || weiter;
          ed = null;
          if (!ja) { ok(null); return; }
          if (BB.istStandard(e)) { ok({ einstellung: null, blob: blob, breite: src.width, hoehe: src.height, uebertragen: weiter }); return; }
          var c = backen(src, e, MAX_SEITE);
          BB.alsJpeg(c, QUALITAET).then(function (b) { ok({ einstellung: e, blob: b, breite: c.width, hoehe: c.height, uebertragen: weiter }); }, nein);
        };
        d.showModal();
      });
    });
  }

  // null: nichts mehr verändert (dann gilt wieder das Original)
  function uebertragen(von, auf) { var e = BB.sauber(BB.uebertragen(BB.sauber(von) || BB.standard(), BB.sauber(auf) || BB.standard())); return BB.istStandard(e) ? null : e; }
  // { blob, breite, hoehe }: mit Einstellung neu gerechnet, ohne das Original selbst
  function fassung(blob, einstellung) {
    if (einstellung) return anwenden(blob, einstellung);
    return BB.laden(blob).then(function (src) { return { blob: blob, breite: src.width, hoehe: src.height }; });
  }

  wurzel.ImagicruiseBild = { oeffnen: oeffnen, anwenden: anwenden, uebertragen: uebertragen, fassung: fassung, FILTER: FILTER, FORMATE: FORMATE };
})(typeof globalThis !== "undefined" ? globalThis : this);
