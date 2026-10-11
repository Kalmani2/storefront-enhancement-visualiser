import sharp from "sharp";
import type { GroundContact } from "./types";

// Scan the lower silhouette, splitting separate containers at transparent gaps.
// This needs no model and prevents a pair of pots sharing one floating shadow.
export async function findGroundContacts(bytes: Buffer): Promise<GroundContact[]> {
  const { data, info } = await sharp(bytes).ensureAlpha().resize({ width: 512, height: 768, fit: "inside", withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  const bottoms: number[] = [];
  for (let x = 0; x < info.width; x++) {
    bottoms[x] = -1;
    for (let y = info.height - 1; y > info.height * .65; y--) if (data[(y * info.width + x) * 4 + 3] > 180) { bottoms[x] = y; break; }
  }
  const groups: { start: number; end: number }[] = [];
  let start = -1, gap = 0;
  for (let x = 0; x <= info.width; x++) {
    if (x < info.width && bottoms[x] >= 0) { if (start < 0) start = x; gap = 0; }
    else if (start >= 0 && (++gap > 2 || x === info.width)) { groups.push({ start, end: x - gap }); start = -1; gap = 0; }
  }
  return groups.filter(g => g.end - g.start > info.width * .035).map(g => {
    const values = bottoms.slice(g.start, g.end + 1).filter(y => y >= 0).sort((a, b) => a - b);
    return { x: (g.start + g.end) / (2 * info.width), y: values[Math.floor(values.length * .7)] / info.height, width: (g.end - g.start + 1) / info.width };
  }).slice(0, 6);
}

// Measure the visible body, not the foliage, using the lower container's colour/alpha.
// This is an image proportion only; real-world dimensions still need an assumed prior.
export async function measureContainerFraction(bytes: Buffer) {
  const { data, info } = await sharp(bytes).ensureAlpha().resize({ width: 384, height: 512, fit: "inside", withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  const colours: number[][] = [[], [], []], columns: number[] = [];
  for (let x = 0; x < info.width; x++) {
    let opaque = 0, total = 0;
    for (let y = Math.round(info.height * .78); y < info.height * .9; y++) {
      const i = (y * info.width + x) * 4; total++;
      if (data[i + 3] > 220) { opaque++; for (let c = 0; c < 3; c++) colours[c].push(data[i + c]); }
    }
    if (opaque > total * .8) columns.push(x);
  }
  if (columns.length < info.width * .12 || !colours[0].length) return undefined;
  const median = colours.map(values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]);
  const differences: number[] = [];
  for (let y = Math.round(info.height * .78); y < info.height * .9; y += 2) for (const x of columns) {
    const i = (y * info.width + x) * 4;
    differences.push(Math.sqrt(((data[i] - median[0]) ** 2 + (data[i + 1] - median[1]) ** 2 + (data[i + 2] - median[2]) ** 2) / 3));
  }
  differences.sort((a, b) => a - b);
  const tolerance = Math.max(28, Math.min(75, differences[Math.floor(differences.length * .85)] * 1.7));
  let top = Math.round(info.height * .78), failures = 0;
  for (let y = top; y > info.height * .18; y--) {
    let matches = 0;
    for (const x of columns) {
      const i = (y * info.width + x) * 4;
      if (data[i + 3] > 200 && Math.sqrt(((data[i] - median[0]) ** 2 + (data[i + 1] - median[1]) ** 2 + (data[i + 2] - median[2]) ** 2) / 3) < tolerance) matches++;
    }
    if (matches / columns.length < .38) { if (++failures > info.height * .018) break; }
    else { failures = 0; top = y; }
  }
  const contacts = await findGroundContacts(bytes), bottom = Math.max(.9, ...contacts.map(p => p.y));
  const fraction = bottom - top / info.height;
  return fraction > .2 && fraction < .8 ? Number(fraction.toFixed(4)) : undefined;
}
