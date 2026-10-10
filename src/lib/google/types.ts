export type GoogleVenue = {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  category: string;
  mapsUrl: string;
  businessStatus?: "OPERATIONAL";
  primaryType?: string;
  streetName?: string;
  prospectReasons?: string[];
};

export type GoogleSearchResult = {
  location: string;
  category: string;
  venues: GoogleVenue[];
  totalFound?: number;
  excluded?: { reason: string; count: number }[];
};

export type StreetViewMetadata = {
  available: boolean;
  panoId?: string;
  latitude?: number;
  longitude?: number;
  distanceMetres?: number;
  heading?: number;
  date?: string;
  copyright?: string;
  reason?: string;
  candidates?: StreetViewCandidate[];
  camerasChecked?: number;
  skipped?: { reason: string; count: number }[];
  streetMatched?: boolean;
};

export type StreetViewCandidate = {
  panoId: string;
  latitude: number;
  longitude: number;
  distanceMetres: number;
  heading: number;
  fov: number;
  pitch: number;
  date?: string;
  copyright: string;
  alignment?: "near-perpendicular" | "oblique";
  token: string;
};
