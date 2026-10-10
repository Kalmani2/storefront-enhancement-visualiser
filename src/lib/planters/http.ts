import { NextResponse } from "next/server";
import { PlanterError } from "./validation";

export function planterFailure(error: unknown) {
  if (error instanceof PlanterError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("Planter request failed:", error instanceof Error ? error.message : "Unknown error");
  return NextResponse.json({ error: "The local planter files could not be processed. Check the server terminal and retry." }, { status: 500 });
}

export function requireLocalMutation(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host")?.split(":")[0];
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || (host && !["localhost", "127.0.0.1", "["].includes(host))) throw new PlanterError("The planter library is configured for local use only.", 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) throw new PlanterError("Open the planter library directly on this local server.", 403);
}
