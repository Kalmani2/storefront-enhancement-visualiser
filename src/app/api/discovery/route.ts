import { NextResponse } from "next/server";
import { discoverVenues } from "@/lib/discovery/venues";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { location?: unknown };
    const location = typeof body.location === "string" ? body.location.trim() : "";
    if (location.length < 2 || location.length > 80) return NextResponse.json({ error: "Enter a London neighbourhood or postcode." }, { status: 400 });
    const result = await discoverVenues(location);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Venue discovery failed." }, { status: 502 });
  }
}
