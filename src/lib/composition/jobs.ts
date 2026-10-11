import { createHash, randomUUID } from "node:crypto";
import { reservePaidRequest } from "../usage-budget";
import sharp from "sharp";
import type { Project } from "../projects";
import { locked, readAssetFile } from "../planters/store";
import { PlanterError } from "../planters/validation";
import { revisionFile } from "../planters/types";
import { readComposition, readCompositionFile, writeComposition, writeCompositionFile, sourceKey } from "./store";
import { renderComposition, COMPOSITION_ENGINE } from "./render";
import { composeInstallation } from "./installation";
import { completeScene, composeScene, sceneEditMask } from "./scene";
import { ANALYSIS_VERSION, estimateScale } from "./scale";
import { reviewComposition } from "./quality";
import { estimateKey, type Placement, type CompositionState, type CompositionVersion } from "./types";

export function compositionModel() { return process.env.OPENAI_COMPOSITION_MODEL || "gpt-image-2"; }

export function layoutFingerprint(project: Project, placements: Placement[], state: CompositionState) {
  return createHash("sha256").update(JSON.stringify({ engine: COMPOSITION_ENGINE, source: sourceKey(project), model: compositionModel(),
    placements: placements.map(p => ({ asset: p.assetId, revision: p.revisionId, x: +p.x.toFixed(5), y: +p.y.toFixed(5), height: +p.height.toFixed(5), perspective: p.perspective, shadow: p.shadow, yaw: p.yaw ?? null, flip: Boolean(p.flip), calibration: state.calibrations[estimateKey(p.assetId, p.revisionId)] })),
  })).digest("hex");
}

export async function createComposition(project: Project, placements: Placement[], enhance: boolean, regenerate = false) {
  if (!placements.length) throw new PlanterError("Choose and place a planter first.");
  if (enhance && !process.env.OPENAI_API_KEY) throw new PlanterError("Add OPENAI_API_KEY to enable AI Enhance.", 503);
  return locked(`composition:${project.id}`, async () => {
    const state = await readComposition(project);
    if (state.job) throw new PlanterError("An enhancement is already running for this project.", 409);
    if (enhance) for (const p of placements) {
      const key = estimateKey(p.assetId, p.revisionId);
      if (state.calibrations[key]?.analysisVersion !== ANALYSIS_VERSION) state.calibrations[key] = await estimateScale(project, p.assetId, p.revisionId);
    }
    const fingerprint = layoutFingerprint(project, placements, state);
    const cached = !regenerate && enhance && [...state.versions].reverse().find(v => v.fingerprint === fingerprint && v.enhancedFile && v.review?.status !== "rejected");
    if (cached) { state.draft = placements; delete state.error; state.resultVersionId = cached.id; await writeComposition(project.id, state); return state; }
    const rendered = await renderComposition(project, placements, state);
    const id = randomUUID(), basicFile = `${id}-basic.png`, maskFile = `${id}-region.png`, sourceFile = `${id}-source.png`, foregroundFile = `${id}-foreground.png`;
    await Promise.all([
      writeCompositionFile(project.id, basicFile, rendered.basic), writeCompositionFile(project.id, sourceFile, rendered.original),
      writeCompositionFile(project.id, maskFile, await sharp(rendered.region, { raw: { width: rendered.width, height: rendered.height, channels: 1 } }).png().toBuffer()),
      writeCompositionFile(project.id, foregroundFile, await sharp(rendered.foreground, { raw: { width: rendered.width, height: rendered.height, channels: 1 } }).png().toBuffer()),
    ]);
    state.versions.push({ id, createdAt: new Date().toISOString(), placements, basicFile, maskFile, foregroundFile, sourceFile, fingerprint, engine: COMPOSITION_ENGINE, width: rendered.width, height: rendered.height });
    state.draft = placements; state.resultVersionId = id; delete state.error;
    if (enhance) state.job = { id: randomUUID(), versionId: id, startedAt: new Date().toISOString(), stage: "rendering" };
    await writeComposition(project.id, state);
    return state;
  });
}

