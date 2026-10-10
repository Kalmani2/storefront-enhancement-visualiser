"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { Copy, Download, LoaderCircle, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { projectImageUrl, type Project } from "@/lib/projects";
import { planterFileUrl, revisionFile, type PlanterAsset } from "@/lib/planters/types";
import { clamp, fallbackEstimate, placementGeometry } from "@/lib/composition/geometry";
import { compositionFileUrl, estimateKey, type CompositionState, type Placement, type ScaleEstimate } from "@/lib/composition/types";

async function request<T>(url: string, body?: object): Promise<T> {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "The composition could not be saved.");
  return value;
}
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => { const result = new Image(); result.onload = () => resolve(result); result.onerror = () => reject(new Error("A source image could not be loaded.")); result.src = url; });
}
type View = "placement" | "original" | "enhanced";
type LoadedState = CompositionState & { configured?: boolean };

export function StorefrontComposer({ project }: { project: Project }) {
  const endpoint = `/api/projects/${encodeURIComponent(project.id)}/composition`;
  const [state, setState] = useState<LoadedState | null>(null);
  const [assets, setAssets] = useState<PlanterAsset[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [view, setView] = useState<View>("placement");
  const [busy, setBusy] = useState(false);
  const [estimating, setEstimating] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [error, setError] = useState("");
  const [bitmaps, setBitmaps] = useState<Record<string, HTMLImageElement>>({});
  const [frontage, setFrontage] = useState<HTMLImageElement | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const latestEnhanced = useRef("");
  const selected = placements.find(p => p.id === selectedId);
  const estimate = selected && state?.calibrations[estimateKey(selected.assetId, selected.revisionId)];
  const enhanced = state?.versions.filter(v => v.enhancedFile).at(-1);
  const job = state?.job;
  const sourceUrl = projectImageUrl(project)!;
  const ready = Boolean(state);

  useEffect(() => {
    let active = true;
    void Promise.all([request<LoadedState>(endpoint), request<{ assets: PlanterAsset[] }>("/api/planters"), loadImage(sourceUrl)]).then(([saved, library, photo]) => {
      if (!active) return;
      setState(saved); setAssets(library.assets); setPlacements(saved.draft); setSelectedId(saved.draft[0]?.id || ""); setFrontage(photo);
    }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [endpoint, sourceUrl]);

  useEffect(() => {
    let active = true;
    const needed = placements.filter(p => !bitmaps[estimateKey(p.assetId, p.revisionId)]);
    if (needed.length) void Promise.all(needed.map(async p => [estimateKey(p.assetId, p.revisionId), await loadImage(planterFileUrl(p.assetId, revisionFile(p.revisionId)))] as const)).then(values => {
      if (active) setBitmaps(previous => ({ ...previous, ...Object.fromEntries(values) }));
    }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [placements, bitmaps]);

  const jobId = job?.id;
  useEffect(() => {
    if (!jobId) return;
    let active = true;
    const timer = setInterval(() => { void request<LoadedState>(endpoint).then(saved => {
      if (!active) return;
      setState(saved);
      const output = saved.versions.find(v => v.id === job?.versionId);
      if (output?.enhancedFile && output.enhancedFile !== latestEnhanced.current) { latestEnhanced.current = output.enhancedFile; setView("enhanced"); }
    }).catch(cause => { if (active) setError(cause.message); }); }, 2500);
    return () => { active = false; clearInterval(timer); };
  }, [jobId, job?.versionId, endpoint]);

  useEffect(() => {
    if (!dirty || !ready) return;
    let active = true;
    const timer = setTimeout(() => {
      setSaveStatus("Saving layout…");
      void request<CompositionState>(endpoint, { action: "draft", placements }).then(() => { if (active) setSaveStatus("Layout saved"); }).catch(cause => { if (active) { setSaveStatus("Layout not saved"); setError(cause.message); } });
    }, 800);
    return () => { active = false; clearTimeout(timer); };
  }, [placements, dirty, endpoint, ready]);

  useEffect(() => {
    const target = canvas.current;
    if (!target || !frontage) return;
    const width = frontage.naturalWidth >= frontage.naturalHeight ? 1280 : Math.round(1280 * frontage.naturalWidth / frontage.naturalHeight);
    const height = Math.round(width * frontage.naturalHeight / frontage.naturalWidth);
    target.width = width; target.height = height;
    const ctx = target.getContext("2d")!;
    ctx.drawImage(frontage, 0, 0, width, height);
    if (view === "original") return;
    for (const placement of [...placements].sort((a, b) => a.y - b.y)) {
      const revision = assets.find(a => a.id === placement.assetId)?.revisions.find(r => r.id === placement.revisionId);
      const bitmap = bitmaps[estimateKey(placement.assetId, placement.revisionId)];
      if (!revision || !bitmap) continue;
      const geometry = placementGeometry(placement, revision, width, height, state?.calibrations[estimateKey(placement.assetId, placement.revisionId)]);
      ctx.save(); ctx.filter = "blur(4px)"; ctx.fillStyle = `rgba(0,0,0,${placement.shadow * .3})`;
      ctx.beginPath(); ctx.ellipse(placement.x * width, placement.y * height, geometry.width * .28, Math.max(3, geometry.height * .025), 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, width, height * .955); ctx.clip(); ctx.drawImage(bitmap, geometry.x, geometry.y, geometry.width, geometry.height); ctx.restore();
      if (placement.id === selectedId) {
        ctx.save(); ctx.strokeStyle = "#2e6b46"; ctx.lineWidth = 2; ctx.setLineDash([7, 5]); ctx.strokeRect(geometry.x, geometry.y, geometry.width, geometry.height); ctx.setLineDash([]);
        ctx.fillStyle = "#2e6b46"; ctx.beginPath(); ctx.arc(placement.x * width, placement.y * height, 5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }
  }, [frontage, placements, assets, bitmaps, state?.calibrations, selectedId, view]);

  function change(next: Placement[]) { setPlacements(next); setDirty(true); setView("placement"); setError(""); }
  function updatePlacement(update: Partial<Placement>) { if (selected) change(placements.map(p => p.id === selected.id ? { ...p, ...update } : p)); }
  async function add(asset: PlanterAsset) {
    if (!asset.approvedRevisionId || estimating || placements.length >= 6) return;
    setEstimating(asset.id); setError("");
    try {
      const revisionId = asset.approvedRevisionId, key = estimateKey(asset.id, revisionId);
      const scale = state?.calibrations[key] || await request<ScaleEstimate>(endpoint, { action: "calibrate", assetId: asset.id, revisionId });
      setState(previous => previous ? { ...previous, calibrations: { ...previous.calibrations, [key]: scale } } : previous);
      const placement: Placement = { id: crypto.randomUUID(), assetId: asset.id, revisionId, x: clamp(scale.ground.x + placements.length * .12, .1, .9), y: scale.ground.y, height: scale.height, perspective: true, shadow: .65 };
      change([...placements, placement]); setSelectedId(placement.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not place this planter."); }
    finally { setEstimating(""); }
  }
  function point(event: PointerEvent<HTMLCanvasElement>) { const box = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }; }
  function startDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (view !== "placement") return;
    const p = point(event), target = event.currentTarget;
    for (const placement of [...placements].sort((a, b) => b.y - a.y)) {
      const revision = assets.find(a => a.id === placement.assetId)?.revisions.find(r => r.id === placement.revisionId);
      if (!revision) continue;
      const box = placementGeometry(placement, revision, target.width, target.height, state?.calibrations[estimateKey(placement.assetId, placement.revisionId)]);
      if (p.x * target.width >= box.x && p.x * target.width <= box.x + box.width && p.y * target.height >= box.y && p.y * target.height <= box.y + box.height) {
        setSelectedId(placement.id); drag.current = { id: placement.id, dx: p.x - placement.x, dy: p.y - placement.y }; target.setPointerCapture(event.pointerId); return;
      }
    }
    setSelectedId("");
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    const moving = drag.current; if (!moving) return;
    const p = point(event);
    change(placements.map(item => item.id === moving.id ? { ...item, x: clamp(p.x - moving.dx, .02, .98), y: clamp(p.y - moving.dy, .25, .94) } : item));
  }
  function nudge(event: KeyboardEvent<HTMLCanvasElement>) {
    if (!selected || view !== "placement" || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault(); const step = event.shiftKey ? .025 : .005;
    updatePlacement({ x: clamp(selected.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0), .02, .98), y: clamp(selected.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0), .25, .94) });
  }
  async function produce(action: "save" | "enhance") {
    if (busy || job || !placements.length) return;
    setBusy(true); setError("");
    try { const saved = await request<CompositionState>(endpoint, { action, placements }); setState(previous => ({ ...previous, ...saved })); setSaveStatus("Layout saved"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create this output."); }
    finally { setBusy(false); }
  }

  return <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
    <div className="min-w-0 space-y-5">
      <div className="overflow-hidden border border-[#d2d9cc] bg-[#faf9f2]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dce1d4] p-4"><div className="flex gap-1" role="group" aria-label="Preview">{(["placement", "original", ...(enhanced ? ["enhanced"] : [])] as View[]).map(item => <button key={item} type="button" aria-pressed={view === item} onClick={() => setView(item)} className={`px-3 py-2 text-xs font-semibold ${view === item ? "bg-[#28543c] text-white" : "text-[#69806c]"}`}>{item === "placement" ? "Placement" : item === "original" ? "Original" : "AI Enhanced"}</button>)}</div><span className="text-[11px] text-[#7d8b79]">{saveStatus}</span></div>
        <div className="relative min-h-56 bg-[#d9dfd4]">{!frontage && <p role="status" className="p-10 text-center text-sm text-[#6b816d]">Loading storefront…</p>}<canvas ref={canvas} aria-label="Storefront planter placement" tabIndex={0} onPointerDown={startDrag} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onKeyDown={nudge} className={`w-full touch-none outline-offset-4 ${frontage && view !== "enhanced" ? "block" : "hidden"} ${view === "placement" ? "cursor-grab active:cursor-grabbing" : ""}`} />{view === "enhanced" && enhanced?.enhancedFile && <img src={compositionFileUrl(project.id, enhanced.enhancedFile)} alt="AI enhanced storefront composition" className="w-full" />}</div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[11px] text-[#758471]"><span>Drag a planter to place it. Arrow keys move the selected planter.</span><span>Google Maps · {project.image?.provider === "google-street-view" ? project.image.copyright || "© Google" : ""}</span></div>
      </div>
      {(error || state?.error) && <p role="alert" className="border-l-2 border-[#a75c52] bg-[#f5eae4] p-4 text-sm text-[#784841]">{error || state?.error}</p>}
      <div className="flex flex-wrap gap-3"><button type="button" disabled={!placements.length || busy || Boolean(job)} onClick={() => void produce("save")} className="inline-flex items-center gap-2 border border-[#37654a] bg-[#faf9f2] px-5 py-3 text-sm font-semibold text-[#315e44] disabled:opacity-50"><Download size={16} />{busy ? "Saving…" : "Save basic output"}</button><button type="button" disabled={!placements.length || busy || Boolean(job) || state?.configured === false} onClick={() => void produce("enhance")} className="inline-flex items-center gap-2 bg-[#28543c] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{job ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}{job ? "Enhancing…" : "AI Enhance · Medium"}</button></div>
      <p className="text-xs text-[#7c8977]">Dragging and basic exports make no AI calls. Initial scale analysis is cached; AI Enhance makes one paid image edit.</p>
      {state?.configured === false && <p className="text-xs text-[#906f51]">AI Enhance is not enabled on this server. Basic composition is available.</p>}
      {state && state.versions.length > 0 && <section aria-label="Saved outputs" className="border-t border-[#d2d9cc] pt-5"><h2 className="mb-4 font-serif text-2xl text-[#254733]">Saved outputs</h2><div className="grid gap-4 sm:grid-cols-2">{[...state.versions].reverse().map((version, index) => <div key={version.id} className="border border-[#d2d9cc] bg-[#faf9f2]"><img src={compositionFileUrl(project.id, version.enhancedFile || version.basicFile)} alt={`Saved composition ${state.versions.length - index}`} className="aspect-[4/3] w-full object-contain bg-[#e4e8de]" /><div className="space-y-3 p-4"><p className="text-xs font-semibold text-[#4f6d53]">Version {state.versions.length - index}{version.enhancedFile ? " · AI Enhanced" : " · Basic"}</p><div className="flex flex-wrap gap-4 text-xs font-semibold text-[#315e44]"><a href={compositionFileUrl(project.id, version.basicFile, true)} className="inline-flex items-center gap-1.5 underline"><Download size={13} />Download basic</a>{version.enhancedFile && <a href={compositionFileUrl(project.id, version.enhancedFile, true)} className="inline-flex items-center gap-1.5 underline"><Download size={13} />Download enhanced</a>}</div></div></div>)}</div></section>}
    </div>
    <aside className="space-y-5">
      <section className="border border-[#d2d9cc] bg-[#faf9f2] p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-serif text-2xl text-[#254733]">Planters</h2><Link href="/" className="text-xs text-[#64836a] underline">Library</Link></div><div className="grid grid-cols-2 gap-3">{assets.filter(a => a.approvedRevisionId).map(asset => <button key={asset.id} type="button" disabled={!state || Boolean(estimating) || placements.length >= 6} onClick={() => void add(asset)} aria-label={`Place ${asset.name}`} className="border border-[#d4ddcd] bg-[#f1f3e9] text-left hover:border-[#62806b] disabled:opacity-50"><img src={planterFileUrl(asset.id, revisionFile(asset.approvedRevisionId!))} alt={asset.name} className="planter-checker h-28 w-full object-contain p-2" /><span className="block px-2.5 py-3 text-xs font-semibold text-[#48654e]">{estimating === asset.id ? "Estimating scale…" : asset.name}</span></button>)}</div>{!assets.some(a => a.approvedRevisionId) && <p className="text-sm leading-6 text-[#778873]">Approve a cleaned planter in the <Link href="/" className="underline">planter library</Link> to place it here.</p>}{placements.length >= 6 && <p className="mt-3 text-xs text-[#7b8876]">Up to six arrangements per composition.</p>}</section>
      {placements.length > 0 && <section className="border border-[#d2d9cc] bg-[#faf9f2] p-5"><label htmlFor="placed-planter" className="mb-2 block text-xs font-semibold text-[#5b745e]">Selected planter</label><select id="placed-planter" value={selectedId} onChange={event => setSelectedId(event.target.value)} className="w-full border border-[#c8d2c2] bg-[#fffef9] px-3 py-2 text-sm"><option value="">Choose an arrangement</option>{placements.map((p, index) => <option key={p.id} value={p.id}>{index + 1}. {assets.find(a => a.id === p.assetId)?.name || "Planter"}</option>)}</select>{selected && <div className="mt-5 space-y-5"><label className="block text-xs font-semibold text-[#5b745e]">Size<input aria-label="Planter size" type="range" min="0.03" max="0.9" step="0.005" value={selected.height} onChange={event => updatePlacement({ height: Number(event.target.value) })} className="mt-3 w-full accent-[#315e44]" /></label><label className="block text-xs font-semibold text-[#5b745e]">Shadow<input aria-label="Shadow strength" type="range" min="0" max="1" step="0.05" value={selected.shadow} onChange={event => updatePlacement({ shadow: Number(event.target.value) })} className="mt-3 w-full accent-[#315e44]" /></label><label className="flex items-start gap-2 text-xs leading-5 text-[#5b745e]"><input type="checkbox" checked={selected.perspective} onChange={event => updatePlacement({ perspective: event.target.checked })} className="mt-1 accent-[#315e44]" />Adjust scale with distance</label><div className="flex flex-wrap gap-3 text-xs font-semibold text-[#527058]"><button type="button" onClick={() => updatePlacement({ height: (estimate || fallbackEstimate(selected.assetId, selected.revisionId)).height, perspective: true })} className="inline-flex items-center gap-1"><RotateCcw size={13} />Reset size</button><button type="button" disabled={placements.length >= 6} onClick={() => { const next = { ...selected, id: crypto.randomUUID(), x: clamp(selected.x + .12, .05, .95) }; change([...placements, next]); setSelectedId(next.id); }} className="inline-flex items-center gap-1 disabled:opacity-50"><Copy size={13} />Duplicate</button><button type="button" onClick={() => { change(placements.filter(p => p.id !== selected.id)); setSelectedId(""); }} className="inline-flex items-center gap-1 text-[#956250]"><Trash2 size={13} />Remove</button></div></div>}</section>}
      {estimate && <section className="border border-[#d2d9cc] bg-[#e8eee2] p-5"><p className="text-xs font-semibold text-[#4f7055]">Approximate scale · {estimate.confidence} confidence</p><p className="mt-3 text-xs leading-6 text-[#6b7d66]">{estimate.reason}</p><details className="mt-3 text-xs text-[#6b7d66]"><summary className="cursor-pointer">Scale assumptions</summary><p className="mt-2 leading-6">Reference height ≈ {estimate.reference.heightMetres.toFixed(2)} m. Container height ≈ {estimate.containerHeightMetres.toFixed(2)} m. These are visual estimates, not measured dimensions. One cached visual analysis is used per planter and storefront pair; moving the planter makes no AI calls.</p></details></section>}
    </aside>
  </div>;
}
