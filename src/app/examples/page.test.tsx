import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ExamplesPage from "./page";
import { listProjects } from "@/lib/project-store";
import { readComposition } from "@/lib/composition/store";
import { readStoredAsset } from "@/lib/planters/store";
import type { Project } from "@/lib/projects";
import type { CompositionState } from "@/lib/composition/types";
import type { PlanterAsset } from "@/lib/planters/types";

vi.mock("@/lib/project-store", () => ({ listProjects: vi.fn() }));
vi.mock("@/lib/composition/store", () => ({ readComposition: vi.fn() }));
vi.mock("@/lib/planters/store", () => ({ readStoredAsset: vi.fn() }));

const project = { id: "google-test", title: "Test Cafe", address: "1 Test Street, London W1D 4PY", image: { provider: "uploaded", storagePath: "source.jpg" }, frontageReview: { assessmentId: "review-id", checkedAt: "2026-10-11", reason: "Matching sign and clear ground.", source: "streetview", attribution: "Google" } } as Project;
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
  expect(screen.getByAltText("Original frontage of Test Cafe")).toHaveAttribute("src", "/api/projects/google-test/image");
  expect(screen.getByAltText("Planter proposal for Test Cafe")).toHaveAttribute("src", "/api/projects/google-test/composition/files/after.png");
  expect(screen.getByText(project.address!)).toBeVisible();
  expect(screen.getByText("Matching sign and clear ground.")).toBeVisible();
  expect(screen.getByRole("link", { name: "View extracted product used" })).toHaveAttribute("href", "/api/planters/product/files/v-revision.png");
  expect(readComposition).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
});

it("does not present flagged compositions as completed examples", async () => {
  vi.mocked(readComposition).mockResolvedValue({ ...state, versions: state.versions.map(v => ({ ...v, review: { ...v.review!, status: "review" } })) });
  render(await ExamplesPage());
  expect(screen.getByText(/No reviewed compositions/)).toBeVisible();
  expect(readStoredAsset).not.toHaveBeenCalled();
});

it("shows an honest storage error instead of an empty successful gallery", async () => {
  vi.mocked(listProjects).mockRejectedValue(new Error("Storage unavailable"));
  render(await ExamplesPage());
  expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded");
});
