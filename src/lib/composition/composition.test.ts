// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { Project } from "../projects";
import type { PlanterAsset } from "../planters/types";
import { PlanterError } from "../planters/validation";
import { estimatedHeight, fallbackEstimate, placementGeometry } from "./geometry";
import { parsePlacements, readComposition, readCompositionFile } from "./store";
import { createComposition, runEnhancement } from "./jobs";
import { estimateScale } from "./scale";
import type { Placement } from "./types";

const memory = vi.hoisted(() => ({ files: new Map<string, Buffer>(), asset: {} as PlanterAsset, planter: Buffer.alloc(0) }));
vi.mock("../storage", () => ({
  storageConfigured: () => true,
  getFile: async (key: string) => { const bytes = memory.files.get(key); if (!bytes) throw new PlanterError("Missing", 404); return bytes; },
  putFile: async (key: string, bytes: Buffer, upsert: boolean) => { if (memory.files.has(key) && !upsert) throw new Error("Duplicate file"); memory.files.set(key, bytes); },
}));
vi.mock("../project-store", () => ({ projectId: (id: string) => id }));
vi.mock("../planters/store", () => ({
  locked: async (_key: string, action: () => Promise<unknown>) => action(),
  readAsset: async () => memory.asset,
  readAssetFile: async () => memory.planter,
}));

const assetId = "11111111-1111-4111-8111-111111111111", revisionId = "22222222-2222-4222-8222-222222222222";
const project: Project = { id: "google-test-1234", title: "Cafe", venueId: "place1234", source: "google", sourceUrl: "", createdAt: new Date().toISOString(), image: { provider: "google-street-view", panoId: "pano", headingOffset: 0, fov: 65, storagePath: "storefronts/test/source.png" } };
const placement: Placement = { id: "33333333-3333-4333-8333-333333333333", assetId, revisionId, x: .3, y: .8, height: .4, perspective: false, shadow: .6 };

