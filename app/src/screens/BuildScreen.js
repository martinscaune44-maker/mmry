import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import MapView, { Marker, Circle } from "react-native-maps";
import * as Location from "expo-location";
import * as DocumentPicker from "expo-document-picker";
import { newCheckpointId } from "../storage/journeys";
import { colors, radius, space, type, shadow, darkMapStyle } from "../theme";

const DEFAULT_RADIUS = 20;
const DEFAULT_FADE_MS = 1500;

export default function BuildScreen({ journey, setJourney, region, setRegion }) {
  const [locating, setLocating] = useState(false);
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
    setLocating(true);
    try {
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
    } finally {
      setLocating(false);
    }
  };

  const pickAudio = async (id) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "audio/*",
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const file = result.assets[0];
    editCheckpoint(id, { audioUri: file.uri, audioName: file.name });
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
        showsMyLocationButton={false}
        customMapStyle={darkMapStyle}
        userInterfaceStyle="dark"
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
              strokeColor={colors.zone}
              strokeWidth={2}
              fillColor={colors.zoneFill}
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
        <View style={styles.grabber} />

        <View style={styles.panelHead}>
          <TextInput
            style={styles.journeyName}
            placeholder="Untitled journey"
            placeholderTextColor={colors.textFaint}
            value={journey.name}
            onChangeText={(name) => update({ name })}
          />
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={addHere}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>
              {locating ? "Locating…" : "+ Add at my location"}
            </Text>
          </Pressable>
          <Text style={styles.hint}>or tap the map</Text>
        </View>

        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {journey.checkpoints.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No checkpoints yet</Text>
              <Text style={styles.emptyBody}>
                Tap the map to place one, then attach a sound to it.
              </Text>
            </View>
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
                    placeholder="Name this place"
                    placeholderTextColor={colors.textFaint}
                    onChangeText={(name) => editCheckpoint(cp.id, { name })}
                  />
                  <Pressable
                    onPress={() => removeCheckpoint(cp.id)}
                    hitSlop={10}
                    style={({ pressed }) => pressed && styles.pressed}
                  >
                    <Text style={styles.delete}>×</Text>
                  </Pressable>
                </View>

                <View style={styles.rowMeta}>
                  <Text style={styles.metaLabel}>Radius</Text>
                  <TextInput
                    style={styles.radiusInput}
                    keyboardType="number-pad"
                    value={String(cp.radius)}
                    onChangeText={(v) =>
                      editCheckpoint(cp.id, {
                        radius: Number(v) || DEFAULT_RADIUS,
                      })
                    }
                  />
                  <Text style={styles.metaLabel}>m</Text>
                  <Pressable
                    onPress={() => pickAudio(cp.id)}
                    style={({ pressed }) => [
                      styles.audioChip,
                      cp.audioName && styles.audioChipSet,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.audioText,
                        cp.audioName && styles.audioTextSet,
                      ]}
                      numberOfLines={1}
                    >
                      {cp.audioName ? `♪ ${cp.audioName}` : "Choose audio…"}
                    </Text>
                  </Pressable>
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
  container: { flex: 1, backgroundColor: colors.bg },
  map: { flex: 1 },

  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    maxHeight: "56%",
    ...shadow.panel,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    alignSelf: "center",
    marginTop: 9,
  },
  panelHead: { paddingHorizontal: space.lg, paddingTop: space.md },
  journeyName: {
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: 13,
    paddingVertical: 10,
    ...type.body,
  },

  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    flexWrap: "wrap",
  },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 11,
    ...shadow.accent,
  },
  primaryText: { fontSize: 14, fontWeight: "700", color: colors.accentInk },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  hint: { ...type.caption, fontSize: 13, color: colors.textFaint },

  list: { paddingHorizontal: space.lg },
  empty: { paddingVertical: 30, alignItems: "center", gap: 6 },
  emptyTitle: { ...type.body, color: colors.textDim },
  emptyBody: {
    ...type.caption,
    fontSize: 13,
    color: colors.textFaint,
    textAlign: "center",
    lineHeight: 19,
  },

  row: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 13 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  num: {
    width: 23,
    height: 23,
    borderRadius: 12,
    backgroundColor: colors.zone,
    alignItems: "center",
    justifyContent: "center",
  },
  numText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  cpName: { flex: 1, color: colors.text, ...type.body, paddingVertical: 3 },
  delete: { color: colors.textFaint, fontSize: 24, paddingHorizontal: 4 },

  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingLeft: 34,
    paddingTop: 9,
  },
  metaLabel: { ...type.caption, fontSize: 13, color: colors.textDim },
  radiusInput: {
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    color: colors.text,
    fontSize: 13,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 52,
    textAlign: "center",
  },
  audioChip: {
    flexShrink: 1,
    marginLeft: space.xs,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  audioChipSet: {
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
  },
  audioText: { fontSize: 13, fontWeight: "600", color: colors.textDim },
  audioTextSet: { color: colors.accent },
});
