// Baustein „vorschau“ – Fotos und Sticker direkt in der Vorschau eines Bildes bedienen: ein Foto antippen wählt es, Ziehen verschiebt
// seinen Ausschnitt, ein Regler zoomt, „Tauschen“ setzt zwei Fotos auf den Platz des anderen (ziehen oder nacheinander antippen),
// Sticker liegen obenauf und lassen sich ziehen. Wo welches Foto liegt, meldet der Baustein vorlagen (ab 1.6.0 felder von seite(),
// ab 1.7.0 messen() beim eigenen Zeichnen); ausschnittVerschieben und feldBei kommen ebenfalls von dort.
// Ab 1.1.0 „Anordnen“: In Vorlagen mit losen Teilen (vorlagen ab 1.8.0: Sofortbild, Pinwand, Album) lassen sich Fotos samt Rahmen,
// Zettel und Karteikarte frei verschieben, vergrößern (Punkt unten rechts), drehen (Kreis darunter) und nach vorn oder hinten legen.
// Ab 1.2.0 Sticker wie Fotos: Mit sticker.teile schaltet die Leiste zwischen „Fotos“ und „Sticker“ um. Bei „Sticker“ trifft ein Tipp nur
// Sticker (Griffe für Größe und Drehen, Vorn/Hinten, Entfernen), bei „Fotos“ nur Fotos – so greift man nie den falschen.
// Ab 1.3.0 mit fest: true (braucht sticker.teile): kein Umschalter mehr, ein Tipp wählt, was oben liegt (Sticker vor Zettel/Karte vor
// Foto; Text über text.bei), und die Leiste hat immer dieselben Knöpfe an derselben Stelle, Unpassendes ist ausgegraut. „Darunter“ wählt,
// was unter dem Gewählten liegt. Ohne fest bleibt alles wie in 1.2.0.
// Quelle: Repo imagicosmos/bausteine, vorschau/vorschau.js. In den Apps eine Kopie: NICHT VON HAND ÄNDERN.
// Herkunft: die Bedienung von „Als Status teilen“ in Imagicruise (studio/status.js, 22.11.2026), hierher verschoben, damit Imagiclique
// dieselbe Bedienung bekommt. „Anordnen“ wie die freie Anordnung der Jahresseite in Imagichron. Ohne fremden Code.
// Was gespeichert wird, wie gezeichnet wird und wo Sticker liegen, bestimmt die App.
//
// const b = ImagicosmosVorschau.bedienen(zeichenflaeche, {
//   vorlagen: ImagicosmosVorlagen,           // für feldBei und ausschnittVerschieben
//   felder: () => [...],                     // Felder der letzten Zeichnung (in Punkten der Zeichenfläche)
//   nr: feld => …,                           // Kennung des Fotos zu einem Feld (Zahl oder Objekt; Vorgabe feld.i)
//   bild: nr => Bild,                        // das Foto (für den Ausschnitt; Vorgabe: feld.bild)
//   ausschnitt: nr => { fx, fy, zoom } | null, ausschnittSetzen: (nr, a | null) => …,
//   tauschen: (nrA, nrB) => …,               // die App tauscht die Plätze in ihrer Reihenfolge
//   neuZeichnen: () => …,                    // danach zeichnet die App und ruft b.rahmen(ctx)
//   ausschnittAn: () => true,                // false z. B. bei „ganz zeigen“ (dann nur Tauschen)
//   an: () => true,                          // false = Bedienung ruht (z. B. eigenes Video, Aufnahme läuft); Tippen und Ziehen gehen dann an die App
//   sticker: { bei: p => id | null, lage: id => { x, y }, schieben: (id, x, y) => …, waehlen: id | null => … },   // weglassen = keine
//   ab 1.2.0 stattdessen: sticker: { teile: () => [{ id, ecken, mitte, seite: { w, h }, lage: { x, y, s, r } }], setzen: (id, { x, y, s, r }) => …,
//     ebene: (id, vorn) => neue id | undefined, entfernen: id => …, waehlen: id | null => … }   // Sticker wie Fotos, mit Umschalter „Fotos | Sticker“
//   erneut: nr => …,                         // ein schon gewähltes Foto noch einmal angetippt (z. B. Vollbild)
//   leer: punkt => …,                        // ins Leere getippt (nicht gezogen)
//   aenderung: () => …,                      // Auswahl oder Modus hat sich geändert (für die übrige Oberfläche der App)
//   ab 1.3.0: fest: true,                     // feste Leiste, Antippen wählt (siehe oben)
//   text: { bei: punkt => kennung | null, waehlen: kennung => … },   // nur mit fest: Text im Bild angetippt (nicht gezogen)
//   ausschnittEigen: nr => true | false,      // nur mit fest: hat das Foto einen eigenen Ausschnitt? („Zurück“ sonst grau; Vorgabe: ausschnitt(nr) gesetzt)
//   leiste: Element,                         // hier baut der Baustein Modus, Zoom, „Zurücksetzen“ und den Hinweis (weglassen = keine)
//   texte: { … },                            // eigene Hinweise (siehe TEXTE)
//   // ab 1.1.0, „Anordnen“ (weglassen = kein Anordnen):
//   teile: () => [...],                      // lose Teile der letzten Zeichnung (vorlagen: felder.teile bzw. seite().teile); Vorgabe felder().teile
//   teilNr: teil => …,                       // Kennung eines Teils (Vorgabe: Fotos wie nr, sonst teil.art, also 'titel' oder 'text')
//   lage: nr => { x, y, s, r, z } | null,    // gespeicherte freie Lage
//   lageSetzen: (nr, lage | null) => …,      // speichern (null = wieder automatisch)
// });
// b.rahmen(ctx) zeichnet die Auswahlrahmen (nicht fürs fertige Bild aufrufen); b.aktiv(), b.waehlen(nr | null), b.tauschen(true | false),
// b.modus() bzw. b.modus('aus' | 'tausch' | 'frei'), ab 1.2.0 b.ziel() bzw. b.ziel('fotos' | 'sticker'), b.zustand(), b.pruefen() (nach dem Zeichnen: verschwundenes Foto abwählen,
// „Anordnen“ ein- oder ausblenden), b.anzeigen(), b.loesen().
(function (wurzel) {
  "use strict";
  var VERSION = "1.3.1";
  var ZITTERN = 6;   // so viele Bildschirmpunkte darf der Finger beim Tippen wackeln, bevor es als Ziehen gilt
  var GRIFF = 24;    // Griffe beim Anordnen: so viele Bildschirmpunkte um den Griff herum treffen ihn
  var TEXTE = {
    keins: "Ein Foto im Bild antippen: Ausschnitt verschieben, zoomen oder mit einem anderen Foto tauschen.",
    keinsTausch: "Ein Foto im Bild antippen und auf ein anderes ziehen – dann tauschen beide die Plätze.",
    keinsFrei: "Ein Foto, einen Zettel oder eine Karte im Bild antippen und ziehen – so ordnest du alles frei an.",
    aus: "Im Bild ziehen verschiebt den Ausschnitt dieses Fotos.",
    tausch: "Das Foto im Bild auf ein anderes ziehen oder das andere antippen – dann tauschen beide die Plätze.",
    frei: "Ziehen verschiebt. Punkt unten rechts: Größe. Kreis darunter: drehen.",
    keinsSticker: "Einen Sticker im Bild antippen: ziehen verschiebt, Punkt unten rechts: Größe, Kreis darunter: drehen.",
    stickerLeer: "Auf diesem Bild ist noch kein Sticker.",
    modusAus: "Ausschnitt verschieben", modusTausch: "Tauschen", modusFrei: "Anordnen", zoom: "Zoom", zurueck: "Ausschnitt zurücksetzen",
    vorn: "Nach vorn", hinten: "Nach hinten", automatisch: "Wieder automatisch",
    zielFotos: "Fotos", zielSticker: "Sticker", entfernen: "✕ Entfernen",
    // ab 1.3.0, feste Leiste
    festKeins: "Tippe auf ein Foto, einen Sticker, eine Karte oder den Text.", festAus: "Ausschnitt", festAlle: "Alle zurück",
    festZurueck: "Zurück", festVorn: "Vorn", festHinten: "Hinten", festDarunter: "Darunter", festWeg: "Weg", groesse: "Größe",
    festSticker: "Ziehen verschiebt den Sticker. Punkt: Größe, Kreis: drehen."
  };

  function bedienen(zf, o) {
    o = o || {};
    var V = o.vorlagen || wurzel.ImagicosmosVorlagen;
    var texte = Object.assign({}, TEXTE, o.texte || {});
    var nrVon = o.nr || function (f) { return f.i; };
    var aktiv = null, modus = "aus", ziel = null, zug = null, warFrei = false;
    var stickerNeu = !!(o.sticker && o.sticker.teile), was = "fotos";   // ab 1.2.0: Sticker wie Fotos; was = „Fotos“ oder „Sticker“ bearbeiten
    var stickerZiel = function () { return stickerNeu && was === "sticker"; };
    var fest = stickerNeu && !!o.fest, stapel = [], stapelNr = 0, halten = false;   // ab 1.3.0: alles, was unter dem letzten Tipp liegt, oben zuerst
    var felder = function () { return (o.felder && o.felder()) || []; };
    var freiMoeglich = !!(o.lage && o.lageSetzen);
    var teile = function () {
      if (!freiMoeglich) return [];
      return (o.teile ? o.teile() : felder().teile) || [];
    };
    var teilNr = o.teilNr || function (t) { return t.art === "foto" ? (t.bild ? nrVon(t) : null) : t.art; };
    var ausschnittAn = function () { return !o.ausschnittAn || o.ausschnittAn() !== false; };
    var freiDa = function () { return teile().length > 0; };
    // wirksamer Modus: „Anordnen“ nur mit losen Teilen, „Ausschnitt“ nur, wenn ein Ausschnitt möglich ist
    var wirksam = function () {
      if (modus === "frei") return freiDa() ? "frei" : (ausschnittAn() ? "aus" : "tausch");
      return modus === "tausch" || !ausschnittAn() ? "tausch" : "aus";
    };
    var neu = function () { if (o.neuZeichnen) o.neuZeichnen(); };
    var geaendert = function () { anzeigen(); if (o.aenderung) o.aenderung(); };

    function punkt(ev) {
      var r = zf.getBoundingClientRect();
      return { x: (ev.clientX - r.left) * zf.width / (r.width || 1), y: (ev.clientY - r.top) * zf.height / (r.height || 1) };
    }
    function pro() { var r = zf.getBoundingClientRect(); return zf.width / (r.width || zf.width || 1); }   // Punkte der Fläche je Bildschirmpunkt
    function fotoBei(p) {
      var f = V.feldBei(felder(), p.x, p.y);
      return f ? { feld: f, nr: nrVon(f) } : null;
    }
    // Quelle der losen Teile: Fotos, Zettel, Karte (vorlagen) oder ab 1.2.0 die Sticker
    function Q() {
      if (stickerZiel()) return { teile: function () { return o.sticker.teile() || []; }, nr: function (t) { return t.id; },
        lage: function () { return null; }, setzen: o.sticker.setzen, min: 0.04 };
      return { teile: teile, nr: teilNr, lage: o.lage, setzen: o.lageSetzen, min: 0.08 };
    }
    function teilBei(p) {
      var q = Q(), t = V.feldBei(q.teile(), p.x, p.y), nr = t ? q.nr(t) : null;
      return t && nr != null ? { teil: t, nr: nr } : null;
    }
    // ab 1.3.0: liegt p im Viereck e (Ecken der Reihe nach)?
    function drin(e, p) {
      var vz = 0;
      for (var k = 0; k < e.length; k++) {
        var a = e[k], b = e[(k + 1) % e.length], c = (b[0] - a[0]) * (p.y - a[1]) - (b[1] - a[1]) * (p.x - a[0]);
        if (c !== 0) { if (vz && (c > 0) !== (vz > 0)) return false; vz = c; }
      }
      return true;
    }
    // ab 1.3.0: alles unter p, oben zuerst: Sticker (zuletzt gezeichnet = oben), lose Teile nach Ebene, dann das Foto im Feld
    function treffer(p) {
      var l = [], st = (o.sticker.teile() || []).slice().reverse();
      st.forEach(function (t) { if (t.ecken && drin(t.ecken, p)) l.push({ sorte: "sticker", nr: t.id }); });
      var tl = teile().map(function (t, i) { return { t: t, i: i, z: t.lage && typeof t.lage.z === "number" ? t.lage.z : 0 }; });
      tl.sort(function (a, b) { return b.z - a.z || b.i - a.i; });
      var f = fotoBei(p), m0 = wirksam();
      tl.forEach(function (x) {
        var nr = teilNr(x.t);
        if (nr == null || !x.t.ecken || !drin(x.t.ecken, p)) return;
        if (m0 !== "frei" && f && nr === f.nr) return;   // Foto mit Rahmen: außerhalb von „Anordnen“ zählt das Foto (Ausschnitt, Tauschen)
        l.push({ sorte: "teil", nr: nr, art: x.t.art });
      });
      if (f && !l.some(function (x) { return x.sorte === "teil" && x.nr === f.nr; })) l.push({ sorte: "foto", nr: f.nr });
      return l;
    }
    // ab 1.3.0: einen Eintrag aus dem Stapel wählen (Sorte stellt Ziel und Modus passend)
    function stapelWaehlen(x) {
      if (!x) { aktiv = null; if (was === "sticker" && o.sticker.waehlen) o.sticker.waehlen(null); return; }
      if (x.sorte === "sticker") { was = "sticker"; aktiv = x.nr; if (o.sticker.waehlen) o.sticker.waehlen(x.nr); return; }
      if (was === "sticker" && o.sticker.waehlen) o.sticker.waehlen(null);
      was = "fotos"; aktiv = x.nr;
      if (x.sorte === "teil") modus = "frei"; else if (modus === "frei") modus = ausschnittAn() ? "aus" : "tausch";
    }
    function teilVon(nr) { var q = Q(), l = q.teile(); for (var k = 0; k < l.length; k++) if (q.nr(l[k]) === nr) return l[k]; return null; }
    var freiJetzt = function () { return stickerZiel() || wirksam() === "frei"; };
    function bildVon(nr, feld) { return (o.bild && o.bild(nr)) || (feld && feld.bild) || null; }
    function tauschenJetzt(a, b) { if (a !== b && a != null && b != null && o.tauschen) o.tauschen(a, b); }

    // Griffe am gewählten Teil: Größe an der Ecke unten rechts, Drehen auf einem Kreis unter der Mitte der Unterkante
    function griffe(t) {
      var e = t.ecken, m = t.mitte, u = [(e[2][0] + e[3][0]) / 2, (e[2][1] + e[3][1]) / 2];
      var dx = u[0] - m[0], dy = u[1] - m[1], d = Math.hypot(dx, dy) || 1, a = 34 * pro();
      return { groesse: e[2], unten: u, dreh: [u[0] + dx / d * a, u[1] + dy / d * a], radius: GRIFF * pro() };
    }
    function startFrei(z, t, nr, art, p) {
      aktiv = nr; z.art = art; z.teil = t; z.p0 = p; z.l0 = Object.assign({}, t.lage); z.mitte = t.mitte;
    }

    function unten(ev) {
      if (ev.button > 0 || (o.an && !o.an())) { zug = null; return; }
      var p = punkt(ev), st = o.sticker && !stickerNeu ? o.sticker.bei(p) : null, vorher = aktiv;
      if (fest) {
        // am Griff des Gewählten bleibt die Wahl; sonst entscheidet, was oben liegt
        var tg = aktiv != null && freiJetzt() ? teilVon(aktiv) : null, gg = tg ? griffe(tg) : null;
        var amGriff = gg && (Math.hypot(p.x - gg.groesse[0], p.y - gg.groesse[1]) <= gg.radius || Math.hypot(p.x - gg.dreh[0], p.y - gg.dreh[1]) <= gg.radius);
        if (!amGriff) {
          var neuS = treffer(p), hier = -1;
          if (halten) neuS.forEach(function (x, k) { if (hier < 0 && x.nr === aktiv && (x.sorte === "sticker") === (was === "sticker")) hier = k; });
          if (hier >= 0) { stapel = neuS; stapelNr = hier; }   // nach „Darunter“ bleibt das Gewählte in der Hand, auch wenn etwas darüber liegt
          else {
            halten = false; stapel = neuS; stapelNr = 0;
            var oben = stapel[0], tauschZweit = oben && oben.sorte === "foto" && wirksam() === "tausch" && vorher != null && was === "fotos";
            if (!tauschZweit) {
              if (oben && oben.sorte === "sticker") { if (was !== "sticker") { stapelWaehlen(null); was = "sticker"; } }
              else {
                if (was === "sticker") stapelWaehlen(null);
                was = "fotos";
                if (oben && oben.sorte === "teil") modus = "frei";
                else if (oben && oben.sorte === "foto" && modus === "frei") modus = ausschnittAn() ? "aus" : "tausch";
              }
            }
          }
        }
      }
      var m = freiJetzt() ? "frei" : wirksam();
      if (o.sticker && !stickerNeu) o.sticker.waehlen(st == null ? null : st);
      zug = { id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, bewegt: false, p: p, vorher: vorher };
      if (st != null) {
        var l = o.sticker.lage(st) || { x: p.x, y: p.y };
        zug.art = "sticker"; zug.st = st; zug.dx = l.x - p.x; zug.dy = l.y - p.y; aktiv = null;
      } else if (m === "frei") {
        var ta = aktiv != null ? teilVon(aktiv) : null, g = ta ? griffe(ta) : null, tb;
        if (g && Math.hypot(p.x - g.groesse[0], p.y - g.groesse[1]) <= g.radius) startFrei(zug, ta, aktiv, "groesse", p);
        else if (g && Math.hypot(p.x - g.dreh[0], p.y - g.dreh[1]) <= g.radius) startFrei(zug, ta, aktiv, "dreh", p);
        else if ((tb = fest && halten && ta && drin(ta.ecken, p) ? { teil: ta, nr: aktiv } : teilBei(p))) startFrei(zug, tb.teil, tb.nr, "schieben", p);
        else { aktiv = null; zug.art = "leer"; }
        if (stickerZiel() && o.sticker.waehlen) o.sticker.waehlen(aktiv);
      } else {
        var f = fotoBei(p), tausch = m === "tausch", tl;
        if (f && tausch && vorher != null && f.nr !== vorher && felder().some(function (h) { return nrVon(h) === vorher; })) {
          tauschenJetzt(vorher, f.nr); zug.art = "fertig";   // zweites Foto antippen tauscht; das erste bleibt gewählt
        } else if (f) {
          aktiv = f.nr; zug.art = tausch ? "tausch" : "aus"; zug.feld = f.feld; zug.x = p.x; zug.y = p.y;
        } else if (freiMoeglich && (tl = teilBei(p))) {
          modus = "frei"; startFrei(zug, tl.teil, tl.nr, "schieben", p);   // Rahmen, Zettel oder Karte getroffen: gleich anordnen
        } else {
          aktiv = null; zug.art = "leer";
        }
      }
      if (zug.art !== "leer") { try { zf.setPointerCapture(ev.pointerId); } catch (e) { /* egal */ } if (ev.preventDefault) ev.preventDefault(); }
      geaendert(); neu();
    }
    function freiSetzen(z, p) {
      var q = Q(), l = Object.assign({}, z.l0), s = z.teil.seite || { w: zf.width, h: zf.height }, gespeichert = q.lage(aktiv);
      if (z.art === "schieben") {
        l.x = Math.max(0, Math.min(1, z.l0.x + (p.x - z.p0.x) / s.w));
        l.y = Math.max(0, Math.min(1, z.l0.y + (p.y - z.p0.y) / s.h));
      } else if (z.art === "groesse") {
        var d0 = Math.hypot(z.p0.x - z.mitte[0], z.p0.y - z.mitte[1]) || 1, d1 = Math.hypot(p.x - z.mitte[0], p.y - z.mitte[1]);
        l.s = Math.max(q.min, Math.min(1.5, z.l0.s * d1 / d0));
      } else {
        var w0 = Math.atan2(z.p0.y - z.mitte[1], z.p0.x - z.mitte[0]), w1 = Math.atan2(p.y - z.mitte[1], p.x - z.mitte[0]);
        var r = z.l0.r + (w1 - w0) * 180 / Math.PI;
        r = ((r + 180) % 360 + 360) % 360 - 180;
        l.r = Math.abs(r) < 2 ? 0 : r;                    // nahe an gerade rastet ein
      }
      var neuL = { x: l.x, y: l.y, s: l.s, r: l.r };
      if (gespeichert && typeof gespeichert.z === "number") neuL.z = gespeichert.z;
      q.setzen(aktiv, neuL);
    }
    function bewegen(ev) {
      if (!zug || ev.pointerId !== zug.id) return;
      if (!zug.bewegt && Math.hypot(ev.clientX - zug.sx, ev.clientY - zug.sy) < ZITTERN) return;
      zug.bewegt = true;
      var p = punkt(ev);
      if (zug.art === "sticker") {
        o.sticker.schieben(zug.st, Math.max(0, Math.min(zf.width, p.x + zug.dx)), Math.max(0, Math.min(zf.height, p.y + zug.dy)));
      } else if (zug.art === "aus") {
        var b = bildVon(aktiv, zug.feld); if (!b) return;
        o.ausschnittSetzen(aktiv, V.ausschnittVerschieben(zug.feld, b, o.ausschnitt(aktiv), p.x - zug.x, p.y - zug.y));
        zug.x = p.x; zug.y = p.y;
      } else if (zug.art === "tausch") {
        var z = fotoBei(p), n = z && z.nr !== aktiv ? z.nr : null;
        if (n === ziel) return;
        ziel = n;
      } else if (zug.art === "schieben" || zug.art === "groesse" || zug.art === "dreh") {
        if (fest && zug.art === "schieben" && stapel.length) { stapel = []; halten = false; anzeigen(); }   // verschoben: was darunter lag, stimmt nicht mehr
        freiSetzen(zug, p);
      } else return;
      neu();
    }
    // ab 1.3.1: Nach einem Fingertipp schickt der Browser noch ein mousedown hinterher; das nähme dem Feld, das text.waehlen()
    // gerade bereit zum Schreiben gemacht hat, den Fokus wieder weg (Thema Text ginge auf, die Tastatur nicht)
    function mausSchlucken() {
      var weg = function () { zf.removeEventListener("mousedown", halt, true); }, halt = function (e) { e.preventDefault(); weg(); };
      zf.addEventListener("mousedown", halt, true); setTimeout(weg, 800);
    }
    function loslassen(ev) {
      if (!zug || ev.pointerId !== zug.id) return;
      var z = zug, getauscht = false; zug = null;
      if (z.art === "tausch" && ziel != null && ev.type === "pointerup") { tauschenJetzt(aktiv, ziel); getauscht = true; }
      var warZiel = ziel != null; ziel = null;
      if (ev.type === "pointerup" && !z.bewegt) {
        // ab 1.3.0: Text angetippt – nur wenn kein Sticker, Zettel oder Karte darüber liegt; der Text gilt auch über einem schon gewählten Foto
        // ab 1.3.1 auch auf dem Rahmen eines Fotos (Titel im Sofortbild)
        var oben = stapel[stapelNr], tx = fest && o.text && o.text.bei && was !== "sticker" && (!oben || oben.sorte === "foto" || oben.art === "foto") && !halten ? o.text.bei(z.p) : null;
        if (tx != null && o.text.waehlen) {
          aktiv = null; geaendert(); neu(); mausSchlucken(); o.text.waehlen(tx);
          return;
        }
        if (z.art === "leer" && o.leer) o.leer(z.p);
        else if ((z.art === "aus" || z.art === "tausch" || z.art === "schieben") && z.vorher === aktiv && aktiv != null && o.erneut && !stickerZiel()) o.erneut(aktiv);
      }
      if (getauscht || warZiel) neu();
      if (z.bewegt && (z.art === "schieben" || z.art === "groesse" || z.art === "dreh")) geaendert();
      else if (z.bewegt && z.art === "aus" && fest) anzeigen();   // ab 1.3.0: Ausschnitt verschoben, „Zurück“ wird aktiv
    }
    zf.addEventListener("pointerdown", unten);
    zf.addEventListener("pointermove", bewegen);
    zf.addEventListener("pointerup", loslassen);
    zf.addEventListener("pointercancel", loslassen);
    if (zf.style) zf.style.touchAction = "none";

    function umriss(x, ecken) { x.beginPath(); ecken.forEach(function (q, k) { if (k) x.lineTo(q[0], q[1]); else x.moveTo(q[0], q[1]); }); x.closePath(); }
    // Rahmen ums gewählte Foto (gestrichelt, weiß) und ums Ziel beim Tauschen (durchgehend, gelb); beim Anordnen ums Teil mit Griffen
    function rahmen(x) {
      if (freiJetzt()) {
        var t = aktiv != null ? teilVon(aktiv) : null; if (!t) return;
        var g = griffe(t), k = pro();
        x.save(); umriss(x, t.ecken);
        x.lineWidth = 2.5 * k; x.setLineDash([9 * k, 6 * k]); x.strokeStyle = "rgba(255,255,255,.95)"; x.shadowColor = "rgba(0,0,0,.6)"; x.shadowBlur = 3 * k; x.stroke();
        x.setLineDash([]); x.lineWidth = 2 * k;
        x.beginPath(); x.moveTo(g.unten[0], g.unten[1]); x.lineTo(g.dreh[0], g.dreh[1]); x.stroke();
        [g.groesse, g.dreh].forEach(function (q, i) {
          x.beginPath(); x.arc(q[0], q[1], 9 * k, 0, 2 * Math.PI); x.fillStyle = i ? "#ffffff" : "rgba(255,200,40,1)"; x.fill();
          x.strokeStyle = "rgba(0,0,0,.65)"; x.stroke();
        });
        x.restore();
        return;
      }
      felder().forEach(function (f) {
        var nr = nrVon(f), istZiel = ziel != null && nr === ziel;
        if ((aktiv == null || nr !== aktiv) && !istZiel) return;
        x.save(); umriss(x, f.ecken);
        x.lineWidth = istZiel ? 12 : 6; x.setLineDash(istZiel ? [] : [22, 14]); x.strokeStyle = istZiel ? "rgba(255,200,40,.95)" : "rgba(255,255,255,.95)";
        x.shadowColor = "rgba(0,0,0,.6)"; x.shadowBlur = 8; x.stroke(); x.restore();
      });
    }

    // Ebene: nach vorn bzw. hinten (z über bzw. unter allen anderen Teilen)
    function ebene(vorn) {
      if (aktiv == null) return;
      if (stickerZiel()) {
        if (o.sticker.ebene) { var n = o.sticker.ebene(aktiv, vorn); if (n !== undefined) aktiv = n; if (o.sticker.waehlen) o.sticker.waehlen(aktiv); }
        neu(); geaendert(); return;
      }
      var zs = teile().map(function (t) { return t.lage && typeof t.lage.z === "number" ? t.lage.z : 0; });
      if (!zs.length) return;
      var z = vorn ? Math.max.apply(null, zs) + 1 : Math.min.apply(null, zs) - 1;
      o.lageSetzen(aktiv, Object.assign({}, o.lage(aktiv) || {}, { z: z })); neu(); geaendert();
    }
    function entfernen() {
      if (aktiv == null || !stickerZiel() || !o.sticker.entfernen) return;
      var nr = aktiv; aktiv = null; o.sticker.entfernen(nr); if (o.sticker.waehlen) o.sticker.waehlen(null); neu(); geaendert();
    }
    function automatisch() {
      teile().forEach(function (t) { var nr = teilNr(t); if (nr != null && t.frei) o.lageSetzen(nr, null); });
      neu(); geaendert();
    }

    // Leiste: Modus, Zoom, Zurücksetzen bzw. Ebene und „Wieder automatisch“, Hinweis
    var el = null;
    if (o.leiste && o.leiste.ownerDocument) {
      var dok = o.leiste.ownerDocument;
      var knopf = function (text, klasse, daten) {
        var k = dok.createElement("button"); k.type = "button"; k.className = klasse; k.textContent = text;
        Object.keys(daten || {}).forEach(function (n) { k.dataset[n] = daten[n]; }); return k;
      };
      el = {};
      el.leiste = dok.createElement("div"); el.leiste.className = "vs-leiste" + (fest ? " vs-fest" : ""); el.leiste.hidden = true;
      el.was = dok.createElement("div"); el.was.className = "vs-was"; el.was.setAttribute("role", "group"); el.was.hidden = !stickerNeu;
      [["fotos", texte.zielFotos], ["sticker", texte.zielSticker]].forEach(function (m) { el.was.appendChild(knopf(m[1], "ds-knopf ds-klein", { vsZiel: m[0] })); });
      el.modus = dok.createElement("div"); el.modus.className = "vs-modus"; el.modus.setAttribute("role", "group");
      (fest ? [["aus", texte.festAus], ["tausch", texte.modusTausch], ["frei", texte.modusFrei]] : [["frei", texte.modusFrei], ["aus", texte.modusAus], ["tausch", texte.modusTausch]]).forEach(function (m) {
        el.modus.appendChild(knopf(m[1], "ds-knopf ds-klein", { vsModus: m[0] }));
      });
      el.zoomFeld = dok.createElement("label"); el.zoomFeld.className = "vs-zoom";
      el.zoomFeld.appendChild(dok.createTextNode(texte.zoom + " "));
      el.zoom = dok.createElement("input"); el.zoom.type = "range"; el.zoom.min = "1"; el.zoom.max = "3"; el.zoom.step = "0.05"; el.zoom.value = "1";
      el.zoomFeld.appendChild(el.zoom);
      el.zurueck = knopf(texte.zurueck, "ds-knopf ds-zweit ds-klein", { vsZurueck: "" });
      el.ebene = dok.createElement("div"); el.ebene.className = "vs-ebene";
      el.vorn = knopf(texte.vorn, "ds-knopf ds-zweit ds-klein", { vsEbene: "vorn" });
      el.hinten = knopf(texte.hinten, "ds-knopf ds-zweit ds-klein", { vsEbene: "hinten" });
      el.ebene.appendChild(el.vorn); el.ebene.appendChild(el.hinten);
      el.auto = knopf(texte.automatisch, "ds-knopf ds-zweit ds-klein", { vsAutomatisch: "" });
      el.weg = knopf(texte.entfernen, "ds-knopf ds-zweit ds-klein vs-weg", { vsEntfernen: "" });
      if (fest) {
        // ab 1.3.0: zwei feste Zeilen; Zeile 1 wie Fotos bewegt werden, Zeile 2 was mit dem Gewählten geht
        var sym = function (k, z, t) { k.textContent = ""; var b = dok.createElement("b"); b.textContent = z; b.setAttribute("aria-hidden", "true"); k.appendChild(b); k.appendChild(dok.createTextNode(t)); k.className = "ds-knopf ds-zweit vs-i"; return k; };
        el.auto.textContent = "↺ " + texte.festAlle; el.modus.appendChild(el.auto);
        el.tat = dok.createElement("div"); el.tat.className = "vs-tat";
        el.zoomFeld = dok.createElement("label"); el.reglerName = dok.createElement("span"); el.reglerName.textContent = texte.zoom;
        el.zoomFeld.appendChild(el.reglerName); el.zoomFeld.appendChild(el.zoom); el.zoomFeld.className = "vs-zoom vs-regler";
        el.darunter = knopf("", "", { vsDarunter: "" });
        sym(el.zurueck, "↺", texte.festZurueck); sym(el.vorn, "▲", texte.festVorn); sym(el.hinten, "▼", texte.festHinten);
        sym(el.darunter, "⧉", texte.festDarunter); sym(el.weg, "✕", texte.festWeg); el.weg.className += " vs-weg";
        [el.zoomFeld, el.zurueck, el.vorn, el.hinten, el.darunter, el.weg].forEach(function (k) { el.tat.appendChild(k); });
        [el.modus, el.tat].forEach(function (k) { el.leiste.appendChild(k); });
        el.darunter.addEventListener("click", function (ev) {
          ev.stopPropagation(); if (stapel.length < 2) return;
          stapelNr = (stapelNr + 1) % stapel.length; stapelWaehlen(stapel[stapelNr]); halten = true; geaendert(); neu();
        });
      } else
      [el.was, el.modus, el.zoomFeld, el.zurueck, el.ebene, el.auto, el.weg].forEach(function (k) { el.leiste.appendChild(k); });
      el.tipp = dok.createElement("p"); el.tipp.className = "vs-tipp";
      o.leiste.appendChild(el.leiste); o.leiste.appendChild(el.tipp);
      el.modus.addEventListener("click", function (ev) {
        var k = ev.target.closest("button"); if (!k || !k.dataset.vsModus) return;
        ev.stopPropagation(); modus = k.dataset.vsModus;
        if (modus !== "frei" && aktiv != null && !felder().some(function (f) { return nrVon(f) === aktiv; })) aktiv = null;   // Zettel, Karte: nur beim Anordnen
        geaendert(); neu();
      });
      el.zoom.addEventListener("input", function () {
        if (aktiv == null) return;
        if (fest && stickerZiel()) {   // ab 1.3.0: beim Sticker heißt der Regler „Größe“
          var ts = teilVon(aktiv); if (!ts) return;
          o.sticker.setzen(aktiv, Object.assign({}, ts.lage, { s: +el.zoom.value })); neu(); return;
        }
        o.ausschnittSetzen(aktiv, Object.assign({ fx: 50, fy: 50 }, o.ausschnitt(aktiv), { zoom: +el.zoom.value })); neu();
        if (fest) anzeigen();   // „Zurück“ wird aktiv
      });
      el.zurueck.addEventListener("click", function (ev) {
        ev.stopPropagation(); if (aktiv == null) return;
        if (fest && wirksam() === "frei" && !stickerZiel()) { o.lageSetzen(aktiv, null); geaendert(); neu(); return; }   // ab 1.3.0: Teil wieder automatisch
        o.ausschnittSetzen(aktiv, null); anzeigen(); neu();
      });
      el.vorn.addEventListener("click", function (ev) { ev.stopPropagation(); ebene(true); });
      el.hinten.addEventListener("click", function (ev) { ev.stopPropagation(); ebene(false); });
      el.auto.addEventListener("click", function (ev) { ev.stopPropagation(); automatisch(); });
      el.weg.addEventListener("click", function (ev) { ev.stopPropagation(); entfernen(); });
      el.was.addEventListener("click", function (ev) {
        var k = ev.target.closest("button"); if (!k) return;
        ev.stopPropagation(); zielSetzen(k.dataset.vsZiel);
      });
    }
    function zielSetzen(z) {
      if (!stickerNeu || (z !== "fotos" && z !== "sticker") || z === was) return;
      was = z; aktiv = null; if (o.sticker.waehlen) o.sticker.waehlen(null); geaendert(); neu();
    }
    // ab 1.3.0: feste Leiste – nichts kommt oder geht, nur aktiv oder grau
    function anzeigenFest() {
      var st = stickerZiel(), sel = aktiv != null, an = ausschnittAn(), da = freiDa(), m = wirksam(), frei = !st && m === "frei";
      var t = sel && (st || frei) ? teilVon(aktiv) : null, lage = !st && sel && frei ? o.lage(aktiv) : null;
      var fotoZahl = felder().filter(function (f) { return nrVon(f) != null; }).length;
      el.leiste.hidden = false; el.tipp.dataset.vsLeer = sel ? "" : "1";
      Array.prototype.forEach.call(el.modus.querySelectorAll("[data-vs-modus]"), function (k) {
        var art = k.dataset.vsModus, g = !st && art === m;
        k.hidden = false;
        k.disabled = st || (art === "frei" ? !da : art === "aus" ? !an : fotoZahl < 2);
        k.className = "ds-knopf ds-klein" + (g ? "" : " ds-zweit"); k.setAttribute("aria-pressed", g ? "true" : "false");
      });
      el.auto.hidden = false; el.auto.disabled = !frei || !teile().some(function (x) { return x.frei; });
      var zoomAn = !st && sel && an && m === "aus";
      el.reglerName.textContent = st ? texte.groesse : texte.zoom;
      if (st && t) { el.zoom.min = "0.04"; el.zoom.max = "0.8"; el.zoom.step = "0.01"; el.zoom.value = String(t.lage.s); }
      else { el.zoom.min = "1"; el.zoom.max = "3"; el.zoom.step = "0.05"; var a = zoomAn ? o.ausschnitt(aktiv) : null; el.zoom.value = String((a && a.zoom) || 1); }
      el.zoom.disabled = !(zoomAn || (st && t)); el.zoomFeld.className = "vs-zoom vs-regler" + (el.zoom.disabled ? " vs-aus" : "");
      var eigen = zoomAn && (o.ausschnittEigen ? o.ausschnittEigen(aktiv) : !!o.ausschnitt(aktiv));   // ab 1.3.0: nur wenn schon verschoben oder gezoomt
      el.zurueck.disabled = !eigen && !(frei && lage);
      el.vorn.disabled = el.hinten.disabled = !t;
      el.darunter.disabled = stapel.length < 2 || !sel;
      el.weg.disabled = !(st && sel);
      [el.zoomFeld, el.zurueck, el.vorn, el.hinten, el.darunter, el.weg].forEach(function (k) { k.hidden = false; });
      el.tipp.textContent = !sel ? (st && !(o.sticker.teile() || []).length ? texte.stickerLeer : texte.festKeins)
        : (st ? texte.festSticker : frei ? texte.frei : m === "tausch" ? texte.tausch : texte.aus);
    }
    function anzeigen() {
      if (!el) return;
      if (fest) { anzeigenFest(); return; }
      Array.prototype.forEach.call(el.was.querySelectorAll("button"), function (k) {
        var g = k.dataset.vsZiel === was; k.className = "ds-knopf ds-klein" + (g ? "" : " ds-zweit"); k.setAttribute("aria-pressed", g ? "true" : "false");
      });
      el.tipp.dataset.vsLeer = aktiv == null ? "1" : "";
      if (stickerZiel()) {
        el.leiste.hidden = false; el.modus.hidden = el.zoomFeld.hidden = el.zurueck.hidden = el.auto.hidden = true;
        el.ebene.hidden = el.weg.hidden = aktiv == null;
        el.tipp.textContent = aktiv != null ? texte.frei : (o.sticker.teile() || []).length ? texte.keinsSticker : texte.stickerLeer;
        return;
      }
      el.weg.hidden = true;
      var an = ausschnittAn(), m = wirksam(), da = freiDa(), frei = m === "frei";
      var irgendFrei = teile().some(function (t) { return t.frei; });
      el.leiste.hidden = aktiv == null && !(frei && irgendFrei) && !stickerNeu;
      el.modus.hidden = !an && !da;
      Array.prototype.forEach.call(el.modus.querySelectorAll("button"), function (k) {
        var art = k.dataset.vsModus;
        k.hidden = art === "frei" ? !da : art === "aus" ? !an : false;
        var gedrueckt = art === m;
        k.className = "ds-knopf ds-klein" + (gedrueckt ? "" : " ds-zweit"); k.setAttribute("aria-pressed", gedrueckt ? "true" : "false");
      });
      el.zoomFeld.hidden = el.zurueck.hidden = !an || frei || aktiv == null;
      if (aktiv != null && an && !frei) { var a = o.ausschnitt(aktiv); el.zoom.value = String((a && a.zoom) || 1); }
      el.ebene.hidden = !frei || aktiv == null;
      el.auto.hidden = !frei || !irgendFrei;
      el.tipp.textContent = aktiv == null ? (frei ? texte.keinsFrei : an ? texte.keins : texte.keinsTausch) : frei ? texte.frei : m === "tausch" ? texte.tausch : texte.aus;
    }
    anzeigen();

    return {
      rahmen: rahmen,
      aktiv: function () { return aktiv; },
      waehlen: function (nr) { aktiv = nr == null ? null : nr; stapel = []; geaendert(); },
      tauschen: function (an) { modus = an ? "tausch" : "aus"; geaendert(); },
      modus: function (m) { if (m === "aus" || m === "tausch" || m === "frei") { modus = m; geaendert(); } return wirksam(); },
      ziel: function (z) { if (z) zielSetzen(z); return was; },
      zustand: function () { return { aktiv: aktiv, tauschen: wirksam() === "tausch", modus: wirksam(), was: was, ziel: ziel, zieht: !!(zug && zug.bewegt), stapel: stapel.slice() }; },
      pruefen: function () {
        // „Anordnen“ ist die Vorgabe, sobald die Vorlage lose Teile hat; ohne sie zurück zu „Ausschnitt“
        var da = freiDa(), ok = true;
        if (da && !warFrei) modus = "frei";
        else if (!da && warFrei && modus === "frei") modus = "aus";
        var wechsel = da !== warFrei; warFrei = da;
        if (stickerZiel()) { if (aktiv != null && !teilVon(aktiv)) { aktiv = null; ok = false; } }
        else if (aktiv != null && !felder().some(function (f) { return nrVon(f) === aktiv; }) && !(wirksam() === "frei" && teilVon(aktiv))) { aktiv = null; ok = false; }
        if (!ok || wechsel) geaendert();
        return ok;
      },
      anzeigen: anzeigen,
      loesen: function () {
        zf.removeEventListener("pointerdown", unten); zf.removeEventListener("pointermove", bewegen);
        zf.removeEventListener("pointerup", loslassen); zf.removeEventListener("pointercancel", loslassen);
        if (el) { el.leiste.remove(); el.tipp.remove(); el = null; }
      }
    };
  }

  var api = { VERSION: VERSION, bedienen: bedienen, TEXTE: TEXTE, ZITTERN: ZITTERN, GRIFF: GRIFF };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  wurzel.ImagicosmosVorschau = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
