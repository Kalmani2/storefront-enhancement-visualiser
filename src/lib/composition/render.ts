import sharp, { type OverlayOptions } from "sharp";
import { getFile } from "../storage";
import { readAsset, readAssetFile } from "../planters/store";
import { revisionFile } from "../planters/types";
import { PlanterError } from "../planters/validation";
import type { Project } from "../projects";
import type { CompositionState, Placement } from "./types";
import { estimateKey } from "./types";
import { outputDimensions, placementGeometry, projectedPoint } from "./geometry";
import { sourceKey } from "./store";
import { findGroundContacts } from "./contacts";

export const COMPOSITION_ENGINE = 5;

// Premultiplied-alpha affine sampling keeps fine leaves clean when changing the guide's angle.
async function warpCutout(bytes: Buffer, geometry: ReturnType<typeof placementGeometry>, width: number, height: number) {
  const input = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const left = Math.max(0, Math.floor(geometry.x)), top = Math.max(0, Math.floor(geometry.y));
  const rw = Math.min(width, Math.ceil(geometry.x + geometry.width)) - left;
  const rh = Math.min(Math.floor(height * .955), Math.ceil(geometry.y + geometry.height)) - top;
  if (rw < 1 || rh < 1) return null;
  const data = Buffer.alloc(rw * rh * 4), { a, b, c, d, originX, originY } = geometry, determinant = a * d - b * c;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const px = left + x + .5 - originX, py = top + y + .5 - originY;
    const u = (d * px - c * py) / determinant, v = (a * py - b * px) / determinant;
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    const sx = u * (input.info.width - 1), sy = v * (input.info.height - 1), x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    const out = (y * rw + x) * 4; let alpha = 0; const colour = [0, 0, 0];
    for (let iy = 0; iy <= 1; iy++) for (let ix = 0; ix <= 1; ix++) {
      const index = (Math.min(input.info.height - 1, y0 + iy) * input.info.width + Math.min(input.info.width - 1, x0 + ix)) * 4;
      const weight = (ix ? fx : 1 - fx) * (iy ? fy : 1 - fy) * input.data[index + 3] / 255;
      alpha += weight; for (let k = 0; k < 3; k++) colour[k] += input.data[index + k] * weight;
    }
    data[out + 3] = Math.round(alpha * 255);
    if (alpha > 0) for (let k = 0; k < 3; k++) data[out + k] = Math.round(colour[k] / alpha);
  }
  return { input: await sharp(data, { raw: { width: rw, height: rh, channels: 4 } }).png().toBuffer(), left, top };
}

export async function renderComposition(project: Project, placements: Placement[], state: CompositionState) {
  const source = await getFile(sourceKey(project)), metadata = await sharp(source).metadata();
  const { width, height } = outputDimensions(metadata.width!, metadata.height!);
  const original = await sharp(source).rotate().resize(width, height).ensureAlpha().png().toBuffer();
  const layers: OverlayOptions[] = [], shadows: string[] = [], regions: string[] = [], plants = [];
  for (const placement of [...placements].sort((a, b) => a.y - b.y)) {
    const asset = await readAsset(placement.assetId), revision = asset.revisions.find(r => r.id === placement.revisionId);
    if (!revision || !asset.approvedRevisionId) throw new PlanterError("A selected planter is unavailable or has not been approved.", 409);
    const estimate = state.calibrations[estimateKey(asset.id, revision.id)];
    const geometry = placementGeometry(placement, revision, width, height, estimate);
    if (geometry.width > width * 3 || geometry.height > height * 3) throw new PlanterError("This planter is too large for the scene.");
    const bytes = await readAssetFile(asset.id, revisionFile(revision.id)), layer = await warpCutout(bytes, geometry, width, height);
    if (layer) layers.push(layer);
    const contacts = estimate?.product?.contacts || revision.groundContacts || await findGroundContacts(bytes);
    for (const contact of contacts.length ? contacts : [{ ...revision.contactPoint, width: .55 }]) {
      const p = projectedPoint(geometry, contact), rx = Math.abs(geometry.a) * contact.width * .49, ry = Math.max(2, geometry.height * .018);
      shadows.push(`<ellipse cx="${p.x}" cy="${p.y}" rx="${rx}" ry="${ry}" fill="black" opacity="${placement.shadow * .48}"/><ellipse cx="${p.x + rx * .12}" cy="${p.y + ry}" rx="${rx * 1.22}" ry="${ry * 1.7}" fill="black" opacity="${placement.shadow * .12}"/>`);
    }
    // The entire volume, including room for changed viewpoint and cast shadows, is editable.
    // A soft perimeter removes the visible rectangular patch left by a hard bbox mask.
    const padX = geometry.width * .24, padY = geometry.height * .075;
    regions.push(`<rect x="${geometry.x - padX}" y="${geometry.y - padY}" width="${geometry.width + 2 * padX}" height="${geometry.height + padY + geometry.height * .22}" rx="${Math.min(geometry.width, geometry.height) * .12}" fill="white"/>`);
    plants.push({ assetId: asset.id, revisionId: revision.id, name: asset.name, geometry, description: estimate?.product?.description || asset.name, containerCount: estimate?.product?.containerCount || Math.max(1, contacts.length) });
  }
  const footerHeight = Math.ceil(height * .045), footerTop = height - footerHeight;
  const footer = await sharp(original).extract({ left: 0, top: footerTop, width, height: footerHeight }).png().toBuffer();
  const shadowSvg = Buffer.from(`<svg width="${width}" height="${height}"><defs><filter id="soft"><feGaussianBlur stdDeviation="${Math.max(1.2, width / 640)}"/></filter></defs><g filter="url(#soft)">${shadows.join("")}</g></svg>`);
  const basic = await sharp(original).composite([{ input: shadowSvg }, ...layers, { input: footer, left: 0, top: footerTop }]).png().toBuffer();
  const region = await sharp(Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/>${regions.join("")}</svg>`)).removeAlpha().greyscale().blur(Math.max(4, width / 110)).raw().toBuffer();
  // Quantise negligible blur tails to zero, guaranteeing all outside pixels are untouched.
  for (let p = 0; p < region.length; p++) region[p] = p >= footerTop * width || region[p] < 4 ? 0 : region[p] > 250 ? 255 : region[p];
  const foreground = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(layers).extractChannel("alpha").raw().toBuffer();
  return { basic, original, region, foreground, width, height, plants };
}
