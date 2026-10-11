"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Crosshair, Download, LoaderCircle, Pencil, Sparkles } from "lucide-react";
import { AppHeader } from "./app-header";
import { PlanterSourceSelection } from "./planter-source-selection";
import { PlanterEdgeEditor } from "./planter-edge-editor";
import { PlanterActions } from "./library-actions";
import { planterFileUrl, revisionFile, type ContactPoint, type ExtractionMode, type PlanterAsset, type SelectionBox } from "@/lib/planters/types";
import { uploadImage } from "@/lib/upload-image";

async function jsonRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
  return payload;
}

const panel = "border border-[#d3d9cc] bg-[#fbfaf5]";
const field = "w-full border border-[#c8d2c2] bg-[#fffef9] px-3 py-2.5 text-sm text-[#31503a] outline-none focus:border-[#52795b] disabled:opacity-50";

export function PlanterReview({ id }: { id: string }) {
  const router = useRouter();
  const [asset, setAsset] = useState<PlanterAsset | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [target, setTarget] = useState("");
  const [mode, setMode] = useState<ExtractionMode>("reconstruct");
  const [selection, setSelection] = useState<SelectionBox>();
  const [background, setBackground] = useState("checker");
  const [view, setView] = useState("asset");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [settingContact, setSettingContact] = useState(false);
  const [contact, setContact] = useState<ContactPoint | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [notice, setNotice] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [cloudStorage, setCloudStorage] = useState(false);
  const [model, setModel] = useState("gpt-image-1.5");
  const initialised = useRef(false);
  const revisionCount = useRef(-1);
  const lastUpdate = useRef("");

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      let delay = 4000;
      try {
        const current = await jsonRequest<PlanterAsset>(`/api/planters/${id}`);
        if (!active) return;
        if (current.updatedAt !== lastUpdate.current) {
          setAsset(current);
          lastUpdate.current = current.updatedAt;
          if (current.revisions.length !== revisionCount.current) setSelectedId((!initialised.current && current.approvedRevisionId) || current.revisions.at(-1)?.id || "");
          revisionCount.current = current.revisions.length;
        }
        if (!initialised.current) {
          const settings = current.job?.settings || current.lastSettings || current.revisions.at(-1)?.settings;
          if (settings) { setTarget(settings.target); setMode(settings.mode); setSelection(settings.selection); }
          setName(current.name);
          setNotes(current.notes || "");
          initialised.current = true;
        }
        delay = current.status === "processing" ? 2000 : 8000;
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Could not open this planter."); }
      if (active) timer = setTimeout(load, delay);
    }
    void load();
    void jsonRequest<{ configured: boolean; model: string; storage?: string }>("/api/planters").then(result => { if (active) { setConfigured(result.configured); setModel(result.model); setCloudStorage(result.storage === "supabase"); } }).catch(() => {});
    return () => { active = false; clearTimeout(timer); };
  }, [id]);

  const revision = asset?.revisions.find(r => r.id === selectedId);
  const processing = asset?.status === "processing";
  const busy = saving || processing;
  const contactPoint = contact || revision?.contactPoint;

  function applyAsset(next: PlanterAsset) {
    setAsset(next);
    lastUpdate.current = next.updatedAt;
    if (next.revisions.length !== revisionCount.current) setSelectedId(next.revisions.at(-1)?.id || "");
    revisionCount.current = next.revisions.length;
  }

  async function extract() {
    if (busy) return;
    setSaving(true); setError(""); setContact(null);
    try {
      applyAsset(await jsonRequest<PlanterAsset>(`/api/planters/${id}/extract`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target, mode, quality: "medium", selection }) }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start extraction."); }
    finally { setSaving(false); }
  }

  async function update(body: object) {
    if (busy) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const updated = await jsonRequest<PlanterAsset>(`/api/planters/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      applyAsset(updated); setName(updated.name); setNotes(updated.notes || ""); setNotice("Planter saved.");
      if ("approvedRevisionId" in body) setContact(null);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this asset."); }
    finally { setSaving(false); }
  }

  async function saveEdges(blob: Blob) {
    const form = new FormData();
    form.set("image", blob, "edited.png"); form.set("parentId", selectedId);
    const options: RequestInit = cloudStorage ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentId: selectedId, upload: await uploadImage(new File([blob], "edited.png", { type: "image/png" }), "edit") }) } : { method: "POST", body: form };
    applyAsset(await jsonRequest<PlanterAsset>(`/api/planters/${id}/refine`, options));
    setEditing(false); setContact(null);
  }

  async function duplicate() {
    if (!asset || busy) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(planterFileUrl(id, asset.originalFile));
      if (!response.ok) throw new Error("Could not read the original photo.");
      const form = new FormData();
      form.set("image", await response.blob(), asset.originalFilename);
      form.set("name", `${asset.name} · another arrangement`);
      const options: RequestInit = cloudStorage ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `${asset.name} · another arrangement`, upload: await uploadImage(new File([form.get("image") as Blob], asset.originalFilename, { type: (form.get("image") as Blob).type }), "planter") }) } : { method: "POST", body: form };
      const next = await jsonRequest<PlanterAsset>("/api/planters", options);
      router.push(`/planters/${next.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create another asset."); }
    finally { setSaving(false); }
  }

  return <main className="min-h-screen bg-[#f0f0e8] text-[#263c2e]">
    <AppHeader active="library" />
    <section className="mx-auto max-w-[1460px] px-6 py-8 md:px-10 md:py-10">
      <Link href="/#planter-library-title" className="mb-6 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#64816b] hover:underline"><ArrowLeft size={14} /> Planter library</Link>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5 border-b border-[#d2d8cb] pb-6"><div className="min-w-0"><p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#718573]">Asset review</p><h1 className="break-words font-serif text-4xl tracking-[-0.035em] text-[#244533] md:text-5xl">{asset?.name || "Opening planter…"}</h1></div><div className="flex flex-wrap items-center gap-4">{asset?.approvedRevisionId && <span className="inline-flex items-center gap-2 border border-[#b9cdb4] bg-[#e6eee2] px-3 py-2 text-xs font-semibold text-[#41694a]"><Check size={14} />Approved asset saved</span>}{asset && !saving && <PlanterActions asset={asset} edit={false} onUpdated={applyAsset} onDeleted={warning => router.push(`/?deleted=planter${warning ? "&cleanup=1" : ""}`)} />}</div></div>
      {notice && <p role="status" className="mb-6 text-sm text-[#496b50]">{notice}</p>}
      {error && <p role="alert" className="mb-6 border-l-2 border-[#a75c52] bg-[#f5eae4] px-4 py-3 text-sm text-[#784841]">{error}</p>}
      {asset?.error && <p role="alert" className="mb-6 border-l-2 border-[#a75c52] bg-[#f5eae4] px-4 py-3 text-sm text-[#784841]">{asset.error}</p>}
      {configured === false && <p className="mb-6 border border-[#d9c9ac] bg-[#f8f0e1] p-4 text-sm text-[#8a6944]">Paid extraction is disabled or its API key is not configured on this server. You can still review, refine and approve existing results.</p>}
      {asset && <div className="grid items-start gap-7 lg:grid-cols-2">
        <div className="space-y-6">
          <div className={panel}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e0e4d9] px-5 py-4"><h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5d7863]">Original image</h2><div className="flex gap-4 text-xs text-[#64816b]"><button type="button" disabled={Boolean(busy)} onClick={() => void duplicate()} className="hover:underline disabled:opacity-40">Create another asset from photo</button><a href={planterFileUrl(id, asset.originalFile, true)} className="hover:underline">Download original</a></div></div><PlanterSourceSelection src={planterFileUrl(id, "source.png")} selection={selection} onChange={setSelection} disabled={Boolean(busy)} /></div>
          <div className={`${panel} p-5 md:p-6`}>
            <label htmlFor="planter-name" className="mb-2 block text-xs font-semibold text-[#5c765f]">Asset name</label><input id="planter-name" maxLength={120} disabled={Boolean(busy)} value={name} onChange={event => setName(event.target.value)} className={field} />
            <label htmlFor="planter-notes" className="mb-2 mt-4 block text-xs font-semibold text-[#5c765f]">Planter notes</label><textarea id="planter-notes" rows={3} maxLength={2000} disabled={Boolean(busy)} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Materials, dimensions or product details…" className={`${field} resize-y`} /><button type="button" disabled={busy || !name.trim() || (name === asset.name && notes === (asset.notes || ""))} onClick={() => void update({ name: name.trim(), notes: notes.trim() })} className="mb-6 mt-3 border border-[#aebfa7] px-4 py-2.5 text-xs font-semibold text-[#41694a] disabled:opacity-40">Save details</button>
            <label htmlFor="planter-target" className="mb-2 block text-xs font-semibold text-[#5c765f]">Which arrangement should we extract?</label><textarea id="planter-target" rows={3} maxLength={1500} disabled={Boolean(busy)} value={target} onChange={event => setTarget(event.target.value)} placeholder="e.g. The two rust-coloured containers in the foreground, with the palm and flowers. Exclude the trough behind them." className={`${field} resize-y`} /><p className="mt-2 text-xs leading-5 text-[#7c8a79]">Leave blank to use the main foreground arrangement. Plants and containers stay together.</p>
            <fieldset className="mt-5"><legend className="mb-2 text-xs font-semibold text-[#5c765f]">Method</legend><div className="grid gap-2 sm:grid-cols-2">{([{ value: "extract", title: "Extract visible", description: "Keep visible shape; missing areas stay missing." }, { value: "reconstruct", title: "Complete hidden parts", description: "AI fills occluded foliage and cropped containers." }] as const).map(option => <label key={option.value} className={`cursor-pointer border p-3 ${mode === option.value ? "border-[#577d5c] bg-[#eaf0e5]" : "border-[#d3dccd]"}`}><span className="flex items-center gap-2 text-sm font-semibold text-[#3f6248]"><input type="radio" name="method" disabled={Boolean(busy)} checked={mode === option.value} onChange={() => setMode(option.value)} />{option.title}</span><span className="mt-2 block text-xs leading-5 text-[#7c8a79]">{option.description}</span></label>)}</div></fieldset>
            <p className="mt-5 text-[11px] text-[#85917f]">Medium quality · {model}</p>
            <button type="button" onClick={() => void extract()} disabled={Boolean(busy) || configured !== true} className="mt-5 flex w-full items-center justify-between gap-3 bg-[#28543b] px-5 py-4 text-sm font-semibold text-white hover:bg-[#1c422d] disabled:cursor-not-allowed disabled:opacity-50"><span>{processing ? "Extracting your arrangement…" : saving ? "Saving…" : asset.revisions.length ? "Generate another result · paid" : "Extract planter asset · paid"}</span>{busy ? <LoaderCircle size={17} className="animate-spin" /> : <Sparkles size={17} />}</button>
          </div>
        </div>
        <div className="space-y-6">
          <div className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e0e4d9] px-5 py-4"><h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5d7863]">{view === "mask" ? "Transparency mask" : "Planter asset"}</h2><div className="flex gap-3 text-xs"><button type="button" aria-pressed={view === "asset"} onClick={() => setView("asset")} className={view === "asset" ? "font-semibold text-[#345e40]" : "text-[#8a9584]"}>Cutout</button><button type="button" aria-pressed={view === "mask"} disabled={!revision} onClick={() => setView("mask")} className={view === "mask" ? "font-semibold text-[#345e40]" : "text-[#8a9584]"}>Mask</button></div></div>
            <div className={`relative flex min-h-[420px] items-center justify-center p-6 ${background === "checker" ? "planter-checker" : background === "dark" ? "bg-[#27332c]" : "bg-white"}`}>
              {revision ? <div className={`relative inline-block max-w-full leading-none ${settingContact ? "cursor-crosshair" : ""}`} onClick={event => { if (!settingContact || view !== "asset") return; const rect = event.currentTarget.getBoundingClientRect(); setContact({ x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }); setSettingContact(false); }}><img src={planterFileUrl(id, revisionFile(revision.id, view === "mask" ? "mask" : "asset"))} alt={view === "mask" ? "Foreground alpha mask: white is solid, black is transparent" : `Extracted arrangement: ${asset.name}`} className="max-h-[560px] max-w-full object-contain" />{view === "asset" && contactPoint && <span aria-label="Ground contact point" className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f9f7e9] p-1 text-[#b2643a] shadow-sm" style={{ left: `${contactPoint.x * 100}%`, top: `${contactPoint.y * 100}%` }}><Crosshair size={17} /></span>}</div> : <div className="max-w-xs text-center">{processing ? <LoaderCircle size={32} className="mx-auto mb-4 animate-spin text-[#5e8365]" /> : <Sparkles size={30} className="mx-auto mb-4 text-[#77937a]" />}<p className="font-serif text-2xl text-[#38563e]">{processing ? "Creating your asset" : "Your cutout will appear here"}</p><p className="mt-3 text-sm leading-6 text-[#7c8c78]">{processing ? "This can take several minutes. You can leave this page and return to the saved result." : "Choose the target arrangement, then extract it."}</p></div>}
              {processing && revision && <span role="status" className="absolute bottom-4 left-4 flex items-center gap-2 bg-[#f8faf3] px-3 py-2 text-xs text-[#527459]"><LoaderCircle size={13} className="animate-spin" />Creating another result…</span>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e0e4d9] px-5 py-3"><div className="flex gap-2">{["checker", "light", "dark"].map(value => <button type="button" key={value} onClick={() => setBackground(value)} aria-label={`${value} preview background`} aria-pressed={background === value} className={`h-6 w-6 border ${background === value ? "border-[#456e4d] ring-1 ring-[#456e4d]" : "border-[#c1cbb9]"} ${value === "checker" ? "planter-checker" : value === "dark" ? "bg-[#27332c]" : "bg-white"}`} />)}</div>{revision && <span className="text-xs text-[#80907c]">{revision.width} × {revision.height} · RGBA PNG</span>}</div>
          </div>
          {revision && <>
            <div className={`${panel} p-5`}>
              <div className="flex flex-wrap gap-4 text-xs font-semibold text-[#496b50]"><button type="button" disabled={Boolean(busy)} onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 hover:underline disabled:opacity-40"><Pencil size={14} />Refine edges</button><button type="button" disabled={Boolean(busy)} onClick={() => { setView("asset"); setSettingContact(!settingContact); }} className="inline-flex items-center gap-1.5 hover:underline disabled:opacity-40"><Crosshair size={14} />{settingContact ? "Click the base in the preview" : "Set ground contact"}</button><a href={planterFileUrl(id, revisionFile(revision.id), true)} className="inline-flex items-center gap-1.5 hover:underline"><Download size={14} />PNG</a><a href={planterFileUrl(id, revisionFile(revision.id, "mask"), true)} className="hover:underline">Mask</a></div>
              {revision.warnings.map(warning => <p key={warning} className="mt-4 text-xs leading-5 text-[#897455]">{warning}</p>)}
              <button type="button" disabled={Boolean(busy) || (asset.approvedRevisionId === revision.id && !contact)} onClick={() => void update({ approvedRevisionId: revision.id, contactPoint })} className="mt-5 flex w-full items-center justify-between border border-[#537958] bg-[#e9f0e4] px-4 py-3 text-sm font-semibold text-[#365d40] hover:bg-[#dfead8] disabled:opacity-50"><span>{asset.approvedRevisionId === revision.id && !contact ? "Approved" : "Approve this asset"}</span><Check size={17} /></button>
            </div>
            <div className={panel}><div className="flex items-center justify-between border-b border-[#e0e4d9] px-5 py-4"><h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5d7863]">Versions</h2><a href={planterFileUrl(id, "asset.json", true)} className="text-xs text-[#64816b] hover:underline">Download manifest</a></div><div className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-4">{asset.revisions.map((item, index) => <button key={item.id} type="button" aria-label={`Review version ${index + 1}`} aria-pressed={selectedId === item.id} onClick={() => { setSelectedId(item.id); setContact(null); setSettingContact(false); }} className={`overflow-hidden border text-left ${selectedId === item.id ? "border-[#527a59] ring-1 ring-[#527a59]" : "border-[#d0d9ca]"}`}><div className="planter-checker flex h-24 items-center justify-center p-2"><img src={planterFileUrl(id, revisionFile(item.id))} alt="" className="h-full w-full object-contain" /></div><span className="block px-2 py-2 text-[10px] leading-4 text-[#6d816b]">{index + 1} · {item.kind === "manual" ? "Brush edit" : item.settings.mode === "reconstruct" ? "Completed" : "Extracted"}{asset.approvedRevisionId === item.id && " ✓"}</span></button>)}</div></div>
          </>}
        </div>
      </div>}
    </section>
    {editing && revision && <PlanterEdgeEditor src={planterFileUrl(id, revisionFile(revision.id))} onClose={() => setEditing(false)} onSave={saveEdges} />}
  </main>;
}
