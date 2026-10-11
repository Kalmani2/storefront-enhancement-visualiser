import { categories } from "@/lib/google/prospects";
import { freshRun } from "@/lib/frontage/engine";
import { createRun, latestRun, listApproved } from "@/lib/frontage/store";
import { frontageFailure, placeId, requireDiscoveryConsent } from "@/lib/frontage/http";
import { PlanterError, validId } from "@/lib/planters/validation";

export const runtime = "nodejs";
export async function GET() {
  try { return Response.json({ venues: await listApproved(), run: await latestRun() }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return frontageFailure(error); }
}
export async function POST(request: Request) {
  try {
    const body = await request.json(); requireDiscoveryConsent(request, body.confirmed);
    const id = validId(body.id), location = typeof body.location === "string" ? body.location.trim() : "";
    const category = body.category || "all";
    if (location.length < 2 || location.length > 80 || !["all", ...categories].includes(category)) throw new PlanterError("Enter a London area and a valid business category.");
    const venueId = body.placeId === undefined ? undefined : placeId(body.placeId);
    return Response.json(await createRun(freshRun(id, location, category, venueId, body.force === true)));
  } catch (error) { return frontageFailure(error); }
}
