import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FrontageDiscovery } from "./frontage-discovery";
import { RULES_VERSION, type ApprovedVenue } from "../lib/frontage/types";

const approved: ApprovedVenue = {
  venue: { placeId: "testplace1234", name: "Test Cafe", address: "1 Test Street, Soho", latitude: 51.514, longitude: -.136, category: "cafe", mapsUrl: "https://maps.google.com" },
  area: "Soho", status: "approved", savedAt: "2026-10-11T00:00:00Z",
  review: { id: "a".repeat(64), venueId: "testplace1234", rulesVersion: RULES_VERSION, model: "gpt-4.1-mini", fingerprint: "b".repeat(64), checkedAt: "2026-10-11T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z",
    frame: { source: "streetview", panoId: "pano", latitude: 51.514, longitude: -.136, heading: 90, pitch: -5, fov: 65, width: 640, height: 480, copyright: "© Google" },
    verdict: "approved", assessment: { identity: "confirmed", exterior: true, entranceVisible: true, framingUsable: true, placementSpace: true, underDressed: true, imageQuality: true, issues: [], reason: "Correct signage and clear pavement.", action: "accept", entranceBox: null } },
};
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json({ venues: [approved] }))));
  vi.spyOn(window, "confirm").mockReturnValue(false);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:approved-image");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("approved shortlist controls", () => {
  it("browses and filters stored approvals without making paid image requests", async () => {
    render(<FrontageDiscovery />);
    expect(await screen.findByText("Test Cafe")).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Filter approved venues"), { target: { value: "elsewhere" } });
    expect(screen.queryByText("Test Cafe")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("requires confirmation both for loading a preview and starting new discovery", async () => {
    render(<FrontageDiscovery />); fireEvent.click(await screen.findByRole("button", { name: "Load approved view" }));
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Discover 3 venues" }));
    expect(window.confirm).toHaveBeenCalledTimes(2); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not send a new assessment when reopening a saved image", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(fetch).mockImplementation(async (url) => String(url).includes("approved-venues") ? new Response("image", { headers: { "Content-Type": "image/jpeg" } }) : Response.json({ venues: [approved] }));
    render(<FrontageDiscovery />); fireEvent.click(await screen.findByRole("button", { name: "Load approved view" }));
    expect(await screen.findByAltText("Assessed entrance of Test Cafe")).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Create project" })).toBeEnabled();
  });
  it("restores a running job as paused instead of resuming spend on mount", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ venues: [], run: { id: "run", status: "running", message: "Ready", images: 2, reviews: 2, reused: 0, cursor: 1, approvedIds: [], attempts: [] } }));
    render(<FrontageDiscovery />);
    expect(await screen.findByText("Discovery paused — ready to resume")).toBeVisible();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Resume" })).toBeEnabled();
  });
  it("removes a shortlist entry without calling any project deletion endpoint", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(fetch).mockImplementation(async (_url, options) => options?.method === "DELETE" ? Response.json({ removed: true }) : Response.json({ venues: [approved] }));
    render(<FrontageDiscovery />); fireEvent.click(await screen.findByRole("button", { name: "Remove Test Cafe from shortlist" }));
    await waitFor(() => expect(screen.queryByText("Test Cafe")).not.toBeInTheDocument());
    expect(vi.mocked(fetch).mock.calls.at(-1)?.[0]).toBe("/api/approved-venues/testplace1234");
  });
});
