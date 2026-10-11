import { afterEach, describe, expect, it, vi } from "vitest";
import { assessFrontage, assessmentKey, correctedFrame, decisionReason, fingerprint, validateAssessment, verdict } from "./assessment";
import { dependencies, freshRun, stepRun } from "./engine";
import { RULES_VERSION, type ApprovedVenue, type Assessment, type AssessmentRecord, type DiscoveryRun, type StreetFrame } from "./types";
import type { GoogleVenue } from "../google/types";
import { PlanterError } from "../planters/validation";
import { frameAvailable, fetchFrontageImage } from "./images";
import { requireDiscoveryConsent } from "./http";

vi.mock("../composition/vision", async importOriginal => ({ ...await importOriginal<typeof import("../composition/vision")>(), analyseImages: vi.fn() }));
import { analyseImages } from "../composition/vision";

const venue: GoogleVenue = { placeId: "testplace1234", name: "Test Cafe", address: "1 Test Street, London", latitude: 51.514, longitude: -.136, primaryType: "cafe", category: "cafe", mapsUrl: "https://maps.google.com", businessStatus: "OPERATIONAL" };
const frame: StreetFrame = { source: "streetview", panoId: "camera1", latitude: 51.514, longitude: -.1362, heading: 90, fov: 65, pitch: -5, width: 640, height: 480, date: "2026-01", copyright: "© Google" };
const good: Assessment = { identity: "confirmed", exterior: true, entranceVisible: true, framingUsable: true, placementSpace: true, underDressed: true, imageQuality: true, issues: [], reason: "Matching sign, clear entrance and bare ground beside the door.", action: "accept", entranceBox: { x: .4, y: .2, width: .2, height: .6 } };
const bytes = Buffer.from("a real image in production");
function record(assessment = good): AssessmentRecord {
  return { id: assessmentKey(venue.placeId, frame), venueId: venue.placeId, frame, fingerprint: fingerprint(bytes), assessment, verdict: verdict(assessment), checkedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), rulesVersion: RULES_VERSION, model: "gpt-4.1-mini" };
}
function setup(count = 1) {
  const run = freshRun("12345678-1234-1234-1234-123456789012", "Soho", "all");
  const cache = new Map<string, AssessmentRecord>(), approved = new Map<string, ApprovedVenue>();
  const dep: typeof dependencies = {
    search: vi.fn().mockResolvedValue({ location: "Soho", category: "all", venues: Array.from({ length: count }, (_, i) => ({ ...venue, placeId: `${venue.placeId}${i}` })) }),
    venue: vi.fn().mockResolvedValue(venue), cameras: vi.fn().mockResolvedValue([frame, { ...frame, panoId: "camera2" }]),
    available: vi.fn().mockResolvedValue(true), image: vi.fn().mockImplementation(async (_venue, f) => ({ frame: f, bytes, contentType: "image/jpeg" })),
    assess: vi.fn().mockResolvedValue({ assessment: good }),
    getAssessment: vi.fn().mockImplementation(async id => cache.get(id)), saveAssessment: vi.fn().mockImplementation(async r => { cache.set(r.id, r); }),
    getApproved: vi.fn().mockImplementation(async id => approved.get(id)), saveApproved: vi.fn().mockImplementation(async r => { approved.set(r.venue.placeId, r); }),
    listApproved: vi.fn().mockImplementation(async () => [...approved.values()]), recentExhausted: vi.fn().mockResolvedValue([]),
  };
  const checkpoints: DiscoveryRun[] = [], save = vi.fn(async (r: DiscoveryRun) => { checkpoints.push(structuredClone(r)); });
  async function finish() { for (let i = 0; i < 100 && run.status === "running"; i++) await stepRun(run, save, dep); return run; }
  return { run, dep, save, finish, cache, approved, checkpoints };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("frontage acceptance and reframing", () => {
  it("accepts light planting and minor caveats, but not substantial planting or the wrong store", () => {
    expect(verdict({ ...good, underDressed: false, plantingLevel: "light", issues: ["pedestrian away from entrance"] })).toBe("approved");
    expect(verdict({ ...good, plantingLevel: "substantial" })).toBe("rejected");
    expect(verdict({ ...good, plantingLevel: "bare", identity: "wrong" })).toBe("rejected");
    expect(decisionReason({ ...good, underDressed: false, plantingLevel: "substantial" })).toMatch(/substantially planted/i);
    expect(() => validateAssessment({ ...good, plantingLevel: "lots" })).toThrow();
  });
  it("never lets the model's accept action override failed evidence", () => {
    expect(verdict(good)).toBe("approved");
    expect(verdict({ ...good, identity: "uncertain" })).toBe("uncertain");
    for (const change of [{ identity: "wrong" as const }, { exterior: false }, { entranceVisible: false }, { framingUsable: false }, { placementSpace: false }, { underDressed: false }, { imageQuality: false }]) expect(verdict({ ...good, ...change })).toBe("rejected");
  });
  it("validates model output at runtime and rejects malformed geometry", () => {
    expect(validateAssessment(good)).toEqual(good);
    expect(() => validateAssessment({ ...good, exterior: "true" })).toThrow();
    expect(() => validateAssessment({ ...good, entranceBox: { x: .8, y: 0, width: .5, height: .5 } })).toThrow();
  });
  it("computes bounded heading/zoom/pitch changes only for a identified correct entrance", () => {
    const result = correctedFrame(frame, { ...good, action: "reframe", entranceBox: { x: .75, y: .3, width: .24, height: .69 } });
    expect(result!.heading).toBeGreaterThan(frame.heading);
    expect(result!.heading - frame.heading).toBeLessThanOrEqual(30);
    expect(result!.fov).toBe(80);
    expect(result!.pitch).toBeGreaterThanOrEqual(-20);
    expect(correctedFrame(frame, { ...good, action: "reframe", identity: "uncertain" })).toBeUndefined();
    expect(correctedFrame(frame, { ...good, action: "next-camera" })).toBeUndefined();
  });
  it("keys reviews by exact venue, panorama, framing, date and rules/model", () => {
    const key = assessmentKey(venue.placeId, frame);
    for (const changed of [{ ...frame, pitch: 0 }, { ...frame, heading: 95 }, { ...frame, fov: 80 }, { ...frame, date: "2026-02" }]) expect(assessmentKey(venue.placeId, changed)).not.toBe(key);
    expect(assessmentKey("anotherVenue", frame)).not.toBe(key);
    vi.stubEnv("OPENAI_FRONTAGE_MODEL", "another-model"); expect(assessmentKey(venue.placeId, frame)).not.toBe(key);
  });
  it("uses the cheap dedicated model and validates its response", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only"); vi.mocked(analyseImages).mockResolvedValue({ value: good, usage: { input_tokens: 500 } });
    expect((await assessFrontage(venue, bytes)).assessment).toEqual(good);
    expect(analyseImages).toHaveBeenCalledWith("frontage_assessment", expect.stringContaining("nearby camera is NOT proof"), [bytes], expect.any(Object), 900, "gpt-4.1-mini");
  });
});

