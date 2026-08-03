import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from "react-native";
import { StatusBar } from "expo-status-bar";
import BuildScreen from "./src/screens/BuildScreen";
import WalkScreen from "./src/screens/WalkScreen";
import { loadJourney, saveJourney, emptyJourney } from "./src/storage/journeys";

// Ādaži, Latvia — where the prototype was walked.
const INITIAL_REGION = {
  latitude: 57.081058,
  longitude: 24.319797,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

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

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.title}>MMRY</Text>
        <View style={styles.toggle}>
          {["build", "walk"].map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.tab, mode === m && styles.tabActive]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
                {m === "build" ? "Build" : "Walk"}
              </Text>
            </TouchableOpacity>
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
  root: { flex: 1, backgroundColor: "#141414" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "700", letterSpacing: 1 },
  toggle: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    padding: 2,
  },
  tab: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999 },
  tabActive: { backgroundColor: "#ff8c00" },
  tabText: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: "#141414" },
});
