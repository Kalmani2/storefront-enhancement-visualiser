import { NextResponse } from "next/server";
import { saveManualRevision } from "@/lib/planters/extraction";
import { MAX_UPLOAD_BYTES } from "@/lib/planters/images";
import { PlanterError } from "@/lib/planters/validation";
import { planterFailure, requireLocalMutation } from "@/lib/planters/http";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireLocalMutation(request);
    if (Number(request.headers.get("content-length")) > MAX_UPLOAD_BYTES + 100_000) throw new PlanterError("The edited image is too large.");
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File) || image.size > MAX_UPLOAD_BYTES) throw new PlanterError("Send an edited PNG smaller than 20 MB.");
    return NextResponse.json(await saveManualRevision((await context.params).id, String(form.get("parentId") || ""), Buffer.from(await image.arrayBuffer())));
  } catch (error) { return planterFailure(error); }
}
