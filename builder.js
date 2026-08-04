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

function renderCheckpoint(cp, index) {
  const li = document.createElement("li");

  // --- title row
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

  // --- controls row
  const meta = document.createElement("div");
  meta.className = "cp-meta";

  const radiusLabel = document.createElement("label");
  radiusLabel.className = "cp-radius-label";
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

  // Recording in place is the primary way to add sound — you are standing
  // where it belongs. Choosing a file is the secondary path.
  const recordButton = document.createElement("button");
  recordButton.type = "button";
  recordButton.className = "cp-record";
  recordButton.dataset.cp = cp.id;
  const isThisRecording = recordingCheckpointId === cp.id;
  recordButton.classList.toggle("recording", isThisRecording);
  recordButton.textContent = isThisRecording
    ? `■ Stop ${mmryFormatDuration(MmryRecorder.elapsedMs())}`
    : cp.audioBlob
    ? "● Re-record"
    : "● Record here";
  recordButton.addEventListener("click", () => toggleRecording(cp.id));
  if (!MmryRecorder.supported()) recordButton.disabled = true;

  meta.append(radiusLabel, recordButton);

  if (!cp.audioBlob) {
    const audioLabel = document.createElement("label");
    audioLabel.className = "cp-audio";
    audioLabel.textContent = "or choose a file";
    audioLabel.appendChild(makeFileInput(cp));
    meta.append(audioLabel);
  }

  li.append(row, meta);

  // --- playback row, only once there is something to hear
  if (cp.audioBlob) {
    li.append(renderPlayer(cp));
  }

  return li;
}

function makeFileInput(cp) {
  const input = document.createElement("input");
  input.type = "file";
  // Listing concrete extensions as well as audio/* nudges iOS towards the
  // Files app rather than the camera.
  input.accept = "audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac,.opus,.caf";
  input.hidden = true;
  input.addEventListener("change", () => {
    const file = input.files[0];
    if (!file) return;
    cp.audioBlob = file;
    cp.audioName = file.name;
    persist();
    renderList();
  });
  return input;
}

// Publishing audio nobody has listened to is the easiest mistake to make here,
// so every clip gets a play button as soon as it exists.
function renderPlayer(cp) {
  const wrap = document.createElement("div");
  wrap.className = "cp-player";

  const play = document.createElement("button");
  play.type = "button";
  play.className = "cp-play";
  play.dataset.cp = cp.id;
  play.textContent = previewingId === cp.id ? "❚❚" : "▶";
  play.setAttribute("aria-label", "Play recording");
  play.addEventListener("click", () => togglePreview(cp.id));

  const label = document.createElement("span");
  label.className = "cp-filename";
  label.textContent = cp.audioName || "recording";

  const time = document.createElement("span");
  time.className = "cp-time";
  time.dataset.cp = cp.id;
  time.textContent = "0:00";

  // Scrubbable, like any music player — clicking two thirds along jumps two
  // thirds in. Starts playback if it was not already running.
  const bar = document.createElement("div");
  bar.className = "cp-progress";
  bar.dataset.cp = cp.id;
  bar.setAttribute("role", "slider");
  bar.setAttribute("aria-label", "Seek within recording");
  const fill = document.createElement("div");
  fill.className = "cp-progress-fill";
  fill.dataset.cp = cp.id;
  bar.appendChild(fill);

  const seek = (event) => {
    const rect = bar.getBoundingClientRect();
    const point = event.touches ? event.touches[0].clientX : event.clientX;
    const ratio = Math.min(Math.max((point - rect.left) / rect.width, 0), 1);
    seekPreview(cp.id, ratio);
  };

  bar.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    bar.setPointerCapture(event.pointerId);
    seek(event);

    const onMove = (moveEvent) => seek(moveEvent);
    const onUp = () => {
      bar.removeEventListener("pointermove", onMove);
      bar.removeEventListener("pointerup", onUp);
    };
    bar.addEventListener("pointermove", onMove);
    bar.addEventListener("pointerup", onUp);
  });

  const replace = document.createElement("label");
  replace.className = "cp-replace";
  replace.textContent = "Replace";
  replace.appendChild(makeFileInput(cp));

  wrap.append(play, label, time, bar, replace);
  return wrap;
}

