import { getProject, storeGoogleFrontage } from "@/lib/project-store";
import { getGoogleVenue, getStreetViewMetadata, loadStreetViewImage } from "@/lib/google/provider";
import { readFrame } from "@/lib/google/streetview";
import { locked } from "@/lib/planters/store";
import { planterFailure, requireMutation } from "@/lib/planters/http";
import { PlanterError } from "@/lib/planters/validation";

export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    requireMutation(request);
    const { id } = await context.params;
    return await locked(`source:${id}`, async () => {
      const project = await getProject(id);
      if (project.image?.provider !== "google-street-view") throw new PlanterError("Choose a Street View image in Venue search first.");
      if (request.headers.get("content-type")?.includes("multipart/form-data")) {
        if (Number(request.headers.get("content-length")) > 5_000_000) throw new PlanterError("Street View image is too large.", 413);
        const form = await request.formData(), image = form.get("image");
        if (!(image instanceof File) || image.size > 4_000_000) throw new PlanterError("Choose a loaded Street View image.");
        const frame = readFrame(String(form.get("candidateToken")), project.venueId);
        if (frame.panoId !== project.image.panoId || Number(form.get("offset")) !== project.image.headingOffset || Number(form.get("fov")) !== project.image.fov) throw new PlanterError("The loaded image does not match this project's selected view.");
        return Response.json(await storeGoogleFrontage(project, Buffer.from(await image.arrayBuffer()), "© Google"));
      }
      if (project.image.storagePath) return Response.json(project);
      // Older projects have only a camera reference. Retrieve that exact saved view once.
      const venue = await getGoogleVenue(project.venueId);
      const metadata = await getStreetViewMetadata(venue);
      const panoId = project.image.panoId;
      const selected = metadata.candidates?.find(item => item.panoId === panoId);
      if (!selected) throw new PlanterError("The saved camera is no longer available. Choose a new image in Venue search.", 404);
      const response = await loadStreetViewImage(venue, project.image.headingOffset, selected.token, project.image.fov);
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new PlanterError("The saved Street View image could not be loaded.", 502);
      return Response.json(await storeGoogleFrontage(project, Buffer.from(await response.arrayBuffer()), selected.copyright));
    });
  } catch (error) { return planterFailure(error); }
}
