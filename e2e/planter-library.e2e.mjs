import { test, expect } from "@playwright/test";
import sharp from "sharp";

test("upload, select, generate, brush-edit, approve and download an asset", async ({ page }) => {
  await page.route("**/api/projects", route => route.fulfill({ json: [] }));
  const id = "11111111-1111-4111-8111-111111111111";
  const source = await sharp({ create: { width: 160, height: 240, channels: 3, background: "#c1c5b2" } }).png().toBuffer();
  const png = await sharp({ create: { width: 160, height: 240, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: Buffer.from('<svg width="160" height="240"><rect x="45" y="110" width="70" height="100" fill="#9b856a"/><circle cx="80" cy="75" r="45" fill="#5c875b"/></svg>') }]).png().toBuffer();
  const settings = { target: "", mode: "reconstruct", quality: "medium" };
  const revision = { id: "22222222-2222-4222-8222-222222222222", createdAt: new Date().toISOString(), kind: "ai", settings, model: "mock-image-model", prompt: "test", width: 160, height: 240, contactPoint: { x: .5, y: .9 }, transparency: .6, warnings: [] };
  let asset = { id, name: "Garden pair", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: { width: 160, height: 240 }, originalFilename: "garden.png", originalFile: "original.png", status: "uploaded", revisions: [] };
  let generated = false;
  let extractRequests = 0;
  let refined = false;
  let selectedBox;
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/planters**", async route => {
    const request = route.request(), url = new URL(request.url()), pathname = url.pathname;
    if (pathname.includes("/files/")) return route.fulfill({ contentType: "image/png", body: pathname.endsWith("source.png") ? source : png });
    if (pathname.endsWith("/extract")) {
      extractRequests++;
      const body = request.postDataJSON(); selectedBox = body.selection;
      expect(body.quality).toBe("medium");
      asset = { ...asset, status: "processing", updatedAt: new Date().toISOString(), lastSettings: body };
      generated = true;
      return route.fulfill({ status: 202, json: asset });
    }
    if (pathname.endsWith("/refine")) {
      refined = true;
      asset = { ...asset, status: "review", updatedAt: new Date().toISOString(), revisions: [...asset.revisions, { ...revision, id: "33333333-3333-4333-8333-333333333333", parentId: revision.id, kind: "manual" }] };
      return route.fulfill({ json: asset });
    }
    if (request.method() === "PATCH") {
      const body = request.postDataJSON();
      asset = { ...asset, ...body, status: body.approvedRevisionId ? "approved" : asset.status, updatedAt: new Date().toISOString() };
      return route.fulfill({ json: asset });
    }
    if (pathname === "/api/planters") return route.fulfill({ status: request.method() === "POST" ? 201 : 200, json: request.method() === "POST" ? asset : { assets: [], configured: true, model: "mock-image-model", outputDirectory: "output/planters" } });
    if (generated && asset.status === "processing") asset = { ...asset, status: "review", updatedAt: new Date().toISOString(), revisions: [revision] };
    return route.fulfill({ json: asset });
  });

  await page.goto("/");
  await expect(page.getByRole("navigation").getByRole("link")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Add a planter image/ })).toBeEnabled();
  await page.getByLabel("Upload planter image").setInputFiles({ name: "garden.png", mimeType: "image/png", buffer: source });
  await expect(page).toHaveURL(new RegExp(`/planters/${id}`));
  await expect(page.getByRole("heading", { name: "Garden pair" })).toBeVisible();
  await expect(page.getByRole("option", { name: "High", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Select target area" }).click();
  const box = await page.getByAltText("Original planter photo").boundingBox();
  await page.mouse.move(box.x + box.width * .1, box.y + box.height * .1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .9, box.y + box.height * .95, { steps: 8 });
  await page.mouse.up();
  await page.getByLabel("Which arrangement should we extract?").fill("The foreground planter and all its plants");
  await page.getByRole("button", { name: "Extract planter asset · paid" }).click();
  await expect(page.getByRole("button", { name: "Approve this asset" })).toBeVisible({ timeout: 15000 });
  expect(extractRequests).toBe(1);
  expect(selectedBox.width).toBeCloseTo(.8, 1);
  await page.getByRole("button", { name: "dark preview background" }).click();
  await page.getByRole("button", { name: "Refine edges" }).click();
  const canvas = page.getByLabel("Planter cutout edge editing canvas");
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + bounds.width * .02, bounds.y + bounds.height * .02);
  await page.getByRole("button", { name: "Save new version" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(refined).toBe(true);
  await expect(page.getByRole("button", { name: "Review version 2" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Approve this asset" }).click();
  await expect(page.getByText("Approved asset saved")).toBeVisible();
  await expect(page.getByRole("link", { name: "PNG", exact: true })).toHaveAttribute("href", /download=1/);
  await page.reload();
  await expect(page.getByText("Approved asset saved")).toBeVisible();
  expect(asset.approvedRevisionId).toBe("33333333-3333-4333-8333-333333333333");
  expect(errors).toEqual([]);
  await page.screenshot({ path: ".cache/planter-review-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Garden pair" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
