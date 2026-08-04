// ---------------------------------------------------------------------------
// MMRY — journey builder
//
// Build your own checkpoints, attach your own audio, walk it. Everything is
// stored on the device (IndexedDB); nothing is uploaded anywhere.
// ---------------------------------------------------------------------------

const DEFAULT_RADIUS = 20;
const DEFAULT_FADE_MS = 1500;
const JOURNEY_ID = "current";

const el = (id) => document.getElementById(id);

let journey = { id: JOURNEY_ID, name: "", checkpoints: [] };
let mode = "build";
let markers = {}; // checkpoint id -> { marker, circle }
let objectUrls = [];
let watchId = null;
let userMarker = null;
let userAccuracyCircle = null;
let insideState = {}; // checkpoint id -> bool

// ---- Map --------------------------------------------------------------------

const map = L.map("map").setView([57.0810, 24.3198], 15);

// Dark basemap so the map does not glare white against the dark interface.
L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  maxZoom: 20,
  subdomains: "abcd",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
}).addTo(map);

const idleStyle = { color: "#3388ff", weight: 2, fillOpacity: 0.15 };
const activeStyle = { color: "#ff8c00", weight: 3, fillOpacity: 0.35 };

map.on("click", (e) => {
  if (mode !== "build") return;
  addCheckpoint(e.latlng.lat, e.latlng.lng);
});

// ---- Journey state ----------------------------------------------------------

function newId() {
  return "cp-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function addCheckpoint(lat, lng) {
  journey.checkpoints.push({
    id: newId(),
    name: `Checkpoint ${journey.checkpoints.length + 1}`,
    lat,
    lng,
    radius: DEFAULT_RADIUS,
    fadeMs: DEFAULT_FADE_MS,
    audioName: null,
    audioBlob: null,
  });
  persist();
  render();
}

function removeCheckpoint(id) {
  journey.checkpoints = journey.checkpoints.filter((cp) => cp.id !== id);
  persist();
  render();
}

function findCheckpoint(id) {
  return journey.checkpoints.find((cp) => cp.id === id);
}

function persist() {
  MmryStore.save(journey).catch((err) => console.warn("Could not save:", err));
}

// ---- Rendering --------------------------------------------------------------

function renderMap() {
  Object.values(markers).forEach(({ marker, circle }) => {
    map.removeLayer(marker);
    map.removeLayer(circle);
  });
  markers = {};

  journey.checkpoints.forEach((cp) => {
    const circle = L.circle([cp.lat, cp.lng], {
      radius: cp.radius,
      ...idleStyle,
    }).addTo(map);

    const marker = L.marker([cp.lat, cp.lng], { draggable: mode === "build" })
      .addTo(map)
      .bindPopup(cp.name);

    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      cp.lat = pos.lat;
      cp.lng = pos.lng;
      circle.setLatLng(pos);
      persist();
      render();
    });

    markers[cp.id] = { marker, circle };
  });
}

function renderList() {
  const list = el("checkpoint-list");
  list.innerHTML = "";

  if (journey.checkpoints.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No checkpoints yet. Tap the map to place one.";
    list.appendChild(empty);
    return;
  }

  journey.checkpoints.forEach((cp, index) => {
    const li = document.createElement("li");

    const row = document.createElement("div");
    row.className = "cp-row";

    const num = document.createElement("span");
    num.className = "cp-num";
    num.textContent = index + 1;

    const name = document.createElement("input");
    name.type = "text";
    name.value = cp.name;
    name.className = "cp-name";
    name.addEventListener("change", () => {
      cp.name = name.value;
      persist();
      renderMap();
    });

    const del = document.createElement("button");
    del.className = "cp-delete";
    del.type = "button";
    del.textContent = "×";
    del.title = "Delete checkpoint";
    del.addEventListener("click", () => removeCheckpoint(cp.id));

    row.append(num, name, del);

    const meta = document.createElement("div");
    meta.className = "cp-meta";

    const radiusLabel = document.createElement("label");
    radiusLabel.textContent = "Radius ";
    const radius = document.createElement("input");
    radius.type = "number";
    radius.min = "5";
    radius.max = "500";
    radius.value = cp.radius;
    radius.className = "cp-radius";
    radius.addEventListener("change", () => {
      cp.radius = Number(radius.value) || DEFAULT_RADIUS;
      persist();
      renderMap();
    });
    radiusLabel.appendChild(radius);
    radiusLabel.append(" m");

    const audioLabel = document.createElement("label");
    audioLabel.className = "cp-audio";
    audioLabel.textContent = cp.audioName ? `♪ ${cp.audioName}` : "Choose audio…";
    const audioInput = document.createElement("input");
    audioInput.type = "file";
    // Listing concrete extensions as well as audio/* nudges iOS towards the
    // Files app. With audio/* alone it offers the camera, and "Take Video"
    // records a video that is not what anyone wanted.
    audioInput.accept =
      "audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac,.opus,.caf";
    audioInput.hidden = true;
    audioInput.addEventListener("change", () => {
      const file = audioInput.files[0];
      if (!file) return;
      cp.audioBlob = file;
      cp.audioName = file.name;
      persist();
      renderList();
    });
    audioLabel.appendChild(audioInput);

    meta.append(radiusLabel, audioLabel);
    li.append(row, meta);
    list.appendChild(li);
  });
}

