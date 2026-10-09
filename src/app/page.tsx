"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, type FormEvent } from "react";
import { ArrowRight, ExternalLink, Image as ImageIcon, MapPin, Search, Sparkles } from "lucide-react";
import type { FrontageImage, FrontageResult, SearchResult, Venue } from "@/lib/discovery/types";

type ImageResult = { images: FrontageImage[]; found: number };

async function postJson<T>(path: string, body: object): Promise<T> {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
  return payload as T;
}

export default function Home() {
  const [location, setLocation] = useState("Soho");
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [selected, setSelected] = useState<Venue | null>(null);
  const [photos, setPhotos] = useState<Record<string, ImageResult>>({});
  const [loadingPhotos, setLoadingPhotos] = useState<string[]>([]);
  const [activePhoto, setActivePhoto] = useState(0);
  const [verification, setVerification] = useState<FrontageResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");

  async function loadPhotos(venue: Venue) {
    setLoadingPhotos((previous) => [...previous, venue.id]);
    try {
      const result = await postJson<ImageResult>("/api/images", { venue });
      setPhotos((previous) => ({ ...previous, [venue.id]: result }));
    } catch (cause) {
      setPhotoError(cause instanceof Error ? cause.message : "Street-image lookup failed.");
    } finally {
      setLoadingPhotos((previous) => previous.filter((id) => id !== venue.id));
    }
  }

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running) return;
    setRunning(true);
    setError("");
    setPhotoError("");
    setSearch(null);
    setSelected(null);
    setPhotos({});
    setVerification(null);
    try {
      const result = await postJson<SearchResult>("/api/discovery", { location });
      setSearch(result);
      const first = result.venues[0];
      if (first) {
        setSelected(first);
        void loadPhotos(first);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Venue discovery failed.");
    } finally {
      setRunning(false);
    }
  }

  function selectVenue(venue: Venue) {
    setSelected(venue);
    setActivePhoto(0);
    setVerification(null);
    setPhotoError("");
    if (!photos[venue.id] && !loadingPhotos.includes(venue.id)) void loadPhotos(venue);
  }

  async function verify() {
    if (!selected || !image || verifying) return;
    if (!window.confirm("This checks one photo with the paid OpenAI API. Run this single assessment?")) return;
    setVerifying(true);
    setPhotoError("");
    try {
      setVerification(await postJson<FrontageResult>("/api/frontage", { venue: selected, imageId: image.id }));
    } catch (cause) {
      setPhotoError(cause instanceof Error ? cause.message : "Visual verification failed.");
    } finally {
      setVerifying(false);
    }
  }

  const imageResult = selected ? photos[selected.id] : undefined;
  const image = imageResult?.images[activePhoto];
  const photoIsLoading = selected ? loadingPhotos.includes(selected.id) : false;

  return (
    <main className="min-h-screen bg-[#efeee6] text-[#23332a]">
      <header className="border-b border-[#d8d9cb] bg-[#f6f5ed]">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-5 md:px-10">
          <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#1e4d39] text-[#e8ecdd]"><Sparkles size={17} /></span><span className="text-sm font-bold uppercase tracking-[0.16em]">Storefront <span className="font-normal">Visualiser</span></span></div>
          <span className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7f8878] sm:block">Discovery / London pilot</span>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-[#d8d9cb] bg-[#e6e7d9]">
        <div className="pointer-events-none absolute -right-24 -top-44 h-[540px] w-[540px] rounded-full border border-[#cbd3bd]" />
        <div className="pointer-events-none absolute -right-6 -top-24 h-[420px] w-[420px] rounded-full border border-[#cbd3bd]" />
        <div className="mx-auto grid max-w-[1440px] gap-12 px-6 py-16 md:grid-cols-[minmax(0,1fr)_390px] md:px-10 md:py-20">
          <div className="relative max-w-2xl"><p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#57745f]">01 / Discover new opportunities</p><h1 className="font-serif text-5xl leading-[0.99] tracking-[-0.035em] text-[#173c2d] md:text-[76px]">Find the next<br /><em className="font-normal">frontage.</em></h1><p className="mt-7 max-w-lg text-base leading-7 text-[#5b6a5c]">Find real London businesses, browse nearby street photographs, and decide which entrances deserve a closer look.</p></div>
          <form onSubmit={run} className="relative self-end border border-[#cbd2c1] bg-[#f8f7ef] p-6 shadow-[0_24px_52px_rgba(31,54,34,0.09)]"><label htmlFor="location" className="mb-3 block text-xs font-bold uppercase tracking-[0.16em] text-[#3c6046]">Where should we look?</label><div className="flex items-center gap-2 border-b border-[#aebba7] pb-2"><Search size={18} className="text-[#64806b]" /><input id="location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Soho, London" className="w-full bg-transparent py-2 text-lg outline-none placeholder:text-[#99a494]" /></div><p className="mt-3 text-xs text-[#7c8879]">Try Soho or another London neighbourhood / postcode.</p><button disabled={running || !location.trim()} className="mt-6 flex w-full items-center justify-between bg-[#204f39] px-5 py-4 text-sm font-semibold text-white transition-colors hover:bg-[#153e2c] disabled:cursor-not-allowed disabled:opacity-60">{running ? "Searching venues…" : "Discover venues"}<ArrowRight size={17} /></button></form>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-6 py-12 md:px-10 md:py-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5 border-b border-[#d3d6ca] pb-6"><div><p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#68816c]">The prospect shortlist</p><h2 className="font-serif text-4xl tracking-[-0.025em] text-[#1e3d2e]">{search ? search.location.split(",")[0] + " venues" : "Real places. Real potential."}</h2></div>{search && <p className="text-sm text-[#697468]">{search.totalFound} mapped records · {search.venues.length} candidates</p>}</div>
        {error && <div role="alert" className="mb-8 border-l-4 border-[#a5564c] bg-[#f6e9e3] px-5 py-4 text-sm text-[#6b3b37]">{error}</div>}
        {running && <div role="status" className="mb-8 flex items-center gap-3 border border-[#d5dbcd] bg-[#f8f9f2] px-5 py-4 text-sm text-[#2f5d42]"><span className="h-3 w-3 animate-pulse rounded-full bg-[#49865b]" />Searching OpenStreetMap for businesses…</div>}
        {!search && !running && <div className="grid min-h-64 place-items-center border border-dashed border-[#c5cabb] bg-[#f7f6ee] text-center"><div className="max-w-xs px-5"><MapPin className="mx-auto mb-4 text-[#77927c]" size={28} /><p className="font-serif text-2xl text-[#244532]">Start with a place.</p><p className="mt-2 text-sm leading-6 text-[#798578]">Search Soho above to explore mapped venues and nearby street photos.</p></div></div>}

        {search && <div className="grid gap-7 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.5fr)]">
          <div className="max-h-[750px] overflow-auto border border-[#d9d5c9] bg-[#f8f7f0]"><div className="sticky top-0 z-10 border-b border-[#d9d5c9] bg-[#f8f7f0] px-5 py-4 text-xs font-bold uppercase tracking-[0.15em] text-[#607666]">Select a business · {search.venues.length} results</div>{search.venues.map((venue, index) => <button key={venue.id} type="button" onClick={() => selectVenue(venue)} className={`flex w-full gap-4 border-b border-[#e3e2d8] px-5 py-4 text-left transition-colors hover:bg-[#e9eee3] ${selected?.id === venue.id ? "bg-[#e1e9dc]" : ""}`}><span className="pt-1 text-xs text-[#83927f]">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0"><span className="block font-serif text-xl leading-tight text-[#233c2b]">{venue.name}</span><span className="mt-1 block text-xs text-[#6e7a6e]">{venue.category} · {venue.address}{venue.postcode ? `, ${venue.postcode}` : ""}</span></span><ArrowRight size={16} className="ml-auto mt-1 shrink-0 text-[#809381]" /></button>)}{search.venues.length === 0 && <p className="p-5 text-sm text-[#687669]">No mapped businesses found in this area.</p>}</div>

          <div className="min-h-[470px] border border-[#d9d5c9] bg-[#f9f8f2] shadow-[0_12px_32px_rgba(35,45,29,0.06)]">{selected && <><div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#deded2] p-5"><div><p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b8d79]">{selected.category} / candidate venue</p><h3 className="font-serif text-3xl text-[#1f3129]">{selected.name}</h3><p className="mt-2 text-sm text-[#697267]">{selected.address}{selected.postcode ? `, ${selected.postcode}` : ""}</p></div><a href={selected.osmUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#1d5a42] hover:underline">OpenStreetMap <ExternalLink size={12} /></a></div>
            <div className="relative flex min-h-[360px] items-center justify-center bg-[#d7d9cf]">{image ? <><img src={image.url} alt={`Nearby street image candidate for ${selected.name}`} className="max-h-[550px] w-full object-contain" /><span className="absolute left-4 top-4 bg-[#f7f6ee] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#36563d]">Nearby photo · entrance unverified</span></> : <div className="px-8 text-center"><ImageIcon size={32} className="mx-auto mb-3 text-[#748674]" /><p className="font-serif text-xl text-[#3a4e3d]">{photoIsLoading ? "Looking for street photographs…" : "No suitable nearby photograph found"}</p><p className="mt-2 text-sm text-[#738174]">{photoIsLoading ? "Mapillary images are ranked by proximity and camera direction." : "Try another business from the list."}</p></div>}</div>
            {imageResult && imageResult.images.length > 1 && <div className="flex gap-2 overflow-auto border-b border-[#deded2] p-3">{imageResult.images.map((candidate, index) => <button type="button" key={candidate.id} onClick={() => setActivePhoto(index)} aria-label={`View photo candidate ${index + 1}`} className={`h-16 w-24 shrink-0 overflow-hidden border-2 ${activePhoto === index ? "border-[#1d5a42]" : "border-transparent"}`}><img src={candidate.url} alt="" className="h-full w-full object-cover" /></button>)}</div>}
            <div className="space-y-4 p-5"><p className="text-sm leading-6 text-[#647264]">These are nearby Mapillary photos, not confirmed images of this entrance. Camera position and direction narrow the search; visual verification is a separate step.</p>{image && <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#6d786d]"><span>{image.distanceMetres}m from mapped venue{image.headingDifference !== undefined ? ` · ${image.headingDifference}° camera offset` : ""}</span><a href={image.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#1d5a42] hover:underline">Photo by {image.creator} <ExternalLink size={12} /></a></div>}{photoError && <p role="alert" className="border-l-2 border-[#a5564c] bg-[#f6e9e3] p-3 text-sm text-[#6b3b37]">{photoError}</p>}{image && <><button type="button" disabled={verifying} onClick={verify} className="flex items-center gap-2 border border-[#27513a] px-4 py-3 text-sm font-semibold text-[#27513a] hover:bg-[#e8eee3] disabled:opacity-60">{verifying ? "Checking entrance…" : "Run 1 paid AI check"}<ArrowRight size={15} /></button><p className="text-xs text-[#879186]">One selected photo per click. Maximum three checks per server run; browsing never calls OpenAI.</p></>}{verification && <p className={`border-l-2 p-3 text-sm ${verification.image ? "border-[#41774b] bg-[#e5eee2]" : "border-[#a8785b] bg-[#f3ebe2]"}`}>{verification.image ? "Confirmed: " : "Not confirmed: "}{verification.reason}</p>}</div>
          </>}</div>
        </div>}

        <div className="mt-12 grid gap-6 border-t border-[#d3d6ca] pt-8 text-sm text-[#687669] md:grid-cols-3"><p><span className="block font-serif text-xl text-[#254732]">01 / Find</span>Business records come from OpenStreetMap.</p><p><span className="block font-serif text-xl text-[#254732]">02 / Inspect</span>Nearby Mapillary photographs are ranked by distance and camera direction.</p><p><span className="block font-serif text-xl text-[#254732]">03 / Verify</span>Optional OpenAI vision checks signage, entrance visibility and planter suitability.</p></div><p className="mt-8 text-xs text-[#899485]">Venue data © OpenStreetMap contributors · Street imagery © Mapillary contributors, CC BY-SA</p>
      </section>
    </main>
  );
}
