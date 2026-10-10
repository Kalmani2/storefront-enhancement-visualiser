import { getProject, storeFrontage } from "@/lib/project-store";
import { consumeUpload, readUpload } from "@/lib/uploads";
import { signedFileUrl } from "@/lib/storage";
import { planterFailure, requireMutation } from "@/lib/planters/http";
import { PlanterError } from "@/lib/planters/validation";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const project = await getProject((await context.params).id);
    if (project.image?.provider !== "uploaded") throw new PlanterError("This project has no uploaded frontage photo.", 404);
    return new Response(null, { status: 307, headers: { Location: await signedFileUrl(project.image.storagePath), "Cache-Control": "no-store" } });
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
