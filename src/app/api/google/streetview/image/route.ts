import { NextResponse } from "next/server";
import { hasGoogleKey, loadStreetViewImage } from "@/lib/google/provider";
import { isGoogleVenue } from "@/lib/google/validation";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await request.json() as { venue?: unknown; offset?: unknown };
    if (!isGoogleVenue(body.venue) || typeof body.offset !== "number" || !Number.isInteger(body.offset) || body.offset < -30 || body.offset > 30) {
      return NextResponse.json({ error: "Choose a valid venue and heading adjustment." }, { status: 400 });
    }
    if (!hasGoogleKey()) return NextResponse.json({ error: "Add GOOGLE_MAPS_API_KEY to .env.local and restart the server." }, { status: 503 });
    const upstream = await loadStreetViewImage(body.venue, body.offset);
    if (!upstream.ok || !upstream.headers.get("content-type")?.startsWith("image/")) {
      return NextResponse.json({ error: `Street View image unavailable (${upstream.status}).` }, { status: 502 });
    }
    return new Response(upstream.body, { status: 200, headers: { "Content-Type": upstream.headers.get("content-type") || "image/jpeg", "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Street View image failed." }, { status: 502 });
  }
}
