# MMRY — product notes and roadmap

Working notes, not a spec. Written alongside the prototype in this repo.
Everything marked **Decision needed** is unresolved.

Pitch deck structure lives separately in [`PITCH.md`](PITCH.md).

---

## 1. Where things stand today

Two pages are deployed from this repo:

- **Fixed demo** — `/` — two real zones with real tracks. The pitch demo.
- **Journey builder** — `/builder.html` — place your own checkpoints, attach
  your own audio, walk it, then publish it to a link.
- **Shared walk** — `/walk.html?j=<id>` — what a recipient opens. Walking only,
  no builder.

Both the web pages and the native app share one visual language (tokens in
`style.css` and `app/src/theme.js`). A **distance readout** shows how far the
nearest checkpoint is while outside one — practical when walking, and it makes
a filmed demo legible, because a viewer watches the number fall and then hears
the sound start.

What is proven **on real hardware, walked in the field**:

- Live GPS tracking in a mobile browser
- Zone entry triggers the right audio clip
- Zone exit fades it out
- Handoff from one zone to the next works
- Runs on iPhone

What is only proven **in a headless browser** — works, but no human has walked
it yet:

- The journey builder: placing checkpoints, attaching audio, walking your own
- Publishing and opening a shared link. The Supabase endpoints were exercised
  directly and the browser flow against a mocked backend; the two halves have
  not yet met on a real phone.

Cost so far: nothing but time. Supabase's free tier carries the sharing
backend; there are still no accounts and no hosting bill.

**What this prototype cannot do** — and these shape everything below:

- **No background operation.** The browser tab must be open and the screen
  awake. Pocket the phone and tracking stops. iOS will not give background
  geolocation to a web page at all. This is a hard platform limit, not a bug.
- ~~No offline support.~~ **Solved.** A service worker caches code, audio and
  map tiles, so a walk survives losing signal. The site is also installable to a
  home screen and opens fullscreen without browser chrome.
- **Battery drain.** Continuous high-accuracy GPS is expensive.
- ~~No sharing or sync.~~ **Solved on the web.** Journeys publish to a link
  anyone can walk. Journeys still being built remain device-local until
  published, and the native app has no sharing yet.
- **Browser storage is not durable.** iOS can evict a site's stored data after
  a period without visits. Fine for demos; fatal for anything promising to
  keep a memory safe. This is why the time capsule cannot be device-local.

These are why a serious version eventually needs a native app and a backend.

---

## 2. The core idea

Three product concepts came up. They are **not three products** — they are one
engine serving three markets. The geo-triggered playback and the authoring
tool are identical in all three. Only the content and the payer change.

| | Who makes the content | Who pays | Hardest problem |
|---|---|---|---|
| **Time capsule** | You, for your future self | The creator, upfront | Trust over decades |
| **Friend's walk** | You, for someone you know | Nobody, directly | Monetisation |
| **Guided tour** | Institutions or known figures | Museums, cities, festivals | Sales cycle |

This framing is the pitch. Presenting three separate ideas reads as
unfocused; presenting one engine with a sequenced expansion reads as strategy.

---

## 3. Sequencing, and why

**Build the friend's walk first.** Cheapest, no rights negotiations, no
long-term promises. And it carries the actual differentiator: every existing
audio-tour product is *earnest* — reverent museum voice. Nobody is doing funny.
A friend saying "here's the giant forehead of some guy who died" is a tone no
competitor occupies.

**Monetise through institutions second.** Identical authoring tool, sold to
museums, cities, festivals. This is where budgets exist. Having built the
consumer tool first means this launch costs almost nothing extra.

**Time capsule last, as the halo product.** Best story of the three, and the
hardest promise to keep — it needs a company that looks like it will still be
here. Save it for when that is true.

---

## 4. Roadmap

### Phase 0 — Prototype ✅ done

Fixed zones, hardcoded, walked and verified. This is enough to demo the core
experience in a pitch today.

### Phase 1 — Journey builder, no backend ✅ built, not yet field-tested

All of it shipped: checkpoints placed by map tap or GPS, draggable markers,
per-checkpoint name and radius, audio attached from local files, saved to
IndexedDB, build/walk mode toggle, export and import as a file.

Still free to run. Still no accounts. Enough to demo all three concepts on
stage, since a capsule, a friend's walk and a museum tour are the same thing
with different content in them.

**Outstanding:** nobody has walked a self-built journey on a real phone. That
is the next thing to do and it costs nothing.

Leaflet is vendored into `vendor/` rather than loaded from a CDN — a map
library failing to load mid-pitch would take the whole demo down.

