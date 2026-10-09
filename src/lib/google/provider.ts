import { bearingDegrees, distanceMetres } from "../discovery/geo";
import type { GoogleSearchResult, GoogleVenue, StreetViewMetadata } from "./types";

export const categories = ["cafe", "restaurant", "bar", "hair salon", "shop"] as const;
export type GoogleCategory = typeof categories[number];
export const hasGoogleKey = () => Boolean(process.env.GOOGLE_MAPS_API_KEY);

function apiKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not configured. Add it to .env.local and restart the server.");
  return key;
}

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  googleMapsUri?: string;
};

export async function searchGoogleVenues(location: string, category: GoogleCategory): Promise<GoogleSearchResult> {
  const place = /london/i.test(location) ? location : `${location}, London`;
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.googleMapsUri",
    },
    body: JSON.stringify({ textQuery: `${category}s in ${place}, UK`, pageSize: 12, regionCode: "GB", languageCode: "en" }),
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const payload = await response.json() as { places?: GooglePlace[]; error?: { message?: string } };
  if (!response.ok) throw new Error(`Google Places failed (${response.status}): ${payload.error?.message ?? "unknown error"}`);
  const venues = (payload.places ?? []).flatMap((item): GoogleVenue[] => {
    const latitude = item.location?.latitude;
    const longitude = item.location?.longitude;
    if (!item.id || !item.displayName?.text || latitude === undefined || longitude === undefined) return [];
    if (latitude < 51.28 || latitude > 51.7 || longitude < -0.55 || longitude > 0.3) return [];
    return [{
      placeId: item.id,
      name: item.displayName.text,
      address: item.formattedAddress || "Address unavailable",
      latitude,
      longitude,
      category: item.primaryType?.replaceAll("_", " ") || category,
      mapsUrl: item.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(item.id)}`,
    }];
  });
  return { location: place, category, venues };
}

type GoogleMetadataPayload = {
  status?: string;
  pano_id?: string;
  location?: { lat?: number; lng?: number };
  date?: string;
  copyright?: string;
  error_message?: string;
};

export async function getStreetViewMetadata(venue: GoogleVenue): Promise<StreetViewMetadata> {
  const url = new URL("https://maps.googleapis.com/maps/api/streetview/metadata");
  url.searchParams.set("location", `${venue.latitude},${venue.longitude}`);
  url.searchParams.set("source", "outdoor");
  url.searchParams.set("radius", "50");
  url.searchParams.set("key", apiKey());
  const response = await fetch(url, { signal: AbortSignal.timeout(12000), cache: "no-store" });
  const payload = await response.json() as GoogleMetadataPayload;
  if (!response.ok || (payload.status !== "OK" && payload.status !== "ZERO_RESULTS")) {
    throw new Error(`Street View metadata failed: ${payload.error_message || payload.status || response.status}`);
  }
  if (payload.status === "ZERO_RESULTS" || !payload.pano_id || payload.location?.lat === undefined || payload.location?.lng === undefined) {
    return { available: false, reason: "No outdoor Street View panorama found within 50m." };
  }
  const camera = { latitude: payload.location.lat, longitude: payload.location.lng };
  const distance = Math.round(distanceMetres(camera, venue));
  if (distance > 50) return { available: false, reason: "The nearest camera is too far from the mapped business." };
  return {
    available: true,
    panoId: payload.pano_id,
    latitude: camera.latitude,
    longitude: camera.longitude,
    distanceMetres: distance,
    heading: Math.round(bearingDegrees(camera, venue)),
    date: payload.date,
    copyright: payload.copyright,
  };
}

export async function loadStreetViewImage(venue: GoogleVenue, offset: number): Promise<Response> {
  const metadata = await getStreetViewMetadata(venue);
  if (!metadata.available || !metadata.panoId || metadata.heading === undefined) {
    throw new Error(metadata.reason || "Street View is unavailable here.");
  }
  const url = new URL("https://maps.googleapis.com/maps/api/streetview");
  url.searchParams.set("size", "640x480");
  url.searchParams.set("pano", metadata.panoId);
  url.searchParams.set("heading", String((metadata.heading + offset + 360) % 360));
  url.searchParams.set("fov", "70");
  url.searchParams.set("pitch", "0");
  url.searchParams.set("return_error_code", "true");
  url.searchParams.set("key", apiKey());
  return fetch(url, { signal: AbortSignal.timeout(15000), cache: "no-store" });
}
