import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, SafeAreaView } from "react-native";
import { StatusBar } from "expo-status-bar";
import BuildScreen from "./src/screens/BuildScreen";
import WalkScreen from "./src/screens/WalkScreen";
import { loadJourney, saveJourney, emptyJourney } from "./src/storage/journeys";
import { colors, radius, space, type } from "./src/theme";

// Ādaži, Latvia — where the prototype was walked.
const INITIAL_REGION = {
  latitude: 57.081058,
  longitude: 24.319797,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

const MODES = [
  { key: "build", label: "Build" },
  { key: "walk", label: "Walk" },
];

export default function App() {
  const [journey, setJourney] = useState(emptyJourney());
  const [mode, setMode] = useState("build");
  const [region, setRegion] = useState(INITIAL_REGION);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadJourney().then((saved) => {
      setJourney(saved);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) saveJourney(journey);
  }, [journey, loaded]);

  const count = journey.checkpoints.length;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.mark}>
            <View style={styles.markDot} />
          </View>
          <View>
            <Text style={styles.title}>MMRY</Text>
            <Text style={styles.subtitle}>
              {count === 0
                ? "No checkpoints"
                : `${count} checkpoint${count === 1 ? "" : "s"}`}
            </Text>
          </View>
        </View>

        <View style={styles.toggle}>
          {MODES.map((m) => (
            <Pressable
              key={m.key}
              onPress={() => setMode(m.key)}
              style={[styles.tab, mode === m.key && styles.tabActive]}
            >
              <Text
                style={[styles.tabText, mode === m.key && styles.tabTextActive]}
              >
                {m.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {mode === "build" ? (
        <BuildScreen
          journey={journey}
          setJourney={setJourney}
          region={region}
          setRegion={setRegion}
        />
      ) : (
        <WalkScreen journey={journey} region={region} setRegion={setRegion} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 11 },
  mark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.zone,
    backgroundColor: colors.zoneFill,
    alignItems: "center",
    justifyContent: "center",
  },
  markDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.caption, color: colors.textFaint, marginTop: 1 },

  toggle: {
    flexDirection: "row",
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    padding: 3,
  },
  tab: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: radius.pill },
  tabActive: { backgroundColor: colors.accent },
  tabText: { ...type.label, color: colors.textDim },
  tabTextActive: { color: colors.accentInk },
});