### Phase 2 — Sharing ✅ links working; accounts and discovery still open

**Backend: Supabase** (free tier, EU/Ireland). Schema in `supabase/schema.sql`.

Done: audio uploads to storage, journeys publish to an unguessable id, the
builder hands back a link, and recipients land on `walk.html?j=<id>` — a walk
page with no builder UI. Published audio is cached by the service worker, so a
shared walk survives losing signal too.

**No accounts yet, deliberately.** The link is the credential. Nothing can edit
or delete a published journey, so republishing mints a new link. That trade
buys link sharing without an auth system; it costs orphaned rows and means a
walk cannot be corrected after sending. Accounts earn their place when editing
matters, or when someone wants to see everything they have made.

**Recording happens in the app.** Tap *Record here* at a checkpoint and capture
sound on the spot — no Files app, no picking a track made elsewhere. This came
from watching the alternative fail: with only a file picker, iOS offers the
camera, and filming a video for its audio track is an easy mistake to make.
Worth remembering as a product point rather than a feature: *stand where it
happened and record it* is the actual creative loop, and it is what the
time-capsule and friend's-walk framings both depend on.

Still open:

1. User accounts and editing published journeys
2. Photos as well as audio
3. **Discovery — browse walks by area.** Deliberately last, see below.
4. Moderation — user-uploaded audio at public coordinates will eventually
   need it

**On discovery.** A browsable catalogue of walks is exactly what Detour was,
and exactly what sank it (section 7). It is also a bad demo before there is
supply: an empty discovery map reads as a ghost town, whereas a single link
from a friend reads as alive. Links create the supply; discovery is then a
query over the same rows, not a different product.

**Costs:** storage and bandwidth grow with users. Files are capped at 10 MB,
which the current 8 MB track only just clears. Transcoding uploads to ~128kbps
would roughly halve that with no audible difference outdoors — worth doing
before real users arrive.

### Web and native: how they relate

**The web version is already cross-platform.** It runs on iPhone, Android and
desktop, installs to a home screen, opens fullscreen without browser chrome,
and works offline. Most people would not know it is not a native app.

**Its one irreducible limit is background operation.** A browser cannot trigger
with the phone pocketed and the screen off. Everything else a native app would
buy — install, offline, recording, maps, audio, sharing — the web already does.

**The native app is currently behind.** It has the map, builder, walking and
local storage; it has none of the recording, publishing or sharing added later.
Closing that gap is real work, and every future feature then has to be built
twice.

**Do not treat this as either/or.** Strava has a website and an app, and
neither is the lesser version — they are different front doors. Same here:

- **Web** is the front door. A link that works with no install is a genuine
  advantage, and precisely the friction Detour died of. Someone taps a walk in
  a chat and is walking it in ten seconds.
- **App** is for people who walk often enough to want it on their home screen —
  and for the credibility an App Store listing carries, which is a real
  consideration in a pitch even though it is not a technical one.

**Decision: cross-platform, via React Native and Expo.** Not native
Swift/Kotlin.

Reasons, in order of weight:

1. **The code already exists and already runs.** `app/` is scaffolded and has
   launched on a real iPhone.
2. **It is JavaScript**, the same language as the web version, so the logic
   carries over — the distance maths and enter/exit state machine are already
   shared, not reimplemented.
3. **One codebase covers both platforms.** Android testing is nearly free,
   which matters given background triggering costs $99/year to test on iOS.
4. **Nothing here needs native performance.** This is a map, a GPS listener and
   an audio player. Flutter is a fine tool, but Dart is a new language and
   nothing built so far would carry across.

**Do not start until phone-in-pocket is the thing being asked for.** The
signal to watch for: someone walks a real journey and says they had to keep
looking at their phone. That is when the $99 and the porting work start
earning their keep.

### Phase 3 — Native app ✅ Stage A working, walked and verified

Expo app lives in [`app/`](app/). Map, journey builder, zone-triggered audio
with fades — the web prototype's behaviour, natively.

**Split into two stages so the money comes late:**

- **Stage A, free:** runs in Expo Go today. Everything works except background
  triggering. Needs Node and a free Expo account, nothing more.
- **Stage B, $99/year:** a development build unlocks OS geofencing — triggering
  with the phone pocketed and the screen off, plus far better battery.

`src/location/index.js` is the only file that knows which strategy is active.
It tries geofencing and falls back to foreground polling, so **Stage B is a
build command, not a rewrite**. The background config in `app.json` is already
written and simply inert until then.

