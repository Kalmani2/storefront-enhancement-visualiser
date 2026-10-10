import { NextResponse } from "next/server";
import { getGoogleVenue, hasGoogleKey } from "@/lib/google/provider";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const placeId = new URL(request.url).searchParams.get("placeId") || "";
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(placeId)) return NextResponse.json({ error: "A valid place ID is required." }, { status: 400 });
    if (!hasGoogleKey()) return NextResponse.json({ error: "GOOGLE_MAPS_API_KEY is not configured." }, { status: 503 });
    return NextResponse.json(await getGoogleVenue(placeId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Venue details failed." }, { status: 502 });
  }
}
