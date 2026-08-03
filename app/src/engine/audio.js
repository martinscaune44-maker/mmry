import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

// ---------------------------------------------------------------------------
// Audio playback and fading.
//
// Simpler than the web version: on native, a player's volume is genuinely
// writable, so no Web Audio gain graph is needed. (iOS Safari ignores volume
// writes, which is what forced the gain nodes on the web.)
// ---------------------------------------------------------------------------

const FADE_STEP_MS = 50;

let players = {}; // checkpoint id -> { player, timer }
let sessionConfigured = false;

export async function configureAudioSession() {
  if (sessionConfigured) return;

  await setAudioModeAsync({
    // Keeps audio running with the screen off — the whole point of the app.
    shouldPlayInBackground: true,
    // A soundwalk that goes silent because the ringer switch is flipped would
    // be baffling to the listener.
    playsInSilentMode: true,
    interruptionMode: "doNotMix",
  });

  sessionConfigured = true;
}

// Creates a player only if one is missing, so it is safe to call on every zone
// entry — including from a background task with no idea what came before.
export function ensureClip(id, uri) {
  if (players[id]) return;

  const player = createAudioPlayer({ uri });
  player.loop = false;
  player.volume = 0;
  players[id] = { player, timer: null };
}

// Preloads every clip up front. Only worth doing in the foreground, where the
// listener is watching a screen and multi-megabyte files have time to buffer.
export function loadClips(sources) {
  unloadAll();
  sources.forEach(({ id, uri }) => ensureClip(id, uri));
}

export function fade(id, target, durationMs) {
  const entry = players[id];
  if (!entry) return;

  const { player } = entry;

  if (entry.timer) {
    clearInterval(entry.timer);
    entry.timer = null;
  }

  if (target > 0 && !player.playing) {
    player.volume = 0;
    player.play();
  }

  const start = player.volume;
  const steps = Math.max(1, Math.round(durationMs / FADE_STEP_MS));
  let step = 0;

  entry.timer = setInterval(() => {
    step += 1;
    const t = Math.min(step / steps, 1);
    player.volume = start + (target - start) * t;

    if (t >= 1) {
      clearInterval(entry.timer);
      entry.timer = null;
      if (target === 0) {
        player.pause();
        player.seekTo(0);
      }
    }
  }, FADE_STEP_MS);
}

export function unloadAll() {
  Object.values(players).forEach(({ player, timer }) => {
    if (timer) clearInterval(timer);
    player.remove();
  });
  players = {};
  sessionConfigured = false;
}
