// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createAsset, readAsset, updateAsset, assetFile, assetDirectory, writeAsset, listAssets } from "./store";
import { queueExtraction, runExtraction, saveManualRevision } from "./extraction";
import { prepareCutout, normaliseSource } from "./images";
import { extractionPrompt, parseSettings } from "./validation";
import { revisionFile, type ExtractionSettings } from "./types";
import { requireLocalMutation } from "./http";

const workspace = process.cwd();
const cacheRoot = path.resolve(workspace, ".cache");
let temporary: string;
let source: Buffer;
let cutout: Buffer;
const settings: ExtractionSettings = { target: "Foreground pair with all its plants", mode: "reconstruct", quality: "medium" };

beforeEach(async () => {
  await mkdir(cacheRoot, { recursive: true });
  temporary = await mkdtemp(path.join(cacheRoot, "planter-test-"));
  vi.spyOn(process, "cwd").mockReturnValue(temporary);
  vi.stubEnv("OPENAI_API_KEY", "test-key-never-sent");
  vi.stubEnv("OPENAI_IMAGE_MODEL", "gpt-image-1.5");
  source = await sharp({ create: { width: 160, height: 240, channels: 3, background: "#61734d" } }).png().toBuffer();
  cutout = await sharp({ create: { width: 160, height: 240, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: Buffer.from('<svg width="160" height="240"><rect x="55" y="70" width="50" height="130" fill="#b78555"/><ellipse cx="80" cy="60" rx="35" ry="30" fill="#49845b"/></svg>') }]).png().toBuffer();
});

afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
  if (!path.resolve(temporary).startsWith(cacheRoot + path.sep)) throw new Error("Refusing to remove a test folder outside the workspace cache.");
  await rm(temporary, { recursive: true, force: true });
});

function mockImageApi() {
  return vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: cutout.toString("base64") }], usage: { total_tokens: 12 } }), { headers: { "Content-Type": "application/json" } })));
}