export function buildRenderPrompt(version: CompositionVersion, state: CompositionState, referenceKeys: string[]) {
  const descriptions = version.placements.map((p, index) => {
    const analysis = state.calibrations[estimateKey(p.assetId, p.revisionId)], profile = analysis?.product;
    const reference = referenceKeys.indexOf(estimateKey(p.assetId, p.revisionId)) + 3;
    const name = profile?.description || "Use exactly the supplied product, including its plants and containers.";
    return `Arrangement ${index + 1}: reference image ${reference}; ${profile?.containerCount || "the reference's"} container(s) per arrangement. ${name}
Ground anchor at ${(p.x * 100).toFixed(1)}% across and ${(p.y * 100).toFixed(1)}% down image 1. Follow the layout guide's total occupied height and footprint. ${p.yaw === undefined ? "Orient the bases parallel to the storefront/pavement edges and reconstruct the sides/top surfaces seen from this street camera." : `Turn the arrangement ${p.yaw} degrees about its vertical axis relative to its product reference; keep it upright, never tilt the whole plant like a flat sticker.`} ${p.flip ? "Reverse the left/right arrangement order as in image 1." : "Preserve the relative order of containers within this arrangement."}
Scene geometry: ${analysis?.scene?.perspective || "Match the existing pavement and facade perspective."} Lighting: ${analysis?.scene?.light || "Match the ambient daylight and softness in image 2."} Determine contact and cast shadows automatically from the original scene's light direction, softness and pavement; keep them natural and local.`;
  }).join("\n\n");
  const layer = version.engine === 3;
  const wholeScene = (version.engine || 0) >= 5;
  return `${layer ? "Create a transparent RGBA installation layer containing ONLY the real planter arrangements and their soft contact/cast shadows, ready to composite over this exact storefront photograph." : "Create a convincing photograph of this actual storefront with the supplied real planter products physically installed."}
IMAGE ROLES: Image 1 is the edit target: a deliberately rough placement guide showing where each arrangement belongs and its intended scale. The pasted products in it are NOT finished photography. Image 2 is the untouched original storefront: authoritative for architecture, people, pavement, signage, camera and lighting. Images 3 onward are the exact product references: authoritative for container design and planting.
${descriptions}
Reconstruct each planter arrangement in the camera perspective of image 2. You MUST change the visible faces, top openings, foreshortening, occlusion and relative base heights as needed to put solid upright containers on this pavement. Preserve the actual product design, container count, characteristic colours/material and planting species/colour palette. Reproject rather than replace with a generic product. The same arrangement may appear at several marked locations: reproduce it at each, with consistent design.
Make every base physically touch the pavement at its own perspective-correct point. Add subtle contact occlusion and soft cast shadows consistent with the scene; unify exposure, white balance, reflected light, local contrast, sharpness, grain and depth of field. The product must share the street photograph's camera and daylight, not retain bright studio lighting or unnaturally crisp cutout edges. Natural leaf and branch changes from the new viewpoint are allowed.
Preserve the intended occupied region and overall size from image 1, with small geometric corrections for realistic perspective. Preserve all original people and respect foreground/background occlusion. Keep the entrance passable. Remove any residual pasted silhouette or artificial oval shadow from image 1 as you rebuild the product and its real shadow.
${wholeScene ? "OUTPUT: one complete, coherent finished photograph, with exactly the same framing and dimensions as image 1. Your entire returned image will be used directly. Treat image 2 as a photographic record: preserve the exact building geometry, window and door positions, brick courses, facade materials, shutters, pavement joints, road markings, signs, addresses, lettering, attribution, people, their poses and clothes, and existing objects. Copy readable lettering faithfully without inventing or correcting words. Keep the same camera position, lens, perspective, crop, daylight, exposure and original photographic texture. Do not straighten the building, move facade edges, sharpen or beautify the whole scene, remove people, remodel the pavement or redesign the business. Make the smallest necessary changes to install the supplied products and their natural shadows/reflections. Reconstruct and relight the products to fit the original scene, rather than changing the scene to fit the products. Do not return an isolated product, a transparent layer, a cropped patch or a comparison." : layer ? "OUTPUT: real PNG alpha transparency. Output ONLY the repositioned, relit planter products and softly fading semi-transparent black/neutral ground shadows. ALL buildings, windows, doors, pavement, people, signs, sky and surroundings must be completely transparent. No visible floor plane, white backdrop or drawn checkerboard. Keep the arrangements' intended positions on the same transparent canvas." : "The original building, windows, doors, signs, readable lettering, people, objects and image framing must remain exactly as in image 2, except where the new products naturally occlude them or cast shadows. Work inside the supplied edit regions. No detached floor patch, duplicate plants, decorative additions, new text, camera move or global restyling. Return one final photograph with exactly the same framing and dimensions as image 1. Integrate the products directly into this street photograph: preserve natural environmental reflections, perspective, local daylight and contact with the existing pavement. Do not return an isolated product or transparent layer."}`;
}

