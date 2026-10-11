import type { GoogleVenue } from "../google/types";
import type { SearchBounds } from "../google/prospects";

export const RULES_VERSION = "frontage-v1";
export const RUN_LIMITS = { venues: 10, images: 20, target: 3, street: 2, photos: 2 } as const;

export type StreetFrame = {
  source: "streetview"; panoId: string; latitude: number; longitude: number;
  heading: number; fov: number; pitch: number; width: 640; height: 480;
  date?: string; copyright: string;
};
// Photo names expire and must not be cached. Resolve the index afresh; verify
// the actual content fingerprint before reusing an approval or displaying it.
export type PhotoFrame = { source: "places-photo"; index: number; width: 640; height: 480; attribution: { name: string; uri?: string }[] };
export type FrontageFrame = StreetFrame | PhotoFrame;
export type Assessment = {
  identity: "confirmed" | "uncertain" | "wrong";
  exterior: boolean; entranceVisible: boolean; framingUsable: boolean;
  placementSpace: boolean; underDressed: boolean; imageQuality: boolean;
  issues: string[]; reason: string;
  action: "accept" | "reframe" | "next-camera" | "reject-venue";
  entranceBox: { x: number; y: number; width: number; height: number } | null;
};
export type Verdict = "approved" | "uncertain" | "rejected";
export type AssessmentRecord = {
  id: string; venueId: string; frame: FrontageFrame; fingerprint: string;
  assessment: Assessment; verdict: Verdict; checkedAt: string; expiresAt: string;
  model: string; rulesVersion: string; usage?: unknown;
};
export type ApprovedVenue = {
  venue: GoogleVenue; area: string; bounds?: SearchBounds;
  status: "approved" | "stale" | "removed";
  review: AssessmentRecord; savedAt: string;
};
export type Attempt = { venueId: string; venueName: string; source?: FrontageFrame["source"]; outcome: Verdict | "error" | "skipped"; reason: string; reused?: boolean; assessmentId?: string };
export type CurrentVenue = {
  venue: GoogleVenue; frames: StreetFrame[]; streetUsed: number; photoUsed: number;
  correction?: StreetFrame;
};
export type DiscoveryRun = {
  id: string; status: "running" | "complete" | "cancelled" | "error";
  location: string; category: string; placeId?: string; force?: boolean;
  createdAt: string; updatedAt: string; searched: boolean; bounds?: SearchBounds;
  candidates: GoogleVenue[]; cursor: number; current?: CurrentVenue;
  target: number; approvedIds: string[]; images: number; reviews: number; reused: number;
  attempts: Attempt[]; message: string;
  // Saved BEFORE a chargeable operation. A lost request stops instead of silently replaying it.
  pending?: string;
};
