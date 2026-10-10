"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Image as ImageIcon, MapPin, Plus, Upload } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { FrontagePlaceholder } from "@/components/frontage-placeholder";
import { PlanterPlaceholder } from "@/components/planter-placeholder";
import { planterOptions } from "@/lib/planters";
import { readProjects, starterProjects, type Project } from "@/lib/projects";

export default function LibraryPage() {
  const [projects, setProjects] = useState<Project[]>(starterProjects);
  const [uploadedImage, setUploadedImage] = useState("");
  const [uploadedName, setUploadedName] = useState("");
  const uploadRef = useRef("");
  useEffect(() => {
    const frame = requestAnimationFrame(() => setProjects(readProjects()));
    return () => {
      cancelAnimationFrame(frame);
      if (uploadRef.current) URL.revokeObjectURL(uploadRef.current);
    };
  }, []);

  function choosePlanterImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (uploadRef.current) URL.revokeObjectURL(uploadRef.current);
    const url = URL.createObjectURL(file);
    uploadRef.current = url;
    setUploadedImage(url);
    setUploadedName(file.name);
  }

  return <main className="min-h-screen bg-[#f0f0e8] text-[#263c2e]">
    <AppHeader active="library" />
    <section className="relative overflow-hidden border-b border-[#d6d9cc] bg-[#e5e8dc]">
      <div className="pointer-events-none absolute -right-20 -top-64 h-[620px] w-[620px] rounded-full border border-[#cad3c4]" />
      <div className="pointer-events-none absolute -right-4 -top-48 h-[490px] w-[490px] rounded-full border border-[#cad3c4]" />
      <div className="relative mx-auto grid max-w-[1460px] gap-8 px-6 py-14 md:grid-cols-[1fr_auto] md:items-end md:px-10 md:py-20">
        <div><p className="mb-5 text-[11px] font-bold uppercase tracking-[0.21em] text-[#627d65]">Your workspace / London storefronts</p><h1 className="max-w-3xl font-serif text-5xl leading-[0.98] tracking-[-0.04em] text-[#1d4231] md:text-[78px]">A better first<br /><em className="font-normal">impression starts here.</em></h1><p className="mt-7 max-w-xl text-base leading-7 text-[#607263]">Explore current venue projects, find a new storefront, and prepare a planter visualisation in one place.</p></div>
        <Link href="/google" className="group flex h-14 items-center gap-8 self-end bg-[#254e3b] px-6 text-sm font-semibold text-white shadow-[0_12px_26px_rgba(23,59,40,0.12)] hover:bg-[#193d2e]">Discover a venue <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" /></Link>
      </div>
    </section>
    <section className="mx-auto max-w-[1460px] px-6 py-10 md:px-10 md:py-14">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[#d2d8cb] pb-5"><div><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6c896f]">Saved work</p><h2 className="font-serif text-4xl tracking-[-0.025em] text-[#244533]">Project library</h2></div><Link href="/google" className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#326148] hover:underline"><Plus size={16} /> Add a venue</Link></div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project, index) => <Link href={`/studio?id=${encodeURIComponent(project.id)}`} key={project.id} className="group overflow-hidden border border-[#d5d9cd] bg-[#fbfaf5] shadow-[0_10px_22px_rgba(45,60,40,0.04)] transition-transform hover:-translate-y-1">{project.image?.provider === "mapillary" ? <div className="relative h-[220px] bg-[#dce4d8]"><img src={project.image.url} alt={`Unverified nearby image candidate for ${project.title}`} className="h-full w-full object-cover" /><span className="absolute bottom-3 left-3 bg-[#f8f8f1] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#45654c]">Unverified photo · Mapillary</span></div> : <FrontagePlaceholder variant={index} compact />}<div className="p-5"><div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6c826e]">{project.category || (project.source === "google" ? "Google Places" : "Venue")}</span><span className="text-[10px] font-semibold text-[#94a092]">{String(index + 1).padStart(2, "0")}</span></div><h3 className="font-serif text-[29px] leading-tight text-[#254733]">{project.title}</h3><p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-[#768376]"><MapPin size={13} className="mt-0.5 shrink-0" />{project.address || "Open project to retrieve live venue details"}</p><div className="mt-5 flex items-center justify-between border-t border-[#e1e4d9] pt-4"><span className={`flex items-center gap-1.5 text-[11px] font-medium ${project.image ? "text-[#3d6d4d]" : "text-[#a07961]"}`}><ImageIcon size={14} />{project.image ? project.image.provider === "mapillary" ? "Candidate photo saved" : "View framing saved" : "Needs entrance image"}</span><ArrowUpRight size={16} className="text-[#55745c] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></div></div></Link>)}
        <Link href="/google" className="flex min-h-[370px] flex-col items-center justify-center border border-dashed border-[#aebdaf] bg-[#edf1e9] p-8 text-center transition-colors hover:bg-[#e3ebe0]"><span className="mb-5 grid h-14 w-14 place-items-center rounded-full border border-[#9bae9a] text-[#4c7455]"><Plus size={23} strokeWidth={1.6} /></span><span className="font-serif text-2xl text-[#32543c]">Start a new project</span><span className="mt-2 max-w-[230px] text-sm leading-6 text-[#7a8a7b]">Find a real London venue and bring it into the studio.</span><span className="mt-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#416c4a]">Open venue search <ArrowRight size={14} /></span></Link>
      </div>
      <div className="mb-6 mt-16 flex items-end justify-between border-b border-[#d2d8cb] pb-5"><h2 className="font-serif text-4xl tracking-[-0.025em] text-[#244533]">Planter library</h2></div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {planterOptions.map((planter) => <div key={planter.id} className="overflow-hidden border border-[#d5d9cd] bg-[#fbfaf5]"><div className="h-52"><PlanterPlaceholder variant={planter.id} /></div><div className="border-t border-[#e1e4d9] px-5 py-4"><h3 className="font-serif text-2xl text-[#254733]">{planter.title}</h3><p className="mt-1 text-xs text-[#819080]">Illustrative placeholder</p></div></div>)}
        <label className="group flex min-h-[284px] cursor-pointer flex-col items-center justify-center border border-dashed border-[#aebdaf] bg-[#edf1e9] p-6 text-center transition-colors hover:bg-[#e3ebe0]"><input type="file" accept="image/*" onChange={choosePlanterImage} className="sr-only" aria-label="Add a planter image" /><span className="mb-4 grid h-14 w-14 place-items-center rounded-full border border-[#9bae9a] text-[#4c7455]"><Upload size={22} strokeWidth={1.6} /></span><span className="font-serif text-2xl text-[#32543c]">Add a planter image</span><span className="mt-2 max-w-[220px] text-sm leading-6 text-[#7a8a7b]">Choose an image to preview it here.</span><span className="mt-5 text-xs font-semibold uppercase tracking-[0.1em] text-[#416c4a]">Choose image <ArrowRight size={14} className="ml-1 inline" /></span></label>
      </div>
      {uploadedImage && <div className="mt-6 flex max-w-sm items-center gap-4 border border-[#d5d9cd] bg-[#fbfaf5] p-3"><img src={uploadedImage} alt="Selected planter upload" className="h-24 w-24 bg-[#e8e9df] object-contain" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#254733]">{uploadedName}</p><p className="mt-1 text-xs leading-5 text-[#7a8a7b]">Image preview only. Planter model creation is not connected yet.</p></div></div>}
    </section>
  </main>;
}
