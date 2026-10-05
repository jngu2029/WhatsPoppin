import React, { useRef } from "react";
import { StyleSheet, View, Text, Pressable } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { Venue, Report, collegePark, crowdSummary } from "./data";
import { colors, levels, font } from "./theme";
export type MapProps = {
  venues: Venue[];
  reports: Report[];
  onSelect: (id: number) => void;
  selected?: number;
  origin?: typeof collegePark;
};
export default function MapPanel({
  venues,
  reports,
  onSelect,
  origin = collegePark,
}: MapProps) {
  const ref = useRef<MapView>(null);
  React.useEffect(() => {
    ref.current?.animateToRegion(
      { ...origin, latitudeDelta: 0.021, longitudeDelta: 0.017 },
      200,
    );
  }, [origin]);
  return (
    <MapView
      ref={ref}
      style={StyleSheet.absoluteFill}
      initialRegion={{ ...origin, latitudeDelta: 0.021, longitudeDelta: 0.017 }}
    >
      <Marker
        coordinate={origin}
        title="Your search area"
        pinColor={colors.accent}
      />
      {venues.map((v) => {
        const summary = crowdSummary(v.id, reports);
        const level = levels[summary.latest?.level ?? 0];
        return (
          <Marker
            key={v.id}
            coordinate={v}
            title={v.name}
            onPress={() => onSelect(v.id)}
          >
            <View
              style={{
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.white,
              }}
            >
              <Text
                style={{
                  color: summary.stale ? colors.muted : level.color,
                  fontFamily: font.bold,
                }}
              >
                {summary.stale ? "Needs update" : level.name}
              </Text>
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
}
