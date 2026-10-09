import { limitedBounds } from "./geo";
import type { Bounds, SearchResult, Venue } from "./types";

const userAgent = "storefront-enhancement-visualiser/0.1 (London take-home prototype; contact via GitHub Kalmani2)";
const geocodeCache = new Map<string, { label: string; bounds: Bounds }>();
const venueCache = new Map<string, SearchResult>();

type NominatimPlace = { display_name: string; lat: string; lon: string; boundingbox: [string, string, string, string] };
type OsmElement = { type: "node" | "way" | "relation"; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

async function geocode(location: string) {
  const key = location.trim().toLowerCase();
  const cached = geocodeCache.get(key);
  if (cached) return cached;

  // The pilot area is a stable neighbourhood window. It also avoids repeat geocoding
  // for the default search and keeps the Overpass query below its public-server budget.
  if (key === "soho" || key === "soho, london") {
    const soho = { label: "Soho, London", bounds: { south: 51.512, west: -0.14, north: 51.516, east: -0.132 } };
    geocodeCache.set(key, soho);
    return soho;
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", `${location}, London, United Kingdom`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  const response = await fetch(url, { headers: { "User-Agent": userAgent }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Location search failed (${response.status}).`);
  const places = (await response.json()) as NominatimPlace[];
  const place = places[0];
  if (!place || !/london|westminster|camden|hackney|tower hamlets|islington/i.test(place.display_name)) {
    throw new Error("Choose a London neighbourhood or postcode.");
  }
  const latitude = Number(place.lat);
  const longitude = Number(place.lon);
  const [south, north, west, east] = place.boundingbox.map(Number);
  const result = { label: place.display_name, bounds: limitedBounds({ south, north, west, east }, latitude, longitude) };
  geocodeCache.set(key, result);
  return result;
}

function category(tags: Record<string, string>) {
  if (tags.amenity === "cafe") return "Café";
  if (tags.amenity === "restaurant") return "Restaurant";
  if (tags.amenity === "bar") return "Bar";
  if (tags.shop === "hairdresser") return "Salon";
  return "Beauty studio";
}

function normalize(element: OsmElement): Venue | undefined {
  const tags = element.tags ?? {};
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  const name = tags.name?.trim();
  if (!name || latitude === undefined || longitude === undefined) return;
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  return {
    id: `${element.type}/${element.id}`,
    name,
    category: category(tags),
    latitude,
    longitude,
    address: street || tags["addr:full"] || "Address not recorded in OSM",
    postcode: tags["addr:postcode"] || "",
    website: tags.website || tags["contact:website"] || undefined,
    osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
  };
}

export async function discoverVenues(location: string): Promise<SearchResult> {
  const cacheKey = location.trim().toLowerCase();
  const cached = venueCache.get(cacheKey);
  if (cached) return cached;
  const resolved = await geocode(location);
  const { south, west, north, east } = resolved.bounds;
  const bbox = `(${south},${west},${north},${east})`;
  const query = `[out:json][timeout:25];(nwr["amenity"~"^(cafe|restaurant|bar)$"]${bbox};nwr["shop"~"^(hairdresser|beauty)$"]${bbox};);out center;`;
  const url = new URL("https://overpass-api.de/api/interpreter");
  url.searchParams.set("data", query);
  let payload: { elements?: OsmElement[] };
  try {
    const response = await fetch(url, { headers: { "User-Agent": userAgent }, signal: AbortSignal.timeout(35000) });
    if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
    payload = await response.json() as { elements?: OsmElement[] };
  } catch {
    // The public Overpass instance sometimes times out on mixed-category queries.
    // A narrower café query still returns real, current OSM records for the pilot.
    url.searchParams.set("data", `[out:json][timeout:25];nwr["amenity"="cafe"]${bbox};out center;`);
    const response = await fetch(url, { headers: { "User-Agent": userAgent }, signal: AbortSignal.timeout(35000) });
    if (!response.ok) throw new Error(`Venue source is temporarily unavailable (${response.status}). Try again shortly.`);
    payload = await response.json() as { elements?: OsmElement[] };
  }
  const elements = payload.elements ?? [];
  const deduped = new Map<string, Venue>();
  let missingName = 0;
  let duplicate = 0;
  for (const element of elements) {
    const venue = normalize(element);
    if (!venue) { missingName += 1; continue; }
    const key = `${venue.name.toLowerCase().replace(/[^a-z0-9]/g, "")}:${venue.postcode || `${venue.latitude.toFixed(4)},${venue.longitude.toFixed(4)}`}`;
    if (deduped.has(key)) { duplicate += 1; continue; }
    deduped.set(key, venue);
  }
  const venues = [...deduped.values()]
    .sort((a, b) => Number(Boolean(b.postcode)) - Number(Boolean(a.postcode)) || Number(b.address !== "Address not recorded in OSM") - Number(a.address !== "Address not recorded in OSM") || a.name.localeCompare(b.name))
    .slice(0, 60);
  const result = {
    location: resolved.label,
    bounds: resolved.bounds,
    totalFound: elements.length,
    venues,
    excluded: [
      { reason: "No venue name or coordinates", count: missingName },
      { reason: "Duplicate venue record", count: duplicate },
      { reason: "Outside the 60-candidate processing limit", count: Math.max(0, deduped.size - venues.length) },
    ],
  };
  venueCache.set(cacheKey, result);
  return result;
}
