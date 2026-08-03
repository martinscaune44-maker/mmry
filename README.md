# MMRY Soundwalk Demo

A minimal, mobile-friendly prototype: a map centered on Ādaži, Latvia with a
few fixed "zones." Walk into a zone with your phone and an audio clip fades
in; walk out and it fades out. No backend, no database, no build step —
just static HTML/CSS/JS and Leaflet (loaded from a CDN).

## Structure

- `index.html` — page shell (map + zone indicator)
- `style.css` — minimal mobile-first styling
- `zones.js` — **edit this** to set your real zone coordinates, radius, and audio files
- `app.js` — map, geolocation tracking, distance/zone logic, audio fade
- `audio/` — put your narration/music files here

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
- Audio autoplay requires a user gesture on some browsers/OSes; if a clip
  doesn't start on first zone entry, a tap anywhere on the page before
  walking in usually unlocks audio playback for the session.
- Zone circles on the map turn orange while you're inside them; the pill at
  the top shows the currently active zone (or "No active zone").
- If multiple zones overlap, the indicator shows whichever was matched last
  in the array — fine for a demo, not meant to be robust for production.
