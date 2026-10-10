"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, LoaderCircle, Upload } from "lucide-react";
import { PlanterPlaceholder } from "./planter-placeholder";
import { planterOptions } from "@/lib/planters";
import { planterFileUrl, revisionFile, type PlanterAsset, type PlanterLibraryResult } from "@/lib/planters/types";
import { uploadImage } from "@/lib/upload-image";

export function PlanterLibrary() {
  const router = useRouter();
  const [library, setLibrary] = useState<PlanterLibraryResult | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await fetch("/api/planters", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not open the planter library.");
        if (active) { setLibrary(payload); setError(""); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Could not open the planter library."); }
      if (active) timer = setTimeout(load, 5000);
    }
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, []);

  async function upload(file: File) {
    if (uploading || !library || library.uploadsAvailable === false) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("image", file);
      const response = library.storage === "supabase"
        ? await fetch("/api/planters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upload: await uploadImage(file, "planter") }) })
        : await fetch("/api/planters", { method: "POST", body: form });
      const asset = await response.json() as PlanterAsset & { error?: string };
      if (!response.ok) throw new Error(asset.error || "The image could not be uploaded.");
      router.push(`/planters/${asset.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed."); setUploading(false); }
  }

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void upload(file);
    event.target.value = "";
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void upload(file);
  }

  return <section aria-labelledby="planter-library-title" className="mt-16">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[#d2d8cb] pb-5"><h2 id="planter-library-title" className="font-serif text-4xl tracking-[-0.025em] text-[#244533]">Planter library</h2><span className="text-xs text-[#768376]">{library?.assets.length ? `${library.assets.length} saved ${library.assets.length === 1 ? "arrangement" : "arrangements"}` : "Plants + containers, together"}</span></div>
    {error && <p role="alert" className="mb-5 border-l-2 border-[#a75c52] bg-[#f5eae4] px-4 py-3 text-sm text-[#784841]">{error}</p>}
    {library?.message && <p className="mb-5 text-sm text-[#916b4c]">{library.message}</p>}
    {library && library.uploadsAvailable !== false && !library.configured && !library.message && <p className="mb-5 text-sm text-[#916b4c]">Add OPENAI_API_KEY to .env.local and restart the server to enable extraction. Uploads and saved assets are available now.</p>}
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      {library?.assets.map(asset => {
        const revision = asset.revisions.find(r => r.id === asset.approvedRevisionId) || asset.revisions.at(-1);
        return <Link key={asset.id} href={`/planters/${asset.id}`} className="group overflow-hidden border border-[#d5d9cd] bg-[#fbfaf5] transition-colors hover:border-[#78977f]">
          <div className={`relative flex h-56 items-center justify-center p-5 ${revision ? "planter-checker" : "bg-[#e8e9df]"}`}><img src={planterFileUrl(asset.id, revision ? revisionFile(revision.id) : "source.png")} alt={asset.name} className="h-full w-full object-contain" />{asset.approvedRevisionId && <span className="absolute left-3 top-3 inline-flex items-center gap-1 bg-[#f8faf4] px-2 py-1 text-[10px] font-semibold text-[#356444]"><Check size={12} />Approved</span>}</div>
          <div className="border-t border-[#e1e4d9] p-4"><div className="flex items-center justify-between gap-3"><h3 className="truncate font-serif text-2xl text-[#254733]">{asset.name}</h3><ArrowUpRight size={16} className="shrink-0 text-[#55745c]" /></div><p className="mt-2 flex items-center gap-1.5 text-xs text-[#7a8879]">{asset.status === "processing" && <LoaderCircle size={13} className="animate-spin" />}{asset.status === "processing" ? "Extracting…" : asset.status === "error" ? "Extraction needs attention" : asset.status === "uploaded" ? "Ready to extract" : asset.status === "approved" ? "Ready to use" : "Review result"}</p></div>
        </Link>;
      })}
      {library?.assets.length === 0 && planterOptions.map(planter => <div key={planter.id} className="overflow-hidden border border-[#d5d9cd] bg-[#fbfaf5]"><div className="h-56"><PlanterPlaceholder variant={planter.id} /></div><div className="border-t border-[#e1e4d9] p-4"><h3 className="font-serif text-2xl text-[#254733]">{planter.title}</h3><p className="mt-2 text-xs text-[#819080]">Placeholder</p></div></div>)}
      <button type="button" disabled={uploading || !library || library.uploadsAvailable === false} onClick={() => fileInput.current?.click()} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop} className={`flex min-h-[330px] flex-col items-center justify-center border border-dashed p-6 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${dragging ? "border-[#37654a] bg-[#dce8d9]" : "border-[#aebdaf] bg-[#edf1e9] hover:bg-[#e3ebe0]"}`}>
        <span className="mb-4 grid h-14 w-14 place-items-center rounded-full border border-[#9bae9a] text-[#4c7455]">{uploading ? <LoaderCircle size={22} className="animate-spin" /> : <Upload size={22} strokeWidth={1.6} />}</span><span className="font-serif text-2xl text-[#32543c]">{uploading ? "Saving your image…" : "Add a planter image"}</span><span className="mt-2 text-sm leading-6 text-[#7a8a7b]">Drop a photo here or choose a file.</span><span className="mt-4 text-xs text-[#7a8a7b]">JPEG, PNG or WebP · up to 20 MB</span>
      </button>
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} className="sr-only" aria-label="Upload planter image" />
    </div>
  </section>;
}
