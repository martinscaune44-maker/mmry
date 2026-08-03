import { distance } from "./geo";

// ---------------------------------------------------------------------------
// Enter/exit state machine.
//
// Only the foreground tracker needs this — when geofencing is available the OS
// decides what "inside" means and simply tells us. Keeping it separate is what
// lets the two location strategies emit identical events.
// ---------------------------------------------------------------------------

export function createZoneTracker() {
  let inside = {}; // checkpoint id -> bool

  return {
    reset() {
      inside = {};
    },

    // Returns { entered: [ids], exited: [ids], activeId }
    update(latitude, longitude, checkpoints) {
      const entered = [];
      const exited = [];
      let activeId = null;

      checkpoints.forEach((cp) => {
        const isInside =
          distance(latitude, longitude, cp.lat, cp.lng) <= cp.radius;
        const was = inside[cp.id] || false;

        if (isInside && !was) entered.push(cp.id);
        else if (!isInside && was) exited.push(cp.id);

        inside[cp.id] = isInside;
        if (isInside) activeId = cp.id;
      });

      return { entered, exited, activeId };
    },
  };
}
