import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "../tokens.css";
import "./web.css";
import { Venue, Report, crowdSummary, collegePark } from "./data";
import { colors, levels } from "./theme";
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
  selected,
  origin = collegePark,
}: MapProps) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markerLayer = useRef<L.LayerGroup | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  useEffect(() => {
    if (!host.current) return;
    const instance = L.map(host.current, {
      zoomControl: false,
      scrollWheelZoom: false,
    }).setView([origin.latitude + 0.003, origin.longitude], 15);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(instance);
    L.control.zoom({ position: "topright" }).addTo(instance);
    markerLayer.current = L.layerGroup().addTo(instance);
    map.current = instance;
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!markerLayer.current) return;
    markerLayer.current.clearLayers();
    L.circleMarker([origin.latitude, origin.longitude], {
      radius: 7,
      color: colors.white,
      weight: 3,
      fillColor: colors.accent,
      fillOpacity: 1,
    })
      .bindTooltip("Your search area")
      .addTo(markerLayer.current);
    venues.forEach((venue, index) => {
      const summary = crowdSummary(venue.id, reports);
      const level = levels[summary.latest?.level ?? 0];
      const nearEarlierVenue = venues
        .slice(0, index)
        .some(
          (v) =>
            Math.abs(v.latitude - venue.latitude) < 0.0015 &&
            Math.abs(v.longitude - venue.longitude) < 0.0015,
        );
      const markerColor = summary.stale ? colors.muted : level.color;
      L.circleMarker([venue.latitude, venue.longitude], {
        radius: 4,
        weight: 2,
        color: colors.white,
        fillColor: markerColor,
        fillOpacity: 1,
      }).addTo(markerLayer.current!);
      const icon = L.divIcon({
        className: "crowd-marker-wrap",
        html: `<span class="crowd-marker${selected === venue.id ? " selected" : ""}" style="--marker-color:${markerColor}"><span class="marker-dot"></span>${summary.stale ? "No recent report" : level.name}</span>`,
        iconSize: [120, 40],
        iconAnchor: [60, nearEarlierVenue ? -8 : 42],
      });
      const marker = L.marker([venue.latitude, venue.longitude], {
        icon,
        title: `${venue.name}: ${summary.stale ? "No recent report" : level.name}`,
        keyboard: true,
      }).addTo(markerLayer.current!);
      marker.bindTooltip(venue.name, { direction: "top", offset: [0, -40] });
      marker.on("click", () => select.current(venue.id));
    });
  }, [venues, reports, selected, origin]);
  const venueKey = venues.map((v) => v.id).join(",");
  useEffect(() => {
    if (venues.length && map.current) {
      const bounds = L.latLngBounds(
        venues.map((v) => [v.latitude, v.longitude] as [number, number]),
      );
      bounds.extend([origin.latitude, origin.longitude]);
      map.current.fitBounds(bounds, {
        paddingTopLeft: [60, 72],
        paddingBottomRight: [70, 60],
        maxZoom: 16,
      });
    } else map.current?.setView([origin.latitude, origin.longitude], 15);
  }, [origin, venueKey]);
  return (
    <div
      ref={host}
      style={{ width: "100%", height: "100%", minHeight: 300, zIndex: 0 }}
      aria-label="Map of nearby venues. Select a labeled crowd marker for venue details."
    />
  );
}
