// Restore the previously reviewed DUCKSOUP example. No image/vision API calls.
// Run with: node --env-file=.env.local scripts/restore-submission-example.mjs
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
const base = process.env.DEMO_URL || "http://localhost:3197";
const placeId = "ChIJMzsTHtMEdkgRncIh8An44WM", projectId = `google-${placeId}`;
async function request(path, options) {
  const response = await fetch(base + path, options);
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response.json();
}
const projects = await request("/api/projects");
if (projects.some(project => project.id === projectId)) throw new Error("Project already exists. Refusing to overwrite it.");
const snapshot = JSON.parse(await readFile("output/submission-examples/discovery.json", "utf8"));
const example = snapshot.examples.find(e => e.venue.placeId === placeId);
const saved = JSON.parse(await readFile(`output/submission-examples/${placeId}-result.json`, "utf8"));
const old = saved.versions.find(v => v.enhancedFile && v.review?.status === "passed");
if (!old || !example) throw new Error("Missing reviewed backup.");
const form = new FormData();
form.set("image", new Blob([await readFile(`output/submission-examples/${placeId}.jpg`)], { type: "image/jpeg" }), "original.jpg");
form.set("assessmentId", example.review.id); form.set("title", example.venue.name); form.set("rightsConfirmed", "true");
const project = await request(`/api/approved-venues/${placeId}`, { method: "POST", body: form });
if (project.frontageReview?.assessmentId !== example.review.id) throw new Error("The project source changed. Stopping.");
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const bucket = client.storage.from(process.env.SUPABASE_STORAGE_BUCKET || "storefront-assets");
async function put(file, bytes) {
  const { error } = await bucket.upload(`compositions/${projectId}/${file}`, bytes, { upsert: true, contentType: file.endsWith("json") ? "application/json" : "image/png" });
  if (error) throw error;
}
const initial = { sourceKey: project.image.storagePath, draft: old.placements, calibrations: saved.calibrations, versions: [] };
await put("state.json", Buffer.from(JSON.stringify(initial)));
// Recreate only the free basic layout and masks against the restored source.
const state = await request(`/api/projects/${projectId}/composition`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", placements: old.placements }) });
const basic = state.versions[0];
const restored = { ...old, basicFile: basic.basicFile, sourceFile: basic.sourceFile, maskFile: basic.maskFile, foregroundFile: basic.foregroundFile, fingerprint: basic.fingerprint };
delete restored.rawFile;
await put(old.enhancedFile, await readFile(`output/submission-examples/${placeId}-after.png`));
await put("state.json", Buffer.from(JSON.stringify({ ...state, versions: [restored], resultVersionId: restored.id })));
console.log(JSON.stringify({ restored: project.title, version: restored.id, paidCalls: 0 }));