function renderList() {
  const list = el("checkpoint-list");
  list.innerHTML = "";

  if (journey.checkpoints.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No checkpoints yet. Tap the map to place one.";
    list.appendChild(empty);
    updateShareBar();
    return;
  }

  journey.checkpoints.forEach((cp, index) => {
    list.appendChild(renderCheckpoint(cp, index));
  });

  updateShareBar();
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

// ---- Recording ------------------------------------------------------------------

let recordingCheckpointId = null;
let recordingTimer = null;

function refreshRecordButton() {
  const button = document.querySelector(
    `.cp-record[data-cp="${recordingCheckpointId}"]`
  );
  if (button) {
    button.textContent = `■ Stop ${mmryFormatDuration(MmryRecorder.elapsedMs())}`;
  }
}

async function toggleRecording(checkpointId) {
  // Stopping the one that is running.
  if (recordingCheckpointId === checkpointId) {
    clearInterval(recordingTimer);
    recordingTimer = null;

    try {
      const { blob, extension } = await MmryRecorder.stop();
      const cp = findCheckpoint(checkpointId);
      if (cp && blob.size > 0) {
        cp.audioBlob = blob;
        cp.audioName = `${cp.name.replace(/\s+/g, "-").toLowerCase()}.${extension}`;
        persist();
      }
    } catch (err) {
      console.warn("Recording failed:", err);
    }

    recordingCheckpointId = null;
    renderList();
    return;
  }

  // Switching checkpoints mid-recording would silently discard the take.
  if (recordingCheckpointId !== null) {
    await toggleRecording(recordingCheckpointId);
  }

  try {
    await MmryRecorder.start();
    recordingCheckpointId = checkpointId;
    renderList();
    recordingTimer = setInterval(refreshRecordButton, 500);
  } catch (err) {
    const denied = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
    setPublishStatus(
      denied
        ? "Microphone blocked. Allow microphone access for this site, then try again."
        : `Couldn't start recording: ${err.message}`,
      "warn"
    );
  }
}

// A recording left running when the tab is closed would hold the microphone open.
window.addEventListener("pagehide", () => MmryRecorder.cancel());

// ---- Clip preview ----------------------------------------------------------------
// Listening back before publishing. Deliberately separate from MmryAudio, which
// owns the walk's playback and would be confused by a scrub-through here.

let previewingId = null;
let previewAudio = null;
let previewUrl = null;

function stopPreview() {
  if (previewAudio) {
    previewAudio.pause();
    previewAudio = null;
  }
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
  previewingId = null;
}

function togglePreview(checkpointId) {
  if (previewingId === checkpointId) {
    stopPreview();
    renderList();
    return;
  }

  stopPreview();

  const cp = findCheckpoint(checkpointId);
  if (!cp || !cp.audioBlob) return;

  previewUrl = URL.createObjectURL(cp.audioBlob);
  previewAudio = new Audio(previewUrl);
  previewingId = checkpointId;

  previewAudio.addEventListener("timeupdate", () => {
    const fill = document.querySelector(`.cp-progress-fill[data-cp="${checkpointId}"]`);
    const time = document.querySelector(`.cp-time[data-cp="${checkpointId}"]`);
    // Recorded blobs often report an unknown duration until they finish loading.
    const known = Number.isFinite(previewAudio.duration) && previewAudio.duration > 0;
    if (fill && known) {
      fill.style.width = `${(previewAudio.currentTime / previewAudio.duration) * 100}%`;
    }
    if (time) {
      time.textContent = known
        ? `${mmryFormatDuration(previewAudio.currentTime * 1000)} / ${mmryFormatDuration(previewAudio.duration * 1000)}`
        : mmryFormatDuration(previewAudio.currentTime * 1000);
    }
  });

  previewAudio.addEventListener("ended", () => {
    stopPreview();
    renderList();
  });

  previewAudio.play().catch((err) => {
    console.warn("Could not play back:", err);
    stopPreview();
    renderList();
  });

  renderList();
}

// Recording something new should not leave an old preview running underneath.
const originalToggleRecording = toggleRecording;
toggleRecording = function (checkpointId) {
  stopPreview();
  return originalToggleRecording(checkpointId);
};

window.addEventListener("pagehide", stopPreview);

// ---- Share bar -------------------------------------------------------------------

function updateShareBar() {
  const total = journey.checkpoints.length;
  const withAudio = journey.checkpoints.filter((cp) => cp.audioBlob).length;
  const summary = el("journey-summary");
  const button = el("publish-journey");
  if (!summary || !button) return;

  if (total === 0) {
    summary.textContent = "Nothing to share yet";
  } else if (withAudio === 0) {
    summary.textContent = `${total} checkpoint${total === 1 ? "" : "s"} · no sound yet`;
  } else {
    summary.textContent =
      `${total} checkpoint${total === 1 ? "" : "s"} · ${withAudio} with sound`;
  }

  button.disabled = withAudio === 0;
}

// ---- Place search ----------------------------------------------------------------
// Nominatim is OpenStreetMap's own geocoder: free, no key, but rate-limited to
// roughly one request a second, hence the debounce and the minimum query length.

let searchTimer = null;
let searchAbort = null;

function clearSearchResults() {
  el("search-results").innerHTML = "";
  el("search-results").classList.remove("visible");
}

async function runSearch(query) {
  if (searchAbort) searchAbort.abort();
  searchAbort = new AbortController();

  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=6&q=" +
    encodeURIComponent(query);

  try {
    const response = await fetch(url, { signal: searchAbort.signal });
    if (!response.ok) throw new Error(response.statusText);
    renderSearchResults(await response.json());
  } catch (err) {
    if (err.name !== "AbortError") console.warn("Search failed:", err);
  }
}

function renderSearchResults(places) {
  const list = el("search-results");
  list.innerHTML = "";

  if (places.length === 0) {
    const li = document.createElement("li");
    li.className = "search-empty";
    li.textContent = "Nothing found";
    list.appendChild(li);
    list.classList.add("visible");
    return;
  }

  places.forEach((place) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";

    // Nominatim returns one long comma-separated string; the first part is the
    // name and the rest is context, which reads better split apart.
    const parts = place.display_name.split(",");
    const name = document.createElement("strong");
    name.textContent = parts[0].trim();
    const detail = document.createElement("span");
    detail.textContent = parts.slice(1, 4).join(",").trim();

    button.append(name, detail);
    button.addEventListener("click", () => {
      map.setView([Number(place.lat), Number(place.lon)], 16);
      el("place-search").value = parts[0].trim();
      clearSearchResults();
    });

    li.appendChild(button);
    list.appendChild(li);
  });

  list.classList.add("visible");
}

