import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { storageBucket, storageClient, storageConfigured } from "./storage";
import { PlanterError } from "./planters/validation";

export const DAILY_LIMITS = { extraction: 20, composition: 40, vision: 200 } as const;
export type PaidOperation = keyof typeof DAILY_LIMITS;
export function paidAiEnabled() { return Boolean(process.env.OPENAI_API_KEY) && process.env.ENABLE_PAID_AI !== "false"; }

// Create-only object slots reserve requests atomically across server instances.
// Failed attempts retain their slot: a timed-out provider may still bill them.
export async function reservePaidRequest(operation: PaidOperation, now = new Date()) {
  if (!paidAiEnabled()) throw new PlanterError("AI processing is unavailable. Configure OPENAI_API_KEY and ensure ENABLE_PAID_AI is not false.", 503);
  const limit = DAILY_LIMITS[operation], day = now.toISOString().slice(0, 10);
  const prefix = `usage/${day}/${operation}`;
  const receipt = JSON.stringify({ operation, reservedAt: now.toISOString() });
  if (storageConfigured()) {
    const bucket = storageClient().storage.from(storageBucket());
    const { data, error } = await bucket.list(prefix, { limit: 1000 });
    if (error || !data) throw new PlanterError("Could not check the shared daily AI allowance. No paid request was sent. Try again later.", 503);
    const used = new Set(data.map(item => item.name));
    for (let slot = 0; slot < limit; slot++) {
      const name = `${String(slot).padStart(3, "0")}.json`;
      if (used.has(name)) continue;
      const { error } = await bucket.upload(`${prefix}/${name}`, Buffer.from(receipt), { contentType: "application/json", upsert: false });
      if (!error) return;
      if (String(error.statusCode) === "409" || /already exists|duplicate/i.test(error.message)) continue;
      throw new PlanterError("Could not reserve the shared daily AI allowance. No paid request was sent. Try again later.", 503);
    }
  } else {
    if (process.env.VERCEL === "1") throw new PlanterError("Configure Supabase before using hosted AI processing.", 503);
    const directory = path.join(process.cwd(), "output", prefix);
    await mkdir(directory, { recursive: true });
    const used = new Set(await readdir(directory));
    for (let slot = 0; slot < limit; slot++) {
      const name = `${String(slot).padStart(3, "0")}.json`;
      if (used.has(name)) continue;
      try { await writeFile(path.join(directory, name), receipt, { flag: "wx" }); return; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    }
  }
  throw new PlanterError(`The shared daily ${operation} allowance (${limit} requests) has been reached. It resets at 00:00 UTC. Saved images and free editing remain available.`, 429);
}
