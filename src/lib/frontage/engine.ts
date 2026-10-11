import { getGoogleVenue, searchGoogleVenues, searchMixedVenues } from "../google/provider";
import { categoryProfiles, isKnownChain, type GoogleCategory } from "../google/prospects";
import { PlanterError } from "../planters/validation";
import { assessFrontage, assessmentKey, correctedFrame, decisionReason, fingerprint, frontageModel, imageUsable, venueSuitable, verdict } from "./assessment";
import { candidateFrames, fetchFrontageImage, frameAvailable } from "./images";
import * as store from "./store";
import { RULES_VERSION, RUN_LIMITS, type ApprovedVenue, type AssessmentRecord, type DiscoveryRun, type FrontageFrame } from "./types";

export const dependencies = {
  search: async (location: string, category: string) => category === "all" ? searchMixedVenues(location) : searchGoogleVenues(location, category as GoogleCategory),
  venue: getGoogleVenue, cameras: candidateFrames, available: frameAvailable, image: fetchFrontageImage,
  assess: assessFrontage, getAssessment: store.getAssessment, saveAssessment: store.saveAssessment,
  getApproved: store.getApproved, saveApproved: store.saveApproved, listApproved: store.listApproved,
  recentExhausted: store.recentExhausted,
};

export function freshRun(id: string, location: string, category: string, placeId?: string, force = false): DiscoveryRun {
  const now = new Date().toISOString();
  return { id, location, category, placeId, force, status: "running", createdAt: now, updatedAt: now, searched: false,
    candidates: [], cursor: 0, target: placeId ? 1 : RUN_LIMITS.target, approvedIds: [], images: 0, reviews: 0, reused: 0,
    attempts: [], message: "Ready to discover suitable frontages." };
}
export function reusable(value: ApprovedVenue) {
  return value.status === "approved" && value.review.rulesVersion === RULES_VERSION
    && value.review.model === frontageModel() && Date.parse(value.review.expiresAt) > Date.now();
}
function finishVenue(run: DiscoveryRun, reason: string) {
  if (run.current) run.attempts.push({ venueId: run.current.venue.placeId, venueName: run.current.venue.name, outcome: "skipped", reason });
  delete run.current;
}

