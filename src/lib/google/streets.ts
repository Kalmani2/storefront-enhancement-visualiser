import { distanceMetres } from "../discovery/geo";
import type { GoogleVenue } from "./types";

export type StreetPoint = { latitude: number; longitude: number };
export type VenueStreet = { name: string; lines: StreetPoint[][]; anchor: StreetPoint; bearing: number };
const streetCache = new Map<string, { expires: number; street: VenueStreet }>();

function normalizeStreet(name: string) {
  const abbreviations: Record<string, string> = { st: "street", rd: "road", ln: "lane", ct: "court", sq: "square", pl: "place", psge: "passage", ave: "avenue" };
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().split(/\s+/).map((word) => abbreviations[word] || word).join(" ");
}

function streetName(venue: GoogleVenue) {
  if (venue.streetName) return venue.streetName;
  return (venue.address || "").split(",")[0].replace(/^\s*\d+[a-z]?(?:\s*[-–/]\s*\d+[a-z]?)?\s+/i, "").trim();
}

export function projectToStreet(point: StreetPoint, lines: StreetPoint[][]) {
  const longitudeScale = 111320 * Math.cos(point.latitude * Math.PI / 180);
  let nearest: { point: StreetPoint; distance: number; bearing: number } | undefined;
  for (const line of lines) for (let index = 1; index < line.length; index++) {
    const a = line[index - 1];
    const b = line[index];
    const ax = (a.longitude - point.longitude) * longitudeScale;
    const ay = (a.latitude - point.latitude) * 111320;
    const dx = (b.longitude - a.longitude) * longitudeScale;
    const dy = (b.latitude - a.latitude) * 111320;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared < 0.01) continue;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
    const x = ax + t * dx;
    const y = ay + t * dy;
    const distance = Math.hypot(x, y);
    if (!nearest || distance < nearest.distance) nearest = {
      point: { latitude: point.latitude + y / 111320, longitude: point.longitude + x / longitudeScale },
      distance, bearing: (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360,
    };
  }
  return nearest;
}

export async function findVenueStreet(venue: GoogleVenue): Promise<VenueStreet | null> {
  const name = streetName(venue);
  if (!name || name.length > 150) return null;
  const normalized = normalizeStreet(name);
  const cacheKey = `${normalized}:${venue.latitude.toFixed(6)}:${venue.longitude.toFixed(6)}`;
  const cached = streetCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.street;
  // A tiny, read-only map extract avoids the frequently overloaded Overpass query queue.
  const url = new URL("https://api.openstreetmap.org/api/0.6/map.json");
  const latRadius = 70 / 111320;
  const lonRadius = 70 / (111320 * Math.cos(venue.latitude * Math.PI / 180));
  url.searchParams.set("bbox", `${venue.longitude - lonRadius},${venue.latitude - latRadius},${venue.longitude + lonRadius},${venue.latitude + latRadius}`);
  const response = await fetch(url, { headers: { "User-Agent": "storefront-enhancement-visualiser/0.1 (London prototype)", Accept: "application/json" }, signal: AbortSignal.timeout(10000), cache: "no-store" });
  if (!response.ok) throw new Error("Street geometry lookup is temporarily unavailable. Retry this venue shortly.");
  const payload = await response.json() as { elements?: { type: string; id: number; lat?: number; lon?: number; tags?: { name?: string; highway?: string }; nodes?: number[] }[] };
  const nodes = new Map((payload.elements || []).filter((element) => element.type === "node" && Number.isFinite(element.lat) && Number.isFinite(element.lon))
    .map((element) => [element.id, { latitude: element.lat!, longitude: element.lon! }]));
  const lines = (payload.elements || []).filter((way) => way.type === "way" && way.tags?.highway && normalizeStreet(way.tags.name || "") === normalized)
    .map((way) => (way.nodes || []).map((id) => nodes.get(id)).filter((point): point is StreetPoint => Boolean(point)))
    .filter((line) => line.length >= 2);
  const projected = projectToStreet(venue, lines);
  if (!projected || distanceMetres(venue, projected.point) > 40) return null;
  const street = { name, lines, anchor: projected.point, bearing: projected.bearing };
  streetCache.set(cacheKey, { expires: Date.now() + 10 * 60 * 1000, street });
  return street;
}
