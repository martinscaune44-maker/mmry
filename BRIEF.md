# MMRY — project brief

A self-contained description of what MMRY is and how it works, written to be
pasted into another tool as context. No prior knowledge of the repo assumed.

---

## The idea in one line

**Music and sound tied to places.** You walk toward a spot on a map, and the
audio someone attached to that spot fades in. Walk away and it fades out.

## The experience

Someone stands where a sound belongs — a bench, a bridge, the corner where
something happened — and records audio there: a story, a song, ambience, a
joke. They mark that exact spot on a map with a trigger radius of about twenty
metres, then publish the result as a link.

They send the link to someone else. That person opens it on a phone, puts on
headphones and walks. Nothing plays until they physically arrive at a marked
spot. Then it starts, on its own, and fades out as they leave.

No pressing play. Arriving *is* pressing play.

## Why it might matter

Three different products share this one mechanism, distinguished only by who
makes the content and who pays:

1. **A walk made for someone you know.** You build a route through your town
   for a friend, with commentary that can be funny, rude or personal. Every
   existing audio-tour product is earnest — reverent museum narration. Nobody
   occupies the informal register.
2. **Institutional guides.** Museums, cities and festivals commission walks.
   This is where budgets exist.
3. **A time capsule.** Leave a recording at a place, sealed until a date years
   away. Best story of the three, hardest promise to keep.

The intended order is 1 → 2 → 3. The first creates supply and has distribution
built in: every walk arrives as a message from someone you know, rather than
needing to be discovered in a catalogue.

**The cautionary precedent is Detour** — Andrew Mason's audio walking-tour
startup, 2015–2018, sold to Bose. It was well made and self-funded, and it
died of discovery: it ranked in the 400s–700s of the App Store's travel
category, so nobody found it. A link from a friend is a fundamentally different
distribution model from a catalogue a stranger must go looking for.

---

## How it works technically

### Core mechanism

1. Each checkpoint stores a latitude, longitude, trigger radius in metres, a
   fade duration, and an audio file.
2. While walking, the app watches the device's GPS position continuously.
3. On every position update it computes the great-circle distance to each
   checkpoint.
4. Crossing inside the radius fades that clip in; crossing outside fades it
   out. Each clip plays once per entry and rewinds when it ends.

That is the whole product. Everything else is authoring, sharing and polish.

### Stack

- **Plain HTML, CSS and JavaScript.** No framework, no build step, no bundler.
- **Leaflet** for maps, with CARTO Voyager raster tiles. Vendored into the repo
  rather than loaded from a CDN, so nobody else's outage can break a demo.
- **Supabase** (free tier) for the database and audio storage.
- **Hosted on GitHub Pages** as a static site.
- **A service worker** makes it installable to a home screen and work offline:
  code is fetched network-first so a deploy is never stale, while audio and map
  tiles are cache-first so a walk survives losing signal.

### Pages

| Page | Purpose |
|---|---|
| `index.html` | Fixed demo with hardcoded zones |
| `builder.html` | Build a journey: place checkpoints, record audio, publish |
| `walk.html?j=<id>` | What a recipient opens — walking only, no editing |
| `account.html` | Sign in, and the walks you have published |

### Recording

Audio is captured in the browser with `MediaRecorder`, so a walk can be built
entirely on a phone while standing at the place. Several things about this are
non-obvious and were learned the hard way:

- Leaving **any** of echo cancellation, noise suppression or auto gain control
  enabled routes capture through the browser's voice-call pipeline, which
  downsamples to roughly 16 kHz mono. All three must be off for music.
- Asking a **mono** laptop microphone for two channels yields the signal in the
  left channel and silence in the right.
- Windows switches the microphone into communications mode when playback and
  capture are open simultaneously, degrading the recording mid-stream. Pausing
  an `<audio>` element does **not** release the output device — the source must
  be detached — and an open `AudioContext` counts as output too.
- With auto gain off, levels come back quiet, so each clip's peak is measured
  and a normalisation boost is stored and applied at playback rather than
  re-encoding the file.

### Playback

Clips are routed through Web Audio gain nodes rather than setting
`HTMLMediaElement.volume`, because **iOS ignores volume writes entirely** —
it treats output level as hardware-controlled. Fades are ramps on those gain
nodes.

Mobile browsers also refuse to play audio not initiated by a user gesture, so
the app opens on a "start" screen whose tap silently primes every clip.

### Sharing and accounts

Publishing uploads the audio to Supabase storage and writes a row with an
unguessable id. **The link is the credential** for anyone opening a walk, and
always will be: it arrives from a friend who has no reason to sign up.

Accounts sit on top of that and are optional — building, recording and
publishing all work signed out. Signing in makes a walk yours, so it can be
found again, retagged, hidden or deleted. Visibility has three states rather
than two: private (only its owner), unlisted (anyone with the link — the
default) and public (listed once discovery exists). A two-state toggle would
have made every walk you *sent* unopenable.

Access is decided by Postgres row-level security rather than by any check in
the client, since anyone can call the REST endpoint directly. The read policy
hides a private row instead of refusing it, so the existence of somebody's
private walk never leaks — which means "private" and "deleted" are
indistinguishable from outside, and the app says so rather than guessing.

### Known limits

- **A browser cannot track location with the screen off.** iOS gives web pages
  no background geolocation at all. The app holds a screen wake lock during a
  walk, which is the best a web page can do. Genuine phone-in-pocket triggering
  requires a native app using OS geofencing.
- GPS is accurate to roughly 5–15 m, so a 20 m radius is near the practical
  minimum. Poor accuracy is surfaced to the walker rather than left mysterious.
- Audio is heavy: a four-minute track at 256 kbps is about 8 MB. Uploads are
  capped at 10 MB.

### Native app

An Expo (React Native) app exists in `app/`, sharing the distance maths and the
enter/exit state machine with the web version. It runs, but has none of the
recording or sharing added later. Cross-platform was chosen over native
Swift/Kotlin because the logic is JavaScript already and nothing here needs
native performance. Its one irreducible advantage is OS geofencing — triggering
with the phone pocketed and the screen off, which no browser can do.

---

## What is not built yet

- Profiles — a display name others see. Nothing reads one until discovery
  exists, so it cannot be designed properly yet
- Editing a published walk's checkpoints. Visibility, tags and deletion are
  owner-controlled; the audio and coordinates are still write-once
- Sign in with Apple. Written, but it needs a Services ID and therefore the
  paid Apple Developer Program
- Searching for walks by area, deliberately sequenced last: an empty discovery
  map demos worse than none at all, and browsing is precisely the model that
  sank Detour
- Moderation, which becomes necessary the moment strangers can find walks
- Photos alongside audio
