import type { Placement, ScaleEstimate } from "./types";
import type { PlanterRevision } from "../planters/types";

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export function outputDimensions(width: number, height: number) {
  const scale = 1280 / Math.max(width, height);
  return { width: Math.max(512, Math.round(width * scale / 16) * 16), height: Math.max(512, Math.round(height * scale / 16) * 16) };
}

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
  const height = placement.height * factor * imageHeight;
  const radians = (placement.yaw || 0) * Math.PI / 180;
  const width = height * revision.width / revision.height * (1 - .28 * Math.abs(Math.sin(radians)));
  // The preview is an affine placement guide. The AI render reconstructs the 3D view.
  const slope = estimate?.scene ? clamp(estimate.scene.groundSlope - (placement.flip ? -1 : 1) * (estimate.product?.baseSlope || 0), -.25, .25) : 0;
  const a = placement.flip ? -width : width, b = a * slope;
  const c = -Math.sin(radians) * height * .075, d = height;
  const cx = placement.flip ? 1 - revision.contactPoint.x : revision.contactPoint.x;
  const originX = placement.x * imageWidth - width * cx - c * revision.contactPoint.y + (placement.flip ? width : 0);
  const originY = placement.y * imageHeight - b * revision.contactPoint.x - d * revision.contactPoint.y;
  const corners = [{ x: originX, y: originY }, { x: originX + a, y: originY + b }, { x: originX + a + c, y: originY + b + d }, { x: originX + c, y: originY + d }];
  const x = Math.min(...corners.map(p => p.x)), y = Math.min(...corners.map(p => p.y));
  return { x, y, width: Math.max(...corners.map(p => p.x)) - x, height: Math.max(...corners.map(p => p.y)) - y, factor, a, b, c, d, originX, originY, corners };
}

export function projectedPoint(geometry: ReturnType<typeof placementGeometry>, point: { x: number; y: number }) {
  return { x: geometry.originX + geometry.a * point.x + geometry.c * point.y, y: geometry.originY + geometry.b * point.x + geometry.d * point.y };
}