**Status:** Stage A works end to end on an iPhone 12 mini (iOS 26.5) — building
a journey, attaching audio, walking it, audio fading in and out. Crashed on
first load and worked on retry; unexplained, probably the initial bundle
compile timing out, but capture the error if it recurs.

**Not usable for pitching yet.** Expo Go loads the app from a laptop running
`npx expo start` on the same WiFi. In a pitch room that means carrying a laptop
and hoping for a network — the web demo, which is just a link, is strictly
better until a standalone build exists (Stage B, or TestFlight).

**The SDK number is the thing that matters.** Expo Go only runs projects built
for the exact SDK it supports, and that number is printed in the app itself
(Settings → App Info → Supported SDK). It is not npm's `latest`, and not what
the App Store advertises — this device sat on SDK 54 while the store claimed to
ship 57. Getting this wrong costs an hour and produces a misleading error
telling you to update an app that is already current.

Known gaps are listed in `app/README.md`; the significant one is that audio
after a cold background launch is unfinished.

Triggered by the platform limits in section 1, not by ambition. Needed for:

- Triggering with the phone in a pocket, screen off
- Offline caching of audio before a walk
- Sane battery management
- Push notifications when near a journey

**Decision needed:** React Native / Flutter (one codebase, both platforms) vs
native Swift/Kotlin. Cross-platform is almost certainly right at this stage.

This is the point where the product becomes something people can use on a real
walk rather than a demo they hold in their hand.

**What it actually costs to start:**

- **Apple Developer Program, $99/year.** Unavoidable for putting an app on an
  iPhone in any lasting way. This is the real gate.
- **Google Play, $25 one-time** — and Android needs no account at all just to
  install a build on your own device. Testing background location on Android
  is nearly free. *No Android device available, so this route is closed for
  now.*
- **Expo** is the sensible path: one codebase, cloud builds so no Mac is
  required, install by scanning a QR code. Background location needs a
  development build rather than the simpler Expo Go app — which is exactly
  where the Apple account becomes necessary.
- **App Store review** takes days to weeks, and background location draws
  extra scrutiny. Apple wants a written justification for tracking with the
  screen off.

The fiddly logic — distance maths, the enter/exit state machine, the fade
behaviour, the iOS audio quirks — is already solved and ports over.

### Phase 4 — Institutional sales

The same product, sold rather than posted.

1. Pick one lighthouse customer — a Latvian museum, Ādaži municipality, a
   festival
2. Build one walk for them, possibly free, in exchange for a case study
3. Add the boring features institutions require: analytics, multi-language,
   branded appearance, content ownership guarantees
4. Sell the second one for money

**Start local.** A well-known Latvian musician or writer guiding a Riga walk
is a conversation that can happen this year. A global celebrity is not, and
investors find the achievable version more credible.

### Phase 5 — Time capsule

1. Seal a journey with an unlock date
2. **Offer short locks — 1 year, 5 years — not only 20.** A 20-year-only
   product has no evidence it works for two decades. One-year locks produce
   real unlocks, real reactions, and real word of mouth inside year one.
3. Let people export their sealed capsule as a file they own, in an open
   format. If the company dies, the memory does not. This is the honest
   answer to the trust problem.
4. Charge once, at sealing, for storage

---

## 5. What to do next

In order. Cheapest and most informative first.

**Free, this week:**

1. **Walk a journey you built yourself.** Two checkpoints, your own audio, ten
   minutes. It is the exact flow you would demo, and the only part of the build
   nobody has tested.
2. **Record a screen-capture video of a real walk.** Map moving, circle turning
   orange, audio coming in. Two minutes. This product cannot be demonstrated
   sitting down, and you will be pitching in a room — the video is the only
   thing that solves that. Highest-value item on this list.
3. **Make one track on location.** Compose it where you stand, put it in the
   app. Gives the strongest line available: *"this song did not exist before I
   stood here"* — then hand someone the phone in that place.
4. **Read the Detour section** (section 7). Ten minutes. You will be asked
   about it, and the answer is written out there.

**A decision only you can make:**

5. **Pick which flavour leads the pitch** — capsule, friend's walk, or
   institutional. All three can exist; the pitch needs one at the front and a
   reason for the order.

**Costs money, so last:**

6. **Decide whether to build the native app.** Skip while still pitching the
   concept — the web demo carries that. Spend the $99 when the question becomes
   whether MMRY is good to *use*, because phone-in-pocket is the only honest
   test and no browser can do it.

---

## 6. Open questions

