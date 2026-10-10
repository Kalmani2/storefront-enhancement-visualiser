"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { LoaderCircle, Pencil, Trash2, X } from "lucide-react";
import { deleteProject, updateProject, type DeleteResult, type Project } from "@/lib/projects";
import type { PlanterAsset } from "@/lib/planters/types";

const field = "w-full border border-[#c8d2c2] bg-[#fffef9] px-3 py-2.5 text-sm outline-none focus:border-[#52795b] disabled:opacity-50";
type Details = { name: string; address: string; category: string; notes: string };

function LibraryDialog({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>('[data-initial-focus="true"]')?.focus();
    return () => { dialog?.close(); };
  }, []);
  return <dialog ref={ref} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} className="m-auto max-h-[90dvh] w-[min(520px,calc(100vw-2rem))] overflow-auto border border-[#bdcdbb] bg-[#fbfaf5] p-0 text-[#294632] shadow-2xl backdrop:bg-[#183322]/50">
    <div className="flex items-center justify-between gap-4 border-b border-[#d2d8cb] px-6 py-5"><h2 id={titleId} className="font-serif text-3xl">{title}</h2><button type="button" disabled={busy} aria-label="Close dialog" onClick={onClose} className="p-2 disabled:opacity-40"><X size={18} /></button></div>
    {children}
  </dialog>;
}

