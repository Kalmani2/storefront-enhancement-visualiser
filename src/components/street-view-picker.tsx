"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, LoaderCircle, RefreshCw } from "lucide-react";
import type { GoogleVenue, StreetViewCandidate, StreetViewMetadata } from "@/lib/google/types";

export type StreetViewSelection = { candidate: StreetViewCandidate; offset: number; fov: number; imageUrl?: string };

const frameKey = (candidate: StreetViewCandidate, offset = 0, fov = candidate.fov) => `${candidate.panoId}:${candidate.heading}:${candidate.pitch}:${offset}:${fov}`;

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
  const attempted = useRef(new Set<string>());
  const loadingRef = useRef(false);
  const imageAbort = useRef<AbortController | null>(null);
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
      imageAbort.current?.abort();
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current = [];
    };
  }, [lookup]);

  useEffect(() => {
    onSelection(camera && image ? { candidate: camera, offset, fov, imageUrl: image } : null);
  }, [camera, image, offset, fov, onSelection]);

  const loadFrames = useCallback(async (frames: StreetViewSelection[]) => {
    if (!frames.length || loadingRef.current) return;
    loadingRef.current = true;
    const controller = new AbortController();
    imageAbort.current = controller;
    setLoading(true);
    setError("");
    setLoadedCount(0);
    const failures: string[] = [];
    // Bound the batch to five. Sequential loading allows navigation away to stop remaining requests.
    for (const frame of frames.slice(0, 5)) {
      if (!alive.current || controller.signal.aborted) break;
      const key = frameKey(frame.candidate, frame.offset, frame.fov);
      if (attempted.current.has(key)) continue;
      attempted.current.add(key);
      try {
        const response = await fetch("/api/google/streetview/image", {
          method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: controller.signal,
          body: JSON.stringify({ venue, candidateToken: frame.candidate.token, offset: frame.offset, fov: frame.fov }),
        });
        if (!response.ok) {
          const result = await response.json() as { error?: string };
          throw new Error(result.error || "Street View image failed.");
        }
        const url = URL.createObjectURL(await response.blob());
        if (!alive.current || controller.signal.aborted) { URL.revokeObjectURL(url); break; }
        urls.current.push(url);
        setImages((previous) => ({ ...previous, [frameKey(frame.candidate, frame.offset, frame.fov)]: url }));
        setLoadedCount((previous) => previous + 1);
      } catch (cause) {
        if (controller.signal.aborted) break;
        failures.push(cause instanceof Error ? cause.message : "Image could not be loaded.");
      }
    }
    loadingRef.current = false;
    if (alive.current && !controller.signal.aborted) {
      setLoading(false);
      if (failures.length) setError(`${failures.length} view(s) could not be loaded. ${failures[0]}`);
    }
  }, [venue]);

  useEffect(() => {
    const frames = (metadata?.candidates || []).slice(0, 5).map(candidate => ({ candidate, offset: candidate.panoId === selectedId ? offset : 0, fov: candidate.panoId === selectedId ? fov : candidate.fov }));
    // A failed frame stays attempted until an explicit retry. State updates,
    // thumbnails and repeated selection cannot trigger duplicate paid requests.
    if (frames.some(frame => !attempted.current.has(frameKey(frame.candidate, frame.offset, frame.fov)))) void loadFrames(frames);
  }, [metadata, selectedId, offset, fov, loadFrames]);

  const pending = candidates.map(candidate => ({ candidate, offset: candidate.panoId === selectedId ? offset : 0, fov: candidate.panoId === selectedId ? fov : candidate.fov }))
    .filter(frame => !images[frameKey(frame.candidate, frame.offset, frame.fov)]);

  return <div>
    <div className="relative flex min-h-[420px] items-center justify-center bg-[#d7d9cf]">
      {image ? <div className="relative aspect-[4/2.865] w-full max-w-[640px] overflow-hidden"><img src={image} alt={`Street View of ${venue.name}`} className="absolute inset-x-0 top-0 w-full" /></div> : <div className="max-w-lg px-8 py-12 text-center">
        <Camera className="mx-auto mb-4 text-[#748674]" size={34} />
        <p className="font-serif text-2xl text-[#3a4e3d]">{checking ? "Finding street views…" : camera ? `${candidates.length} view${candidates.length === 1 ? "" : "s"} available` : metadata?.reason || "No street views available."}</p>
        {camera && <p className="mt-3 text-sm text-[#738174]">{loading ? "Loading available views automatically…" : "Choose a view below to compare images."}</p>}
      </div>}
    </div>

    <div className="space-y-5 p-5">
      {candidates.length > 0 && <>
        <p className="text-xs font-semibold text-[#526a57]">Street views</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {candidates.map((candidate, index) => <button key={candidate.panoId} type="button" disabled={loading} aria-pressed={selectedId === candidate.panoId} onClick={() => { setSelectedId(candidate.panoId); setOffset(0); setWidth(0); }} className={`overflow-hidden border text-left transition-colors disabled:opacity-60 ${selectedId === candidate.panoId ? "border-[#2f6446] bg-[#e6eee1] ring-1 ring-[#2f6446]" : "border-[#d0d7ca] bg-[#f1f2e8] hover:bg-[#e8eee2]"}`}>
            <span className="flex h-20 items-center justify-center overflow-hidden bg-[#dbe1d5]">{images[frameKey(candidate)] ? <img src={images[frameKey(candidate)]} alt={`Camera view ${index + 1}`} className="h-full w-full origin-top scale-[1.05] object-cover" /> : <Camera size={20} className="text-[#81917d]" />}</span>
            <span className="block px-2.5 py-2"><span className="block text-xs font-semibold text-[#36563e]">View {index + 1}</span><span className="mt-1 block text-[10px] text-[#7a8976]">{candidate.date || "Date unavailable"}</span></span>
          </button>)}
        </div>
        <div className="flex flex-wrap gap-3">
          {loading && <p role="status" className="flex items-center gap-2 text-sm text-[#526a57]"><LoaderCircle size={15} className="animate-spin" />Loading views… {loadedCount}</p>}
          {!loading && error && pending.length > 0 && <button type="button" onClick={() => { for (const frame of pending) attempted.current.delete(frameKey(frame.candidate, frame.offset, frame.fov)); void loadFrames(pending); }} className="text-sm underline">Retry unavailable views</button>}
        </div>
        {camera && <div className="space-y-3 border-t border-[#deded2] pt-4">
          <div className="flex flex-wrap gap-4"><label className="text-xs font-semibold text-[#526a57]">Direction<select value={offset} disabled={loading} onChange={(event) => setOffset(Number(event.target.value))} className="ml-2 border border-[#bfcbbd] bg-[#f5f6ee] px-3 py-2 text-sm font-normal"><option value={-30}>30° left</option><option value={-15}>15° left</option><option value={0}>Toward business</option><option value={15}>15° right</option><option value={30}>30° right</option></select></label><label className="text-xs font-semibold text-[#526a57]">Framing<select value={width} disabled={loading} onChange={(event) => setWidth(Number(event.target.value))} className="ml-2 border border-[#bfcbbd] bg-[#f5f6ee] px-3 py-2 text-sm font-normal"><option value={0}>Suggested ({camera.fov}°)</option><option value={45}>Closer (45°)</option><option value={65}>Standard (65°)</option><option value={85}>Wider (85°)</option></select></label></div>
          <p className="text-xs text-[#849080]">Views load automatically. Changing direction or framing retrieves the updated image; previously loaded frames are reused.</p>
        </div>}
      </>}
      {error && <p role="alert" className="border-l-2 border-[#a5564c] bg-[#f6e9e3] p-3 text-sm text-[#6b3b37]">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#deded2] pt-4"><p className="text-xs leading-5 text-[#6f7c70]"><span className="font-semibold text-[#424a43]">Google Maps</span>{camera?.copyright ? ` · ${camera.copyright}` : ""}<br />Check the image shows the correct storefront.</p><button type="button" disabled={checking || loading} onClick={() => void lookup()} className="flex items-center gap-1.5 text-xs text-[#4e7355] hover:underline disabled:opacity-50"><RefreshCw size={12} />Refresh views</button></div>
      {metadata?.streetMatched && <p className="text-[10px] text-[#7c8976]">Road data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap contributors</a></p>}
    </div>
  </div>;
}
