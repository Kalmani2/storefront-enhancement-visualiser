import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getFile, putFile, storageConfigured } from "../storage";
import { projectId } from "../project-store";
import { PlanterError, validId } from "../planters/validation";
import type { Project } from "../projects";
import type { CompositionState, Placement } from "./types";

export function sourceKey(project: Project) {
  if ((project.image?.provider === "google-street-view" || project.image?.provider === "uploaded") && project.image.storagePath) return project.image.storagePath;
  throw new PlanterError("Save the selected storefront image first.", 409);
}

function key(id: string, file: string) {
  projectId(id);
  if (!/^[a-zA-Z0-9_-]+\.(png|json)$/.test(file)) throw new PlanterError("Invalid composition file.");
  return `compositions/${id}/${file}`;
}

export async function writeCompositionFile(id: string, file: string, bytes: Buffer) {
  const name = key(id, file);
  if (storageConfigured()) return putFile(name, bytes, file === "state.json" || file.endsWith("-attempt.json"));
  const target = path.join(process.cwd(), "output", name);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes); await rename(temporary, target);
}

export async function readCompositionFile(id: string, file: string) {
  const name = key(id, file);
  if (storageConfigured()) return getFile(name);
  return readFile(path.join(process.cwd(), "output", name));
}

export async function readComposition(project: Project): Promise<CompositionState> {
  const source = sourceKey(project);
  let state: CompositionState;
  try { state = JSON.parse((await readCompositionFile(project.id, "state.json")).toString()); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error instanceof PlanterError && error.status === 404)) return { sourceKey: source, draft: [], calibrations: {}, versions: [] };
    throw error;
  }
  if (state.sourceKey !== source) return { sourceKey: source, draft: [], calibrations: {}, versions: [] };
  if (state.job && Date.now() - Date.parse(state.job.startedAt) > 7 * 60_000) {
    delete state.job; state.error = "Enhancement was interrupted. Your basic output is saved; no automatic paid retry was made.";
    await writeComposition(project.id, state);
  }
  return state;
}

export async function writeComposition(id: string, state: CompositionState) {
  await writeCompositionFile(id, "state.json", Buffer.from(JSON.stringify(state, null, 2)));
}

export function parsePlacements(value: unknown): Placement[] {
  if (!Array.isArray(value) || value.length > 6) throw new PlanterError("Use up to six planter arrangements.");
  const ids = new Set<string>();
  return value.map(p => {
    if (!p || typeof p !== "object" || ![p.x, p.y, p.height, p.shadow].every(Number.isFinite) || p.x < 0 || p.x > 1 || p.y < .1 || p.y > .94 || p.height < .03 || p.height > .9 || p.shadow < 0 || p.shadow > 1 || typeof p.perspective !== "boolean") throw new PlanterError("Invalid planter placement.");
    const id = validId(p.id);
    if (ids.has(id)) throw new PlanterError("Duplicate planter placement.");
    ids.add(id);
    return { id, assetId: validId(p.assetId), revisionId: validId(p.revisionId), x: p.x, y: p.y, height: p.height, perspective: p.perspective, shadow: p.shadow };
  });
}
