// ---------------------------------------------------------------------------
// Design tokens.
//
// Kept in one place so the app and the web prototype stay recognisably the same
// product. Values mirror style.css in the repo root.
// ---------------------------------------------------------------------------

export const colors = {
  bg: "#0e0e0f",
  surface: "#17181a",
  surfaceHigh: "#1f2124",
  line: "rgba(255,255,255,0.09)",
  lineStrong: "rgba(255,255,255,0.16)",

  text: "#f5f5f6",
  textDim: "#9a9ba0",
  textFaint: "#6b6c72",

  accent: "#ff8c00",
  accentInk: "#17110a",
  accentSoft: "rgba(255,140,0,0.14)",
  accentLine: "rgba(255,140,0,0.55)",

  zone: "#3388ff",
  zoneFill: "rgba(51,136,255,0.15)",
  zoneFillActive: "rgba(255,140,0,0.3)",

  danger: "#ff5c5c",
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const type = {
  title: { fontSize: 18, fontWeight: "700", letterSpacing: 1.5 },
  heading: { fontSize: 17, fontWeight: "700", letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: "500" },
  label: { fontSize: 13, fontWeight: "600" },
  caption: { fontSize: 12, fontWeight: "500" },
};

export const shadow = {
  panel: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 16,
  },
  pill: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  accent: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
};

// Dark map styling, so the map does not glare white against the dark chrome.
// Applied on Android (Google Maps); iOS gets it via userInterfaceStyle.
export const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#1d1f21" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1d1f21" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a8d91" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#2c2f33" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#15181b" }],
  },
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
];
