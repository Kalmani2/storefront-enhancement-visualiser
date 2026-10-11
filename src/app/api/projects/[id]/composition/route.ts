import { after } from "next/server";
import { paidAiEnabled, DAILY_LIMITS } from "@/lib/usage-budget";
import { deleteCompositionVersion } from "@/lib/composition/versions";
import { getProject } from "@/lib/project-store";
import { locked } from "@/lib/planters/store";
import { planterFailure, requireMutation, requireLocalMutation } from "@/lib/planters/http";
import { PlanterError, validId } from "@/lib/planters/validation";
import { readComposition, writeComposition, parsePlacements } from "@/lib/composition/store";
import { ANALYSIS_VERSION, estimateScale } from "@/lib/composition/scale";
import { estimateKey } from "@/lib/composition/types";
import { compositionModel, createComposition, recoverComposition, runEnhancement } from "@/lib/composition/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try { return Response.json({ ...(await readComposition(await getProject((await context.params).id))), model: compositionModel(), configured: paidAiEnabled(), dailyLimits: DAILY_LIMITS }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return planterFailure(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    requireMutation(request);
    const text = await request.text();
    if (text.length > 50_000) throw new PlanterError("Composition details are too large.", 413);
    const body = JSON.parse(text), project = await getProject((await context.params).id);
    if (body.action === "delete-version") return Response.json(await deleteCompositionVersion(project, body.versionId));
    if (body.action === "calibrate") {
      const assetId = validId(body.assetId), revisionId = validId(body.revisionId), key = estimateKey(assetId, revisionId);
      return await locked(`composition:${project.id}`, async () => {
        const state = await readComposition(project);
        if (state.calibrations[key]?.analysisVersion !== ANALYSIS_VERSION) {
          if (paidAiEnabled()) state.calibrations[key] = await estimateScale(project, assetId, revisionId);
          else { const { fallbackEstimate } = await import("@/lib/composition/geometry"); state.calibrations[key] = fallbackEstimate(assetId, revisionId); }
          await writeComposition(project.id, state);
        }
        return Response.json(state.calibrations[key]);
      });
    }
    if (body.action === "approve") return await locked(`composition:${project.id}`, async () => {
      const state = await readComposition(project), version = state.versions.find(v => v.id === validId(body.versionId));
      if (!version?.enhancedFile || !version.review || version.review.status === "passed") throw new PlanterError("Choose a rendered image with review concerns to approve.");
      version.review = { ...version.review, status: "passed", manual: true };
      state.resultVersionId = version.id;
      await writeComposition(project.id, state); return Response.json(state);
    });
    if (body.action === "recover") {
      requireLocalMutation(request);
      const state = await recoverComposition(project, validId(body.versionId));
      after(() => runEnhancement(project, state.job!.id));
      return Response.json(state, { status: 202 });
    }
    const placements = parsePlacements(body.placements);
    if (body.action === "draft") return await locked(`composition:${project.id}`, async () => {
      const state = await readComposition(project); state.draft = placements;
      await writeComposition(project.id, state); return Response.json(state);
    });
    if (body.action !== "save" && body.action !== "enhance") throw new PlanterError("Choose a composition action.");
    if (body.action === "enhance") requireLocalMutation(request);
    const state = await createComposition(project, placements, body.action === "enhance", body.regenerate === true);
    if (state.job) { const jobId = state.job.id; after(() => runEnhancement(project, jobId)); }
    return Response.json(state, { status: state.job ? 202 : 201 });
  } catch (error) { return planterFailure(error); }
}