el("place-search").addEventListener("input", (e) => {
  const query = e.target.value.trim();
  clearTimeout(searchTimer);

  if (query.length < 3) {
    clearSearchResults();
    return;
  }

  searchTimer = setTimeout(() => runSearch(query), 400);
});

el("place-search").addEventListener("blur", () => {
  // Delayed so a click on a result still lands before the list disappears.
  setTimeout(clearSearchResults, 180);
});

// ---- Centre on me ------------------------------------------------------------------

el("locate-me").addEventListener("click", () => {
  const button = el("locate-me");
  if (!("geolocation" in navigator)) return;

  button.classList.add("locating");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      button.classList.remove("locating");
      map.setView([pos.coords.latitude, pos.coords.longitude], 17);
    },
    (err) => {
      button.classList.remove("locating");
      showLocationHelp(explainLocationError(err));
    },
    { enableHighAccuracy: true, timeout: 15000 }
  );
});

// ---- Collapsing the panel ----------------------------------------------------------

el("panel-toggle").addEventListener("click", () => {
  const collapsed = document.body.classList.toggle("panel-collapsed");
  el("panel-toggle").setAttribute("aria-expanded", String(!collapsed));
  el("panel-toggle").setAttribute("aria-label", collapsed ? "Show panel" : "Hide panel");
  // Leaflet needs telling that its container changed size, or the map stays
  // rendered at the old width.
  setTimeout(() => map.invalidateSize(), 260);
});

// Jump to a fraction of the clip. Starts it playing if it was not already, so a
// click on the bar behaves the way it does in a music player.
function seekPreview(checkpointId, ratio) {
  if (previewingId !== checkpointId) {
    togglePreview(checkpointId);
  }

  // togglePreview re-renders, so the element to update is looked up afresh.
  const apply = () => {
    if (!previewAudio) return;
    const duration = previewAudio.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;

    previewAudio.currentTime = duration * ratio;

    const fill = document.querySelector(`.cp-progress-fill[data-cp="${checkpointId}"]`);
    if (fill) fill.style.width = `${ratio * 100}%`;
  };

  if (previewAudio && previewAudio.readyState > 0) {
    apply();
  } else if (previewAudio) {
    previewAudio.addEventListener("loadedmetadata", apply, { once: true });
  }
}
