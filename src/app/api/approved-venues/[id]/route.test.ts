// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST, DELETE } from "./route";
import { fingerprint } from "@/lib/frontage/assessment";
import { getApproved, markApproved } from "@/lib/frontage/store";
import { frameAvailable, fetchFrontageImage } from "@/lib/frontage/images";
import { getProject, storeGoogleFrontage, storeFrontage } from "@/lib/project-store";
import { PlanterError } from "@/lib/planters/validation";
import { RULES_VERSION, type ApprovedVenue } from "@/lib/frontage/types";
import { storageClient, getFile, putFile } from "@/lib/storage";

vi.mock("@/lib/frontage/store", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/frontage/store")>(), getApproved: vi.fn(), markApproved: vi.fn() }));
vi.mock("@/lib/frontage/images", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/frontage/images")>(), frameAvailable: vi.fn(), fetchFrontageImage: vi.fn() }));
vi.mock("@/lib/project-store", () => ({ getProject: vi.fn(), storeGoogleFrontage: vi.fn(), storeFrontage: vi.fn() }));
vi.mock("@/lib/storage", () => ({ storageClient: vi.fn(), getFile: vi.fn(), putFile: vi.fn() }));

const bytes = Buffer.from("verified-original");
const approved = { venue: { placeId: "testplace1234", name: "Test Cafe", address: "1 Test Street", category: "cafe", mapsUrl: "https://maps.google.com" }, status: "approved",
  review: { id: "a".repeat(64), checkedAt: "2026-10-11T00:00:00Z", expiresAt: "2099-01-01", rulesVersion: RULES_VERSION, model: "gpt-4.1-mini", fingerprint: fingerprint(bytes), assessment: { reason: "Visible sign and entrance." },
    frame: { source: "streetview", panoId: "pano", heading: 80, pitch: -8, fov: 75, copyright: "© Google" } } } as ApprovedVenue;
const context = { params: Promise.resolve({ id: approved.venue.placeId }) };
function request(body: unknown) { return new Request("http://localhost/api/approved-venues/testplace1234", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
function upload(content = bytes) {
  const body = new FormData(); body.set("image", new Blob([content]), "preview.jpg"); body.set("assessmentId", approved.review.id); body.set("title", "My cafe project");
  return new Request("http://localhost/api/approved-venues/testplace1234", { method: "POST", body });
}
const insert = vi.fn().mockResolvedValue({ error: null });
beforeEach(() => {
  vi.mocked(getFile).mockRejectedValue(new PlanterError("Missing", 404));
  vi.mocked(putFile).mockResolvedValue(undefined);
  vi.mocked(getApproved).mockResolvedValue(structuredClone(approved));
  vi.mocked(frameAvailable).mockResolvedValue(true);
  vi.mocked(fetchFrontageImage).mockResolvedValue({ bytes, frame: approved.review.frame, contentType: "image/jpeg" });
  vi.mocked(getProject).mockRejectedValue(new PlanterError("Missing", 404));
  vi.mocked(storeGoogleFrontage).mockImplementation(async p => p);
  vi.mocked(storageClient).mockReturnValue({ from: () => ({ insert }) } as unknown as ReturnType<typeof storageClient>);
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe("approved-image reuse and project hand-off", () => {
  it("will not retrieve via legacy POST without confirmation", async () => {
    expect((await POST(request({}), context)).status).toBe(400); expect(fetchFrontageImage).not.toHaveBeenCalled();
  });
  it("serves cached previews automatically without requesting Google again", async () => {
    vi.mocked(getFile).mockResolvedValue(bytes);
    const result = await GET(new Request("http://localhost/preview"), context);
    expect(result.status).toBe(200); expect(Buffer.from(await result.arrayBuffer())).toEqual(bytes);
    expect(fetchFrontageImage).not.toHaveBeenCalled(); expect(frameAvailable).not.toHaveBeenCalled();
  });
  it("caches missing previews after verifying the assessed image", async () => {
    expect((await GET(new Request("http://localhost/preview"), context)).status).toBe(200);
    expect(putFile).toHaveBeenCalledWith(`approved-frontages/${approved.review.id}/image.jpg`, bytes, true, "image/jpeg");
  });
  it("does not request Google on storage outages or corrupted cached previews", async () => {
    vi.mocked(getFile).mockRejectedValue(new PlanterError("Offline", 502));
    expect((await GET(new Request("http://localhost/preview"), context)).status).toBe(502);
    vi.mocked(getFile).mockResolvedValue(Buffer.from("corrupt"));
    expect((await GET(new Request("http://localhost/preview"), context)).status).toBe(502);
    expect(fetchFrontageImage).not.toHaveBeenCalled();
  });
  it("retrieves a matching approved frame without running vision", async () => {
    const result = await POST(request({ confirmed: true }), context);
    expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store");
    expect(Buffer.from(await result.arrayBuffer())).toEqual(bytes);
  });
  it("marks unavailable panoramas stale without substituting or downloading another", async () => {
    vi.mocked(frameAvailable).mockResolvedValue(false);
    expect((await POST(request({ confirmed: true }), context)).status).toBe(409);
    expect(markApproved).toHaveBeenCalledWith(approved.venue.placeId, "stale"); expect(fetchFrontageImage).not.toHaveBeenCalled();
  });
  it("does not give changed image content the original approval", async () => {
    vi.mocked(fetchFrontageImage).mockResolvedValue({ bytes: Buffer.from("different-store"), frame: approved.review.frame, contentType: "image/jpeg" });
    expect((await POST(request({ confirmed: true }), context)).status).toBe(409); expect(markApproved).toHaveBeenCalledWith(approved.venue.placeId, "stale");
  });
  it("verifies the uploaded preview fingerprint", async () => {
    expect((await POST(upload(Buffer.from("substitute")), context)).status).toBe(409);
    expect(insert).not.toHaveBeenCalled(); expect(storeGoogleFrontage).not.toHaveBeenCalled();
  });
  it("creates a project with exact framing and venue information without another image request", async () => {
    const result = await POST(upload(), context); expect(result.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: "My cafe project", address: "1 Test Street", category: "cafe", image: expect.objectContaining({ panoId: "pano", heading: 80, pitch: -8, fov: 75 }) }) }));
    expect(storeGoogleFrontage).toHaveBeenCalledOnce(); expect(fetchFrontageImage).not.toHaveBeenCalled();
  });
  it("does not overwrite an existing project or its image", async () => {
    vi.mocked(getProject).mockResolvedValue({ id: "existing", image: { provider: "uploaded", storagePath: "existing/source.png" } } as Awaited<ReturnType<typeof getProject>>);
    expect((await POST(upload(), context)).status).toBe(200); expect(insert).not.toHaveBeenCalled(); expect(storeGoogleFrontage).not.toHaveBeenCalled(); expect(storeFrontage).not.toHaveBeenCalled();
  });
  it("removes only the shortlist entry", async () => {
    expect((await DELETE(new Request("http://localhost", { method: "DELETE" }), context)).status).toBe(200);
    expect(markApproved).toHaveBeenCalledWith(approved.venue.placeId, "removed"); expect(getProject).not.toHaveBeenCalled();
  });
});
