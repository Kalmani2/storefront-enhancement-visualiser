import { listProjects, storeProject } from "@/lib/project-store";
import { planterFailure, requireMutation } from "@/lib/planters/http";
import { PlanterError } from "@/lib/planters/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return Response.json(await listProjects(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return planterFailure(error); }
}

export async function POST(request: Request) {
  try {
    requireMutation(request);
    const text = await request.text();
    if (text.length > 100_000) throw new PlanterError("Project details are too large.", 413);
    const body = JSON.parse(text);
    return Response.json(await storeProject(body.project, body.migration === true));
  } catch (error) { return planterFailure(error); }
}
