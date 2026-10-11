// Application integration run, not an alternative image-generation pipeline.
// Exactly one render per example; never automatically retries a paid failure.
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
if (!process.argv.includes("--confirm-paid")) throw new Error("Pass --confirm-paid to render the three prepared examples.");
const base = process.env.DEMO_URL || "http://localhost:3195";
const { examples } = JSON.parse(await readFile("output/submission-examples/discovery.json", "utf8"));
// Operator-reviewed layouts for these exact discovered storefronts, not generic
// automatic placement. New venues need their own layout in the studio.
const layouts = {
  ChIJMzsTHtMEdkgRncIh8An44WM: { product: "planter_image1.jpg", x: .20, y: .76, height: .44 },
  ChIJPcrSINMEdkgR4zCRoOaXzuA: { product: "planter_image2.jpg", x: .45, y: .92, height: .40 },
  ChIJsVA9Dg0bdkgRUI0y1Fj9BNI: { product: "planter_image3.jpg", x: .51, y: .72, height: .38 },
};
async function json(path, body) {
  const response = await fetch(base + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response.json();
}
const { assets } = await json("/api/planters");
for (const example of examples) {
  const path = `/api/projects/${example.projectId}/composition`;
  const existing = await json(path);
  if (existing.versions.length || existing.job) {
    console.log(JSON.stringify({ project: example.projectId, skipped: "Already has a render or render job. Inspect manually before retrying." }));
    continue;
  }
  const layout = layouts[example.venue.placeId];
  if (!layout) throw new Error("No reviewed layout for this venue. Place its product in the studio first.");
  const asset = assets.find(a => a.originalFilename === layout.product && a.approvedRevisionId);
  if (!asset) throw new Error(`Missing approved supplied product: ${layout.product}`);
  const calibration = await json(path, { action: "calibrate", assetId: asset.id, revisionId: asset.approvedRevisionId });
  console.log(JSON.stringify({ project: example.projectId, calibration }));
  const placements = [{ id: randomUUID(), assetId: asset.id, revisionId: asset.approvedRevisionId, x: layout.x, y: layout.y, height: layout.height, perspective: false, shadow: .45 }];
  const result = await json(path, { action: "enhance", placements });
  await writeFile(`output/submission-examples/${example.venue.placeId}-job.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ project: example.projectId, job: result.job, error: result.error }));
}
