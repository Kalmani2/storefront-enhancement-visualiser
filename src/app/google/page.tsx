"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ExternalLink, MapPin, Search } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { StreetViewPicker, type StreetViewSelection } from "@/components/street-view-picker";
import type { GoogleSearchResult, GoogleVenue } from "@/lib/google/types";
import { findProject, saveProject, type Project } from "@/lib/projects";

type SearchMode = "prospects" | "direct";

export default function GoogleDiscovery() {
  const router = useRouter();
  const [mode, setMode] = useState<SearchMode>("prospects");
  const [location, setLocation] = useState("Soho");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("cafe");
  const [results, setResults] = useState<GoogleSearchResult | null>(null);
  const [selected, setSelected] = useState<GoogleVenue | null>(null);
  const [frame, setFrame] = useState<StreetViewSelection | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [projectError, setProjectError] = useState("");
  const [projectTitle, setProjectTitle] = useState("");

  function switchMode(next: SearchMode) {
    if (searching || next === mode) return;
    setMode(next); setResults(null); setSelected(null); setFrame(null);
    setError(""); setProjectError(""); setProjectTitle("");
  }

  function choose(venue: GoogleVenue) {
    if (selected?.placeId === venue.placeId) return;
    setSelected(venue); setFrame(null); setProjectTitle(venue.name); setProjectError("");
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searching) return;
    setSearching(true); setError(""); setResults(null); setSelected(null);
    setFrame(null); setProjectError(""); setProjectTitle("");
    try {
      const response = await fetch("/api/google/venues", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "direct" ? { mode, query } : { mode, location, category }), cache: "no-store",
      });
      const result = await response.json() as GoogleSearchResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "Venue search failed.");
      setResults(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Venue search failed."); }
    finally { setSearching(false); }
  }

  function createProject() {
    if (!selected) return;
    const title = projectTitle.trim();
    if (!title) { setProjectError("Enter a project name."); return; }
    if (!frame) { setProjectError("Load the views and choose an image first."); return; }
    const id = `google-${selected.placeId}`, existing = findProject(id);
    const project: Project = {
      id, title, source: "google", venueId: selected.placeId,
      sourceUrl: `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(selected.placeId)}`,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      image: { provider: "google-street-view", panoId: frame.candidate.panoId, headingOffset: frame.offset, fov: frame.fov, captureDate: frame.candidate.date },
      configuration: existing?.configuration,
    };
    try { saveProject(project); router.push("/"); }
    catch { setProjectError("This browser could not save the project. Check whether local storage is available."); }
  }

  const hasResults = Boolean(results);
  return <main className="min-h-screen bg-[#efeee6] text-[#23332a]">
    <AppHeader active="discover" />
    <section aria-label="Venue search" className={`relative isolate flex items-center justify-center overflow-hidden px-6 py-12 md:px-10 ${hasResults ? "min-h-[330px]" : "min-h-[calc(100svh-89px)]"}`}>
      <div className="absolute inset-0 -z-20 bg-[#566b64] bg-[url('/london-skyline.jpg')] bg-cover bg-[center_65%]" />
      <div className="absolute inset-0 -z-10 bg-[#102d24]/30" />
      <h1 className="sr-only">Venue search</h1>
      <form onSubmit={search} className="w-full max-w-[680px] border border-white/50 bg-[#faf9f2]/95 p-6 shadow-[0_20px_70px_rgba(10,30,22,0.25)] backdrop-blur-md sm:p-8">
        <div role="group" aria-label="Search mode" className="mb-6 grid grid-cols-2 border border-[#ccd4c6] bg-[#e9ede3] p-1">
          {([{ value: "prospects", label: "Find prospects" }, { value: "direct", label: "Search a place" }] as const).map(item => <button key={item.value} type="button" aria-pressed={mode === item.value} disabled={searching} onClick={() => switchMode(item.value)} className={`px-3 py-3 text-sm font-semibold transition-colors disabled:opacity-60 ${mode === item.value ? "bg-[#254e3b] text-white shadow-sm" : "text-[#5f7364] hover:bg-[#dce4d7]"}`}>{item.label}</button>)}
        </div>
        {mode === "prospects" ? <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-[#3c6046]" htmlFor="google-location">London area
            <input id="google-location" required maxLength={80} value={location} onChange={event => setLocation(event.target.value)} className="mt-2 w-full border border-[#bbc8b7] bg-[#fffefa] px-3 py-3 text-sm text-[#23332a] outline-none focus:border-[#315e44]" placeholder="Neighbourhood or postcode" />
          </label>
          <label className="block text-xs font-semibold text-[#3c6046]" htmlFor="google-category">Business type
            <select id="google-category" value={category} onChange={event => setCategory(event.target.value)} className="mt-2 w-full border border-[#bbc8b7] bg-[#fffefa] px-3 py-3 text-sm text-[#23332a] outline-none focus:border-[#315e44]"><option value="cafe">Cafes</option><option value="restaurant">Restaurants</option><option value="bar">Bars & pubs</option><option value="hair salon">Hair salons</option><option value="shop">Clothing boutiques</option></select>
          </label>
        </div> : <label htmlFor="google-query" className="block text-xs font-semibold text-[#3c6046]">London business name or address
          <div className="mt-2 flex items-center gap-3 border border-[#bbc8b7] bg-[#fffefa] px-3 focus-within:border-[#315e44]"><Search size={17} className="shrink-0 text-[#69816b]" /><input id="google-query" required minLength={3} maxLength={200} value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 w-full bg-transparent py-3 text-sm text-[#23332a] outline-none" placeholder="e.g. 49 Frith Street, Soho" /></div>
        </label>}
        <button disabled={searching || (mode === "direct" ? query.trim().length < 3 : location.trim().length < 2)} className="mt-5 flex w-full items-center justify-between bg-[#204f39] px-5 py-3.5 text-sm font-semibold text-white hover:bg-[#193e2d] disabled:opacity-60">{searching ? "Searching…" : mode === "direct" ? "Find place" : "Find prospects"}<ArrowRight size={17} /></button>
        {error && <p role="alert" className="mt-4 text-sm text-[#944d43]">{error}</p>}
        {searching && <p role="status" className="sr-only">Searching for places</p>}
      </form>
      <a href="https://unsplash.com" className="absolute bottom-3 right-5 text-[10px] text-white/80 hover:text-white" target="_blank" rel="noreferrer">London · Unsplash</a>
    </section>

    {results && <section aria-label="Search results" className="mx-auto max-w-[1440px] px-6 py-8 md:px-10">
      <div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-[#36523f]">{results.venues.length} {results.venues.length === 1 ? "place" : "places"} found</h2><span className="text-xs text-[#718171]">Google Maps</span></div>
      {results.venues.length === 0 ? <p className="border border-[#d2d9cb] bg-[#faf9f2] p-6 text-sm text-[#657662]">{mode === "direct" ? "No matching London location found. Try the business name and full street address." : "No matches found. Try another area or business type."}</p> :
      <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)]">
        <aside aria-label="Places" className="relative min-h-0 border border-[#d9d5c9] bg-[#f8f7f0]">
          <div className="max-h-[360px] overflow-y-auto lg:absolute lg:inset-0 lg:max-h-none">
            {results.venues.map((venue, index) => <button key={venue.placeId} type="button" aria-pressed={selected?.placeId === venue.placeId} onClick={() => choose(venue)} className={`flex w-full gap-3 border-b border-[#e3e2d8] px-5 py-5 text-left transition-colors hover:bg-[#e9eee3] ${selected?.placeId === venue.placeId ? "bg-[#e1e9dc] shadow-[inset_3px_0_0_#315f43]" : ""}`}><span className="pt-1 text-xs text-[#83927f]">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0"><span className="block font-serif text-xl text-[#233c2b]">{venue.name}</span><span className="mt-1 block text-xs leading-5 text-[#6e7a6e]">{venue.address}</span></span><ArrowRight size={15} className="ml-auto mt-1 shrink-0 text-[#809381]" /></button>)}
          </div>
        </aside>
        <div className="min-w-0 border border-[#d9d5c9] bg-[#f9f8f2]">
          {selected ? <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#deded2] p-5"><div className="min-w-0"><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#688069]">{selected.category}</p><h3 className="font-serif text-3xl text-[#1f3129]">{selected.name}</h3><p className="mt-2 text-sm text-[#697267]">{selected.address}</p></div><a href={selected.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-[#1d5a42] hover:underline">Google Maps <ExternalLink size={12} /></a></div>
            <StreetViewPicker key={selected.placeId} venue={selected} onSelection={setFrame} />
            <div className="space-y-3 border-t border-[#deded2] p-5"><label htmlFor="project-title" className="block text-xs font-semibold text-[#526a57]">Project name</label><input id="project-title" maxLength={160} value={projectTitle} onChange={event => { setProjectTitle(event.target.value); setProjectError(""); }} placeholder="Name your project" className="w-full border border-[#bfcbbd] bg-[#fffefa] px-3 py-3 text-sm outline-none focus:border-[#4f795a]" /><p className="text-xs leading-5 text-[#738171]">{frame ? "Your selected view and framing will be saved with this project." : "Load the views above, then choose an image to save."}</p><button type="button" disabled={!frame || !projectTitle.trim()} onClick={createProject} className="flex w-full items-center justify-between bg-[#204f39] px-5 py-3.5 text-sm font-semibold text-white hover:bg-[#193d2d] disabled:cursor-not-allowed disabled:opacity-50">Save project to library <ArrowRight size={17} /></button>{projectError && <p role="alert" className="text-sm text-[#9a584d]">{projectError}</p>}</div>
          </> : <div className="grid min-h-[480px] place-items-center p-8 text-center"><div><MapPin className="mx-auto mb-4 text-[#7b9578]" size={28} /><p className="font-serif text-2xl text-[#3a583d]">Choose a place to view its frontage.</p></div></div>}
        </div>
      </div>}
    </section>}
  </main>;
}
