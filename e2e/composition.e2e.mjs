import { test, expect } from "@playwright/test";
import sharp from "sharp";

test("Studio image selection, numeric scale, automatic shadows and AI image download", async ({ page }) => {
  const assetId = "11111111-1111-4111-8111-111111111111", revisionId = "22222222-2222-4222-8222-222222222222";
  const project = { id: "google-composer-test", title: "Frith Street proposal", source: "google", venueId: "place1234", sourceUrl: "https://maps.google.com", createdAt: new Date().toISOString(), image: { provider: "google-street-view", panoId: "camera", headingOffset: 0, fov: 65, storagePath: "storefronts/google-composer-test/source.png" } };
  const frontage = await sharp(Buffer.from('<svg width="960" height="640"><rect width="960" height="640" fill="#ddd1b7"/><rect y="500" width="960" height="140" fill="#999c91"/><rect x="100" y="90" width="760" height="85" fill="#284d3b"/><text x="480" y="145" text-anchor="middle" fill="white" font-size="38">FRITH STREET CAFE</text><rect x="220" y="210" width="260" height="250" fill="#466565"/><rect x="560" y="200" width="140" height="300" fill="#315347"/><rect x="577" y="220" width="106" height="180" fill="#8ca6a2"/></svg>')).png().toBuffer();
  const planter = await sharp(Buffer.from('<svg width="120" height="240"><path d="M35 165 L85 165 L80 235 L40 235Z" fill="#625647"/><ellipse cx="60" cy="105" rx="40" ry="65" fill="#365a2f"/></svg>')).png().toBuffer();
  const asset = { id: assetId, name: "Olive planter", status: "approved", approvedRevisionId: revisionId, revisions: [{ id: revisionId, width: 120, height: 240, contactPoint: { x: .5, y: .98 } }] };
  let state = { sourceKey: project.image.storagePath, draft: [], calibrations: {}, versions: [], configured: true };
  let calibrationCalls = 0, enhancementCalls = 0, sourceCalls = 0;
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/projects", route => route.fulfill({ json: [project] }));
  await page.route("**/api/projects/*/source", route => { sourceCalls++; return route.fulfill({ json: project }); });
  await page.route("**/api/projects/*/image", route => route.fulfill({ contentType: "image/png", body: frontage }));
  await page.route("**/api/planters", route => route.fulfill({ json: { assets: [asset], configured: true } }));
  await page.route("**/api/planters/*/files/*", route => route.fulfill({ contentType: "image/png", body: planter }));
  await page.route("**/api/projects/*/composition/files/*", route => route.fulfill({ contentType: "image/png", body: frontage }));
  await page.route("**/api/projects/*/composition", route => {
    if (route.request().method() === "GET") {
      if (state.job) { state.versions.at(-1).enhancedFile = "enhanced.png"; state.versions.at(-1).review = { status: "review", summary: "Check product identity and ground contact.", issues: [], product: 3, grounding: 4, scene: 5 }; delete state.job; }
      return route.fulfill({ json: state });
    }
    const body = route.request().postDataJSON();
    if (body.action === "approve") { state.versions.at(-1).review.status = "passed"; return route.fulfill({ json: state }); }
    if (body.action === "calibrate") {
      calibrationCalls++;
      const estimate = { assetId, revisionId, analysisVersion: 2, method: "vision", confidence: "medium", reason: "Scaled using a typical 2.1 m doorway.", reference: { top: { x: .6, y: .3 }, bottom: { x: .6, y: .78 }, heightMetres: 2.1 }, containerHeightMetres: .6, containerFraction: .4, height: .34, ground: { x: .4, y: .8 }, horizon: .4 };
      state.calibrations[`${assetId}:${revisionId}`] = estimate;
      return route.fulfill({ json: estimate });
    }
    state.draft = body.placements;
    if (body.action !== "draft") state.versions.push({ id: `version-${state.versions.length}`, createdAt: new Date().toISOString(), placements: body.placements, basicFile: `basic-${state.versions.length}.png`, width: 960, height: 640 });
    if (body.action === "enhance") { enhancementCalls++; state.job = { id: "job1", versionId: state.versions.at(-1).id, startedAt: new Date().toISOString() }; }
    return route.fulfill({ json: state });
  });
  await page.goto(`/studio?id=${project.id}`);
  await expect(page.getByRole("heading", { name: project.title })).toBeVisible();
  await expect(page.getByRole("button", { name: "Place Olive planter" })).toBeEnabled();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Place Olive planter" }).click();
  await expect(page.getByText("Approximate scale", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add planter", exact: true })).toHaveAttribute("href", "/#planter-library-title");
  await expect(page.getByLabel("Selected planter", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Shadow strength")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save basic output" })).toHaveCount(0);
  const scale = page.getByRole("region", { name: "Approximate scale" });
  await expect(scale).toContainText("0.60");
  await expect(scale).toContainText("2.10");
  await expect(scale).toContainText("Its height is assumed, not measured");
  await expect(scale).toContainText("29% of that object's height");
  await page.getByLabel("Planter size").fill("0.17");
  await expect(scale).toContainText("0.30");
  await page.getByRole("button", { name: "Auto size" }).click();
  const canvas = page.getByLabel("Storefront planter placement");
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate(element => element.width)).toBe(1280);
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * .4, box.y + box.height * .65);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * .3, box.y + box.height * .7, { steps: 8 }); await page.mouse.up();
  await expect.poll(() => state.draft.length).toBe(1);
  await expect.poll(() => state.draft[0].x).toBeLessThan(.35);
  await page.getByLabel("Planter facing").selectOption("custom");
  await page.getByLabel("Planter angle").fill("25");
  await page.getByRole("button", { name: "Flip arrangement" }).click();
  await expect.poll(() => state.draft[0]?.yaw).toBe(25);
  await expect.poll(() => state.draft[0]?.flip).toBe(true);
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  const placed = page.getByRole("group", { name: "Placed planters", exact: true });
  await expect(placed.getByRole("button")).toHaveCount(2);
  await expect(placed.getByRole("button").nth(1)).toHaveAttribute("aria-pressed", "true");
  await placed.getByRole("button").first().click();
  await expect(placed.getByRole("button").first()).toHaveAttribute("aria-pressed", "true");
  // Clicking empty pavement deselects; clicking the planter itself selects it.
  await canvas.click({ position: { x: box.width * .9, y: box.height * .1 } });
  await expect(placed.getByRole("button").first()).toHaveAttribute("aria-pressed", "false");
  await canvas.click({ position: { x: box.width * .3, y: box.height * .7 } });
  await expect(placed.getByRole("button").first()).toHaveAttribute("aria-pressed", "true");
  expect(calibrationCalls).toBe(1); expect(enhancementCalls).toBe(0); expect(sourceCalls).toBe(0);
  await page.screenshot({ path: ".cache/composition-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "AI Enhance", exact: true }).click();
  await expect(page.getByRole("button", { name: "Rendering", exact: false })).toBeDisabled();
  await expect(page.getByAltText("AI enhanced storefront composition")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("link", { name: "Download image", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Approve image" }).click();
  await expect(page.getByRole("link", { name: "Download image", exact: true }).first()).toHaveAttribute("href", /enhanced\.png\?download=1$/);
  await expect(page.getByText("Checks passed", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Check product identity and ground contact.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Download basic", exact: true })).toHaveCount(0);
  await page.screenshot({ path: ".cache/composition-enhanced-desktop.png", fullPage: true });
  expect(enhancementCalls).toBe(1);
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(page.getByAltText("Original storefront for comparison")).toBeVisible();
  await page.getByLabel("Before and after comparison").fill("35");
  await page.reload();
  await expect(placed.getByRole("button")).toHaveCount(2);
  await page.getByRole("button", { name: "Place Olive planter" }).click();
  await expect(placed.getByRole("button")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Place Olive planter" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Duplicate", exact: true })).toBeDisabled();
  await expect(page.getByText("Maximum of 3 planters.", { exact: true })).toBeVisible();
  expect(calibrationCalls).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".cache/composition-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
