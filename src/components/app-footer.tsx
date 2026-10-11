import { ArrowUpRight } from "lucide-react";

export function AppFooter() {
  return <footer className="border-t border-[#d2d8cb] bg-[#e8ecdf] text-[#61735d]">
    <div className="mx-auto flex max-w-[1460px] flex-col gap-5 px-6 py-7 sm:flex-row sm:items-center sm:justify-between md:px-10">
      <div className="space-y-1.5 text-xs leading-5">
        <p>Made by <span className="font-semibold text-[#315e44]">Muhammad Kalmani</span></p>
        <p className="text-[#788572]">For demo purposes only. Not for commercial use.</p>
      </div>
      <a href="https://github.com/Kalmani2/storefront-enhancement-visualiser" target="_blank" rel="noreferrer" className="group inline-flex w-fit items-center gap-2.5 text-xs font-semibold text-[#315e44] outline-offset-4 hover:underline">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .75a11.25 11.25 0 0 0-3.558 21.922c.563.104.769-.244.769-.542 0-.267-.01-.975-.015-1.913-3.13.68-3.79-1.508-3.79-1.508-.512-1.3-1.25-1.646-1.25-1.646-1.022-.699.077-.685.077-.685 1.13.08 1.725 1.16 1.725 1.16 1.005 1.722 2.637 1.225 3.28.937.103-.728.393-1.225.715-1.506-2.5-.284-5.13-1.25-5.13-5.563 0-1.229.44-2.234 1.16-3.022-.116-.285-.503-1.43.11-2.98 0 0 .945-.303 3.094 1.155a10.78 10.78 0 0 1 5.626 0c2.148-1.458 3.091-1.155 3.091-1.155.614 1.55.227 2.695.112 2.98.722.788 1.158 1.793 1.158 3.022 0 4.324-2.633 5.276-5.142 5.555.404.35.765 1.043.765 2.1 0 1.516-.014 2.74-.014 3.112 0 .3.203.65.774.54A11.251 11.251 0 0 0 12 .75Z" /></svg>View on GitHub<ArrowUpRight size={14} aria-hidden="true" className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none" />
      </a>
    </div>
  </footer>;
}
