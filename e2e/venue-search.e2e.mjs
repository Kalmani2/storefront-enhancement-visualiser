import { test, expect } from "@playwright/test";
import sharp from "sharp";

test("direct lookup, prospect mode, group loading, framing and project saving", async ({ page }) => {
  const venue = { placeId: "testplace1234", name: "Frith Street Cafe", address: "49 Frith Street, London W1D 4SG", latitude: 51.5135, longitude: -0.132, category: "coffee shop", mapsUrl: "https://maps.google.com" };
  const cameras = [0, 1].map(index => ({ panoId: `camera-${index}`, token: `signed-${index}`, latitude: 51.514, longitude: -0.133, distanceMetres: 15, heading: 90, fov: 65, pitch: -5, copyright: "© Google", date: "2026-01" }));
  const jpeg = await sharp({ create: { width: 640, height: 420, channels: 3, background: "#a9b9a0" } }).jpeg().toBuffer();
  const queries = [], imageCalls = [], errors = [];
  const projects = [];
  await page.route("**/api/projects", route => {
    if (route.request().method() === "POST") {
      const { project } = route.request().postDataJSON();
      const index = projects.findIndex(item => item.id === project.id);
      if (index < 0) projects.push(project); else projects[index] = project;
      return route.fulfill({ json: project });
    }
    return route.fulfill({ json: projects });
  });
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", dialog => dialog.accept());
  await page.route("**/api/google/**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/venues")) {
      const body = route.request().postDataJSON(); queries.push(body);
      return route.fulfill({ json: { location: "London", category: body.mode, venues: body.mode === "direct" ? [venue] : Array.from({ length: 20 }, (_, index) => ({ ...venue, placeId: `prospect-${index}`, name: `Cafe ${index + 1}` })) } });
    }
    if (pathname.endsWith("/metadata")) return route.fulfill({ json: { available: true, candidates: cameras, camerasChecked: 7, streetMatched: true } });
    if (pathname.endsWith("/image")) { imageCalls.push(route.request().postDataJSON()); return route.fulfill({ contentType: "image/jpeg", body: jpeg }); }
    throw new Error(`Unexpected Google request ${pathname}`);
  });
  await page.route("**/api/planters", route => route.fulfill({ json: { assets: [], configured: true, model: "mock", outputDirectory: "output/planters" } }));
  await page.goto("/google");
  await expect(page.getByText("London pilot")).toHaveCount(0);
  await expect(page.getByText("Find the frontage.")).toHaveCount(0);
  await expect(page.getByRole("navigation").getByRole("link")).toHaveCount(2);
  await page.screenshot({ path: ".cache/venue-search-start.png", fullPage: true });
  await page.getByRole("button", { name: "Search a place", exact: true }).click();
  await expect(page.getByLabel("Business type")).toHaveCount(0);
  await page.getByLabel("London business name or address").fill("49 Frith Street");
  await page.getByRole("button", { name: "Find place", exact: true }).click();
  await page.getByRole("complementary", { name: "Places" }).getByRole("button").click();
  await expect(page.getByRole("heading", { name: venue.name })).toBeVisible();
  expect(queries[0]).toEqual({ mode: "direct", query: "49 Frith Street" });
  expect(imageCalls).toHaveLength(0);
  await expect(page.getByRole("button", { name: "Load selected view only" })).toHaveCount(0);
  await expect(page.getByLabel("Project name")).toHaveValue(venue.name);
  await expect(page.getByRole("button", { name: "Save project to library" })).toBeDisabled();
  await page.getByRole("button", { name: "Load 2 views", exact: true }).click();
  await expect(page.getByAltText(`Street View of ${venue.name}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save project to library" })).toBeEnabled();
  expect(imageCalls).toHaveLength(2);
  await page.getByRole("button", { name: "View 2", exact: false }).click();
  await page.getByLabel("Framing").selectOption("45");
  await expect(page.getByRole("button", { name: "Save project to library" })).toBeDisabled();
  await page.getByRole("button", { name: "Load 1 view", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save project to library" })).toBeEnabled();
  expect(imageCalls.at(-1)).toMatchObject({ candidateToken: "signed-1", fov: 45 });
  await page.getByLabel("Project name").fill("Frith Street proposal");
  await page.getByRole("button", { name: "Save project to library" }).click();
  await expect(page).toHaveURL("/");
  expect(projects[0]).toMatchObject({ title: "Frith Street proposal", venueId: venue.placeId, image: { panoId: "camera-1", fov: 45 } });
  expect(await page.evaluate(() => localStorage.getItem("storefront-visualiser-projects-v2"))).toBeNull();
  await page.goto("/google");
  await page.getByRole("button", { name: "Find prospects", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "20 places found" })).toBeVisible();
  await page.getByRole("complementary", { name: "Places" }).getByRole("button").first().click();
  await expect(page.getByRole("button", { name: "Load 2 views" })).toBeVisible();
  const sizes = await page.evaluate(() => {
    const list = document.querySelector('aside[aria-label="Places"]');
    return { list: list.getBoundingClientRect().height, detail: list.nextElementSibling.getBoundingClientRect().height, scrolls: list.firstElementChild.scrollHeight > list.firstElementChild.clientHeight };
  });
  expect(Math.abs(sizes.list - sizes.detail)).toBeLessThan(2);
  expect(sizes.scrolls).toBe(true);
  await page.screenshot({ path: ".cache/venue-search-results.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Search a place", exact: true }).click();
  await expect(page.getByRole("region", { name: "Search results" })).toHaveCount(0);
  await expect(page.getByLabel("London business name or address")).toBeVisible();
  expect(errors).toEqual([]);
});
