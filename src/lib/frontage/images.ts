import { googleApiKey } from "../google/credentials";
import { getStreetViewMetadata, hasGoogleAttribution } from "../google/streetview";
import { distanceMetres } from "../discovery/geo";
import type { GoogleVenue } from "../google/types";
import { PlanterError } from "../planters/validation";
import type { FrontageFrame, PhotoFrame, StreetFrame } from "./types";

export async function candidateFrames(venue: GoogleVenue): Promise<StreetFrame[]> {
  const result = await getStreetViewMetadata(venue);
  const candidates = result.candidates || [];
  const best = candidates[0];
  if (!best) return [];
  // Prefer a genuinely different viewpoint to a nearly identical neighbouring capture.
  const alternate = candidates.slice(1).find(c => distanceMetres(c, best) >= 5) || candidates[1];
  return [best, ...(alternate ? [alternate] : [])].map(c => ({
    source: "streetview", panoId: c.panoId, latitude: c.latitude, longitude: c.longitude,
    heading: c.heading, fov: Math.max(65, c.fov), pitch: c.pitch, width: 640, height: 480,
    date: c.date, copyright: c.copyright,
  }));
}

// A no-charge metadata check. Never silently replace an approved panorama.
export async function frameAvailable(frame: StreetFrame): Promise<boolean> {
  const url = new URL("https://maps.googleapis.com/maps/api/streetview/metadata");
  url.searchParams.set("pano", frame.panoId); url.searchParams.set("key", googleApiKey());
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const data = await response.json();
  if (!response.ok || !["OK", "ZERO_RESULTS", "NOT_FOUND"].includes(data.status)) throw new Error("Street View availability check failed. No paid retry was made.");
  return data.status === "OK" && data.pano_id === frame.panoId && data.date === frame.date
    && hasGoogleAttribution(data.copyright || "") && data.location
    && distanceMetres(frame, { latitude: data.location.lat, longitude: data.location.lng }) < 1;
}

export async function fetchFrontageImage(venue: GoogleVenue, frame: FrontageFrame): Promise<{ bytes: Buffer; frame: FrontageFrame; contentType: string }> {
  let url: URL;
  let resolved: FrontageFrame = frame;
  if (frame.source === "streetview") {
    url = new URL("https://maps.googleapis.com/maps/api/streetview");
    for (const [key, value] of Object.entries({ size: `${frame.width}x${frame.height}`, pano: frame.panoId, heading: frame.heading, fov: frame.fov, pitch: frame.pitch, source: "outdoor", return_error_code: true, key: googleApiKey() })) url.searchParams.set(key, String(value));
  } else {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(venue.placeId)}`, {
      headers: { "X-Goog-Api-Key": googleApiKey(), "X-Goog-FieldMask": "photos" }, cache: "no-store", signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error("Google Places photo lookup failed.");
    const photo = data.photos?.[frame.index];
    if (!photo?.name) throw new PlanterError("No more Google Places photos are available for this venue.", 404);
    // Never persist expiring Google photo names/URLs or use arbitrary remote URLs.
    if (typeof photo.name !== "string" || !photo.name.startsWith(`places/${venue.placeId}/photos/`) || !/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photo.name)) throw new Error("Invalid Google photo reference.");
    resolved = { ...frame, attribution: (photo.authorAttributions || []).map((a: { displayName?: string; uri?: string }) => ({ name: a.displayName || "Google Maps contributor", ...(a.uri?.startsWith("https://") ? { uri: a.uri } : {}) })) } as PhotoFrame;
    url = new URL(`https://places.googleapis.com/v1/${photo.name}/media`);
    url.searchParams.set("maxWidthPx", "640"); url.searchParams.set("maxHeightPx", "480"); url.searchParams.set("key", googleApiKey());
  }
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (response.status === 404) throw new PlanterError("The selected image is no longer available.", 404);
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error("The selected frontage image could not be retrieved.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 8_000_000) throw new Error("Frontage image exceeded the size limit.");
  return { bytes, frame: resolved, contentType: response.headers.get("content-type")! };
}
