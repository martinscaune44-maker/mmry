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

let journey = {
  id: JOURNEY_ID,
  name: "",
  visibility: "unlisted",
  tags: [],
  checkpoints: [],
};
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
  // Hold a wider ring of tiles than the default 2, so panning runs out of
  // loaded map far less often.
  keepBuffer: 6,
  updateWhenIdle: false,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
}).addTo(map);

// Warm the zoom levels either side, so zooming does not start from blank tiles.
MmryTiles.attach(map, "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png");

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

function addCheckpoint(lat, lng, name) {
  journey.checkpoints.push({
    id: newId(),
    name: name || `Checkpoint ${journey.checkpoints.length + 1}`,
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

// A name the app generated, as opposed to one somebody typed.
const DEFAULT_NAME = /^Checkpoint \d+$/;

// The numbered badge counts positions, so a name still sitting at its default
// has to follow it. Otherwise deleting the sixth checkpoint leaves badge 6
// beside the name "Checkpoint 7", and a delete that worked looks like one that
// went wrong. A name somebody typed is never touched.
function renumberCheckpoints() {
  journey.checkpoints.forEach((cp, index) => {
    if (DEFAULT_NAME.test(cp.name || "")) cp.name = `Checkpoint ${index + 1}`;
  });
}

function removeCheckpoint(id) {
  const cp = findCheckpoint(id);
  if (!cp) return;

  // An empty checkpoint is worth nothing, so it goes immediately. One holding
  // a recording is a take somebody walked somewhere to make, and there is no
  // undo — that one asks first.
  if (cp.audioBlob && !confirm(`Delete "${cp.name}" and its audio? This cannot be undone.`)) {
    return;
  }

  // Deleting the checkpoint being recorded into would otherwise leave the
  // microphone open with nowhere to put the take.
  if (recordingCheckpointId === id) {
    clearInterval(recordingTimer);
    recordingTimer = null;
    recordingCheckpointId = null;
    MmryRecorder.cancel();
  }
  if (previewingId === id) stopPreview();

  journey.checkpoints = journey.checkpoints.filter((c) => c.id !== id);
  renumberCheckpoints();
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
      .bindPopup(() => checkpointPopup(cp));

    if (mode === "build") attachMapDelete(cp, marker, circle);

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

// The popup used to be the bare name, which put Leaflet's close "×" next to a
// checkpoint with no way to delete it — so the close button read as a delete
// button and did nothing. A real Delete sits beside it now.
function checkpointPopup(cp) {
  const wrap = document.createElement("div");
  wrap.className = "cp-popup";

  const name = document.createElement("span");
  name.className = "cp-popup-name";
  name.textContent = cp.name;
  wrap.appendChild(name);

  if (mode === "build") {
    const del = document.createElement("button");
    del.type = "button";
    del.className = "cp-popup-delete";
    del.textContent = "Delete";
    del.addEventListener("click", () => removeCheckpoint(cp.id));
    wrap.appendChild(del);
  }

  return wrap;
}

// Right-click on a desktop, press-and-hold on a phone. Both the pin and its
// zone circle are targets, since the circle is the far bigger thing to hit.
function attachMapDelete(cp, marker, circle) {
  const onContextMenu = (event) => {
    // Without this the browser's own menu opens over the map.
    L.DomEvent.preventDefault(event.originalEvent || event);
    removeCheckpoint(cp.id);
  };

  marker.on("contextmenu", onContextMenu);
  circle.on("contextmenu", onContextMenu);

  // Phones have no right-click, and Leaflet's synthetic contextmenu does not
  // fire dependably on a marker icon in iOS Safari. A held press is the touch
  // equivalent; dragging the pin cancels it, because touchmove fires first.
  const icon = marker.getElement();
  if (!icon) return;

  let pressTimer = null;
  const cancelPress = () => {
    clearTimeout(pressTimer);
    pressTimer = null;
  };

  icon.addEventListener(
    "touchstart",
    () => {
      cancelPress();
      pressTimer = setTimeout(() => {
        pressTimer = null;
        removeCheckpoint(cp.id);
      }, 550);
    },
    { passive: true }
  );

  ["touchend", "touchmove", "touchcancel"].forEach((event) => {
    icon.addEventListener(event, cancelPress, { passive: true });
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
    cp.recorded = false;
    cp.audioBlob = file;
    cp.audioName = file.name;
    cp.audioSpecs = null;
    cp.gain = 1;
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
  if (cp.audioSpecs) label.title = cp.audioSpecs;

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

  const ratioAt = (event) => {
    const rect = bar.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    return Math.min(Math.max(ratio, 0), 1);
  };

  // Seeking a MediaRecorder blob is not instant, so issuing one per pointermove
  // queues dozens of them and the audio lags well behind the finger. The fill
  // follows the drag immediately and the actual seek happens once, on release.
  bar.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    bar.setPointerCapture(event.pointerId);

    let ratio = ratioAt(event);
    scrubbingId = cp.id;
    fill.style.width = `${ratio * 100}%`;

    const onMove = (moveEvent) => {
      ratio = ratioAt(moveEvent);
      fill.style.width = `${ratio * 100}%`;
    };

    const onUp = () => {
      bar.removeEventListener("pointermove", onMove);
      bar.removeEventListener("pointerup", onUp);
      bar.removeEventListener("pointercancel", onUp);
      scrubbingId = null;
      seekPreview(cp.id, ratio);
    };

    bar.addEventListener("pointermove", onMove);
    bar.addEventListener("pointerup", onUp);
    bar.addEventListener("pointercancel", onUp);
  });

  const replace = document.createElement("label");
  replace.className = "cp-replace";
  replace.textContent = "Replace";
  replace.appendChild(makeFileInput(cp));

  wrap.append(play, label, time, bar, replace);

  const container = document.createElement("div");
  container.append(wrap);

  // What was actually captured, rather than what was asked for. Constraints are
  // requests, not guarantees, and this is the difference between diagnosing a
  // quality problem and speculating about one.
  const specs = document.createElement("div");
  specs.className = "cp-specs";
  specs.dataset.cp = cp.id;
  specs.textContent = cp.audioSpecs || "reading clip…";
  container.append(specs);

  if (!cp.audioSpecs) describeClip(cp);

  return container;
}

// Loudest sample and average level, in dBFS. 0 dB is the ceiling; quieter is
// more negative. Peak near 0 with a low average is a clipped, over-driven take.
function levelsOf(buffer) {
  let peak = 0;
  let sumSquares = 0;
  let count = 0;

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    // Every fourth sample is plenty for a level reading and four times faster.
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
      sumSquares += data[i] * data[i];
      count += 1;
    }
  }

  const rms = Math.sqrt(sumSquares / Math.max(count, 1));
  const dB = (v) => (v > 0 ? Math.round(20 * Math.log10(v)) : -99);
  return { peak: dB(peak), rms: dB(rms), peakLinear: peak };
}

// How much energy sits above 6 kHz. A recording that has been through a voice
// pipeline is low-passed around 4–8 kHz and reads far lower here, even when the
// file still claims a 44.1 kHz sample rate — which is exactly the case that
// looks identical in the format line but sounds muffled.
async function highFrequencyShare(buffer) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline) return null;

  const offline = new Offline(1, buffer.length, buffer.sampleRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;

  const highpass = offline.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 6000;
  highpass.Q.value = 0.7;

  source.connect(highpass);
  highpass.connect(offline.destination);
  source.start();

  const filtered = await offline.startRendering();
  const rmsOf = (buf) => {
    const data = buf.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i] * data[i];
    return Math.sqrt(sum / Math.max(data.length / 4, 1));
  };

  const whole = rmsOf(buffer);
  if (whole === 0) return 0;
  return Math.round((rmsOf(filtered) / whole) * 100);
}

