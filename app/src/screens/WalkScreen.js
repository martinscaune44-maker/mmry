import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import MapView, { Marker, Circle } from "react-native-maps";
import { startTracking } from "../location";
import { configureAudioSession, loadClips, fade, unloadAll } from "../engine/audio";

export default function WalkScreen({ journey, region, setRegion }) {
  const [walking, setWalking] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [mode, setMode] = useState(null);
  const [error, setError] = useState(null);
  const trackerRef = useRef(null);
  const journeyRef = useRef(journey);

  journeyRef.current = journey;

  useEffect(() => {
    return () => {
      trackerRef.current?.stop();
      unloadAll();
    };
  }, []);

  const findCheckpoint = (id) =>
    journeyRef.current.checkpoints.find((cp) => cp.id === id);

  const begin = async () => {
    setError(null);

    const withAudio = journey.checkpoints.filter((cp) => cp.audioUri);
    if (withAudio.length === 0) {
      setError("No audio attached to any checkpoint yet.");
      return;
    }

    try {
      await configureAudioSession();
      loadClips(withAudio.map((cp) => ({ id: cp.id, uri: cp.audioUri })));

      const tracker = await startTracking(journey.checkpoints, {
        onEnter: (id) => {
          const cp = findCheckpoint(id);
          if (cp?.audioUri) fade(id, 1, cp.fadeMs);
        },
        onExit: (id) => {
          const cp = findCheckpoint(id);
          if (cp?.audioUri) fade(id, 0, cp.fadeMs);
        },
        onActiveChange: setActiveId,
        onPosition: () => {},
      });

      trackerRef.current = tracker;
      setMode(tracker.mode);
      setWalking(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const end = async () => {
    await trackerRef.current?.stop();
    trackerRef.current = null;
    unloadAll();
    setWalking(false);
    setActiveId(null);
  };

  const activeName = activeId ? findCheckpoint(activeId)?.name : null;

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        region={region}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        followsUserLocation={walking}
      >
        {journey.checkpoints.map((cp) => (
          <React.Fragment key={cp.id}>
            <Circle
              center={{ latitude: cp.lat, longitude: cp.lng }}
              radius={cp.radius}
              strokeColor={cp.id === activeId ? "#ff8c00" : "#3388ff"}
              fillColor={
                cp.id === activeId
                  ? "rgba(255,140,0,0.35)"
                  : "rgba(51,136,255,0.15)"
              }
            />
            <Marker
              coordinate={{ latitude: cp.lat, longitude: cp.lng }}
              title={cp.name}
            />
          </React.Fragment>
        ))}
      </MapView>

      <View style={styles.indicator}>
        <View style={[styles.dot, activeName && styles.dotActive]} />
        <Text style={styles.indicatorText} numberOfLines={1}>
          {error
            ? error
            : activeName
            ? activeName
            : walking
            ? "No active checkpoint"
            : "Not walking"}
        </Text>
      </View>

      {walking && mode && (
        <Text style={styles.mode}>
          {mode === "geofence"
            ? "Background geofencing — pocket the phone"
            : "Foreground only — keep the screen on"}
        </Text>
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, walking && styles.buttonStop]}
          onPress={walking ? end : begin}
        >
          <Text style={styles.buttonText}>
            {walking ? "Stop walking" : "Start walking"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  indicator: {
    position: "absolute",
    top: 60,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(20,20,20,0.85)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    maxWidth: "90%",
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#888" },
  dotActive: { backgroundColor: "#ff8c00" },
  indicatorText: { color: "#fff", fontSize: 14, fontWeight: "500", flexShrink: 1 },
  mode: {
    position: "absolute",
    top: 100,
    alignSelf: "center",
    color: "#bbb",
    fontSize: 12,
    backgroundColor: "rgba(20,20,20,0.7)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  footer: { backgroundColor: "#1c1c1c", padding: 16 },
  button: {
    backgroundColor: "#ff8c00",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonStop: { backgroundColor: "#444" },
  buttonText: { color: "#141414", fontWeight: "700", fontSize: 16 },
});
