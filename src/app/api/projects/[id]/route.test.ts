// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { PATCH, DELETE } from "./route";
import { DELETE as planterDELETE } from "@/app/api/planters/[id]/route";
import { updateProjectDetails } from "@/lib/project-store";
import { removeProject, removePlanter } from "@/lib/library-management";
import { PlanterError } from "@/lib/planters/validation";

vi.mock("@/lib/project-store", () => ({ getProject: vi.fn(), updateProjectDetails: vi.fn() }));
vi.mock("@/lib/library-management", () => ({ removeProject: vi.fn(), removePlanter: vi.fn() }));
vi.mock("@/lib/planters/store", () => ({ readAsset: vi.fn(), updateAsset: vi.fn() }));
const context = { params: Promise.resolve({ id: "test-id" }) };
afterEach(() => { vi.resetAllMocks(); });

it("saves project details through the existing server error boundary", async () => {
  vi.mocked(updateProjectDetails).mockRejectedValue(new PlanterError("Invalid project details."));
  const response = await PATCH(new Request("https://demo.example/api/projects/test-id", { method: "PATCH", body: JSON.stringify({ title: " " }) }), context);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Invalid project details." });
});

it("rejects malformed and oversized update requests before saving", async () => {
  for (const body of ["{", "a".repeat(10_001)]) {
    const response = await PATCH(new Request("https://demo.example/api/projects/test-id", { method: "PATCH", body }), context);
    expect([400, 413]).toContain(response.status);
  }
  expect(updateProjectDetails).not.toHaveBeenCalled();
});

it("rejects cross-origin project edits and both deletion endpoints", async () => {
  for (const [handler, method] of [[PATCH, "PATCH"], [DELETE, "DELETE"], [planterDELETE, "DELETE"]] as const) {
    const response = await handler(new Request("https://demo.example/api/projects/test-id", { method, headers: { origin: "https://unrelated.example" }, body: method === "PATCH" ? "{}" : undefined }), context);
    expect(response.status).toBe(403);
  }
  expect(removeProject).not.toHaveBeenCalled(); expect(removePlanter).not.toHaveBeenCalled(); expect(updateProjectDetails).not.toHaveBeenCalled();
});

it("returns successful deletion and forwards reference conflicts", async () => {
  vi.mocked(removeProject).mockResolvedValue({ deleted: true });
  expect(await (await DELETE(new Request("https://demo.example/api/projects/test-id", { method: "DELETE" }), context)).json()).toEqual({ deleted: true });
  vi.mocked(removePlanter).mockRejectedValue(new PlanterError("Planter is in use.", 409));
  expect((await planterDELETE(new Request("https://demo.example/api/planters/test-id", { method: "DELETE" }), context)).status).toBe(409);
});