// True when a stereo clip carries real signal in one channel and near-silence in
// the other — a laptop microphone reporting stereo it does not actually have.
function channelImbalance(buffer) {
  if (buffer.numberOfChannels < 2) return false;

  const energy = [];
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i] * data[i];
    energy.push(Math.sqrt(sum / Math.max(data.length / 4, 1)));
  }

  const [a, b] = energy;
  const louder = Math.max(a, b);
  const quieter = Math.min(a, b);
  if (louder === 0) return false;

  // More than about 12 dB apart is not a stereo image, it is a dead channel.
  return quieter / louder < 0.25;
}

// Decodes a clip and reports what it actually contains — not just its format,
// but its level and how much treble survived. Skipped for anything large.
let analysisContext = null;

async function describeClip(cp) {
  if (!cp.audioBlob || cp.audioBlob.size > 20 * 1024 * 1024) return;

  let ctx = null;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    ctx = new Ctx();
    analysisContext = ctx;
    const buffer = await ctx.decodeAudioData(await cp.audioBlob.arrayBuffer());

    const kbps = Math.round((cp.audioBlob.size * 8) / buffer.duration / 1000);
    const channels = buffer.numberOfChannels === 1 ? "mono" : "stereo";
    const { peak, rms, peakLinear } = levelsOf(buffer);
    const hf = await highFrequencyShare(buffer);
    // Only recordings are folded. A one-sided capture from a laptop microphone
    // is a fault; a one-sided music file is how somebody mixed it, and quietly
    // collapsing their stereo image would be wrong.
    const lopsided = channelImbalance(buffer);
    cp.mono = lopsided && cp.recorded === true;

    // With auto gain off the device hands back whatever level it feels like,
    // which on a laptop is usually quiet. Rather than re-encoding the file, work
    // out the boost that would bring its loudest moment just under the ceiling
    // and store it — playback applies it, here and on the published walk.
    cp.gain = peakLinear > 0
      ? Math.min(Math.max(0.891 / peakLinear, 1), 8) // 0.891 ≈ -1 dBFS
      : 1;

    cp.audioSpecs =
      `${(buffer.sampleRate / 1000).toFixed(1)} kHz · ${channels} · ${kbps} kbps · ` +
      `peak ${peak} dB · avg ${rms} dB` +
      (hf === null ? "" : ` · treble ${hf}%`) +
      (cp.gain > 1.05 ? ` · +${(20 * Math.log10(cp.gain)).toFixed(0)} dB applied` : "") +
      (lopsided
        ? cp.mono
          ? " · one channel — folded to centre"
          : " · one channel (left as recorded)"
        : "");

    const node = document.querySelector(`.cp-specs[data-cp="${cp.id}"]`);
    if (node) node.textContent = cp.audioSpecs;
    persist();
  } catch (err) {
    console.warn("Could not read clip details:", err);
    const node = document.querySelector(`.cp-specs[data-cp="${cp.id}"]`);
    if (node) node.textContent = `couldn't read clip (${err.name || "error"})`;
  } finally {
    // Left open, these accumulate and can themselves affect the audio device.
    if (ctx) {
      await ctx.close().catch(() => {});
      if (analysisContext === ctx) analysisContext = null;
    }
  }
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
  journey = {
    id: JOURNEY_ID,
    name: journey.name,
    visibility: journey.visibility || "unlisted",
    tags: journey.tags || [],
    checkpoints: [],
  };
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
  })
  .finally(() => {
    renderAccountBar();
    renderTagChips();
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

el("visibility").addEventListener("change", () => {
  journey.visibility = el("visibility").value;
  persist();
  updateVisibilityControl();
});

// Signing in happens on another page, so this fires when coming back to a tab
// that was left open.
MmryAuth.onChange(renderAccountBar);
window.addEventListener("pageshow", renderAccountBar);

publishButton.addEventListener("click", async () => {
  const withAudio = journey.checkpoints.filter((cp) => cp.audioBlob);
  if (withAudio.length === 0) {
    setPublishStatus("Attach audio to at least one checkpoint first.", "warn");
    return;
  }

  publishButton.disabled = true;
  shareResult.classList.remove("visible");

  try {
    const { url, visibility } = await MmryShare.publish(journey, (step, total, label) => {
      setPublishStatus(`${label}… (${step}/${total})`);
    });

    shareLinkInput.value = url;
    shareResult.classList.add("visible");

    if (visibility === "private") {
      setPublishStatus("Saved privately. Only you can open this link.", "ok");
    } else if (MmryAuth.signedIn()) {
      setPublishStatus("Ready to send. It's in My walks if you need it again.", "ok");
    } else {
      setPublishStatus("Ready to send. Anyone with this link can walk it.", "ok");
    }
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
        cp.recorded = true;
        cp.audioBlob = blob;
        cp.audioName = `${cp.name.replace(/\s+/g, "-").toLowerCase()}.${extension}`;
        cp.audioSpecs = null;
        cp.gain = 1;
        cp.mono = false;
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
let scrubbingId = null;
let previewContext = null;

function stopPreview() {
  if (previewAudio) {
    previewAudio.pause();
    // Pausing keeps the output device open. Detaching the source releases it.
    previewAudio.removeAttribute("src");
    previewAudio.srcObject = null;
    previewAudio.load();
    previewAudio = null;
  }
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
  if (previewContext) {
    previewContext.close().catch(() => {});
    previewContext = null;
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
  previewAudio.preload = "auto";
  previewingId = checkpointId;

  // Element volume caps at 1, so a quiet recording cannot be lifted through it.
  // Routing through a gain node applies the same boost the published walk uses,
  // so the preview is what the listener will actually hear.
  if ((cp.gain && cp.gain > 1.01) || cp.mono) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      previewContext = new Ctx();
      const source = previewContext.createMediaElementSource(previewAudio);
      const gainNode = previewContext.createGain();
      gainNode.gain.value = cp.gain || 1;

      if (cp.mono) {
        const fold = previewContext.createGain();
        fold.channelCount = 1;
        fold.channelCountMode = "explicit";
        fold.channelInterpretation = "speakers";
        source.connect(fold);
        fold.connect(gainNode);
      } else {
        source.connect(gainNode);
      }

      gainNode.connect(previewContext.destination);
    } catch (err) {
      console.warn("Could not apply preview gain:", err);
      previewContext = null;
    }
  }

  // Bound to this element rather than the module-level reference: stopPreview
  // nulls that, and an event already queued would then fire against nothing.
  const audio = previewAudio;

  audio.addEventListener("timeupdate", () => {
    // While dragging, the fill belongs to the finger, not to playback.
    if (scrubbingId === checkpointId) return;
    const fill = document.querySelector(`.cp-progress-fill[data-cp="${checkpointId}"]`);
    const time = document.querySelector(`.cp-time[data-cp="${checkpointId}"]`);
    // Recorded blobs often report an unknown duration until they finish loading.
    const known = Number.isFinite(audio.duration) && audio.duration > 0;
    if (fill && known) {
      fill.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
    }
    if (time) {
      time.textContent = known
        ? `${mmryFormatDuration(audio.currentTime * 1000)} / ${mmryFormatDuration(audio.duration * 1000)}`
        : mmryFormatDuration(audio.currentTime * 1000);
    }
  });

  audio.addEventListener("ended", () => {
    stopPreview();
    renderList();
  });

  audio.play().catch((err) => {
    console.warn("Could not play back:", err);
    stopPreview();
    renderList();
  });

  renderList();
}

// Recording something new should not leave an old preview running underneath.
async function silenceAudioOutput() {
  stopPreview();

  if (analysisContext) {
    await analysisContext.close().catch(() => {});
    analysisContext = null;
  }

  if (previewContext) {
    await previewContext.close().catch(() => {});
    previewContext = null;
  }

  // Any <audio> the page created, whether or not we still hold a reference.
  document.querySelectorAll("audio").forEach((el) => {
    el.pause();
    el.removeAttribute("src");
    el.load();
  });
}

const originalToggleRecording = toggleRecording;
toggleRecording = async function (checkpointId) {
  // Only when starting: stopping a take must not be delayed.
  if (recordingCheckpointId !== checkpointId) {
    await silenceAudioOutput();
  } else {
    stopPreview();
  }
  return originalToggleRecording(checkpointId);
};

window.addEventListener("pagehide", stopPreview);

// ---- Share bar -------------------------------------------------------------------

// ---- Account, tags and visibility -------------------------------------------
//
// All optional. Everything below this line changes what happens to a walk once
// it is published; none of it gates building one.

function renderAccountBar() {
  const who = el("account-who");
  const action = el("account-action");
  if (!who || !action) return;

  const user = MmryAuth.user();
  if (user) {
    who.textContent = user.email || "Signed in";
    action.textContent = "My walks";
  } else {
    who.textContent = "Not signed in";
    action.textContent = "Sign in";
  }

  updateVisibilityControl();
}

function renderTagChips() {
  const host = el("tag-chips");
  if (!host) return;
  host.innerHTML = "";

  const chosen = journey.tags || [];

  TAG_VOCABULARY.forEach((tag) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = tag;
    chip.setAttribute("aria-pressed", String(chosen.includes(tag)));
    chip.classList.toggle("on", chosen.includes(tag));

    chip.addEventListener("click", () => {
      const tags = journey.tags || [];
      if (tags.includes(tag)) {
        journey.tags = tags.filter((t) => t !== tag);
      } else if (tags.length >= 5) {
        // The database caps it at five; saying so beats a rejected publish.
        setPublishStatus("Five tags is the limit.", "warn");
        return;
      } else {
        journey.tags = [...tags, tag];
      }
      persist();
      renderTagChips();
    });

    host.appendChild(chip);
  });
}

function updateVisibilityControl() {
  const select = el("visibility");
  const note = el("visibility-note");
  if (!select || !note) return;

  const signedIn = MmryAuth.signedIn();

  // A walk nobody owns cannot be private or public: there is no account to
  // open it again, and nothing to list it under. The database refuses this
  // too — the control just says so before the publish fails.
  Array.from(select.options).forEach((option) => {
    option.disabled = !signedIn && option.value !== "unlisted";
  });

  if (!signedIn) {
    select.value = "unlisted";
    journey.visibility = "unlisted";
    note.textContent = "Sign in to keep a walk private or make it public.";
  } else {
    select.value = journey.visibility || "unlisted";
    note.textContent =
      select.value === "private"
        ? "Only you can open it. Nobody you send the link to will get in."
        : "";
  }
}

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

    // pointerdown, not click: the input's blur handler hides this list, and on a
    // slow tap it was disappearing before the click ever landed.
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      goToPlace(place, parts[0].trim());
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

// Results are dismissed by choosing one or by tapping the map, rather than on
// blur — blur races the tap that selects a result.
map.on("click", clearSearchResults);

el("place-search").addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clearSearchResults();
    el("place-search").blur();
  }
});

