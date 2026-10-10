import { createHmac, timingSafeEqual } from "node:crypto";
import { angularDifference, bearingDegrees, distanceMetres } from "../discovery/geo";
import { googleApiKey } from "./credentials";
import type { GoogleVenue, StreetViewCandidate, StreetViewMetadata } from "./types";
import { findVenueStreet, projectToStreet, type VenueStreet } from "./streets";

type Point = { latitude: number; longitude: number };
type MetadataPayload = { status?: string; pano_id?: string; location?: { lat?: number; lng?: number }; date?: string; copyright?: string; error_message?: string };
type Camera = Omit<StreetViewCandidate, "token" | "alignment">;
type FrameClaim = { venueId: string; panoId: string; heading: number; fov: number; pitch: number; expires: number };

export function hasGoogleAttribution(copyright: string) {
  // Provider attribution is evidence, not an official car-capture classification.
  return /^(?:©\s*)?(?:(?:19|20)\d{2}\s+)?Google(?: LLC)?\s*$/i.test(copyright.trim());
}

function signature(payload: string) {
  return createHmac("sha256", googleApiKey()).update(`storefront-camera-v1:${payload}`).digest("base64url");
}

function issueFrame(venueId: string, camera: Camera) {
  const claim: FrameClaim = { venueId, panoId: camera.panoId, heading: camera.heading, fov: camera.fov, pitch: camera.pitch, expires: Date.now() + 30 * 60 * 1000 };
  const payload = Buffer.from(JSON.stringify(claim)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function readFrame(token: string, venueId: string): FrameClaim {
  const [payload, supplied, extra] = token.split(".");
  if (!payload || !supplied || extra || token.length > 2000) throw new Error("Choose a camera from a fresh lookup.");
  const expected = Buffer.from(signature(payload));
  const received = Buffer.from(supplied);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new Error("The selected camera reference is invalid. Refresh the camera lookup.");
  const claim = JSON.parse(Buffer.from(payload, "base64url").toString()) as FrameClaim;
  if (claim.venueId !== venueId || claim.expires < Date.now() || !Number.isFinite(claim.heading) || !claim.panoId) throw new Error("The selected camera has expired or belongs to another venue. Refresh the camera lookup.");
  return claim;
}

async function lookup(point: Point, radius: number): Promise<MetadataPayload> {
  const url = new URL("https://maps.googleapis.com/maps/api/streetview/metadata");
  url.searchParams.set("location", `${point.latitude},${point.longitude}`);
  url.searchParams.set("source", "outdoor");
  url.searchParams.set("radius", String(radius));
  url.searchParams.set("key", googleApiKey());
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), cache: "no-store" });
  const payload = await response.json() as MetadataPayload;
  if (!response.ok || (payload.status !== "OK" && payload.status !== "ZERO_RESULTS")) throw new Error(`Street View metadata failed: ${payload.error_message || payload.status || response.status}`);
  return payload;
}

function probePoints(venue: GoogleVenue, street: VenueStreet) {
  const metresLatitude = 111320;
  const metresLongitude = metresLatitude * Math.cos(venue.latitude * Math.PI / 180);
  const angle = street.bearing * Math.PI / 180;
  return [
    { point: street.anchor, radius: 8 },
    ...[-30, -20, -10, 10, 20, 30].map((distance) => {
      const requested = { latitude: street.anchor.latitude + distance * Math.cos(angle) / metresLatitude, longitude: street.anchor.longitude + distance * Math.sin(angle) / metresLongitude };
      return { point: projectToStreet(requested, street.lines)?.point || requested, radius: 8 };
    }),
  ];
}

function alignment(camera: Camera, cameras: Camera[]) {
  const neighbours = cameras.filter((other) => other.panoId !== camera.panoId)
    .map((other) => ({ other, distance: distanceMetres(camera, other) }))
    .filter(({ distance }) => distance >= 4 && distance <= 25)
    .sort((a, b) => a.distance - b.distance);
  const first = neighbours[0]?.other;
  if (!first) return undefined;
  const roadBearing = bearingDegrees(camera, first);
  // Near junctions a single local line is not reliable; omit the estimate there.
  if (neighbours[1]) {
    const difference = angularDifference(roadBearing, bearingDegrees(camera, neighbours[1].other));
    if (difference > 25 && difference < 155) return undefined;
  }
  const roadAngle = angularDifference(roadBearing, camera.heading);
  return Math.abs(90 - roadAngle);
}

