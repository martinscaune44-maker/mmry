// ---------------------------------------------------------------------------
// MMRY — shared engine
//
// Geo maths and audio playback, used by both the fixed demo (app.js) and the
// journey builder (builder.js). No DOM assumptions live in here.
// ---------------------------------------------------------------------------

const MmryGeo = {
  // Great-circle distance in meters.
  distance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },
};

// ---------------------------------------------------------------------------
// Audio
//
// iOS ignores writes to HTMLMediaElement.volume — output level is treated as
// hardware-controlled. Every clip is therefore routed through a Web Audio gain
// node, which iOS does honour, and all fading happens on that gain.
//
// setup() must be called from inside a user gesture, and must be given every
// clip up front: createMediaElementSource can only be called once per element.
// ---------------------------------------------------------------------------

const MmryAudio = {
  ctx: null,
  tracks: {},

  // sources: [{ id, src, gain, mono }] — gain normalises a quiet recording,
  // since capture runs with auto gain off and hands back whatever level it
  // likes; mono folds a clip whose signal sits in one channel back to centre.
  setup(sources) {
    if (this.ctx) this.teardown();

    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();

    sources.forEach(({ id, src, gain: boost, mono }) => {
      const audio = new Audio(src);
      audio.loop = false;
      // Fetched ahead of time: clips can be several MB, and downloading on
      // arrival would delay playback over mobile data.
      audio.preload = "auto";
      audio.crossOrigin = "anonymous";

      // Clips play once. Rewind when finished so re-entering a zone restarts it.
      audio.addEventListener("ended", () => {
        audio.currentTime = 0;
      });

      const node = this.ctx.createMediaElementSource(audio);
      const gain = this.ctx.createGain();
      gain.gain.value = 0;

      if (mono) {
        // Some laptop microphones report stereo while feeding only the left
        // channel, so the recording plays entirely in one ear. Forcing the
        // graph through a single channel folds it back to centre; the
        // destination then spreads that mono across both speakers.
        const fold = this.ctx.createGain();
        fold.channelCount = 1;
        fold.channelCountMode = "explicit";
        fold.channelInterpretation = "speakers";
        node.connect(fold);
        fold.connect(gain);
      } else {
        node.connect(gain);
      }

      gain.connect(this.ctx.destination);

      this.tracks[id] = {
        audio,
        gain,
        boost: Number.isFinite(boost) && boost > 0 ? boost : 1,
        desiredPlaying: false,
        stopTimer: null,
      };
    });
  },

  // Contexts are created suspended; only a user gesture can resume them.
  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },

  // Mobile browsers refuse to play audio not initiated by a user gesture.
  // Briefly starting every clip inside the gesture unlocks them for later.
  // Gains are at zero, so this is silent.
  primeAll() {
    Object.values(this.tracks).forEach((track) => {
      track.audio
        .play()
        .then(() => {
          // A zone may have started real playback before this resolved — only
          // pause clips nothing is actually asking to hear.
          if (!track.desiredPlaying) {
            track.audio.pause();
            track.audio.currentTime = 0;
          }
        })
        .catch(() => {
          /* Missing or not yet loadable — it will retry on zone entry. */
        });
    });
  },

  fade(id, targetVolume, durationMs) {
    const track = this.tracks[id];
    if (!track || !this.ctx) return;

    const now = this.ctx.currentTime;
    const level = targetVolume * track.boost;
    track.gain.gain.cancelScheduledValues(now);
    track.gain.gain.setValueAtTime(track.gain.gain.value, now);
    track.gain.gain.linearRampToValueAtTime(level, now + durationMs / 1000);

    if (track.stopTimer) {
      clearTimeout(track.stopTimer);
      track.stopTimer = null;
    }

    if (targetVolume > 0) {
      track.desiredPlaying = true;
      if (track.audio.paused) {
        track.audio.play().catch((err) => {
          console.warn(`Could not play clip ${id}:`, err);
        });
      }
    } else {
      // Let the fade finish before pausing, and re-check in case the listener
      // stepped back into the zone while it was still fading out.
      track.desiredPlaying = false;
      track.stopTimer = setTimeout(() => {
        if (!track.desiredPlaying) {
          track.audio.pause();
          track.audio.currentTime = 0;
        }
        track.stopTimer = null;
      }, durationMs);
    }
  },

  teardown() {
    Object.values(this.tracks).forEach((track) => {
      if (track.stopTimer) clearTimeout(track.stopTimer);
      track.audio.pause();
      track.audio.src = "";
    });
    this.tracks = {};
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  },
};

