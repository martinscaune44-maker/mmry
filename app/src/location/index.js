import { createForegroundTracker } from "./foreground";
import { createGeofenceTracker } from "./geofence";

// ---------------------------------------------------------------------------
// The seam between Stage A and Stage B.
//
// Everything above this file speaks one language: give me checkpoints, call me
// on enter and exit. Which strategy answers is decided here and nowhere else,
// so moving from Expo Go to a development build changes no other code.
//
// Geofencing is attempted first and the foreground poller is the fallback, so
// the same build works in both environments.
// ---------------------------------------------------------------------------

export async function startTracking(checkpoints, handlers, { preferGeofencing = true } = {}) {
  if (preferGeofencing) {
    const geofence = createGeofenceTracker();
    try {
      await geofence.start(checkpoints, handlers);
      return geofence;
    } catch (err) {
      // Expected in Expo Go, or when background permission is refused.
      console.log(`Geofencing unavailable (${err.message}); using foreground.`);
      await geofence.stop().catch(() => {});
    }
  }

  const foreground = createForegroundTracker();
  await foreground.start(checkpoints, handlers);
  return foreground;
}
