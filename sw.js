// Imagicruise – Service Worker der Web-App: Damit läuft die App auch ohne Netz (auf dem Schiff, im Ausland).
//
// Diese Datei ist eine Vorlage. werkzeuge/app_bauen.py setzt die Liste der Dateien und die Version ein.
// Die Reisen und Fotos liegen NICHT hier, sondern im Speicher des Browsers (IndexedDB, studio/speicher.js).
const VERSION = "d771f95dbaaf";
const DATEIEN = ["./", "abspieler/app.js", "abspieler/arten.js", "abspieler/favicon.svg", "abspieler/index.html", "abspieler/karte.js", "abspieler/modus.js", "abspieler/schriften/OFL-josefin-sans.txt", "abspieler/schriften/josefin-sans-latin-700-normal.woff2", "abspieler/style.css", "abspieler/weltkarte.js", "index.html", "manifest.webmanifest", "studio/abgleich.js", "studio/bausteine/LIZENZEN-schriften.txt", "studio/bausteine/OFL-josefin-sans.txt", "studio/bausteine/aktualisieren.css", "studio/bausteine/aktualisieren.js", "studio/bausteine/bausteine.json", "studio/bausteine/bebas-neue-latin-400-normal.woff2", "studio/bausteine/bild-bearbeitung.js", "studio/bausteine/caveat-latin-700-normal.woff2", "studio/bausteine/comfortaa-latin-700-normal.woff2", "studio/bausteine/cormorant-garamond-latin-700-normal.woff2", "studio/bausteine/dancing-script-latin-700-normal.woff2", "studio/bausteine/design.css", "studio/bausteine/design.js", "studio/bausteine/foto-auswahl.css", "studio/bausteine/foto-auswahl.js", "studio/bausteine/foto-daten.js", "studio/bausteine/fredoka-latin-600-normal.woff2", "studio/bausteine/great-vibes-latin-400-normal.woff2", "studio/bausteine/inter-latin-400-normal.woff2", "studio/bausteine/inter-latin-600-normal.woff2", "studio/bausteine/inter-latin-800-normal.woff2", "studio/bausteine/josefin-sans-latin-700-normal.woff2", "studio/bausteine/ki-kern.js", "studio/bausteine/lobster-latin-400-normal.woff2", "studio/bausteine/menue.css", "studio/bausteine/menue.js", "studio/bausteine/mp4-muxer.LICENSE.txt", "studio/bausteine/mp4-muxer.min.js", "studio/bausteine/mp4box.LICENSE.txt", "studio/bausteine/mp4box.all.min.js", "studio/bausteine/orts-info.js", "studio/bausteine/oswald-latin-600-normal.woff2", "studio/bausteine/pacifico-latin-400-normal.woff2", "studio/bausteine/permanent-marker-latin-400-normal.woff2", "studio/bausteine/playfair-display-latin-600-normal.woff2", "studio/bausteine/playfair-display-latin-800-normal.woff2", "studio/bausteine/pruefen.js", "studio/bausteine/special-elite-latin-400-normal.woff2", "studio/bausteine/stile/abschluss.imagistil", "studio/bausteine/stile/advent.imagistil", "studio/bausteine/stile/danke.imagistil", "studio/bausteine/stile/einschulung.imagistil", "studio/bausteine/stile/einzug.imagistil", "studio/bausteine/stile/fasching.imagistil", "studio/bausteine/stile/fruehling.imagistil", "studio/bausteine/stile/fussball.imagistil", "studio/bausteine/stile/geburt.imagistil", "studio/bausteine/stile/gedenken.imagistil", "studio/bausteine/stile/halloween.imagistil", "studio/bausteine/stile/herbst.imagistil", "studio/bausteine/stile/hochzeit.imagistil", "studio/bausteine/stile/jubilaeum.imagistil", "studio/bausteine/stile/katalog.json", "studio/bausteine/stile/kommunion.imagistil", "studio/bausteine/stile/muttertag.imagistil", "studio/bausteine/stile/oktoberfest.imagistil", "studio/bausteine/stile/ostern.imagistil", "studio/bausteine/stile/party.imagistil", "studio/bausteine/stile/reisetagebuch.imagistil", "studio/bausteine/stile/silvester.imagistil", "studio/bausteine/stile/sommer.imagistil", "studio/bausteine/stile/taufe.imagistil", "studio/bausteine/stile/urlaub.imagistil", "studio/bausteine/stile/valentinstag.imagistil", "studio/bausteine/stile/vatertag.imagistil", "studio/bausteine/stile/winter.imagistil", "studio/bausteine/textfeld.css", "studio/bausteine/textfeld.js", "studio/bausteine/ueber.css", "studio/bausteine/ueber.js", "studio/bausteine/video-schnitt.js", "studio/bausteine/vorlagen.js", "studio/bausteine/zauberstab.js", "studio/bildbearbeitung.js", "studio/fassung.js", "studio/favicon.svg", "studio/fotos.js", "studio/icons/icon-192.png", "studio/icons/icon-512.png", "studio/icons/icon-maskable-192.png", "studio/icons/icon-maskable-512.png", "studio/icons/icon-maskable.svg", "studio/index.html", "studio/kihilfe.js", "studio/marke/zauber-auf-dunkel.png", "studio/marke/zauber-auf-hell.png", "studio/modell.js", "studio/paket.js", "studio/speicher.js", "studio/status.js", "studio/studio.css", "studio/studio.js", "studio/zip.js", "studio/"];
const LAGER = "imagicruise-app-" + VERSION;

