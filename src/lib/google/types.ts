export type GoogleVenue = {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  category: string;
  mapsUrl: string;
};

export type GoogleSearchResult = {
  location: string;
  category: string;
  venues: GoogleVenue[];
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
};
