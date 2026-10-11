"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, LoaderCircle, Upload } from "lucide-react";
import { PlanterActions } from "./library-actions";
import { planterFileUrl, revisionFile, type PlanterAsset, type PlanterLibraryResult } from "@/lib/planters/types";
import { uploadImage } from "@/lib/upload-image";

export function PlanterLibrary() {
  const router = useRouter();
  const [library, setLibrary] = useState<PlanterLibraryResult | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[#d2d8cb] pb-5"><h2 id="planter-library-title" className="font-serif text-4xl tracking-[-0.025em] text-[#244533]">Planter library</h2><span className="text-xs text-[#768376]">{library?.assets.length ? `${library.assets.length} saved ${library.assets.length === 1 ? "arrangement" : "arrangements"}` : "Saved arrangements"}</span></div>
    {error && <p role="alert" className="mb-5 border-l-2 border-[#a75c52] bg-[#f5eae4] px-4 py-3 text-sm text-[#784841]">{error}</p>}
    {notice && <p role="status" className="mb-5 border-l-2 border-[#78977a] bg-[#e5eddf] px-4 py-3 text-sm text-[#496b50]">{notice}</p>}
    {!library && !error && <p role="status" className="mb-5 flex items-center gap-2 text-sm text-[#627a66]"><LoaderCircle size={16} className="animate-spin" />Loading saved planters…</p>}
    {library?.assets.length === 0 && <p className="mb-5 text-sm text-[#627a66]">No planters yet. Upload a product photo to prepare your first arrangement.</p>}
    {library?.message && <p className="mb-5 text-sm text-[#916b4c]">{library.message}</p>}
    {library && library.uploadsAvailable !== false && !library.configured && !library.message && <p className="mb-5 text-sm text-[#916b4c]">Add OPENAI_API_KEY to .env.local and restart the server to enable extraction. Uploads and saved assets are available now.</p>}
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      {library?.assets.map(asset => {
        const revision = asset.revisions.find(r => r.id === asset.approvedRevisionId) || asset.revisions.at(-1);
        return <article key={asset.id} className="flex flex-col overflow-hidden border border-[#d5d9cd] bg-[#fbfaf5] shadow-[0_10px_22px_rgba(45,60,40,0.04)]"><Link href={`/planters/${asset.id}`} className="group flex flex-1 flex-col transition-colors hover:bg-[#f3f5ec]">
          <div className={`relative flex h-56 shrink-0 items-center justify-center p-5 ${revision ? "planter-checker" : "bg-[#e8e9df]"}`}><img src={planterFileUrl(asset.id, revision ? revisionFile(revision.id) : "source.png")} alt={asset.name} className="h-full w-full object-contain" /></div>
          <div className="flex-1 border-t border-[#e1e4d9] p-4"><div className="flex items-center justify-between gap-3"><h3 className="min-w-0 break-words font-serif text-2xl text-[#254733]">{asset.name}</h3><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#ccd6c6] text-[#315e44] transition-colors group-hover:border-[#315e44] group-hover:bg-[#315e44] group-hover:text-white"><ArrowUpRight size={18} /></span></div>{asset.status !== "approved" && <p className="mt-2 flex items-center gap-1.5 text-xs text-[#7a8879]">{asset.status === "processing" && <LoaderCircle size={13} className="animate-spin" />}{asset.status === "processing" ? "Extracting…" : asset.status === "error" ? "Extraction needs attention" : asset.status === "uploaded" ? "Ready to extract" : "Review result"}</p>}</div>
        </Link><div className="mt-auto flex h-11 shrink-0 items-center border-t border-[#e1e4d9] px-4"><PlanterActions asset={asset} onUpdated={updated => setLibrary(current => current ? { ...current, assets: current.assets.map(item => item.id === updated.id ? updated : item) } : current)} onDeleted={warning => { setLibrary(current => current ? { ...current, assets: current.assets.filter(item => item.id !== asset.id) } : current); setNotice(warning || `Deleted “${asset.name}” and its saved images.`); }} /></div></article>;
      })}
      <button type="button" disabled={uploading || !library || library.uploadsAvailable === false} onClick={() => fileInput.current?.click()} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop} className={`flex min-h-[330px] flex-col items-center justify-center border border-dashed p-6 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${dragging ? "border-[#37654a] bg-[#dce8d9]" : "border-[#aebdaf] bg-[#edf1e9] hover:bg-[#e3ebe0]"}`}>
        <span className="mb-4 grid h-14 w-14 place-items-center rounded-full border border-[#9bae9a] text-[#4c7455]">{uploading ? <LoaderCircle size={22} className="animate-spin" /> : <Upload size={22} strokeWidth={1.6} />}</span><span className="font-serif text-2xl text-[#32543c]">{uploading ? "Saving your image…" : "Add a planter image"}</span><span className="mt-2 text-sm leading-6 text-[#7a8a7b]">Drop a photo here or choose a file.</span><span className="mt-4 text-xs text-[#7a8a7b]">JPEG, PNG or WebP · up to 20 MB</span>
      </button>
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} className="sr-only" aria-label="Upload planter image" />
    </div>
  </section>;
}
