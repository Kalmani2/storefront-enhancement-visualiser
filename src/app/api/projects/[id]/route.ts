import { getProject, updateProjectDetails } from "@/lib/project-store";
import { removeProject } from "@/lib/library-management";
import { planterFailure, requireMutation } from "@/lib/planters/http";
import { PlanterError } from "@/lib/planters/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try { return Response.json(await getProject((await context.params).id), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return planterFailure(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    requireMutation(request);
    const text = await request.text();
    if (text.length > 10_000) throw new PlanterError("Project details are too large.", 413);
    return Response.json(await updateProjectDetails((await context.params).id, JSON.parse(text)));
  } catch (error) { return planterFailure(error); }
}

export async function DELETE(request: Request, context: Context) {
  try { requireMutation(request); return Response.json(await removeProject((await context.params).id)); }
  catch (error) { return planterFailure(error); }
}