function render() {
  renderMap();
  renderList();
}

// ---- Mode switching ----------------------------------------------------------

function setMode(next) {
  mode = next;
  el("mode-build").classList.toggle("active", next === "build");
  el("mode-walk").classList.toggle("active", next === "walk");
  el("build-panel").classList.toggle("hidden", next !== "build");

  if (next === "build") {
    stopWalking();
    el("start-overlay").classList.add("hidden");
    el("zone-text").textContent = "Build mode";
    el("zone-indicator").classList.remove("active-zone");
    el("zone-indicator").classList.add("no-zone");
  } else {
    const withAudio = journey.checkpoints.filter((cp) => cp.audioBlob);
    el("start-title").textContent =
      withAudio.length > 0
        ? "Ready to walk"
        : "No audio attached yet";
    el("start-overlay").classList.remove("hidden");
  }

  renderMap();
}

// ---- Walking ------------------------------------------------------------------

function startWalking() {
  objectUrls.forEach(URL.revokeObjectURL);
  objectUrls = [];

  const sources = journey.checkpoints
    .filter((cp) => cp.audioBlob)
    .map((cp) => {
      const url = URL.createObjectURL(cp.audioBlob);
      objectUrls.push(url);
      return { id: cp.id, src: url };
    });

  MmryAudio.setup(sources);
  MmryAudio.resume();
  MmryAudio.primeAll();

  insideState = {};

  if (!("geolocation" in navigator)) {
    el("zone-text").textContent = "Geolocation not supported";
    return;
  }

  watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
    enableHighAccuracy: true,
    maximumAge: 2000,
    timeout: 15000,
  });
}

function stopWalking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  MmryAudio.teardown();
  objectUrls.forEach(URL.revokeObjectURL);
  objectUrls = [];
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
  }

  if (mode !== "walk") return;

  let activeName = null;

  journey.checkpoints.forEach((cp) => {
    const dist = MmryGeo.distance(latitude, longitude, cp.lat, cp.lng);
    const isInside = dist <= cp.radius;
    const was = insideState[cp.id] || false;
    const layers = markers[cp.id];

    if (isInside && !was) {
      insideState[cp.id] = true;
      if (layers) layers.circle.setStyle(activeStyle);
      if (cp.audioBlob) MmryAudio.fade(cp.id, 1, cp.fadeMs);
    } else if (!isInside && was) {
      insideState[cp.id] = false;
      if (layers) layers.circle.setStyle(idleStyle);
      if (cp.audioBlob) MmryAudio.fade(cp.id, 0, cp.fadeMs);
    }

    if (isInside) activeName = cp.name;
  });

  const indicator = el("zone-indicator");
  if (activeName) {
    indicator.classList.remove("no-zone");
    indicator.classList.add("active-zone");
    el("zone-text").textContent = activeName;
  } else {
    indicator.classList.remove("active-zone");
    indicator.classList.add("no-zone");
    el("zone-text").textContent = "No active checkpoint";
  }
}

function onPositionError(err) {
  console.warn("Geolocation error:", err);
  el("zone-text").textContent =
    err.code === err.PERMISSION_DENIED
      ? "Location blocked"
      : "Location unavailable";
  showLocationHelp(explainLocationError(err));
}

// ---- Controls ------------------------------------------------------------------

el("journey-name").addEventListener("change", (e) => {
  journey.name = e.target.value;
  persist();
});

el("mode-build").addEventListener("click", () => setMode("build"));
el("mode-walk").addEventListener("click", () => setMode("walk"));
el("back-to-build").addEventListener("click", () => setMode("build"));

el("start-button").addEventListener("click", () => {
  el("start-overlay").classList.add("hidden");
  startWalking();
  map.invalidateSize();
});

