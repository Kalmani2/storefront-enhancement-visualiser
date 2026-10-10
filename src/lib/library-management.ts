import { rm } from "node:fs/promises";
import path from "node:path";
import { getProject, listProjects, projectId } from "./project-store";
import { assetDirectory, locked, outputRoot, readAsset, readStoredAsset } from "./planters/store";
import { PlanterError, validId } from "./planters/validation";
import { removeAssetFolder, storageClient, storageConfigured } from "./storage";
import { readCompositionFile } from "./composition/store";
import type { CompositionState } from "./composition/types";
import type { DeleteResult } from "./projects";

async function composition(id: string): Promise<CompositionState | undefined> {
  // Read even when the frontage has changed: old versions may still use assets.
  try { return JSON.parse((await readCompositionFile(id, "state.json")).toString()); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error instanceof PlanterError && error.status === 404)) return;
    throw error;
  }
}

async function cleanup(action: () => Promise<void>): Promise<DeleteResult> {
  try { await action(); return { deleted: true }; }
  catch (error) {
    console.error("Library file cleanup failed:", error instanceof Error ? error.message : "Unknown error");
    // The record is already deleted; reporting a failure would invite a retry
    // against a missing record. Be explicit that orphaned files may remain.
    return { deleted: true, warning: "Removed from the library, but some stored files could not be deleted. Storage cleanup may be needed." };
  }
}

export async function removeProject(id: string): Promise<DeleteResult> {
  projectId(id);
  return locked(`composition:${id}`, () => locked(`source:${id}`, async () => {
    await getProject(id);
    if ((await composition(id))?.job) throw new PlanterError("Wait for this project's enhancement to finish before deleting it.", 409);
    const { data, error } = await storageClient().from("projects").delete().eq("id", id).select("id").maybeSingle();
    if (error) throw new PlanterError("The project could not be deleted.", 502);
    if (!data) throw new PlanterError("Project not found.", 404);
    return cleanup(async () => {
      await removeAssetFolder(`storefronts/${id}`);
      await removeAssetFolder(`compositions/${id}`);
    });
  }));
}

export async function removePlanter(id: string): Promise<DeleteResult> {
  validId(id);
  await readAsset(id);
  return locked(id, async () => {
    const asset = await readStoredAsset(id);
    if (asset.status === "processing") throw new PlanterError("Wait for extraction to finish before deleting this planter.", 409);
    // Preserve both editable drafts and historic compositions. These files
    // contain immutable planter revision references, not duplicate cutouts.
    if (storageConfigured()) {
      for (const project of await listProjects()) {
        const state = await composition(project.id);
        if (state && [...state.draft, ...state.versions.flatMap(version => version.placements)].some(placement => placement.assetId === id)) {
          throw new PlanterError(`This planter is used by "${project.title}". Keep it, or delete that project first.`, 409);
        }
      }
      const { data: row, error: readError } = await storageClient().from("planters").select("version,status").eq("id", id).maybeSingle();
      if (readError) throw new PlanterError("The planter could not be loaded.", 502);
      if (!row) throw new PlanterError("Planter not found.", 404);
      if (row.status === "processing") throw new PlanterError("Wait for extraction to finish before deleting this planter.", 409);
      const { data, error } = await storageClient().from("planters").delete().eq("id", id).eq("version", row.version).select("id").maybeSingle();
      if (error) throw new PlanterError("The planter could not be deleted.", 502);
      if (!data) throw new PlanterError("This planter changed in another session. Reload before deleting.", 409);
      return cleanup(() => removeAssetFolder(`planters/${id}`));
    }
    const target = path.resolve(assetDirectory(id));
    const root = path.resolve(outputRoot());
    if (path.dirname(target) !== root) throw new PlanterError("Invalid planter folder.");
    await rm(target, { recursive: true, force: false });
    return { deleted: true };
  });
}
