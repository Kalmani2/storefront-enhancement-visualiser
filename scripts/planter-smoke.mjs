// Exercises the local app's public API; the API key stays in the Next server.
// Upload only: node scripts/planter-smoke.mjs
// Paid extraction: node scripts/planter-smoke.mjs --generate
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const base = process.env.PLANTER_TEST_URL || "http://localhost:3100";
const generate = process.argv.includes("--generate");
const samples = [
  { file: "planter_image1.jpg", name: "Corten pair · foreground", target: "The two touching rust-coloured rectangular containers in the foreground: the tall palm planter and the shorter flower planter at its front right. Keep both containers with all their own plants together. Exclude the long trough in the background.", mode: "extract" },
  { file: "planter_image2.jpg", name: "White pair · completed", target: "The two white tall rectangular planters with their flowers, shrubs and trailing foliage on the right side of the photo. Keep this pair together. Remove every person and reconstruct any planter or plant parts they obscure.", mode: "reconstruct" },
  { file: "planter_image3.jpg", name: "Dark cylinder · completed base", target: "The large dark cylindrical planter in the foreground with all plants growing in it, including the green variegated leaves and the red-leaf tree behind them if it belongs to this same planter. Exclude separate background planters. The base is cropped: complete it as a natural closed cylindrical base.", mode: "reconstruct" },
];

async function request(route, init) {
  const response = await fetch(`${base}${route}`, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

const report = [];
const existing = (await request("/api/planters")).assets;
for (const sample of samples) {
  let asset = existing.find(item => item.name === sample.name && item.originalFilename === sample.file);
  if (!asset) {
    const form = new FormData();
    form.set("image", new Blob([await readFile(path.join("Documents", "Planters Images", sample.file))], { type: "image/jpeg" }), sample.file);
    form.set("name", sample.name);
    asset = await request("/api/planters", { method: "POST", body: form });
  }
  const settings = { target: sample.target, mode: sample.mode, quality: "medium" };
  asset = await request(`/api/planters/${asset.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lastSettings: settings }) });
  console.log(JSON.stringify({ uploaded: sample.file, id: asset.id, review: `${base}/planters/${asset.id}` }));
  if (generate && (!asset.revisions.length || process.argv.includes("--retry"))) {
    await request(`/api/planters/${asset.id}/extract`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
    let current;
    const deadline = Date.now() + 9 * 60_000;
    do {
      await new Promise(resolve => setTimeout(resolve, 3000));
      current = await request(`/api/planters/${asset.id}`);
    } while (current.status === "processing" && Date.now() < deadline);
    report.push({ file: sample.file, id: asset.id, status: current.status, error: current.error, revision: current.revisions.at(-1) });
    console.log(JSON.stringify({ completed: sample.file, id: asset.id, status: current.status, error: current.error, size: current.revisions.at(-1) && [current.revisions.at(-1).width, current.revisions.at(-1).height] }));
    if (/credits|billing|quota|API key/i.test(current.error || "")) {
      await writeFile("output/planter-smoke-report.json", JSON.stringify(report, null, 2));
      throw new Error("Stopped the paid test run because the provider requires account configuration. No automatic retry was made.");
    }
  } else report.push({ file: sample.file, id: asset.id, status: asset.status });
  await mkdir("output", { recursive: true });
  await writeFile("output/planter-smoke-report.json", JSON.stringify(report, null, 2));
}
if (generate && report.some(item => item.status === "error" || item.status === "processing")) process.exitCode = 1;
