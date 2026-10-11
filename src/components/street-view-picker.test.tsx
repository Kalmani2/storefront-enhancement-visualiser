import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StreetViewPicker } from "./street-view-picker";
import type { GoogleVenue, StreetViewCandidate } from "../lib/google/types";

const venue: GoogleVenue = { placeId: "testplace1234", name: "Test Cafe", address: "1 Test Street", latitude: 51.514, longitude: -0.136, category: "cafe", mapsUrl: "https://maps.google.com" };
const cameras: StreetViewCandidate[] = Array.from({ length: 5 }, (_, index) => ({ panoId: `pano-${index}`, token: `signed-${index}`, latitude: 51.514, longitude: -0.1362, distanceMetres: 12, heading: 90, fov: 65, pitch: -5, copyright: "© Google", date: "2026-01" }));

describe("Street View image request controls", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
    vi.stubGlobal("cancelAnimationFrame", clearTimeout);
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => Promise.resolve(url.endsWith("/metadata")
      ? new Response(JSON.stringify({ available: true, candidates: cameras, camerasChecked: 7, streetMatched: true }))
      : new Response("image", { headers: { "Content-Type": "image/jpeg" } }))));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-image");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("automatically loads views once even under development StrictMode", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<React.StrictMode><StreetViewPicker venue={venue} onSelection={vi.fn()} /></React.StrictMode>);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(6));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Load 5 views" })).not.toBeInTheDocument();
  });

  it("loads exact camera references and framing changes automatically, reusing cached frames", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const selected = vi.fn();
    render(<StreetViewPicker venue={venue} onSelection={selected} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(6));
    await waitFor(() => expect(selected).toHaveBeenCalledWith(expect.objectContaining({ candidate: cameras[0], offset: 0, fov: 65, imageUrl: "blob:test-image" })));
    expect(window.confirm).not.toHaveBeenCalled();
    const calls = vi.mocked(fetch).mock.calls.slice(1);
    expect(calls.map(([, options]) => JSON.parse(options!.body as string).candidateToken)).toEqual(cameras.map((camera) => camera.token));
    expect(screen.queryByRole("button", { name: "Load 5 views" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load selected view only" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Framing"), { target: { value: "45" } });
    await waitFor(() => expect(selected).toHaveBeenCalledWith(expect.objectContaining({ candidate: cameras[0], offset: 0, fov: 45, imageUrl: "blob:test-image" })));
    expect(fetch).toHaveBeenCalledTimes(7);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[6][1]!.body as string)).toMatchObject({ candidateToken: cameras[0].token, fov: 45 });
    fireEvent.change(screen.getByLabelText("Framing"), { target: { value: "0" } });
    await waitFor(() => expect(selected).toHaveBeenLastCalledWith(expect.objectContaining({ fov: 65 })));
    expect(fetch).toHaveBeenCalledTimes(7);
  });

  it("does not loop on failed downloads and permits explicit retry", async () => {
    vi.mocked(fetch).mockImplementation(async url => String(url).endsWith("/metadata") ? Response.json({ candidates: [cameras[0]] }) : Response.json({ error: "Provider unavailable" }, { status: 502 }));
    render(<StreetViewPicker venue={venue} onSelection={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Provider unavailable");
    expect(fetch).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Retry unavailable views" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  });
});