function estimatedCost(model: string, usage: { input_tokens_details?: { image_tokens?: number; text_tokens?: number }; output_tokens_details?: { image_tokens?: number; text_tokens?: number }; output_tokens?: number }) {
  if (!model.startsWith("gpt-image-2") && model !== "gpt-image-1.5") return undefined;
  const input = usage.input_tokens_details, output = usage.output_tokens_details;
  if (!input) return undefined;
  return Number((((input.image_tokens || 0) * 8 + (input.text_tokens || 0) * 5 + (output?.image_tokens ?? usage.output_tokens ?? 0) * (model === "gpt-image-1.5" ? 32 : 30) + (output?.text_tokens || 0) * 10) / 1_000_000).toFixed(4));
}

export async function recoverComposition(project: Project, versionId: string) {
  return locked(`composition:${project.id}`, async () => {
    const state = await readComposition(project), version = state.versions.find(v => v.id === versionId);
    if (state.job) throw new PlanterError("An enhancement is already running.", 409);
    if (!version?.rawFile || version.enhancedFile || ![3, 4, COMPOSITION_ENGINE].includes(version.engine || 0)) throw new PlanterError("There is no unfinished saved render to recover.");
    state.job = { id: randomUUID(), versionId, startedAt: new Date().toISOString(), stage: "checking" };
    state.resultVersionId = versionId; delete state.error;
    await writeComposition(project.id, state); return state;
  });
}

