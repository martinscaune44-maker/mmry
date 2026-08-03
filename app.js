// ---------------------------------------------------------------------------
// MMRY Soundwalk — fixed demo
// Walks the zones hardcoded in zones.js. Shared logic lives in engine.js.
// ---------------------------------------------------------------------------

const zoneIndicator = document.getElementById("zone-indicator");
const zoneText = document.getElementById("zone-text");
const distanceReadout = document.getElementById("distance-readout");

// ---- Map setup -------------------------------------------------------------

const map = L.map("map").setView([MAP_CENTER.lat, MAP_CENTER.lng], MAP_ZOOM);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

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
  }

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
    err.code === err.PERMISSION_DENIED
      ? "Location permission denied"
      : "Location unavailable";
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

document.getElementById("start-button").addEventListener("click", () => {
  document.getElementById("start-overlay").classList.add("hidden");
  MmryAudio.resume();
  MmryAudio.primeAll();
  startTracking();
  map.invalidateSize();
});
