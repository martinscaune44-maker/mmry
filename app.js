// ---------------------------------------------------------------------------
// MMRY Soundwalk — app logic
// Reads zone definitions from zones.js. No backend, no build step.
// ---------------------------------------------------------------------------

const zoneIndicator = document.getElementById("zone-indicator");
const zoneDot = document.getElementById("zone-dot");
const zoneText = document.getElementById("zone-text");

// ---- Map setup -------------------------------------------------------------

const map = L.map("map").setView([MAP_CENTER.lat, MAP_CENTER.lng], MAP_ZOOM);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const zoneCircleStyle = { color: "#3388ff", weight: 2, fillOpacity: 0.15 };
const zoneCircleActiveStyle = { color: "#ff8c00", weight: 3, fillOpacity: 0.35 };

const zoneState = {}; // id -> { zone, circle, marker, audio, inside }

ZONES.forEach((zone) => {
  const circle = L.circle([zone.lat, zone.lng], {
    radius: zone.radius,
    ...zoneCircleStyle,
  }).addTo(map);

  const marker = L.marker([zone.lat, zone.lng]).addTo(map).bindPopup(zone.name);

  const audio = new Audio(zone.audio);
  audio.loop = true;
  audio.preload = "none";

  zoneState[zone.id] = { zone, circle, marker, audio, inside: false, volume: 0 };
});

// Fit map to show all zones if there are any
if (ZONES.length > 0) {
  const bounds = L.latLngBounds(ZONES.map((z) => [z.lat, z.lng]));
  map.fitBounds(bounds.pad(0.3));
}

// User position marker
let userMarker = null;
let userAccuracyCircle = null;

// ---- Distance helper (Haversine, meters) -----------------------------------

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ---- Audio fade helpers -----------------------------------------------------

function fadeAudio(state, targetVolume, durationMs) {
  const audio = state.audio;

  if (targetVolume > 0 && audio.paused) {
    audio.volume = 0;
    audio.play().catch((err) => {
      console.warn(`Could not play ${state.zone.audio}:`, err);
    });
  }

  const startVolume = audio.volume;
  const startTime = performance.now();

  if (state.fadeRaf) cancelAnimationFrame(state.fadeRaf);

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / durationMs, 1);
    audio.volume = startVolume + (targetVolume - startVolume) * t;

    if (t < 1) {
      state.fadeRaf = requestAnimationFrame(step);
    } else {
      state.fadeRaf = null;
      if (targetVolume === 0) {
        audio.pause();
        audio.currentTime = 0;
      }
    }
  }

  state.fadeRaf = requestAnimationFrame(step);
}

// ---- Zone indicator UI ------------------------------------------------------

function updateIndicator(activeZoneName) {
  if (activeZoneName) {
    zoneIndicator.classList.remove("no-zone");
    zoneIndicator.classList.add("active-zone");
    zoneText.textContent = activeZoneName;
  } else {
    zoneIndicator.classList.remove("active-zone");
    zoneIndicator.classList.add("no-zone");
    zoneText.textContent = "No active zone";
  }
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

  Object.values(zoneState).forEach((state) => {
    const { zone } = state;
    const dist = distanceMeters(latitude, longitude, zone.lat, zone.lng);
    const isInside = dist <= zone.radius;

    if (isInside && !state.inside) {
      state.inside = true;
      state.circle.setStyle(zoneCircleActiveStyle);
      fadeAudio(state, 1, zone.fadeMs);
    } else if (!isInside && state.inside) {
      state.inside = false;
      state.circle.setStyle(zoneCircleStyle);
      fadeAudio(state, 0, zone.fadeMs);
    }

    if (isInside) activeZoneName = zone.name;
  });

  updateIndicator(activeZoneName);
}

function onPositionError(err) {
  console.warn("Geolocation error:", err);
  zoneIndicator.classList.remove("active-zone");
  zoneIndicator.classList.add("no-zone");

  if (err.code === err.PERMISSION_DENIED) {
    zoneText.textContent = "Location permission denied";
  } else {
    zoneText.textContent = "Location unavailable";
  }
}

if ("geolocation" in navigator) {
  navigator.geolocation.watchPosition(onPosition, onPositionError, {
    enableHighAccuracy: true,
    maximumAge: 2000,
    timeout: 15000,
  });
} else {
  zoneText.textContent = "Geolocation not supported";
}
