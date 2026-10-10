import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGoogleVenue, getStreetViewMetadata, loadStreetViewImage, searchGoogleLocation, searchGoogleVenues } from "./provider";
import { hasGoogleAttribution, readFrame } from "./streetview";
import { screenProspect, sohoBounds, type GooglePlace } from "./prospects";
import type { GoogleVenue } from "./types";
import { findVenueStreet, projectToStreet, type VenueStreet } from "./streets";

const venue: GoogleVenue = {
  placeId: "testplace1234", name: "Test Cafe", address: "1 Test Street, Soho, London",
  latitude: 51.514, longitude: -0.136, category: "cafe", mapsUrl: "https://maps.google.com",
};
const place: GooglePlace = {
  id: venue.placeId, displayName: { text: venue.name }, formattedAddress: venue.address,
  location: { latitude: venue.latitude, longitude: venue.longitude }, primaryType: "cafe", types: ["cafe"], businessStatus: "OPERATIONAL",
};
const street: VenueStreet = {
  name: "Test Street", bearing: 0,
  anchor: { latitude: venue.latitude, longitude: venue.longitude - 0.0002 },
  lines: [[{ latitude: 51.5135, longitude: -0.1362 }, { latitude: 51.5145, longitude: -0.1362 }]],
};
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });

describe("Google venue and camera selection", () => {
  beforeEach(() => { vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key"); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("searches an explicit address in one request without prospect filters", async () => {
    const chain = { ...place, id: "chain-place", displayName: { text: "Starbucks Soho" } };
    const address = { ...place, id: "address-place", displayName: undefined, primaryType: "street_address", businessStatus: undefined };
    const fetchMock = vi.fn().mockResolvedValue(json({ places: [chain, address, chain, { ...place, id: "outside", location: { latitude: 53, longitude: -1 } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await searchGoogleLocation("49 Frith Street");
    expect(result.venues.map(item => item.placeId)).toEqual(["chain-place", "address-place"]);
    expect(result.venues[1].name).toBe(place.formattedAddress);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ textQuery: "49 Frith Street, London", pageSize: 5 });
    expect(body).not.toHaveProperty("includedType");
    expect(body).not.toHaveProperty("strictTypeFiltering");
  });

  it("can reopen a saved street address without requiring business operating status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ...place, displayName: undefined, businessStatus: undefined })));
    const result = await getGoogleVenue(venue.placeId);
    expect(result.name).toBe(place.formattedAddress);
    expect(result.businessStatus).toBeUndefined();
  });

  it("uses strict category and area restrictions with Pro fields, then excludes closed and chain listings", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ places: [place, { ...place, id: "closed", businessStatus: "CLOSED_PERMANENTLY" }, { ...place, id: "chain", displayName: { text: "Starbucks Soho" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await searchGoogleVenues("Soho", "cafe");
    expect(result.venues.map((item) => item.name)).toEqual([venue.name]);
    expect(result.totalFound).toBe(3);
    expect(result.excluded).toHaveLength(2);
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(options.body as string)).toMatchObject({ pageSize: 20, includedType: "cafe", strictTypeFiltering: true, includePureServiceAreaBusinesses: false, locationRestriction: { rectangle: { low: { latitude: sohoBounds.south, longitude: sohoBounds.west } } } });
    const fields = (options.headers as Record<string, string>)["X-Goog-FieldMask"];
    expect(fields).toContain("places.businessStatus");
    expect(fields).not.toMatch(/rating|userRatingCount|websiteUri|regularOpeningHours/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { businessStatus: "CLOSED_TEMPORARILY" },
    { businessStatus: undefined },
    { businessStatus: "FUTURE_OPENING" },
    { openingDate: { year: 2099, month: 1, day: 1 } },
    { pureServiceAreaBusiness: true },
    { primaryType: "hotel", types: ["hotel"] },
    { location: { latitude: 51.53, longitude: -0.136 } },
    { containingPlaces: [{ id: "shopping-centre" }] },
    { formattedAddress: "First Floor, 1 Test Street, Soho, London" },
    { formattedAddress: undefined },
  ])("excludes unsuitable business data: %j", (override) => {
    expect(screenProspect({ ...place, ...override }, "cafe", sohoBounds)).toHaveProperty("reason");
  });

  it("looks around the venue, deduplicates cameras, and excludes contributor imagery", async () => {
    const fetchMock = vi.fn().mockImplementation((input: URL) => {
      expect(input.searchParams.get("source")).toBe("outdoor");
      const location = input.searchParams.get("location")!;
      const lat = Number(location.split(",")[0]);
      return Promise.resolve(json(lat > venue.latitude + 0.0001
        ? { status: "OK", pano_id: "contributor", copyright: "© A Photographer", location: { lat: 51.5141, lng: -0.1362 } }
        : { status: "OK", pano_id: "google-camera", copyright: "© Google", date: "2025-04", location: { lat: 51.514, lng: -0.1362 } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await getStreetViewMetadata(venue, street);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates![0]).toMatchObject({ panoId: "google-camera", heading: 90 });
    expect(result.skipped).toContainEqual(expect.objectContaining({ reason: "Contributor or unknown imagery attribution" }));
  });

  it("returns up to five distinct source-screened cameras", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      calls += 1;
      return Promise.resolve(json({ status: "OK", pano_id: `camera-${calls}`, copyright: "© 2026 Google", date: "2026-01", location: { lat: venue.latitude + (calls - 5) * 0.000025, lng: venue.longitude - 0.0002 } }));
    }));
    const result = await getStreetViewMetadata(venue, street);
    expect(result.candidates).toHaveLength(5);
    expect(new Set(result.candidates!.map((item) => item.panoId)).size).toBe(5);
  });

  it("does not fall back to contributor images when no Google-attributed cameras exist", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(json({ status: "OK", pano_id: "user-sphere", copyright: "© Jane Smith", location: { lat: venue.latitude, lng: venue.longitude - 0.0002 } }))));
    const result = await getStreetViewMetadata(venue, street);
    expect(result.available).toBe(false);
    expect(result.candidates).toEqual([]);
  });

  it("renders the exact signed camera without a second metadata lookup and prevents tampering", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(json({ status: "OK", pano_id: "specific-camera", copyright: "© Google", location: { lat: venue.latitude, lng: venue.longitude - 0.0002 } }))));
    const result = await getStreetViewMetadata(venue, street);
    const token = result.candidates![0].token;
    const imageMock = vi.fn().mockResolvedValue(new Response("image", { headers: { "Content-Type": "image/jpeg" } }));
    vi.stubGlobal("fetch", imageMock);
    await loadStreetViewImage(venue, 15, token, 65);
    expect(imageMock).toHaveBeenCalledTimes(1);
    const url = imageMock.mock.calls[0][0] as URL;
    expect(url.pathname).toBe("/maps/api/streetview");
    expect(url.searchParams.get("pano")).toBe("specific-camera");
    expect(url.searchParams.get("heading")).toBe("105");
    expect(url.searchParams.get("fov")).toBe("65");
    expect(() => readFrame(`${token}x`, venue.placeId)).toThrow();
    expect(() => readFrame(token, "another-place")).toThrow();
  });

  it("uses conservative attribution matching", () => {
    expect(hasGoogleAttribution("© Google")).toBe(true);
    expect(hasGoogleAttribution("© 2026 Google")).toBe(true);
    expect(hasGoogleAttribution("© Google LLC")).toBe(true);
    expect(hasGoogleAttribution("© Google Street View Fan")).toBe(false);
    expect(hasGoogleAttribution("")).toBe(false);
  });

  it("excludes a Google-attributed camera on the rear street", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(json({ status: "OK", pano_id: "rear-road", copyright: "© Google", location: { lat: venue.latitude, lng: venue.longitude + 0.0002 } }))));
    const result = await getStreetViewMetadata(venue, street);
    expect(result.available).toBe(false);
    expect(result.skipped).toContainEqual(expect.objectContaining({ reason: "Camera is not on the street in the business address" }));
  });

  it("projects the business onto its address street rather than a neighbouring road", () => {
    const result = projectToStreet(venue, street.lines);
    expect(result?.point.longitude).toBeCloseTo(-0.1362, 5);
    expect(result?.point.latitude).toBeCloseTo(venue.latitude, 5);
    expect(result?.distance).toBeGreaterThan(10);
  });

  it("resolves address-street geometry from a small OSM map extract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ elements: [
      { type: "node", id: 1, lat: 51.5135, lon: -0.1362 },
      { type: "node", id: 2, lat: 51.5145, lon: -0.1362 },
      { type: "way", id: 3, nodes: [1, 2], tags: { highway: "residential", name: "Test Street" } },
      { type: "way", id: 4, nodes: [1, 2], tags: { highway: "residential", name: "Wrong Street" } },
    ] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await findVenueStreet({ ...venue, streetName: "Test St" });
    expect(result?.lines).toHaveLength(1);
    expect(result?.anchor.longitude).toBeCloseTo(-0.1362, 5);
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.hostname).toBe("api.openstreetmap.org");
    expect(url.pathname).toBe("/api/0.6/map.json");
    const [west, south, east, north] = url.searchParams.get("bbox")!.split(",").map(Number);
    expect(east - west).toBeLessThan(0.003);
    expect(north - south).toBeLessThan(0.002);
  });

  it("does not request a random Street View camera when the address street is missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ elements: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getStreetViewMetadata({ ...venue, streetName: "Unmapped Street" });
    expect(result).toMatchObject({ available: false, streetMatched: false, camerasChecked: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][0] as URL).hostname).toBe("api.openstreetmap.org");
  });
});
