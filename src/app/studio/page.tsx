"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { StorefrontComposer } from "@/components/storefront-composer";
import { findProject, type Project } from "@/lib/projects";

export default function StudioPage() {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load() {
      try {
        const id = new URLSearchParams(window.location.search).get("id");
        const current = id ? await findProject(id) : undefined;
        if (!current) throw new Error("Choose a project from the library.");
        if (current.image?.provider !== "google-street-view") throw new Error("Choose a Street View image in Venue search for this project.");
        let saved = current;
        if (!current.image.storagePath) {
          const response = await fetch(`/api/projects/${encodeURIComponent(current.id)}/source`, { method: "POST", signal: controller.signal });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "The selected Street View could not be loaded.");
          saved = result;
        }
        if (active) setProject(saved);
      } catch (cause) { if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The project could not be opened."); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, []);
  return <main className="min-h-screen bg-[#f0f0e8] text-[#263c2e]">
    <AppHeader active="library" />
    <section className="mx-auto max-w-[1460px] px-5 py-8 md:px-10">
      <Link href="/" className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-[#627a66]"><ArrowLeft size={14} />Project library</Link>
      {loading ? <div role="status" className="flex min-h-80 items-center justify-center gap-3 text-sm text-[#627a66]"><LoaderCircle className="animate-spin" size={18} />Opening selected Street View…</div> : project ? <><h1 className="mb-7 font-serif text-4xl text-[#20452f] md:text-5xl">{project.title}</h1><StorefrontComposer key={project.id} project={project} /></> : <div className="border border-[#d0d8ca] bg-[#faf9f2] p-8"><p role="alert" className="mb-5 text-sm text-[#86594b]">{error}</p><Link href="/google" className="text-sm font-semibold text-[#315e44] underline">Open Venue search</Link></div>}
    </section>
  </main>;
}
