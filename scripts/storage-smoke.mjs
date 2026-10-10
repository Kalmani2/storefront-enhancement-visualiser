// Live Supabase round-trip test. Temporary fixtures only; no paid provider calls.
// Start the app, then: node scripts/storage-smoke.mjs --write-test
// STORAGE_TEST_URL defaults to http://localhost:3200 (use a VERCEL=1 production server).
import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

if (!process.argv.includes("--write-test")) throw new Error("Pass --write-test to create and clean up temporary cloud fixtures.");
process.loadEnvFile(".env.local");
const base = process.env.STORAGE_TEST_URL || "http://localhost:3200";
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "storefront-assets";
const nonce = randomUUID();
const projectId = `storage-test-${nonce}`;
const projectTitle = `Storage smoke test ${nonce}`;
const planterFilename = `storage-smoke-${nonce}.png`;
const temporaryUploads = new Set();
let planterId;
let browser;
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const report = {};

async function request(path, init) {
  const response = await fetch(base + path, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Test request failed (${response.status}).`);
  return data;
}

async function removeFolder(prefix) {
  const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error("Could not inspect temporary fixture files for cleanup.");
  if (data.length) {
    const { error } = await client.storage.from(bucket).remove(data.map(file => `${prefix}/${file.name}`));
    if (error) throw new Error("Temporary fixture file cleanup failed.");
  }
}

try {
  const library = await request("/api/planters");
  if (library.storage !== "supabase" || library.assets.length < 3) throw new Error("The imported Supabase library is not available.");
  const reference = library.assets.find(asset => asset.approvedRevisionId);
  const original = await readFile(`output/planters/${reference.id}/${reference.originalFile}`);
  const download = await fetch(`${base}/api/planters/${reference.id}/files/${reference.originalFile}`);
  if (!download.ok || digest(original) !== digest(Buffer.from(await download.arrayBuffer()))) throw new Error("Imported original download did not match local bytes.");
  report.importedLibrary = library.assets.length;
  report.importedOriginalMatches = true;
  await request("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project: { id: projectId, title: projectTitle, venueId: "test-only", source: "openstreetmap", sourceUrl: "https://www.openstreetmap.org", createdAt: new Date().toISOString(), address: "Temporary test record", category: "test" } }) });

  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  const browserErrors = [], forbidden = [];
  page.on("pageerror", error => browserErrors.push(error.message));
  page.on("response", async response => {
    if (new URL(response.url()).pathname === "/api/uploads" && response.ok()) {
      const data = await response.json(); temporaryUploads.add(data.upload.path);
    }
    if (new URL(response.url()).pathname === "/api/planters" && response.request().method() === "POST" && response.ok()) planterId = (await response.json()).id;
  });
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (/^\/api\/(google|discovery|frontage|images)(\/|$)/.test(url.pathname) || (!url.hostname.endsWith(".supabase.co") && url.origin !== new URL(base).origin)) {
      forbidden.push(url.pathname); return route.abort();
    }
    return route.continue();
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: projectTitle, exact: true })).toBeVisible();
  // This pre-existing 5 MB source exceeds Vercel's usual request body ceiling.
  const largeSource = await readFile("output/planters/558ad547-c73c-4663-96f0-3835375abcef/source.png");
  await expect(page.getByLabel("Upload planter image")).toBeAttached();
  await expect(page.getByRole("button", { name: /Add a planter image/ })).toBeEnabled();
  const uploadResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/planters" && response.request().method() === "POST");
  await page.getByLabel("Upload planter image").setInputFiles({ name: planterFilename, mimeType: "image/png", buffer: largeSource });
  const createdResponse = await uploadResponse;
  const created = await createdResponse.json();
  if (!createdResponse.ok()) throw new Error(created.error || "Live planter upload failed.");
  planterId = created.id;
  await expect(page).toHaveURL(new RegExp(`/planters/${planterId}$`));
  const { data: planterRow, error: planterError } = await client.from("planters").select("data").eq("id", planterId).single();
  if (planterError || planterRow.data.originalFilename !== planterFilename) throw new Error("Uploaded planter metadata is missing.");
  const originalResponse = await fetch(`${base}/api/planters/${planterId}/files/original.png`);
  if (!originalResponse.ok || digest(largeSource) !== digest(Buffer.from(await originalResponse.arrayBuffer()))) throw new Error("Uploaded planter original changed.");
  report.largeDirectUploadBytes = largeSource.length;

  await page.goto(`/studio?id=${projectId}`);
  await expect(page.getByRole("heading", { name: projectTitle })).toBeVisible();
  const frontage = await sharp({ create: { width: 180, height: 120, channels: 3, background: "#62806b" } }).png().toBuffer();
  const frontageResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/projects/${projectId}/image` && response.request().method() === "POST");
  await page.getByLabel("Upload frontage photo").setInputFiles({ name: "owned-frontage-test.png", mimeType: "image/png", buffer: frontage });
  const storedResponse = await frontageResponse;
  if (!storedResponse.ok()) throw new Error((await storedResponse.json()).error || "Live frontage upload failed.");
  const stored = await storedResponse.json();
  if (stored.image.provider !== "uploaded") throw new Error("Frontage metadata was not saved.");
  const imageResponse = await fetch(`${base}/api/projects/${projectId}/image`);
  if (!imageResponse.ok || digest(frontage) !== digest(Buffer.from(await imageResponse.arrayBuffer()))) throw new Error("Frontage bytes did not round-trip.");
  const configurationResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/projects" && response.request().method() === "POST");
  await page.getByLabel("Quantity").selectOption("3");
  if (!(await configurationResponse).ok()) throw new Error("Configuration save failed.");
  await page.reload();
  await expect(page.getByLabel("Quantity")).toHaveValue("3");
  report.frontageAndConfigurationPersisted = true;

  const second = await browser.newContext();
  const otherPage = await second.newPage();
  await otherPage.goto(`${base}/studio?id=${projectId}`);
  await expect(otherPage.getByLabel("Quantity")).toHaveValue("3");
  report.newBrowserReadsSharedProject = true;
  await second.close();

  await page.goto(`/planters/${reference.id}`);
  await page.getByRole("button", { name: "Refine edges", exact: true }).click();
  const canvas = page.getByLabel("Planter cutout edge editing canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate(element => element.width)).toBeGreaterThan(300);
  await canvas.evaluate(element => element.getContext("2d").getImageData(0, 0, 1, 1).data[0]);
  report.signedImageCanvasIsEditable = true;
  if (browserErrors.length || forbidden.length) throw new Error(`Browser errors or unexpected provider requests: ${JSON.stringify({ browserErrors, forbidden })}`);
  report.paidProviderCalls = 0;
  const publicClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { error: publicError } = await publicClient.from("planters").select("id");
  if (!publicError) throw new Error("The publishable key unexpectedly has direct table access.");
  report.browserKeyCannotReadTables = true;
  console.log(JSON.stringify(report));
} finally {
  if (browser) await browser.close();
  // Delete only the exact temporary records/files made by this run.
  if (planterId) {
    const { data } = await client.from("planters").select("data").eq("id", planterId).maybeSingle();
    if (data && data.data.originalFilename !== planterFilename) throw new Error("Refusing to clean up an unrelated planter.");
    await removeFolder(`planters/${planterId}`);
    const { error } = await client.from("planters").delete().eq("id", planterId);
    if (error) throw new Error("Temporary planter cleanup failed.");
  }
  await removeFolder(`storefronts/${projectId}`);
  const { error } = await client.from("projects").delete().eq("id", projectId).eq("title", projectTitle);
  if (error) throw new Error("Temporary project cleanup failed.");
  if (temporaryUploads.size) {
    const { error } = await client.storage.from(bucket).remove([...temporaryUploads]);
    if (error) throw new Error("Temporary upload cleanup failed.");
  }
  console.log("Temporary test fixtures removed; imported planters unchanged.");
}
