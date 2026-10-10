// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { createAsset, listAssets } from "@/lib/planters/store";

vi.mock("@/lib/planters/store", () => ({ createAsset: vi.fn(), listAssets: vi.fn() }));
vi.mock("@/lib/planters/extraction", () => ({ imageModel: () => "test-model" }));

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it("serves the hosted demo library without accessing local disk", async () => {
  vi.stubEnv("VERCEL", "1");
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ assets: [], uploadsAvailable: false, configured: false });
  expect(listAssets).not.toHaveBeenCalled();
});

it("rejects hosted uploads before processing files, even with a local request URL", async () => {
  vi.stubEnv("VERCEL", "1");
  const response = await POST(new Request("http://localhost/api/planters", { method: "POST" }));
  expect(response.status).toBe(503);
  expect(createAsset).not.toHaveBeenCalled();
});