const explainLocationError = mmryExplainLocationError;

function showLocationHelp(message) {
  const box = el("location-help");
  box.textContent = message;
  box.classList.add("visible");
}

el("add-here").addEventListener("click", () => {
  if (!("geolocation" in navigator)) {
    showLocationHelp("This browser doesn't support location.");
    return;
  }

  el("location-help").classList.remove("visible");
  el("add-here").textContent = "Locating…";

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      addCheckpoint(pos.coords.latitude, pos.coords.longitude);
      map.setView([pos.coords.latitude, pos.coords.longitude], 17);
      el("add-here").textContent = "+ Add at my location";
    },
    (err) => {
      el("add-here").textContent = "+ Add at my location";
      showLocationHelp(explainLocationError(err));
    },
    { enableHighAccuracy: true, timeout: 15000 }
  );
});

el("export-journey").addEventListener("click", async () => {
  const json = await MmryTransfer.export(journey);
  const filename = `${(journey.name || "journey")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "")}.mmry.json`;

  // iOS ignores the download attribute, so a link-click silently does nothing
  // there. The share sheet is the only route that reaches Files, Messages or
  // AirDrop — and it is the nicer way to hand someone a journey anyway.
  const file = new File([json], filename, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: journey.name || "MMRY journey" });
      return;
    } catch (err) {
      if (err.name === "AbortError") return; // user dismissed the sheet
      console.warn("Share failed, falling back to download:", err);
    }
  }

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // Some browsers ignore clicks on anchors that were never in the document,
  // and revoking the URL immediately can cancel the download in progress.
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2000);
});

el("import-journey").addEventListener("click", () => el("import-input").click());

el("import-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    journey = MmryTransfer.import(await file.text());
    el("journey-name").value = journey.name;
    persist();
    render();
    fitToCheckpoints();
  } catch (err) {
    alert(`Could not import: ${err.message}`);
  }
  e.target.value = "";
});

el("clear-journey").addEventListener("click", () => {
  if (!confirm("Delete all checkpoints and their audio? This cannot be undone.")) {
    return;
  }
  journey = { id: JOURNEY_ID, name: journey.name, checkpoints: [] };
  persist();
  render();
});

function fitToCheckpoints() {
  if (journey.checkpoints.length === 0) return;
  const bounds = L.latLngBounds(journey.checkpoints.map((cp) => [cp.lat, cp.lng]));
  map.fitBounds(bounds.pad(0.3));
}

// ---- Boot ------------------------------------------------------------------------

MmryStore.load(JOURNEY_ID)
  .then((saved) => {
    if (saved) {
      journey = saved;
      el("journey-name").value = journey.name || "";
    }
    render();
    fitToCheckpoints();
  })
  .catch((err) => {
    console.warn("Could not load saved journey:", err);
    render();
  });

// ---- Publishing ----------------------------------------------------------------

const publishButton = el("publish-journey");
const publishStatus = el("publish-status");
const shareResult = el("share-result");
const shareLinkInput = el("share-link");

function setPublishStatus(message, tone = "") {
  publishStatus.textContent = message;
  publishStatus.className = tone;
}

publishButton.addEventListener("click", async () => {
  const withAudio = journey.checkpoints.filter((cp) => cp.audioBlob);
  if (withAudio.length === 0) {
    setPublishStatus("Attach audio to at least one checkpoint first.", "warn");
    return;
  }

  publishButton.disabled = true;
  shareResult.classList.remove("visible");

  try {
    const { url } = await MmryShare.publish(journey, (step, total, label) => {
      setPublishStatus(`${label}… (${step}/${total})`);
    });

    shareLinkInput.value = url;
    shareResult.classList.add("visible");
    setPublishStatus("Ready to send. Anyone with this link can walk it.", "ok");
  } catch (err) {
    setPublishStatus(err.message, "warn");
  } finally {
    publishButton.disabled = false;
  }
});

el("copy-link").addEventListener("click", async () => {
  const url = shareLinkInput.value;
  if (!url) return;

  // The share sheet is the better route on a phone — it reaches Messages and
  // WhatsApp directly, which is how a walk actually gets sent to someone.
  if (navigator.share) {
    try {
      await navigator.share({ title: journey.name || "A soundwalk", url });
      return;
    } catch (err) {
      if (err.name === "AbortError") return;
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    setPublishStatus("Link copied.", "ok");
  } catch (err) {
    shareLinkInput.select();
    setPublishStatus("Press and hold the link to copy it.", "warn");
  }
});
