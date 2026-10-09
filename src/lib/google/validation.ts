import type { GoogleVenue } from "./types";

export function isGoogleVenue(value: unknown): value is GoogleVenue {
  if (!value || typeof value !== "object") return false;
  const venue = value as Partial<GoogleVenue>;
  return typeof venue.placeId === "string" && /^[A-Za-z0-9_-]{10,200}$/.test(venue.placeId)
    && typeof venue.name === "string" && venue.name.length > 0 && venue.name.length < 160
    && typeof venue.latitude === "number" && venue.latitude >= 51.28 && venue.latitude <= 51.7
    && typeof venue.longitude === "number" && venue.longitude >= -0.55 && venue.longitude <= 0.3;
}
