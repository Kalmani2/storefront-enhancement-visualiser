"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Camera, RefreshCw } from "lucide-react";
import type { GoogleVenue, StreetViewCandidate, StreetViewMetadata } from "@/lib/google/types";

export type StreetViewSelection = { candidate: StreetViewCandidate; offset: number; fov: number };

const frameKey = (candidate: StreetViewCandidate, offset = 0, fov = candidate.fov) => `${candidate.panoId}:${offset}:${fov}`;

export function StreetViewPicker({ venue, onSelection }: { venue: GoogleVenue; onSelection: (selection: StreetViewSelection | null) => void }) {
  const [metadata, setMetadata] = useState<StreetViewMetadata | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [images, setImages] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState(0);
  const [width, setWidth] = useState(0);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadedCount, setLoadedCount] = useState(0);
  const urls = useRef<string[]>([]);
  const alive = useRef(true);
  const candidates = metadata?.candidates || [];
  const camera = candidates.find((candidate) => candidate.panoId === selectedId);
  const fov = width || camera?.fov || 60;
  const image = camera ? images[frameKey(camera, offset, fov)] : undefined;

  const lookup = useCallback(async (signal?: AbortSignal) => {
    setChecking(true);
    setError("");
    try {
      const response = await fetch("/api/google/streetview/metadata", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ venue }), cache: "no-store", signal,
      });
      const result = await response.json() as StreetViewMetadata & { error?: string };
      if (!response.ok) throw new Error(result.error || "Camera lookup failed.");
      if (!alive.current || signal?.aborted) return;
      setMetadata(result);
      setSelectedId(result.candidates?.[0]?.panoId || "");
      setOffset(0);
      setWidth(0);
    } catch (cause) {
      if (alive.current && !signal?.aborted) setError(cause instanceof Error ? cause.message : "Camera lookup failed.");
    } finally {
      if (alive.current && !signal?.aborted) setChecking(false);
    }
  }, [venue]);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    const frame = requestAnimationFrame(() => { void lookup(controller.signal); });
    return () => {
      alive.current = false;
      cancelAnimationFrame(frame);
      controller.abort();
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current = [];
    };
  }, [lookup]);

  useEffect(() => {
    onSelection(camera && image ? { candidate: camera, offset, fov } : null);
  }, [camera, image, offset, fov, onSelection]);

  async function loadFrames(frames: StreetViewSelection[]) {
    if (!frames.length || loading) return;
    if (!window.confirm(`Load ${frames.length} Google Street View image${frames.length === 1 ? "" : "s"}? Each image uses one request against your monthly allowance; charges apply after it is exhausted.`)) return;
    setLoading(true);
    setError("");
    setLoadedCount(0);
    const failures: string[] = [];
    // Bound the batch to five. Sequential loading allows navigation away to stop remaining requests.
    for (const frame of frames.slice(0, 5)) {
      if (!alive.current) break;
      try {
        const response = await fetch("/api/google/streetview/image", {
          method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
          body: JSON.stringify({ venue, candidateToken: frame.candidate.token, offset: frame.offset, fov: frame.fov }),
        });
        if (!response.ok) {
          const result = await response.json() as { error?: string };
          throw new Error(result.error || "Street View image failed.");
        }
        const url = URL.createObjectURL(await response.blob());
        if (!alive.current) { URL.revokeObjectURL(url); break; }
        urls.current.push(url);
        setImages((previous) => ({ ...previous, [frameKey(frame.candidate, frame.offset, frame.fov)]: url }));
        setLoadedCount((previous) => previous + 1);
      } catch (cause) {
        failures.push(cause instanceof Error ? cause.message : "Image could not be loaded.");
      }
    }
    if (alive.current) {
      setLoading(false);
      if (failures.length) setError(`${failures.length} view(s) could not be loaded. ${failures[0]}`);
    }
  }

  const pending = candidates.filter((candidate) => !images[frameKey(candidate)]);

  return <div>
    <div className="relative flex min-h-[420px] items-center justify-center bg-[#d7d9cf]">
      {image ? <img src={image} alt={`Street View camera aimed toward ${venue.name}; entrance identity requires visual inspection`} className="w-full max-w-[640px] object-contain" /> : <div className="max-w-lg px-8 py-12 text-center">
        <Camera className="mx-auto mb-4 text-[#748674]" size={34} />
        <p className="font-serif text-2xl text-[#3a4e3d]">{checking ? "Finding outdoor street cameras…" : camera ? `${candidates.length} distinct camera view${candidates.length === 1 ? "" : "s"} available.` : metadata?.reason || "No camera available."}</p>
        <p className="mt-3 text-sm leading-6 text-[#738174]">Outdoor collections with Google attribution, on the street in the business address. Select a view and load it to inspect the entrance.</p>
      </div>}
      {image && <span className="absolute left-4 top-4 bg-[#f8f7ef]/95 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#47664d]">Outdoor collection · Google attribution</span>}
    </div>

    <div className="space-y-5 p-5">
      {candidates.length > 0 && <>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#526a57]">Compare camera positions</p><span className="text-xs text-[#849082]">{metadata?.camerasChecked} positions searched</span></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {candidates.map((candidate, index) => <button key={candidate.panoId} type="button" disabled={loading} aria-pressed={selectedId === candidate.panoId} onClick={() => { setSelectedId(candidate.panoId); setOffset(0); setWidth(0); }} className={`overflow-hidden border text-left transition-colors disabled:opacity-60 ${selectedId === candidate.panoId ? "border-[#2f6446] bg-[#e6eee1] ring-1 ring-[#2f6446]" : "border-[#d0d7ca] bg-[#f1f2e8] hover:bg-[#e8eee2]"}`}>
            <span className="flex h-20 items-center justify-center overflow-hidden bg-[#dbe1d5]">{images[frameKey(candidate)] ? <img src={images[frameKey(candidate)]} alt={`Camera view ${index + 1}`} className="h-full w-full object-cover" /> : <Camera size={20} className="text-[#81917d]" />}</span>
            <span className="block px-2.5 py-2"><span className="block text-xs font-semibold text-[#36563e]">View {index + 1} · {candidate.distanceMetres}m</span><span className="mt-1 block text-[10px] text-[#7a8976]">{candidate.date || "Date unavailable"}{index === 0 ? " · suggested" : ""}</span></span>
          </button>)}
        </div>
        <div className="flex flex-wrap gap-3">
          {pending.length > 0 && <button type="button" disabled={loading || checking} onClick={() => void loadFrames(pending.map((candidate) => ({ candidate, offset: 0, fov: candidate.fov })))} className="flex items-center gap-2 bg-[#245239] px-4 py-3 text-sm font-semibold text-white hover:bg-[#193f2c] disabled:opacity-50">{loading ? `Loading views… ${loadedCount}` : `Load ${pending.length} candidate view${pending.length === 1 ? "" : "s"}`}<ArrowRight size={15} /></button>}
          {camera && !image && <button type="button" disabled={loading || checking} onClick={() => void loadFrames([{ candidate: camera, offset, fov }])} className="border border-[#39694b] px-4 py-3 text-sm font-semibold text-[#2f6243] disabled:opacity-50">Load selected view only</button>}
        </div>
        {camera && <div className="space-y-3 border-t border-[#deded2] pt-4">
          <p className="text-sm leading-6 text-[#647264]">Camera {camera.distanceMetres}m from the business pin · {camera.heading}° toward the venue{camera.date ? ` · captured ${camera.date}` : ""}.{camera.alignment === "near-perpendicular" ? " Estimated camera alignment is across the street." : " Inspect the frontage and doorway before choosing this view."}</p>
          <div className="flex flex-wrap gap-4"><label className="text-xs font-semibold text-[#526a57]">Direction<select value={offset} disabled={loading} onChange={(event) => setOffset(Number(event.target.value))} className="ml-2 border border-[#bfcbbd] bg-[#f5f6ee] px-3 py-2 text-sm font-normal"><option value={-30}>30° left</option><option value={-15}>15° left</option><option value={0}>Toward business</option><option value={15}>15° right</option><option value={30}>30° right</option></select></label><label className="text-xs font-semibold text-[#526a57]">Framing<select value={width} disabled={loading} onChange={(event) => setWidth(Number(event.target.value))} className="ml-2 border border-[#bfcbbd] bg-[#f5f6ee] px-3 py-2 text-sm font-normal"><option value={0}>Suggested ({camera.fov}°)</option><option value={45}>Closer (45°)</option><option value={65}>Standard (65°)</option><option value={85}>Wider (85°)</option></select></label></div>
          <p className="text-xs text-[#849080]">Adjusting the frame requires a new image request. Confirmation is required before loading.</p>
        </div>}
      </>}
      {error && <p role="alert" className="border-l-2 border-[#a5564c] bg-[#f6e9e3] p-3 text-sm text-[#6b3b37]">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#deded2] pt-4"><p className="text-xs leading-5 text-[#6f7c70]"><span className="font-semibold text-[#424a43]">Google Maps</span>{camera?.copyright ? ` · ${camera.copyright}` : ""}<br />Imagery date may predate this business. Entrance visibility is not yet verified.</p><button type="button" disabled={checking || loading} onClick={() => void lookup()} className="flex items-center gap-1.5 text-xs text-[#4e7355] hover:underline disabled:opacity-50"><RefreshCw size={12} />Refresh cameras</button></div>
      {metadata?.streetMatched && <p className="text-xs text-[#7c8976]">Address street matched using road geometry © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap contributors</a>. This does not verify the shop identity or unobstructed entrance.</p>}
      {metadata?.skipped && metadata.skipped.length > 0 && <details className="text-xs text-[#7c8976]"><summary className="cursor-pointer">Camera source checks</summary><ul className="mt-2 space-y-1">{metadata.skipped.map((item) => <li key={item.reason}>{item.count} · {item.reason}</li>)}</ul></details>}
    </div>
  </div>;
}
