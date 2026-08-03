import * as Location from "expo-location";
import { createZoneTracker } from "../engine/zoneTracker";

// ---------------------------------------------------------------------------
// Foreground strategy — works everywhere, including Expo Go.
//
// Polls position and decides zone membership itself. Requires the app to be
// open and the screen awake, exactly like the web prototype.
// ---------------------------------------------------------------------------

export function createForegroundTracker() {
  let subscription = null;
  const zoneTracker = createZoneTracker();

  return {
    mode: "foreground",

    async start(checkpoints, handlers) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") throw new Error("Location permission denied");

      zoneTracker.reset();

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 5,
        },
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          handlers.onPosition?.({ latitude, longitude, accuracy });

          const { entered, exited, activeId } = zoneTracker.update(
            latitude,
            longitude,
            checkpoints
          );

          entered.forEach((id) => handlers.onEnter?.(id));
          exited.forEach((id) => handlers.onExit?.(id));
          handlers.onActiveChange?.(activeId);
        }
      );
    },

    async stop() {
      if (subscription) {
        subscription.remove();
        subscription = null;
      }
    },
  };
}
