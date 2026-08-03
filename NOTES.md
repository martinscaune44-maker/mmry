# MMRY — product notes and roadmap

Working notes, not a spec. Written alongside the prototype in this repo.
Everything marked **Decision needed** is unresolved.

---

## 1. Where things stand today

A working prototype lives in this repo and is deployed at
`https://martinscaune44-maker.github.io/mmry/`.

What is proven, on real hardware, walked in the field:

- Live GPS tracking in a mobile browser
- Zone entry triggers the right audio clip
- Zone exit fades it out
- Handoff from one zone to the next works
- Runs on iPhone

Two real zones are configured, each with its own track. Cost so far: nothing
but time. No backend, no database, no accounts, no hosting bill.

**What this prototype cannot do** — and these shape everything below:

- **No background operation.** The browser tab must be open and the screen
  awake. Pocket the phone and tracking stops. iOS will not give background
  geolocation to a web page at all. This is a hard platform limit, not a bug.
- **No offline support.** Audio is fetched over the network. Poor signal on a
  walk means no sound.
- **Battery drain.** Continuous high-accuracy GPS is expensive.
- **Nothing is user-created.** Zones are hardcoded in `zones.js`.

The first three are why a serious version eventually needs a native app. The
fourth is the next thing to build.

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

### Phase 1 — Journey builder, no backend

Goal: a person can build their own walk without anyone's help.

1. Map screen with an "add checkpoint" mode — tap the map, or drop a pin at
   current location
2. Attach audio per checkpoint from the phone's own files
3. Name each checkpoint, set its radius
4. Save to browser storage (IndexedDB) so it survives closing the tab
5. Switch between "build" and "walk" modes
6. Export a journey to a file, import from a file — crude sharing, no server

Still free to run. Still no accounts. Enough to demo all three concepts on
stage, since a capsule, a friend's walk and a museum tour are the same thing
with different content in them.

**Rough effort:** comparable to what has been built so far.

### Phase 2 — Accounts, storage, real sharing

This is where it stops being free, and where the engineering gets real.

1. **Decision needed:** backend platform. Supabase or Firebase are the
   sensible defaults — both give database, file storage and auth without
   running servers.
2. User accounts
3. Upload audio and photos to cloud storage
4. Share a journey by link
5. Browse and walk journeys made by others
6. Basic moderation — user-uploaded audio at public coordinates will
   eventually need it

**New costs:** storage and bandwidth, growing with users. Audio is heavy —
the two current tracks are 8MB and 6.5MB.

**Decision needed:** cap file sizes, or transcode uploads down. A 4-minute
track at 256kbps is ~8MB; at 128kbps it is half that, with little audible
difference outdoors.

### Phase 3 — Native app

Triggered by the platform limits in section 1, not by ambition. Needed for:

- Triggering with the phone in a pocket, screen off
- Offline caching of audio before a walk
- Sane battery management
- Push notifications when near a journey

**Decision needed:** React Native / Flutter (one codebase, both platforms) vs
native Swift/Kotlin. Cross-platform is almost certainly right at this stage.

This is the point where the product becomes something people can use on a real
walk rather than a demo they hold in their hand.

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

## 5. Open questions

- Which flavour leads the pitch?
- Free, paid, or freemium — and if paid, does the creator or the walker pay?
- Do journeys default public or private?
- What happens when someone places audio at a location they do not own, or
  somewhere private?
- Is this a Latvia-first product or an international one from day one?

---

## 6. Precedents worth knowing

**Detour** — Andrew Mason's post-Groupon startup, location-triggered audio
walking tours, well funded and well made. Struggled as a consumer product,
pivoted toward licensing to cities and museums, sold to Bose around 2018. The
single most relevant precedent here. Its lesson: the consumer version was hard,
the institutional version had the value. Expect to be asked about it.

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

## 7. Shelved: the hardware album

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
