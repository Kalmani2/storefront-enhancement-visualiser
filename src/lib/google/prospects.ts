import type { GoogleVenue } from "./types";

export const categories = ["cafe", "restaurant", "bar", "hair salon", "shop"] as const;
export type GoogleCategory = typeof categories[number];

export const categoryProfiles: Record<GoogleCategory, { query: string; type: string; matches: string[] }> = {
  cafe: { query: "independent cafes", type: "cafe", matches: ["cafe", "coffee_shop", "tea_house"] },
  restaurant: { query: "independent restaurants", type: "restaurant", matches: ["restaurant"] },
  bar: { query: "independent wine bars and pubs", type: "bar", matches: ["bar", "pub", "wine_bar", "cocktail_bar"] },
  "hair salon": { query: "independent hair salons", type: "hair_salon", matches: ["hair_salon", "hair_care", "barber_shop"] },
  shop: { query: "independent clothing boutiques", type: "clothing_store", matches: ["clothing_store"] },
};

export type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  types?: string[];
  googleMapsUri?: string;
  businessStatus?: string;
  pureServiceAreaBusiness?: boolean;
  containingPlaces?: { id?: string; name?: string }[];
  addressComponents?: { longText?: string; types?: string[] }[];
  openingDate?: { year?: number; month?: number; day?: number };
  viewport?: { low?: { latitude: number; longitude: number }; high?: { latitude: number; longitude: number } };
};

export type SearchBounds = { south: number; north: number; west: number; east: number };
export const londonBounds: SearchBounds = { south: 51.28, north: 51.7, west: -0.55, east: 0.3 };
// Deliberately use a central-Soho pilot window to avoid spilling into Mayfair/Fitzrovia.
export const sohoBounds: SearchBounds = { south: 51.512, north: 51.516, west: -0.1408, east: -0.1305 };

export function inBounds(latitude: number, longitude: number, bounds: SearchBounds) {
  return latitude >= bounds.south && latitude <= bounds.north && longitude >= bounds.west && longitude <= bounds.east;
}

// A transparent exclusion list, not a claim to prove independent ownership.
const chains = [
  "starbucks", "costa", "caffe nero", "pret a manger", "pret", "greggs", "gail s", "gails", "joe the juice",
  "blank street", "black sheep coffee", "cafe kitsune", "mcdonald s", "mcdonalds", "burger king", "kfc",
  "subway", "pizza express", "pizzaexpress", "wagamama", "nando s", "nandos", "five guys", "itsu", "wasabi",
  "leon", "dishoom", "the ivy", "honest burgers", "flat iron", "bill s", "bills", "all bar one", "slug lettuce",
  "wetherspoon", "jd wetherspoon", "greene king", "o neill s", "zara", "h m", "uniqlo", "next", "mango",
  "primark", "marks spencer", "m s", "cos", "arket", "urban outfitters", "anthropologie", "reiss", "allsaints",
  "superdry", "massimo dutti", "hollister", "abercrombie fitch", "toni guy", "headmasters", "rush hair",
];

function normalizedName(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function isKnownChain(name: string) {
  const normalized = normalizedName(name);
  return chains.some((chain) => normalized === chain || normalized.startsWith(`${chain} `) || normalized.endsWith(` ${chain}`));
}

export function screenProspect(place: GooglePlace, category: GoogleCategory, bounds: SearchBounds, today = new Date()): { venue: GoogleVenue } | { reason: string } {
  if (!place.id || !place.displayName?.text || !Number.isFinite(place.location?.latitude) || !Number.isFinite(place.location?.longitude)) return { reason: "Incomplete business identity or location" };
  if (place.businessStatus !== "OPERATIONAL") return { reason: "Closed, future opening, or operating status unknown" };
  if (place.openingDate?.year) {
    const opening = Date.UTC(place.openingDate.year, (place.openingDate.month || 1) - 1, place.openingDate.day || 1);
    if (opening > today.getTime()) return { reason: "Future opening date" };
  }
  if (place.pureServiceAreaBusiness) return { reason: "No customer-facing premises" };
  const latitude = place.location!.latitude!;
  const longitude = place.location!.longitude!;
  if (!inBounds(latitude, longitude, bounds) || !inBounds(latitude, longitude, londonBounds)) return { reason: "Outside the selected London area" };
  const types = new Set([place.primaryType, ...(place.types || [])]);
  if (!categoryProfiles[category].matches.some((type) => types.has(type))) return { reason: "Does not match the selected business type" };
  if (types.has("meal_delivery") && !types.has("restaurant")) return { reason: "Delivery business without a restaurant frontage" };
  if (isKnownChain(place.displayName.text)) return { reason: "Known chain or large retail brand" };
  const address = place.formattedAddress || "";
  const components = place.addressComponents || [];
  const hasStreet = components.some((component) => component.types?.includes("route")) || /\b(street|st\b|road|rd\b|lane|ln\b|place|square|mews|avenue|court|terrace|walk|gardens|way|circus|yard|row|hill|passage|market|broadwick|piccadilly|strand)\b/i.test(address);
  if (!address || !hasStreet) return { reason: "No identifiable street address" };
  if (/\b(basement|lower ground|first floor|second floor|third floor|\d+(?:st|nd|rd|th) floor)\b/i.test(address)) return { reason: "Address indicates a non-ground-floor unit" };
  const warnings = [
    ...(place.containingPlaces?.length ? ["Inside another complex: street entrance needs visual confirmation"] : []),
    ...(/\b(suite|unit|upper ground)\b/i.test(address) ? ["Unit address: street access needs visual confirmation"] : []),
  ];
  return { venue: {
    placeId: place.id, name: place.displayName.text, address, latitude, longitude,
    category: place.primaryType?.replaceAll("_", " ") || category,
    primaryType: place.primaryType,
    streetName: components.find((component) => component.types?.includes("route"))?.longText,
    businessStatus: "OPERATIONAL",
    mapsUrl: place.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.id)}`,
    prospectReasons: ["Listed as operational", "Relevant business type", "Physical street address", "No known-chain match"],
    prospectWarnings: warnings,
    prospectScore: 100 - warnings.length * 20 + (components.some(c => c.types?.includes("street_number")) ? 5 : 0),
  } };
}
