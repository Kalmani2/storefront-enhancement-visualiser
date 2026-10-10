import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Project } from "../projects";
import { locked } from "../planters/store";
import { PlanterError } from "../planters/validation";
import { imageModel } from "../planters/extraction";
import { readAssetFile } from "../planters/store";
import { revisionFile } from "../planters/types";
import { readComposition, readCompositionFile, writeComposition, writeCompositionFile } from "./store";
import { renderComposition, mergeEnhanced } from "./render";
import type { Placement } from "./types";

export async function createComposition(project: Project, placements: Placement[], enhance: boolean) {
  if (!placements.length) throw new PlanterError("Choose and place a planter first.");
  if (enhance && !process.env.OPENAI_API_KEY) throw new PlanterError("Add OPENAI_API_KEY to enable AI Enhance.", 503);
  return locked(`composition:${project.id}`, async () => {
    const state = await readComposition(project);
    if (state.job) throw new PlanterError("An enhancement is already running for this project.", 409);
    const rendered = await renderComposition(project, placements, state);
    const id = randomUUID(), basicFile = `${id}-basic.png`, maskFile = `${id}-region.png`, foregroundFile = `${id}-foreground.png`;
    await Promise.all([
      writeCompositionFile(project.id, basicFile, rendered.basic),
      writeCompositionFile(project.id, maskFile, await sharp(rendered.region, { raw: { width: rendered.width, height: rendered.height, channels: 1 } }).png().toBuffer()),
      writeCompositionFile(project.id, foregroundFile, await sharp(rendered.foreground, { raw: { width: rendered.width, height: rendered.height, channels: 1 } }).png().toBuffer()),
    ]);
    state.versions.push({ id, createdAt: new Date().toISOString(), placements, basicFile, maskFile, foregroundFile, width: rendered.width, height: rendered.height });
    state.draft = placements; delete state.error;
    if (enhance) state.job = { id: randomUUID(), versionId: id, startedAt: new Date().toISOString() };
    await writeComposition(project.id, state);
    return state;
  });
}

export async function runEnhancement(project: Project, jobId: string) {
  let rawFile: string | undefined;
  try {
    const state = await readComposition(project);
    if (state.job?.id !== jobId) return;
    const version = state.versions.find(v => v.id === state.job!.versionId)!;
    const basic = await readCompositionFile(project.id, version.basicFile);
    const regionPng = await readCompositionFile(project.id, version.maskFile!);
    const region = await sharp(regionPng).greyscale().raw().toBuffer();
    const foreground = version.foregroundFile ? await sharp(await readCompositionFile(project.id, version.foregroundFile)).greyscale().raw().toBuffer() : undefined;
    const canvasWidth = 1536, canvasHeight = 1024;
    const ratio = Math.min(canvasWidth / version.width, canvasHeight / version.height);
    const width = Math.round(version.width * ratio), height = Math.round(version.height * ratio);
    const left = Math.floor((canvasWidth - width) / 2), top = Math.floor((canvasHeight - height) / 2);
    const padded = await sharp(basic).resize(width, height).extend({ left, right: canvasWidth - width - left, top, bottom: canvasHeight - height - top, background: "#e9e9e3" }).png().toBuffer();
    const regionFit = await sharp(regionPng).resize(width, height).extend({ left, right: canvasWidth - width - left, top, bottom: canvasHeight - height - top, background: "black" }).greyscale().raw().toBuffer();
    const maskPixels = Buffer.alloc(canvasWidth * canvasHeight * 4, 255);
    for (let i = 0; i < regionFit.length; i++) maskPixels[i * 4 + 3] = 255 - regionFit[i];
    const mask = await sharp(maskPixels, { raw: { width: canvasWidth, height: canvasHeight, channels: 4 } }).png().toBuffer();
    const model = imageModel(), prompt = "Image 1 is the final composition to finish. Additional images are exact reference photographs of the planter products already placed in image 1. Improve only their lighting integration and subtle pavement contact shadows. The supplied planter shape and foliage are immutable: a cylindrical container must remain cylindrical, never a box; preserve every plant, the exact count, position, proportions, material and colour. Do not substitute any object or reconstruct the storefront. Match scene illumination and colour temperature gently. Preserve all building geometry, doors, windows, signage, readable text, people and Google attribution. Do not add or remove objects. Do not create rectangular pavement patches. Work only in the masked product and contact-shadow regions. Keep image 1 camera framing and dimensions, including padding. This is a sales visualisation of the exact supplied products.";
    const form = new FormData();
    form.set("model", model); form.set("prompt", prompt); form.set("quality", "medium"); form.set("size", "1536x1024"); form.set("output_format", "png"); form.set("n", "1");
    if (model === "gpt-image-1.5" || model === "gpt-image-1") form.set("input_fidelity", "high");
    form.append("image[]", new Blob([new Uint8Array(padded)], { type: "image/png" }), "composition.png");
    const references = [...new Map(version.placements.map(p => [`${p.assetId}:${p.revisionId}`, p])).values()];
    for (const [index, placement] of references.slice(0, 4).entries()) {
      const reference = await sharp(await readAssetFile(placement.assetId, revisionFile(placement.revisionId))).flatten({ background: "#f0f0f0" }).resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true }).png().toBuffer();
      form.append("image[]", new Blob([new Uint8Array(reference)], { type: "image/png" }), `planter-reference-${index + 1}.png`);
    }
    form.set("mask", new Blob([new Uint8Array(mask)], { type: "image/png" }), "mask.png");
    await writeCompositionFile(project.id, `${version.id}-attempt.json`, Buffer.from(JSON.stringify({ model, quality: "medium", prompt, startedAt: state.job.startedAt, placements: version.placements }, null, 2)));
    const response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form, signal: AbortSignal.timeout(process.env.VERCEL === "1" ? 220_000 : 360_000) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || `AI Enhance failed (${response.status}).`);
    if (!payload.data?.[0]?.b64_json) throw new Error("No enhanced image was returned.");
    const raw = Buffer.from(payload.data[0].b64_json, "base64");
    rawFile = `${version.id}-raw.png`;
    await writeCompositionFile(project.id, rawFile, raw);
    const fitted = await sharp(raw).resize(canvasWidth, canvasHeight).extract({ left, top, width, height }).png().toBuffer();
    const enhanced = await mergeEnhanced(basic, fitted, region, version.width, version.height, foreground);
    const enhancedFile = `${version.id}-enhanced.png`;
    await writeCompositionFile(project.id, enhancedFile, enhanced);
    await writeCompositionFile(project.id, `${version.id}-attempt.json`, Buffer.from(JSON.stringify({ model, quality: "medium", prompt, status: "complete", usage: payload.usage, rawFile }, null, 2)));
    await locked(`composition:${project.id}`, async () => {
      const current = await readComposition(project);
      if (current.job?.id !== jobId) return;
      const output = current.versions.find(v => v.id === version.id)!;
      Object.assign(output, { enhancedFile, model, quality: "medium", usage: payload.usage });
      delete current.job; delete current.error;
      await writeComposition(project.id, current);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI Enhance failed.";
    await locked(`composition:${project.id}`, async () => {
      const state = await readComposition(project);
      if (state.job?.id !== jobId) return;
      const versionId = state.job.versionId;
      await writeCompositionFile(project.id, `${versionId}-attempt.json`, Buffer.from(JSON.stringify({ status: "error", error: message, rawFile, finishedAt: new Date().toISOString() }, null, 2)));
      state.error = `${message} Your basic output is saved. No automatic paid retry was made.`;
      delete state.job; await writeComposition(project.id, state);
    });
  }
}
