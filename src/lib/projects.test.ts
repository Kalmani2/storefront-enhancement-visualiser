import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findProject, readProjects, saveProject, type Project } from "./projects";

const project: Project = {
  id: "google-test-place", title: "My Soho concept", venueId: "test-place", source: "google",
  sourceUrl: "https://www.google.com/maps/place/?q=place_id:test-place", createdAt: "2026-10-09",
  image: { provider: "google-street-view", panoId: "pano-1", headingOffset: 15 },
  configuration: { planter: "trough", quantity: 2, placement: "both" },
};

let rows: Project[];
beforeEach(() => {
  localStorage.clear(); rows = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    if (url !== "/api/projects") throw new Error("Unexpected external request.");
    if (options?.method === "POST") {
      const body = JSON.parse(options.body as string);
      const index = rows.findIndex(row => row.id === body.project.id);
      if (index < 0) rows.push(body.project);
      else if (!body.migration) rows[index] = body.project;
      return Response.json(rows.find(row => row.id === body.project.id));
    }
    return Response.json(rows);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("shared project library", () => {
  it("starts empty and never creates demo records", async () => {
    expect(await readProjects()).toEqual([]);
  });
  it("saves and updates projects through the server, not localStorage", async () => {
    await saveProject(project);
    expect(await findProject(project.id)).toEqual(project);
    const updated = { ...project, configuration: { planter: "classic" as const, quantity: 1, placement: "left" as const } };
    await saveProject(updated);
    expect(await readProjects()).toEqual([updated]);
    expect(localStorage.getItem("storefront-visualiser-projects-v2")).toBeNull();
  });
  it("imports current browser projects once, preserves backups, and never revives v1", async () => {
    localStorage.setItem("storefront-visualiser-projects-v1", JSON.stringify([{ ...project, id: "old-demo" }]));
    localStorage.setItem("storefront-visualiser-projects-v2", JSON.stringify([project]));
    localStorage.setItem("unrelated", "keep");
    expect(await readProjects()).toEqual([project]);
    expect(await readProjects()).toEqual([project]);
    expect(vi.mocked(fetch).mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
    expect(localStorage.getItem("storefront-visualiser-projects-v2")).not.toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("keep");
    expect(localStorage.getItem("storefront-visualiser-projects-v1")).toBeNull();
  });
  it("preserves the browser backup and retries migration only after a failed save", async () => {
    localStorage.setItem("storefront-visualiser-projects-v2", JSON.stringify([project]));
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "Storage unavailable" }, { status: 502 }));
    await expect(readProjects()).rejects.toThrow("Storage unavailable");
    expect(localStorage.getItem("storefront-visualiser-projects-v2-migrated")).toBeNull();
    expect(await readProjects()).toEqual([project]);
  });
  it("never overwrites a newer cloud project during browser migration", async () => {
    rows.push({ ...project, title: "Newer cloud title" });
    localStorage.setItem("storefront-visualiser-projects-v2", JSON.stringify([project]));
    expect((await readProjects())[0].title).toBe("Newer cloud title");
  });
  it("loads the shared library when browser storage is blocked", async () => {
    const blocked = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
    expect(await readProjects()).toEqual([]);
    blocked.mockRestore();
  });
});
