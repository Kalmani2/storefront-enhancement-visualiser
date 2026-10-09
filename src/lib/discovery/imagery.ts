import { angularDifference, bearingDegrees, distanceMetres } from "./geo";
import type { FrontageImage, Venue } from "./types";

type MapillaryImage = {
  id: string;
  is_pano?: boolean;
  computed_geometry?: { coordinates: [number, number] };
  computed_compass_angle?: number;
  thumb_1024_url?: string;
  creator?: { username?: string };
  captured_at?: number;
  width?: number;
  height?: number;
};

export async function findStreetImages(venue: Venue): Promise<{ images: FrontageImage[]; found: number }> {
  const token = process.env.MAPILLARY_ACCESS_TOKEN;
  if (!token) throw new Error("MAPILLARY_ACCESS_TOKEN is not configured.");

  // Approximately 90m east/west and 110m north/south; the API rejects broad area searches.
  const latitudeRadius = 0.001;
  const longitudeRadius = 0.0013;
  const url = new URL("https://graph.mapillary.com/images");
  url.searchParams.set("bbox", `${venue.longitude - longitudeRadius},${venue.latitude - latitudeRadius},${venue.longitude + longitudeRadius},${venue.latitude + latitudeRadius}`);
  url.searchParams.set("fields", "id,is_pano,computed_geometry,computed_compass_angle,thumb_1024_url,creator,captured_at,width,height");
  url.searchParams.set("is_pano", "false");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { signal: AbortSignal.timeout(18000) });
  const payload = (await response.json()) as { data?: MapillaryImage[]; error?: { message?: string } };
  if (!response.ok) throw new Error(`Street imagery source failed (${response.status}): ${payload.error?.message ?? "unknown error"}`);
  const found = payload.data?.length ?? 0;

  const ranked = (payload.data ?? []).flatMap((image): (FrontageImage & { rank: number })[] => {
    const coordinates = image.computed_geometry?.coordinates;
    if (!coordinates || image.is_pano !== false || !image.thumb_1024_url || (image.width ?? 0) < 1000) return [];
    const camera = { latitude: coordinates[1], longitude: coordinates[0] };
    const distance = distanceMetres(camera, venue);
    if (distance > 105 || distance < 3) return [];
    const difference = image.computed_compass_angle === undefined
      ? undefined
      : angularDifference(image.computed_compass_angle, bearingDegrees(camera, venue));
    if (difference !== undefined && difference > 95) return [];
    return [{
      id: image.id,
      url: image.thumb_1024_url,
      sourceUrl: `https://www.mapillary.com/app/?pKey=${image.id}`,
      creator: image.creator?.username || "Mapillary contributor",
      capturedAt: image.captured_at ? new Date(image.captured_at).toISOString() : undefined,
      distanceMetres: Math.round(distance),
      headingDifference: difference === undefined ? undefined : Math.round(difference),
      rank: distance + (difference ?? 70) * 0.55,
    }];
  }).sort((a, b) => a.rank - b.rank);

  return { images: ranked.slice(0, 5).map(({ rank, ...image }) => { void rank; return image; }), found };
}
