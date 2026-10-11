"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ExternalLink, LoaderCircle, MapPin, Search } from "lucide-react";
import { FrontageDiscovery, type FrontageDiscoveryHandle } from "@/components/frontage-discovery";
import { StreetViewPicker, type StreetViewSelection } from "@/components/street-view-picker";
import type { GoogleSearchResult, GoogleVenue } from "@/lib/google/types";
import { findProject, saveProject, type Project } from "@/lib/projects";

export function VenueSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GoogleSearchResult | null>(null);
  const [selected, setSelected] = useState<GoogleVenue | null>(null);
  const [frame, setFrame] = useState<StreetViewSelection | null>(null);
  const [searching, setSearching] = useState(false), [error, setError] = useState("");
  const [projectError, setProjectError] = useState(""), [projectTitle, setProjectTitle] = useState("");
  const [savingProject, setSavingProject] = useState(false);
  const discovery = useRef<FrontageDiscoveryHandle>(null);

  function choose(venue: GoogleVenue) {
    if (selected?.placeId === venue.placeId) return;
    setSelected(venue); setFrame(null); setProjectTitle(venue.name); setProjectError("");
  }
  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (searching) return;
    setSearching(true); setError(""); setResults(null); setSelected(null); setFrame(null); setProjectError(""); setProjectTitle("");
    try {
      const response = await fetch("/api/google/venues", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "direct", query }), cache: "no-store" });
      const result = await response.json() as GoogleSearchResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "Venue search failed.");
      setResults(result);
      if (result.venues[0]) { setSelected(result.venues[0]); setProjectTitle(result.venues[0].name); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Venue search failed."); }
    finally { setSearching(false); }
  }
  async function createProject() {
    if (!selected || savingProject) return;
    const title = projectTitle.trim();
    if (!title || !frame) { setProjectError("Name your project and choose a loaded image first."); return; }
    setSavingProject(true);
    try {
      const id = `google-${selected.placeId}`, existing = await findProject(id);
      if (existing?.image) { setProjectError("This venue already has a project. Open it from the library to keep its saved image."); return; }
      const project: Project = {
        id, title, source: "google", venueId: selected.placeId, sourceUrl: selected.mapsUrl,
        createdAt: existing?.createdAt ?? new Date().toISOString(), address: selected.address, category: selected.category, notes: existing?.notes,
        image: { provider: "google-street-view", panoId: frame.candidate.panoId, headingOffset: frame.offset, heading: (frame.candidate.heading + frame.offset + 360) % 360, pitch: frame.candidate.pitch, fov: frame.fov, captureDate: frame.candidate.date }, configuration: existing?.configuration,
      };
      await saveProject(project);
      if (!frame.imageUrl) throw new Error("Reload the selected image first.");
      const snapshot = new FormData(); snapshot.set("image", await (await fetch(frame.imageUrl)).blob(), "street-view.jpg");
      snapshot.set("candidateToken", frame.candidate.token); snapshot.set("offset", String(frame.offset)); snapshot.set("fov", String(frame.fov));
      const saved = await fetch(`/api/projects/${encodeURIComponent(id)}/source`, { method: "POST", body: snapshot });
      if (!saved.ok) throw new Error((await saved.json()).error || "Could not save the selected image.");
      router.push("/");
    } catch (cause) { setProjectError(cause instanceof Error ? cause.message : "The project could not be saved."); }
    finally { setSavingProject(false); }
  }

  return <>
    <section id="venue-search" aria-label="Venue search" className="border-b border-[#d6d9cc] bg-[#e5e8dc]">
      <div className="mx-auto max-w-[1440px] px-6 py-8 md:px-10">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#698168]">Real places. Better entrances.</p>
        <h1 className="font-serif text-4xl tracking-tight text-[#244533]">Venue search</h1>
        <form onSubmit={search} className="mt-6 flex flex-col gap-3 sm:flex-row">
          <label className="flex flex-1 items-center gap-3 border border-[#b5c3ae] bg-[#fffef8] px-4 focus-within:border-[#315e44]"><Search size={19} className="shrink-0 text-[#6c8268]" /><span className="sr-only">Search</span><input required minLength={3} maxLength={200} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search a London business or street address" className="min-w-0 w-full bg-transparent py-4 text-sm outline-none" /></label>
          <button disabled={searching || query.trim().length < 3} className="inline-flex min-w-32 items-center justify-center gap-3 bg-[#254e3b] px-6 py-3 text-sm font-semibold text-white hover:bg-[#193e2d] disabled:opacity-50">{searching ? <><LoaderCircle size={16} className="animate-spin" />Searching…</> : <>Search <ArrowRight size={16} /></>}</button>
        </form>
        <p className="mt-3 text-xs text-[#687b65]">Know the place? Search here. Looking for opportunities? Discover three suitable venues below.</p>
        {error && <p role="alert" className="mt-4 text-sm text-[#944d43]">{error}</p>}
      </div>
    </section>

    {results && <section aria-label="Search results" className="mx-auto max-w-[1440px] px-6 py-7 md:px-10">
      <div className="mb-5 flex items-center justify-between"><h2 className="font-serif text-2xl">{results.venues.length} {results.venues.length === 1 ? "place" : "places"} found</h2><button onClick={() => { setResults(null); setSelected(null); setFrame(null); }} className="text-xs underline">Clear results</button></div>
      {!results.venues.length ? <p className="border border-[#d2d9cb] bg-[#faf9f2] p-6 text-sm text-[#657662]">No matching London location found. Try the business name and full street address.</p> : <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(250px,.8fr)_minmax(0,1.6fr)]">
        <aside aria-label="Places" className="relative min-h-0 border border-[#d9d5c9] bg-[#f8f7f0]"><div className="max-h-[360px] overflow-y-auto lg:absolute lg:inset-0 lg:max-h-none">{results.venues.map(venue => <button key={venue.placeId} aria-pressed={selected?.placeId === venue.placeId} onClick={() => choose(venue)} className={`w-full border-b border-[#e3e2d8] p-5 text-left hover:bg-[#e9eee3] ${selected?.placeId === venue.placeId ? "bg-[#e1e9dc] shadow-[inset_3px_0_0_#315f43]" : ""}`}><span className="block font-serif text-xl">{venue.name}</span><span className="mt-1 block text-xs leading-5 text-[#6e7a6e]">{venue.address}</span></button>)}</div></aside>
        <div className="min-w-0 border border-[#d9d5c9] bg-[#f9f8f2]">{selected ? <>
          <div className="flex flex-wrap justify-between gap-3 border-b border-[#deded2] p-5"><div><p className="text-[11px] uppercase tracking-wider text-[#688069]">{selected.category}</p><h3 className="mt-2 font-serif text-3xl">{selected.name}</h3><p className="mt-2 text-sm text-[#697267]">{selected.address}</p></div><a href={selected.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#1d5a42]">Google Maps <ExternalLink size={12} /></a></div>
          <div className="border-b border-[#deded2] p-5"><button onClick={() => { discovery.current?.check(selected); document.getElementById("approved-discovery")?.scrollIntoView({ behavior: "smooth" }); }} className="bg-[#254e3b] px-4 py-2.5 text-sm font-semibold text-white">Check this frontage automatically</button><p className="mt-2 text-xs text-[#738171]">One check runs the assessment, retries and fallback photos. Or choose your own view below.</p></div>
          <StreetViewPicker key={selected.placeId} venue={selected} onSelection={setFrame} />
          <div className="space-y-3 border-t border-[#deded2] p-5"><label className="block text-xs font-semibold">Project name<input maxLength={160} value={projectTitle} onChange={event => setProjectTitle(event.target.value)} className="mt-2 w-full border border-[#bfcbbd] bg-[#fffefa] px-3 py-3 text-sm" /></label><button disabled={savingProject || !frame || !projectTitle.trim()} onClick={createProject} className="flex w-full items-center justify-between bg-[#204f39] px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-50">{savingProject ? "Saving project…" : "Save project to library"}<ArrowRight size={16} /></button>{projectError && <p role="alert" className="text-sm text-[#9a584d]">{projectError}</p>}</div>
        </> : <div className="grid min-h-[350px] place-items-center p-8 text-center"><div><MapPin className="mx-auto mb-4 text-[#7b9578]" size={25} /><p className="font-serif text-2xl">Choose a place to view its frontage.</p></div></div>}</div>
      </div>}
    </section>}
    <FrontageDiscovery ref={discovery} />
  </>;
}
