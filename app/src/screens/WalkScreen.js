import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Animated, Easing } from "react-native";
import MapView, { Marker, Circle } from "react-native-maps";
import { startTracking } from "../location";
import { configureAudioSession, loadClips, unloadAll } from "../engine/audio";
import { primeJourney } from "../engine/session";
import { distance } from "../engine/geo";
import { colors, radius, space, type, shadow, darkMapStyle } from "../theme";

export default function WalkScreen({ journey, region, setRegion }) {
  const [walking, setWalking] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [mode, setMode] = useState(null);
  const [nearest, setNearest] = useState(null);
  const [error, setError] = useState(null);

  const trackerRef = useRef(null);
  const journeyRef = useRef(journey);
  const pulse = useRef(new Animated.Value(0)).current;

  journeyRef.current = journey;

  useEffect(() => {
    return () => {
      trackerRef.current?.stop();
      unloadAll();
    };
  }, []);

  // Slow breathing ring while inside a zone — legible at a glance, and it
  // reads clearly on a screen recording.
  useEffect(() => {
    if (!activeId) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [activeId, pulse]);

  const findCheckpoint = (id) =>
    journeyRef.current.checkpoints.find((cp) => cp.id === id);

  const begin = async () => {
    setError(null);

    const withAudio = journey.checkpoints.filter((cp) => cp.audioUri);
    if (withAudio.length === 0) {
      setError("No audio attached yet");
      return;
    }

    try {
      await configureAudioSession();
      loadClips(withAudio.map((cp) => ({ id: cp.id, uri: cp.audioUri })));
      primeJourney(journey);

      const tracker = await startTracking(journey.checkpoints, {
        onActiveChange: setActiveId,
        onPosition: ({ latitude, longitude }) => {
          let best = null;
          journeyRef.current.checkpoints.forEach((cp) => {
            const d = distance(latitude, longitude, cp.lat, cp.lng);
            if (!best || d < best.distance) best = { cp, distance: d };
          });
          setNearest(best);
        },
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
    setNearest(null);
    setMode(null);
  };

  const activeName = activeId ? findCheckpoint(activeId)?.name : null;
  const hasCheckpoints = journey.checkpoints.length > 0;

  const statusLabel = error
    ? error
    : activeName
    ? activeName
    : walking
    ? "Walking"
    : hasCheckpoints
    ? "Ready"
    : "No checkpoints yet";

  const showDistance = walking && !activeName && nearest;
  const metres = nearest ? Math.round(nearest.distance) : 0;
  const distanceText =
    metres > 999 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`;

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        region={region}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        showsMyLocationButton={false}
        followsUserLocation={walking}
        customMapStyle={darkMapStyle}
        userInterfaceStyle="dark"
      >
        {journey.checkpoints.map((cp) => (
          <React.Fragment key={cp.id}>
            <Circle
              center={{ latitude: cp.lat, longitude: cp.lng }}
              radius={cp.radius}
              strokeWidth={cp.id === activeId ? 3 : 2}
              strokeColor={cp.id === activeId ? colors.accent : colors.zone}
              fillColor={
                cp.id === activeId ? colors.zoneFillActive : colors.zoneFill
              }
            />
            <Marker
              coordinate={{ latitude: cp.lat, longitude: cp.lng }}
              title={cp.name}
              pinColor={cp.id === activeId ? "orange" : undefined}
            />
          </React.Fragment>
        ))}
      </MapView>

      <View style={styles.statusStack} pointerEvents="none">
        <View style={[styles.pill, activeName && styles.pillActive]}>
          <View style={styles.dotWrap}>
            {activeName && (
              <Animated.View
                style={[
                  styles.ring,
                  {
                    opacity: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.7, 0],
                    }),
                    transform: [
                      {
                        scale: pulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 2.8],
                        }),
                      },
                    ],
                  },
                ]}
              />
            )}
            <View style={[styles.dot, activeName && styles.dotActive]} />
          </View>
          <Text style={styles.pillText} numberOfLines={1}>
            {statusLabel}
          </Text>
        </View>

        {showDistance && (
          <View style={styles.distancePill}>
            <Text style={styles.distanceText}>
              {nearest.cp.name} · <Text style={styles.distanceValue}>{distanceText}</Text> away
            </Text>
          </View>
        )}

        {walking && mode && (
          <View style={styles.modePill}>
            <Text style={styles.modeText}>
              {mode === "geofence"
                ? "Background · pocket the phone"
                : "Foreground · keep the screen on"}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={walking ? end : begin}
          disabled={!hasCheckpoints}
          style={({ pressed }) => [
            styles.button,
            walking && styles.buttonStop,
            !hasCheckpoints && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text
            style={[
              styles.buttonText,
              walking && styles.buttonTextStop,
              !hasCheckpoints && styles.buttonTextDisabled,
            ]}
          >
            {walking ? "Stop walking" : "Start walking"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  map: { flex: 1 },

  statusStack: {
    position: "absolute",
    top: space.lg,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: space.sm,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(23,24,26,0.94)",
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: radius.pill,
    maxWidth: "92%",
    ...shadow.pill,
  },
  pillActive: {
    borderColor: colors.accentLine,
    backgroundColor: "rgba(38,26,10,0.94)",
  },
  pillText: { ...type.heading, color: colors.text, flexShrink: 1 },

  dotWrap: { width: 9, height: 9, alignItems: "center", justifyContent: "center" },
  ring: {
    position: "absolute",
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.accent,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.textFaint,
  },
  dotActive: { backgroundColor: colors.accent },

  distancePill: {
    backgroundColor: "rgba(23,24,26,0.88)",
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  distanceText: { ...type.caption, fontSize: 13, color: colors.textDim },
  distanceValue: { color: colors.text, fontWeight: "700" },

  modePill: {
    backgroundColor: "rgba(23,24,26,0.7)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  modeText: { ...type.caption, color: colors.textFaint },

  footer: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.lg,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 15,
    alignItems: "center",
    ...shadow.accent,
  },
  buttonStop: {
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonDisabled: {
    backgroundColor: colors.surfaceHigh,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  buttonText: { fontSize: 16, fontWeight: "700", color: colors.accentInk },
  buttonTextStop: { color: colors.text },
  buttonTextDisabled: { color: colors.textFaint },
});
