"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, ExternalLink, MapPin, Search } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { StreetViewPicker, type StreetViewSelection } from "@/components/street-view-picker";
import type { GoogleSearchResult, GoogleVenue } from "@/lib/google/types";
import { findProject, saveProject, type Project } from "@/lib/projects";

export default function GoogleDiscovery() {
  const router = useRouter();
  const [location, setLocation] = useState("Soho");
  const [category, setCategory] = useState("cafe");
  const [results, setResults] = useState<GoogleSearchResult | null>(null);
  const [selected, setSelected] = useState<GoogleVenue | null>(null);
  const [frame, setFrame] = useState<StreetViewSelection | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [projectError, setProjectError] = useState("");
  const [projectTitle, setProjectTitle] = useState("");

  function choose(venue: GoogleVenue) {
    if (selected?.placeId === venue.placeId) return;
    setSelected(venue);
    setFrame(null);
    setProjectTitle("");
    setProjectError("");
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searching) return;
    setSearching(true);
    setError("");
    setResults(null);
    setSelected(null);
    setFrame(null);
    setProjectError("");
    try {
      const response = await fetch("/api/google/venues", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location, category }), cache: "no-store",
      });
      const result = await response.json() as GoogleSearchResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "Venue search failed.");
      setResults(result);
      // Let the user choose a prospect; the first API result is not an endorsed storefront.
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Venue search failed.");
    } finally {
      setSearching(false);
    }
  }

  function createProject() {
    if (!selected) return;
    const title = projectTitle.trim();
    if (!title) { setProjectError("Give this project a name first."); return; }
    if (!frame) { setProjectError("Load and choose a street view before saving this project."); return; }
    const id = `google-${selected.placeId}`;
    const existing = findProject(id);
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

  return <main className="min-h-screen bg-[#efeee6] text-[#23332a]">
    <AppHeader active="discover" />
    <section className="border-b border-[#d8d9cb] bg-[#e6e7d9]">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-6 py-14 md:grid-cols-[1fr_410px] md:px-10">
        <div>
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-[#587460]">Venue discovery / London</p>
          <h1 className="font-serif text-5xl leading-none tracking-[-0.035em] text-[#173c2d] md:text-[72px]">Find the frontage.<br /><em className="font-normal">Find the opportunity.</em></h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-[#5d6c5e]">Explore active hospitality venues, salons and boutiques with a physical street address. Compare nearby outdoor street views and choose an entrance for your next project.</p>
          <Link href="/osm" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#436b4b] hover:underline">Try OpenStreetMap / Mapillary <ArrowRight size={14} /></Link>
        </div>
        <form onSubmit={search} className="self-end border border-[#cbd2c1] bg-[#f8f7ef] p-6 shadow-[0_24px_52px_rgba(31,54,34,0.09)]">
          <label htmlFor="google-location" className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-[#3c6046]">London area</label>
          <div className="flex items-center gap-2 border-b border-[#aebba7]"><Search size={17} className="text-[#64806b]" /><input id="google-location" value={location} onChange={(event) => setLocation(event.target.value)} className="w-full bg-transparent py-3 outline-none" placeholder="Soho or a London postcode" /></div>
          <label htmlFor="google-category" className="mb-2 mt-5 block text-xs font-bold uppercase tracking-[0.16em] text-[#3c6046]">Business type</label>
          <select id="google-category" value={category} onChange={(event) => setCategory(event.target.value)} className="w-full border-b border-[#aebba7] bg-transparent py-3 outline-none"><option value="cafe">Cafes</option><option value="restaurant">Restaurants</option><option value="bar">Bars & pubs</option><option value="hair salon">Hair salons</option><option value="shop">Clothing boutiques</option></select>
          <button disabled={searching || location.trim().length < 2} className="mt-6 flex w-full items-center justify-between bg-[#204f39] px-5 py-4 text-sm font-semibold text-white disabled:opacity-60">{searching ? "Finding suitable prospects…" : "Find venue prospects"}<ArrowRight size={17} /></button>
          <p className="mt-3 text-xs leading-5 text-[#7c8879]">Operational listings only. Known chains and internal premises are filtered out. Images load after confirmation.</p>
        </form>
      </div>
    </section>

    <section className="mx-auto max-w-[1440px] px-6 py-12 md:px-10">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3 border-b border-[#d3d6ca] pb-5"><div><p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#68816c]">The prospect shortlist</p><h2 className="font-serif text-4xl text-[#1e3d2e]">{results ? `${results.venues.length} venue prospects` : "Search for an opportunity."}</h2>{results && <p className="mt-3 text-sm text-[#7a887b]">{results.totalFound} listings considered in {results.location}. Independence and frontage suitability need confirmation.</p>}</div><span className="text-xs text-[#7a887b]">Google Maps · live listings</span></div>
      {error && <div role="alert" className="mb-6 border-l-4 border-[#a5564c] bg-[#f6e9e3] px-5 py-4 text-sm text-[#6b3b37]">{error}</div>}
      {searching && <p role="status" className="mb-6 border border-[#cbd6c4] bg-[#f5f7ee] p-5 text-sm text-[#4c7255]">Checking operating status, business type and street address…</p>}
      {!results && !searching && <div className="grid min-h-56 place-items-center border border-dashed border-[#c5cabb] bg-[#f7f6ee] text-center"><div><MapPin className="mx-auto mb-3 text-[#77927c]" /><p className="font-serif text-2xl">Start with a London neighbourhood.</p><p className="mt-2 text-sm text-[#758277]">Choose a prospect, then compare its street camera views.</p></div></div>}
      {results && <>
        {results.excluded && results.excluded.length > 0 && <details className="mb-6 border border-[#d3dacb] bg-[#f6f7ee] px-5 py-4 text-sm text-[#65775f]"><summary className="cursor-pointer font-medium">{results.excluded.reduce((sum, item) => sum + item.count, 0)} listings excluded from the shortlist</summary><ul className="mt-3 space-y-1 text-xs leading-6">{results.excluded.map((item) => <li key={item.reason}>{item.count} · {item.reason}</li>)}</ul></details>}
        <div className="grid gap-7 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.5fr)]">
          <div className="max-h-[900px] overflow-auto border border-[#d9d5c9] bg-[#f8f7f0]">
            <div className="sticky top-0 z-10 border-b border-[#d9d5c9] bg-[#f8f7f0] px-5 py-4 text-xs font-bold uppercase tracking-[0.15em] text-[#607666]">Select a prospect · {results.venues.length}</div>
            {results.venues.map((venue, index) => <button key={venue.placeId} type="button" onClick={() => choose(venue)} className={`flex w-full gap-4 border-b border-[#e3e2d8] px-5 py-4 text-left hover:bg-[#e9eee3] ${selected?.placeId === venue.placeId ? "bg-[#e1e9dc]" : ""}`}><span className="pt-1 text-xs text-[#83927f]">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0"><span className="block font-serif text-xl text-[#233c2b]">{venue.name}</span><span className="mt-1 block text-xs leading-5 text-[#6e7a6e]">{venue.address}</span><span className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#507650]"><Check size={11} /> Listed as operational</span></span><ArrowRight size={16} className="ml-auto mt-1 shrink-0 text-[#809381]" /></button>)}
            {results.venues.length === 0 && <p className="p-5 text-sm leading-6 text-[#6e7b69]">No listings met these criteria. Try another category or a nearby London area.</p>}
          </div>
          <div className="border border-[#d9d5c9] bg-[#f9f8f2]">
            {selected ? <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#deded2] p-5"><div><p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b8d79]">{selected.category} / venue prospect</p><h3 className="font-serif text-3xl text-[#1f3129]">{selected.name}</h3><p className="mt-2 text-sm text-[#697267]">{selected.address}</p></div><a href={selected.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#1d5a42] hover:underline">View on Google Maps <ExternalLink size={12} /></a><div className="flex w-full flex-wrap gap-2">{selected.prospectReasons?.map((reason) => <span key={reason} className="border border-[#c9d7c3] bg-[#eaf0e4] px-2 py-1 text-[10px] text-[#56754f]">{reason}</span>)}</div></div>
              <StreetViewPicker key={selected.placeId} venue={selected} onSelection={setFrame} />
              <div className="space-y-3 border-t border-[#deded2] p-5"><label htmlFor="project-title" className="block text-xs font-bold uppercase tracking-[0.12em] text-[#526a57]">Project name</label><input id="project-title" value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} placeholder="e.g. Soho cafe concept" className="w-full border border-[#bfcbbd] bg-[#fffefa] px-3 py-3 text-sm outline-none focus:border-[#4f795a]" /><p className="text-xs leading-5 text-[#859184]">Load a view and inspect the entrance before saving. Your chosen camera and framing will be remembered.</p><button type="button" disabled={!frame} onClick={createProject} className="flex w-full items-center justify-between bg-[#204f39] px-5 py-4 text-sm font-semibold text-white hover:bg-[#193d2d] disabled:cursor-not-allowed disabled:opacity-50">Save selected view to library <ArrowRight size={17} /></button>{projectError && <p role="alert" className="text-sm text-[#9a584d]">{projectError}</p>}</div>
            </> : <div className="grid min-h-[420px] place-items-center p-8 text-center"><div><MapPin className="mx-auto mb-4 text-[#7b9578]" size={30} /><p className="font-serif text-2xl text-[#3a583d]">Choose a venue to explore its frontage.</p><p className="mt-3 max-w-sm text-sm leading-6 text-[#7b8a75]">Each prospect passed the listing checks. Selecting one finds nearby outdoor cameras without loading image previews.</p></div></div>}
          </div>
        </div>
      </>}
    </section>
  </main>;
}
