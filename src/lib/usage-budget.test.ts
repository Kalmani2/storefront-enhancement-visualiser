// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DAILY_LIMITS, paidAiEnabled, reservePaidRequest } from "./usage-budget";
const mock = vi.hoisted(() => ({ keys: new Set<string>(), configured: true, outage: false, failedUpload: false }));
vi.mock("./storage", () => ({
  storageConfigured: () => mock.configured, storageBucket: () => "private-assets",
  storageClient: () => ({ storage: { from: () => ({
    list: async (prefix: string) => ({ data: [...mock.keys].filter(k => k.startsWith(prefix + "/")).map(k => ({ name: k.split("/").at(-1) })), error: mock.outage ? { message: "offline" } : null }),
    upload: async (key: string, _bytes: Buffer, options: { upsert: boolean }) => {
      expect(options.upsert).toBe(false);
      if (mock.failedUpload) return { error: { statusCode: "503", message: "Offline" } };
      if (mock.keys.has(key)) return { error: { statusCode: "400", message: "The resource already exists" } };
      mock.keys.add(key); return { error: null };
    },
  }) } }),
}));
beforeEach(() => { mock.keys.clear(); mock.configured = true; mock.outage = false; mock.failedUpload = false; vi.stubEnv("OPENAI_API_KEY", "test-not-sent"); vi.stubEnv("ENABLE_PAID_AI", "true"); });
afterEach(() => vi.unstubAllEnvs());
const day = new Date("2026-10-11T12:00:00Z");

it("enforces a shared atomic daily limit under simultaneous requests", async () => {
  const results = await Promise.allSettled(Array.from({ length: DAILY_LIMITS.extraction + 4 }, () => reservePaidRequest("extraction", day)));
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(20);
  expect(mock.keys.size).toBe(20);
  await expect(reservePaidRequest("extraction", day)).rejects.toMatchObject({ status: 429 });
});
it("separates operations and resets at the next UTC date", async () => {
  await reservePaidRequest("extraction", day); await reservePaidRequest("composition", day); await reservePaidRequest("vision", day);
  await reservePaidRequest("extraction", new Date("2026-10-12T00:00:00Z"));
  expect(mock.keys.size).toBe(4);
});
it("fails closed on storage errors without reserving any request", async () => {
  mock.outage = true;
  await expect(reservePaidRequest("composition", day)).rejects.toMatchObject({ status: 503 });
  mock.outage = false; mock.failedUpload = true;
  await expect(reservePaidRequest("composition", day)).rejects.toMatchObject({ status: 503 });
  expect(mock.keys.size).toBe(0);
});
it("has the same enabled default and emergency stop locally and on Vercel", async () => {
  vi.stubEnv("ENABLE_PAID_AI", ""); vi.stubEnv("VERCEL", "1"); expect(paidAiEnabled()).toBe(true);
  vi.stubEnv("ENABLE_PAID_AI", "false"); expect(paidAiEnabled()).toBe(false);
  await expect(reservePaidRequest("vision", day)).rejects.toMatchObject({ status: 503 });
  vi.stubEnv("ENABLE_PAID_AI", "true"); vi.stubEnv("OPENAI_API_KEY", ""); expect(paidAiEnabled()).toBe(false);
});
it("never falls back to ephemeral disk for a hosted deployment", async () => {
  mock.configured = false; vi.stubEnv("VERCEL", "1");
  await expect(reservePaidRequest("vision", day)).rejects.toMatchObject({ status: 503 });
});
