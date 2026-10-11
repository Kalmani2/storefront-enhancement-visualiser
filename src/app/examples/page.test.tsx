import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ExamplesPage from "./page";
import { listProjects } from "@/lib/project-store";
import { readComposition } from "@/lib/composition/store";
import { readStoredAsset } from "@/lib/planters/store";
import type { Project } from "@/lib/projects";
import type { CompositionState } from "@/lib/composition/types";
import type { PlanterAsset } from "@/lib/planters/types";
import { submissionExamples } from "@/lib/submission-examples";

vi.mock("@/lib/project-store", () => ({ listProjects: vi.fn() }));
vi.mock("@/lib/composition/store", () => ({ readComposition: vi.fn() }));
vi.mock("@/lib/planters/store", () => ({ readStoredAsset: vi.fn() }));

const project = { id: submissionExamples[0].projectId, title: "Test Cafe", address: "1 Test Street, London W1D 4PY", image: { provider: "uploaded", storagePath: "source.jpg" }, frontageReview: { assessmentId: "review-id", checkedAt: "2026-10-11", reason: "Matching sign and clear ground.", source: "streetview", attribution: "Google" } } as Project;
const state = { sourceKey: "source", draft: [], calibrations: {}, versions: [{ id: "version", createdAt: "2026-10-11", enhancedFile: "after.png", placements: [{ assetId: "product", revisionId: "revision" }], review: { status: "passed", summary: "Plausible placement.", issues: [] } }] } as unknown as CompositionState;

beforeEach(() => {
  vi.mocked(listProjects).mockResolvedValue([project, { ...project, id: "manual", frontageReview: undefined }]);
  vi.mocked(readComposition).mockResolvedValue(state);
  vi.mocked(readStoredAsset).mockResolvedValue({ id: "product", name: "Supplied pair", originalFilename: "planter_image2.jpg", originalFile: "original.jpg" } as PlanterAsset);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Examples must not make provider requests"); }));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("shows saved before/after, exact products and provenance only for automatically selected projects", async () => {
  render(await ExamplesPage());
  expect(screen.getByRole("heading", { name: "Test Cafe" })).toBeVisible();
  expect(screen.getByAltText("Original frontage of Test Cafe")).toHaveAttribute("src", `/api/projects/${project.id}/image`);
  expect(screen.getByAltText("Planter proposal for Test Cafe")).toHaveAttribute("src", `/api/projects/${project.id}/composition/files/after.png`);
  expect(screen.getByText(project.address!)).toBeVisible();
  expect(screen.getByText("Matching sign and clear ground.")).toBeVisible();
  expect(screen.getByRole("link", { name: "View extracted product used" })).toHaveAttribute("href", "/api/planters/product/files/v-revision.png");
  expect(readComposition).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryByText(/Viewing saved examples does not call/)).not.toBeInTheDocument();
  expect(screen.queryByText(/unfinished layouts are clearly marked/)).not.toBeInTheDocument();
});

it("shows Thirst as automatically discovered and preserves its reviewed composition", async () => {
  const thirst = { ...project, id: submissionExamples[2].projectId, title: "Thirst Bar Soho", frontageReview: undefined,
    image: { provider: "google-street-view", panoId: "chosen-camera", headingOffset: 15, storagePath: "saved.png", copyright: "© Google" } } as Project;
  vi.mocked(listProjects).mockResolvedValue([project, { ...project, id: submissionExamples[1].projectId, title: "KOZZEE" }, thirst]);
  render(await ExamplesPage());
  expect(screen.getByRole("status")).toHaveTextContent("3 of 3 compositions ready");
  expect(screen.getByAltText("Planter proposal for Thirst Bar Soho")).toHaveAttribute("src", `/api/projects/${thirst.id}/composition/files/after.png`);
  expect(screen.getByText(/Example 03.*Automatically discovered/)).toBeVisible();
  expect(screen.getByText("Before · Street View · © Google")).toBeVisible();
  expect(screen.getByText("Clear THIRST signage, visible entrances and bare pavement suitable for planter placement.")).toBeInTheDocument();
  expect(screen.queryByText("Awaiting composition")).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it("does not present flagged compositions as completed examples", async () => {
  vi.mocked(readComposition).mockResolvedValue({ ...state, versions: state.versions.map(v => ({ ...v, review: { ...v.review!, status: "review" } })) });
  render(await ExamplesPage());
  expect(screen.getByText("Awaiting composition")).toBeVisible();
  expect(screen.queryByAltText("Planter proposal for Test Cafe")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("0 of 3 compositions ready");
  expect(readStoredAsset).not.toHaveBeenCalled();
});

it("uses the requested lineup, excludes DUCKSOUP and keeps Thirst third while it awaits placement", async () => {
  const thirst = { ...project, id: submissionExamples[2].projectId, title: "Thirst Bar Soho" };
  vi.mocked(listProjects).mockResolvedValue([
    thirst, { ...project, id: "google-ChIJMzsTHtMEdkgRncIh8An44WM", title: "DUCKSOUP" },
    { ...project, id: submissionExamples[1].projectId, title: "KOZZEE" }, project,
  ]);
  vi.mocked(readComposition).mockImplementation(async item => item.id === thirst.id ? { ...state, versions: [] } : state);
  render(await ExamplesPage());
  expect(screen.getAllByRole("heading", { level: 2 }).map(node => node.textContent)).toEqual(["Test Cafe", "KOZZEE", "Thirst Bar Soho"]);
  expect(screen.queryByText("DUCKSOUP")).not.toBeInTheDocument();
  expect(screen.getByText(/Example 03.*Automatically discovered/)).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("2 of 3 compositions ready");
  expect(screen.getByRole("link", { name: "Place planters" })).toHaveAttribute("href", `/studio?id=${thirst.id}`);
  expect(screen.queryByAltText("Planter proposal for Thirst Bar Soho")).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it("does not add unlisted projects to the submission examples", async () => {
  vi.mocked(listProjects).mockResolvedValue([{ ...project, id: "unlisted", frontageReview: undefined }]);
  render(await ExamplesPage());
  expect(screen.queryByRole("heading", { name: "Test Cafe" })).not.toBeInTheDocument();
  expect(readComposition).not.toHaveBeenCalled();
});

it("shows an honest storage error instead of an empty successful gallery", async () => {
  vi.mocked(listProjects).mockRejectedValue(new Error("Storage unavailable"));
  render(await ExamplesPage());
  expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded");
});
