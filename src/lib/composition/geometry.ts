import type { Placement, ScaleEstimate } from "./types";
import type { PlanterRevision } from "../planters/types";

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function estimatedHeight(referencePixelsFraction: number, referenceMetres: number, containerMetres: number, containerFraction: number) {
  return clamp(referencePixelsFraction / referenceMetres * containerMetres / containerFraction, 0.06, 0.72);
}

export function fallbackEstimate(assetId: string, revisionId: string, reason = "No reliable reference was detected; starting from typical entrance and container proportions."): ScaleEstimate {
  return {
    assetId, revisionId, method: "heuristic", confidence: "low", reason,
    reference: { top: { x: .5, y: .28 }, bottom: { x: .5, y: .78 }, heightMetres: 2.1 },
    containerHeightMetres: .6, containerFraction: .45,
    height: estimatedHeight(.5, 2.1, .6, .45), ground: { x: .3, y: .8 }, horizon: .38,
  };
}

export function placementGeometry(placement: Placement, revision: Pick<PlanterRevision, "width" | "height" | "contactPoint">, imageWidth: number, imageHeight: number, estimate?: ScaleEstimate) {
  const factor = placement.perspective && estimate
    ? clamp((placement.y - estimate.horizon) / Math.max(.12, estimate.reference.bottom.y - estimate.horizon), .55, 1.75) : 1;
  const height = placement.height * factor * imageHeight, width = height * revision.width / revision.height;
  return { x: placement.x * imageWidth - width * revision.contactPoint.x, y: placement.y * imageHeight - height * revision.contactPoint.y, width, height, factor };
}
