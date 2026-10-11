import { getApproved, markApproved } from "@/lib/frontage/store";
import { reusable } from "@/lib/frontage/engine";
import { fingerprint } from "@/lib/frontage/assessment";
import { fetchFrontageImage, frameAvailable } from "@/lib/frontage/images";
import { frontageFailure, placeId } from "@/lib/frontage/http";
import { requireMutation } from "@/lib/planters/http";
import { PlanterError } from "@/lib/planters/validation";
import { getProject, storeFrontage, storeGoogleFrontage } from "@/lib/project-store";
import type { Project } from "@/lib/projects";
import { storageClient } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: Context) {
  try {
    requireMutation(request); const id = placeId((await context.params).id);
    await markApproved(id, "removed");
    return Response.json({ removed: true });
  } catch (error) { return frontageFailure(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    requireMutation(request);
    const id = placeId((await context.params).id), approved = await getApproved(id);
    if (!approved || approved.status === "removed") throw new PlanterError("Approved venue not found.", 404);
    if (!reusable(approved)) throw new PlanterError("This approval is stale. Reassess before using it.", 409);
    const frame = approved.review.frame;
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      if (Number(request.headers.get("content-length")) > 9_000_000) throw new PlanterError("Preview is too large.", 413);
      const form = await request.formData();
      if (form.get("rightsConfirmed") !== "true") throw new PlanterError("Confirm that you have the necessary rights before storing this image for compositing.");
      if (form.get("assessmentId") !== approved.review.id) throw new PlanterError("The approval changed. Load the latest preview.", 409);
      const image = form.get("image");
      if (!(image instanceof File) || image.size > 8_000_000) throw new PlanterError("Load the approved preview first.");
      const bytes = Buffer.from(await image.arrayBuffer());
      if (fingerprint(bytes) !== approved.review.fingerprint) throw new PlanterError("This image is not the assessed frame. Load the approved preview again.", 409);
      const title = String(form.get("title") || approved.venue.name).trim();
      if (!title || title.length > 160) throw new PlanterError("Use a project name of 1–160 characters.");
      const projectId = `google-${id}`;
      let incomplete: Project | undefined;
      try {
        const existing = await getProject(projectId);
        // Never overwrite a user's existing project/configuration/source.
        if (existing.image && (existing.image.provider === "mapillary" || existing.image.storagePath)) return Response.json(existing);
        if (existing.frontageReview?.assessmentId === approved.review.id) incomplete = existing;
        else throw new PlanterError("A project already exists for this venue. Open it from the library.", 409);
      } catch (error) { if (!(error instanceof PlanterError && error.status === 404)) throw error; }
      const project: Project = {
        id: projectId, title, venueId: id, source: "google", sourceUrl: approved.venue.mapsUrl,
        address: approved.venue.address, category: approved.venue.category, createdAt: new Date().toISOString(),
        notes: `Automatically assessed ${approved.review.checkedAt}. ${approved.review.assessment.reason}\nSource: ${frame.source}. Image reuse rights asserted by user, not verified by this app.`,
        frontageReview: { assessmentId: approved.review.id, checkedAt: approved.review.checkedAt, reason: approved.review.assessment.reason,
          source: frame.source, attribution: frame.source === "streetview" ? frame.copyright : frame.attribution.map(a => a.name).join(", ") },
        ...(frame.source === "streetview" ? { image: { provider: "google-street-view" as const, panoId: frame.panoId, headingOffset: 0, heading: frame.heading, pitch: frame.pitch, fov: frame.fov, captureDate: frame.date } } : {}),
      };
      // Insert-only prevents a concurrent tab from overwriting an existing project.
      if (!incomplete) {
        const { error } = await storageClient().from("projects").insert({ id: project.id, title: project.title, data: project, created_at: project.createdAt, updated_at: project.createdAt });
        if (error?.code === "23505") throw new PlanterError("A project was just created for this venue. Open it from the library.", 409);
        if (error) throw new PlanterError("The project could not be created.", 502);
      }
      const saved = incomplete || project;
      return Response.json(frame.source === "streetview" ? await storeGoogleFrontage(saved, bytes, frame.copyright) : await storeFrontage(saved.id, bytes, "approved-venue-photo.jpg", saved.frontageReview));
    }
    const body = await request.json();
    if (body.confirmed !== true) throw new PlanterError("Confirm image retrieval first.");
    if (frame.source === "streetview" && !await frameAvailable(frame)) {
      await markApproved(id, "stale"); throw new PlanterError("The approved panorama changed or disappeared. Reassess this venue; no replacement has been substituted.", 409);
    }
    const image = await fetchFrontageImage(approved.venue, frame);
    if (fingerprint(image.bytes) !== approved.review.fingerprint) {
      await markApproved(id, "stale"); throw new PlanterError("The image content changed since assessment. Reassess this venue before using the new image.", 409);
    }
    return new Response(new Uint8Array(image.bytes), { headers: { "Content-Type": image.contentType, "Cache-Control": "no-store" } });
  } catch (error) { return frontageFailure(error); }
}