// A pin, so choosing a place visibly puts it somewhere rather than just moving
// the map to a patch of street that looks like any other.
let searchMarker = null;

function goToPlace(place, label) {
  const lat = Number(place.lat);
  const lng = Number(place.lon);

  if (searchMarker) map.removeLayer(searchMarker);

  // Built as a node rather than an HTML string, so the button can carry a real
  // handler and a place name containing an apostrophe cannot break the markup.
  const popup = document.createElement("div");
  popup.className = "search-popup";

  const title = document.createElement("strong");
  title.textContent = label;

  const add = document.createElement("button");
  add.type = "button";
  add.textContent = "+ Add as checkpoint";
  add.addEventListener("click", () => {
    addCheckpoint(lat, lng, label);
    map.removeLayer(searchMarker);
    searchMarker = null;
  });

  popup.append(title, add);

  searchMarker = L.marker([lat, lng], { opacity: 0.9 })
    .addTo(map)
    .bindPopup(popup)
    .openPopup();

  // Nominatim gives a bounding box for the place, which frames a town properly
  // rather than dropping you at an arbitrary zoom over its centre.
  const box = place.boundingbox;
  if (box && box.length === 4) {
    map.fitBounds(
      [
        [Number(box[0]), Number(box[2])],
        [Number(box[1]), Number(box[3])],
      ],
      { maxZoom: 17 }
    );
  } else {
    map.setView([lat, lng], 16);
  }

  el("place-search").value = label;
  el("place-search").blur();
  clearSearchResults();
}

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

  // Leaflet only recalculates its size when told. Telling it once at the end
  // left the map rendered at the old width for the whole animation and then
  // snapping into place, so tell it on every frame while the panel moves.
  const started = performance.now();
  const follow = () => {
    map.invalidateSize({ animate: false, pan: false });
    if (performance.now() - started < 320) requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);
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
