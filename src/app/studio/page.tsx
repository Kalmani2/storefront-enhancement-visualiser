"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Camera, Check, ExternalLink, Image as ImageIcon, LockKeyhole, MapPin, Sparkles } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { FrontagePlaceholder } from "@/components/frontage-placeholder";
import { PlanterPlaceholder } from "@/components/planter-placeholder";
import { planterOptions } from "@/lib/planters";
import { findProject, saveProject, type Project } from "@/lib/projects";
import type { GoogleVenue, StreetViewMetadata } from "@/lib/google/types";

export default function StudioPage() {
  const [project, setProject] = useState<Project | null>(null);
  const [venueDetails, setVenueDetails] = useState<GoogleVenue | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const previewRef = useRef("");

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const id = new URLSearchParams(window.location.search).get("id");
      setProject(id ? findProject(id) || null : null);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  function updateConfiguration(next: Partial<NonNullable<Project["configuration"]>>) {
    if (!project) return;
    const updated: Project = {
      ...project,
      configuration: {
        planter: project.configuration?.planter || "classic",
        quantity: project.configuration?.quantity || 2,
        placement: project.configuration?.placement || "both",
        ...next,
      },
    };
    saveProject(updated);
    setProject(updated);
  }

  async function loadGooglePreview() {
    if (!project || project.source !== "google" || loading) return;
    if (!window.confirm("This retrieves live Google venue details and loads one paid Street View image. Continue?")) return;
    setLoading(true);
    setError("");
    try {
      const detailResponse = await fetch(`/api/google/place?placeId=${encodeURIComponent(project.venueId)}`, { cache: "no-store" });
      const details = await detailResponse.json() as GoogleVenue & { error?: string };
      if (!detailResponse.ok) throw new Error(details.error || "Venue details could not be loaded.");
      setVenueDetails(details);
      const offset = project.image?.provider === "google-street-view" ? project.image.headingOffset : 0;
      const metadataResponse = await fetch("/api/google/streetview/metadata", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ venue: details }), cache: "no-store",
      });
      const metadata = await metadataResponse.json() as StreetViewMetadata & { error?: string };
      if (!metadataResponse.ok || !metadata.available || !metadata.panoId) throw new Error(metadata.error || metadata.reason || "No outdoor Street View camera is available.");
      const imageResponse = await fetch("/api/google/streetview/image", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ venue: details, offset }), cache: "no-store",
      });
      if (!imageResponse.ok) {
        const payload = await imageResponse.json() as { error?: string };
        throw new Error(payload.error || "Street View image failed.");
      }
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      const url = URL.createObjectURL(await imageResponse.blob());
      previewRef.current = url;
      setPreviewUrl(url);
      const updated: Project = {
        ...project,
        image: { provider: "google-street-view", panoId: metadata.panoId, headingOffset: offset, captureDate: metadata.date },
      };
      saveProject(updated);
      setProject(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the venue image.");
    } finally {
      setLoading(false);
    }
  }

  const configuration = project?.configuration || { planter: "classic", quantity: 2, placement: "both" };
  const mapillaryImage = project?.image?.provider === "mapillary" ? project.image : null;
  const hasImage = Boolean(previewUrl || mapillaryImage);

  return <main className="min-h-screen bg-[#f0f0e8] text-[#263c2e]">
    <AppHeader active="library" />
    <section className="mx-auto max-w-[1460px] px-6 py-8 md:px-10 md:py-10">
      <div className="mb-9 flex flex-wrap items-end justify-between gap-5 border-b border-[#d3d8cd] pb-7"><div><Link href="/" className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#6a806e] hover:underline"><ArrowLeft size={14} /> Project library</Link><h1 className="font-serif text-5xl leading-none tracking-[-0.035em] text-[#1e4230] md:text-[64px]">{project?.title || "Choose a project"}</h1>{project && <p className="mt-4 flex items-center gap-2 text-sm text-[#758577]"><MapPin size={15} />{venueDetails?.address || project.address || "Google venue details available on preview"} · {project.source === "google" ? "Google Places" : "OpenStreetMap"}</p>}</div></div>
      {!project ? <div className="grid min-h-96 place-items-center border border-dashed border-[#bcc8ba] bg-[#f8f8f2] text-center"><div><p className="font-serif text-3xl">No project selected.</p><Link href="/" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#2f6642] hover:underline">Open the library <ArrowRight size={15} /></Link></div></div> :
      <div className="grid gap-7 xl:grid-cols-[minmax(0,1.15fr)_minmax(350px,0.85fr)]">
        <div className="space-y-6">
          <div className="overflow-hidden border border-[#d7d9cd] bg-[#fbfaf5]">
            <div className="flex items-center justify-between gap-3 border-b border-[#e1e4d9] px-5 py-4"><span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#627963]">01 / Source frontage</span><span className="text-xs text-[#8a988b]">{hasImage ? "Candidate preview" : "No image displayed"}</span></div>
            {previewUrl ? <div className="flex min-h-[390px] items-center justify-center bg-[#d2d9ce]"><img src={previewUrl} alt={`Unverified Street View candidate for ${project.title}`} className="max-h-[620px] w-full object-contain" /></div> : mapillaryImage ? <div className="flex min-h-[390px] items-center justify-center bg-[#d2d9ce]"><img src={mapillaryImage.url} alt={`Unverified Mapillary candidate for ${project.title}`} className="max-h-[620px] w-full object-contain" /></div> : <FrontagePlaceholder />}
            <div className="space-y-3 p-5"><p className="text-sm leading-6 text-[#758476]">{project.source === "google" ? "Only the Street View panorama reference and framing are saved. Load the image to inspect it; the image is not stored in the project." : mapillaryImage ? "This nearby photo is still an unverified entrance candidate. Confirm the storefront visually before any real visualisation." : "This project needs a suitable, verified entrance image before a real visualisation can be made."}</p>
              {project.source === "google" ? <button type="button" onClick={() => void loadGooglePreview()} disabled={loading} className="inline-flex items-center gap-2 border border-[#37694b] px-4 py-2.5 text-sm font-semibold text-[#2c6241] hover:bg-[#e7eee4] disabled:opacity-50"><Camera size={16} />{loading ? "Loading Street View…" : previewUrl ? "Reload Street View image" : "Load selected Street View"}</button> : <Link href="/osm" className="inline-flex items-center gap-2 border border-[#37694b] px-4 py-2.5 text-sm font-semibold text-[#2c6241] hover:bg-[#e7eee4]"><ImageIcon size={16} />Browse Mapillary candidates</Link>}
              {error && <p role="alert" className="border-l-2 border-[#a75c52] bg-[#f5eae4] px-3 py-2 text-sm text-[#784841]">{error}</p>}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e1e4d9] pt-3 text-xs text-[#7c897b]"><span>{project.image?.provider === "google-street-view" ? "Google Maps · framing reference saved" : project.image?.provider === "mapillary" ? `Mapillary · photo by ${project.image.creator}` : "Image selection pending"}</span><a href={venueDetails?.mapsUrl || project.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#366549] hover:underline">View venue source <ExternalLink size={12} /></a></div>
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <div className="border border-[#d7d9cd] bg-[#fbfaf5] p-6"><h2 className="font-serif text-3xl text-[#244533]">Choose your planters.</h2>
            <fieldset className="mt-6"><legend className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[#4f6b55]">Planter</legend><div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">{planterOptions.map((option) => <button key={option.id} type="button" aria-pressed={configuration.planter === option.id} onClick={() => updateConfiguration({ planter: option.id })} className={`overflow-hidden border text-left transition-colors ${configuration.planter === option.id ? "border-[#477051] bg-[#ebf1e8] ring-1 ring-[#477051]" : "border-[#dedfd4] bg-[#f9f9f2] hover:bg-[#f1f3eb]"}`}><div className="h-36"><PlanterPlaceholder variant={option.id} /></div><span className="flex items-center justify-between gap-2 px-3 py-3 text-sm font-semibold text-[#36573f]">{option.title}{configuration.planter === option.id && <Check size={16} className="shrink-0 text-[#467a50]" />}</span></button>)}</div></fieldset>
            <div className="mt-6 grid gap-5 sm:grid-cols-2"><label className="text-xs font-bold uppercase tracking-[0.12em] text-[#4f6b55]">Quantity<select value={configuration.quantity} onChange={(event) => updateConfiguration({ quantity: Number(event.target.value) })} className="mt-2 w-full border border-[#d4dbcf] bg-[#f9f9f4] px-3 py-3 text-sm font-normal normal-case tracking-normal text-[#31503a]"><option value={1}>1 planter</option><option value={2}>2 planters</option><option value={3}>3 planters</option><option value={4}>4 planters</option></select></label><label className="text-xs font-bold uppercase tracking-[0.12em] text-[#4f6b55]">Placement<select value={configuration.placement} onChange={(event) => updateConfiguration({ placement: event.target.value as "left" | "right" | "both" })} className="mt-2 w-full border border-[#d4dbcf] bg-[#f9f9f4] px-3 py-3 text-sm font-normal normal-case tracking-normal text-[#31503a]"><option value="both">Both sides</option><option value="left">Left side</option><option value="right">Right side</option></select></label></div>
          </div>
          <div className="border border-[#d7d9cd] bg-[#e7ece2] p-6"><p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#65826b]"><Sparkles size={14} /> 03 / Render & review</p><h2 className="font-serif text-3xl text-[#244533]">See the possibility.</h2><p className="mt-3 text-sm leading-6 text-[#718172]">Generation, before/after comparison, acceptance and retry controls will be connected after the planter assets and compositing pipeline exist.</p><button type="button" onClick={() => setNotice("Preview generation is not connected yet. Your planter choices are saved in this browser.")} className="mt-6 flex w-full items-center justify-between bg-[#28533c] px-5 py-4 text-sm font-semibold text-white hover:bg-[#1d4632]">Generate concept <LockKeyhole size={16} /></button>{notice && <p role="status" className="mt-3 text-xs leading-5 text-[#5f765f]">{notice}</p>}</div>
        </div>
      </div>}
    </section>
  </main>;
}
