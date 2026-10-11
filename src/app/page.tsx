"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, LoaderCircle, MapPin, Plus } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { FrontagePlaceholder } from "@/components/frontage-placeholder";
import { PlanterLibrary } from "@/components/planter-library";
import { ProjectActions } from "@/components/library-actions";
import { readProjects, projectImageUrl, type Project } from "@/lib/projects";

export default function LibraryPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void readProjects().then(result => {
      if (active) {
        setProjects(result); setError("");
        const params = new URLSearchParams(window.location.search);
        if (["project", "planter"].includes(params.get("deleted") || "")) {
          setNotice(params.get("cleanup") === "1" ? "Removed from the library, but some stored files could not be deleted. Storage cleanup may be needed." : "Deleted from the shared library, including saved images.");
          params.delete("deleted"); params.delete("cleanup");
          window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`);
        }
      }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not load projects."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  return <main className="min-h-screen bg-[#f0f0e8] text-[#263c2e]">
    <AppHeader active="library" />
    <section className="mx-auto max-w-[1460px] px-6 py-10 md:px-10 md:py-14">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[#d2d8cb] pb-5"><div><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6c896f]">Saved work</p><h2 className="font-serif text-4xl tracking-[-0.025em] text-[#244533]">Project library</h2></div><Link href="/google" className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#326148] hover:underline"><Plus size={16} /> Add a venue</Link></div>
      {error && <div role="alert" className="mb-5 flex flex-wrap items-center gap-4 text-sm text-[#944d43]">{error}<button type="button" onClick={() => { setLoading(true); setError(""); setAttempt(value => value + 1); }} className="font-semibold underline">Try again</button></div>}
      {notice && <p role="status" className="mb-5 border-l-2 border-[#78977a] bg-[#e5eddf] px-4 py-3 text-sm text-[#496b50]">{notice}</p>}
      {loading && <p role="status" className="mb-6 flex items-center gap-2 text-sm text-[#627a66]"><LoaderCircle size={16} className="animate-spin" />Loading saved projects…</p>}
      <Link href="/examples" className="mb-6 flex flex-wrap items-center justify-between gap-3 border border-[#b9cbb3] bg-[#e3ebdc] px-5 py-4 text-sm text-[#31533a]"><span><strong>Submission examples</strong><span className="ml-2">Automatically selected venues, before & after, and the supplied products.</span></span><ArrowRight size={18} /></Link>
      {!loading && !error && projects.length === 0 && <p className="mb-6 text-sm text-[#627a66]">No saved projects yet. Discover a venue and save its selected frontage to get started.</p>}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project, index) => <article key={project.id} className="overflow-hidden border border-[#d5d9cd] bg-[#fbfaf5] shadow-[0_10px_22px_rgba(45,60,40,0.04)]">
          <Link href={"/studio?id=" + encodeURIComponent(project.id)} aria-label={"Open " + project.title + " in Studio"} className="group block transition-colors hover:bg-[#f3f5ec]">
            {projectImageUrl(project) ? <div className="h-[220px] overflow-hidden bg-[#dce4d8]"><img src={projectImageUrl(project)} alt={"Frontage for " + project.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]" /></div> : <FrontagePlaceholder variant={index} compact />}
            <div className="flex min-h-[116px] items-end justify-between gap-4 p-5">
              <div className="min-w-0"><h3 className="break-words font-serif text-[29px] leading-tight text-[#254733]">{project.title}</h3>{project.address && <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-[#768376]"><MapPin size={13} className="mt-0.5 shrink-0" />{project.address}</p>}</div>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#ccd6c6] text-[#315e44] transition-colors group-hover:border-[#315e44] group-hover:bg-[#315e44] group-hover:text-white"><ArrowUpRight size={18} /></span>
            </div>
          </Link>
          <div className="border-t border-[#e1e4d9] px-5 py-1"><ProjectActions project={project} onUpdated={updated => setProjects(current => current.map(item => item.id === updated.id ? updated : item))} onDeleted={warning => { setProjects(current => current.filter(item => item.id !== project.id)); setNotice(warning || "Deleted “" + project.title + "” and its saved images."); }} /></div>
        </article>)}
        <Link href="/google" className="flex min-h-[370px] flex-col items-center justify-center border border-dashed border-[#aebdaf] bg-[#edf1e9] p-8 text-center transition-colors hover:bg-[#e3ebe0]"><span className="mb-5 grid h-14 w-14 place-items-center rounded-full border border-[#9bae9a] text-[#4c7455]"><Plus size={23} strokeWidth={1.6} /></span><span className="font-serif text-2xl text-[#32543c]">Start a new project</span><span className="mt-2 max-w-[230px] text-sm leading-6 text-[#7a8a7b]">Find a real London venue and bring it into the studio.</span><span className="mt-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#416c4a]">Open venue search <ArrowRight size={14} /></span></Link>
      </div>
      <PlanterLibrary />
    </section>
  </main>;
}