describe("bounded, resumable discovery", () => {
  it("automatically saves three approvals and stops without checking the rest", async () => {
    const s = setup(10); await s.finish();
    expect(s.run.status).toBe("complete"); expect(s.run.approvedIds).toHaveLength(3);
    expect(s.dep.assess).toHaveBeenCalledTimes(3); expect(s.approved.size).toBe(3);
    expect(s.checkpoints.some(r => r.pending?.startsWith("image retrieval") && r.images === 1)).toBe(true);
    expect(s.checkpoints.some(r => r.pending?.startsWith("visual assessment") && r.reviews === 1)).toBe(true);
  });
  it("reuses rejected frames as well as approved ones without another paid call", async () => {
    const s = setup(); s.run.searched = true; s.run.candidates = [venue];
    s.cache.set(assessmentKey(venue.placeId, frame), record({ ...good, framingUsable: false, action: "next-camera" }));
    await s.finish();
    expect(s.run.reused).toBe(1); expect(s.dep.assess).toHaveBeenCalledTimes(1); expect(s.dep.image).toHaveBeenCalledTimes(1);
    expect(s.dep.image).toHaveBeenCalledWith(venue, expect.objectContaining({ panoId: "camera2" }));
  });
  it("reassesses a corrected frame before accepting it", async () => {
    const s = setup();
    vi.mocked(s.dep.assess).mockResolvedValueOnce({ assessment: { ...good, framingUsable: false, action: "reframe", entranceBox: { x: .7, y: .25, width: .28, height: .7 } }, usage: undefined });
    await s.finish();
    expect(s.dep.assess).toHaveBeenCalledTimes(2);
    const frames = vi.mocked(s.dep.image).mock.calls.map(call => call[1]);
    expect(frames[0]).not.toEqual(frames[1]); expect(frames[1]).toMatchObject({ panoId: "camera1" });
    expect([...s.approved.values()][0].review.frame).toEqual(frames[1]);
  });
  it("tries two street views then a Places photo, applying the same identity check", async () => {
    const s = setup();
    vi.mocked(s.dep.assess).mockResolvedValueOnce({ assessment: { ...good, identity: "wrong", action: "next-camera" }, usage: undefined }).mockResolvedValueOnce({ assessment: { ...good, exterior: false, action: "next-camera" }, usage: undefined });
    await s.finish(); expect(s.dep.assess).toHaveBeenCalledTimes(3);
    expect(vi.mocked(s.dep.image).mock.calls[2][1].source).toBe("places-photo");
    expect(s.run.approvedIds).toHaveLength(1);
  });
  it("stops at twenty image requests and does not relax the acceptance bar", async () => {
    const s = setup(10);
    vi.mocked(s.dep.image).mockImplementation(async (_venue, f) => ({ frame: f, bytes: Buffer.from(JSON.stringify(f)), contentType: "image/jpeg" }));
    vi.mocked(s.dep.assess).mockResolvedValue({ assessment: { ...good, identity: "uncertain", action: "next-camera" }, usage: undefined });
    await s.finish(); expect(s.run.images).toBe(20); expect(s.run.reviews).toBe(20); expect(s.run.approvedIds).toHaveLength(0);
    expect(s.dep.image).toHaveBeenCalledTimes(20);
  });
  it("never automatically repeats an interrupted chargeable step", async () => {
    const s = setup(); s.run.pending = "visual assessment for Test Cafe"; s.run.images = 1; s.run.reviews = 1;
    await s.finish(); expect(s.run.status).toBe("error"); expect(s.dep.assess).not.toHaveBeenCalled(); expect(s.dep.search).not.toHaveBeenCalled(); expect(s.run.reviews).toBe(1);
  });
  it("keeps provider errors separate from image rejection, stops without auto-retry", async () => {
    const s = setup(); vi.mocked(s.dep.assess).mockRejectedValue(new Error("Rate limit")); await s.finish();
    expect(s.run.status).toBe("error"); expect(s.run.reviews).toBe(1); expect(s.cache.size).toBe(0); expect(s.run.attempts.at(-1)?.outcome).toBe("error");
  });
  it("handles no street coverage and exhausted fallback photos without a model call", async () => {
    const s = setup(); vi.mocked(s.dep.cameras).mockResolvedValue([]); vi.mocked(s.dep.image).mockRejectedValue(new PlanterError("No photos", 404));
    await s.finish(); expect(s.run.status).toBe("complete"); expect(s.dep.assess).not.toHaveBeenCalled(); expect(s.run.approvedIds).toHaveLength(0);
  });
  it("excludes existing approved venues from new batches but can explicitly reopen one", async () => {
    const s = setup(); const item: ApprovedVenue = { venue: { ...venue, placeId: `${venue.placeId}0` }, area: "Soho", status: "approved", review: record(), savedAt: new Date().toISOString() };
    s.approved.set(item.venue.placeId, item); await s.finish(); expect(s.dep.assess).not.toHaveBeenCalled(); expect(s.run.candidates).toHaveLength(0);
  });
  it("gives explicit reassessment fresh model output rather than cached approval", async () => {
    const s = setup(); s.run.searched = true; s.run.force = true; s.run.candidates = [venue]; s.cache.set(assessmentKey(venue.placeId, frame), record());
    await s.finish(); expect(s.dep.assess).toHaveBeenCalledTimes(1); expect(s.run.reused).toBe(0);
  });
});