export async function runEnhancement(project: Project, jobId: string) {
  let attempt: Record<string, unknown> = {}, versionId: string | undefined;
  try {
    const state = await locked(`composition:${project.id}`, async () => {
      const current = await readComposition(project);
      if (current.job?.id !== jobId || current.job.claimedAt) return null;
      current.job.claimedAt = new Date().toISOString(); await writeComposition(project.id, current); return current;
    });
    if (!state) return;
    const version = state.versions.find(v => v.id === state.job!.versionId)!; versionId = version.id;
    if (!version.sourceFile || !version.foregroundFile) throw new Error("This layout was created by an older renderer. Create a new render.");
    const [basic, original, regionPng, foregroundPng] = await Promise.all([readCompositionFile(project.id, version.basicFile), readCompositionFile(project.id, version.sourceFile), readCompositionFile(project.id, version.maskFile!), readCompositionFile(project.id, version.foregroundFile)]);
    const region = await sharp(regionPng).greyscale().raw().toBuffer();
    const foreground = await sharp(foregroundPng).greyscale().raw().toBuffer();
    const unique = [...new Map(version.placements.map(p => [estimateKey(p.assetId, p.revisionId), p])).entries()];
    const references = await Promise.all(unique.map(async ([, p]) => sharp(await readAssetFile(p.assetId, revisionFile(p.revisionId))).flatten({ background: "#edede5" }).resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true }).png().toBuffer()));
    const model = version.rawFile && version.model ? version.model : compositionModel(), prompt = buildRenderPrompt(version, state, unique.map(([key]) => key));
    const legacy = !model.startsWith("gpt-image-2"), canvasWidth = legacy ? 1536 : version.width, canvasHeight = legacy ? 1024 : version.height;
    const ratio = Math.min(canvasWidth / version.width, canvasHeight / version.height), width = Math.round(version.width * ratio), height = Math.round(version.height * ratio);
    const left = Math.floor((canvasWidth - width) / 2), top = Math.floor((canvasHeight - height) / 2);
    const padding = { left, right: canvasWidth - width - left, top, bottom: canvasHeight - height - top };
    const padded = await sharp(basic).resize(width, height).extend({ ...padding, background: "#e9e9e3" }).png().toBuffer();
    const form = new FormData();
    form.set("model", model); form.set("prompt", prompt); form.set("quality", "medium"); form.set("size", `${canvasWidth}x${canvasHeight}`); form.set("output_format", "png"); form.set("n", "1");
    const layerMode = version.engine === 3;
    form.set("background", layerMode ? "transparent" : "opaque");
    if (!layerMode && (version.engine || 0) < 5) {
      const mask = await sharp(await sceneEditMask(region, version.width, version.height)).resize(width, height).extend({ ...padding, background: { r: 255, g: 255, b: 255, alpha: 1 } }).png().toBuffer();
      form.set("mask", new Blob([new Uint8Array(mask)], { type: "image/png" }), "edit-region.png");
    }
    if (model === "gpt-image-1.5" || model === "gpt-image-1") form.set("input_fidelity", "high");
    const images = [padded, (version.engine || 0) >= 5 ? original : await sharp(original).resize({ width: 960, height: 960, fit: "inside" }).png().toBuffer(), ...references];
    images.forEach((image, i) => form.append("image[]", new Blob([new Uint8Array(image)], { type: "image/png" }), `input-${i + 1}.png`));
    attempt = version.rawFile ? JSON.parse((await readCompositionFile(project.id, `${version.id}-attempt.json`)).toString()) : { model, quality: "medium", engine: COMPOSITION_ENGINE, prompt, status: "rendering", startedAt: state.job!.startedAt, fingerprint: version.fingerprint, placements: version.placements };
    await writeCompositionFile(project.id, `${version.id}-attempt.json`, Buffer.from(JSON.stringify(attempt, null, 2)));
    if (!version.rawFile) await reservePaidRequest("composition");
    const response = version.rawFile ? null : await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form, signal: AbortSignal.timeout(process.env.VERCEL === "1" ? 200_000 : 360_000) });
    const payload = response ? await response.json() : { data: [{ b64_json: (await readCompositionFile(project.id, version.rawFile!)).toString("base64") }], usage: attempt.usage };
    if (response && !response.ok) throw new Error(payload.error?.message || `AI render failed (${response.status}).`);
    if (!payload.data?.[0]?.b64_json) throw new Error("No rendered image was returned.");
    const raw = Buffer.from(payload.data[0].b64_json, "base64"), rawFile = `${version.id}-raw.png`;
    if (!version.rawFile) await writeCompositionFile(project.id, rawFile, raw);
    attempt = { ...attempt, rawFile, usage: payload.usage, status: "checking" };
    await writeCompositionFile(project.id, `${version.id}-attempt.json`, Buffer.from(JSON.stringify(attempt, null, 2)));
    await locked(`composition:${project.id}`, async () => { const current = await readComposition(project); if (current.job?.id === jobId) { current.job.stage = "checking"; Object.assign(current.versions.find(v => v.id === version.id)!, { rawFile, model, usage: payload.usage, estimatedCostUsd: payload.usage ? estimatedCost(model, payload.usage) : undefined }); await writeComposition(project.id, current); } });
    // Preserve native pixels when the returned scene already matches the canvas.
    const fitted = !legacy && (version.engine || 0) >= 5 ? raw : await sharp(raw).resize(canvasWidth, canvasHeight).extract({ left, top, width, height }).resize(version.width, version.height).png().toBuffer();
    const sourceWidth = project.image?.provider === "google-street-view" || project.image?.provider === "uploaded" ? project.image.width || version.width : version.width;
    const composed = (version.engine || 0) >= 5 ? await completeScene(fitted, version.width, version.height) : layerMode
      ? await composeInstallation(original, fitted, foreground, region, version.width, version.height, sourceWidth, version.placements.reduce((sum, p) => sum + p.shadow, 0) / version.placements.length)
      : await composeScene(original, fitted, region, version.width, version.height);
    const suffix = version.rawFile ? `-${randomUUID()}` : "";
    const enhanced = composed.enhanced, enhancedFile = `${version.id}${suffix}-enhanced.png`, installationFile = "installation" in composed ? `${version.id}${suffix}-installation.png` : undefined;
    if (installationFile && "installation" in composed) await writeCompositionFile(project.id, installationFile, composed.installation as Buffer);
    await writeCompositionFile(project.id, enhancedFile, enhanced);
    const review = await reviewComposition(original, enhanced, references, version.placements.map((p, i) => {
      const a = state.calibrations[estimateKey(p.assetId, p.revisionId)];
      return `Arrangement ${i + 1} at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) normalised ground position: ${a?.product?.containerCount || "reference"} containers; ${a?.product?.description || "supplied product"}.`;
    }).join("\n"));
    const estimatedCostUsd = payload.usage ? estimatedCost(model, payload.usage) : undefined;
    const alignment = "alignment" in composed ? composed.alignment : undefined;
    await writeCompositionFile(project.id, `${version.id}-attempt.json`, Buffer.from(JSON.stringify({ ...attempt, status: "complete", review, alignment, estimatedCostUsd, finishedAt: new Date().toISOString() }, null, 2)));
    await locked(`composition:${project.id}`, async () => {
      const current = await readComposition(project);
      if (current.job?.id !== jobId) return;
      Object.assign(current.versions.find(v => v.id === version.id)!, { enhancedFile, installationFile, model, quality: "medium", usage: payload.usage, review, estimatedCostUsd, alignment });
      delete current.job; delete current.error; await writeComposition(project.id, current);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI render failed.";
    if (versionId) await writeCompositionFile(project.id, `${versionId}-attempt.json`, Buffer.from(JSON.stringify({ ...attempt, status: "error", error: message, finishedAt: new Date().toISOString() }, null, 2))).catch(() => {});
    await locked(`composition:${project.id}`, async () => {
      const current = await readComposition(project);
      if (current.job?.id !== jobId) return;
      current.error = `${message} Your layout and basic output are saved. No automatic paid retry was made.`;
      delete current.job; await writeComposition(project.id, current);
    });
  }
}
