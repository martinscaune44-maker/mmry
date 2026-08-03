import { loadJourney } from "../storage/journeys";
import { configureAudioSession, ensureClip, fade } from "./audio";

// ---------------------------------------------------------------------------
// Zone events → sound.
//
// Deliberately independent of React. When iOS wakes the app for a geofence
// crossing it may have been terminated entirely, so there is no mounted screen
// to hand the event to — the audio has to be startable from nothing but a
// checkpoint id. Everything needed is reloaded from storage on demand.
// ---------------------------------------------------------------------------

let cachedJourney = null;

// The walk screen already holds the journey in memory; handing it over saves a
// storage read and keeps unsaved edits in sync.
export function primeJourney(journey) {
  cachedJourney = journey;
}

async function getJourney() {
  if (!cachedJourney) cachedJourney = await loadJourney();
  return cachedJourney;
}

async function checkpointFor(id) {
  const journey = await getJourney();
  return journey.checkpoints.find((cp) => cp.id === id) || null;
}

export async function handleEnter(id) {
  const cp = await checkpointFor(id);
  if (!cp?.audioUri) return;

  await configureAudioSession();
  ensureClip(cp.id, cp.audioUri);
  fade(cp.id, 1, cp.fadeMs);
}

export async function handleExit(id) {
  const cp = await checkpointFor(id);
  if (!cp?.audioUri) return;

  fade(cp.id, 0, cp.fadeMs);
}
