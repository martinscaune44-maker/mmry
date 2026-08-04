// ---------------------------------------------------------------------------
// MMRY — walking a shared journey.
//
// What a recipient gets when someone sends them a link. No building, no
// editing: open, tap once, walk.
// ---------------------------------------------------------------------------

const zoneIndicator = document.getElementById("zone-indicator");
const zoneText = document.getElementById("zone-text");
const distanceReadout = document.getElementById("distance-readout");
const accuracyWarning = document.getElementById("accuracy-warning");
const locationHelp = document.getElementById("location-help");
const recenterButton = document.getElementById("recenter");
const startButton = document.getElementById("start-button");
const titleEl = document.getElementById("journey-title");
const blurbEl = document.getElementById("journey-blurb");

const statusBar = document.getElementById("status-bar");
statusBar.classList.add("pre-walk");

const map = L.map("map").setView([57.081058, 24.319797], 15);

// Light basemap. A dark map under dark chrome reads as one black smear and the
// checkpoint circles vanish into it; every serious map app — Strava, Komoot,
// AllTrails — keeps the map light and the furniture dark.
L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
  maxZoom: 20,
  subdomains: "abcd",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
}).addTo(map);

const idleStyle = { color: "#3388ff", weight: 2, fillOpacity: 0.15 };
const activeStyle = { color: "#ff8c00", weight: 3, fillOpacity: 0.35 };

let journey = null;
let layers = {}; // checkpoint id -> circle
let inside = {};
let userMarker = null;
let userAccuracyCircle = null;
let followUser = true;
let wakeLock = null;

// ---- Loading ----------------------------------------------------------------

async function boot() {
  const id = new URLSearchParams(location.search).get("j");

  if (!id) {
    titleEl.textContent = "No journey";
    blurbEl.textContent =
      "This link is missing a journey. Ask whoever sent it for the full link.";
    return;
  }

  try {
    journey = await MmryShare.load(id);
  } catch (err) {
    titleEl.textContent = "Couldn't load";
    blurbEl.textContent = err.message;
    return;
  }

  zoneText.textContent = "Ready";

  titleEl.textContent = journey.name || "Untitled journey";
  const count = journey.checkpoints.length;
  blurbEl.textContent = `${count} place${count === 1 ? "" : "s"} to find. Put on headphones, then walk — the sound starts when you arrive.`;

  journey.checkpoints.forEach((cp) => {
    layers[cp.id] = L.circle([cp.lat, cp.lng], {
      radius: cp.radius,
      ...idleStyle,
    }).addTo(map);
    L.marker([cp.lat, cp.lng]).addTo(map).bindPopup(cp.name);
  });

  if (count > 0) {
    map.fitBounds(
      L.latLngBounds(journey.checkpoints.map((cp) => [cp.lat, cp.lng])).pad(0.35)
    );
  }

  // Buffer the audio before the walk starts rather than on arrival.
  MmryAudio.setup(
    journey.checkpoints.map((cp) => ({ id: cp.id, src: cp.audioUrl }))
  );

  startButton.disabled = false;
}

// ---- Wake lock ---------------------------------------------------------------

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

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !wakeLock) requestWakeLock();
});

// ---- Walking ------------------------------------------------------------------

function updateIndicator(activeName) {
  zoneIndicator.classList.toggle("active-zone", Boolean(activeName));
  zoneIndicator.classList.toggle("no-zone", !activeName);
  zoneText.textContent = activeName || "Walking";
}

function updateDistance(nearest) {
  if (!nearest) {
    distanceReadout.classList.remove("visible");
    return;
  }
  const metres = Math.round(nearest.distance);
  const shown = metres > 999 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`;
  distanceReadout.innerHTML = `${nearest.cp.name} · <strong>${shown}</strong> away`;
  distanceReadout.classList.add("visible");
}

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

  accuracyWarning.classList.toggle("visible", accuracy > 30);

  let activeName = null;
  let nearest = null;

  journey.checkpoints.forEach((cp) => {
    const dist = MmryGeo.distance(latitude, longitude, cp.lat, cp.lng);
    const isInside = dist <= cp.radius;
    const was = inside[cp.id] || false;

    if (isInside && !was) {
      inside[cp.id] = true;
      layers[cp.id].setStyle(activeStyle);
      MmryAudio.fade(cp.id, 1, cp.fadeMs);
    } else if (!isInside && was) {
      inside[cp.id] = false;
      layers[cp.id].setStyle(idleStyle);
      MmryAudio.fade(cp.id, 0, cp.fadeMs);
    }

    if (isInside) activeName = cp.name;
    if (!nearest || dist < nearest.distance) nearest = { cp, distance: dist };
  });

  updateIndicator(activeName);
  updateDistance(activeName ? null : nearest);
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

map.on("dragstart", () => {
  followUser = false;
  recenterButton.classList.add("visible");
});

recenterButton.addEventListener("click", () => {
  followUser = true;
  recenterButton.classList.remove("visible");
  if (userMarker) map.panTo(userMarker.getLatLng(), { animate: true });
});

startButton.addEventListener("click", () => {
  document.getElementById("start-overlay").classList.add("hidden");
  statusBar.classList.remove("pre-walk");
  zoneText.textContent = "Finding you…";
  MmryAudio.resume();
  MmryAudio.primeAll();
  requestWakeLock();
  map.invalidateSize();

  if (!("geolocation" in navigator)) {
    zoneText.textContent = "Geolocation not supported";
    return;
  }

  navigator.geolocation.watchPosition(onPosition, onPositionError, {
    enableHighAccuracy: true,
    maximumAge: 2000,
    timeout: 15000,
  });
});

boot();

// ---- Desktop handoff ------------------------------------------------------------
// You cannot walk with a laptop, so on a wide screen the page stops pretending
// otherwise: it shows what the journey is and hands it to a phone by QR.

const DESKTOP_QUERY = "(min-width: 900px)";

function isDesktop() {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

function renderQrCode() {
  const holder = document.getElementById("qr-code");
  if (!holder || holder.dataset.rendered === "true") return;

  try {
    // Type 0 lets the library pick a size; M correction survives a phone camera
    // pointed at a screen.
    const qr = qrcode(0, "M");
    qr.addData(location.href);
    qr.make();
    holder.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
    holder.dataset.rendered = "true";
  } catch (err) {
    console.warn("Could not render QR code:", err);
    holder.remove();
  }
}

function applyLayout() {
  const desktop = isDesktop();
  document.body.classList.toggle("desktop", desktop);
  if (desktop) renderQrCode();
}

window.matchMedia(DESKTOP_QUERY).addEventListener("change", applyLayout);
applyLayout();
