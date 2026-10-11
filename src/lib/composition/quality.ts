import { analyseImages, objectSchema, numberSchema as n, stringSchema as s } from "./vision";
import type { RenderReview } from "./types";

const schema = objectSchema({
  product: n, grounding: n, scene: n, summary: s,
  issues: { type: "array", items: s }, fatal: { type: "boolean" },
});

export async function reviewComposition(original: Buffer, finished: Buffer, references: Buffer[], description: string): Promise<RenderReview> {
  try {
    const { value, usage } = await analyseImages<{ product: number; grounding: number; scene: number; summary: string; issues: string[]; fatal: boolean }>("installation_review", `You are the final quality reviewer for a real-product storefront installation proposal. Image 1 is the original street photograph. Image 2 is the finished proposal. Remaining images are the exact product references.
${description}
Rate each category 1..5 (5 = convincing, 4 = good with minor differences, 3 = noticeable concern, 1/2 = failure): product identity (same container count per arrangement, shape, material, colour and recognisable foliage), grounding (all bases touch the same perspective-consistent pavement, plausible scale, natural contact/cast shadows, no cutout halo, resolution and lighting fit), and scene preservation (building, doorway, signs, people and all other scene contents unchanged except natural occlusion by new planters and their shadows).
A different viewing angle may legitimately change visible sides, leaf silhouettes and overlaps. Do not require pixel-identical foliage or criticise the original Street View blur. DO reject a substituted generic product, missing/extra containers, floating bases, a pasted rectangular background patch, major scale error, a planter blocking an entrance, a moved/removed person or changed signage. fatal=true only for these concrete serious failures. Distinguish a real visual defect from mere uncertainty. Give at most four short issues, empty when none. Keep the summary to two short sentences describing visible evidence. Never claim physical dimensions are correct or verified: scale can only look plausible in these uncalibrated photos. This is a sales preview, not a measured installation plan.`, [original, finished, ...references], schema, 850);
    if (![value.product, value.grounding, value.scene].every(v => Number.isFinite(v) && v >= 1 && v <= 5) || !Array.isArray(value.issues)) throw new Error("Invalid review.");
    return { status: value.fatal || Math.min(value.product, value.grounding, value.scene) <= 2 ? "rejected" : Math.min(value.product, value.grounding, value.scene) >= 4 ? "passed" : "review", product: value.product, grounding: value.grounding, scene: value.scene, summary: value.summary.slice(0, 700), issues: value.issues.slice(0, 4).map(s => String(s).slice(0, 300)), usage };
  } catch {
    return { status: "review", product: 0, grounding: 0, scene: 0, summary: "Automatic review was unavailable. Compare the product and ground contact before approving this image.", issues: ["Needs visual review before export."] };
  }
}
