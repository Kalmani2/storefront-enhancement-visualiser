import { getProject } from "@/lib/project-store";
import { readComposition, readCompositionFile } from "@/lib/composition/store";
import { planterFailure } from "@/lib/planters/http";
import { PlanterError } from "@/lib/planters/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string; file: string }> }) {
  try {
    const { id, file } = await context.params, project = await getProject(id), state = await readComposition(project);
    if (!state.versions.some(v => file === v.basicFile || file === v.enhancedFile)) throw new PlanterError("Output not found.", 404);
    const output = state.versions.find(v => v.enhancedFile === file);
    if (new URL(request.url).searchParams.has("download") && output?.review && output.review.status !== "passed") throw new PlanterError(output.review.status === "rejected" ? "This render failed its quality checks. Adjust the layout and render again." : "Review and approve this render before exporting it.", 409);
    const bytes = await readCompositionFile(id, file);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store", ...(new URL(request.url).searchParams.has("download") ? { "Content-Disposition": `attachment; filename="storefront-${file}"` } : {}) } });
  } catch (error) { return planterFailure(error); }
}
