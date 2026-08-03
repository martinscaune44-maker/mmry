import AsyncStorage from "@react-native-async-storage/async-storage";

// ---------------------------------------------------------------------------
// Journey persistence.
//
// Metadata is stored as JSON. Audio is referenced by the URI the document
// picker hands back — copied into the app's cache, not the sandbox proper, so
// it can be evicted under storage pressure. Fine for a prototype; anything
// durable belongs in the Phase 2 backend.
// ---------------------------------------------------------------------------

const KEY = "mmry:journey:current";

export const emptyJourney = () => ({
  name: "",
  checkpoints: [],
});

export async function loadJourney() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : emptyJourney();
  } catch (err) {
    console.warn("Could not load journey:", err);
    return emptyJourney();
  }
}

export async function saveJourney(journey) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(journey));
  } catch (err) {
    console.warn("Could not save journey:", err);
  }
}

export function newCheckpointId() {
  return "cp-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
