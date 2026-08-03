// ---------------------------------------------------------------------------
// MMRY Soundwalk — zone configuration
//
// Fill in real coordinates and audio files here. Everything else in the app
// reads from this file, so this is the only place you should need to edit
// to set up a real walk.
//
// lat / lng   : GPS coordinates of the zone center (decimal degrees)
// radius      : trigger radius in meters (how close the user must be)
// audio       : path to an audio file in the audio/ folder (mp3/ogg/m4a)
// fadeMs      : how long the fade in/out takes, in milliseconds
// ---------------------------------------------------------------------------

const ZONES = [
  {
    id: "zone-1",
    name: "Zone 1",
    lat: 57.081058,
    lng: 24.319797,
    radius: 20,
    audio: "audio/xyv.mp3",
    fadeMs: 1500,
  },
  {
    id: "zone-2",
    name: "Zone 2",
    lat: 57.0818588,
    lng: 24.3210157,
    radius: 20,
    audio: "audio/cisinitosteri.mp3",
    fadeMs: 1500,
  },
  {
    id: "zone-3",
    name: "Zone 3 — Placeholder",
    lat: 57.082058,
    lng: 24.319797,
    radius: 20,
    audio: "audio/zone-3.wav",
    fadeMs: 1500,
  },
  // {
  //   id: "zone-4",
  //   name: "Zone 4 — Placeholder",
  //   lat: 57.0000,
  //   lng: 24.0000,
  //   radius: 20,
  //   audio: "audio/zone-4.mp3",
  //   fadeMs: 1500,
  // },
];

// Map starting view (defaults to roughly the center of Ādaži, Latvia)
const MAP_CENTER = { lat: 57.081058, lng: 24.319797 };
const MAP_ZOOM = 16;
