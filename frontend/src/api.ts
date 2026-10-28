import { Venue, Report, backendLevel } from "./data";
export const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
export type Account = { username: string; first_name: string; token: string };
export async function request(
  path: string,
  options: RequestInit = {},
  token?: string,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Token ${token}` } : {}),
        ...options.headers,
      },
    });
    const json = response.status === 204 ? null : await response.json();
    if (!response.ok)
      throw new Error(
        json?.detail ||
          json?.non_field_errors?.[0] ||
          "Could not save your changes. Try again.",
      );
    return json;
  } finally {
    clearTimeout(timeout);
  }
}
export async function loadVenues(): Promise<{
  venues: Venue[];
  reports: Report[];
}> {
  const data = await request("/venues/");
  return {
    venues: data.map((v: any) => ({
      id: v.id,
      name: v.name,
      kind: "Bar & nightlife",
      address: v.address,
      city: `${v.city}, ${v.state}`,
      latitude: Number(v.latitude),
      longitude: Number(v.longitude),
      image:
        v.image_url && !v.image_url.includes("example.com") ? v.image_url : "",
      description: v.description,
      cover: Number(v.cover_fee),
      hours: null,
    })),
    reports: data.flatMap((v: any) =>
      v.reports.map((r: any) => ({
        id: String(r.id),
        venueId: v.id,
        level: backendLevel(r.crowd_level),
        createdAt: r.created_at,
        wait: r.wait_time === 5 ? null : r.wait_time,
      })),
    ),
  };
}