describe("source retrieval and spending consent", () => {
  it("checks saved panoramas without downloading an image; rejects changed imagery", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-only");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "OK", pano_id: frame.panoId, date: "2026-02", copyright: "© Google", location: { lat: frame.latitude, lng: frame.longitude } })));
    vi.stubGlobal("fetch", fetcher); expect(await frameAvailable(frame)).toBe(false);
    expect((fetcher.mock.calls[0][0] as URL).pathname).toContain("metadata");
  });
  it("requests the exact stored absolute heading, field of view and pitch", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-only"); const fetcher = vi.fn().mockResolvedValue(new Response(bytes, { headers: { "Content-Type": "image/jpeg" } })); vi.stubGlobal("fetch", fetcher);
    await fetchFrontageImage(venue, frame);
    const params = (fetcher.mock.calls[0][0] as URL).searchParams;
    expect(params.get("pano")).toBe(frame.panoId); expect(params.get("pitch")).toBe("-5"); expect(params.get("heading")).toBe("90"); expect(params.get("fov")).toBe("65");
  });
  it("requires confirmation, blocks cross-origin mutations and gates hosted spending", () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-only"); vi.stubEnv("OPENAI_API_KEY", "test-only");
    const request = new Request("http://localhost/api/frontage-discovery");
    expect(() => requireDiscoveryConsent(request, false)).toThrow(/Confirm/);
    expect(() => requireDiscoveryConsent(new Request(request, { headers: { origin: "https://other-site.example" } }), true)).toThrow();
    vi.stubEnv("VERCEL", "1"); expect(() => requireDiscoveryConsent(request, true)).toThrow(/Hosted/);
    vi.stubEnv("ENABLE_HOSTED_DISCOVERY", "true"); expect(() => requireDiscoveryConsent(request, true)).not.toThrow();
  });
});
