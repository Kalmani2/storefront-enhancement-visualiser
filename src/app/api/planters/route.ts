import { NextResponse } from "next/server";
import { createAsset, listAssets } from "@/lib/planters/store";
import { imageModel } from "@/lib/planters/extraction";
import { MAX_UPLOAD_BYTES } from "@/lib/planters/images";
import { planterFailure, requireLocalMutation } from "@/lib/planters/http";
import { PlanterError } from "@/lib/planters/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // The local filesystem library has no shared, persistent storage on Vercel.
  if (process.env.VERCEL === "1") return NextResponse.json({ assets: [], configured: false, uploadsAvailable: false, model: imageModel(), outputDirectory: "", message: "Planter uploads and extraction are available in the local app. They are not available in this hosted demo yet." }, { headers: { "Cache-Control": "no-store" } });
  try { return NextResponse.json({ assets: await listAssets(), configured: Boolean(process.env.OPENAI_API_KEY), model: imageModel(), outputDirectory: "output/planters" }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return planterFailure(error); }
}

export async function POST(request: Request) {
  try {
    requireLocalMutation(request);
    if (Number(request.headers.get("content-length")) > MAX_UPLOAD_BYTES + 100_000) throw new PlanterError("Choose an image smaller than 20 MB.");
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File) || image.size > MAX_UPLOAD_BYTES) throw new PlanterError("Upload a JPEG, PNG or WebP image smaller than 20 MB.");
    return NextResponse.json(await createAsset(Buffer.from(await image.arrayBuffer()), image.name, String(form.get("name") || "")), { status: 201 });
  } catch (error) { return planterFailure(error); }
}
