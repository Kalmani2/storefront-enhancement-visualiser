"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Camera, ExternalLink, MapPin, Search } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import type { GoogleSearchResult, GoogleVenue, StreetViewMetadata } from "@/lib/google/types";
import { findProject, saveProject, type Project } from "@/lib/projects";

async function postJson<T>(path: string, body: object): Promise<T> {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "The request failed.");
  return payload as T;
}

export default function GoogleComparison() {
  const router = useRouter();
  const [location, setLocation] = useState("Soho");
  const [category, setCategory] = useState("cafe");
  const [results, setResults] = useState<GoogleSearchResult | null>(null);
  const [selected, setSelected] = useState<GoogleVenue | null>(null);
  const [metadata, setMetadata] = useState<StreetViewMetadata | null>(null);
  const [offset, setOffset] = useState(0);
  const [imageUrl, setImageUrl] = useState("");
  const [searching, setSearching] = useState(false);
  const [checking, setChecking] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const imageRef = useRef("");
  const selectionId = useRef(0);

  useEffect(() => () => { if (imageRef.current) URL.revokeObjectURL(imageRef.current); }, []);

  function clearImage() {
    if (imageRef.current) URL.revokeObjectURL(imageRef.current);
    imageRef.current = "";
    setImageUrl("");
  }

  async function choose(venue: GoogleVenue) {
    const requestId = ++selectionId.current;
    setSelected(venue);
    setMetadata(null);
    setOffset(0);
    setImageError("");
    setProjectTitle("");
    clearImage();
    setChecking(true);
    try {
      const result = await postJson<StreetViewMetadata>("/api/google/streetview/metadata", { venue });
      if (requestId === selectionId.current) setMetadata(result);
    } catch (cause) {
      if (requestId === selectionId.current) setImageError(cause instanceof Error ? cause.message : "Camera lookup failed.");
    } finally {
      if (requestId === selectionId.current) setChecking(false);
    }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searching) return;
    ++selectionId.current;
    setSearching(true);
    setError("");
    setImageError("");
    setResults(null);
    setSelected(null);
    setMetadata(null);
    clearImage();
    try {
      const result = await postJson<GoogleSearchResult>("/api/google/venues", { location, category });
      setResults(result);
      if (result.venues[0]) void choose(result.venues[0]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Places search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function loadImage() {
    if (!selected || !metadata?.available || loadingImage) return;
    if (!window.confirm("This loads one paid Google Street View image. Continue?")) return;
    const requestedSelection = selectionId.current;
    setLoadingImage(true);
    setImageError("");
    try {
      const response = await fetch("/api/google/streetview/image", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue: selected, offset }), cache: "no-store",
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "Street View image failed.");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      if (requestedSelection !== selectionId.current) { URL.revokeObjectURL(objectUrl); return; }
      clearImage();
      imageRef.current = objectUrl;
      setImageUrl(objectUrl);
    } catch (cause) {
      setImageError(cause instanceof Error ? cause.message : "Street View image failed.");
    } finally {
      setLoadingImage(false);
    }
  }

  function createProject() {
    if (!selected) return;
    const title = projectTitle.trim();
    if (!title) { setImageError("Give this project a name first."); return; }
    const id = `google-${selected.placeId}`;
    const existing = findProject(id);
    const project: Project = {
      id,
      title,
      source: "google",
      venueId: selected.placeId,
      sourceUrl: `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(selected.placeId)}`,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      image: imageUrl && metadata?.panoId ? {
        provider: "google-street-view",
        panoId: metadata.panoId,
        headingOffset: offset,
        captureDate: metadata.date,
      } : existing?.image,
      configuration: existing?.configuration,
    };
    saveProject(project);
    router.push("/");
  }

  return <main className="min-h-screen bg-[#efeee6] text-[#23332a]">
    <AppHeader active="discover" />
    <section className="border-b border-[#d8d9cb] bg-[#e6e7d9]"><div className="mx-auto grid max-w-[1440px] gap-10 px-6 py-14 md:grid-cols-[1fr_410px] md:px-10"><div><p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-[#587460]">Venue discovery / Google Places</p><h1 className="font-serif text-5xl leading-none tracking-[-0.035em] text-[#173c2d] md:text-[72px]">Find the frontage.<br /><em className="font-normal">Face it directly.</em></h1><p className="mt-6 max-w-xl text-base leading-7 text-[#5d6c5e]">Search London venues, inspect a Street View candidate, then add the venue to your project library. Images are viewed live and never saved.</p><Link href="/osm" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#436b4b] hover:underline">Try OpenStreetMap / Mapillary <ArrowRight size={14} /></Link></div><form onSubmit={search} className="self-end border border-[#cbd2c1] bg-[#f8f7ef] p-6 shadow-[0_24px_52px_rgba(31,54,34,0.09)]"><label htmlFor="google-location" className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-[#3c6046]">London area</label><div className="flex items-center gap-2 border-b border-[#aebba7]"><Search size={17} className="text-[#64806b]" /><input id="google-location" value={location} onChange={(event) => setLocation(event.target.value)} className="w-full bg-transparent py-3 outline-none" placeholder="Soho" /></div><label htmlFor="google-category" className="mb-2 mt-5 block text-xs font-bold uppercase tracking-[0.16em] text-[#3c6046]">Business type</label><select id="google-category" value={category} onChange={(event) => setCategory(event.target.value)} className="w-full border-b border-[#aebba7] bg-transparent py-3 outline-none"><option value="cafe">Cafes</option><option value="restaurant">Restaurants</option><option value="bar">Bars</option><option value="hair salon">Hair salons</option><option value="shop">Shops</option></select><button disabled={searching || location.trim().length < 2} className="mt-6 flex w-full items-center justify-between bg-[#204f39] px-5 py-4 text-sm font-semibold text-white disabled:opacity-60">{searching ? "Searching…" : "Search Google Places"}<ArrowRight size={17} /></button><p className="mt-3 text-xs leading-5 text-[#7c8879]">A Places search uses one request. No Street View image loads automatically.</p></form></div></section>
    <section className="mx-auto max-w-[1440px] px-6 py-12 md:px-10"><div className="mb-7 flex flex-wrap items-end justify-between gap-3 border-b border-[#d3d6ca] pb-5"><div><p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#68816c]">Venue search</p><h2 className="font-serif text-4xl text-[#1e3d2e]">{results ? `${results.venues.length} Google Places results` : "Search for a venue."}</h2></div><span className="text-xs text-[#7a887b]">Google Maps content · live preview</span></div>
      {error && <div role="alert" className="mb-6 border-l-4 border-[#a5564c] bg-[#f6e9e3] px-5 py-4 text-sm text-[#6b3b37]">{error}</div>}
      {!results && !searching && <div className="grid min-h-56 place-items-center border border-dashed border-[#c5cabb] bg-[#f7f6ee] text-center"><div><MapPin className="mx-auto mb-3 text-[#77927c]" /><p className="font-serif text-2xl">Search a London area to begin.</p><p className="mt-2 text-sm text-[#758277]">Select a result to inspect its entrance image and start a project.</p></div></div>}
      {results && <div className="grid gap-7 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.5fr)]"><div className="max-h-[760px] overflow-auto border border-[#d9d5c9] bg-[#f8f7f0]"><div className="sticky top-0 z-10 border-b border-[#d9d5c9] bg-[#f8f7f0] px-5 py-4 text-xs font-bold uppercase tracking-[0.15em] text-[#607666]">Select a business · {results.venues.length}</div>{results.venues.map((venue, index) => <button key={venue.placeId} type="button" onClick={() => void choose(venue)} className={`flex w-full gap-4 border-b border-[#e3e2d8] px-5 py-4 text-left hover:bg-[#e9eee3] ${selected?.placeId === venue.placeId ? "bg-[#e1e9dc]" : ""}`}><span className="pt-1 text-xs text-[#83927f]">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0"><span className="block font-serif text-xl text-[#233c2b]">{venue.name}</span><span className="mt-1 block text-xs leading-5 text-[#6e7a6e]">{venue.address}</span></span><ArrowRight size={16} className="ml-auto mt-1 shrink-0 text-[#809381]" /></button>)}{results.venues.length === 0 && <p className="p-5 text-sm">No places returned. Try another category or area.</p>}</div>
        <div className="border border-[#d9d5c9] bg-[#f9f8f2]">{selected && <><div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#deded2] p-5"><div><p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b8d79]">{selected.category} / Google Places</p><h3 className="font-serif text-3xl text-[#1f3129]">{selected.name}</h3><p className="mt-2 text-sm text-[#697267]">{selected.address}</p></div><a href={selected.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#1d5a42] hover:underline">View on Google Maps <ExternalLink size={12} /></a></div>
          <div className="flex min-h-[420px] items-center justify-center bg-[#d7d9cf]">{imageUrl ? <img src={imageUrl} alt={`Street View candidate aimed at ${selected.name}`} className="w-full max-w-[640px] object-contain" /> : <div className="px-8 text-center"><Camera className="mx-auto mb-4 text-[#748674]" size={34} /><p className="font-serif text-2xl text-[#3a4e3d]">{checking ? "Finding an outdoor camera…" : metadata?.available ? "Camera located. Ready to preview." : metadata?.reason || "Choose a venue to locate a camera."}</p><p className="mt-3 text-sm text-[#738174]">Images are fetched only when you request one.</p></div>}</div>
          <div className="space-y-4 p-5">{metadata?.available && <><p className="text-sm text-[#647264]">Nearest camera {metadata.distanceMetres}m away · aimed at {metadata.heading}°{metadata.date ? ` · captured ${metadata.date}` : ""}. The Google coordinate may be inside the building, so verify the actual storefront visually.</p><div className="flex flex-wrap items-center gap-3"><label htmlFor="heading" className="text-xs font-semibold uppercase tracking-[0.12em] text-[#526a57]">Fine-tune heading</label><select id="heading" value={offset} onChange={(event) => { setOffset(Number(event.target.value)); clearImage(); }} className="border border-[#bfcbbd] bg-[#f5f6ee] px-3 py-2 text-sm"><option value={-30}>30° left</option><option value={-15}>15° left</option><option value={0}>Centre on business</option><option value={15}>15° right</option><option value={30}>30° right</option></select></div><button type="button" disabled={loadingImage} onClick={() => void loadImage()} className="flex items-center gap-2 border border-[#27513a] px-4 py-3 text-sm font-semibold text-[#27513a] hover:bg-[#e8eee3] disabled:opacity-60">{loadingImage ? "Loading image…" : "Load 1 paid Street View image"}<ArrowRight size={15} /></button><p className="text-xs text-[#879186]">One image per click; confirmation required.</p></>}{imageError && <p role="alert" className="border-l-2 border-[#a5564c] bg-[#f6e9e3] p-3 text-sm text-[#6b3b37]">{imageError}</p>}<div className="border-t border-[#deded2] pt-5"><label htmlFor="project-title" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-[#526a57]">Project name</label><input id="project-title" value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} placeholder="e.g. Soho cafe concept" className="w-full border border-[#bfcbbd] bg-[#fffefa] px-3 py-3 text-sm outline-none focus:border-[#4f795a]" /><p className="mt-2 text-xs leading-5 text-[#859184]">Choose your own label. Only this name and the venue ID are saved in your browser.</p><button type="button" onClick={createProject} className="mt-4 flex w-full items-center justify-between bg-[#204f39] px-5 py-4 text-sm font-semibold text-white hover:bg-[#193d2d]">Add to project library <ArrowRight size={17} /></button></div><p className="border-t border-[#deded2] pt-4 text-xs leading-5 text-[#6f7c70]"><span className="font-semibold text-[#424a43]" style={{ fontFamily: "Roboto, sans-serif" }}>Google Maps</span>{metadata?.copyright ? ` · ${metadata.copyright}` : ""} · This is an unverified Street View candidate, displayed for comparison only. It is not persisted or used in a composite.</p></div>
        </>}</div></div>}</section>
  </main>;
}
