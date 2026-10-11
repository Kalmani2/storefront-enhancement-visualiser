import sharp from "sharp";
import type { ContactPoint } from "./types";
import { PlanterError } from "./validation";
import { findGroundContacts } from "../composition/contacts";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function normaliseSource(bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) throw new PlanterError("Choose an image smaller than 20 MB.");
  try {
    const metadata = await sharp(bytes, { limitInputPixels: 50_000_000 }).metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) throw new PlanterError("Use a JPEG, PNG or WebP image.");
    const { data, info } = await sharp(bytes, { limitInputPixels: 50_000_000 }).rotate().resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
    if (info.width < 100 || info.height < 100) throw new PlanterError("Choose an image at least 100 pixels wide and tall.");
    return { data, width: info.width, height: info.height, originalWidth: metadata.width!, originalHeight: metadata.height!, extension: metadata.format === "jpeg" ? "jpg" : metadata.format };
  } catch (error) {
    if (error instanceof PlanterError) throw error;
    throw new PlanterError("This image could not be read. Use a valid JPEG, PNG or WebP.");
  }
}

export async function prepareCutout(bytes: Buffer) {
  const metadata = await sharp(bytes, { limitInputPixels: 16_000_000 }).metadata();
  if (metadata.format !== "png" || !metadata.hasAlpha) throw new PlanterError("The result has no transparency. Try extraction again with a clearer target.", 422);
  const { data, info } = await sharp(bytes, { limitInputPixels: 16_000_000 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1, transparent = 0, solid = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const a = data[(y * info.width + x) * 4 + 3];
    if (a < 16) transparent++;
    if (a > 200) solid++;
    if (a > 12) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
  }
  const count = info.width * info.height;
  if (right < 0 || solid / count < 0.002) throw new PlanterError("The result is almost empty. Try a more specific selection.", 422);
  if (transparent / count < 0.01) throw new PlanterError("The result has an opaque background. Retry extraction; this output cannot be approved as a cutout.", 422);
  const warnings: string[] = [];
  if (left < 3 || top < 3 || right >= info.width - 3 || bottom >= info.height - 3) warnings.push("The subject reaches an image edge. Check for clipped leaves or an incomplete base.");
  const crop = { left: Math.max(0, left - 24), top: Math.max(0, top - 24), width: 0, height: 0 };
  crop.width = Math.min(info.width, right + 25) - crop.left;
  crop.height = Math.min(info.height, bottom + 25) - crop.top;
  let contactX = 0, contacts = 0;
  for (let y = Math.max(top, bottom - 4); y <= bottom; y++) for (let x = left; x <= right; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 128) { contactX += x; contacts++; }
  }
  const contactPoint: ContactPoint = { x: ((contacts ? contactX / contacts : (left + right) / 2) - crop.left) / crop.width, y: (bottom - crop.top) / crop.height };
  const png = await sharp(bytes).extract(crop).png().toBuffer();
  const { data: rgba, info: cropped } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = Buffer.alloc(cropped.width * cropped.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  const mask = await sharp(alpha, { raw: { width: cropped.width, height: cropped.height, channels: 1 } }).png().toBuffer();
  const groundContacts = await findGroundContacts(png);
  return { png, mask, width: crop.width, height: crop.height, contactPoint, groundContacts, transparency: Number((transparent / count).toFixed(4)), warnings };
}
