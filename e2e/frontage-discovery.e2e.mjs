import { test, expect } from "@playwright/test";
import sharp from "sharp";

test("confirmed automatic discovery, saved preview and project hand-off", async ({ page }) => {
  const date = new Date().toISOString();
  const venue = { placeId: "testplace1234", name: "Test Cafe", address: "1 Test Street, Soho, London", latitude: 51.514, longitude: -.136, category: "cafe", mapsUrl: "https://maps.google.com" };
  const accepted = { venue, status: "approved", area: "Soho", savedAt: date, review: { id: "a".repeat(64), venueId: venue.placeId, checkedAt: date, expiresAt: "2099-01-01", rulesVersion: "frontage-v1", model: "gpt-4.1-mini", verdict: "approved", assessment: { reason: "Matching cafe sign, complete doorway and bare pavement." }, frame: { source: "streetview", panoId: "pano", heading: 90, fov: 65, pitch: -5 } } };
  let venues = [], run, steps = 0, imageRequests = 0, created = 0, starts = 0;
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const image = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#bacbb5" } }).png().toBuffer();
  // All API traffic mocked. No Google, vision or live database writes.
  await page.route("**/api/**", route => route.fulfill({ status: 500, json: { error: "Unexpected API request in test" } }));
  await page.route("**/api/projects", route => route.fulfill({ json: [] }));
  await page.route("**/api/planters", route => route.fulfill({ json: { assets: [], configured: true } }));
  await page.route("**/api/frontage-discovery", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { venues, run } });
    starts++;
    expect(route.request().postDataJSON().confirmed).toBe(true);
    run = { id: "11111111-1111-4111-8111-111111111111", status: "running", message: "Searching", approvedIds: [], cursor: 0, images: 0, reviews: 0, reused: 0, attempts: [] };
    return route.fulfill({ json: run });
  });
  await page.route("**/api/frontage-discovery/*", route => {
    steps++; venues = [accepted]; run = { ...run, status: "complete", cursor: 1, images: 1, reviews: 1, approvedIds: [venue.placeId], message: "1 venue approved. Candidate shortlist exhausted.", attempts: [{ venueId: venue.placeId, venueName: venue.name, outcome: "approved", reason: accepted.review.assessment.reason }] };
    return route.fulfill({ json: run });
  });
  await page.route("**/api/approved-venues/*", route => {
    if (route.request().headers()["content-type"]?.includes("multipart")) { created++; return route.fulfill({ json: { id: `google-${venue.placeId}` } }); }
    imageRequests++; return route.fulfill({ contentType: "image/png", body: image });
  });
  await page.goto("/google");
  await page.getByText("Automatic frontage discovery", { exact: true }).click();
  await expect(page.getByText("Your shortlist starts here")).toBeVisible();
  expect(starts).toBe(0); expect(imageRequests).toBe(0);
  await page.getByRole("button", { name: "Discover new", exact: true }).click();
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Find 3 new venues" }).click(); expect(starts).toBe(0);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Find 3 new venues" }).click();
  await expect(page.getByText("1 venue approved. Candidate shortlist exhausted.")).toBeVisible();
  await page.getByRole("button", { name: "View approved venues" }).click();
  await expect(page.getByRole("heading", { name: "Test Cafe", exact: true })).toBeVisible();
  expect(imageRequests).toBe(0);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Load approved view" }).click();
  await expect(page.getByAltText("Assessed entrance of Test Cafe")).toBeVisible();
  expect(imageRequests).toBe(1); expect(steps).toBe(1);
  await page.getByRole("checkbox", { name: /necessary rights/ }).check();
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByRole("link", { name: "Open project", exact: true })).toHaveAttribute("href", "/studio?id=google-testplace1234");
  expect(created).toBe(1); expect(imageRequests).toBe(1);
  await page.screenshot({ path: ".cache/frontage-discovery-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Test Cafe", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".cache/frontage-discovery-mobile.png", fullPage: true });
  await page.reload();
  await page.getByText("Automatic frontage discovery", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Test Cafe", exact: true })).toBeVisible();
  expect(starts).toBe(1); expect(steps).toBe(1); expect(imageRequests).toBe(1); expect(errors).toEqual([]);
});
