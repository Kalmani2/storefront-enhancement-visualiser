import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { prepareCutout } from "./images";
import { locked, readAsset, readStoredAsset, readAssetFile, writeAssetFile, runtime, writeAsset } from "./store";
import { revisionFile, type ExtractionSettings, type PlanterRevision } from "./types";
import { extractionPrompt, PlanterError } from "./validation";

export function imageModel() { return process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5"; }

export async function queueExtraction(id: string, settings: ExtractionSettings) {
  if (!process.env.OPENAI_API_KEY) throw new PlanterError("Set OPENAI_API_KEY in .env.local and restart the local server to extract a planter.", 503);
  await readAsset(id);
  return locked(id, async () => {
    const asset = await readStoredAsset(id);
    if (asset.status === "processing") throw new PlanterError("An extraction is already running for this planter.", 409);
    asset.job = { id: randomUUID(), owner: runtime.owner, processId: process.pid, startedAt: new Date().toISOString(), settings };
    asset.status = "processing";
    asset.lastSettings = settings;
    delete asset.error;
    asset.updatedAt = new Date().toISOString();
    await writeAsset(asset);
    return asset;
  });
}

async function requestExtraction(id: string, settings: ExtractionSettings) {
  const source = await readAssetFile(id, "source.png");
  const form = new FormData();
  const model = imageModel();
  form.set("model", model);
  form.set("prompt", extractionPrompt(settings));
  form.set("background", "transparent");
  form.set("output_format", "png");
  form.set("quality", "medium");
  form.set("size", "1024x1536");
  form.set("n", "1");
  if (model === "gpt-image-1.5" || model === "gpt-image-1") form.set("input_fidelity", "high");
  form.append("image[]", new Blob([new Uint8Array(source)], { type: "image/png" }), "source.png");
  if (settings.selection) {
    const metadata = await sharp(source).metadata();
    const w = metadata.width!, h = metadata.height!, b = settings.selection;
    const svg = Buffer.from(`<svg width="${w}" height="${h}"><rect x="${b.x * w}" y="${b.y * h}" width="${b.width * w}" height="${b.height * h}" fill="none" stroke="#ff0000" stroke-width="${Math.max(w, h) / 200}"/></svg>`);
    const marked = await sharp(source).composite([{ input: svg }]).png().toBuffer();
    form.append("image[]", new Blob([new Uint8Array(marked)], { type: "image/png" }), "selection-guide.png");
  }
  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form,
    signal: AbortSignal.timeout(process.env.VERCEL === "1" ? 220_000 : 360_000),
  });
  const payload = await response.json() as { data?: { b64_json?: string }[]; usage?: unknown; error?: { message?: string } };
  if (!response.ok) throw new PlanterError(`OpenAI image edit failed (${response.status}): ${payload.error?.message || "Please check your image-model access and API credit."}`, 502);
  const base64 = payload.data?.[0]?.b64_json;
  if (!base64) throw new PlanterError("OpenAI did not return an image. No automatic retry was made.", 502);
  return { raw: Buffer.from(base64, "base64"), usage: payload.usage, model };
}

export async function runExtraction(id: string, jobId: string) {
  const attemptFile = `attempt-${jobId}.json`;
  try {
    const asset = await readAsset(id);
    if (asset.job?.id !== jobId || asset.status !== "processing") return;
    const settings: ExtractionSettings = { ...asset.job.settings, quality: "medium" };
    await writeAssetFile(id, attemptFile, JSON.stringify({ jobId, startedAt: asset.job.startedAt, model: imageModel(), settings, prompt: extractionPrompt(settings), status: "processing" }, null, 2));
    const result = await requestExtraction(id, settings);
    await writeAssetFile(id, `attempt-${jobId}-raw.png`, result.raw);
    const processed = await prepareCutout(result.raw);
    const revision: PlanterRevision = {
      id: randomUUID(), createdAt: new Date().toISOString(), kind: "ai", settings,
      model: result.model, prompt: extractionPrompt(settings), width: processed.width, height: processed.height,
      contactPoint: processed.contactPoint, groundContacts: processed.groundContacts, transparency: processed.transparency, warnings: processed.warnings, usage: result.usage,
    };
    if (settings.mode === "reconstruct") revision.warnings.unshift("Hidden or cropped parts may have been reconstructed by AI. Compare the shape and foliage with the source.");
    await saveRevisionFiles(id, revision.id, processed.png, processed.mask, result.raw);
    await locked(id, async () => {
      const current = await readStoredAsset(id);
      if (current.job?.id !== jobId) return;
      current.revisions.push(revision);
      current.status = "review";
      current.updatedAt = new Date().toISOString();
      delete current.job;
      delete current.error;
      await writeAsset(current);
    });
    await writeAssetFile(id, attemptFile, JSON.stringify({ jobId, revisionId: revision.id, model: result.model, settings, prompt: revision.prompt, status: "complete", usage: result.usage }, null, 2), true);
  } catch (error) {
    const attempt = JSON.parse((await readAssetFile(id, attemptFile).catch(() => Buffer.from("{}"))).toString());
    await writeAssetFile(id, attemptFile, JSON.stringify({ ...attempt, status: "error", error: error instanceof Error ? error.message : "Extraction failed.", finishedAt: new Date().toISOString() }, null, 2), true).catch(() => {});
    await locked(id, async () => {
      const current = await readStoredAsset(id);
      if (current.job?.id !== jobId) return;
      current.status = "error";
      current.error = error instanceof Error ? error.message : "Extraction failed.";
      if (error instanceof Error && error.name === "TimeoutError") current.error = "The image API timed out. A request may still have been billed; no automatic retry was made.";
      current.updatedAt = new Date().toISOString();
      delete current.job;
      await writeAsset(current);
    });
  }
}

async function saveRevisionFiles(id: string, revisionId: string, png: Buffer, mask: Buffer, raw: Buffer) {
  await Promise.all([
    writeAssetFile(id, revisionFile(revisionId), png),
    writeAssetFile(id, revisionFile(revisionId, "mask"), mask),
    writeAssetFile(id, revisionFile(revisionId, "raw"), raw),
  ]);
}

export async function saveManualRevision(id: string, parentId: string, bytes: Buffer) {
  await readAsset(id);
  return locked(id, async () => {
    const asset = await readStoredAsset(id);
    if (asset.status === "processing") throw new PlanterError("Wait for extraction to finish before saving edge edits.", 409);
    const parent = asset.revisions.find(r => r.id === parentId);
    if (!parent) throw new PlanterError("The original result was not found.", 404);
    const input = await sharp(bytes, { limitInputPixels: 16_000_000 }).metadata();
    if (input.width !== parent.width || input.height !== parent.height) throw new PlanterError("Edge edits must match the selected result's dimensions.");
    const processed = await prepareCutout(bytes);
    const revision: PlanterRevision = {
      ...parent, id: randomUUID(), parentId, kind: "manual", createdAt: new Date().toISOString(),
      width: processed.width, height: processed.height, contactPoint: processed.contactPoint, groundContacts: processed.groundContacts, transparency: processed.transparency,
      warnings: [...new Set([...parent.warnings, ...processed.warnings])], usage: undefined,
    };
    await saveRevisionFiles(id, revision.id, processed.png, processed.mask, bytes);
    asset.revisions.push(revision);
    asset.status = "review";
    delete asset.error;
    asset.updatedAt = new Date().toISOString();
    await writeAsset(asset);
    return asset;
  });
}
