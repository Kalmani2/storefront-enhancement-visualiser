// Retrieve only the approved frames, then save through the app's normal workflow.
// Explicit consent is required because retrieval can incur Google charges.
import { mkdir, writeFile } from "node:fs/promises";
if (!process.argv.includes("--confirm-paid-and-rights")) throw new Error("Pass --confirm-paid-and-rights after confirming image reuse rights.");
const base = process.env.DEMO_URL || "http://localhost:3195";
const runId = process.argv.find(a => /^[0-9a-f-]{36}$/.test(a));
if (!runId) throw new Error("Supply the completed discovery run ID.");
async function request(path, options) {
  const response = await fetch(base + path, options);
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response;
}
const run = await (await request(`/api/frontage-discovery/${runId}`)).json();
const { venues } = await (await request("/api/frontage-discovery")).json();
await mkdir("output/submission-examples", { recursive: true });
const examples = [];
for (const id of run.approvedIds) {
  const item = venues.find(v => v.venue.placeId === id);
  if (!item) throw new Error(`Approval missing: ${id}`);
  const preview = await request(`/api/approved-venues/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed: true }) });
  const image = await preview.blob();
  await writeFile(`output/submission-examples/${id}.jpg`, Buffer.from(await image.arrayBuffer()));
  const form = new FormData();
  form.set("image", image, "approved-frontage.jpg");
  form.set("assessmentId", item.review.id);
  form.set("title", item.venue.name);
  form.set("rightsConfirmed", "true");
  const project = await (await request(`/api/approved-venues/${id}`, { method: "POST", body: form })).json();
  if (project.frontageReview?.assessmentId !== item.review.id) throw new Error("Existing project uses a different source; it was preserved. Inspect it in the studio.");
  examples.push({ projectId: project.id, venue: item.venue, review: item.review });
  console.log(JSON.stringify({ project: project.id, venue: project.title, source: item.review.frame.source }));
}
await writeFile("output/submission-examples/discovery.json", JSON.stringify({ run, examples }, null, 2));
