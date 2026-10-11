// Runs the actual bounded discovery pipeline; never curates or forces approvals.
// node scripts/discovery-demo.mjs --confirm-paid [area] [base-url]
import { randomUUID } from "node:crypto";
if (process.argv[2] !== "--confirm-paid") throw new Error("Pass --confirm-paid to authorize the normal maximum 20 image/vision requests for one batch.");
const area = process.argv[3] || "Soho", base = process.argv[4] || "http://localhost:3195";
async function call(path, body) {
  const response = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(135000) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`); return result;
}
const id = randomUUID();
let run = await call("/api/frontage-discovery", { id, location: area, category: "all", confirmed: true });
if (run.id !== id) throw new Error("An existing shared run is active. It was not resumed or cancelled.");
console.log(JSON.stringify({ started: run.id, area }));
for (let step = 0; step < 80 && run.status === "running"; step++) {
  run = await call(`/api/frontage-discovery/${run.id}`, { confirmed: true });
  console.log(JSON.stringify({ step, status: run.status, images: run.images, reviews: run.reviews, approved: run.approvedIds.length, message: run.message, latest: run.attempts.at(-1) }));
}
console.log(JSON.stringify({ final: run.id, status: run.status, approvedIds: run.approvedIds, images: run.images, reviews: run.reviews }));
if (run.status === "error") process.exitCode = 1;
