// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { Project } from "../projects";
import type { PlanterAsset } from "../planters/types";
import { PlanterError } from "../planters/validation";
import { estimatedHeight, fallbackEstimate, placementGeometry, projectedPoint } from "./geometry";
import { parsePlacements, readComposition, readCompositionFile, writeComposition } from "./store";
import { createComposition, runEnhancement, recoverComposition } from "./jobs";
import { estimateScale } from "./scale";
import { composeInstallation } from "./installation";
import { completeScene, composeScene, sceneEditMask } from "./scene";
import { findGroundContacts, measureContainerFraction } from "./contacts";
import type { Placement } from "./types";

const memory = vi.hoisted(() => ({ files: new Map<string, Buffer>(), asset: {} as PlanterAsset, planter: Buffer.alloc(0), failEnhancedWrite: false }));
vi.mock("../storage", () => ({
  storageConfigured: () => true,
  getFile: async (key: string) => { const bytes = memory.files.get(key); if (!bytes) throw new PlanterError("Missing", 404); return bytes; },
  putFile: async (key: string, bytes: Buffer, upsert: boolean) => { if (memory.failEnhancedWrite && key.endsWith("-enhanced.png")) { memory.failEnhancedWrite = false; throw new Error("Temporary write failure"); } if (memory.files.has(key) && !upsert) throw new Error("Duplicate file"); memory.files.set(key, bytes); },
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
  memory.files.clear(); memory.failEnhancedWrite = false;
  memory.files.set("storefronts/test/source.png", await sharp({ create: { width: 320, height: 240, channels: 3, background: "#aabbcc" } }).png().toBuffer());
  memory.planter = await sharp(Buffer.from('<svg width="100" height="200"><rect x="20" y="20" width="60" height="180" fill="green"/></svg>')).png().toBuffer();
  memory.asset = { id: assetId, name: "Planter", approvedRevisionId: revisionId, revisions: [{ id: revisionId, width: 100, height: 200, contactPoint: { x: .5, y: 1 } }] } as PlanterAsset;
  vi.stubEnv("OPENAI_API_KEY", "test-key"); vi.stubEnv("OPENAI_COMPOSITION_MODEL", "");
  await writeComposition(project.id, { sourceKey: "storefronts/test/source.png", draft: [], calibrations: { [`${assetId}:${revisionId}`]: { ...fallbackEstimate(assetId, revisionId), analysisVersion: 2 } }, versions: [] });
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
    const value = { referenceDetected: true, referenceName: "Door", referenceTop: { x: .5, y: .3 }, referenceBottom: { x: .5, y: .8 }, referenceHeightMetres: 2, containerTopY: .5, containerBottomY: 1, containerHeightMetres: .6, containerCount: 1, productDescription: "Green test planter", shape: "rectangular", ground: { x: .3, y: .8 }, facadeGroundLeft: { x: .1, y: .8 }, facadeGroundRight: { x: .9, y: .8 }, entrance: { x: .4, y: .3, width: .2, height: .5 }, lighting: "Soft daylight", perspective: "Front facing", reason: "Doorway assumed 2 m." };
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await estimateScale(project, assetId, revisionId)).toMatchObject({ method: "vision", confidence: "medium", analysisVersion: 2 });
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
  it("returns the complete Medium image without a spot mask or merge and reuses unchanged layouts", async () => {
    const generated = await sharp({ create: { width: 1280, height: 960, channels: 3, background: "red" } }).png().toBuffer();
    const fetcher = vi.fn().mockImplementation(async (url: string) => new Response(JSON.stringify(url.includes("images/edits") ? { data: [{ b64_json: generated.toString("base64") }], usage: { input_tokens_details: { image_tokens: 1000, text_tokens: 100 }, output_tokens: 349 } } : { output: [{ content: [{ type: "output_text", text: JSON.stringify({ product: 4, grounding: 4, scene: 5, summary: "Good", issues: [], fatal: false }) }] }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const started = await createComposition(project, [placement], true);
    await expect(createComposition(project, [placement], true)).rejects.toThrow("already running");
    await runEnhancement(project, started.job!.id); await runEnhancement(project, started.job!.id);
    const saved = await readComposition(project), version = saved.versions[0];
    expect(saved.error).toBeUndefined(); expect(saved.job).toBeUndefined(); expect(version.quality).toBe("medium");
    const calls = fetcher.mock.calls.filter(c => c[0].includes("images/edits")); expect(calls).toHaveLength(1);
    const form = calls[0][1].body as FormData;
    expect(form.get("quality")).toBe("medium"); expect(form.get("size")).toBe("1280x960"); expect(form.get("model")).toBe("gpt-image-2"); expect(form.get("background")).toBe("opaque"); expect(form.get("mask")).toBeNull(); expect(form.get("prompt")).toContain("convincing photograph"); expect(form.getAll("image[]")).toHaveLength(3);
    expect(version.engine).toBe(5);
    expect(form.get("prompt")).toContain("Your entire returned image will be used directly");
    expect(form.get("prompt")).toContain("Copy readable lettering faithfully");
    const enhanced = await readCompositionFile(project.id, version.enhancedFile!);
    expect(enhanced.equals(generated)).toBe(true);
    expect(version.alignment).toBeUndefined();
    expect(version.review?.status).toBe("passed"); expect(version.estimatedCostUsd).toBeGreaterThan(0);
    const cached = await createComposition(project, [{ ...placement, id: "44444444-4444-4444-8444-444444444444" }], true);
    expect(cached.versions).toHaveLength(1); expect(cached.job).toBeUndefined(); expect(cached.resultVersionId).toBe(version.id);
    const retry = await createComposition(project, [placement], true, true); expect(retry.job).toBeDefined(); expect(retry.versions).toHaveLength(2);
  });
  it("retains the paid scene and recovers a failed export without a second image call", async () => {
    const generated = await sharp({ create: { width: 1280, height: 960, channels: 3, background: "red" } }).png().toBuffer();
    const fetcher = vi.fn().mockImplementation(async (url: string) => new Response(JSON.stringify(url.includes("images/edits") ? { data: [{ b64_json: generated.toString("base64") }] } : { output: [{ content: [{ type: "output_text", text: JSON.stringify({ product: 4, grounding: 4, scene: 5, summary: "Good", issues: [], fatal: false }) }] }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher); memory.failEnhancedWrite = true;
    const started = await createComposition(project, [placement], true); await runEnhancement(project, started.job!.id);
    let saved = await readComposition(project); expect(saved.error).toContain("Temporary write failure"); expect(saved.versions[0].rawFile).toBeTruthy(); expect(saved.versions[0].enhancedFile).toBeUndefined();
    const recovery = await recoverComposition(project, saved.versions[0].id); await runEnhancement(project, recovery.job!.id);
    saved = await readComposition(project); expect(saved.error).toBeUndefined(); expect(saved.versions[0].enhancedFile).toBeTruthy(); expect(fetcher.mock.calls.filter(c => c[0].includes("images/edits"))).toHaveLength(1);
  });
  it("keeps existing spot versions and their files when creating a full-image version", async () => {
    const state = await readComposition(project);
    const old = { id: "44444444-4444-4444-8444-444444444444", engine: 4, createdAt: new Date().toISOString(), placements: [placement], basicFile: "old-basic.png", enhancedFile: "old-spot.png", width: 1280, height: 960 };
    state.versions.push(old); await writeComposition(project.id,state);
    memory.files.set('compositions/'+project.id+'/old-spot.png',Buffer.from('saved spot output'));
    const saved = await createComposition(project,[placement],false);
    expect(saved.versions).toHaveLength(2); expect(saved.versions[0]).toEqual(old); expect(saved.versions[1].engine).toBe(5);
    expect((await readCompositionFile(project.id,'old-spot.png')).toString()).toBe('saved spot output');
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


describe("perspective and isolation", () => {
  it("keeps the chosen ground anchor fixed when turning or flipping a product", () => {
    for (const flip of [false, true]) for (const yaw of [-60, 0, 60]) {
      const revision = { width: 400, height: 600, contactPoint: { x: .17, y: .96 } };
      const geometry = placementGeometry({ ...placement, flip, yaw }, revision, 1280, 960);
      const point = projectedPoint(geometry, revision.contactPoint);
      expect(point.x).toBeCloseTo(placement.x * 1280); expect(point.y).toBeCloseTo(placement.y * 960);
    }
    expect(() => parsePlacements([{ ...placement, yaw: 90 }])).toThrow();
  });
  it("finds separate bases and measures container height without counting foliage", async () => {
    const bytes = await sharp(Buffer.from('<svg width="200" height="300"><rect x="20" y="160" width="60" height="130" fill="white"/><rect x="110" y="150" width="70" height="125" fill="white"/><circle cx="100" cy="80" r="65" fill="green"/></svg>')).png().toBuffer();
    const contacts = await findGroundContacts(bytes); expect(contacts).toHaveLength(2); expect(contacts[0].y).toBeGreaterThan(contacts[1].y);
    expect(await measureContainerFraction(bytes)).toBeGreaterThan(.4); expect(await measureContainerFraction(bytes)).toBeLessThan(.55);
  });
  it("rejects a generated solid background and an empty alpha layer", async () => {
    const source = await sharp({ create: { width: 100, height: 100, channels: 3, background: "blue" } }).png().toBuffer();
    const empty = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    await expect(composeInstallation(source, source, Buffer.alloc(10000,255), Buffer.alloc(10000,255),100,100,100)).rejects.toThrow("opaque");
    await expect(composeInstallation(source, empty, Buffer.alloc(10000,255), Buffer.alloc(10000,255),100,100,100)).rejects.toThrow("empty");
  });
});


describe("scene integration", () => {
  it("keeps the full output byte for byte and rejects unexpected dimensions", async () => {
    const generated = await sharp({ create: { width: 100, height: 100, channels: 3, background: "red" } }).png().toBuffer();
    expect((await completeScene(generated,100,100)).enhanced.equals(generated)).toBe(true);
    await expect(completeScene(generated,200,100)).rejects.toThrow("unexpected scene dimensions");
  });
  it("allows complete perspective reconstruction inside the region while preserving the scene and attribution outside", async () => {
    const width = 100, height = 100;
    const original = await sharp({ create: { width, height, channels: 4, background: "blue" } }).png().toBuffer();
    const generated = await sharp({ create: { width, height, channels: 3, background: "red" } }).png().toBuffer();
    const region = Buffer.alloc(width * height);
    for (let y = 20; y < height; y++) for (let x = 25; x < 75; x++) region[y * width + x] = 255;
    const result = await composeScene(original, generated, region, width, height);
    const pixels = await sharp(result.enhanced).ensureAlpha().raw().toBuffer();
    const pixel = (x: number, y: number) => [...pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 3)];
    expect(pixel(50,50)).toEqual([255,0,0]); expect(pixel(10,50)).toEqual([0,0,255]); expect(pixel(50,99)).toEqual([0,0,255]);
    const mask = await sharp(await sceneEditMask(region,width,height)).ensureAlpha().raw().toBuffer();
    expect(mask[(50*width+50)*4+3]).toBe(0); expect(mask[(50*width+10)*4+3]).toBe(255);
  });
});
