import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import MapView, { Marker, Circle } from "react-native-maps";
import * as Location from "expo-location";
import * as DocumentPicker from "expo-document-picker";
import { newCheckpointId } from "../storage/journeys";

const DEFAULT_RADIUS = 20;
const DEFAULT_FADE_MS = 1500;

export default function BuildScreen({ journey, setJourney, region, setRegion }) {
  const update = (next) => setJourney({ ...journey, ...next });

  const addCheckpoint = (lat, lng) => {
    update({
      checkpoints: [
        ...journey.checkpoints,
        {
          id: newCheckpointId(),
          name: `Checkpoint ${journey.checkpoints.length + 1}`,
          lat,
          lng,
          radius: DEFAULT_RADIUS,
          fadeMs: DEFAULT_FADE_MS,
          audioUri: null,
          audioName: null,
        },
      ],
    });
  };

  const addHere = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    addCheckpoint(pos.coords.latitude, pos.coords.longitude);
    setRegion({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      latitudeDelta: 0.004,
      longitudeDelta: 0.004,
    });
  };

  const pickAudio = async (id) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "audio/*",
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const file = result.assets[0];
    update({
      checkpoints: journey.checkpoints.map((cp) =>
        cp.id === id ? { ...cp, audioUri: file.uri, audioName: file.name } : cp
      ),
    });
  };

  const editCheckpoint = (id, changes) => {
    update({
      checkpoints: journey.checkpoints.map((cp) =>
        cp.id === id ? { ...cp, ...changes } : cp
      ),
    });
  };

  const removeCheckpoint = (id) => {
    update({ checkpoints: journey.checkpoints.filter((cp) => cp.id !== id) });
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        region={region}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        onPress={(e) => {
          const { latitude, longitude } = e.nativeEvent.coordinate;
          addCheckpoint(latitude, longitude);
        }}
      >
        {journey.checkpoints.map((cp) => (
          <React.Fragment key={cp.id}>
            <Circle
              center={{ latitude: cp.lat, longitude: cp.lng }}
              radius={cp.radius}
              strokeColor="#3388ff"
              fillColor="rgba(51,136,255,0.15)"
            />
            <Marker
              coordinate={{ latitude: cp.lat, longitude: cp.lng }}
              title={cp.name}
              draggable
              onDragEnd={(e) => {
                const { latitude, longitude } = e.nativeEvent.coordinate;
                editCheckpoint(cp.id, { lat: latitude, lng: longitude });
              }}
            />
          </React.Fragment>
        ))}
      </MapView>

      <View style={styles.panel}>
        <TextInput
          style={styles.journeyName}
          placeholder="Untitled journey"
          placeholderTextColor="#777"
          value={journey.name}
          onChangeText={(name) => update({ name })}
        />

        <View style={styles.actions}>
          <TouchableOpacity style={styles.primary} onPress={addHere}>
            <Text style={styles.primaryText}>+ Add at my location</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>or tap the map</Text>
        </View>

        <ScrollView style={styles.list}>
          {journey.checkpoints.length === 0 ? (
            <Text style={styles.empty}>
              No checkpoints yet. Tap the map to place one.
            </Text>
          ) : (
            journey.checkpoints.map((cp, i) => (
              <View key={cp.id} style={styles.row}>
                <View style={styles.rowTop}>
                  <View style={styles.num}>
                    <Text style={styles.numText}>{i + 1}</Text>
                  </View>
                  <TextInput
                    style={styles.cpName}
                    value={cp.name}
                    onChangeText={(name) => editCheckpoint(cp.id, { name })}
                  />
                  <TouchableOpacity onPress={() => removeCheckpoint(cp.id)}>
                    <Text style={styles.delete}>×</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.rowMeta}>
                  <Text style={styles.metaLabel}>Radius</Text>
                  <TextInput
                    style={styles.radius}
                    keyboardType="number-pad"
                    value={String(cp.radius)}
                    onChangeText={(v) =>
                      editCheckpoint(cp.id, {
                        radius: Number(v) || DEFAULT_RADIUS,
                      })
                    }
                  />
                  <Text style={styles.metaLabel}>m</Text>
                  <TouchableOpacity onPress={() => pickAudio(cp.id)}>
                    <Text style={styles.audio} numberOfLines={1}>
                      {cp.audioName ? `♪ ${cp.audioName}` : "Choose audio…"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  panel: {
    backgroundColor: "#1c1c1c",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    maxHeight: "50%",
  },
  journeyName: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    color: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  primary: {
    backgroundColor: "#ff8c00",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  primaryText: { color: "#141414", fontWeight: "600", fontSize: 14 },
  hint: { color: "#888", fontSize: 13 },
  list: { marginBottom: 12 },
  empty: { color: "#777", textAlign: "center", paddingVertical: 20, fontSize: 14 },
  row: { borderTopWidth: 1, borderTopColor: "#2e2e2e", paddingVertical: 10 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  num: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#3388ff",
    alignItems: "center",
    justifyContent: "center",
  },
  numText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  cpName: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#3a3a3a",
    paddingVertical: 4,
  },
  delete: { color: "#ff5c5c", fontSize: 24, paddingHorizontal: 6 },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 32,
    paddingTop: 8,
  },
  metaLabel: { color: "#aaa", fontSize: 13 },
  radius: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 6,
    color: "#fff",
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 13,
    minWidth: 46,
  },
  audio: { color: "#ff8c00", fontSize: 13, textDecorationLine: "underline", flexShrink: 1 },
});
