"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import Link from "next/link";
import { ArrowRight, Camera, CheckCircle2, ChevronDown, LoaderCircle, MapPin, Pause, Play, Search, Trash2 } from "lucide-react";
import { RULES_VERSION, RUN_LIMITS, type ApprovedVenue, type DiscoveryRun } from "@/lib/frontage/types";
import type { GoogleVenue } from "@/lib/google/types";

const button = "inline-flex items-center justify-center gap-2 border border-[#bac9b9] px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-[#e1e9dc] disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} border-[#254e3b] bg-[#254e3b] text-white hover:bg-[#193e2d]`;

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Discovery request failed.");
  return data;
}
const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// Share only in-flight reads, including React's development remount. Each card
// owns its blob URL; settled requests do not accumulate in browser memory.
const pendingPreviews = new Map<string, Promise<Response>>();
function previewResponse(placeId: string, assessmentId: string) {
  const key = `${placeId}:${assessmentId}`;
  let pending = pendingPreviews.get(key);
  if (!pending) {
    pending = fetch(`/api/approved-venues/${placeId}`, { cache: "no-store" }).finally(() => pendingPreviews.delete(key));
    pendingPreviews.set(key, pending);
  }
  return pending.then(response => response.clone());
}

export type FrontageDiscoveryHandle = { check: (venue: GoogleVenue) => void };
export function FrontageDiscovery({ ref }: { ref?: Ref<FrontageDiscoveryHandle> }) {
  const [venues, setVenues] = useState<ApprovedVenue[]>([]);
  const [run, setRun] = useState<DiscoveryRun>();
  const [area, setArea] = useState("Soho"), [category, setCategory] = useState("all");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const continuing = useRef(false), mounted = useRef(true), processing = useRef(false);

  async function refresh() {
    const data = await request<{ venues: ApprovedVenue[]; run?: DiscoveryRun }>("/api/frontage-discovery");
    if (mounted.current) { setVenues(data.venues); setRun(data.run); }
    return data;
  }
  useEffect(() => {
    mounted.current = true;
    void request<{ venues: ApprovedVenue[]; run?: DiscoveryRun }>("/api/frontage-discovery").then(data => {
      if (mounted.current) { setVenues(data.venues); setRun(data.run); }
    }).catch(cause => { if (mounted.current) setError(cause.message); }).finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; continuing.current = false; };
  }, []);

  async function drive(initial: DiscoveryRun) {
    continuing.current = true;
    let current = initial;
    // Browser drives bounded server steps. Refresh/navigation pauses, never starts a new run.
    while (continuing.current && mounted.current && current.status === "running") {
      current = await request<DiscoveryRun>(`/api/frontage-discovery/${current.id}`, json({ confirmed: true }));
      if (!mounted.current) break;
      setRun(current);
    }
    if (mounted.current) await refresh();
  }
  async function start(venue?: GoogleVenue, force = false) {
    if (processing.current) return;
    if (run?.status === "running") { setError("Resume or cancel the existing run before starting another."); return; }
    const maximum = venue ? 4 : RUN_LIMITS.images;
    if (!window.confirm(`${venue ? `Find the best frontage for ${venue.name}` : `Find 3 new suitable venues in ${area}`}? Up to ${venue ? 1 : RUN_LIMITS.venues} businesses and ${maximum} image requests / vision assessments. Places search and fallback photo lookups also use Google requests. Saved checks will be reused unless you explicitly reassess.`)) return;
    processing.current = true; setBusy(true); setError("");
    try {
      const initial = await request<DiscoveryRun>("/api/frontage-discovery", json({ id: crypto.randomUUID(), location: area, category, placeId: venue?.placeId, force, confirmed: true }));
      setRun(initial); await drive(initial);
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Discovery failed."); }
    finally { processing.current = false; if (mounted.current) setBusy(false); }
  }
  async function resume() {
    if (!run || processing.current) return;
    if (!window.confirm(`Resume this run? Up to ${Math.max(0, RUN_LIMITS.images - run.images)} image requests remain within its original limit.`)) return;
    processing.current = true; setBusy(true); setError("");
    try { await drive(run); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not resume."); }
    finally { processing.current = false; if (mounted.current) setBusy(false); }
  }
  useImperativeHandle(ref, () => ({ check: venue => { void start(venue); } }));
  async function cancel() {
    if (!run || busy || !window.confirm("Cancel this discovery run? Completed approvals will be kept.")) return;
    try { setRun(await request<DiscoveryRun>(`/api/frontage-discovery/${run.id}`, { method: "DELETE" })); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not cancel."); }
  }

  const shown = venues.filter(v => `${v.venue.name} ${v.venue.address} ${v.area}`.toLowerCase().includes(filter.toLowerCase()));
  return <section id="approved-discovery" aria-label="Discover" className="mx-auto max-w-[1440px] px-6 py-8 md:px-10">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
      <div><h2 className="font-serif text-3xl text-[#233c2b]">Discover</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#697267]">Choose an area. We’ll find three promising businesses, check their entrances and save the usable views.</p></div>
      <span className="border border-[#c9d4c0] bg-[#e7eddf] px-3 py-2 text-xs text-[#56704c]">Automatic selection · Saved decisions</span>
    </div>
    {error && <div role="alert" className="mb-5 border border-[#d7b9a3] bg-[#fff6eb] p-4 text-sm text-[#824b32]">{error}<button onClick={() => { setError(""); void refresh().catch(cause => setError(cause.message)); }} className="ml-3 underline">Retry loading saved data</button></div>}
    <form id="discover-form" onSubmit={event => { event.preventDefault(); void start(); }} className="mb-6 grid gap-5 border border-[#d2d9cb] bg-[#faf9f2] p-6 md:grid-cols-[1fr_1fr_auto] md:items-end">
      <label className="text-xs font-semibold text-[#526a57]">London area<input id="discover-area" required minLength={2} maxLength={80} value={area} disabled={busy} onChange={event => setArea(event.target.value)} className="mt-2 block w-full border border-[#bbc8b7] bg-white px-3 py-3 text-sm" /></label>
      <label className="text-xs font-semibold text-[#526a57]">Business mix<select value={category} disabled={busy} onChange={event => setCategory(event.target.value)} className="mt-2 block w-full border border-[#bbc8b7] bg-white px-3 py-3 text-sm"><option value="all">Cafes, restaurants & salons</option><option value="cafe">Cafes</option><option value="restaurant">Restaurants</option><option value="hair salon">Hair salons</option><option value="bar">Bars & pubs</option><option value="shop">Clothing boutiques</option></select></label>
      <button disabled={loading || busy || run?.status === "running"} className={primary}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Search size={16} />}Discover 3 venues</button>
      <p className="text-xs leading-5 text-[#738171] md:col-span-3">Up to 10 businesses and 20 image assessments per batch. Stops after 3 approvals. Existing decisions are reused; every new batch asks for confirmation. Search is limited to a neighbourhood-sized window.</p>
    </form>
    {run && <details open={run.status === "running" || run.status === "error"} className="mb-5 text-xs text-[#62705d]"><summary className="w-fit cursor-pointer py-1 text-xs font-semibold text-[#738171]">{run.status === "running" ? busy ? "Discovery in progress" : "Discovery paused \u2014 ready to resume" : run.status === "error" ? "Discovery stopped safely" : "Discovery summary"}</summary><div aria-live="polite" className="mt-3 border-l border-[#c8d2c0] pl-4">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="mt-2 text-sm text-[#52624d]">{run.message.replace("Choose Find more to continue.", "Start another discovery batch to find more.")}</p><p className="mt-3 text-xs text-[#61715a]">{run.cursor} businesses considered · {run.images} image requests · {run.reviews} vision requests · {run.reused} checks reused · {run.approvedIds.length} approved</p></div>
        {run.status === "running" && <div className="flex gap-2">{busy ? <button className={button} onClick={() => { continuing.current = false; }}><Pause size={14} />Pause after this step</button> : <><button className={button} onClick={resume}><Play size={14} />Resume</button><button className={button} onClick={cancel}>Cancel run</button></>}</div>}
      </div>
      {run.attempts.length > 0 && <details className="mt-4 text-xs"><summary className="cursor-pointer font-semibold">View decisions and rejected attempts ({run.attempts.length})</summary><ul className="mt-3 max-h-64 space-y-3 overflow-auto">{run.attempts.map((attempt, index) => <li key={index}><span className="font-semibold">{attempt.venueName} · {attempt.outcome}{attempt.reused ? " · reused" : ""}</span><p className="mt-1 text-[#62705d]">{attempt.reason}</p></li>)}</ul></details>}
    </div></details>}
    <div id="approved-venues" className="mt-9 border-t border-[#d2d9cb] pt-6">
      <div className="mb-3 flex items-center gap-3"><h3 className="font-serif text-2xl">Approved venues</h3><span className="rounded-full bg-[#e0e8d8] px-2.5 py-1 text-xs font-semibold text-[#506b46]">{venues.length}</span></div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><label className="flex items-center gap-2 border-b border-[#b8c5b4] px-2"><Search size={15} /><input aria-label="Filter approved venues" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Name, area or postcode" className="bg-transparent py-2 text-sm outline-none" /></label></div>
      {loading ? <p role="status" className="py-8 text-center text-sm">Loading approved venues…</p> : shown.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{shown.map(venue => <ApprovedCard key={`${venue.venue.placeId}:${venue.review.checkedAt}`} item={venue} disabled={busy || run?.status === "running"} onReassess={() => void start(venue.venue, true)} onRemoved={() => setVenues(old => old.filter(v => v.venue.placeId !== venue.venue.placeId))} />)}</div> : <div className="flex items-center gap-4 border border-dashed border-[#b8c6b2] bg-[#f7f7ef] p-6"><MapPin size={25} className="shrink-0 text-[#698264]" /><div><h4 className="font-serif text-xl">{filter ? "No matching approved venues" : "Your shortlist starts here"}</h4><p className="mt-1 text-sm leading-6 text-[#697267]">{filter ? "Try another name or area." : "Use Discover above. Suitable entrances will be saved here without filling your project library."}</p></div></div>}
    </div>
  </section>;
}

function ApprovedCard({ item, disabled, onReassess, onRemoved }: { item: ApprovedVenue; disabled: boolean; onReassess: () => void; onRemoved: () => void }) {
  const [image, setImage] = useState<string>(), [blob, setBlob] = useState<Blob>();
  const [busy, setBusy] = useState(() => item.status === "approved" && item.review.rulesVersion === RULES_VERSION && Date.parse(item.review.expiresAt) > Date.now()), [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [adding, setAdding] = useState(false), [title, setTitle] = useState(item.venue.name), [project, setProject] = useState<string>();
  const [invalid, setInvalid] = useState(false);
  const projectFormId = useId();
  const [openedAt] = useState(() => Date.now());


  const stale = invalid || item.status !== "approved" || item.review.rulesVersion !== RULES_VERSION || Date.parse(item.review.expiresAt) <= openedAt;
  useEffect(() => {
    if (stale) return;
    const controller = new AbortController();
    let url: string | undefined;
    void previewResponse(item.venue.placeId, item.review.id).then(async response => {
      if (controller.signal.aborted) return;
      if (!response.ok) { if (response.status === 409) { setBusy(false); setInvalid(true); } throw new Error((await response.json()).error); }
      const loaded = await response.blob();
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(loaded); setBlob(loaded); setImage(url);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load the approved image."); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [item.venue.placeId, item.review.id, stale, retry]);
  async function save() {
    if (!blob || busy || !title.trim()) return;
    setBusy(true); setError("");
    try {
      const body = new FormData(); body.set("image", blob, "frontage.jpg"); body.set("assessmentId", item.review.id); body.set("title", title);
      const saved = await request<{ id: string }>(`/api/approved-venues/${item.venue.placeId}`, { method: "POST", body }); setProject(saved.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create the project."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (busy || !window.confirm(`Remove ${item.venue.name} from the shortlist? Existing projects are unaffected.`)) return;
    setBusy(true);
    try { await request(`/api/approved-venues/${item.venue.placeId}`, { method: "DELETE" }); onRemoved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove venue."); }
    finally { setBusy(false); }
  }
  return <article className="flex flex-col border border-[#d1d8c9] bg-[#faf9f2]">
    <div className="relative flex min-h-40 items-center justify-center border-b border-[#d1d8c9] bg-[#e3e9dc]">
      {image ? <div className="relative aspect-[4/2.865] w-full overflow-hidden"><img src={image} alt={`Assessed entrance of ${item.venue.name}`} className="absolute inset-x-0 top-0 w-full" /></div> : busy ? <span role="status" className="flex items-center gap-2 text-xs text-[#62705d]"><LoaderCircle size={16} className="animate-spin" />Loading approved view...</span> : stale ? <Camera size={24} className="text-[#81917d]" /> : <button className={button} onClick={() => { setBusy(true); setError(""); setRetry(value => value + 1); }}>Retry preview</button>}
    </div>
    <div className="flex flex-1 flex-col p-5">
      <p className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${stale ? "text-[#946334]" : "text-[#527343]"}`}><CheckCircle2 size={13} />{stale ? "Needs reassessment" : "Automatically approved"}</p>
      <h2 className="mt-3 font-serif text-2xl">{item.venue.name}</h2><p className="mt-2 text-xs leading-5 text-[#697267]">{item.venue.address}</p>
      <p className="mt-4 text-sm leading-6 text-[#52624c]">{item.review.assessment.reason}</p>
      {!!item.review.assessment.issues?.length && <p className="mt-2 text-xs leading-5 text-[#8b714c]">Usable with caveats: {item.review.assessment.issues.join("; ")}</p>}
      <p className="mt-3 text-[11px] text-[#7b8575]">Checked {new Date(item.review.checkedAt).toLocaleDateString("en-GB")} · {item.review.frame.source === "streetview" ? "Street View" : "Venue photo"}</p>
      <a href={item.venue.mapsUrl} target="_blank" rel="noreferrer" className="mt-2 text-xs underline">View on Google Maps</a>
      {item.review.frame.source === "places-photo" && <div className="mt-2 text-xs text-[#697267]">Photo: {item.review.frame.attribution.map((a, i) => a.uri ? <a className="mr-2 underline" key={i} href={a.uri} target="_blank" rel="noreferrer">{a.name}</a> : <span className="mr-2" key={i}>{a.name}</span>)}</div>}
      {image && !stale && !project && <div className="mt-auto pt-5">
        <button type="button" aria-expanded={adding} aria-controls={projectFormId} disabled={busy} onClick={() => setAdding(value => !value)} className={`${button} w-full justify-between text-[#315e44]`}>Add project to library<ChevronDown size={16} className={`transition-transform ${adding ? "rotate-180" : ""}`} /></button>
        {adding && <form id={projectFormId} onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-3 border border-t-0 border-[#bac9b9] bg-[#f1f3e9] p-4"><label className="block text-xs font-semibold">Project name<input required maxLength={160} disabled={busy} value={title} onChange={event => setTitle(event.target.value)} className="mt-2 w-full border border-[#bdcbbb] bg-white p-2 text-sm" /></label><button type="submit" className={`${primary} w-full`} disabled={busy || !title.trim()}>{busy ? <LoaderCircle size={14} className="animate-spin" /> : <ArrowRight size={14} />}Create project</button></form>}
      </div>}
      {project && <Link href={`/studio?id=${encodeURIComponent(project)}`} className={`${primary} mt-5`}>Open project <ArrowRight size={14} /></Link>}
      {error && <p role="alert" className="mt-3 text-sm text-[#944d43]">{error}</p>}
      <div className="mt-auto flex items-center justify-between gap-2 pt-5"><button className="text-xs underline disabled:opacity-50" disabled={disabled || busy} onClick={onReassess}>Reassess this venue</button><button aria-label={`Remove ${item.venue.name} from shortlist`} className="p-2 text-[#936451] hover:bg-[#f2e5d8] disabled:opacity-50" disabled={busy || disabled} onClick={remove}><Trash2 size={15} /></button></div>
    </div>
  </article>;
}
