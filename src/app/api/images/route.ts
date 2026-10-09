import { NextResponse } from "next/server";
import { findStreetImages } from "@/lib/discovery/imagery";
import type { Venue } from "@/lib/discovery/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { venue?: Venue };
    const venue = body.venue;
    if (!venue || !/^(node|way|relation)\/\d+$/.test(venue.id) || !Number.isFinite(venue.latitude) || !Number.isFinite(venue.longitude) || !venue.name || venue.name.length > 150) {
      return NextResponse.json({ error: "A valid venue is required." }, { status: 400 });
    }
    return NextResponse.json(await findStreetImages(venue));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Image search failed." }, { status: 502 });
  }
}
