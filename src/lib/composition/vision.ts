import sharp from "sharp";

export function visionModel() { return process.env.OPENAI_COMPOSITION_VISION_MODEL || "gpt-4.1"; }

export async function analyseImages<T>(name: string, prompt: string, images: Buffer[], schema: object, maxTokens = 1400): Promise<{ value: T; usage?: unknown }> {
  const urls = await Promise.all(images.map(async image => `data:image/png;base64,${(await sharp(image).flatten({ background: "#ededE5" }).resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).png().toBuffer()).toString("base64")}`));
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(50_000),
    body: JSON.stringify({ model: visionModel(), store: false, max_output_tokens: maxTokens,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }, ...urls.map(image_url => ({ type: "input_image", image_url, detail: "high" }))] }],
      text: { format: { type: "json_schema", name, strict: true, schema } },
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || `Visual analysis failed (${response.status}).`);
  const content = result.output?.flatMap((item: { content?: { type: string; text?: string }[] }) => item.content || []).find((item: { type: string }) => item.type === "output_text")?.text;
  if (!content) throw new Error("Visual analysis returned no result.");
  return { value: JSON.parse(content) as T, usage: result.usage };
}

export const objectSchema = (properties: Record<string, object>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
export const numberSchema = { type: "number" };
export const stringSchema = { type: "string" };