describe("planter extraction and durable review", () => {
  it("rejects unreadable uploads and opaque outputs, including fake checkerboards", async () => {
    await expect(normaliseSource(Buffer.from("not an image"))).rejects.toThrow("could not be read");
    await expect(prepareCutout(source)).rejects.toThrow("no transparency");
    const opaque = await sharp(source).ensureAlpha().png().toBuffer();
    await expect(prepareCutout(opaque)).rejects.toThrow("opaque background");
  });

  it("exports an alpha mask matching the cropped PNG and estimates ground contact", async () => {
    const result = await prepareCutout(cutout);
    const mask = await sharp(result.mask).raw().toBuffer({ resolveWithObject: true });
    const rgba = await sharp(result.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(result.transparency).toBeGreaterThan(0.5);
    expect(result.contactPoint.x).toBeCloseTo(0.5, 1);
    expect(result.contactPoint.y).toBeGreaterThan(0.8);
    expect(mask.info.width).toBe(rgba.info.width);
    for (let pixel = 0; pixel < rgba.info.width * rgba.info.height; pixel++) expect(mask.data[pixel * mask.info.channels]).toBe(rgba.data[pixel * 4 + 3]);
  });

  it("persists source, versions, approval and placement without modifying the original", async () => {
    mockImageApi();
    const asset = await createAsset(source, "my-photo.png", "Garden pair");
    const queued = await queueExtraction(asset.id, { ...settings, selection: { x: 0.1, y: 0.1, width: 0.7, height: 0.8 } });
    await runExtraction(asset.id, queued.job!.id);
    const reviewed = await readAsset(asset.id);
    expect(reviewed.status).toBe("review");
    expect(reviewed.revisions).toHaveLength(1);
    const request = vi.mocked(fetch).mock.calls[0];
    const form = request[1]!.body as FormData;
    expect(form.getAll("image[]")).toHaveLength(2);
    expect(form.get("background")).toBe("transparent");
    expect(form.get("quality")).toBe("medium");
    expect(form.get("input_fidelity")).toBe("high");
    const revision = reviewed.revisions[0];
    const approved = await updateAsset(asset.id, { approvedRevisionId: revision.id, contactPoint: { x: 0.4, y: 0.9 } });
    expect(approved.status).toBe("approved");
    expect(await assetFile(asset.id, "planter.png")).toEqual(await assetFile(asset.id, revisionFile(revision.id)));
    expect(JSON.parse((await assetFile(asset.id, "placement.json")).toString()).contactPoint).toEqual({ x: 0.4, y: 0.9 });
    expect(await assetFile(asset.id, "original.png")).toEqual(source);
    expect(await listAssets()).toHaveLength(1);
    await expect(assetFile(asset.id, "../secret.txt")).rejects.toThrow("File not found");
  });

  it("prevents duplicate paid jobs and never automatically retries a billing failure", async () => {
    const api = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "No credits remaining" } }), { status: 429 }));
    vi.stubGlobal("fetch", api);
    const asset = await createAsset(source, "photo.png", "Test");
    const results = await Promise.allSettled([queueExtraction(asset.id, settings), queueExtraction(asset.id, settings)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const queued = await readAsset(asset.id);
    await runExtraction(asset.id, queued.job!.id);
    const failed = await readAsset(asset.id);
    expect(failed.status).toBe("error");
    expect(failed.error).toContain("No credits remaining");
    expect(api).toHaveBeenCalledTimes(1);
    expect(await assetFile(asset.id, "source.png")).toBeTruthy();
  });

  it("keeps the approved export when a new attempt fails and brush edits create a new version", async () => {
    mockImageApi();
    const asset = await createAsset(source, "photo.png", "Test");
    let queued = await queueExtraction(asset.id, settings);
    await runExtraction(asset.id, queued.job!.id);
    const first = (await readAsset(asset.id)).revisions[0];
    await updateAsset(asset.id, { approvedRevisionId: first.id });
    const firstPng = await assetFile(asset.id, "planter.png");
    const manual = await saveManualRevision(asset.id, first.id, firstPng);
    expect(manual.revisions).toHaveLength(2);
    expect(manual.revisions[1].kind).toBe("manual");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(await assetFile(asset.id, "planter.png")).toEqual(firstPng);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "provider unavailable" } }), { status: 503 }));
    queued = await queueExtraction(asset.id, settings);
    await runExtraction(asset.id, queued.job!.id);
    expect(await assetFile(asset.id, "planter.png")).toEqual(firstPng);
  });

  it("recovers an interrupted process without making a fresh paid request", async () => {
    const asset = await createAsset(source, "photo.png", "Test");
    asset.status = "processing";
    asset.job = { id: "abandoned", owner: "a-previous-server", startedAt: new Date().toISOString(), settings };
    await writeAsset(asset);
    const recovered = await readAsset(asset.id);
    expect(recovered.status).toBe("error");
    expect(recovered.job).toBeUndefined();
    expect(JSON.parse(await readFile(path.join(assetDirectory(asset.id), "asset.json"), "utf8")).status).toBe("error");
  });

  it("requires a configured key before creating a job", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const asset = await createAsset(source, "photo.png", "Test");
    await expect(queueExtraction(asset.id, settings)).rejects.toThrow("Set OPENAI_API_KEY");
    expect((await readAsset(asset.id)).status).toBe("uploaded");
  });
});

describe("selection and local request validation", () => {
  it("rejects coordinates outside the original photo", () => {
    expect(() => parseSettings({ ...settings, selection: { x: 0.8, y: 0, width: 0.5, height: 0.5 } })).toThrow("within the image");
    expect(() => parseSettings({ ...settings, quality: "high" })).toThrow("Only medium");
    expect(() => parseSettings({ ...settings, quality: "max" })).toThrow("Only medium");
    expect(extractionPrompt({ ...settings, mode: "extract" })).toContain("Do not redesign");
    expect(extractionPrompt(settings)).toContain("Reconstruct portions");
  });

  it("rejects cross-origin writes to the paid local endpoint", () => {
    expect(() => requireLocalMutation(new Request("http://localhost:3100/api/planters", { headers: { origin: "https://unrelated.example" } }))).toThrow("directly");
    expect(() => requireLocalMutation(new Request("http://localhost:3100/api/planters", { headers: { origin: "http://localhost:3100" } }))).not.toThrow();
  });
});
