// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { deleteCompositionVersion } from "./versions";
import { latestEnhancedVersion, type CompositionState, type CompositionVersion } from "./types";
import type { Project } from "../projects";
import { GET } from "@/app/api/projects/[id]/cover/route";

const mocks = vi.hoisted(() => ({ state: {} as CompositionState, read: vi.fn(), write: vi.fn(), remove: vi.fn(), getFile: vi.fn(), readFile: vi.fn(), project: {} as Project }));
vi.mock("./store", () => ({ readComposition: mocks.read, writeComposition: mocks.write, readCompositionFile: mocks.readFile }));
vi.mock("../storage", () => ({ storageConfigured: () => true, removeCompositionFiles: mocks.remove, getFile: mocks.getFile, contentType: () => "image/png" }));
vi.mock("../project-store", () => ({ getProject: async () => mocks.project }));
vi.mock("../planters/store", () => ({ locked: async (_key: string, action: () => Promise<unknown>) => action() }));
const first = "11111111-1111-4111-8111-111111111111", second = "22222222-2222-4222-8222-222222222222";
function version(id: string, date: string): CompositionVersion { return { id, createdAt: date, placements: [], basicFile: `${id}.png`, enhancedFile: `${id}-enhanced.png`, sourceFile: "shared-source.png", width: 100, height: 100 }; }
beforeEach(() => {
  vi.resetAllMocks();
  mocks.project = { id: "google-test", image: { provider: "uploaded", storagePath: "storefronts/google-test/source.png" } } as Project;
  mocks.state = { sourceKey: "source", draft: [], calibrations: {}, versions: [version(first, "2026-10-01"), version(second, "2026-10-02")], resultVersionId: second };
  mocks.read.mockImplementation(async () => structuredClone(mocks.state));
  mocks.write.mockImplementation(async (_id, state) => { mocks.state = state; });
  mocks.getFile.mockResolvedValue(Buffer.from("original")); mocks.readFile.mockResolvedValue(Buffer.from("enhanced"));
});
it("deletes the latest version, preserves shared files, and falls back to the previous result", async () => {
  const result = await deleteCompositionVersion(mocks.project, second);
  expect(result.versions.map(v => v.id)).toEqual([first]); expect(result.resultVersionId).toBe(first);
  expect(mocks.remove.mock.calls[0][0]).toContain(`compositions/google-test/${second}-enhanced.png`);
  expect(mocks.remove.mock.calls[0][0]).not.toContain("compositions/google-test/shared-source.png");
  expect(mocks.state.draft).toEqual([]);
});
it("blocks deletion during a job and rejects unknown versions", async () => {
  mocks.state.job = { id: "job", versionId: second, startedAt: new Date().toISOString() };
  await expect(deleteCompositionVersion(mocks.project, second)).rejects.toMatchObject({ status: 409 });
  delete mocks.state.job;
  await expect(deleteCompositionVersion(mocks.project, "33333333-3333-4333-8333-333333333333")).rejects.toMatchObject({ status: 404 });
  expect(mocks.write).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
});
it("reports cleanup failure after committing deletion", async () => {
  mocks.remove.mockRejectedValue(new Error("offline"));
  expect((await deleteCompositionVersion(mocks.project, second)).warning).toContain("Version deleted");
  expect(mocks.state.versions).toHaveLength(1);
});
it("uses creation time for the newest enhanced cover, independent of selected version", () => {
  mocks.state.versions.reverse(); mocks.state.resultVersionId = first;
  expect(latestEnhancedVersion(mocks.state.versions)?.id).toBe(second);
});
it("serves the newest enhanced image and falls back to original after all versions are deleted", async () => {
  const context = { params: Promise.resolve({ id: mocks.project.id }) };
  expect(await (await GET(new Request("http://localhost/cover"), context)).text()).toBe("enhanced");
  expect(mocks.readFile).toHaveBeenCalledWith(mocks.project.id, `${second}-enhanced.png`);
  await deleteCompositionVersion(mocks.project, second); await deleteCompositionVersion(mocks.project, first);
  expect(mocks.state.resultVersionId).toBeUndefined();
  expect(await (await GET(new Request("http://localhost/cover"), context)).text()).toBe("original");
  expect(mocks.getFile).toHaveBeenCalledWith("storefronts/google-test/source.png");
});
