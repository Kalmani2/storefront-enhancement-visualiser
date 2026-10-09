import { NextResponse } from "next/server";
import { findFrontage } from "@/lib/discovery/frontage";
import type { Venue } from "@/lib/discovery/types";

export const runtime = "nodejs";
const maxChecks = 3;
let checksStarted = 0;
const completed = new Map<string, Awaited<ReturnType<typeof findFrontage>>>();

export async function POST(request: Request) {
  try {
    const body = await request.json() as { venue?: Venue; imageId?: unknown };
    const venue = body.venue;
    if (!venue || !/^(node|way|relation)\/\d+$/.test(venue.id) || !Number.isFinite(venue.latitude) || !Number.isFinite(venue.longitude) || !venue.name || venue.name.length > 150) {
      return NextResponse.json({ error: "A valid venue is required." }, { status: 400 });
    }
    if (typeof body.imageId !== "string" || !/^\d+$/.test(body.imageId)) {
      return NextResponse.json({ error: "Choose one photo to verify." }, { status: 400 });
    }
    const cacheKey = `${venue.id}:${body.imageId}`;
    const cached = completed.get(cacheKey);
    if (cached) return NextResponse.json(cached);
    if (checksStarted >= maxChecks) {
      return NextResponse.json({ error: "The demo's three-check OpenAI limit has been reached. No more paid checks will run in this server process." }, { status: 429 });
    }
    checksStarted += 1;
    const result = await findFrontage(venue, body.imageId);
    completed.set(cacheKey, result);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Frontage search failed." }, { status: 502 });
  }
}
