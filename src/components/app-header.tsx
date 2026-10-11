import Link from "next/link";
import { FolderOpen, Search } from "lucide-react";
import { BrandMark } from "./brand-mark";

type Section = "library" | "discover";

const items = [
  { href: "/google", label: "Venue search", icon: Search, section: "discover" },
  { href: "/", label: "Library", icon: FolderOpen, section: "library" },
] as const;

export function AppHeader({ active }: { active: Section }) {
  return <header className="border-b border-[#d8dbd0] bg-[#f8f8f1]">
    <div className="mx-auto flex max-w-[1460px] flex-wrap items-center justify-between gap-5 px-6 py-4 md:px-10">
      <Link href="/" className="flex items-center gap-3" aria-label="Storefront Visualiser home">
        <BrandMark />
        <span className="text-[12px] font-bold uppercase leading-[1.25] tracking-[0.16em] text-[#234231]">Storefront<br /><span className="font-medium">Visualiser</span></span>
      </Link>
      <nav aria-label="Primary navigation" className="flex items-center gap-1 rounded-sm border border-[#d6dbd0] bg-[#f0f1e8] p-1">
        {items.map(({ href, label, icon: Icon, section }) => <Link key={section} href={href} aria-current={active === section ? "page" : undefined} className={`flex items-center gap-2 rounded-[2px] px-3 py-2.5 text-xs font-semibold transition-colors sm:px-4 ${active === section ? "bg-[#254e3b] text-white shadow-sm" : "text-[#667568] hover:bg-[#e1e8dc] hover:text-[#284d38]"}`}><Icon size={15} strokeWidth={1.9} /><span>{label}</span></Link>)}
      </nav>
    </div>
  </header>;
}
