import { getFile, putFile } from "../storage";
import { locked } from "../planters/store";
import { PlanterError } from "../planters/validation";
import { fingerprint } from "./assessment";
import { fetchFrontageImage, frameAvailable } from "./images";
import { markApproved } from "./store";
import type { ApprovedVenue } from "./types";

export async function saveApprovedPreview(id: string, bytes: Buffer, contentType: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new PlanterError("Invalid assessment reference.");
  await putFile(`approved-frontages/${id}/image.jpg`, bytes, true, contentType);
}

export async function approvedPreview(approved: ApprovedVenue) {
  const id = approved.review.id;
  if (!/^[a-f0-9]{64}$/.test(id)) throw new PlanterError("Invalid assessment reference.");
  return locked(`approved-preview:${id}`, async () => {
    const key = `approved-frontages/${id}/image.jpg`;
    try {
      const bytes = await getFile(key);
      if (fingerprint(bytes) !== approved.review.fingerprint) throw new PlanterError("Saved preview could not be verified.", 502);
      const contentType = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png" : bytes.toString("ascii", 0, 4) === "RIFF" ? "image/webp" : "image/jpeg";
      return { bytes, contentType };
    } catch (error) {
      // A storage outage must never trigger a replacement Google request.
      if (!(error instanceof PlanterError && error.status === 404)) throw error;
    }
    const frame = approved.review.frame;
    if (frame.source === "streetview" && !await frameAvailable(frame)) {
      await markApproved(approved.venue.placeId, "stale");
      throw new PlanterError("The approved panorama changed or disappeared. Reassess this venue.", 409);
    }
    const image = await fetchFrontageImage(approved.venue, frame);
    if (fingerprint(image.bytes) !== approved.review.fingerprint) {
      await markApproved(approved.venue.placeId, "stale");
      throw new PlanterError("The image content changed since assessment. Reassess this venue.", 409);
    }
    await saveApprovedPreview(id, image.bytes, image.contentType);
    return image;
  });
}
