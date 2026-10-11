import sharp from "sharp";
import { PlanterError } from "../planters/validation";
import { findGroundContacts } from "./contacts";

function bounds(alpha: Uint8Array, width: number, height: number, threshold = 180) {
  let left = width, right = -1, top = height, bottom = -1, count = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (alpha[y * width + x] > threshold) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); count++;
  }
  if (count < 40) throw new PlanterError("The generated installation layer is empty. Your layout is saved; no paid retry was made.", 422);
  return { left, right, top, bottom, width: right - left + 1, height: bottom - top + 1, count };
}

export async function composeInstallation(original: Buffer, generated: Buffer, guideAlpha: Buffer, region: Buffer, width: number, height: number, sourceWidth: number, contactStrength = .65) {
  const metadata = await sharp(generated).metadata();
  if (!metadata.hasAlpha) throw new PlanterError("The model returned an opaque scene instead of a transparent installation layer. This render cannot replace the storefront.", 422);
  const layer = await sharp(generated).resize(width, height).ensureAlpha().raw().toBuffer();
  const alpha = Buffer.alloc(width * height);
  for (let p = 0; p < alpha.length; p++) alpha[p] = layer[p * 4 + 3];
  const target = bounds(guideAlpha, width, height), actual = bounds(alpha, width, height);
  const transparent = alpha.reduce((sum, a) => sum + (a < 8 ? 1 : 0), 0) / alpha.length;
  if (transparent < .3) throw new PlanterError("The generated layer contains too much opaque background. It has been withheld to protect the original storefront.", 422);
  // Image models sometimes centre or enlarge a transparent output. Anchor it back to
  // the exact layout height, horizontal centre and ground level without flattening its new view.
  const scale = target.height / actual.height;
  if (scale < .2 || scale > 3) throw new PlanterError("The generated product scale is inconsistent with this layout.", 422);
  if (actual.count * scale * scale > target.count * 2.6) throw new PlanterError("The generated layer contains too much solid material for this arrangement.", 422);
  const resized = await sharp(generated).resize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))).ensureAlpha().png().toBuffer({ resolveWithObject: true });
  const dx = Math.round((target.left + target.right) / 2 - (actual.left + actual.right) / 2 * scale);
  const dy = Math.round(target.bottom - actual.bottom * scale);
  const left = Math.max(0, dx), top = Math.max(0, dy), rw = Math.min(width, dx + resized.info.width) - left, rh = Math.min(height, dy + resized.info.height) - top;
  if (rw < 1 || rh < 1) throw new PlanterError("The generated installation falls outside this photo.", 422);
  const crop = await sharp(resized.data).extract({ left: left - dx, top: top - dy, width: rw, height: rh }).png().toBuffer();
  const placed = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: crop, left, top }]).raw().toBuffer();
  let outside = 0, solid = 0;
  for (let p = 0; p < region.length; p++) {
    if (placed[p * 4 + 3] > 180) { solid++; if (region[p] < 12) outside++; }
    // Protect logos and remote scene regions even from faint generated alpha artefacts.
    if (region[p] < 4) placed[p * 4 + 3] = 0;
  }
  if (solid && outside / solid > .015) throw new PlanterError("The generated installation moved outside the selected area. Adjust the layout before rendering again.", 422);
  let installation = await sharp(placed, { raw: { width, height, channels: 4 } }).png().toBuffer();
  // A small, physically local ambient-occlusion shadow is reliable even when the
  // generated cast shadow is very faint. Derive each base from the NEW silhouette.
  const installedAlpha = Buffer.alloc(width * height);
  for (let p = 0; p < installedAlpha.length; p++) installedAlpha[p] = placed[p * 4 + 3];
  const body = bounds(installedAlpha, width, height);
  const cropped = await sharp(installation).extract({ left: body.left, top: body.top, width: body.width, height: body.height }).png().toBuffer();
  const contacts = await findGroundContacts(cropped);
  const shadows = contacts.map(p => `<ellipse cx="${body.left + p.x * body.width}" cy="${body.top + p.y * body.height + 1}" rx="${p.width * body.width * .48}" ry="${Math.max(1, body.height * .006)}" fill="black" opacity="${contactStrength * .3}"/>`).join("");
  const contactLayer = Buffer.from(`<svg width="${width}" height="${height}"><defs><filter id="soft"><feGaussianBlur stdDeviation="${Math.max(.7, width / 1000)}"/></filter></defs><g filter="url(#soft)">${shadows}</g></svg>`);
  installation = await sharp(contactLayer).composite([{ input: installation }]).png().toBuffer();
  // Match the source camera's sampling, rather than pasting a razor-sharp studio asset.
  if (sourceWidth < width) {
    const smaller = await sharp(installation).resize(sourceWidth, Math.round(height * sourceWidth / width)).png().toBuffer();
    installation = await sharp(smaller).resize(width, height).png().toBuffer();
  }
  const finalPixels = await sharp(installation).ensureAlpha().raw().toBuffer();
  for (let p = 0; p < region.length; p++) if (region[p] < 4) finalPixels[p * 4 + 3] = 0;
  installation = await sharp(finalPixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const enhanced = await sharp(original).composite([{ input: installation }]).png().toBuffer();
  return { enhanced, installation, alignment: { dx, dy, error: Number((outside / Math.max(solid, 1)).toFixed(5)) } };
}
