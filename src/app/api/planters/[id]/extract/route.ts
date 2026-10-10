import { after, NextResponse } from "next/server";
import { queueExtraction, runExtraction } from "@/lib/planters/extraction";
import { parseSettings } from "@/lib/planters/validation";
import { planterFailure, requireLocalMutation } from "@/lib/planters/http";

export const runtime = "nodejs";
export const maxDuration = 400;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireLocalMutation(request);
    const { id } = await context.params;
    const asset = await queueExtraction(id, parseSettings(await request.json()));
    const jobId = asset.job!.id;
    after(() => runExtraction(id, jobId));
    return NextResponse.json(asset, { status: 202 });
  } catch (error) { return planterFailure(error); }
}