self.addEventListener("install", e => {
  // Alle Dateien der App vorab holen; "reload" umgeht den Zwischenspeicher des Browsers
  e.waitUntil(caches.open(LAGER).then(c => c.addAll(DATEIEN.map(d => new Request(d, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("imagicruise-app-") && k !== LAGER) await caches.delete(k);
    await self.clients.claim();
  })());
});

// „Teilen“ aus der Galerie oder dem Dateimanager (share_target im Manifest): Android schickt die Dateien als Formular
// an …/geteilt. Sie werden hier kurz abgelegt; das Studio holt sie beim Start ab (studio.js, „geteilt“) und leert die Ablage.
const GETEILT = "imagicruise-geteilt";
async function geteiltAnnehmen(anfrage) {
  try {
    const dateien = (await anfrage.formData()).getAll("dateien").filter(d => d && typeof d !== "string");
    await caches.delete(GETEILT);
    const ablage = await caches.open(GETEILT);
    let n = 0;
    for (const d of dateien.slice(0, 200)) {
      await ablage.put("geteilt/" + n++, new Response(d, { headers: { "Content-Type": d.type || "application/octet-stream", "X-Name": encodeURIComponent(d.name || "datei") } }));
    }
  } catch (fehler) { /* dann kommt im Studio eben nichts an */ }
  return Response.redirect(new URL("studio/?geteilt=1", self.registration.scope).href, 303);
}

self.addEventListener("fetch", e => {
  const anfrage = e.request, url = new URL(anfrage.url);
  if (anfrage.method === "POST" && url.origin === location.origin && url.pathname.endsWith("/geteilt")) { e.respondWith(geteiltAnnehmen(anfrage)); return; }
  if (anfrage.method !== "GET" || url.origin !== location.origin) return;   // z. B. die Ortssuche: geht direkt ins Netz
  // Erst das Netz (immer der aktuelle Stand), ohne Netz die gespeicherte Fassung.
  e.respondWith((async () => {
    const lager = await caches.open(LAGER);
    try {
      const antwort = await fetch(anfrage);
      if (antwort.ok && !url.pathname.includes("/beispiel/")) lager.put(anfrage, antwort.clone());
      return antwort;
    } catch (fehler) {
      const gespeichert = await lager.match(anfrage, { ignoreSearch: true }) ||
        (anfrage.mode === "navigate" ? await lager.match(url.pathname.includes("/abspieler/") ? "abspieler/index.html" : "studio/index.html") : null);
      return gespeichert || Response.error();
    }
  })());
});
