import sharp from "sharp";
import { clamp } from "./geometry";

// Scene editing lets the model solve perspective, reflections and ground contact
// together. Only the placement neighbourhood is taken from that generated scene.
export async function composeScene(original: Buffer, generated: Buffer, region: Buffer, width: number, height: number) {
  if (region.length !== width * height) throw new Error("Invalid scene edit region.");
  const reference = await sharp(original).removeAlpha().greyscale().raw().toBuffer();
  const grey = await sharp(generated).resize(width, height).removeAlpha().greyscale().raw().toBuffer();
  const before = await sharp(original).ensureAlpha().raw().toBuffer();
  const after = await sharp(generated).resize(width, height).ensureAlpha().raw().toBuffer();
  const score = (ox: number, oy: number) => {
    let cost = 0, count = 0;
    for (let y = 12; y < height * .94; y += 8) for (let x = 12; x < width - 12; x += 8) {
      const p = y * width + x;
      if (region[p] > 0 || Math.abs(reference[p + 1] - reference[p - 1]) + Math.abs(reference[p + width] - reference[p - width]) < 15) continue;
      cost += Math.min(80, Math.abs(reference[p] - grey[(y + oy) * width + x + ox])); count++;
    }
    return count > 20 ? cost / count + (Math.abs(ox) + Math.abs(oy)) * .08 : Math.abs(ox) + Math.abs(oy);
  };
  let dx = 0, dy = 0, error = score(0, 0);
  for (let oy = -8; oy <= 8; oy += 2) for (let ox = -8; ox <= 8; ox += 2) {
    const candidate = score(ox, oy);
    if (candidate < error) { error = candidate; dx = ox; dy = oy; }
  }
  const coarseX = dx, coarseY = dy;
  for (let oy = coarseY - 1; oy <= coarseY + 1; oy++) for (let ox = coarseX - 1; ox <= coarseX + 1; ox++) {
    const candidate = score(ox, oy);
    if (candidate < error) { error = candidate; dx = ox; dy = oy; }
  }
  const footerTop = height - Math.ceil(height * .045);
  for (let y = 0; y < footerTop; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x, weight = region[p] / 255;
    if (!weight) continue;
    const xx = x + dx, yy = y + dy;
    if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
    const q = (yy * width + xx) * 4;
    for (let c = 0; c < 3; c++) before[p * 4 + c] = clamp(Math.round(before[p * 4 + c] * (1 - weight) + after[q + c] * weight), 0, 255);
  }
  return { enhanced: await sharp(before, { raw: { width, height, channels: 4 } }).png().toBuffer(), alignment: { dx, dy, error: Number(error.toFixed(2)) } };
}

export async function sceneEditMask(region: Buffer, width: number, height: number) {
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let p = 0; p < region.length; p++) rgba[p * 4 + 3] = 255 - region[p];
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}
