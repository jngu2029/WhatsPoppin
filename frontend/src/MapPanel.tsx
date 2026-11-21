import React, { useRef } from "react";
import { StyleSheet, View, Text, Pressable } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { Venue, Report, ServerCrowd, collegePark, crowdSummary, crowdTrendLabel } from "./data";
import { colors, levels, font } from "./theme";
export type MapProps = {
  venues: Venue[];
  reports: Report[];
  crowd?: Record<number, ServerCrowd>;
  onSelect: (id: number) => void;
  selected?: number;
  origin?: typeof collegePark;
};
export default function MapPanel({
  venues,
  reports,
  crowd,
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
        const summary = crowdSummary(v.id, reports, Date.now(), crowd?.[v.id]);
        const level = levels[summary.level ?? 0];
        const trendLabel = crowdTrendLabel(v.id, reports) ?? level.name;
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
                {summary.stale ? "Needs update" : trendLabel}
              </Text>
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
}
