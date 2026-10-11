import { AppHeader } from "@/components/app-header";
import { VenueSearch } from "@/components/venue-search";

export default function GoogleDiscovery() {
  return <main className="min-h-screen bg-[#f0f0e8] text-[#263c2e]">
    <AppHeader active="discover" />
    <VenueSearch />
  </main>;
}
