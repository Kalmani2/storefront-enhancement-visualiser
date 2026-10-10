import { beforeEach, describe, expect, it } from "vitest";
import { findProject, readProjects, saveProject, starterProjects, type Project } from "./projects";

describe("project library", () => {
  beforeEach(() => localStorage.clear());

  it("starts with three labelled venue records without pretending to have images", () => {
    expect(readProjects()).toHaveLength(3);
    expect(starterProjects.every((project) => !project.image)).toBe(true);
  });

  it("saves a new project and its planter configuration locally", () => {
    const project: Project = {
      id: "google-test-place",
      title: "My Soho concept",
      venueId: "test-place",
      source: "google",
      sourceUrl: "https://www.google.com/maps/place/?q=place_id:test-place",
      createdAt: "2026-10-09",
      image: { provider: "google-street-view", panoId: "pano-1", headingOffset: 15 },
      configuration: { planter: "trough", quantity: 2, placement: "both" },
    };
    saveProject(project);
    expect(findProject(project.id)).toEqual(project);
    expect(readProjects()).toHaveLength(4);
  });

  it("updates an existing project without duplicating it", () => {
    const updated = { ...starterProjects[0], configuration: { planter: "classic" as const, quantity: 2, placement: "both" as const } };
    saveProject(updated);
    expect(readProjects()).toHaveLength(3);
    expect(findProject(updated.id)?.configuration).toEqual(updated.configuration);
  });
});
