import type { PlanterId } from "@/lib/planters";

export function PlanterPlaceholder({ variant }: { variant: PlanterId }) {
  return <div className="grid h-full min-h-40 place-items-center overflow-hidden bg-[#e8e9df]" aria-label={`${variant} planter illustration`} role="img">
    <svg viewBox="0 0 280 210" className="h-full max-h-52 w-full" aria-hidden="true">
      <ellipse cx="140" cy="184" rx="74" ry="10" fill="#bac3b3" opacity=".55" />
      {variant === "classic" && <>
        <path d="M87 67H193L183 89C176 105 163 118 155 131L159 161H121L125 131C117 118 104 105 97 89Z" fill="#9c856a" stroke="#76644f" strokeWidth="3" />
        <path d="M107 160H173L184 174H96Z" fill="#846e56" stroke="#6f5a47" strokeWidth="3" />
        <ellipse cx="140" cy="67" rx="55" ry="12" fill="#b9a184" stroke="#76644f" strokeWidth="3" />
        <ellipse cx="140" cy="66" rx="42" ry="7" fill="#584f40" />
        <path d="M104 88C112 108 124 120 130 136" fill="none" stroke="#ccb59a" strokeWidth="5" opacity=".6" />
      </>}
      {variant === "trough" && <>
        <path d="M40 84H240L225 165H55Z" fill="#8b8b78" stroke="#666c60" strokeWidth="3" />
        <path d="M41 84H239V98H41Z" fill="#adb19e" stroke="#666c60" strokeWidth="3" />
        <path d="M56 105L67 155" fill="none" stroke="#c4c5b1" strokeWidth="5" opacity=".6" />
        <path d="M66 165V176M214 165V176" stroke="#62695d" strokeWidth="8" />
        <path d="M54 83C85 70 195 70 226 83" fill="none" stroke="#535c50" strokeWidth="6" />
      </>}
      {variant === "cylinder" && <>
        <path d="M97 57H183V171C183 183 97 183 97 171Z" fill="#a7a795" stroke="#737a70" strokeWidth="3" />
        <path d="M110 73V166" stroke="#d0d0bd" strokeWidth="7" opacity=".6" />
        <ellipse cx="140" cy="57" rx="43" ry="11" fill="#c2c1ad" stroke="#737a70" strokeWidth="3" />
        <ellipse cx="140" cy="57" rx="32" ry="6" fill="#555d50" />
      </>}
    </svg>
  </div>;
}
