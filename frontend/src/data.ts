import { levels } from "./theme";

export type Report = {
  id: string;
  venueId: number;
  level: number;
  createdAt: string;
  wait: number | null;
  mine?: boolean;
  // True when the server confirmed the reporter was at the venue. Unset in preview data.
  verified?: boolean;
};
// Crowd consensus the backend computes for a venue (backend/reports/consensus.py).
export type ServerCrowd = {
  level: number | null;
  report_count: number;
  confidence: "low" | "medium" | "high" | null;
  updated_at: string | null;
};
export type Venue = {
  id: number;
  name: string;
  kind: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  image: string;
  description: string;
  cover: number | null;
  hours: string | null;
};
export const collegePark = { latitude: 38.9822, longitude: -76.9373 };
// Illustrative data, not current conditions or verified business information.
export const demoVenues: Venue[] = [
  {
    id: 1,
    name: "Looney’s Pub",
    kind: "Neighborhood pub",
    address: "8150 Baltimore Avenue",
    city: "College Park, MD",
    latitude: 38.9902,
    longitude: -76.9344,
    image:
      "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1000&q=85",
    description:
      "A neighborhood gathering place for a drink, a game, and good company.",
    cover: 0,
    hours: "Open until 2 am",
  },
  {
    id: 2,
    name: "Cornerstone Grill & Loft",
    kind: "Sports bar",
    address: "7325 Baltimore Avenue",
    city: "College Park, MD",
    latitude: 38.9799,
    longitude: -76.9377,
    image:
      "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=1000&q=85",
    description: "Game-day energy downstairs. A livelier scene upstairs.",
    cover: 5,
    hours: "Open until 2 am",
  },
  {
    id: 3,
    name: "Terrapin’s Turf",
    kind: "Bar & dance floor",
    address: "4410 Knox Road",
    city: "College Park, MD",
    latitude: 38.9808,
    longitude: -76.9381,
    image:
      "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?auto=format&fit=crop&w=1000&q=85",
    description: "A familiar spot for late nights and a little more energy.",
    cover: 10,
    hours: "Open until 2 am",
  },
  {
    id: 4,
    name: "The Board & Brew",
    kind: "Café & bar",
    address: "8150 Baltimore Avenue",
    city: "College Park, MD",
    latitude: 38.9905,
    longitude: -76.9347,
    image:
      "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1000&q=85",
    description:
      "Something to sip, a board game to share, and space to settle in.",
    cover: 0,
    hours: "Open until 11 pm",
  },
  {
    id: 5,
    name: "College Park Grill",
    kind: "Restaurant & bar",
    address: "8321 Baltimore Avenue",
    city: "College Park, MD",
    latitude: 38.9929,
    longitude: -76.9336,
    image:
      "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1000&q=85",
    description: "A laid-back stop for dinner and a drink.",
    cover: 0,
    hours: "Open until midnight",
  },
];
export function seedReports(now = Date.now()): Report[] {
  const patterns = [
    [1, 1, 2, 8],
    [2, 2, 5, 6],
    [3, 3, 4, 9],
    [4, 0, 7, 4],
    [5, 1, 47, 2],
  ];
  return patterns.flatMap(([venueId, level, minutes, count]) =>
    Array.from({ length: count }, (_, index) => ({
      id: `sample-${venueId}-${index}`,
      venueId,
      level: index === count - 1 && count > 4 ? Math.max(0, level - 1) : level,
      createdAt: new Date(now - (minutes + index * 2) * 60000).toISOString(),
      wait: level >= 2 ? 1 : 0,
    })),
  );
}
export function backendLevel(value: number): number {
  return value <= 1 ? 0 : value === 2 ? 1 : value <= 4 ? 2 : 3;
}
export function distanceMiles(
  venue: Pick<Venue, "latitude" | "longitude">,
  origin = collegePark,
) {
  const r = Math.PI / 180;
  const a =
    Math.sin(((venue.latitude - origin.latitude) * r) / 2) ** 2 +
    Math.cos(origin.latitude * r) *
      Math.cos(venue.latitude * r) *
      Math.sin(((venue.longitude - origin.longitude) * r) / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
// Offline-preview copy of the backend's consensus. Keep these in sync with
// backend/reports/consensus.py. The backend also counts each user once, which
// the app cannot do because reports carry no user id.
const HALF_LIFE_MINUTES = 10;
const UNVERIFIED_WEIGHT = 0.3;
export function localConsensus(recent: Report[], now: number): number | null {
  if (!recent.length) return null;
  const weighted = recent
    .map((r) => ({
      level: r.level,
      weight:
        0.5 ** (Math.max(0, now - Date.parse(r.createdAt)) / 60000 / HALF_LIFE_MINUTES) *
        (r.verified === false ? UNVERIFIED_WEIGHT : 1),
    }))
    .sort((a, b) => a.level - b.level);
  const half = weighted.reduce((sum, r) => sum + r.weight, 0) / 2;
  let running = 0;
  for (let i = 0; i < weighted.length; i++) {
    running += weighted[i].weight;
    if (running > half + 1e-9) return weighted[i].level;
    if (Math.abs(running - half) <= 1e-9 && i + 1 < weighted.length)
      return Math.floor((weighted[i].level + weighted[i + 1].level) / 2 + 0.5);
  }
  return weighted[weighted.length - 1].level;
}
export function crowdSummary(
  venueId: number,
  reports: Report[],
  now = Date.now(),
  crowd?: ServerCrowd,
) {
  const all = reports
    .filter((r) => r.venueId === venueId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const latest = all[0];
  const age = latest
    ? Math.max(0, Math.floor((now - Date.parse(latest.createdAt)) / 60000))
    : null;
  const recent = all.filter((r) => now - Date.parse(r.createdAt) <= 30 * 60000);
  // The level shown to people is the consensus of recent reports, not the latest one.
  const level = crowd
    ? crowd.level === null
      ? null
      : backendLevel(crowd.level)
    : localConsensus(recent, now);
  return {
    latest,
    level,
    age,
    stale: age === null || age > 30 || level === null,
    recent,
    agreeing: recent.filter((r) => r.level === level).length,
    total: recent.length,
  };
}
// Sign-in accepts a username or an email. Anything with "@" is treated as an
// email and must look like one before it is sent. The server checks it fully.
export function signInIdentifierError(value: string): string | null {
  const login = value.trim();
  if (!login) return "Enter your username or email.";
  if (login.includes("@") && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(login))
    return "Enter a valid email address.";
  return null;
}
export function ageLabel(age: number | null) {
  return age === null
    ? "No reports yet"
    : age === 0
      ? "Just now"
      : age < 60
        ? `${age} min ago`
        : age < 1440
          ? `${Math.floor(age / 60)} hr ago`
          : `${Math.floor(age / 1440)} days ago`;
}

export function crowdTrendBuckets(reports: Report[], now = Date.now()) {
  return [60, 45, 30, 15, 0].map((minutes) => {
    const end = now - Math.max(0, minutes - 7.5) * 60000;
    const start = now - Math.min(60, minutes + 7.5) * 60000;
    const matches = reports.filter(
      (r) => Date.parse(r.createdAt) >= start && Date.parse(r.createdAt) <= end,
    );
    return matches.length
      ? matches.reduce((sum, r) => sum + r.level, 0) / matches.length
      : null;
  });
}

export function crowdTrendRange(venueId: number, reports: Report[], now = Date.now()) {
  const values = crowdTrendBuckets(reports.filter((report) => report.venueId === venueId), now)
    .filter((value): value is number => value !== null);
  if (!values.length) return null;

  const low = Math.round(Math.min(...values));
  const high = Math.round(Math.max(...values));
  const label = low === high ? levels[low].name : levels[low].name + "–" + levels[high].name;
  return { low, high, label };
}

export function crowdTrendLabel(venueId: number, reports: Report[], now = Date.now()) {
  return crowdTrendRange(venueId, reports, now)?.label ?? null;
}
