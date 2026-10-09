import { NextResponse } from "next/server";
import { categories, hasGoogleKey, searchGoogleVenues } from "@/lib/google/provider";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await request.json() as { location?: unknown; category?: unknown };
    const location = typeof body.location === "string" ? body.location.trim() : "";
    if (location.length < 2 || location.length > 80 || !categories.some((item) => item === body.category)) {
      return NextResponse.json({ error: "Enter a location and choose a business category." }, { status: 400 });
    }
    if (!hasGoogleKey()) return NextResponse.json({ error: "Add GOOGLE_MAPS_API_KEY to .env.local and restart the server." }, { status: 503 });
    const result = await searchGoogleVenues(location, body.category as typeof categories[number]);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Google venue search failed." }, { status: 502 });
  }
}
