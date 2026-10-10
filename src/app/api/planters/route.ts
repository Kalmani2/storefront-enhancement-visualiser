import { NextResponse } from "next/server";
import { createAsset, listAssets } from "@/lib/planters/store";
import { imageModel } from "@/lib/planters/extraction";
import { MAX_UPLOAD_BYTES } from "@/lib/planters/images";
import { planterFailure, requireMutation } from "@/lib/planters/http";
import { PlanterError } from "@/lib/planters/validation";
import { storageBucket, storageConfigured } from "@/lib/storage";
import { consumeUpload, readUpload } from "@/lib/uploads";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL === "1" && !storageConfigured()) return NextResponse.json({ error: "Configure Supabase storage on this deployment." }, { status: 503 });
  try { return NextResponse.json({ assets: await listAssets(), configured: Boolean(process.env.OPENAI_API_KEY) && (process.env.VERCEL !== "1" || process.env.ENABLE_HOSTED_EXTRACTION === "true"), uploadsAvailable: true, storage: storageConfigured() ? "supabase" : "local", model: imageModel(), outputDirectory: storageConfigured() ? storageBucket() : "output/planters", ...(process.env.VERCEL === "1" && process.env.ENABLE_HOSTED_EXTRACTION !== "true" ? { message: "Paid extraction is disabled here; saved assets and manual review remain available." } : {}) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return planterFailure(error); }
}

export async function POST(request: Request) {
  try {
    requireMutation(request);
    if (process.env.VERCEL === "1" && !storageConfigured()) throw new PlanterError("Configure Supabase storage on this deployment.", 503);
    if (request.headers.get("content-type")?.includes("application/json")) {
      const body = await request.json();
      const upload = await readUpload("planter", body.upload);
      const asset = await createAsset(upload.bytes, upload.filename, typeof body.name === "string" ? body.name : "");
      await consumeUpload(upload.path);
      return NextResponse.json(asset, { status: 201 });
    }
    if (Number(request.headers.get("content-length")) > MAX_UPLOAD_BYTES + 100_000) throw new PlanterError("Choose an image smaller than 20 MB.");
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File) || image.size > MAX_UPLOAD_BYTES) throw new PlanterError("Upload a JPEG, PNG or WebP image smaller than 20 MB.");
    return NextResponse.json(await createAsset(Buffer.from(await image.arrayBuffer()), image.name, String(form.get("name") || "")), { status: 201 });
  } catch (error) { return planterFailure(error); }
}
