import { getProject, storeFrontage } from "@/lib/project-store";
import { consumeUpload, readUpload } from "@/lib/uploads";
import { getFile } from "@/lib/storage";
import { planterFailure, requireMutation } from "@/lib/planters/http";
import { PlanterError } from "@/lib/planters/validation";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const project = await getProject((await context.params).id);
    if ((project.image?.provider !== "uploaded" && project.image?.provider !== "google-street-view") || !project.image.storagePath) throw new PlanterError("This project has no saved frontage image.", 404);
    const image = await getFile(project.image.storagePath);
    return new Response(new Uint8Array(image), { headers: { "Content-Type": project.image.storagePath.endsWith(".png") ? "image/png" : project.image.storagePath.endsWith(".webp") ? "image/webp" : "image/jpeg", "Cache-Control": "no-store" } });
  } catch (error) { return planterFailure(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    requireMutation(request);
    const body = await request.json();
    const upload = await readUpload("frontage", body.upload);
    const project = await storeFrontage((await context.params).id, upload.bytes, upload.filename);
    await consumeUpload(upload.path);
    return Response.json(project);
  } catch (error) { return planterFailure(error); }
}
