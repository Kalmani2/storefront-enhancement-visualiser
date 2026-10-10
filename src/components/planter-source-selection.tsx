"use client";
/* eslint-disable @next/next/no-img-element */

import { useRef, useState, type PointerEvent } from "react";
import type { SelectionBox } from "@/lib/planters/types";

export function PlanterSourceSelection({ src, selection, onChange, disabled }: { src: string; selection?: SelectionBox; onChange: (value?: SelectionBox) => void; disabled: boolean }) {
  const frame = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [draft, setDraft] = useState<SelectionBox | null>(null);

  function point(event: PointerEvent) {
    const rect = frame.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  }
  function down(event: PointerEvent<HTMLDivElement>) {
    if (!selecting || disabled) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = point(event);
    setDraft(null);
  }
  function move(event: PointerEvent) {
    if (!start.current) return;
    const end = point(event), first = start.current;
    setDraft({ x: Math.min(first.x, end.x), y: Math.min(first.y, end.y), width: Math.abs(end.x - first.x), height: Math.abs(end.y - first.y) });
  }
  function up(event: PointerEvent) {
    if (!start.current) return;
    const end = point(event), first = start.current;
    const box = { x: Math.min(first.x, end.x), y: Math.min(first.y, end.y), width: Math.abs(end.x - first.x), height: Math.abs(end.y - first.y) };
    if (box.width >= 0.02 && box.height >= 0.02) onChange(box);
    start.current = null;
    setDraft(null);
    setSelecting(false);
  }
  const box = draft || selection;
  return <>
    <div className="flex min-h-[340px] items-center justify-center bg-[#dfe3d8] p-4">
      <div ref={frame} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { start.current = null; setDraft(null); }} className={`relative inline-block max-w-full leading-none ${selecting ? "cursor-crosshair touch-none" : ""}`}>
        <img src={src} alt="Original planter photo" draggable={false} className="max-h-[500px] max-w-full object-contain" />
        {box && <span className="pointer-events-none absolute border-2 border-[#ed684a] bg-[#ed684a]/10" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }} />}
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-4 px-5 py-3 text-xs"><button type="button" disabled={disabled} onClick={() => setSelecting(!selecting)} aria-pressed={selecting} className="font-semibold text-[#376747] underline underline-offset-4 disabled:opacity-50">{selecting ? "Cancel selection" : selection ? "Change target area" : "Select target area"}</button>{selection && <button type="button" disabled={disabled} onClick={() => onChange(undefined)} className="text-[#7c8879] underline underline-offset-4">Use whole photo</button>}{selecting && <span role="status" className="text-[#7c8879]">Draw around the containers and all their plants.</span>}</div>
  </>;
}
