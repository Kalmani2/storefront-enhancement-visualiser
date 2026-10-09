import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStreetViewMetadata, searchGoogleVenues } from "./provider";
import type { GoogleVenue } from "./types";

const venue: GoogleVenue = {
  placeId: "testplace1234", name: "Test Cafe", address: "1 Test Street, London",
  latitude: 51.514, longitude: -0.13, category: "cafe", mapsUrl: "https://maps.google.com",
};

describe("Google comparison provider", () => {
  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it("requests only a small Places page with a bounded field mask", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      places: [{ id: venue.placeId, displayName: { text: venue.name }, formattedAddress: venue.address,
        location: { latitude: venue.latitude, longitude: venue.longitude }, primaryType: "cafe" }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await searchGoogleVenues("Soho", "cafe");
    expect(result.venues).toHaveLength(1);
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(options.body as string)).toMatchObject({ pageSize: 12, textQuery: "cafes in Soho, London, UK" });
    expect((options.headers as Record<string, string>)["X-Goog-FieldMask"]).not.toContain("photos");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("computes a heading from the panorama camera to the business", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "OK", pano_id: "pano123", location: { lat: 51.514, lng: -0.1302 },
    }), { status: 200 })));
    const result = await getStreetViewMetadata(venue);
    expect(result.available).toBe(true);
    expect(result.heading).toBe(90);
    expect(result.distanceMetres).toBeLessThan(20);
  });
});