- Which flavour leads the pitch?
- Free, paid, or freemium — and if paid, does the creator or the walker pay?
- Do journeys default public or private?
- What happens when someone places audio at a location they do not own, or
  somewhere private?
- Is this a Latvia-first product or an international one from day one?

---

## 7. Precedents worth knowing

### Detour — the one to actually understand

The single most relevant precedent. Expect to be asked about it. Verified
details, since the summary version gets it wrong:

- Founded by **Andrew Mason** after he was ousted from Groupon. Launched in
  San Francisco in **2015**. GPS-triggered narrated walking tours — functionally
  the same core mechanic as this repo.
- **Self-funded by Mason personally**, not venture-backed. This matters: it was
  not a case of burning someone else's money badly.
- Genuinely well made. Group sync so several people could walk in step.
  Roughly **120 tours** by the end — San Francisco, Austin, NYC, London, Paris,
  Berlin — sold as individual in-app purchases.
- **What killed it was discovery.** It ranked in the **400s–700s of the App
  Store's Travel category** — TechCrunch called it "practically invisible." Not
  a bad product. A good one nobody encountered.
- **It did pivot to institutions.** *Detour Platform* launched 2016: white-label
  creation tools for third parties, first partner **SFMOMA**, using WiFi indoor
  positioning inside the museum. The same idea as Phase 4 here. It was found,
  but not early enough or not big enough.
- **Bose acquired it in April 2018 — software and tour content only, not the
  team.** The app was pulled on 31 May 2018. Bose wanted it for their audio AR
  platform (the sensor-equipped Frames glasses). Note the buyer was a *hardware*
  company shopping for spatial audio content.
- **The twist:** the internal audio-editing tooling built to produce the tours
  spun out as **Descript**, raised $5M from Andreessen Horowitz, and became far
  bigger than Detour ever was. The byproduct beat the product. Audio
  *production* turned out to be a larger problem than audio *delivery*.

**The objection this creates:** "Detour did this, better executed, and died."

**The answer:** Detour's fatal flaw was distribution — a stranger had to go
looking for a walking tour app and somehow find them. The friend's-walk model
has distribution built into the product: every journey created arrives with at
least one person personally motivated to install it, because someone they know
made it for them. That is not a growth tactic bolted on afterwards; it is the
shape of the thing. Detour was a catalogue you had to discover.

**Second difference:** Detour's content was professionally produced, so 120
tours cost enormous effort. User-generated content is nearly free to scale, at
the price of variable quality. A different and cheaper problem.

**The real thing to worry about:** Descript's lesson. If making good geo-audio
turns out to be harder than playing it back, the value may sit in the creation
tools rather than the map.

Sources: [TechCrunch](https://techcrunch.com/2018/04/24/bose-acquires-andrew-masons-walking-tour-startup-detour),
[Detour Platform / SFMOMA](https://www.prnewswire.com/news-releases/detour-launches-platform-for-museums-and-other-content-creators-partners-with-sfmoma-300261645.html),
[Fast Company](https://www.fastcompany.com/3047327/detour-the-walking-tour-audio-app-rolls-out-stories-in-6-new-cities),
[Hacker News on the shutdown](https://news.ycombinator.com/item?id=16908409)

### Others

**VoiceMap, izi.TRAVEL** — existing audio walking tour platforms, surviving
largely on institutional customers. Same conclusion from a different angle.

**Bluebrain** — released location-aware albums as iPhone apps around 2011.
Evidence the idea has been circling for over a decade without anyone owning it.

**Kanye's Stem Player** (with Kano) — proof a dedicated single-album device can
sell in real volume, if the hardware idea ever returns. Verify the reported
sales figures before quoting them anywhere.

**Playbutton** — albums as wearable button players, early 2010s. Same instinct
as the hardware idea. Did not survive.

**Naming:** "Soundwalk Collective" is an established act that has worked with
Patti Smith. Not a blocker — *soundwalk* is a generic term — but worth knowing
before committing to it in branding.

---

## 8. Shelved: the hardware album

A limited-edition player shipping with an album recorded on location, each
track geotagged where it was made.

Strongest version: plays anywhere, but does something extra if the listener is
ever at the place where it was made. A location-locked album is unusable for
almost every buyer.

Nice mechanic if it ever returns: the device records where each *owner*
listened, so the album accumulates its own map over time. A limited edition
that keeps developing after purchase.

Shelved because a 100–1,000 unit run with a screen, Bluetooth and a headphone
jack is a real manufacturing project — tooling, certification, capital — and it
should be the last thing built, not the first.
