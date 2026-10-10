import { NextResponse } from "next/server";
import { categories, hasGoogleKey, searchGoogleLocation, searchGoogleVenues } from "@/lib/google/provider";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await request.json() as { mode?: unknown; query?: unknown; location?: unknown; category?: unknown };
    if (body.mode !== undefined && body.mode !== "prospects" && body.mode !== "direct") return NextResponse.json({ error: "Choose a search mode." }, { status: 400 });
    const direct = body.mode === "direct";
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const location = typeof body.location === "string" ? body.location.trim() : "";
    if (direct ? query.length < 3 || query.length > 200 : location.length < 2 || location.length > 80 || !categories.some((item) => item === body.category)) {
      return NextResponse.json({ error: direct ? "Enter a London business name or address (3–200 characters)." : "Enter a location and choose a business category." }, { status: 400 });
    }
    if (!hasGoogleKey()) return NextResponse.json({ error: "Add GOOGLE_MAPS_API_KEY to .env.local and restart the server." }, { status: 503 });
    const result = direct ? await searchGoogleLocation(query) : await searchGoogleVenues(location, body.category as typeof categories[number]);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Google venue search failed." }, { status: 502 });
  }
}