// ---------------------------------------------------------------------------
// Location errors
//
// A blocked permission is the most common failure and the one browsers describe
// least usefully — so name the setting rather than just reporting failure.
// ---------------------------------------------------------------------------

function mmryExplainLocationError(err) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isChromeOnIOS = /CriOS/.test(navigator.userAgent);

  if (err && err.code === err.PERMISSION_DENIED) {
    if (isIOS && isChromeOnIOS) {
      return (
        "Chrome can't see your location. Open iOS Settings \u2192 Chrome \u2192 " +
        "Location and choose \u201cWhile Using the App\u201d, then reload this page."
      );
    }
    if (isIOS) {
      return (
        "Location is blocked. Tap \u201caA\u201d in the address bar \u2192 " +
        "Website Settings \u2192 Location \u2192 Allow, then reload."
      );
    }
    return "Location permission was denied. Allow it in your browser's site settings, then reload.";
  }

  return "Couldn't get a location fix. Step outside or wait a few seconds, then try again.";
}

// ---------------------------------------------------------------------------
// Tile prefetching
//
// Leaflet keeps a ring of tiles around the viewport, which covers panning, but
// it holds nothing for the zoom levels either side — so every zoom starts from
// blank squares. This quietly requests the tiles one level in and one level out
// once the map settles, so they are already in the browser (and the service
// worker) cache by the time they are needed.
// ---------------------------------------------------------------------------

const MmryTiles = {
  // Slippy-map tile coordinates, the same scheme every raster basemap uses.
  xFor(lng, zoom) {
    return Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
  },

  yFor(lat, zoom) {
    const rad = (lat * Math.PI) / 180;
    return Math.floor(
      ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
        Math.pow(2, zoom)
    );
  },

  // Requesting the whole world at zoom+1 would be thousands of tiles, so this
  // is capped and the neighbouring levels are done cheapest-first.
  prefetch(map, template, { subdomains = "abcd", limit = 80 } = {}) {
    const bounds = map.getBounds();
    const zoom = Math.round(map.getZoom());
    const retina = window.devicePixelRatio > 1 ? "@2x" : "";
    let requested = 0;

    [zoom + 1, zoom - 1].forEach((z) => {
      if (z < 0 || z > 20 || requested >= limit) return;

      const x1 = this.xFor(bounds.getWest(), z);
      const x2 = this.xFor(bounds.getEast(), z);
      const y1 = this.yFor(bounds.getNorth(), z);
      const y2 = this.yFor(bounds.getSouth(), z);

      for (let x = x1; x <= x2 && requested < limit; x++) {
        for (let y = y1; y <= y2 && requested < limit; y++) {
          const url = template
            .replace("{s}", subdomains[requested % subdomains.length])
            .replace("{z}", z)
            .replace("{x}", x)
            .replace("{y}", y)
            .replace("{r}", retina);

          // An Image is enough: the response lands in the HTTP and service
          // worker caches, which is all Leaflet needs later.
          const img = new Image();
          img.src = url;
          requested += 1;
        }
      }
    });
  },

  // Runs after the map stops moving, so it never competes with tiles actually
  // being displayed.
  attach(map, template, options) {
    let timer = null;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => this.prefetch(map, template, options), 400);
    };
    map.on("moveend zoomend", schedule);
    schedule();
  },
};
