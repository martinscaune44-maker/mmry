// ---------------------------------------------------------------------------
// MMRY Soundwalk — fixed demo
// Walks the zones hardcoded in zones.js. Shared logic lives in engine.js.
// ---------------------------------------------------------------------------

const zoneIndicator = document.getElementById("zone-indicator");
const zoneText = document.getElementById("zone-text");
const distanceReadout = document.getElementById("distance-readout");
const accuracyWarning = document.getElementById("accuracy-warning");
const recenterButton = document.getElementById("recenter");
const locationHelp = document.getElementById("location-help");

// ---- Map setup -------------------------------------------------------------

// Zoom sits bottom-right, beside the locate button, the way every serious
// map app groups its controls — within reach of the hand already on the
// mouse, and clear of the panel on the left.
const map = L.map("map", { zoomControl: false }).setView([MAP_CENTER.lat, MAP_CENTER.lng], MAP_ZOOM);

L.control.zoom({ position: "bottomright" }).addTo(map);

// Light basemap. A dark map under dark chrome reads as one black smear and the
// checkpoint circles vanish into it; every serious map app — Strava, Komoot,
// AllTrails — keeps the map light and the furniture dark.
L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
  maxZoom: 20,
  subdomains: "abcd",
  // Hold a wider ring of tiles than the default 2, so panning runs out of
  // loaded map far less often.
  keepBuffer: 6,
  updateWhenIdle: false,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
}).addTo(map);

// Warm the zoom levels either side, so zooming does not start from blank tiles.
MmryTiles.attach(map, "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png");

const zoneCircleStyle = { color: "#3388ff", weight: 2, fillOpacity: 0.15 };
const zoneCircleActiveStyle = { color: "#ff8c00", weight: 3, fillOpacity: 0.35 };

const zoneState = {}; // id -> { zone, circle, inside }

ZONES.forEach((zone) => {
  const circle = L.circle([zone.lat, zone.lng], {
    radius: zone.radius,
    ...zoneCircleStyle,
  }).addTo(map);

  L.marker([zone.lat, zone.lng]).addTo(map).bindPopup(zone.name);

  zoneState[zone.id] = { zone, circle, inside: false };
});

// Build the audio graph up front so large clips start buffering immediately;
// the context stays suspended until the start tap resumes it.
MmryAudio.setup(ZONES.map((z) => ({ id: z.id, src: z.audio })));

if (ZONES.length > 0) {
  const bounds = L.latLngBounds(ZONES.map((z) => [z.lat, z.lng]));
  map.fitBounds(bounds.pad(0.3));
}

let userMarker = null;
let userAccuracyCircle = null;
let followUser = true;

// ---- Screen wake lock --------------------------------------------------------
// A browser cannot track location with the screen off, so the next best thing
// is to stop the screen turning off during a walk. Supported on iOS 16.4+.

let wakeLock = null;

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch (err) {
    console.warn("Wake lock unavailable:", err);
  }
}

// iOS drops the lock whenever the tab is backgrounded; take it again on return.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !wakeLock) requestWakeLock();
});

// ---- Zone indicator UI ------------------------------------------------------

function updateIndicator(activeZoneName) {
  if (activeZoneName) {
    zoneIndicator.classList.remove("no-zone");
    zoneIndicator.classList.add("active-zone");
    zoneText.textContent = activeZoneName;
  } else {
    zoneIndicator.classList.remove("active-zone");
    zoneIndicator.classList.add("no-zone");
    zoneText.textContent = "Walking";
  }
}

// Shows how far the nearest zone is while outside one. On a filmed walk this
// is what lets a viewer see the mechanic working — the number falls, then the
// sound starts.
function updateDistance(nearest) {
  if (!nearest) {
    distanceReadout.classList.remove("visible");
    return;
  }

  const metres = Math.round(nearest.distance);
  const shown = metres > 999 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`;
  distanceReadout.innerHTML = `${nearest.zone.name} · <strong>${shown}</strong> away`;
  distanceReadout.classList.add("visible");
}

// ---- Geolocation tracking ----------------------------------------------------

function onPosition(position) {
  const { latitude, longitude, accuracy } = position.coords;

  if (!userMarker) {
    userMarker = L.circleMarker([latitude, longitude], {
      radius: 8,
      color: "#ffffff",
      weight: 2,
      fillColor: "#2b7de9",
      fillOpacity: 1,
    }).addTo(map);
    userAccuracyCircle = L.circle([latitude, longitude], {
      radius: accuracy,
      color: "#2b7de9",
      weight: 1,
      fillOpacity: 0.05,
    }).addTo(map);
    map.panTo([latitude, longitude]);
  } else {
    userMarker.setLatLng([latitude, longitude]);
    userAccuracyCircle.setLatLng([latitude, longitude]);
    userAccuracyCircle.setRadius(accuracy);
    if (followUser) map.panTo([latitude, longitude], { animate: true });
  }

  // Poor GPS is the usual reason a zone "doesn't work", so say so rather than
  // leaving the listener to guess.
  accuracyWarning.classList.toggle("visible", accuracy > 30);

  let activeZoneName = null;
  let nearest = null;

  Object.values(zoneState).forEach((state) => {
    const { zone } = state;
    const dist = MmryGeo.distance(latitude, longitude, zone.lat, zone.lng);
    const isInside = dist <= zone.radius;

    if (isInside && !state.inside) {
      state.inside = true;
      state.circle.setStyle(zoneCircleActiveStyle);
      MmryAudio.fade(zone.id, 1, zone.fadeMs);
    } else if (!isInside && state.inside) {
      state.inside = false;
      state.circle.setStyle(zoneCircleStyle);
      MmryAudio.fade(zone.id, 0, zone.fadeMs);
    }

    if (isInside) activeZoneName = zone.name;
    if (!nearest || dist < nearest.distance) nearest = { zone, distance: dist };
  });

  updateIndicator(activeZoneName);
  updateDistance(activeZoneName ? null : nearest);
}

function onPositionError(err) {
  console.warn("Geolocation error:", err);
  zoneIndicator.classList.remove("active-zone");
  zoneIndicator.classList.add("no-zone");
  distanceReadout.classList.remove("visible");
  zoneText.textContent =
    err.code === err.PERMISSION_DENIED ? "Location blocked" : "Location unavailable";
  locationHelp.textContent = mmryExplainLocationError(err);
  locationHelp.classList.add("visible");
}

function startTracking() {
  if (!("geolocation" in navigator)) {
    zoneText.textContent = "Geolocation not supported";
    return;
  }

  navigator.geolocation.watchPosition(onPosition, onPositionError, {
    enableHighAccuracy: true,
    maximumAge: 2000,
    timeout: 15000,
  });
}

// Dragging the map means the listener wants to look around; stop yanking it
// back. The recenter button opts back in.
map.on("dragstart", () => {
  followUser = false;
  recenterButton.classList.add("visible");
});

recenterButton.addEventListener("click", () => {
  followUser = true;
  recenterButton.classList.remove("visible");
  if (userMarker) map.panTo(userMarker.getLatLng(), { animate: true });
});

document.getElementById("start-button").addEventListener("click", () => {
  document.getElementById("start-overlay").classList.add("hidden");
  MmryAudio.resume();
  MmryAudio.primeAll();
  startTracking();
  requestWakeLock();
  map.invalidateSize();
});
