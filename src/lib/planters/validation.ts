import type { ExtractionSettings, SelectionBox } from "./types";

export class PlanterError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function validId(id: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) throw new PlanterError("Invalid planter ID.");
  return id;
}

export function parseSettings(value: unknown): ExtractionSettings {
  if (!value || typeof value !== "object") throw new PlanterError("Extraction settings are required.");
  const v = value as Record<string, unknown>;
  if (v.mode !== "extract" && v.mode !== "reconstruct") throw new PlanterError("Choose an extraction mode.");
  if (v.quality !== undefined && v.quality !== "medium") throw new PlanterError("Only medium quality is available.");
  if (typeof v.target !== "string" || v.target.length > 1500) throw new PlanterError("Describe the planter in 1,500 characters or fewer.");
  let selection: SelectionBox | undefined;
  if (v.selection !== undefined) {
    if (!v.selection || typeof v.selection !== "object") throw new PlanterError("Invalid selection.");
    const b = v.selection as SelectionBox;
    if (![b.x, b.y, b.width, b.height].every(Number.isFinite) || b.x < 0 || b.y < 0 || b.width < 0.02 || b.height < 0.02 || b.x + b.width > 1.001 || b.y + b.height > 1.001) throw new PlanterError("Select a larger area within the image.");
    selection = { x: b.x, y: b.y, width: Math.min(b.width, 1 - b.x), height: Math.min(b.height, 1 - b.y) };
  }
  return { mode: v.mode, quality: "medium", target: v.target.trim(), selection };
}

export function extractionPrompt(settings: ExtractionSettings) {
  return [
    "Create a photorealistic reusable transparent planter asset from the supplied photograph.",
    `Target: ${settings.target || "The most prominent foreground planter arrangement, including its containers and the plants growing in them."}`,
    settings.selection ? "Image 1 is the original reference. Image 2 marks the target with a red rectangle. The rectangle only identifies the target; never include it in the output. Retain all plants belonging to the target, even if a leaf extends outside the rectangle." : "Identify the target carefully among any other planters in the scene.",
    "Keep the target containers AND their own plants together as one arrangement. Preserve their relative positions, container count, proportions, material, colours, distinctive details and natural foliage. Preserve the source camera viewpoint.",
    settings.mode === "reconstruct"
      ? "Remove all people and unrelated foreground objects. Reconstruct portions of the target hidden by them or cut off by the photo, using visible geometry, material and symmetry. Complete any cropped base so the full containers stand independently. Infer conservatively: the result is a reconstruction of this product, not a new design."
      : "Extract only the visible target faithfully. Do not redesign, fill missing product regions, invent hidden leaves, extend cropped containers, or change viewpoint. Where unrelated objects obscure the target, leave those missing portions transparent rather than including the obstruction.",
    "Remove all buildings, pavement, furniture, neighbouring unrelated plants and planters, people, ground shadows, floor planes, scenery and background. Keep natural shading on the product itself.",
    "Output real RGBA PNG transparency, including gaps between leaves and stems. No solid backdrop, fake checkerboard, halo, outline, text annotation, watermark or detached cast shadow.",
    "Centre the complete target with generous transparent padding on every side. Never crop plant tips or the container base. Preserve fine stems and clean leaf edges. Deliver exactly one isolated arrangement, not a contact sheet or multiple views.",
  ].join("\n\n");
}
