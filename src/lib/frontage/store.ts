import { randomUUID } from "node:crypto";
import { storageClient } from "../storage";
import { PlanterError } from "../planters/validation";
import type { ApprovedVenue, AssessmentRecord, DiscoveryRun } from "./types";

function check(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (["42P01", "PGRST205"].includes(error.code || "")) throw new PlanterError("Run supabase/migrations/202610110001_frontage_discovery.sql in the Supabase SQL Editor first.", 503);
  throw new PlanterError(`Frontage storage failed: ${error.message}`, 502);
}

export async function listApproved(): Promise<ApprovedVenue[]> {
  const { data, error } = await storageClient().from("approved_venues").select("data,status").neq("status", "removed").order("updated_at", { ascending: false }).limit(200);
  check(error);
  return (data || []).map(row => ({ ...row.data, status: row.status }));
}
export async function getApproved(placeId: string): Promise<ApprovedVenue | undefined> {
  const { data, error } = await storageClient().from("approved_venues").select("data,status").eq("place_id", placeId).maybeSingle();
  check(error); return data ? { ...data.data, status: data.status } : undefined;
}
export async function saveApproved(value: ApprovedVenue) {
  const { error } = await storageClient().from("approved_venues").upsert({ place_id: value.venue.placeId, status: value.status, data: value, updated_at: new Date().toISOString() }); check(error);
}
export async function markApproved(placeId: string, status: ApprovedVenue["status"]) {
  const { error } = await storageClient().from("approved_venues").update({ status, updated_at: new Date().toISOString() }).eq("place_id", placeId); check(error);
}
export async function getAssessment(id: string): Promise<AssessmentRecord | undefined> {
  const { data, error } = await storageClient().from("frontage_assessments").select("data").eq("id", id).gt("expires_at", new Date().toISOString()).maybeSingle();
  check(error); return data?.data;
}
export async function saveAssessment(value: AssessmentRecord) {
  const { error } = await storageClient().from("frontage_assessments").upsert({ id: value.id, place_id: value.venueId, data: value, expires_at: value.expiresAt }); check(error);
}
export async function getRun(id: string): Promise<DiscoveryRun> {
  const { data, error } = await storageClient().from("frontage_runs").select("data").eq("id", id).maybeSingle(); check(error);
  if (!data) throw new PlanterError("Discovery run not found.", 404);
  return data.data;
}
export async function latestRun(): Promise<DiscoveryRun | undefined> {
  const { data, error } = await storageClient().from("frontage_runs").select("data").order("created_at", { ascending: false }).limit(1); check(error);
  return data?.[0]?.data;
}
export async function recentExhausted(): Promise<string[]> {
  const { data, error } = await storageClient().from("frontage_runs").select("data").gte("created_at", new Date(Date.now() - 86400000).toISOString()).order("created_at", { ascending: false }).limit(20);
  check(error);
  return (data || []).flatMap(row => (row.data as DiscoveryRun).attempts.filter(a => a.outcome === "skipped").map(a => a.venueId));
}
export async function createRun(run: DiscoveryRun): Promise<DiscoveryRun> {
  const client = storageClient();
  const existing = await client.from("frontage_runs").select("data").eq("id", run.id).maybeSingle(); check(existing.error);
  if (existing.data) return existing.data.data;
  const { error } = await client.from("frontage_runs").insert({ id: run.id, status: run.status, data: run });
  if (error?.code === "23505") {
    const active = await client.from("frontage_runs").select("data").eq("status", "running").maybeSingle(); check(active.error);
    if (active.data) return active.data.data;
    return getRun(run.id);
  }
  check(error); return run;
}

export type SaveRun = (run: DiscoveryRun) => Promise<void>;
export async function withRunLease(id: string, work: (run: DiscoveryRun, save: SaveRun) => Promise<DiscoveryRun>) {
  const client = storageClient(), token = randomUUID(), now = new Date().toISOString();
  const { data, error } = await client.from("frontage_runs")
    .update({ lock_token: token, lock_until: new Date(Date.now() + 150_000).toISOString() })
    .eq("id", id).lt("lock_until", now).select("data").maybeSingle();
  check(error);
  if (!data) throw new PlanterError("This run is already processing. Wait before resuming.", 409);
  const save: SaveRun = async run => {
    run.updatedAt = new Date().toISOString();
    const result = await client.from("frontage_runs").update({ data: run, status: run.status, updated_at: run.updatedAt })
      .eq("id", id).eq("lock_token", token).gt("lock_until", new Date().toISOString()).select("id").maybeSingle();
    check(result.error);
    if (!result.data) throw new PlanterError("Discovery lease expired; no further requests will be made.", 409);
  };
  try { return await work(data.data, save); }
  finally {
    const result = await client.from("frontage_runs").update({ lock_token: null, lock_until: now }).eq("id", id).eq("lock_token", token);
    check(result.error);
  }
}