function ItemActions({ kind, name, notes = "", address = "", category = "", disabled = false, edit = true, onSave, onDelete, onSaved, onDeleted }: {
  kind: "project" | "planter"; name: string; notes?: string; address?: string; category?: string; disabled?: boolean; edit?: boolean;
  onSave: (details: Details) => Promise<void>; onDelete: () => Promise<DeleteResult>;
  onSaved?: () => void; onDeleted: (warning?: string) => void;
}) {
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  const [details, setDetails] = useState<Details>({ name, notes, address, category });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  const fieldId = useId();

  function open(value: "edit" | "delete") {
    setDetails({ name, notes, address, category });
    setError(""); setMessage(""); setMode(value);
  }

  async function submit() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      if (mode === "delete") {
        const result = await onDelete();
        setMode(null); onDeleted(result.warning);
      } else {
        await onSave(details);
        setMode(null); setMessage("Changes saved."); onSaved?.();
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Changes could not be saved. Try again."); }
    finally { pending.current = false; setBusy(false); }
  }

  return <>
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {edit && <button type="button" aria-label={`Edit ${kind} ${name}`} disabled={disabled} onClick={() => open("edit")} className="inline-flex items-center gap-1.5 py-2 font-semibold text-[#496b50] hover:underline disabled:opacity-40"><Pencil size={13} />Edit</button>}
      <button type="button" aria-label={`Delete ${kind} ${name}`} disabled={disabled} onClick={() => open("delete")} className="inline-flex items-center gap-1.5 py-2 text-[#944d43] hover:underline disabled:opacity-40"><Trash2 size={13} />Delete</button>
      {message && <span role="status" className="text-[#496b50]">{message}</span>}
    </div>
    {mode && <LibraryDialog title={mode === "edit" ? `Edit ${kind}` : `Delete ${kind}?`} busy={busy} onClose={() => setMode(null)}>
      <form onSubmit={event => { event.preventDefault(); void submit(); }} className="space-y-5 p-6">
        {mode === "edit" ? <>
          <label className="block text-xs font-semibold" htmlFor={`${fieldId}-name`}>{kind === "project" ? "Project name" : "Planter name"}<input data-initial-focus="true" id={`${fieldId}-name`} required maxLength={kind === "project" ? 160 : 120} disabled={busy} value={details.name} onChange={event => setDetails({ ...details, name: event.target.value })} className={`${field} mt-2`} /></label>
          {kind === "project" && <>
            <label className="block text-xs font-semibold" htmlFor={`${fieldId}-address`}>Address<input id={`${fieldId}-address`} maxLength={1000} disabled={busy} value={details.address} onChange={event => setDetails({ ...details, address: event.target.value })} className={`${field} mt-2`} /></label>
            <label className="block text-xs font-semibold" htmlFor={`${fieldId}-category`}>Category<input id={`${fieldId}-category`} maxLength={1000} disabled={busy} value={details.category} onChange={event => setDetails({ ...details, category: event.target.value })} className={`${field} mt-2`} /></label>
          </>}
          <label className="block text-xs font-semibold" htmlFor={`${fieldId}-notes`}>{kind === "project" ? "Project notes" : "Planter notes"}<textarea id={`${fieldId}-notes`} rows={3} maxLength={2000} disabled={busy} value={details.notes} onChange={event => setDetails({ ...details, notes: event.target.value })} placeholder={kind === "project" ? "Ideas or context for this storefront…" : "Materials, dimensions or product details…"} className={`${field} mt-2 resize-y`} /></label>
          <p className="text-xs leading-5 text-[#768376]">Updates saved details only. Images and existing results stay unchanged; no AI call is made.</p>
        </> : <>
          <p className="break-words text-sm leading-6">Delete <strong>{name}</strong> from the shared library?</p>
          <p className="text-sm leading-6 text-[#768376]">{kind === "project" ? "This permanently removes the project, its saved frontage images and all composite versions. Your planter library is not affected." : "This permanently removes the planter, its original photo, cutouts and all versions. Planters used by saved compositions cannot be deleted."}</p>
          <p className="text-xs font-semibold text-[#944d43]">This affects both local and deployed views of the shared library and cannot be undone.</p>
        </>}
        {error && <p role="alert" className="border-l-2 border-[#a75c52] bg-[#f5eae4] p-3 text-sm text-[#784841]">{error}</p>}
        <div className="flex justify-end gap-3 border-t border-[#d2d8cb] pt-5">
          <button type="button" data-initial-focus={mode === "delete"} disabled={busy} onClick={() => setMode(null)} className="border border-[#bdcdbb] px-4 py-2.5 text-sm disabled:opacity-40">Cancel</button>
          <button type="submit" disabled={busy || (mode === "edit" && !details.name.trim())} className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${mode === "delete" ? "bg-[#944d43] hover:bg-[#793c34]" : "bg-[#28543b] hover:bg-[#1c422d]"}`}>{busy && <LoaderCircle size={14} className="animate-spin" />}{busy ? mode === "delete" ? "Deleting…" : "Saving…" : mode === "delete" ? `Delete ${kind}` : "Save changes"}</button>
        </div>
      </form>
    </LibraryDialog>}
  </>;
}

export function ProjectActions({ project, onUpdated, onDeleted }: { project: Project; onUpdated: (project: Project) => void; onDeleted: (warning?: string) => void }) {
  return <ItemActions kind="project" name={project.title} address={project.address} category={project.category} notes={project.notes} onSave={async details => { onUpdated(await updateProject(project.id, { title: details.name.trim(), address: details.address.trim(), category: details.category.trim(), notes: details.notes.trim() })); }} onDelete={() => deleteProject(project.id)} onDeleted={onDeleted} />;
}

export function PlanterActions({ asset, edit = true, onUpdated, onDeleted }: { asset: PlanterAsset; edit?: boolean; onUpdated: (asset: PlanterAsset) => void; onDeleted: (warning?: string) => void }) {
  async function request<T>(method: string, body?: object): Promise<T> {
    const response = await fetch(`/api/planters/${encodeURIComponent(asset.id)}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The planter could not be updated.");
    return result;
  }
  return <ItemActions kind="planter" name={asset.name} notes={asset.notes} edit={edit} disabled={asset.status === "processing"} onSave={async details => { onUpdated(await request<PlanterAsset>("PATCH", { name: details.name.trim(), notes: details.notes.trim() })); }} onDelete={() => request<DeleteResult>("DELETE")} onDeleted={onDeleted} />;
}
