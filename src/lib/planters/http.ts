import { NextResponse } from "next/server";
import { PlanterError } from "./validation";
import { paidAiEnabled } from "../usage-budget";

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

// Existing name retained for callers; local and deployed access now match.
// Provider calls reserve a shared daily slot immediately before dispatch.
export function requireLocalMutation(request: Request) {
  requireMutation(request);
  if (!paidAiEnabled()) throw new PlanterError("AI processing is unavailable. Configure OPENAI_API_KEY and ensure ENABLE_PAID_AI is not false.", 503);
}
