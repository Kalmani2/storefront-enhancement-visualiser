import { assetFile } from "@/lib/planters/store";
import { planterFailure } from "@/lib/planters/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string; file: string }> }) {
  try {
    const { id, file } = await context.params;
    const bytes = await assetFile(id, file);
    const type = file.endsWith(".json") ? "application/json" : file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "image/jpeg";
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      ...(new URL(request.url).searchParams.has("download") ? { "Content-Disposition": `attachment; filename="${file}"` } : {}),
    } });
  } catch (error) { return planterFailure(error); }
}
