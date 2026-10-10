// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { createAsset, assetFile, readStoredAsset, readAsset, updateAsset, writeAsset, writeAssetFile } from "./planters/store";
import { queueExtraction, saveManualRevision } from "./planters/extraction";
import { getProject, listProjects, storeFrontage, storeProject, parseProject, updateProjectDetails } from "./project-store";
import { removePlanter, removeProject } from "./library-management";
import { removeAssetFolder } from "./storage";
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
      if (method === "DELETE") for (const row of matches) table.delete(row.id);
      const single = headers.get("accept")?.includes("vnd.pgrst.object");
      return Response.json(single ? result[0] ?? null : result);
    }
    const prefix = "/storage/v1/object/";
    if (url.pathname.startsWith(prefix)) {
      const relative = decodeURIComponent(url.pathname.slice(prefix.length));
      if (relative === "list/test-assets") {
        const body = JSON.parse(init!.body as string);
        const names = [...files.keys()].filter(key => key.startsWith(`test-assets/${body.prefix}/`)).map(key => key.slice(`test-assets/${body.prefix}/`.length)).sort();
        return Response.json(names.slice(body.offset, body.offset + body.limit).map(name => ({ id: name, name })));
      }
      if (relative === "test-assets" && method === "DELETE") {
        for (const key of JSON.parse(init!.body as string).prefixes) files.delete(`test-assets/${key}`);
        return Response.json([]);
      }
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
  const project: Project = { id: "google-library-test", title: "Test cafe", venueId: "test-place", source: "google", sourceUrl: "https://maps.google.com", createdAt: "2026-10-10" };

  it("edits project details without changing image, venue identity or configuration", async () => {
    await storeProject(project);
    const saved = await storeFrontage(project.id, source, "front.png");
    const updated = await updateProjectDetails(project.id, { title: " New concept ", address: "Soho", category: "Cafe", notes: "Pair beside the door" });
    expect(updated).toMatchObject({ title: "New concept", image: saved.image, venueId: saved.venueId, notes: "Pair beside the door" });
    await expect(updateProjectDetails(project.id, { image: undefined })).rejects.toThrow("Only the project");
    await expect(updateProjectDetails(project.id, { title: " " })).rejects.toThrow("Invalid project");
    await expect(updateProjectDetails(project.id, { notes: "a".repeat(2001) })).rejects.toThrow("2,000");
    expect((await getProject(project.id)).title).toBe("New concept");
  });

  it("saves planter notes without extraction or replacement of original images", async () => {
    const asset = await createAsset(source, "reference.png", "Original name");
    const updated = await updateAsset(asset.id, { name: "Renamed", notes: " Terracotta pair " });
    expect(updated).toMatchObject({ name: "Renamed", notes: "Terracotta pair", revisions: [] });
    expect(await assetFile(asset.id, asset.originalFile)).toEqual(source);
    await expect(updateAsset(asset.id, { notes: "a".repeat(2001) })).rejects.toThrow("2,000");
    expect(calls.every(call => call.startsWith("/storage/") || call.startsWith("/rest/"))).toBe(true);
  });

  it("deletes one project and all its source/composite files, leaving planters and other projects intact", async () => {
    await storeProject(project);
    await storeProject({ ...project, id: "another-project" });
    await storeFrontage(project.id, source, "front.png");
    files.set(`test-assets/compositions/${project.id}/state.json`, Buffer.from(JSON.stringify({ draft: [], versions: [] })));
    files.set(`test-assets/compositions/${project.id}/old-enhanced.png`, source);
    files.set("test-assets/storefronts/another-project/source.png", source);
    const planter = await createAsset(source, "reference.png", "Keep me");
    expect(await removeProject(project.id)).toEqual({ deleted: true });
    await expect(getProject(project.id)).rejects.toMatchObject({ status: 404 });
    expect([...files.keys()].some(key => key.includes(`/${project.id}/`))).toBe(false);
    expect(await assetFile(planter.id, planter.originalFile)).toEqual(source);
    expect(await getProject("another-project")).toMatchObject({ id: "another-project" });
    expect(files.has("test-assets/storefronts/another-project/source.png")).toBe(true);
  });

  it("blocks deleting a project while an enhancement is running", async () => {
    await storeProject(project);
    files.set(`test-assets/compositions/${project.id}/state.json`, Buffer.from(JSON.stringify({ job: { id: "busy" }, draft: [], versions: [] })));
    await expect(removeProject(project.id)).rejects.toMatchObject({ status: 409 });
    expect(await getProject(project.id)).toBeDefined();
  });

  it("blocks deleting planters referenced by drafts or historic versions, even with a changed frontage", async () => {
    const asset = await createAsset(source, "reference.png", "In use");
    await storeProject(project);
    const stateKey = `test-assets/compositions/${project.id}/state.json`;
    for (const state of [{ sourceKey: "old-frontage", draft: [{ assetId: asset.id }], versions: [] }, { sourceKey: "old-frontage", draft: [], versions: [{ placements: [{ assetId: asset.id }] }] }]) {
      files.set(stateKey, Buffer.from(JSON.stringify(state)));
      await expect(removePlanter(asset.id)).rejects.toThrow("used by");
      expect(await assetFile(asset.id, asset.originalFile)).toEqual(source);
    }
    await removeProject(project.id);
    expect(await removePlanter(asset.id)).toEqual({ deleted: true });
    await expect(readAsset(asset.id)).rejects.toMatchObject({ status: 404 });
    expect([...files.keys()].some(key => key.includes(`/planters/${asset.id}/`))).toBe(false);
  });

  it("blocks deleting a processing planter without removing its files", async () => {
    const asset = await createAsset(source, "reference.png", "Busy");
    asset.status = "processing"; await writeAsset(asset);
    await expect(removePlanter(asset.id)).rejects.toMatchObject({ status: 409 });
    expect(await assetFile(asset.id, asset.originalFile)).toEqual(source);
  });

  it("refuses deletion when composition references cannot be read due to a storage failure", async () => {
    const asset = await createAsset(source, "reference.png", "Keep me safe");
    await storeProject(project);
    const fetcher = vi.mocked(fetch), original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) => {
      if (String(input).includes(`/compositions/${project.id}/state.json`)) return Response.json({ message: "Storage unavailable" }, { status: 503 });
      return original(input, init);
    });
    await expect(removePlanter(asset.id)).rejects.toMatchObject({ status: 502 });
    await expect(removeProject(project.id)).rejects.toMatchObject({ status: 502 });
    expect(tables.planters.has(asset.id)).toBe(true); expect(tables.projects.has(project.id)).toBe(true);
  });

  it("rejects a project edit when its saved data changes during the update", async () => {
    await storeProject(project);
    const fetcher = vi.mocked(fetch), original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) => {
      if (String(input).includes("/rest/v1/projects") && init?.method === "PATCH") {
        const row = tables.projects.get(project.id)!;
        row.updated_at = "2026-10-11T00:00:00.000Z";
        row.data = { ...project, title: "Changed elsewhere" };
      }
      return original(input, init);
    });
    await expect(updateProjectDetails(project.id, { title: "Stale name" })).rejects.toMatchObject({ status: 409 });
    expect((await getProject(project.id)).title).toBe("Changed elsewhere");
  });

  it("cleans up every page of a large asset folder and never accepts a broad prefix", async () => {
    for (let index = 0; index < 205; index++) files.set(`test-assets/planters/test-folder/file-${index}.png`, source);
    files.set("test-assets/planters/other-folder/keep.png", source);
    await removeAssetFolder("planters/test-folder");
    expect([...files.keys()]).toEqual(["test-assets/planters/other-folder/keep.png"]);
    await expect(removeAssetFolder("planters")).rejects.toThrow("Invalid asset folder");
    await expect(removeAssetFolder("planters/../other-folder")).rejects.toThrow("Invalid asset folder");
  });

  it("reports orphaned-file cleanup separately after a successful database deletion", async () => {
    await storeProject(project);
    const fetcher = vi.mocked(fetch), original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) => {
      if (String(input).includes("/storage/v1/object/list/")) return Response.json({ message: "Storage unavailable" }, { status: 503 });
      return original(input, init);
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await removeProject(project.id)).toMatchObject({ deleted: true, warning: expect.stringContaining("cleanup") });
    expect(tables.projects.has(project.id)).toBe(false);
    log.mockRestore();
  });

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
