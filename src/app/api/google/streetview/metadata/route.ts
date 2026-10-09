import { NextResponse } from "next/server";
import { getStreetViewMetadata, hasGoogleKey } from "@/lib/google/provider";
import { isGoogleVenue } from "@/lib/google/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { venue?: unknown };
    if (!isGoogleVenue(body.venue)) return NextResponse.json({ error: "A valid Google venue is required." }, { status: 400 });
    if (!hasGoogleKey()) return NextResponse.json({ error: "Add GOOGLE_MAPS_API_KEY to .env.local and restart the server." }, { status: 503 });
    return NextResponse.json(await getStreetViewMetadata(body.venue), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Street View lookup failed." }, { status: 502 });
  }
}