beforeEach(async () => {
  memory.files.clear();
  memory.files.set("storefronts/test/source.png", await sharp({ create: { width: 320, height: 240, channels: 3, background: "#aabbcc" } }).png().toBuffer());
  memory.planter = await sharp(Buffer.from('<svg width="100" height="200"><rect x="20" y="20" width="60" height="180" fill="green"/></svg>')).png().toBuffer();
  memory.asset = { id: assetId, name: "Planter", approvedRevisionId: revisionId, revisions: [{ id: revisionId, width: 100, height: 200, contactPoint: { x: .5, y: 1 } }] } as PlanterAsset;
  vi.stubEnv("OPENAI_API_KEY", "test-key"); vi.stubEnv("OPENAI_IMAGE_MODEL", "gpt-image-1.5");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("scale and placement", () => {
  it("derives size from the container/reference ratio and anchors the contact point", () => {
    expect(estimatedHeight(.5, 2, .6, .5)).toBeCloseTo(.3);
    const estimate = fallbackEstimate(assetId, revisionId);
    const reference = placementGeometry({ ...placement, perspective: true, y: estimate.reference.bottom.y }, memory.asset.revisions[0], 1000, 800, estimate);
    const closer = placementGeometry({ ...placement, perspective: true, y: .9 }, memory.asset.revisions[0], 1000, 800, estimate);
    expect(reference.factor).toBe(1); expect(closer.height).toBeGreaterThan(reference.height);
    expect(closer.y + closer.height).toBeCloseTo(.9 * 800);
    expect(closer.x + closer.width * .5).toBeCloseTo(placement.x * 1000);
  });
  it("rejects malformed, duplicate and excessive placements", () => {
    expect(() => parsePlacements([{ ...placement, x: Infinity }])).toThrow();
    expect(() => parsePlacements([placement, placement])).toThrow();
    expect(() => parsePlacements(Array(7).fill(placement))).toThrow();
    expect(parsePlacements([placement])).toEqual([placement]);
  });
  it("uses structured visual reference estimates and falls back when no reference exists", async () => {
    const value = { referenceDetected: true, referenceTopY: .3, referenceBottomY: .8, referenceX: .5, referenceHeightMetres: 2, containerHeightMetres: .6, containerFraction: .5, groundX: .3, groundY: .8, confidence: "medium", reason: "Doorway assumed 2 m." };
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await estimateScale(project, assetId, revisionId)).toMatchObject({ method: "vision", height: .3, confidence: "medium" });
    value.referenceDetected = false;
    expect(await estimateScale(project, assetId, revisionId)).toMatchObject({ method: "heuristic", confidence: "low" });
    vi.stubEnv("OPENAI_API_KEY", "");
    await estimateScale(project, assetId, revisionId); expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("composition outputs", () => {
  it("creates a basic output without an AI call, retaining transparency and the attribution footer", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const state = await createComposition(project, [placement], false);
    const bytes = await readCompositionFile(project.id, state.versions[0].basicFile);
    const pixels = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => [...pixels.data.subarray((y * pixels.info.width + x) * 4, (y * pixels.info.width + x) * 4 + 3)];
    // Server exports upscale small sources to 1280; the planter is opaque at its centre.
    expect(pixel(Math.round(pixels.info.width * .3), Math.round(pixels.info.height * .65))).toEqual([0, 128, 0]);
    expect(pixel(1, 1)).toEqual([170, 187, 204]);
    expect(pixel(1, pixels.info.height - 1)).toEqual([170, 187, 204]);
    expect(fetcher).not.toHaveBeenCalled(); expect(state.versions).toHaveLength(1);
  });
  it("requests Medium once and only applies generated pixels inside the permitted region", async () => {
    const generated = await sharp({ create: { width: 1536, height: 1024, channels: 3, background: "red" } }).png().toBuffer();
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: generated.toString("base64") }], usage: { total_tokens: 123 } }), { status: 200 })); vi.stubGlobal("fetch", fetcher);
    const started = await createComposition(project, [placement], true);
    await expect(createComposition(project, [placement], true)).rejects.toThrow("already running");
    await runEnhancement(project, started.job!.id);
    const saved = await readComposition(project), version = saved.versions[0];
    expect(saved.job).toBeUndefined(); expect(version.quality).toBe("medium"); expect(version.usage).toEqual({ total_tokens: 123 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const form = fetcher.mock.calls[0][1].body as FormData;
    expect(form.get("quality")).toBe("medium"); expect(form.get("size")).toBe("1536x1024"); expect(form.get("mask")).toBeTruthy();
    const basic = await sharp(await readCompositionFile(project.id, version.basicFile)).ensureAlpha().raw().toBuffer();
    const enhanced = await sharp(await readCompositionFile(project.id, version.enhancedFile!)).ensureAlpha().raw().toBuffer();
    const mask = await sharp(await readCompositionFile(project.id, version.maskFile!)).greyscale().raw().toBuffer();
    const foreground = await sharp(await readCompositionFile(project.id, version.foregroundFile!)).greyscale().raw().toBuffer();
    let changed = 0;
    for (let p = 0; p < mask.length; p++) {
      const original = basic.subarray(p * 4, p * 4 + 4), edited = enhanced.subarray(p * 4, p * 4 + 4);
      if (mask[p] === 0 && !original.equals(edited)) throw new Error(`Outside pixel ${p} changed`);
      if (foreground[p] === 255 && [...original].some((value, index) => Math.abs(value - edited[index]) > 18)) throw new Error("Product lighting changed beyond the permitted bound");
      if (!original.equals(edited)) changed++;
    }
    expect(changed).toBeGreaterThan(100);
    expect(form.getAll("image[]")).toHaveLength(2);
  });
  it("retains the basic image on API failure and never retries automatically", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "No credits" } }), { status: 429 })); vi.stubGlobal("fetch", fetcher);
    const started = await createComposition(project, [placement], true), jobId = started.job!.id;
    await runEnhancement(project, jobId); await runEnhancement(project, jobId);
    const saved = await readComposition(project);
    expect(saved.error).toContain("No credits"); expect(saved.job).toBeUndefined();
    expect(saved.versions[0].enhancedFile).toBeUndefined();
    expect(await readCompositionFile(project.id, saved.versions[0].basicFile)).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
