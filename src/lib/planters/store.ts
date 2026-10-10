import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { normaliseSource } from "./images";
import type { PlanterAsset, PlanterRevision, ContactPoint } from "./types";
import { revisionFile } from "./types";
import { parseSettings, PlanterError, validId } from "./validation";

const state = globalThis as typeof globalThis & { planterRuntime?: { owner: string; locks: Map<string, Promise<unknown>> } };
export const runtime = state.planterRuntime ??= { owner: randomUUID(), locks: new Map() };
export function outputRoot() { return path.join(process.cwd(), "output", "planters"); }
export function assetDirectory(id: string) { return path.join(outputRoot(), validId(id)); }

export async function locked<T>(id: string, action: () => Promise<T>): Promise<T> {
  const previous = runtime.locks.get(id) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(action);
  runtime.locks.set(id, current);
  try { return await current; } finally { if (runtime.locks.get(id) === current) runtime.locks.delete(id); }
}

export async function writeAsset(asset: PlanterAsset) {
  const dir = assetDirectory(asset.id);
  const temporary = path.join(dir, `.asset-${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(asset, null, 2));
  await rename(temporary, path.join(dir, "asset.json"));
}

export async function readStoredAsset(id: string): Promise<PlanterAsset> {
  let asset: PlanterAsset;
  try { asset = JSON.parse(await readFile(path.join(assetDirectory(id), "asset.json"), "utf8")); }
  catch (error) {
    if (error instanceof PlanterError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new PlanterError("Planter not found.", 404);
    throw error;
  }
  return asset;
}

function processAlive(pid?: number) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; }
}

export async function readAsset(id: string): Promise<PlanterAsset> {
  const asset = await readStoredAsset(id);
  if (asset.status === "processing" && asset.job && ((asset.job.owner !== runtime.owner && !processAlive(asset.job.processId)) || Date.now() - Date.parse(asset.job.startedAt) > 10 * 60_000)) {
    return locked(id, async () => {
      const current = JSON.parse(await readFile(path.join(assetDirectory(id), "asset.json"), "utf8")) as PlanterAsset;
      if (current.status === "processing" && current.job?.id === asset.job?.id) {
        current.status = "error";
        current.error = "Extraction was interrupted or timed out. Check existing results before explicitly retrying; no automatic paid retry was made.";
        delete current.job;
        await writeAsset(current);
      }
      return current;
    });
  }
  return asset;
}

export async function listAssets() {
  await mkdir(outputRoot(), { recursive: true });
  const entries = await readdir(outputRoot(), { withFileTypes: true });
  const results = await Promise.all(entries.filter(e => e.isDirectory() && /^[a-f0-9-]{36}$/.test(e.name)).map(async e => {
    try { return await readAsset(e.name); } catch { return null; }
  }));
  return results.filter((a): a is PlanterAsset => a !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createAsset(bytes: Buffer, originalFilename: string, name: string) {
  const source = await normaliseSource(bytes);
  const now = new Date().toISOString();
  const asset: PlanterAsset = {
    id: randomUUID(), name: name.trim().slice(0, 120) || path.parse(originalFilename).name.slice(0, 120) || "Untitled planter",
    createdAt: now, updatedAt: now, originalFilename: path.basename(originalFilename).slice(0, 200), originalFile: `original.${source.extension}`,
    source: { width: source.width, height: source.height }, status: "uploaded", revisions: [],
  };
  const dir = assetDirectory(asset.id);
  await mkdir(dir, { recursive: true });
  await Promise.all([writeFile(path.join(dir, asset.originalFile), bytes), writeFile(path.join(dir, "source.png"), source.data)]);
  await writeAsset(asset);
  return asset;
}

export async function updateAsset(id: string, value: unknown) {
  if (!value || typeof value !== "object") throw new PlanterError("Invalid update.");
  const body = value as Record<string, unknown>;
  // Read before entering the lock so interrupted jobs can be recovered safely.
  await readAsset(id);
  return locked(id, async () => {
    const asset = await readStoredAsset(id);
    if (asset.status === "processing") throw new PlanterError("Wait for the extraction to finish before changing this asset.", 409);
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 120) throw new PlanterError("Use a name between 1 and 120 characters.");
      asset.name = body.name.trim();
    }
    if (body.lastSettings !== undefined) asset.lastSettings = parseSettings(body.lastSettings);
    if (body.approvedRevisionId !== undefined) {
      const revision = asset.revisions.find(r => r.id === body.approvedRevisionId);
      if (!revision) throw new PlanterError("Select an existing result to approve.");
      if (body.contactPoint !== undefined) {
        const p = body.contactPoint as ContactPoint;
        if (!p || ![p.x, p.y].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) throw new PlanterError("Invalid ground contact point.");
        revision.contactPoint = { x: p.x, y: p.y };
      }
      await exportApproved(asset, revision);
      asset.approvedRevisionId = revision.id;
      asset.status = "approved";
      delete asset.error;
    }
    if (body.name !== undefined && asset.approvedRevisionId && body.approvedRevisionId === undefined) {
      const approved = asset.revisions.find(r => r.id === asset.approvedRevisionId);
      if (approved) await exportApproved(asset, approved);
    }
    asset.updatedAt = new Date().toISOString();
    await writeAsset(asset);
    return asset;
  });
}

async function exportApproved(asset: PlanterAsset, revision: PlanterRevision) {
  const dir = assetDirectory(asset.id);
  await Promise.all([
    copyFile(path.join(dir, revisionFile(revision.id)), path.join(dir, "planter.png")),
    copyFile(path.join(dir, revisionFile(revision.id, "mask")), path.join(dir, "mask.png")),
  ]);
  await writeFile(path.join(dir, "placement.json"), JSON.stringify({
    name: asset.name, revisionId: revision.id, width: revision.width, height: revision.height,
    contactPoint: revision.contactPoint, physicalHeightMetres: null,
    reconstructed: revision.settings.mode === "reconstruct", kind: revision.kind,
    model: revision.model, sourceFilename: asset.originalFilename,
  }, null, 2));
}

export async function assetFile(id: string, filename: string) {
  const asset = await readAsset(id);
  const allowed = ["source.png", asset.originalFile, "asset.json", ...(asset.approvedRevisionId ? ["planter.png", "mask.png", "placement.json"] : []), ...asset.revisions.flatMap(r => [revisionFile(r.id), revisionFile(r.id, "mask"), revisionFile(r.id, "raw")])];
  if (!allowed.includes(filename)) throw new PlanterError("File not found.", 404);
  return readFile(path.join(assetDirectory(id), filename));
}
