// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { createAsset, assetFile, readStoredAsset, readAsset, updateAsset, writeAsset, writeAssetFile } from "./planters/store";
import { queueExtraction, saveManualRevision } from "./planters/extraction";
import { getProject, listProjects, storeFrontage, storeProject, parseProject } from "./project-store";
import { prepareUpload, readUpload } from "./uploads";
import { requireLocalMutation, requireMutation } from "./planters/http";
import { revisionFile } from "./planters/types";
import type { Project } from "./projects";
import { GET as libraryGET } from "@/app/api/planters/route";
import { GET as fileGET } from "@/app/api/planters/[id]/files/[file]/route";

type Row = { id: string; data: unknown; version?: number; [key: string]: unknown };
let tables: Record<string, Map<string, Row>>;
let files: Map<string, Buffer>;
let source: Buffer;
let calls: string[];

beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://storage-test.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret-never-sent");
  vi.stubEnv("SUPABASE_STORAGE_BUCKET", "test-assets");
  vi.stubEnv("OPENAI_API_KEY", "test-never-sent");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("ENABLE_HOSTED_EXTRACTION", "false");
  tables = { planters: new Map(), projects: new Map(), renders: new Map() };
  files = new Map(); calls = [];
  source = await sharp({ create: { width: 160, height: 240, channels: 3, background: "#61734d" } }).png().toBuffer();
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.origin !== "https://storage-test.supabase.co") throw new Error(`Unexpected external call: ${url.origin}`);
    calls.push(url.pathname);
    const method = init?.method || "GET";
    const headers = new Headers(init?.headers);
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = tables[url.pathname.split("/").at(-1)!];
      const matches = [...table.values()].filter(row => [...url.searchParams].every(([key, value]) => !value.startsWith("eq.") || String(row[key]) === value.slice(3)));
      let result: Row[] = matches;
      if (method === "POST") {
        const row = JSON.parse(init!.body as string) as Row;
        const ignore = headers.get("prefer")?.includes("ignore-duplicates");
        if (table.has(row.id) && ignore) result = [];
        else if (table.has(row.id) && !headers.get("prefer")?.includes("merge-duplicates")) return Response.json({ code: "23505", message: "Already exists" }, { status: 409 });
        else { table.set(row.id, row); result = [row]; }
      }
      if (method === "PATCH") {
        const patch = JSON.parse(init!.body as string);
        result = matches.map(row => ({ ...row, ...patch }));
        for (const row of result) table.set(row.id, row);
      }
      const single = headers.get("accept")?.includes("vnd.pgrst.object");
      return Response.json(single ? result[0] ?? null : result);
    }
    const prefix = "/storage/v1/object/";
    if (url.pathname.startsWith(prefix)) {
      const relative = decodeURIComponent(url.pathname.slice(prefix.length));
      if (relative.startsWith("upload/sign/")) return Response.json({ url: `/object/upload/sign/${relative.slice(12)}?token=test-token` });
      if (relative.startsWith("sign/")) return Response.json({ signedURL: `/object/sign/${relative.slice(5)}?token=test-token` });
      if (relative.startsWith("authenticated/")) {
        const bytes = files.get(relative.slice(14));
        return bytes ? new Response(new Uint8Array(bytes)) : Response.json({ message: "Not found" }, { status: 404 });
      }
      if (method === "GET") {
        const bytes = files.get(relative);
        return bytes ? new Response(new Uint8Array(bytes)) : Response.json({ message: "Not found" }, { status: 404 });
      }
      if (method === "POST" || method === "PUT") {
        const bytes = init!.body instanceof Blob ? Buffer.from(await init!.body.arrayBuffer()) : Buffer.from(init!.body as Uint8Array);
        if (files.has(relative) && headers.get("x-upsert") !== "true") return Response.json({ message: "Already exists" }, { status: 409 });
        files.set(relative, bytes);
        return Response.json({ Key: relative });
      }
    }
    throw new Error(`Unexpected storage operation: ${method} ${url.pathname}`);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Supabase-backed shared library", () => {
  it("stores original files and all metadata on Vercel, and serves signed image redirects", async () => {
    const asset = await createAsset(source, "reference.png", "Test arrangement");
    expect(tables.planters.size).toBe(1);
    expect(await assetFile(asset.id, asset.originalFile)).toEqual(source);
    const response = await libraryGET();
    expect(await response.json()).toMatchObject({ storage: "supabase", uploadsAvailable: true, configured: false, assets: [{ id: asset.id }] });
    const file = await fileGET(new Request(`https://demo.example/api/planters/${asset.id}/files/source.png`), { params: Promise.resolve({ id: asset.id, file: "source.png" }) });
    expect(file.status).toBe(307);
    expect(file.headers.get("location")).toContain(`/planters/${asset.id}/source.png`);
    await expect(assetFile(asset.id, "../secret.txt")).rejects.toThrow("File not found");
  });

  it("uses compare-and-swap to reject stale writes and competing paid jobs", async () => {
    const asset = await createAsset(source, "reference.png", "Initial");
    const first = await readStoredAsset(asset.id), stale = await readStoredAsset(asset.id);
    first.name = "Newer"; await writeAsset(first);
    stale.name = "Stale";
    await expect(writeAsset(stale)).rejects.toThrow("changed in another session");
    expect((await readAsset(asset.id)).name).toBe("Newer");
    const settings = { target: "Test", mode: "extract" as const, quality: "medium" as const };
    const results = await Promise.allSettled([queueExtraction(asset.id, settings), queueExtraction(asset.id, settings)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(calls.every(call => call.startsWith("/storage/") || call.startsWith("/rest/"))).toBe(true);
  });

  it("does not mistake another serverless instance for an interrupted extraction", async () => {
    const asset = await createAsset(source, "reference.png", "Shared");
    asset.status = "processing";
    asset.job = { id: "job", owner: "different-instance", processId: 9999999, startedAt: new Date().toISOString(), settings: { target: "", mode: "extract", quality: "medium" } };
    await writeAsset(asset);
    expect((await readAsset(asset.id)).status).toBe("processing");
    asset.job.startedAt = new Date(Date.now() - 11 * 60_000).toISOString();
    await writeAsset(asset);
    expect((await readAsset(asset.id)).status).toBe("error");
  });

  it("keeps approved cutouts, masks, placement data and manual revisions in shared storage", async () => {
    const asset = await createAsset(source, "reference.png", "Shared");
    const cutout = await sharp({ create: { width: 160, height: 240, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: Buffer.from('<svg width="160" height="240"><rect x="50" y="50" width="60" height="150" fill="#61734d"/></svg>') }]).png().toBuffer();
    const parent = { id: "11111111-1111-4111-8111-111111111111", createdAt: new Date().toISOString(), kind: "ai" as const, settings: { target: "Test", mode: "extract" as const, quality: "medium" as const }, model: "test", prompt: "Test", width: 160, height: 240, contactPoint: { x: 0.5, y: 0.9 }, transparency: 0.6, warnings: [] };
    await writeAssetFile(asset.id, revisionFile(parent.id), cutout);
    await writeAssetFile(asset.id, revisionFile(parent.id, "mask"), source);
    asset.revisions.push(parent); asset.status = "review"; await writeAsset(asset);
    const approved = await updateAsset(asset.id, { approvedRevisionId: parent.id, contactPoint: { x: 0.4, y: 0.95 } });
    expect(approved.approvedRevisionId).toBe(parent.id);
    expect(await assetFile(asset.id, "planter.png")).toEqual(cutout);
    expect(JSON.parse((await assetFile(asset.id, "placement.json")).toString()).contactPoint).toEqual({ x: 0.4, y: 0.95 });
    const manual = await saveManualRevision(asset.id, parent.id, cutout);
    expect(manual.revisions).toHaveLength(2);
    expect(manual.revisions[1].kind).toBe("manual");
    expect(await assetFile(asset.id, "original.png")).toEqual(source);
  });

  it("persists project configuration and uploaded frontage without contacting image providers", async () => {
    const project: Project = { id: "osm-test", title: "Test venue", venueId: "node/1", source: "openstreetmap", sourceUrl: "https://www.openstreetmap.org/node/1", createdAt: new Date().toISOString(), address: "Test street", category: "cafe", configuration: { planter: "trough", quantity: 2, placement: "both" } };
    await storeProject(project);
    expect(await listProjects()).toEqual([project]);
    await storeProject({ ...project, title: "Old browser copy" }, true);
    expect((await getProject(project.id)).title).toBe("Test venue");
    const uploaded = await storeFrontage(project.id, source, "front.png");
    expect(uploaded.image).toMatchObject({ provider: "uploaded", originalFilename: "front.png", width: 160, height: 240 });
    await storeProject({ ...uploaded, configuration: { planter: "classic", quantity: 1, placement: "left" } });
    expect((await getProject(project.id)).configuration?.quantity).toBe(1);
    expect(calls.some(call => call.includes("storefronts/osm-test/"))).toBe(true);
    expect(() => parseProject({ ...uploaded, image: { ...uploaded.image, storagePath: "planters/secret.png" } })).toThrow("Invalid saved image");
  });

  it("rejects tampered, cross-purpose or expired upload receipts", async () => {
    const prepared = await prepareUpload({ kind: "planter", filename: "source.png", contentType: "image/png", size: source.length });
    files.set(`test-assets/${prepared.upload.path}`, source);
    expect((await readUpload("planter", prepared.upload)).bytes).toEqual(source);
    await expect(readUpload("frontage", prepared.upload)).rejects.toThrow("Invalid upload receipt");
    await expect(readUpload("planter", { ...prepared.upload, path: "planters/secret.png" })).rejects.toThrow("invalid");
    await expect(readUpload("planter", { ...prepared.upload, expires: Date.now() - 1 })).rejects.toThrow("expired");
  });

  it("permits same-origin hosted saves but blocks cross-origin writes and hosted paid extraction", () => {
    const request = new Request("https://demo.example/api/planters", { headers: { origin: "https://demo.example" } });
    expect(() => requireMutation(request)).not.toThrow();
    expect(() => requireLocalMutation(request)).toThrow("Paid extraction is disabled");
    expect(() => requireMutation(new Request(request.url, { headers: { origin: "https://attacker.example" } }))).toThrow("directly");
  });
});
