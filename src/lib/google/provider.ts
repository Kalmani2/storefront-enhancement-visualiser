import { categories, categoryProfiles, inBounds, londonBounds, screenProspect, sohoBounds, type GoogleCategory, type GooglePlace, type SearchBounds } from "./prospects";
import type { GoogleSearchResult, GoogleVenue } from "./types";
import { googleApiKey } from "./credentials";

export { categories, type GoogleCategory };
export { getStreetViewMetadata, loadStreetViewImage } from "./streetview";
export { hasGoogleKey } from "./credentials";

const placeFields = "id,displayName,formattedAddress,location,primaryType,types,googleMapsUri,businessStatus,pureServiceAreaBusiness,addressComponents,containingPlaces,openingDate";

async function textSearch(body: object, fields: string) {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": googleApiKey(), "X-Goog-FieldMask": fields },
    body: JSON.stringify({ ...body, regionCode: "GB", languageCode: "en" }),
    signal: AbortSignal.timeout(15000), cache: "no-store",
  });
  const payload = await response.json() as { places?: GooglePlace[]; error?: { message?: string } };
  if (!response.ok) throw new Error(`Google Places failed (${response.status}): ${payload.error?.message ?? "unknown error"}`);
  return payload.places || [];
}

async function resolveArea(location: string): Promise<SearchBounds> {
  if (/^soho(?:\s*,?\s*london)?$/i.test(location.trim())) return sohoBounds;
  const query = /london/i.test(location) ? location : `${location}, London`;
  const [area] = await textSearch({ textQuery: `${query}, UK`, pageSize: 1 }, "places.location,places.viewport,places.types");
  const latitude = area?.location?.latitude;
  const longitude = area?.location?.longitude;
  if (latitude === undefined || longitude === undefined || !inBounds(latitude, longitude, londonBounds)) throw new Error("Choose a London neighbourhood or postcode.");
  if (area.types?.some((type) => ["establishment", "store", "restaurant", "cafe"].includes(type))) throw new Error("Enter a neighbourhood or postcode, rather than a business name.");
  const low = area.viewport?.low;
  const high = area.viewport?.high;
  return {
    south: Math.max(low?.latitude ?? latitude - 0.004, latitude - 0.007),
    north: Math.min(high?.latitude ?? latitude + 0.004, latitude + 0.007),
    west: Math.max(low?.longitude ?? longitude - 0.006, longitude - 0.011),
    east: Math.min(high?.longitude ?? longitude + 0.006, longitude + 0.011),
  };
}

export async function searchGoogleVenues(location: string, category: GoogleCategory): Promise<GoogleSearchResult> {
  const bounds = await resolveArea(location);
  const profile = categoryProfiles[category];
  const places = await textSearch({
    textQuery: profile.query, includedType: profile.type, strictTypeFiltering: true,
    includePureServiceAreaBusinesses: false, pageSize: 20,
    locationRestriction: { rectangle: { low: { latitude: bounds.south, longitude: bounds.west }, high: { latitude: bounds.north, longitude: bounds.east } } },
  }, placeFields.split(",").map((field) => `places.${field}`).join(","));
  const venues: GoogleVenue[] = [];
  const excluded = new Map<string, number>();
  const ids = new Set<string>();
  for (const place of places) {
    const result = screenProspect(place, category, bounds);
    if ("reason" in result) { excluded.set(result.reason, (excluded.get(result.reason) || 0) + 1); continue; }
    if (ids.has(result.venue.placeId)) continue;
    ids.add(result.venue.placeId);
    venues.push(result.venue);
  }
  return {
    location: /london/i.test(location) ? location : `${location}, London`, category, venues,
    totalFound: places.length, excluded: [...excluded].map(([reason, count]) => ({ reason, count })),
  };
}

export async function getGoogleVenue(placeId: string): Promise<GoogleVenue> {
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": googleApiKey(), "X-Goog-FieldMask": placeFields },
    signal: AbortSignal.timeout(15000), cache: "no-store",
  });
  const place = await response.json() as GooglePlace & { error?: { message?: string } };
  if (!response.ok) throw new Error(`Google Place Details failed (${response.status}): ${place.error?.message ?? "unknown error"}`);
  if (!place.id || !place.displayName?.text || place.location?.latitude === undefined || place.location.longitude === undefined) throw new Error("Google returned incomplete venue details.");
  if (place.businessStatus !== "OPERATIONAL") throw new Error("This venue is no longer listed as operational. Choose another prospect.");
  return {
    placeId: place.id, name: place.displayName.text, address: place.formattedAddress || "Address unavailable",
    latitude: place.location.latitude, longitude: place.location.longitude,
    category: place.primaryType?.replaceAll("_", " ") || "Venue", primaryType: place.primaryType,
    streetName: place.addressComponents?.find((component) => component.types?.includes("route"))?.longText,
    businessStatus: "OPERATIONAL",
    mapsUrl: place.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.id)}`,
  };
}
