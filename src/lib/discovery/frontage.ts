import { assessImage } from "./assessment";
import { findStreetImages } from "./imagery";
import type { FrontageResult, Venue } from "./types";

export async function findFrontage(venue: Venue, imageId: string): Promise<FrontageResult> {
  const { images, found } = await findStreetImages(venue);
  const image = images.find((candidate) => candidate.id === imageId);
  if (!image) throw new Error("That photo is no longer available among this venue's candidates.");
  const attempt = await assessImage(venue, image);
  return {
    venue,
    image: attempt.decision === "accepted" ? image : undefined,
    attempts: [attempt],
    imagesFound: found,
    reason: attempt.reason,
  };
}
