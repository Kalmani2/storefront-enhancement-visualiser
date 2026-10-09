import { beforeEach, describe, expect, it, vi } from "vitest";
import { findFrontage } from "./frontage";
import { assessImage } from "./assessment";
import { findStreetImages } from "./imagery";
import type { FrontageImage, Venue } from "./types";

vi.mock("./assessment", () => ({ assessImage: vi.fn() }));
vi.mock("./imagery", () => ({ findStreetImages: vi.fn() }));

const venue: Venue = {
  id: "node/1", name: "Test Cafe", category: "Café", latitude: 51.514, longitude: -0.136,
  address: "1 Test Street", postcode: "W1", osmUrl: "https://www.openstreetmap.org/node/1",
};
const images: FrontageImage[] = ["101", "102", "103"].map((id) => ({
  id, url: `https://example.com/${id}.jpg`, sourceUrl: "https://www.mapillary.com/",
  creator: "test", distanceMetres: 10,
}));

describe("single-photo frontage assessment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findStreetImages).mockResolvedValue({ images, found: 3 });
    vi.mocked(assessImage).mockImplementation(async (_venue, image) => ({
      image, decision: "rejected", reason: "No matching signage", venueMatch: "no",
      entranceVisible: false, suitableForPlanters: false,
    }));
  });

  it("assesses only the selected image, never all candidates", async () => {
    const result = await findFrontage(venue, "102");
    expect(assessImage).toHaveBeenCalledTimes(1);
    expect(assessImage).toHaveBeenCalledWith(venue, images[1]);
    expect(result.attempts).toHaveLength(1);
  });

  it("does not call OpenAI for an unavailable image", async () => {
    await expect(findFrontage(venue, "999")).rejects.toThrow("no longer available");
    expect(assessImage).not.toHaveBeenCalled();
  });
});
