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

  // sources: [{ id, src }]
  setup(sources) {
    if (this.ctx) this.teardown();

    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();

    sources.forEach(({ id, src }) => {
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
      node.connect(gain);
      gain.connect(this.ctx.destination);

      this.tracks[id] = { audio, gain, desiredPlaying: false, stopTimer: null };
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
    track.gain.gain.cancelScheduledValues(now);
    track.gain.gain.setValueAtTime(track.gain.gain.value, now);
    track.gain.gain.linearRampToValueAtTime(targetVolume, now + durationMs / 1000);

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
