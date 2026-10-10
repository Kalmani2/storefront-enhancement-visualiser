import { ImageOff } from "lucide-react";

const palettes = [
  { wall: "#d9d4bc", trim: "#746e55", awning: "#3a634d", glass: "#a4b7a9" },
  { wall: "#d9d1c5", trim: "#876d5d", awning: "#a0755a", glass: "#a8b8b0" },
  { wall: "#d0d8cc", trim: "#5a6b5e", awning: "#516f61", glass: "#a9beb5" },
];

export function FrontagePlaceholder({ variant = 0, compact = false }: { variant?: number; compact?: boolean }) {
  const palette = palettes[variant % palettes.length];
  return <div className={`relative isolate overflow-hidden bg-[#d7dfd1] ${compact ? "h-52" : "min-h-[390px]"}`} aria-label="Illustrative storefront placeholder, not a real venue photograph">
    <div className="absolute inset-x-0 bottom-0 h-[18%] bg-[#b8b8a9]" />
    <div className="absolute inset-x-[8%] bottom-[14%] h-[76%] shadow-[14px_10px_0_rgba(42,55,43,0.12)]" style={{ backgroundColor: palette.wall }}>
      <div className="absolute inset-x-0 top-0 h-[12%]" style={{ backgroundColor: palette.trim }} />
      <div className="absolute left-[6%] right-[6%] top-[21%] h-[13%] border-t-4 border-[#f0ede1] shadow-[0_7px_0_rgba(36,50,35,0.18)]" style={{ backgroundColor: palette.awning }} />
      <div className="absolute bottom-[7%] left-[7%] h-[45%] w-[27%] border-[7px] border-[#ece7d7]" style={{ backgroundColor: palette.glass }}><span className="absolute inset-x-[8%] top-1/2 border-t-2 border-[#e9ebdf]" /></div>
      <div className="absolute bottom-[7%] left-[39%] h-[45%] w-[22%] border-[7px] border-[#ece7d7]" style={{ backgroundColor: palette.glass }}><span className="absolute bottom-[40%] right-[9%] h-2 w-1 rounded-full bg-[#e4e5d6]" /></div>
      <div className="absolute bottom-[7%] right-[7%] h-[45%] w-[27%] border-[7px] border-[#ece7d7]" style={{ backgroundColor: palette.glass }}><span className="absolute inset-x-[8%] top-1/2 border-t-2 border-[#e9ebdf]" /></div>
    </div>
    <div className="absolute inset-x-0 bottom-0 h-[8%] bg-[#9fa393]" />
    <span className="absolute left-4 top-4 flex items-center gap-1.5 bg-[#f8f7ef]/95 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#61715f]"><ImageOff size={12} /> Illustration · photo not stored</span>
  </div>;
}
