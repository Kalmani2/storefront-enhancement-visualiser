import { getProject } from "@/lib/project-store";
import { getFile, contentType } from "@/lib/storage";
import { readComposition, readCompositionFile } from "@/lib/composition/store";
import { latestEnhancedVersion } from "@/lib/composition/types";
import { planterFailure } from "@/lib/planters/http";
import { PlanterError } from "@/lib/planters/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const project = await getProject((await context.params).id);
    if ((project.image?.provider !== "uploaded" && project.image?.provider !== "google-street-view") || !project.image.storagePath) throw new PlanterError("This project has no saved frontage image.", 404);
    const latest = latestEnhancedVersion((await readComposition(project)).versions);
    const file = latest?.enhancedFile || project.image.storagePath;
    const bytes = latest?.enhancedFile ? await readCompositionFile(project.id, latest.enhancedFile) : await getFile(file);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": contentType(file), "Cache-Control": "no-store" } });
  } catch (error) { return planterFailure(error); }
}