/** One bounded step per HTTP request. Each charged operation is checkpointed first. */
export async function stepRun(run: DiscoveryRun, save: store.SaveRun, dep = dependencies): Promise<DiscoveryRun> {
  if (run.status !== "running") return run;
  if (run.pending) {
    run.status = "error";
    run.message = `The previous request was interrupted during ${run.pending}. Its reserved usage is retained. Start a new confirmed run to continue; completed assessments will be reused.`;
    await save(run); return run;
  }
  try {
    if (!run.searched) {
      run.pending = "venue search"; await save(run);
      if (run.placeId) {
        const venue = await dep.venue(run.placeId);
        const allowed = Object.values(categoryProfiles).some(profile => profile.matches.includes(venue.primaryType || ""));
        if (venue.businessStatus !== "OPERATIONAL" || isKnownChain(venue.name) || !allowed) {
          run.attempts.push({ venueId: venue.placeId, venueName: venue.name, outcome: "skipped", reason: "Not an operational, likely-independent target business. Manual lookup is still available." });
          run.candidates = [];
        } else run.candidates = [venue];
      } else {
        const result = await dep.search(run.location, run.category);
        run.bounds = result.bounds;
        const approved = await dep.listApproved();
        const excluded = new Set(approved.filter(v => reusable(v) || v.status === "removed").map(v => v.venue.placeId));
        const recent = new Set(await dep.recentExhausted());
        const available = result.venues.filter(v => !excluded.has(v.placeId));
        // Prefer untried venues, but allow cached failures when the area is exhausted.
        run.candidates = [...available.filter(v => !recent.has(v.placeId)), ...available.filter(v => recent.has(v.placeId))].slice(0, RUN_LIMITS.venues);
        run.message = `${result.venues.length} suitable business listings found. ${result.venues.length - available.length} already approved or removed; considering ${run.candidates.length} new candidates within the neighbourhood search window.`;
      }
      run.searched = true; delete run.pending; await save(run); return run;
    }
    if (run.approvedIds.length >= run.target || run.images >= RUN_LIMITS.images || (!run.current && run.cursor >= run.candidates.length)) {
      run.status = "complete";
      run.message = `${run.approvedIds.length} venue${run.approvedIds.length === 1 ? "" : "s"} approved. ${run.images >= RUN_LIMITS.images ? "Image budget reached; no more requests made." : run.approvedIds.length >= run.target ? "Batch target reached. Start another discovery batch to find more." : "Candidate shortlist exhausted. Try another area or category."}`;
      await save(run); return run;
    }
    if (!run.current) {
      const venue = run.candidates[run.cursor++];
      const previous = await dep.getApproved(venue.placeId);
      if (!run.force && previous?.status === "removed") {
        run.attempts.push({ venueId: venue.placeId, venueName: venue.name, outcome: "skipped", reason: "Removed from shortlist; explicit reassessment required." });
        await save(run); return run;
      }
      if (!run.force && previous && reusable(previous) && previous.review.frame.source === "streetview" && await dep.available(previous.review.frame)) {
        run.reused++; run.approvedIds.push(venue.placeId);
        run.attempts.push({ venueId: venue.placeId, venueName: venue.name, outcome: "approved", reused: true, reason: previous.review.assessment.reason });
        await save(run); return run;
      }
      // An explicit reassessment or changed/expired source must not leave a
      // previous approval visible if this run fails or finds an unsuitable view.
      if (previous?.status === "approved") await dep.saveApproved({ ...previous, status: "stale" });
      const frames = await dep.cameras(venue);
      run.current = { venue, frames, streetUsed: 0, photoUsed: 0 };
      run.message = `Checking ${venue.name}: ${frames.length ? "best street camera" : "no suitable street camera; trying venue photos"}.`;
      await save(run); return run;
    }

    const current = run.current, venue = current.venue;
    let frame: FrontageFrame | undefined;
    if (current.streetUsed < RUN_LIMITS.street) {
      frame = current.correction || current.frames[current.streetUsed];
      delete current.correction;
      if (frame) current.streetUsed++;
      else current.streetUsed = RUN_LIMITS.street;
    }
    if (!frame && current.photoUsed < RUN_LIMITS.photos) frame = { source: "places-photo", index: current.photoUsed++, width: 640, height: 480, attribution: [] };
    if (!frame) { finishVenue(run, "No approved frontage after the bounded Street View and photo attempts."); await save(run); return run; }

    let cached: AssessmentRecord | undefined;
    if (frame.source === "streetview" && !run.force) cached = await dep.getAssessment(assessmentKey(venue.placeId, frame));
    if (cached && frame.source === "streetview" && !await dep.available(frame)) cached = undefined;
    let record: AssessmentRecord;
    if (cached) { record = cached; run.reused++; }
    else {
      // Reserve image capacity before retrieval; errors still count as attempted requests.
      run.images++; run.pending = `image retrieval for ${venue.name}`; await save(run);
      let image: Awaited<ReturnType<typeof fetchFrontageImage>>;
      try { image = await dep.image(venue, frame); }
      catch (error) {
        if (error instanceof PlanterError && error.status === 404) {
          delete run.pending;
          if (frame.source === "places-photo") finishVenue(run, "No more fallback photos; no usable frontage found.");
          else {
            run.attempts.push({ venueId: venue.placeId, venueName: venue.name, source: frame.source, outcome: "skipped", reason: "Street View image disappeared; trying another view or fallback." });
            run.message = `${venue.name}: camera unavailable; trying the next view.`;
          }
          await save(run); return run;
        }
        throw error;
      }
      frame = image.frame;
      const imageHash = fingerprint(image.bytes), id = assessmentKey(venue.placeId, frame, imageHash);
      cached = !run.force ? await dep.getAssessment(id) : undefined;
      if (cached?.fingerprint === imageHash) { record = cached; run.reused++; }
      else {
        run.reviews++; run.pending = `visual assessment for ${venue.name}`; await save(run);
        const result = await dep.assess(venue, image.bytes);
        record = { id, venueId: venue.placeId, frame, fingerprint: imageHash, assessment: result.assessment, verdict: verdict(result.assessment),
          checkedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), model: frontageModel(), rulesVersion: RULES_VERSION, usage: result.usage };
        await dep.saveAssessment(record);
      }
    }
    delete run.pending;
    run.attempts.push({ venueId: venue.placeId, venueName: venue.name, source: frame.source, outcome: record.verdict, reason: decisionReason(record.assessment), imageUsable: imageUsable(record.assessment), venueSuitable: venueSuitable(record.assessment), issues: record.assessment.issues, reused: Boolean(cached && record === cached), assessmentId: record.id });
    if (record.verdict === "approved") {
      await dep.saveApproved({ venue, area: run.location, bounds: run.bounds, status: "approved", review: record, savedAt: new Date().toISOString() });
      run.approvedIds.push(venue.placeId); delete run.current;
      run.message = `${venue.name} approved and saved to the shortlist.`;
    } else if (record.assessment.identity === "confirmed" && imageUsable(record.assessment) && !venueSuitable(record.assessment) && record.assessment.action === "reject-venue") {
      finishVenue(run, "Correct frontage, but unsuitable for a planter installation.");
    } else {
      if (frame.source === "streetview" && current.streetUsed < RUN_LIMITS.street) current.correction = correctedFrame(frame, record.assessment);
      run.message = `${venue.name}: ${record.verdict}. ${current.correction ? "Will check a corrected framing." : "Will try the next available view."}`;
    }
    await save(run); return run;
  } catch (error) {
    run.status = "error";
    run.message = error instanceof Error ? error.message : "Discovery failed. No automatic paid retry was made.";
    if (run.current) run.attempts.push({ venueId: run.current.venue.placeId, venueName: run.current.venue.name, outcome: "error", reason: run.message });
    delete run.pending;
    await save(run); return run;
  }
}
