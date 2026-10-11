import type { FrontageImage, ImageAttempt, Venue } from "./types";
import { reservePaidRequest } from "../usage-budget";

type Assessment = {
  venueMatch: "confirmed" | "uncertain" | "no";
  entranceVisible: boolean;
  suitableForPlanters: boolean;
  imageUsable: boolean;
  reason: string;
};

const schema = {
  type: "object",
  properties: {
    venueMatch: { type: "string", enum: ["confirmed", "uncertain", "no"] },
    entranceVisible: { type: "boolean" },
    suitableForPlanters: { type: "boolean" },
    imageUsable: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["venueMatch", "entranceVisible", "suitableForPlanters", "imageUsable", "reason"],
  additionalProperties: false,
} as const;

export async function assessImage(venue: Venue, image: FrontageImage): Promise<ImageAttempt> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  await reservePaidRequest("vision");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(40000),
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      store: false,
      max_output_tokens: 250,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: `Assess this real street photo for venue ${venue.name}, ${venue.address}, ${venue.postcode || "postcode unavailable"}. The camera is approximately ${image.distanceMetres}m from the mapped venue. Mark venueMatch confirmed ONLY if visible signage or a clearly legible address matches this business; uncertain if it might be the venue but the evidence is not visible; no if another business is shown. entranceVisible means the actual doorway is clearly shown. suitableForPlanters means frontage is bare or under-dressed and there is visible safe space beside the entrance. imageUsable means daylight/clarity/framing is good enough for a storefront visualisation. Be conservative and explain the visible evidence in one short sentence.` },
          { type: "input_image", image_url: image.url, detail: "high" },
        ],
      }],
      text: { format: { type: "json_schema", name: "frontage_assessment", strict: true, schema } },
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Image assessment failed (${response.status}): ${payload.error?.message ?? "unknown error"}`);
  const output = (payload.output as { content?: { type: string; text?: string }[] }[] | undefined)
    ?.flatMap((item) => item.content ?? []).find((part) => part.type === "output_text")?.text;
  if (!output) throw new Error("Image assessment returned no decision.");
  const assessment = JSON.parse(output) as Assessment;
  const accepted = assessment.venueMatch === "confirmed" && assessment.entranceVisible && assessment.suitableForPlanters && assessment.imageUsable;
  return {
    image,
    decision: accepted ? "accepted" : "rejected",
    reason: assessment.reason,
    venueMatch: assessment.venueMatch,
    entranceVisible: assessment.entranceVisible,
    suitableForPlanters: assessment.suitableForPlanters,
  };
}
