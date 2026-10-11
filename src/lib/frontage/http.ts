import { requireMutation } from "../planters/http";
import { PlanterError } from "../planters/validation";
import { paidAiEnabled } from "../usage-budget";

export function requireDiscoveryConsent(request: Request, confirmed: unknown) {
  requireMutation(request);
  if (confirmed !== true) throw new PlanterError("Confirm the image and assessment budget before starting.", 400);
  if (!process.env.OPENAI_API_KEY || !process.env.GOOGLE_MAPS_API_KEY) throw new PlanterError("Configure GOOGLE_MAPS_API_KEY and OPENAI_API_KEY first.", 503);
  if (!paidAiEnabled()) throw new PlanterError("AI processing is disabled. Ensure ENABLE_PAID_AI is not false.", 503);
}
export function frontageFailure(error: unknown) {
  const status = error instanceof PlanterError ? error.status : error instanceof SyntaxError ? 400 : 502;
  return Response.json({ error: error instanceof Error ? error.message : "Frontage request failed." }, { status });
}
export function placeId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{10,200}$/.test(value)) throw new PlanterError("Invalid venue identifier.");
  return value;
}