export async function getStreetViewMetadata(venue: GoogleVenue, resolvedStreet?: VenueStreet): Promise<StreetViewMetadata> {
  const street = resolvedStreet ?? await findVenueStreet(venue);
  if (!street) return { available: false, candidates: [], streetMatched: false, camerasChecked: 0, reason: "The address street could not be matched nearby. No unlocated camera will be substituted; try another venue." };
  const probes = probePoints(venue, street);
  const responses = await Promise.allSettled(probes.map(({ point, radius }) => lookup(point, radius)));
  if (responses.every((result) => result.status === "rejected")) throw (responses[0] as PromiseRejectedResult).reason;
  const cameras = new Map<string, Camera>();
  const skipped = new Map<string, number>();
  const skip = (reason: string) => skipped.set(reason, (skipped.get(reason) || 0) + 1);
  for (const result of responses) {
    if (result.status === "rejected") { skip("Camera lookup failed"); continue; }
    const payload = result.value;
    if (payload.status !== "OK" || !payload.pano_id || !Number.isFinite(payload.location?.lat) || !Number.isFinite(payload.location?.lng)) { skip("No outdoor coverage at probe point"); continue; }
    if (cameras.has(payload.pano_id)) continue;
    if (!hasGoogleAttribution(payload.copyright || "")) { skip("Contributor or unknown imagery attribution"); continue; }
    const camera = { latitude: payload.location!.lat!, longitude: payload.location!.lng! };
    const onStreet = projectToStreet(camera, street.lines);
    if (!onStreet || onStreet.distance > 7) { skip("Camera is not on the street in the business address"); continue; }
    const distance = distanceMetres(camera, venue);
    if (distance < 4 || distance > 45) { skip("Camera too close to the business pin or too far away"); continue; }
    cameras.set(payload.pano_id, {
      ...camera, panoId: payload.pano_id, distanceMetres: Math.round(distance),
      heading: Math.round(bearingDegrees(camera, venue)),
      fov: Math.round(Math.min(80, Math.max(50, 2 * Math.atan(5 / distance) * 180 / Math.PI + 20))),
      pitch: -5, date: payload.date, copyright: payload.copyright!,
    });
  }
  const all = [...cameras.values()];
  const ranked = all.map((camera) => {
    const tangent = projectToStreet(camera, street.lines)?.bearing;
    const deviation = tangent === undefined ? alignment(camera, all) : Math.abs(90 - angularDifference(tangent, camera.heading));
    const captured = camera.date ? Date.parse(`${camera.date}-01`) : NaN;
    const ageYears = Number.isFinite(captured) ? Math.max(0, (Date.now() - captured) / (365.25 * 86400000)) : 5;
    return { camera, deviation, score: Math.abs(camera.distanceMetres - 12) + (deviation === undefined ? 15 : deviation * 0.6) + Math.min(ageYears, 10) * 2 };
  }).sort((a, b) => a.score - b.score);
  const candidates: StreetViewCandidate[] = ranked.slice(0, 5).map(({ camera, deviation }) => ({
    ...camera, alignment: deviation === undefined ? undefined : deviation <= 25 ? "near-perpendicular" : "oblique",
    token: issueFrame(venue.placeId, camera),
  }));
  const best = candidates[0];
  return {
    available: Boolean(best), ...best, candidates, camerasChecked: probes.length, streetMatched: true,
    skipped: [...skipped].map(([reason, count]) => ({ reason, count })),
    reason: best ? undefined : "No nearby outdoor camera with Google attribution passed the source and distance checks.",
  };
}

export async function loadStreetViewImage(venue: GoogleVenue, offset: number, candidateToken: string, requestedFov?: number): Promise<Response> {
  const frame = readFrame(candidateToken, venue.placeId);
  const url = new URL("https://maps.googleapis.com/maps/api/streetview");
  url.searchParams.set("size", "640x480");
  url.searchParams.set("pano", frame.panoId);
  url.searchParams.set("source", "outdoor");
  url.searchParams.set("heading", String((frame.heading + offset + 360) % 360));
  url.searchParams.set("fov", String(requestedFov ?? frame.fov));
  url.searchParams.set("pitch", String(frame.pitch));
  url.searchParams.set("return_error_code", "true");
  url.searchParams.set("key", googleApiKey());
  // Pin the exact source-screened panorama. Do not run a second nearest-camera lookup.
  return fetch(url, { signal: AbortSignal.timeout(15000), cache: "no-store" });
}
