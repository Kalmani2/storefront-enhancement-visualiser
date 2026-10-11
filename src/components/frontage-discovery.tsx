"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Camera, CheckCircle2, LoaderCircle, MapPin, Pause, Play, Search, Trash2 } from "lucide-react";
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

export function FrontageDiscovery({ requestedVenue, onRequestHandled }: { requestedVenue?: GoogleVenue; onRequestHandled?: () => void }) {
  const [tab, setTab] = useState<"approved" | "discover">("approved");
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
    processing.current = true; setBusy(true); setError(""); setTab("discover");
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
  async function cancel() {
    if (!run || busy || !window.confirm("Cancel this discovery run? Completed approvals will be kept.")) return;
    try { setRun(await request<DiscoveryRun>(`/api/frontage-discovery/${run.id}`, { method: "DELETE" })); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not cancel."); }
  }

  const shown = venues.filter(v => `${v.venue.name} ${v.venue.address} ${v.area}`.toLowerCase().includes(filter.toLowerCase()));
  return <section id="approved-discovery" aria-label="Automatic frontage discovery" className="mx-auto max-w-[1440px] px-6 py-10 md:px-10">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
      <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-[.18em] text-[#688069]">Find the right entrance</p><h1 className="font-serif text-4xl text-[#233c2b] md:text-5xl">Good frontages, remembered.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#697267]">Discover likely-independent London businesses. We check their entrances, try better views and save the ones worth working on.</p></div>
      <div role="group" aria-label="Discovery view" className="flex border border-[#ccd4c6] bg-[#e9ede3] p-1">
        <button className={tab === "approved" ? primary : button} aria-pressed={tab === "approved"} onClick={() => setTab("approved")}>Approved venues <span className="opacity-70">{venues.length}</span></button>
        <button className={tab === "discover" ? primary : button} aria-pressed={tab === "discover"} onClick={() => setTab("discover")}>Discover new <Search size={15} /></button>
      </div>
    </div>
    {error && <div role="alert" className="mb-5 border border-[#d7b9a3] bg-[#fff6eb] p-4 text-sm text-[#824b32]">{error}<button onClick={() => { setError(""); void refresh().catch(cause => setError(cause.message)); }} className="ml-3 underline">Retry loading saved data</button></div>}
    {requestedVenue && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border border-[#bac9b9] bg-[#e5eddf] p-4"><p className="text-sm">Check <strong>{requestedVenue.name}</strong> automatically, including retries and fallback photos.</p><div className="flex gap-2"><button disabled={busy || run?.status === "running"} className={primary} onClick={() => { void start(requestedVenue); onRequestHandled?.(); }}>Find best frontage</button><button className={button} onClick={onRequestHandled}>Dismiss</button></div></div>}
    {tab === "discover" && <form onSubmit={event => { event.preventDefault(); void start(); }} className="mb-6 grid gap-5 border border-[#d2d9cb] bg-[#faf9f2] p-6 md:grid-cols-[1fr_1fr_auto] md:items-end">
      <label className="text-xs font-semibold text-[#526a57]">London area<input required minLength={2} maxLength={80} value={area} disabled={busy} onChange={event => setArea(event.target.value)} className="mt-2 block w-full border border-[#bbc8b7] bg-white px-3 py-3 text-sm" /></label>
      <label className="text-xs font-semibold text-[#526a57]">Business mix<select value={category} disabled={busy} onChange={event => setCategory(event.target.value)} className="mt-2 block w-full border border-[#bbc8b7] bg-white px-3 py-3 text-sm"><option value="all">Cafes, restaurants & salons</option><option value="cafe">Cafes</option><option value="restaurant">Restaurants</option><option value="hair salon">Hair salons</option><option value="bar">Bars & pubs</option><option value="shop">Clothing boutiques</option></select></label>
      <button disabled={loading || busy || run?.status === "running"} className={primary}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Search size={16} />}Find 3 new venues</button>
      <p className="text-xs leading-5 text-[#738171] md:col-span-3">Up to 10 businesses and 20 image assessments per batch. Stops after 3 approvals. Existing decisions are reused; every new batch asks for confirmation. Search is limited to a neighbourhood-sized window.</p>
    </form>}
    {run && <div aria-live="polite" className="mb-7 border-l-4 border-[#527652] bg-[#e8ecdf] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold">{busy ? "Discovery in progress" : run.status === "running" ? "Discovery paused — ready to resume" : run.status === "error" ? "Discovery stopped safely" : "Discovery summary"}</p><p className="mt-2 text-sm text-[#52624d]">{run.message}</p><p className="mt-3 text-xs text-[#61715a]">{run.cursor} businesses considered · {run.images} image requests · {run.reviews} vision requests · {run.reused} checks reused · {run.approvedIds.length} approved</p></div>
        {run.status === "running" && <div className="flex gap-2">{busy ? <button className={button} onClick={() => { continuing.current = false; }}><Pause size={14} />Pause after this step</button> : <><button className={button} onClick={resume}><Play size={14} />Resume</button><button className={button} onClick={cancel}>Cancel run</button></>}</div>}
      </div>
      {run.attempts.length > 0 && <details className="mt-4 text-xs"><summary className="cursor-pointer font-semibold">View decisions and rejected attempts ({run.attempts.length})</summary><ul className="mt-3 max-h-64 space-y-3 overflow-auto">{run.attempts.map((attempt, index) => <li key={index}><span className="font-semibold">{attempt.venueName} · {attempt.outcome}{attempt.reused ? " · reused" : ""}</span><p className="mt-1 text-[#62705d]">{attempt.reason}</p></li>)}</ul></details>}
    </div>}
    {tab === "approved" && <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><p className="text-xs text-[#738171]">Saved decisions, not projects. Browsing this list makes no image or vision requests.</p><label className="flex items-center gap-2 border-b border-[#b8c5b4] px-2"><Search size={15} /><input aria-label="Filter approved venues" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Name, area or postcode" className="bg-transparent py-2 text-sm outline-none" /></label></div>
      {loading ? <p role="status" className="py-12 text-center text-sm">Loading approved venues…</p> : shown.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{shown.map(venue => <ApprovedCard key={`${venue.venue.placeId}:${venue.review.checkedAt}`} item={venue} disabled={busy || run?.status === "running"} onReassess={() => void start(venue.venue, true)} onRemoved={() => setVenues(old => old.filter(v => v.venue.placeId !== venue.venue.placeId))} />)}</div> : <div className="border border-dashed border-[#b8c6b2] bg-[#f7f7ef] px-6 py-14 text-center"><MapPin size={28} className="mx-auto mb-4 text-[#698264]" /><h2 className="font-serif text-2xl">{filter ? "No matching approved venues" : "Your shortlist starts here"}</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#697267]">{filter ? "Try another name or area." : "Run discovery once. Accepted entrances will be saved here, ready to reopen without another vision review."}</p><button className={`${primary} mt-5`} onClick={() => setTab("discover")}>Discover new venues <ArrowRight size={15} /></button></div>}
    </>}
    {tab === "discover" && run?.approvedIds.length ? <button className={primary} onClick={() => setTab("approved")}>View approved venues <ArrowRight size={15} /></button> : null}
  </section>;
}

function ApprovedCard({ item, disabled, onReassess, onRemoved }: { item: ApprovedVenue; disabled: boolean; onReassess: () => void; onRemoved: () => void }) {
  const [image, setImage] = useState<string>(), [blob, setBlob] = useState<Blob>();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [rights, setRights] = useState(false), [title, setTitle] = useState(item.venue.name), [project, setProject] = useState<string>();
  const [invalid, setInvalid] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const preview = useRef<string | undefined>(undefined);
  useEffect(() => () => { if (preview.current) URL.revokeObjectURL(preview.current); }, []);
  const stale = invalid || item.status !== "approved" || item.review.rulesVersion !== RULES_VERSION || Date.parse(item.review.expiresAt) <= openedAt;
  async function load() {
    if (busy || !window.confirm("Retrieve this exact approved image? This uses Google image requests, but no new vision assessment.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/approved-venues/${item.venue.placeId}`, json({ confirmed: true }));
      if (!response.ok) { if (response.status === 409) setInvalid(true); throw new Error((await response.json()).error); }
      const loaded = await response.blob(); setBlob(loaded);
      if (preview.current) URL.revokeObjectURL(preview.current);
      preview.current = URL.createObjectURL(loaded); setImage(preview.current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load the approved image."); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!blob || busy || !rights) return;
    setBusy(true); setError("");
    try {
      const body = new FormData(); body.set("image", blob, "frontage.jpg"); body.set("assessmentId", item.review.id); body.set("title", title); body.set("rightsConfirmed", "true");
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
      {image ? <img src={image} alt={`Assessed entrance of ${item.venue.name}`} className="aspect-[4/3] w-full object-contain" /> : <button className={button} disabled={busy || stale} onClick={load}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Camera size={16} />}Load approved view</button>}
    </div>
    <div className="flex flex-1 flex-col p-5">
      <p className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${stale ? "text-[#946334]" : "text-[#527343]"}`}><CheckCircle2 size={13} />{stale ? "Needs reassessment" : "Automatically approved"}</p>
      <h2 className="mt-3 font-serif text-2xl">{item.venue.name}</h2><p className="mt-2 text-xs leading-5 text-[#697267]">{item.venue.address}</p>
      <p className="mt-4 text-sm leading-6 text-[#52624c]">{item.review.assessment.reason}</p>
      <p className="mt-3 text-[11px] text-[#7b8575]">Checked {new Date(item.review.checkedAt).toLocaleDateString("en-GB")} · {item.review.frame.source === "streetview" ? "Street View" : "Venue photo"}</p>
      <a href={item.venue.mapsUrl} target="_blank" rel="noreferrer" className="mt-2 text-xs underline">View on Google Maps</a>
      {item.review.frame.source === "places-photo" && <div className="mt-2 text-xs text-[#697267]">Photo: {item.review.frame.attribution.map((a, i) => a.uri ? <a className="mr-2 underline" key={i} href={a.uri} target="_blank" rel="noreferrer">{a.name}</a> : <span className="mr-2" key={i}>{a.name}</span>)}</div>}
      {image && !stale && !project && <div className="mt-5 space-y-3 border-t border-[#d7ddce] pt-4"><label className="block text-xs font-semibold">Project name<input maxLength={160} value={title} onChange={event => setTitle(event.target.value)} className="mt-2 w-full border border-[#bdcbbb] bg-white p-2 text-sm" /></label><label className="flex gap-2 text-xs leading-5 text-[#6b7565]"><input type="checkbox" checked={rights} onChange={event => setRights(event.target.checked)} className="mt-1" />I have the necessary rights to store and use this photo for compositing. Visual approval is not a licence.</label><button className={`${primary} w-full`} disabled={busy || !rights || !title.trim()} onClick={save}>Create project <ArrowRight size={14} /></button></div>}
      {project && <Link href={`/studio?id=${encodeURIComponent(project)}`} className={`${primary} mt-5`}>Open project <ArrowRight size={14} /></Link>}
      {error && <p role="alert" className="mt-3 text-sm text-[#944d43]">{error}</p>}
      <div className="mt-auto flex items-center justify-between gap-2 pt-5"><button className="text-xs underline disabled:opacity-50" disabled={disabled || busy} onClick={onReassess}>Reassess this venue</button><button aria-label={`Remove ${item.venue.name} from shortlist`} className="p-2 text-[#936451] hover:bg-[#f2e5d8] disabled:opacity-50" disabled={busy || disabled} onClick={remove}><Trash2 size={15} /></button></div>
    </div>
  </article>;
}
