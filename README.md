# MMRY Soundwalk Demo

A minimal, mobile-friendly prototype: a map centered on Ādaži, Latvia with a
few fixed "zones." Walk into a zone with your phone and an audio clip fades
in; walk out and it fades out. No backend, no database, no build step —
just static HTML/CSS/JS and Leaflet (loaded from a CDN).

There are two pages:

- **`index.html`** — the fixed demo. Zones hardcoded in `zones.js`. This is the
  pitch demo.
- **`builder.html`** — build your own journey. Drop checkpoints, attach audio
  from your phone, then walk it. Everything is stored on the device.

## Structure

- `index.html` / `app.js` — fixed demo
- `builder.html` / `builder.js` — journey builder
- `engine.js` — shared distance maths and audio playback
- `storage.js` — on-device journey storage (IndexedDB) plus export/import
- `zones.js` — **edit this** to set the fixed demo's coordinates and audio
- `style.css` — mobile-first styling for both pages
- `audio/` — audio files used by the fixed demo
- `vendor/leaflet/` — Leaflet, vendored rather than loaded from a CDN so the
  demo cannot be broken by someone else's downtime

## Using the journey builder

**Build mode** — tap the map to place a checkpoint, or press *Add at my
location*. Rename it, set its radius, and attach an audio file from your phone.
Drag a marker to move it.

**Walk mode** — tap *Walk*, then *Start walking*, and it behaves exactly like
the fixed demo.

Journeys are saved in the browser on that device. **They are not uploaded
anywhere and do not sync between devices** — clearing your browser data deletes
them. Use *Export* to save a journey as a file and *Import* to load it on
another device; that is the only sharing mechanism until there is a backend.

## Setting up your real zones

Open `zones.js` and edit the `ZONES` array. Each zone needs:

```js
{
  id: "zone-1",
  name: "Zone 1 — Placeholder",
  lat: 57.0730,
  lng: 24.3300,
  radius: 20,        // meters
  audio: "audio/zone-1.mp3",
  fadeMs: 1500,       // fade in/out duration
}
```

Add/remove entries for 3–4 zones total. Drop matching audio files into
`audio/`.

## Install it to your home screen

Open the site on your phone, then:

- **iPhone:** Share button → **Add to Home Screen**
- **Android:** menu → **Install app** / **Add to Home screen**

It then opens fullscreen with no browser chrome, which both looks like a real
app and films better. It also works offline once you have opened it — a service
worker caches the code, audio and map tiles, so a walk survives losing signal.

### Updates and caching

The service worker fetches code **network-first**, so a new deploy is live on
the next load. No private tabs, no clearing browser data.

The one exception is the very first load after this was introduced: the browser
may still be holding the older HTML from before there was a worker. Load it
once in a private tab (or pull-to-refresh), and every load after that updates
by itself.

Audio and map tiles are cached the other way round — cache-first, since they do
not change — which is what makes offline walking work. Bump `VERSION` in
`sw.js` to retire old caches.

## Testing on a phone — important

Browsers only allow `navigator.geolocation` on a **secure context**: either
`https://` or `localhost`. Opening `index.html` directly on your phone
(`file://`) or over plain `http://` on your laptop's LAN IP will **not**
prompt for location permission.

Easiest option — deploy as a static site:

1. Push this repo to GitHub (already done if you're reading this via the repo).
2. Enable **GitHub Pages** for the repo (Settings → Pages → deploy from branch).
3. Open the published `https://…github.io/...` URL on your phone.
4. Allow location permission when prompted, then walk toward one of your zones.

Alternatives: any static host (Netlify, Vercel, Cloudflare Pages) works the
same way — just drag-and-drop or connect the repo.

## Notes / current limitations (prototype scope)

- Zones are hardcoded in `zones.js` — no UI for adding/editing them.
- Each clip plays **once** per zone entry, then stops. Leaving and re-entering
  a zone restarts that clip from the beginning.
- Mobile browsers block audio that wasn't triggered by a tap, so the app opens
  on a "Start soundwalk" screen. Tapping it unlocks audio playback and begins
  location tracking — you must tap it before walking.
- Zone circles on the map turn orange while you're inside them; the pill at
  the top shows the currently active zone (or "No active zone").
- If multiple zones overlap, the indicator shows whichever was matched last
  in the array — fine for a demo, not meant to be robust for production.
