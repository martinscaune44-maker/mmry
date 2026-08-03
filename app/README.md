# MMRY — native app

Expo app. Same idea as the web prototype in the parent folder, but native, so
it can eventually trigger with the phone in a pocket and the screen off.

The web version stays as it is. A link that needs no install is genuinely
useful when pitching — keep both.

## Stage A — run it free, today

No Apple account needed.

1. Install [Node](https://nodejs.org) on your laptop (LTS version).
2. Install **Expo Go** on your iPhone from the App Store.
3. In a terminal:

   ```
   cd app
   npm install
   npx expo install --fix
   npx expo start
   ```

4. Scan the QR code with your iPhone camera. The app opens in Expo Go.

`npx expo install --fix` reconciles package versions with the installed SDK.
Run it first if anything looks wrong — the versions pinned in `package.json`
were written by hand and may drift.

**What works in Stage A:** the map, building journeys, attaching audio, and
zone triggering while the app is open and the screen is on.

**What does not:** background triggering. Expo Go cannot do geofencing, so the
app automatically falls back to foreground polling. The walk screen tells you
which mode you got.

## Stage B — background triggering

Needs the **Apple Developer Program, $99/year**. Enrolment approval usually
takes 24–48 hours, so start it before you need it.

```
npm install -g eas-cli
eas login
eas build --profile development --platform ios
```

Install the resulting build on your phone, then run `npx expo start` as before.
The app will now find geofencing available and use it — with no code change.
Grant **Always** location permission when asked, or it will fall back again.

## How the Stage A → Stage B seam works

`src/location/index.js` is the only file that knows which strategy is in use.
It tries geofencing, and falls back to foreground polling if that throws. Both
implementations emit the same events — `onEnter`, `onExit`, `onActiveChange` —
so nothing above them changes between stages.

- `src/location/foreground.js` — `watchPositionAsync`, works everywhere
- `src/location/geofence.js` — `startGeofencingAsync`, needs a dev build

The background config in `app.json` (background modes, permission strings) is
already written. Expo Go ignores it; the development build uses it.

## Layout

```
App.js                     shell, build/walk toggle, journey persistence
src/engine/geo.js          distance maths — ported from the web version
src/engine/zoneTracker.js  enter/exit state machine (foreground only)
src/engine/audio.js        playback and fades
src/location/              the strategy seam described above
src/storage/journeys.js    journey persistence
src/screens/               build and walk screens
```

## Known gaps

- **Audio from a cold background launch is unfinished.** Geofencing will wake
  the app when a region is crossed, but if iOS relaunched it from terminated,
  the audio session and clips are not restored. Needs work before background
  triggering is genuinely reliable.
- **iOS monitors at most 20 regions per app.** `MAX_REGIONS` in
  `geofence.js` registers only the nearest ones. Journeys longer than that
  need re-registration as the listener moves — not yet implemented.
- **Audio files live in the cache directory**, so the OS may evict them under
  storage pressure. Durable storage belongs in the Phase 2 backend.
- **No sharing.** Same as the web version: one journey, one device.
- **None of this has run on a real phone yet.** It is written against the
  documented SDK 57 APIs but has not been executed.
