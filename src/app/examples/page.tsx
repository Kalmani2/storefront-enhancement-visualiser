/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { listProjects } from "@/lib/project-store";
import { readComposition } from "@/lib/composition/store";
import { compositionFileUrl } from "@/lib/composition/types";
import { readStoredAsset } from "@/lib/planters/store";
import { planterFileUrl, revisionFile } from "@/lib/planters/types";

export const dynamic = "force-dynamic";

async function loadExamples() {
  const projects = (await listProjects()).filter(project => project.frontageReview && project.image);
  const entries = await Promise.all(projects.map(async project => {
    const state = await readComposition(project);
    const version = state.versions.filter(v => v.enhancedFile && v.review?.status === "passed").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!version) return null;
    const products = await Promise.all([...new Map(version.placements.map(p => [`${p.assetId}:${p.revisionId}`, p])).values()].map(async placement => ({ asset: await readStoredAsset(placement.assetId), revisionId: placement.revisionId })));
    return { project, version, products };
  }));
  return entries.filter(entry => entry !== null);
}

export default async function ExamplesPage() {
  let examples: Awaited<ReturnType<typeof loadExamples>> = [], failed = false;
  try { examples = await loadExamples(); } catch { failed = true; }
  return <main className="min-h-screen bg-[#f0f0e8] text-[#263c2e]">
    <AppHeader active="library" />
    <section className="mx-auto max-w-[1320px] px-6 py-10 md:px-10">
      <Link href="/" className="text-sm underline">Back to library</Link>
      <p className="mb-3 mt-8 text-xs uppercase tracking-[.18em] text-[#6c896f]">From discovery to proposal</p>
      <h1 className="font-serif text-4xl md:text-5xl">Submission examples</h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-[#627663]">Automatically selected London venues, their real frontage photographs and the supplied planter products. Layouts were adjusted in the studio; compositions passed the image review. These are proposals, not photographs of installed products.</p>
      <p className="mt-3 text-xs text-[#627663]">Viewing saved examples does not call Google or an AI model. Image reuse rights were asserted by the project owner.</p>
      {failed ? <p role="alert" className="mt-8 text-sm text-[#944d43]">Examples could not be loaded from storage. Please reload to try again.</p> : !examples.length ? <p className="mt-8">No reviewed compositions from automatically selected venues yet. <Link href="/google" className="underline">Open Discover</Link>.</p> : <div className="mt-10 space-y-10">
        {examples.map(({ project, version, products }, index) => <article key={project.id} className="border border-[#d2d8cb] bg-[#fbfaf5]">
          <div className="flex flex-wrap items-start justify-between gap-4 p-6"><div><p className="text-xs uppercase tracking-widest text-[#6c896f]">Example {String(index + 1).padStart(2, "0")} · Automatically selected</p><h2 className="mt-2 font-serif text-3xl">{project.title}</h2><p className="mt-2 text-sm text-[#627663]">{project.address}</p></div><Link href={`/studio?id=${encodeURIComponent(project.id)}`} className="inline-flex items-center gap-2 bg-[#254e3b] px-4 py-3 text-sm text-white">Open in studio <ArrowRight size={15} /></Link></div>
          <div className="grid gap-px bg-[#d2d8cb] md:grid-cols-2">
            <figure className="bg-[#e7eadf]"><img src={`/api/projects/${encodeURIComponent(project.id)}/image`} alt={`Original frontage of ${project.title}`} className="aspect-[4/3] w-full object-contain" /><figcaption className="bg-[#f6f5ed] px-6 py-3 text-xs">Before · {project.frontageReview?.source === "streetview" ? "Street View" : "Places photo fallback"} · {project.frontageReview?.attribution}</figcaption></figure>
            <figure className="bg-[#e7eadf]"><img src={compositionFileUrl(project.id, version.enhancedFile!)} alt={`Planter proposal for ${project.title}`} className="aspect-[4/3] w-full object-contain" /><figcaption className="bg-[#f6f5ed] px-6 py-3 text-xs">After · AI visualisation · {version.review?.manual ? "Manually approved with concerns" : "Automated review passed"}</figcaption></figure>
          </div>
          <div className="grid gap-8 p-6 md:grid-cols-[1.3fr_1fr]"><div><h3 className="text-sm font-semibold">Why this venue qualified</h3><p className="mt-2 text-sm leading-6 text-[#627663]">{project.frontageReview?.reason}</p><p className="mt-3 text-xs text-[#627663]">Assessed {new Date(project.frontageReview!.checkedAt).toLocaleDateString("en-GB", { timeZone: "Europe/London" })}. {project.sourceUrl && <a href={project.sourceUrl} target="_blank" rel="noreferrer" className="underline">Venue and address on Google Maps</a>}</p><details className="mt-4 text-xs leading-6 text-[#627663]"><summary className="cursor-pointer font-semibold">Composition review & provenance</summary><p>{version.review?.summary}</p>{version.review?.issues.map((issue, i) => <p key={i}>{issue}</p>)}<p className="break-all">Assessment: {project.frontageReview?.assessmentId}<br />Composition: {version.id}<br />Model: {version.model}. Scale and reconstructed product detail remain approximate.</p></details></div>
            <div><h3 className="mb-3 text-sm font-semibold">Actual supplied product</h3>{products.map(({ asset, revisionId }) => <div key={`${asset.id}:${revisionId}`} className="flex items-center gap-4"><a href={planterFileUrl(asset.id, revisionFile(revisionId))} target="_blank" rel="noreferrer"><img loading="lazy" src={planterFileUrl(asset.id, revisionFile(revisionId))} alt={asset.name} className="h-32 w-24 object-contain" /></a><div><p className="text-sm">{asset.name}</p><p className="mt-1 text-xs text-[#627663]">{asset.originalFilename}</p><a href={planterFileUrl(asset.id, asset.originalFile)} target="_blank" rel="noreferrer" className="mt-3 block text-xs underline">View original product photograph</a><a href={planterFileUrl(asset.id, revisionFile(revisionId))} target="_blank" rel="noreferrer" className="mt-2 block text-xs underline">View extracted product used</a></div></div>)}</div>
          </div>
        </article>)}
      </div>}
    </section>
  </main>;
}
