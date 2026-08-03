import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

// ---------------------------------------------------------------------------
// Geofencing strategy — needs a development build; unavailable in Expo Go.
//
// Hands the regions to the OS, which wakes the app on crossings. Works with the
// phone in a pocket and the screen off, and costs far less battery than polling.
// ---------------------------------------------------------------------------

export const GEOFENCE_TASK = "mmry-geofence";

// iOS monitors at most 20 regions per app. Longer journeys must register only
// the nearest ones and re-register as the listener moves.
export const MAX_REGIONS = 20;

// TaskManager tasks must be defined at module scope — the OS may relaunch the
// app straight into this task, before any component has mounted.
let handlers = {};

export function setGeofenceHandlers(next) {
  handlers = next || {};
}

TaskManager.defineTask(GEOFENCE_TASK, ({ data, error }) => {
  if (error) {
    console.warn("Geofence task error:", error);
    return;
  }
  const { eventType, region } = data || {};
  if (!region) return;

  if (eventType === Location.GeofencingEventType.Enter) {
    handlers.onEnter?.(region.identifier);
    handlers.onActiveChange?.(region.identifier);
  } else if (eventType === Location.GeofencingEventType.Exit) {
    handlers.onExit?.(region.identifier);
    handlers.onActiveChange?.(null);
  }
});

function nearestRegions(checkpoints, origin) {
  if (checkpoints.length <= MAX_REGIONS) return checkpoints;
  if (!origin) return checkpoints.slice(0, MAX_REGIONS);

  return [...checkpoints]
    .sort((a, b) => {
      const da = (a.lat - origin.latitude) ** 2 + (a.lng - origin.longitude) ** 2;
      const db = (b.lat - origin.latitude) ** 2 + (b.lng - origin.longitude) ** 2;
      return da - db;
    })
    .slice(0, MAX_REGIONS);
}

export function createGeofenceTracker() {
  return {
    mode: "geofence",

    async start(checkpoints, incoming) {
      const foreground = await Location.requestForegroundPermissionsAsync();
      if (foreground.status !== "granted") {
        throw new Error("Location permission denied");
      }

      const background = await Location.requestBackgroundPermissionsAsync();
      if (background.status !== "granted") {
        throw new Error("Background location permission denied");
      }

      setGeofenceHandlers(incoming);

      const origin = await Location.getLastKnownPositionAsync();
      const regions = nearestRegions(
        checkpoints,
        origin ? origin.coords : null
      ).map((cp) => ({
        identifier: cp.id,
        latitude: cp.lat,
        longitude: cp.lng,
        radius: cp.radius,
        notifyOnEnter: true,
        notifyOnExit: true,
      }));

      await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
    },

    async stop() {
      setGeofenceHandlers(null);
      if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) {
        await Location.stopGeofencingAsync(GEOFENCE_TASK);
      }
    },
  };
}
