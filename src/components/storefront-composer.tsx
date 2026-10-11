"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { Check, Copy, Download, FlipHorizontal2, LoaderCircle, Move, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { projectImageUrl, type Project } from "@/lib/projects";
import { planterFileUrl, revisionFile, type PlanterAsset } from "@/lib/planters/types";
import { clamp, outputDimensions, placementGeometry, projectedPoint } from "@/lib/composition/geometry";
import { compositionFileUrl, estimateKey, type CompositionState, type Placement, type ScaleEstimate } from "@/lib/composition/types";

async function request<T>(url: string, body?: object): Promise<T> {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "The composition could not be saved.");
  return value;
}
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("An image could not be loaded.")); image.src = url; });
}
type View = "placement" | "original" | "enhanced" | "compare";
type LoadedState = CompositionState & { configured?: boolean; model?: string };
const outlineButton = "inline-flex items-center justify-center gap-2 border border-[#bdcbbb] bg-[#faf9f2] px-4 py-2.5 text-xs font-semibold text-[#315e44] transition hover:bg-[#e8eee2] disabled:cursor-not-allowed disabled:opacity-40";

export function StorefrontComposer({ project }: { project: Project }) {
  const endpoint = `/api/projects/${encodeURIComponent(project.id)}/composition`, sourceUrl = projectImageUrl(project)!;
  const [state, setState] = useState<LoadedState | null>(null), [assets, setAssets] = useState<PlanterAsset[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]), [selectedId, setSelectedId] = useState("");
  const [view, setView] = useState<View>("placement"), [outputId, setOutputId] = useState("");
  const [compare, setCompare] = useState(50), [busy, setBusy] = useState(false), [estimating, setEstimating] = useState("");
  const [dirty, setDirty] = useState(false), [saveStatus, setSaveStatus] = useState(""), [error, setError] = useState("");
  const [bitmaps, setBitmaps] = useState<Record<string, HTMLImageElement>>({}), [frontage, setFrontage] = useState<HTMLImageElement | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null), drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const bitmapCache = useRef<Record<string, Promise<HTMLImageElement>>>({}), saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const selected = placements.find(p => p.id === selectedId), estimate = selected && state?.calibrations[estimateKey(selected.assetId, selected.revisionId)];
  const outputs = state?.versions || [], output = outputs.find(v => v.id === outputId) || outputs.filter(v => v.enhancedFile).at(-1);
  const job = state?.job, locked = Boolean(job) || busy || Boolean(estimating), jobId = job?.id, ready = Boolean(state);
  const selectedAsset = assets.find(asset => asset.id === selected?.assetId);
  const savedOutputs = outputs.filter(version => version.enhancedFile || version.rawFile);
  const downloadable = Boolean(output?.enhancedFile && (!output.review || output.review.status === "passed"));
  const containerMetres = estimate && selected ? estimate.containerHeightMetres * selected.height / estimate.height : 0;

  useEffect(() => {
    let active = true;
    void Promise.all([request<LoadedState>(endpoint), request<{ assets: PlanterAsset[] }>("/api/planters"), loadImage(sourceUrl)]).then(([saved, library, photo]) => {
      if (!active) return;
      setState(saved); setAssets(library.assets); setPlacements(saved.draft); setSelectedId(saved.draft[0]?.id || ""); setFrontage(photo);
      const preferred = saved.versions.find(v => v.id === saved.resultVersionId && v.enhancedFile && v.review?.status !== "rejected");
      const latest = preferred || saved.versions.filter(v => v.enhancedFile && v.review?.status !== "rejected").at(-1);
      if (latest && !saved.job) { setOutputId(latest.id); setView("enhanced"); }
    }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [endpoint, sourceUrl]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void request<{ assets: PlanterAsset[] }>("/api/planters").then(library => {
        if (active) setAssets(library.assets);
      }).catch(cause => { if (active) setError(cause.message); });
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  useEffect(() => {
    let active = true;
    const needed = placements.filter(p => !bitmaps[estimateKey(p.assetId, p.revisionId)]);
    if (needed.length) void Promise.all(needed.map(async p => {
      const key = estimateKey(p.assetId, p.revisionId);
      bitmapCache.current[key] ??= loadImage(planterFileUrl(p.assetId, revisionFile(p.revisionId)));
      return [key, await bitmapCache.current[key]] as const;
    })).then(values => { if (active) setBitmaps(previous => ({ ...previous, ...Object.fromEntries(values) })); }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [placements, bitmaps]);

  useEffect(() => {
    if (!jobId) return;
    let active = true, pending = false;
    const timer = setInterval(() => {
      if (pending) return; pending = true;
      void request<LoadedState>(endpoint).then(saved => {
        if (!active) return;
        setState(saved);
        const result = saved.versions.find(v => v.id === job?.versionId);
        if (!saved.job && result?.enhancedFile) { setOutputId(result.id); setView("enhanced"); }
      }).catch(cause => { if (active) setError(cause.message); }).finally(() => { pending = false; });
    }, 2500);
    return () => { active = false; clearInterval(timer); };
  }, [jobId, job?.versionId, endpoint]);

  useEffect(() => {
    if (!dirty || !ready) return;
    let active = true;
    const timer = setTimeout(() => {
      setSaveStatus("Saving layout…");
      saveChain.current = saveChain.current.catch(() => {}).then(() => request<CompositionState>(endpoint, { action: "draft", placements }));
      void saveChain.current.then(() => { if (active) setSaveStatus("Layout saved"); }).catch(cause => { if (active) { setSaveStatus("Layout not saved"); setError(cause.message); } });
    }, 700);
    return () => { active = false; clearTimeout(timer); };
  }, [placements, dirty, endpoint, ready]);

  useEffect(() => {
    const target = canvas.current; if (!target || !frontage) return;
    const { width, height } = outputDimensions(frontage.naturalWidth, frontage.naturalHeight);
    target.width = width; target.height = height;
    const ctx = target.getContext("2d")!; ctx.drawImage(frontage, 0, 0, width, height);
    if (view === "original") return;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, width, height * .955); ctx.clip();
    for (const p of [...placements].sort((a, b) => a.y - b.y)) {
      const revision = assets.find(a => a.id === p.assetId)?.revisions.find(r => r.id === p.revisionId), key = estimateKey(p.assetId, p.revisionId), bitmap = bitmaps[key];
      if (!revision || !bitmap) continue;
      const analysis = state?.calibrations[key], g = placementGeometry(p, revision, width, height, analysis);
      const contacts = analysis?.product?.contacts || revision.groundContacts || [{ ...revision.contactPoint, width: .55 }];
      ctx.save(); ctx.filter = "blur(2px)";
      for (const contact of contacts) {
        const point = projectedPoint(g, contact), rx = Math.abs(g.a) * contact.width * .49, ry = Math.max(2, g.height * .018);
        ctx.fillStyle = `rgba(0,0,0,${p.shadow * .48})`; ctx.beginPath(); ctx.ellipse(point.x, point.y, rx, ry, 0, 0, 2 * Math.PI); ctx.fill();
        ctx.fillStyle = `rgba(0,0,0,${p.shadow * .12})`; ctx.beginPath(); ctx.ellipse(point.x + rx * .12, point.y + ry, rx * 1.22, ry * 1.7, 0, 0, 2 * Math.PI); ctx.fill();
      }
      ctx.restore(); ctx.save(); ctx.transform(g.a / bitmap.naturalWidth, g.b / bitmap.naturalWidth, g.c / bitmap.naturalHeight, g.d / bitmap.naturalHeight, g.originX, g.originY); ctx.drawImage(bitmap, 0, 0); ctx.restore();
      if (p.id === selectedId && view === "placement") {
        ctx.save(); ctx.strokeStyle = "#e9f2d8"; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.strokeRect(g.x - 3, g.y - 3, g.width + 6, g.height + 6); ctx.setLineDash([]);
        ctx.fillStyle = "#234e39"; ctx.strokeStyle = "white"; ctx.beginPath(); ctx.arc(p.x * width, p.y * height, 7, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
    ctx.restore();
  }, [frontage, placements, assets, bitmaps, state?.calibrations, selectedId, view]);

  function change(next: Placement[]) { setPlacements(next); setDirty(true); setView("placement"); setError(""); }
  function updatePlacement(update: Partial<Placement>) { if (selected && !locked) change(placements.map(p => p.id === selected.id ? { ...p, ...update } : p)); }
  async function calibrate(assetId: string, revisionId: string) {
    const key = estimateKey(assetId, revisionId), cached = state?.calibrations[key];
    const scale = cached?.analysisVersion === 2 ? cached : await request<ScaleEstimate>(endpoint, { action: "calibrate", assetId, revisionId });
    setState(previous => previous ? { ...previous, calibrations: { ...previous.calibrations, [key]: scale } } : previous);
    return scale;
  }
  async function add(asset: PlanterAsset) {
    const revisionId = asset.approvedRevisionId || asset.revisions.at(-1)?.id;
    if (!revisionId || asset.status === "processing" || locked || placements.length >= 3) return;
    setEstimating(asset.id); setError("");
    try {
      if (!asset.approvedRevisionId) {
        const response = await fetch(`/api/planters/${encodeURIComponent(asset.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approvedRevisionId: revisionId }) });
        const approved = await response.json();
        if (!response.ok) throw new Error(approved.error || "Could not approve this planter.");
        setAssets(previous => previous.map(item => item.id === asset.id ? approved : item));
      }
      const scale = await calibrate(asset.id, revisionId);
      const p: Placement = { id: crypto.randomUUID(), assetId: asset.id, revisionId, x: clamp(scale.ground.x + placements.length * .12, .06, .94), y: scale.ground.y, height: scale.height, perspective: true, shadow: .65 };
      change([...placements, p]); setSelectedId(p.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not place this planter."); }
    finally { setEstimating(""); }
  }
  async function autoSize() {
    if (!selected || locked) return; setEstimating(selected.assetId); setError("");
    try { const scale = await calibrate(selected.assetId, selected.revisionId); change(placements.map(p => p.id === selected.id ? { ...p, height: scale.height, perspective: true, yaw: undefined } : p)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not estimate size."); }
    finally { setEstimating(""); }
  }
  function point(event: PointerEvent<HTMLCanvasElement>) { const box = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }; }
  function startDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (view !== "placement" || locked) return;
    const pointOnCanvas = point(event), target = event.currentTarget;
    for (const p of [...placements].sort((a, b) => b.y - a.y)) {
      const revision = assets.find(a => a.id === p.assetId)?.revisions.find(r => r.id === p.revisionId); if (!revision) continue;
      const g = placementGeometry(p, revision, target.width, target.height, state?.calibrations[estimateKey(p.assetId, p.revisionId)]);
      if (pointOnCanvas.x * target.width >= g.x && pointOnCanvas.x * target.width <= g.x + g.width && pointOnCanvas.y * target.height >= g.y && pointOnCanvas.y * target.height <= g.y + g.height) {
        setSelectedId(p.id); drag.current = { id: p.id, dx: pointOnCanvas.x - p.x, dy: pointOnCanvas.y - p.y }; target.setPointerCapture(event.pointerId); return;
      }
    }
    setSelectedId("");
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    const moving = drag.current; if (!moving || locked) return;
    const p = point(event); change(placements.map(item => item.id === moving.id ? { ...item, x: clamp(p.x - moving.dx, .02, .98), y: clamp(p.y - moving.dy, .1, .94) } : item));
  }
  function nudge(event: KeyboardEvent<HTMLCanvasElement>) {
    if (!selected || locked || view !== "placement" || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault(); const step = event.shiftKey ? .025 : .005;
    updatePlacement({ x: clamp(selected.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0), .02, .98), y: clamp(selected.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0), .1, .94) });
  }
  async function produce(regenerate = false) {
    if (locked || !placements.length) return; setBusy(true); setError("");
    try {
      await saveChain.current.catch(() => {});
      const saved = await request<CompositionState>(endpoint, { action: "enhance", placements, regenerate });
      setState(previous => ({ ...previous, ...saved })); setSaveStatus("Layout saved");
      const result = saved.versions.find(v => v.id === saved.resultVersionId) || saved.versions.at(-1);
      if (result?.enhancedFile && !saved.job) { setOutputId(result.id); setView("enhanced"); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create this output."); }
    finally { setBusy(false); }
  }
  async function deleteVersion(versionId: string) {
    if (locked || !window.confirm("Delete this generated version? This cannot be undone.")) return;
    setBusy(true); setError("");
    try {
      await saveChain.current.catch(() => {});
      const saved = await request<CompositionState & { warning?: string }>(endpoint, { action: "delete-version", versionId });
      setState(previous => ({ ...previous, ...saved }));
      if (output?.id === versionId) {
        const latest = saved.versions.filter(version => version.enhancedFile).at(-1);
        setOutputId(latest?.id || ""); setView(latest ? "enhanced" : "placement");
      }
      if (saved.warning) setError(saved.warning);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete this version."); }
    finally { setBusy(false); }
  }
  async function approveOutput() {
    if (!output || locked) return; setBusy(true);
    try { const saved = await request<CompositionState>(endpoint, { action: "approve", versionId: output.id }); setState(previous => ({ ...previous, ...saved })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not approve this image."); }
    finally { setBusy(false); }
  }
  async function recover(versionId: string) {
    if (locked) return; setBusy(true); setError("");
    try { const saved = await request<CompositionState>(endpoint, { action: "recover", versionId }); setState(previous => ({ ...previous, ...saved })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not recover this render."); }
    finally { setBusy(false); }
  }

  const showingRender = (view === "enhanced" || view === "compare") && output?.enhancedFile;
  return <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_304px]">
    <div className="min-w-0 space-y-5">
      <section aria-label="Composition preview" className="overflow-hidden border border-[#cbd5c4] bg-[#faf9f2]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dce1d4] p-3">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Preview">
            {(["placement", "original", ...(output?.enhancedFile ? ["enhanced", "compare"] : [])] as View[]).map(item => <button key={item} type="button" aria-pressed={view === item} onClick={() => setView(item)} className={`px-3 py-2 text-xs font-semibold ${view === item ? "bg-[#28543c] text-white" : "text-[#69806c] hover:bg-[#e7eddf]"}`}>{item === "placement" ? "Placement" : item === "original" ? "Original" : item === "enhanced" ? "AI Enhanced" : "Compare"}</button>)}
          </div>
          <div className="flex items-center gap-3">
            <span role="status" className="text-[11px] text-[#7d8b79]">{job ? (job.stage === "checking" ? "Checking result…" : "Rendering…") : showingRender ? `Version ${outputs.findIndex(v => v.id === output.id) + 1}` : saveStatus}</span>
            {downloadable && <a href={compositionFileUrl(project.id, output!.enhancedFile!, true)} className={outlineButton}><Download size={14} />Download image</a>}
          </div>
        </div>
        <div className="relative min-h-56 bg-[#d9dfd4]">
          {!frontage && <p role="status" className="p-10 text-center text-sm text-[#6b816d]">Loading storefront…</p>}
          <canvas ref={canvas} aria-label="Storefront planter placement" tabIndex={0} onPointerDown={startDrag} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onKeyDown={nudge} className={`w-full touch-none outline-offset-4 ${frontage && !showingRender ? "block" : "hidden"} ${view === "placement" && !locked ? "cursor-grab active:cursor-grabbing" : ""}`} />
          {showingRender && <div className="relative">
            <img src={compositionFileUrl(project.id, output.enhancedFile!)} alt="AI enhanced storefront composition" className="block w-full" />
            {view === "compare" && <><img src={sourceUrl} alt="Original storefront for comparison" className="absolute inset-0 h-full w-full object-fill" style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }} /><div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_6px_#0008]" style={{ left: `${compare}%` }} /><div className="pointer-events-none absolute left-3 top-3 bg-[#163323]/85 px-2 py-1 text-[10px] font-semibold text-white">Before</div><div className="pointer-events-none absolute right-3 top-3 bg-[#163323]/85 px-2 py-1 text-[10px] font-semibold text-white">After</div></>}
          </div>}
          {job && <div role="status" className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap bg-[#163323]/95 px-4 py-3 text-xs text-white shadow-lg"><LoaderCircle size={15} className="animate-spin" />{job.stage === "checking" ? "Checking product & scene" : "Creating realistic installation"}</div>}
        </div>
        {view === "compare" && <div className="border-t border-[#dce1d4] px-5 py-3"><input aria-label="Before and after comparison" type="range" min="0" max="100" value={compare} onChange={event => setCompare(Number(event.target.value))} className="w-full accent-[#315e44]" /></div>}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[11px] text-[#758471]">
          <span className="flex items-center gap-1.5">{view === "placement" ? <><Move size={12} />Click to select · Drag to place · Arrow keys to nudge.</> : showingRender ? "AI enhanced" : "Saved Street View"}</span>
          <span>{project.image?.provider === "google-street-view" ? project.image.copyright || "© Google" : ""}</span>
        </div>
      </section>

      {(error || state?.error) && <p role="alert" className="border-l-2 border-[#a75c52] bg-[#f5eae4] p-4 text-sm text-[#784841]">{error || state?.error}</p>}
      {showingRender && output.review && output.review.status !== "passed" && <div className="flex flex-wrap items-center justify-between gap-3 border border-[#dec9ae] bg-[#f1ebdf] px-4 py-3">
        <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-[#86674c]">Review before downloading</p>{output.review.issues.length > 0 && <p className="mt-1 text-xs leading-5 text-[#86674c]">{output.review.issues.join(" ")}</p>}</div>
        <button type="button" disabled={locked} onClick={() => void approveOutput()} className={outlineButton}><Check size={14} />Approve image</button>
      </div>}
      <div className="flex flex-wrap items-center justify-between gap-4 border border-[#d2d9cc] bg-[#faf9f2] p-4 sm:p-5">
        <div><h2 className="font-serif text-2xl text-[#254733]">Bring it to life</h2><p className="mt-1 text-xs text-[#758471]">Natural lighting, perspective & shadows.</p></div>
        <div className="flex flex-wrap items-center gap-3">
          {output?.enhancedFile && <button type="button" disabled={locked || !placements.length || state?.configured === false} onClick={() => void produce(true)} className="px-2 py-2 text-xs text-[#6a7c65] underline underline-offset-4 disabled:opacity-40">New version</button>}
          <button type="button" disabled={!placements.length || locked || state?.configured === false} onClick={() => void produce()} className="inline-flex items-center justify-center gap-2 bg-[#28543c] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#183e2a] disabled:cursor-not-allowed disabled:opacity-45">{locked ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}{job ? (job.stage === "checking" ? "Checking result…" : "Rendering…") : busy ? "Preparing scene…" : "AI Enhance"}</button>
        </div>
      </div>
      <p className="text-[11px] text-[#7c8977]">One paid render. Unchanged layouts reuse saved results.</p>
      {state?.configured === false && <p className="text-xs text-[#906f51]">AI Enhance is not enabled on this server.</p>}

      {savedOutputs.length > 0 && <section aria-label="Saved outputs" className="border-t border-[#d2d9cc] pt-5">
        <h2 className="mb-4 font-serif text-2xl text-[#254733]">Versions</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[...savedOutputs].reverse().map(version => <article key={version.id} className={`overflow-hidden border bg-[#faf9f2] ${version.id === outputId ? "border-[#62836a]" : "border-[#d2d9cc]"}`}>
          <button type="button" aria-label={`View version ${outputs.indexOf(version) + 1}`} onClick={() => { if (version.enhancedFile) { setOutputId(version.id); setView("enhanced"); } else if (!locked) { change(version.placements); setSelectedId(version.placements[0]?.id || ""); } }} className="block w-full"><img src={compositionFileUrl(project.id, version.enhancedFile || version.basicFile)} alt={`Saved composition ${outputs.indexOf(version) + 1}`} className="aspect-[4/3] w-full object-contain bg-[#e4e8de]" /></button>
          <div className="space-y-3 p-3"><div className="flex items-center justify-between gap-2 text-[11px]"><span className="font-semibold text-[#4f6d53]">Version {outputs.indexOf(version) + 1}</span>{version.estimatedCostUsd !== undefined && <span className="text-[#7c8977]">≈ ${version.estimatedCostUsd.toFixed(2)}</span>}</div>
            <div className="flex flex-wrap gap-x-3 gap-y-2 text-[11px] font-semibold text-[#315e44]">
              {version.rawFile && !version.enhancedFile && [3, 4, 5].includes(version.engine || 0) && <button type="button" disabled={locked} onClick={() => void recover(version.id)} className="underline underline-offset-2 disabled:opacity-40">Recover render</button>}
              {version.enhancedFile && (!version.review || version.review.status === "passed") && <a href={compositionFileUrl(project.id, version.enhancedFile, true)} className="underline underline-offset-2">Download image</a>}
              {version.enhancedFile && version.review && version.review.status !== "passed" && <span className="text-[#987148]">{version.review.status === "rejected" ? "Quality check failed" : "Needs review"}</span>}
              <button type="button" disabled={locked} aria-label={`Delete version ${outputs.indexOf(version) + 1}`} onClick={() => void deleteVersion(version.id)} className="inline-flex items-center gap-1 text-[#956250] disabled:opacity-40"><Trash2 size={12} />Delete</button>
              <button type="button" disabled={locked} onClick={() => { change(version.placements); setSelectedId(version.placements[0]?.id || ""); }} className="underline underline-offset-2 disabled:opacity-40">Edit layout</button>
            </div>
          </div>
        </article>)}</div>
      </section>}
    </div>

    <aside className="space-y-5 xl:sticky xl:top-5">
      <section className="border border-[#d2d9cc] bg-[#faf9f2] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-2xl text-[#254733]">Planters</h2><Link href="/#planter-library-title" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#315e44] hover:underline"><Plus size={14} />Add planter</Link></div>
        <div className="grid grid-cols-2 gap-3">{assets.filter(a => a.revisions.length > 0).map(asset => {
          const revisionId = asset.approvedRevisionId || asset.revisions.at(-1)!.id;
          return <div key={asset.id} className="border border-[#d4ddcd] bg-[#f1f3e9]">
            <button type="button" disabled={!state || locked || placements.length >= 3 || asset.status === "processing"} onClick={() => void add(asset)} aria-label={`${asset.approvedRevisionId ? "Place" : "Approve and place"} ${asset.name}`} className="w-full text-left transition hover:bg-[#e8eee2] disabled:opacity-50"><img src={planterFileUrl(asset.id, revisionFile(revisionId))} alt={asset.name} className="planter-checker h-28 w-full object-contain p-2" /><span className="block px-2.5 py-2.5 text-[11px] font-semibold leading-4 text-[#48654e]">{estimating === asset.id ? "Reading scene…" : asset.name}{!asset.approvedRevisionId && <span className="mt-1 block font-normal">{asset.status === "processing" ? "Extracting…" : "Approve & place"}</span>}</span></button>
            {!asset.approvedRevisionId && <Link href={`/planters/${asset.id}`} className="block border-t border-[#d4ddcd] px-2.5 py-2 text-[11px] text-[#48654e] underline">Review cutout</Link>}
          </div>;
        })}</div>
        {!assets.some(a => a.revisions.length > 0) && <p className="text-sm leading-6 text-[#778873]">Extract a planter in the <Link href="/#planter-library-title" className="underline">planter library</Link> to place it here.</p>}
        {placements.length >= 3 && <p className="mt-3 text-xs text-[#7b8876]">Maximum of 3 planters.</p>}
      </section>
      {placements.length > 0 && <section className="border border-[#d2d9cc] bg-[#faf9f2] p-5">
        <div className="mb-4 flex items-center justify-between gap-2"><h2 className="font-serif text-2xl text-[#254733]">{selected ? "Adjust planter" : "Select a planter"}</h2><span className="text-[11px] tabular-nums text-[#7b8876]">{placements.length} / 3</span></div>
        <div role="group" aria-label="Placed planters" className="flex flex-wrap gap-2">{placements.map((p, index) => <button key={p.id} type="button" aria-label={`Select planter ${index + 1}: ${assets.find(a => a.id === p.assetId)?.name || "Planter"}`} aria-pressed={selectedId === p.id} disabled={locked} onClick={() => { setSelectedId(p.id); setView("placement"); }} className={`relative h-16 w-16 border p-1.5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315e44] disabled:opacity-50 ${selectedId === p.id ? "border-[#315e44] bg-[#e6edde] ring-1 ring-[#315e44]" : "border-[#d4ddcd] bg-[#f1f3e9] hover:border-[#62806b]"}`}><img src={planterFileUrl(p.assetId, revisionFile(p.revisionId))} alt="" className="h-full w-full object-contain" /><span className="absolute bottom-0.5 right-1 text-[9px] font-semibold text-[#527058]">{index + 1}</span></button>)}</div>
        {selected ? <p className="mt-3 truncate text-xs font-semibold text-[#5b745e]">{selectedAsset?.name || "Planter"}</p> : <p className="mt-3 text-xs text-[#7b8876]">Click a planter in the image to adjust it.</p>}
        {selected && <fieldset disabled={locked} className="mt-5 space-y-5 disabled:opacity-50">
          <label className="block text-xs font-semibold text-[#5b745e]">Size<input aria-label="Planter size" type="range" min="0.03" max="0.9" step="0.005" value={selected.height} onChange={event => updatePlacement({ height: Number(event.target.value) })} className="mt-3 w-full accent-[#315e44]" /></label>
          <label className="block text-xs font-semibold text-[#5b745e]">Facing<select aria-label="Planter facing" value={selected.yaw === undefined ? "auto" : "custom"} onChange={event => updatePlacement({ yaw: event.target.value === "auto" ? undefined : 0 })} className="mt-2 w-full border border-[#c8d2c2] bg-[#fffef9] px-2 py-2 text-xs font-normal"><option value="auto">Match the storefront</option><option value="custom">Choose an angle</option></select></label>
          {selected.yaw !== undefined && <label className="block text-xs text-[#5b745e]">Turn {selected.yaw > 0 ? "+" : ""}{selected.yaw}°<input aria-label="Planter angle" type="range" min="-60" max="60" step="5" value={selected.yaw} onChange={event => updatePlacement({ yaw: Number(event.target.value) })} className="mt-2 w-full accent-[#315e44]" /></label>}
          <label className="flex items-start gap-2 text-xs leading-5 text-[#5b745e]"><input type="checkbox" checked={selected.perspective} onChange={event => updatePlacement({ perspective: event.target.checked })} className="mt-1 accent-[#315e44]" />Adjust scale with distance</label>
          <div className="grid grid-cols-2 gap-3 text-[11px] font-semibold text-[#527058]">
            <button type="button" onClick={() => void autoSize()} className="inline-flex items-center gap-1.5"><RotateCcw size={13} />Auto size</button>
            <button type="button" onClick={() => updatePlacement({ flip: !selected.flip })} className="inline-flex items-center gap-1.5"><FlipHorizontal2 size={13} />Flip arrangement</button>
            <button type="button" disabled={placements.length >= 3} onClick={() => { const next = { ...selected, id: crypto.randomUUID(), x: clamp(selected.x + .16, .05, .95) }; change([...placements, next]); setSelectedId(next.id); }} className="inline-flex items-center gap-1.5 disabled:opacity-50"><Copy size={13} />Duplicate</button>
            <button type="button" onClick={() => { change(placements.filter(p => p.id !== selected.id)); setSelectedId(""); }} className="inline-flex items-center gap-1.5 text-[#956250]"><Trash2 size={13} />Remove</button>
          </div>
        </fieldset>}
      </section>}
      {estimate && <section aria-label="Approximate scale" className="border border-[#d2d9cc] bg-[#e8eee2] p-5 text-[#60765e]">
        <div className="mb-4 flex items-center justify-between gap-2"><h2 className="text-xs font-semibold">Approximate scale</h2><span className="text-[10px] text-[#7b8876]">{estimate.method === "vision" ? "AI estimate" : "Typical sizes"}</span></div>
        <p className="mb-4 text-xs leading-5">{estimate.method === "vision" ? <>Compared with <span className="font-semibold">{estimate.scene?.referenceName || "a visible doorway or person"}</span> in this photo. Its height is assumed, not measured.</> : "No clear object to measure against. Starting from a typical 2.10 m doorway and standard planter proportions."}</p>
        <dl className="grid grid-cols-2 gap-4">
          <div><dt className="text-[10px] text-[#758471]">Your container</dt><dd className="mt-1 font-serif text-3xl tabular-nums text-[#254733]">≈ {containerMetres.toFixed(2)}<span className="ml-1 text-base">m</span></dd><p className="mt-1 text-[10px] text-[#758471]">Height, excluding foliage</p></div>
          <div><dt className="text-[10px] text-[#758471]">Assumed reference height</dt><dd className="mt-1 font-serif text-3xl tabular-nums text-[#254733]">≈ {estimate.reference.heightMetres.toFixed(2)}<span className="ml-1 text-base">m</span></dd></div>
        </dl>
        <div className="mt-4 border-t border-[#ccd7c4] pt-3 text-[11px] leading-5"><p className="tabular-nums">Container ≈ {Math.round(containerMetres / estimate.reference.heightMetres * 100)}% of {estimate.method === "vision" ? "that object's" : "a typical doorway's"} height.</p><p className="mt-1 text-[#7b8876]">Size follows the photo’s proportions and your slider. A visual guide, not installation measurements.</p></div>
      </section>}
    </aside>
  </div>;
}
