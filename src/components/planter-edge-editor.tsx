"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { LoaderCircle, X } from "lucide-react";

export function PlanterEdgeEditor({ src, onClose, onSave }: { src: string; onClose: () => void; onSave: (blob: Blob) => Promise<void> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalRef = useRef<HTMLCanvasElement | null>(null);
  const history = useRef<ImageData[]>([]);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [tool, setTool] = useState<"erase" | "restore">("erase");
  const [size, setSize] = useState(24);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [background, setBackground] = useState("checker");
  const [undoCount, setUndoCount] = useState(0);

  useEffect(() => {
    dialogRef.current?.showModal();
    const image = new Image();
    image.crossOrigin = "anonymous";
    let active = true;
    image.onload = () => {
      if (!active || !canvasRef.current) return;
      const canvas = canvasRef.current;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")!.drawImage(image, 0, 0);
      const original = document.createElement("canvas");
      original.width = canvas.width; original.height = canvas.height;
      original.getContext("2d")!.drawImage(image, 0, 0);
      originalRef.current = original;
      setReady(true);
    };
    image.onerror = () => { if (active) setError("Could not load the cutout for editing."); };
    image.src = src;
    return () => { active = false; };
  }, [src]);

  function paint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!, ctx = canvas.getContext("2d")!, rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * canvas.width / rect.width, y = (event.clientY - rect.top) * canvas.height / rect.height;
    const radius = size * canvas.width / rect.width / 2;
    const previous = lastPoint.current || { x, y };
    const distance = Math.hypot(x - previous.x, y - previous.y), steps = Math.max(1, Math.ceil(distance / Math.max(1, radius / 3)));
    for (let i = 1; i <= steps; i++) {
      const px = previous.x + (x - previous.x) * i / steps, py = previous.y + (y - previous.y) * i / steps;
      ctx.save();
      ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2);
      if (tool === "erase") { ctx.globalCompositeOperation = "destination-out"; ctx.fill(); }
      else { ctx.clip(); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(originalRef.current!, 0, 0); }
      ctx.restore();
    }
    lastPoint.current = { x, y };
  }

  function down(event: PointerEvent<HTMLCanvasElement>) {
    if (!ready || saving) return;
    event.preventDefault();
    const canvas = canvasRef.current!;
    history.current.push(canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height));
    if (history.current.length > 12) history.current.shift();
    setUndoCount(history.current.length);
    canvas.setPointerCapture(event.pointerId);
    lastPoint.current = null;
    paint(event);
  }

  function undo() {
    const previous = history.current.pop();
    if (previous) canvasRef.current!.getContext("2d")!.putImageData(previous, 0, 0);
    setUndoCount(history.current.length);
  }

  async function save() {
    setSaving(true); setError("");
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvasRef.current!.toBlob(value => value ? resolve(value) : reject(new Error("Could not save the edited image.")), "image/png"));
      await onSave(blob);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save edits."); setSaving(false); }
  }

  return <dialog ref={dialogRef} onCancel={event => { if (saving) event.preventDefault(); else onClose(); }} className="m-auto max-h-[94vh] w-[min(1100px,94vw)] overflow-auto border border-[#bdcdbb] bg-[#f5f5ed] p-0 text-[#294632] shadow-2xl backdrop:bg-[#183322]/50" aria-labelledby="edge-editor-title">
    <div className="flex items-center justify-between border-b border-[#d2d8cb] px-6 py-4"><h2 id="edge-editor-title" className="font-serif text-3xl">Refine edges</h2><button type="button" disabled={saving} onClick={onClose} aria-label="Close edge editor" className="p-2"><X size={20} /></button></div>
    <div className="flex flex-wrap items-center gap-4 px-6 py-4 text-sm"><div className="flex border border-[#bacab6]">{(["erase", "restore"] as const).map(value => <button key={value} disabled={saving} type="button" aria-pressed={tool === value} onClick={() => setTool(value)} className={`px-4 py-2 capitalize ${tool === value ? "bg-[#28543b] text-white" : "bg-[#fafbf5]"}`}>{value}</button>)}</div><label className="flex items-center gap-2">Brush <input type="range" min="4" max="80" value={size} onChange={event => setSize(Number(event.target.value))} /></label><button type="button" disabled={!undoCount || saving} onClick={undo} className="underline disabled:opacity-40">Undo</button><label className="ml-auto flex items-center gap-2">Background<select value={background} onChange={event => setBackground(event.target.value)} className="border border-[#bacab6] bg-[#fafbf5] p-2"><option value="checker">Checkerboard</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
    <div className={`flex min-h-64 items-center justify-center overflow-auto p-4 ${background === "checker" ? "planter-checker" : background === "dark" ? "bg-[#27332b]" : "bg-white"}`}><canvas ref={canvasRef} aria-label="Planter cutout edge editing canvas" onPointerDown={down} onPointerMove={event => { if (lastPoint.current && event.buttons) paint(event); }} onPointerUp={() => { lastPoint.current = null; }} onPointerCancel={() => { lastPoint.current = null; }} className="max-h-[58vh] max-w-full cursor-crosshair touch-none object-contain" /></div>
    {error && <p role="alert" className="px-6 pt-4 text-sm text-[#974c40]">{error}</p>}
    <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5"><p className="max-w-lg text-xs leading-5 text-[#748472]">Erase unwanted pixels; restore brings back pixels from this result. Save creates a new version without an AI call.</p><button type="button" disabled={!ready || saving || !undoCount} onClick={() => void save()} className="inline-flex items-center gap-2 bg-[#28543b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving && <LoaderCircle size={15} className="animate-spin" />}{saving ? "Saving…" : "Save new version"}</button></div>
  </dialog>;
}
