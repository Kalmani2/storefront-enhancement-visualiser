import { unlink } from "node:fs/promises";
import path from "node:path";
import { removeCompositionFiles, storageConfigured } from "../storage";
import { locked } from "../planters/store";
import { PlanterError, validId } from "../planters/validation";
import type { Project } from "../projects";
import { readComposition, writeComposition } from "./store";
import { latestEnhancedVersion, type CompositionVersion } from "./types";

function files(version: CompositionVersion) {
  return [version.basicFile, version.enhancedFile, version.maskFile, version.foregroundFile, version.sourceFile, version.installationFile, version.rawFile, `${version.id}-attempt.json`].filter((file): file is string => Boolean(file));
}

export async function deleteCompositionVersion(project: Project, versionId: string) {
  validId(versionId);
  return locked(`composition:${project.id}`, async () => {
    const state = await readComposition(project);
    if (state.job) throw new PlanterError("Wait for image generation to finish before deleting a version.", 409);
    const version = state.versions.find(item => item.id === versionId);
    if (!version) throw new PlanterError("This version no longer exists.", 404);
    const remaining = state.versions.filter(item => item.id !== versionId);
    const retainedFiles = new Set(remaining.flatMap(files));
    const removedFiles = [...new Set(files(version))].filter(file => !retainedFiles.has(file));
    if (removedFiles.some(file => !/^[a-zA-Z0-9_-]+\.(png|json)$/.test(file) || file === "state.json")) throw new PlanterError("Invalid saved version files.", 409);
    state.versions = remaining;
    if (state.resultVersionId === versionId) state.resultVersionId = latestEnhancedVersion(remaining)?.id;
    await writeComposition(project.id, state);
    // Commit removal first: inaccessible leftovers are safer than broken saved versions.
    let warning: string | undefined;
    try {
      if (storageConfigured()) await removeCompositionFiles(removedFiles.map(file => `compositions/${project.id}/${file}`));
      else await Promise.all(removedFiles.map(file => unlink(path.join(process.cwd(), "output", "compositions", project.id, file)).catch(error => { if (error.code !== "ENOENT") throw error; })));
    } catch { warning = "Version deleted, but some stored files could not be cleaned up."; }
    return { ...state, ...(warning ? { warning } : {}) };
  });
}
