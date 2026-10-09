export type Bounds = { south: number; west: number; north: number; east: number };

export type Venue = {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  address: string;
  postcode: string;
  website?: string;
  osmUrl: string;
};

export type SearchResult = {
  location: string;
  bounds: Bounds;
  totalFound: number;
  venues: Venue[];
  excluded: { reason: string; count: number }[];
};

export type FrontageImage = {
  id: string;
  url: string;
  sourceUrl: string;
  creator: string;
  capturedAt?: string;
  distanceMetres: number;
  headingDifference?: number;
};

export type ImageAttempt = {
  image: FrontageImage;
  decision: "accepted" | "rejected";
  reason: string;
  venueMatch: "confirmed" | "uncertain" | "no";
  entranceVisible: boolean;
  suitableForPlanters: boolean;
};

export type FrontageResult = {
  venue: Venue;
  image?: FrontageImage;
  attempts: ImageAttempt[];
  reason: string;
  imagesFound: number;
};
