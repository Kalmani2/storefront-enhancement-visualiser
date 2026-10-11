import { test, expect } from "@playwright/test";
import sharp from "sharp";

test("manage shared library details and confirm deletions on desktop and mobile", async ({ page }) => {
  const image = await sharp({ create: { width: 320, height: 240, channels: 3, background: "#b7c7a8" } }).png().toBuffer();
  const id = "11111111-1111-4111-8111-111111111111";
  let projects = [{ id: "google-demo", title: "Soho cafe", venueId: "demo", source: "google", sourceUrl: "https://maps.google.com", createdAt: "2026-10-10", image: { provider: "uploaded", storagePath: "storefronts/google-demo/front.png", originalFilename: "front.png", width: 320, height: 240 } }];
  let assets = [{ id, name: "Garden pair", status: "approved", approvedRevisionId: "22222222-2222-4222-8222-222222222222", createdAt: "2026-10-10", updatedAt: "2026-10-10", originalFilename: "garden.png", originalFile: "original.png", source: { width: 320, height: 240 }, revisions: [{ id: "22222222-2222-4222-8222-222222222222", width: 320, height: 240 }] }];
  let deletes = 0;
  const calls = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  // Never forward an API request to the live shared database or AI services.
  await page.route("**/api/**", async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    calls.push(`${request.method()} ${pathname}`);
    if (pathname.endsWith("/cover") || pathname.endsWith("/image") || pathname.includes("/files/")) return route.fulfill({ contentType: "image/png", body: image });
    if (pathname === "/api/projects") return route.fulfill({ json: projects });
    if (pathname === "/api/planters") return route.fulfill({ json: { assets, configured: false, storage: "supabase", uploadsAvailable: true } });
    if (pathname === "/api/projects/google-demo") {
      if (request.method() === "PATCH") { projects = projects.map(project => ({ ...project, ...request.postDataJSON() })); return route.fulfill({ json: projects[0] }); }
      if (request.method() === "DELETE") { deletes++; projects = []; return route.fulfill({ json: { deleted: true } }); }
    }
    if (pathname === `/api/planters/${id}`) {
      if (request.method() === "PATCH") { assets = assets.map(asset => ({ ...asset, ...request.postDataJSON() })); return route.fulfill({ json: assets[0] }); }
      if (request.method() === "DELETE") { deletes++; assets = []; return route.fulfill({ json: { deleted: true } }); }
    }
    throw new Error(`Unexpected API request: ${request.method()} ${pathname}`);
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Garden pair" })).toBeVisible();
  await expect(page.getByText("Approved", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Ready to use", { exact: true })).toHaveCount(0);
  await expect(page.getByAltText("Frontage for Soho cafe")).toHaveAttribute("src", "/api/projects/google-demo/image");
  await page.screenshot({ path: ".cache/library-cards-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Edit project Soho cafe" }).click();
  await expect(page.getByRole("dialog", { name: "Edit project" })).toBeVisible();
  await expect(page.getByText("Updates saved details only.", { exact: false })).toHaveCount(0);
  await page.getByLabel("Project name").fill("Soho planting concept");
  await page.getByLabel("Address", { exact: true }).fill("Soho, London");
  await page.getByLabel("Project notes").fill("Two planters beside the entrance");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Soho planting concept" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Soho planting concept" })).toBeVisible();
  await expect(page.getByText("Soho, London", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete project Soho planting concept" }).click();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(deletes).toBe(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Edit planter Garden pair" }).click();
  await expect(page.getByText("Updates saved details only.", { exact: false })).toHaveCount(0);
  await page.getByLabel("Planter name").fill("Terracotta pair");
  await page.getByLabel("Planter notes").fill("Two warm terracotta containers");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.screenshot({ path: ".cache/library-edit-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Terracotta pair" })).toBeVisible();
  await page.getByRole("button", { name: "Delete planter Terracotta pair" }).click();
  await page.getByRole("button", { name: "Delete planter", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Terracotta pair" })).toHaveCount(0);
  await expect(page.getByText("No planters yet.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Delete project Soho planting concept" }).click();
  await page.getByRole("button", { name: "Delete project", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Soho planting concept" })).toHaveCount(0);
  await expect(page.getByText("No saved projects yet.", { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByText("No saved projects yet.", { exact: false })).toBeVisible();
  expect(deletes).toBe(2);
  expect(calls.some(call => /extract|composition|google|discovery/.test(call.replace("google-demo", "demo")))).toBe(false);
  expect(errors).toEqual([]);
});


test("library action rows align for short and wrapped names", async ({ page }) => {
  const image = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#b7c7a8" } }).png().toBuffer();
  const names = ["Soho cafe", "The Long Named Independent Coffee House and Neighbourhood Restaurant"];
  const projects = names.map((title, index) => ({ id: `google-layout-${index}`, title, address: index ? "12 Frith Street, Soho, London W1D 4PY" : "1 Dean Street", source: "google", sourceUrl: "https://maps.google.com", image: { provider: "uploaded", storagePath: "front.png" } }));
  const assets = names.map((name, index) => ({ id: `11111111-1111-4111-8111-11111111111${index}`, name, status: "approved", revisions: [] }));
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/projects") return route.fulfill({ json: projects });
    if (path === "/api/planters") return route.fulfill({ json: { assets, configured: true } });
    if (path.endsWith("/image") || path.includes("/files/")) return route.fulfill({ contentType: "image/png", body: image });
    return route.fulfill({ status: 500, json: { error: "Unexpected API request" } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: `Edit planter ${names[1]}` })).toBeVisible();
  for (const kind of ["project", "planter"]) {
    const rows = await Promise.all(names.map(name => page.getByRole("button", { name: `Edit ${kind} ${name}` }).locator("..").locator("..").boundingBox()));
    expect(rows[0].height).toBe(44); expect(rows[1].height).toBe(44);
    expect(rows[0].y).toBe(rows[1].y);
  }
  await page.screenshot({ path: ".cache/library-aligned-cards.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
