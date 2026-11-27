// Imagicruise – Speicher für Reisen und Fotos. Zwei Fassungen mit derselben Schnittstelle:
//
// - "pc":     Das Studio läuft über den lokalen Server (python -m imagicruise studio). Reisen liegen als Ordner
//             auf dem PC (Benutzerordner\Imagicruise). Erkennbar an <meta name="imagicruise-studio"> in der Seite.
// - "geraet": Die Web-App läuft ohne Server (Handy). Reisen liegen im Speicher des Browsers (IndexedDB).
//
// Die Oberfläche (studio.js) kennt nur diese Schnittstelle – so läuft dasselbe Studio auf PC und Handy.
//   liste()                         → [{ id, titel, untertitel, art, von, bis, titelbild, geaendert, tage, ereignisse, fotos }]
//   laden(id)                       → Reise
//   speichern(reise)                → –
//   loeschen(id)                    → –   (PC: in den Papierkorb-Ordner)
//   medium(id, datei)               → Blob oder null
//   mediumSpeichern(id, datei, blob)→ –
//   mediumLoeschen(id, datei)       → –   (eine Fassung, die die Reise nicht mehr braucht)
//   medienliste(id)                 → ["<datei>", …]
//   nur PC: exportieren(id, eintraege, fortschritt) → { ordner }, ordnerOeffnen(id, "reise" | "veroeffentlicht")
(function (wurzel) {
  "use strict";
  var M = wurzel.ImagicruiseModell;

  function kurz(reise) {
    var z = M.zahlen(reise), bild = reise.titelbild;
    if (!bild) { var f = M.alleFotos(reise)[0]; bild = f ? f.foto.datei : ""; }
    return { id: reise.id, titel: reise.titel, untertitel: reise.untertitel, art: reise.art, von: reise.von, bis: reise.bis,
      titelbild: bild, geaendert: reise.geaendert, tage: z.tage, ereignisse: z.ereignisse, fotos: z.fotos };
  }

  // ---------------- PC: lokaler Server ----------------
  function pc(cfg) {
    var basis = "/api/v1";
    function ruf(methode, pfad, koerper, art) {
      var kopf = { "X-Imagicruise-Zeichen": cfg.zeichen };
      if (art) kopf["Content-Type"] = art;
      return fetch(basis + pfad, { method: methode, headers: kopf, body: koerper }).then(function (r) {
        if (r.ok) return r;
        return r.text().then(function (t) {
          var meldung = t;
          try { meldung = JSON.parse(t).fehler || t; } catch (e) { /* Text bleibt */ }
          var f = new Error(meldung || "Der Server meldet einen Fehler (" + r.status + ")."); f.status = r.status; throw f;
        });
      }, function () { throw new Error("Das Studio antwortet nicht. Läuft das Fenster „Imagicruise Studio“ noch?"); });
    }
    var json = function (r) { return r.json(); };
    return {
      art: "pc", ordner: cfg.ordner, version: cfg.version,
      liste: function () { return ruf("GET", "/reisen").then(json).then(function (j) { return j.reisen; }); },
      laden: function (id) { return ruf("GET", "/reisen/" + id).then(json).then(M.pruefen); },
      speichern: function (reise) { return ruf("PUT", "/reisen/" + reise.id, JSON.stringify(reise), "application/json").then(function () {}); },
      loeschen: function (id) { return ruf("DELETE", "/reisen/" + id).then(function () {}); },
      medium: function (id, datei) {
        return ruf("GET", "/reisen/" + id + "/medien/" + datei).then(function (r) { return r.blob(); }, function (f) { if (f.status === 404) return null; throw f; });
      },
      mediumSpeichern: function (id, datei, blob) { return ruf("PUT", "/reisen/" + id + "/medien/" + datei, blob, /\.mp4$/.test(datei) ? "video/mp4" : "image/jpeg").then(function () {}); },
      mediumLoeschen: function (id, datei) { return ruf("DELETE", "/reisen/" + id + "/medien/" + datei).then(function () {}); },
      medienliste: function (id) { return ruf("GET", "/reisen/" + id + "/medien").then(json).then(function (j) { return j.medien; }); },
      exportieren: function (id, eintraege, fortschritt) {
        return ruf("POST", "/reisen/" + id + "/veroeffentlicht/beginnen").then(function () {
          return eintraege.reduce(function (p, e, i) {
            return p.then(function () { return ruf("PUT", "/reisen/" + id + "/veroeffentlicht/datei/" + e.name, e.daten, "application/octet-stream"); })
              .then(function () { if (fortschritt) fortschritt(i + 1, eintraege.length); });
          }, Promise.resolve());
        }).then(function () { return ruf("POST", "/reisen/" + id + "/veroeffentlicht/abschliessen"); }).then(json);
      },
      ordnerOeffnen: function (id, welcher) { return ruf("POST", "/reisen/" + id + "/ordner/" + welcher).then(function () {}); }
    };
  }

  // ---------------- Gerät: IndexedDB ----------------
  function geraet() {
    var bereit = new Promise(function (ok, nein) {
      var a = indexedDB.open("imagicruise", 1);
      a.onupgradeneeded = function () {
        a.result.createObjectStore("reisen", { keyPath: "id" });
        a.result.createObjectStore("medien");   // Schlüssel "<reise>/<datei>"
      };
      a.onsuccess = function () { ok(a.result); };
      a.onerror = function () { nein(new Error("Der Speicher des Browsers lässt sich nicht öffnen (privates Fenster?).")); };
    });
    function tun(lager, schreibend, f) {
      return bereit.then(function (db) {
        return new Promise(function (ok, nein) {
          var t = db.transaction(lager, schreibend ? "readwrite" : "readonly"), ergebnis;
          var anfrage = f(t);
          if (anfrage) anfrage.onsuccess = function () { ergebnis = anfrage.result; };
          t.oncomplete = function () { ok(ergebnis); };
          t.onerror = t.onabort = function () {
            var e = t.error || {};
            nein(new Error(e.name === "QuotaExceededError" ? "Der Speicher des Geräts ist voll." : "Speichern auf dem Gerät hat nicht geklappt."));
          };
        });
      });
    }
    // Den Browser bitten, die Daten nicht von sich aus zu löschen (wichtig auf dem Handy)
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    return {
      art: "geraet",
      liste: function () {
        return tun("reisen", false, function (t) { return t.objectStore("reisen").getAll(); }).then(function (alle) {
          return (alle || []).map(kurz).sort(function (a, b) { return a.von < b.von ? 1 : a.von > b.von ? -1 : 0; });
        });
      },
      laden: function (id) {
        return tun("reisen", false, function (t) { return t.objectStore("reisen").get(id); }).then(function (r) {
          if (!r) throw new Error("Diese Reise gibt es auf diesem Gerät nicht (mehr).");
          return M.pruefen(r);
        });
      },
      speichern: function (reise) { return tun("reisen", true, function (t) { t.objectStore("reisen").put(JSON.parse(JSON.stringify(reise))); }); },
      loeschen: function (id) {
        return tun(["reisen", "medien"], true, function (t) {
          t.objectStore("reisen").delete(id);
          t.objectStore("medien").delete(IDBKeyRange.bound(id + "/", id + "/￿"));
        });
      },
      medium: function (id, datei) { return tun("medien", false, function (t) { return t.objectStore("medien").get(id + "/" + datei); }).then(function (b) { return b || null; }); },
      mediumSpeichern: function (id, datei, blob) { return tun("medien", true, function (t) { t.objectStore("medien").put(blob, id + "/" + datei); }); },
      mediumLoeschen: function (id, datei) { return tun("medien", true, function (t) { t.objectStore("medien").delete(id + "/" + datei); }); },
      medienliste: function (id) {
        return tun("medien", false, function (t) { return t.objectStore("medien").getAllKeys(IDBKeyRange.bound(id + "/", id + "/￿")); })
          .then(function (k) { return (k || []).map(function (s) { return String(s).slice(id.length + 1); }); });
      }
    };
  }

  wurzel.ImagicruiseSpeicher = {
    // Der lokale Server schreibt seine Angaben als <meta name="imagicruise-studio"> in die Seite (siehe schutz.py)
    oeffnen: function () {
      var m = document.querySelector('meta[name="imagicruise-studio"]'), cfg = null;
      try { cfg = m ? JSON.parse(m.content) : null; } catch (e) { cfg = null; }
      return cfg && cfg.zeichen ? pc(cfg) : geraet();
    },
    kurz: kurz
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
