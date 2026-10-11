import { stepRun } from "@/lib/frontage/engine";
import { getRun, withRunLease } from "@/lib/frontage/store";
import { frontageFailure, requireDiscoveryConsent } from "@/lib/frontage/http";
import { requireMutation } from "@/lib/planters/http";
import { validId } from "@/lib/planters/validation";

export const runtime = "nodejs";
export const maxDuration = 120;
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try { return Response.json(await getRun(validId((await context.params).id)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return frontageFailure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const body = await request.json(); requireDiscoveryConsent(request, body.confirmed);
    return Response.json(await withRunLease(validId((await context.params).id), (run, save) => stepRun(run, save)));
  } catch (error) { return frontageFailure(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    requireMutation(request);
    return Response.json(await withRunLease(validId((await context.params).id), async (run, save) => {
      if (run.status === "running") { run.status = "cancelled"; run.message = "Run cancelled. Completed approvals and assessments are preserved."; await save(run); }
      return run;
    }));
  } catch (error) { return frontageFailure(error); }
}
