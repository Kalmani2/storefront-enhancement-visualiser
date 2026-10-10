import { NextResponse } from "next/server";
import { PlanterError } from "./validation";

export function planterFailure(error: unknown) {
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Send valid JSON." }, { status: 400 });
  if (error instanceof PlanterError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("Planter request failed:", error instanceof Error ? error.message : "Unknown error");
  return NextResponse.json({ error: "The library could not be processed. Check the server logs and retry." }, { status: 500 });
}

export function requireMutation(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new PlanterError("Open the library directly on this server before saving.", 403);
}

// A deployed shared demo must not expose a paid extraction endpoint by default.
export function requireLocalMutation(request: Request) {
  requireMutation(request);
  if (process.env.VERCEL === "1" && process.env.ENABLE_HOSTED_EXTRACTION !== "true") throw new PlanterError("Paid extraction is disabled in the hosted demo. Existing assets can still be uploaded, reviewed and approved.", 503);
  if (process.env.VERCEL !== "1" && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname)) throw new PlanterError("Paid local extraction is restricted to localhost.", 403);
}
