import sharp, { type OverlayOptions } from "sharp";
import { getFile } from "../storage";
import { readAsset, readAssetFile } from "../planters/store";
import { revisionFile } from "../planters/types";
import { PlanterError } from "../planters/validation";
import type { Project } from "../projects";
import type { CompositionState, Placement } from "./types";
import { estimateKey } from "./types";
import { placementGeometry } from "./geometry";
import { sourceKey } from "./store";

export async function renderComposition(project: Project, placements: Placement[], state: CompositionState) {
  const source = await getFile(sourceKey(project));
  const base = await sharp(source).rotate().resize({ width: 1280, height: 1280, fit: "inside" }).ensureAlpha().png().toBuffer({ resolveWithObject: true });
  const { width, height } = base.info;
  const layers: OverlayOptions[] = [];
  const regions: string[] = [];
  const shadows: string[] = [];
  const plants = [];
  for (const placement of [...placements].sort((a, b) => a.y - b.y)) {
    const asset = await readAsset(placement.assetId);
    const revision = asset.revisions.find(r => r.id === placement.revisionId);
    if (!revision || !asset.approvedRevisionId) throw new PlanterError("A selected planter is unavailable or has not been approved.", 409);
    const geometry = placementGeometry(placement, revision, width, height, state.calibrations[estimateKey(asset.id, revision.id)]);
    const rw = Math.max(1, Math.round(geometry.width)), rh = Math.max(1, Math.round(geometry.height));
    if (rw > width * 3 || rh > height * 3) throw new PlanterError("This planter is too large for the scene.");
    const bytes = await sharp(await readAssetFile(asset.id, revisionFile(revision.id))).resize(rw, rh).png().toBuffer();
    const left = Math.round(geometry.x), top = Math.round(geometry.y);
    const x = Math.max(0, left), y = Math.max(0, top), w = Math.min(width, left + rw) - x, h = Math.min(height - Math.round(height * .045), top + rh) - y;
    if (w > 0 && h > 0) layers.push({ input: await sharp(bytes).extract({ left: x - left, top: y - top, width: w, height: h }).png().toBuffer(), left: x, top: y });
    const groundX = placement.x * width, groundY = placement.y * height;
    shadows.push(`<ellipse cx="${groundX}" cy="${groundY}" rx="${rw * .28}" ry="${Math.max(3, rh * .025)}" fill="black" opacity="${placement.shadow * .3}"/>`);
    regions.push(`<ellipse cx="${groundX}" cy="${groundY + rh * .015}" rx="${rw * .48}" ry="${Math.max(5, rh * .055)}" fill="white"/>`);
    plants.push({ assetId: asset.id, revisionId: revision.id, name: asset.name });
  }
  const shadowSvg = Buffer.from(`<svg width="${width}" height="${height}"><defs><filter id="blur"><feGaussianBlur stdDeviation="4"/></filter></defs><g filter="url(#blur)">${shadows.join("")}</g></svg>`);
  const footerHeight = Math.ceil(height * .045), footerTop = height - footerHeight;
  const footer = await sharp(base.data).extract({ left: 0, top: footerTop, width, height: footerHeight }).png().toBuffer();
  const basic = await sharp(base.data).composite([{ input: shadowSvg }, ...layers, { input: footer, left: 0, top: footerTop }]).png().toBuffer();
  const foreground = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(layers).extractChannel("alpha").raw().toBuffer();
  const region = await sharp(Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><defs><filter id="soft"><feGaussianBlur stdDeviation="5"/></filter></defs><g filter="url(#soft)">${regions.join("")}</g></svg>`)).removeAlpha().greyscale().raw().toBuffer();
  for (let p = 0; p < region.length; p++) region[p] = p >= footerTop * width ? 0 : Math.max(region[p], foreground[p]);
  return { basic, region, foreground, width, height, plants };
}

// Mask back the generated result so pixels outside the placement regions remain exact.
export async function mergeEnhanced(basic: Buffer, generated: Buffer, region: Buffer, width: number, height: number, foreground?: Buffer) {
  const original = await sharp(basic).ensureAlpha().raw().toBuffer();
  // Transfer only broad lighting changes. The original pixels retain product geometry,
  // foliage texture and scene detail even when the image model redesigns the subject.
  const beforeLight = await sharp(basic).blur(12).ensureAlpha().raw().toBuffer();
  const afterLight = await sharp(generated).resize(width, height).blur(12).ensureAlpha().raw().toBuffer();
  if (region.length !== width * height) throw new Error("Invalid enhancement region.");
  if (foreground && foreground.length !== region.length) throw new Error("Invalid foreground protection.");
  for (let p = 0; p < region.length; p++) {
    const weight = region[p] / 255;
    const product = (foreground?.[p] || 0) / 255;
    for (let c = 0; c < 3; c++) {
      const i = p * 4 + c, delta = afterLight[i] - beforeLight[i];
      const bounded = Math.max(-40 + product * 22, Math.min(18, delta));
      original[i] = Math.max(0, Math.min(255, Math.round(original[i] + bounded * weight)));
    }
  }
  return sharp(original, { raw: { width, height, channels: 4 } }).png().toBuffer();
}
