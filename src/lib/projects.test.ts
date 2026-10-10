import { beforeEach, describe, expect, it } from "vitest";
import { findProject, readProjects, saveProject, type Project } from "./projects";

const project: Project = {
  id: "google-test-place", title: "My Soho concept", venueId: "test-place", source: "google",
  sourceUrl: "https://www.google.com/maps/place/?q=place_id:test-place", createdAt: "2026-10-09",
  image: { provider: "google-street-view", panoId: "pano-1", headingOffset: 15 },
  configuration: { planter: "trough", quantity: 2, placement: "both" },
};

describe("project library", () => {
  beforeEach(() => localStorage.clear());

  it("starts empty without reinserting demo records", () => {
    expect(readProjects()).toEqual([]);
    expect(readProjects()).toEqual([]);
  });

  it("clears old browser projects but preserves new projects and unrelated storage", () => {
    localStorage.setItem("storefront-visualiser-projects-v1", JSON.stringify([project]));
    localStorage.setItem("unrelated-setting", "keep");
    expect(readProjects()).toEqual([]);
    expect(localStorage.getItem("storefront-visualiser-projects-v1")).toBeNull();
    expect(localStorage.getItem("unrelated-setting")).toBe("keep");
    saveProject(project);
    expect(readProjects()).toEqual([project]);
    expect(readProjects()).toEqual([project]);
  });

  it("saves a new project and its planter configuration locally", () => {
    saveProject(project);
    expect(findProject(project.id)).toEqual(project);
    expect(readProjects()).toHaveLength(1);
  });

  it("updates an existing project without duplicating it", () => {
    saveProject(project);
    const updated = { ...project, configuration: { planter: "classic" as const, quantity: 2, placement: "both" as const } };
    saveProject(updated);
    expect(readProjects()).toHaveLength(1);
    expect(findProject(updated.id)?.configuration).toEqual(updated.configuration);
  });
});
