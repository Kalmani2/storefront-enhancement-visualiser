import { beforeEach, afterEach, beforeAll, afterAll, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProjectActions, PlanterActions } from "./library-actions";
import type { Project } from "@/lib/projects";
import type { PlanterAsset } from "@/lib/planters/types";

const project: Project = { id: "google-test", title: "Cafe", venueId: "place", source: "google", sourceUrl: "https://maps.google.com", createdAt: "2026-10-10", notes: "Original notes" };
const asset = { id: "11111111-1111-4111-8111-111111111111", name: "Garden pair", notes: "Terracotta", status: "approved" } as PlanterAsset;
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, writable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, writable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
});
afterAll(() => {
  for (const [name, descriptor] of [["showModal", originalShowModal], ["close", originalClose]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("requires explicit confirmation and cancelling deletion makes no request", () => {
  const deleted = vi.fn();
  render(<ProjectActions project={project} onUpdated={vi.fn()} onDeleted={deleted} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete project Cafe" }));
  expect(screen.getByRole("dialog", { name: "Delete project?" })).toBeVisible();
  expect(screen.getByText(/permanently removes the project/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled(); expect(deleted).not.toHaveBeenCalled();
});

it("updates project metadata through PATCH, without any image or generation requests", async () => {
  const updated = vi.fn();
  vi.mocked(fetch).mockResolvedValue(Response.json({ ...project, title: "New concept" }));
  render(<ProjectActions project={project} onUpdated={updated} onDeleted={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit project Cafe" }));
  fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "New concept" } });
  fireEvent.change(screen.getByLabelText("Project notes"), { target: { value: "Place two urns" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(updated).toHaveBeenCalledWith(expect.objectContaining({ title: "New concept" })));
  expect(fetch).toHaveBeenCalledOnce();
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  expect(url).toBe("/api/projects/google-test"); expect(options?.method).toBe("PATCH");
  expect(JSON.parse(options!.body as string)).toEqual({ title: "New concept", address: "", category: "", notes: "Place two urns" });
  expect(screen.getByRole("status")).toHaveTextContent("Changes saved.");
});

it("keeps the dialog open and the item intact when deleting a referenced planter is refused", async () => {
  const deleted = vi.fn();
  vi.mocked(fetch).mockResolvedValue(Response.json({ error: "This planter is used by Cafe." }, { status: 409 }));
  render(<PlanterActions asset={asset} onUpdated={vi.fn()} onDeleted={deleted} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete planter Garden pair" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete planter" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("used by Cafe");
  expect(screen.getByRole("dialog")).toBeVisible(); expect(deleted).not.toHaveBeenCalled();
});

it("disables repeated submissions and reports cleanup warnings to the library", async () => {
  let finish!: (response: Response) => void;
  vi.mocked(fetch).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const deleted = vi.fn();
  render(<PlanterActions asset={asset} onUpdated={vi.fn()} onDeleted={deleted} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete planter Garden pair" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete planter" }));
  expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  finish(Response.json({ deleted: true, warning: "Storage cleanup may be needed." }));
  await waitFor(() => expect(deleted).toHaveBeenCalledWith("Storage cleanup may be needed."));
  expect(fetch).toHaveBeenCalledOnce(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("edits planter name and notes without running extraction", async () => {
  const updated = vi.fn();
  vi.mocked(fetch).mockResolvedValue(Response.json({ ...asset, name: "Rust pair", notes: "Weathered steel" }));
  render(<PlanterActions asset={asset} onUpdated={updated} onDeleted={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit planter Garden pair" }));
  fireEvent.change(screen.getByLabelText("Planter name"), { target: { value: "Rust pair" } });
  fireEvent.change(screen.getByLabelText("Planter notes"), { target: { value: "Weathered steel" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(updated).toHaveBeenCalledWith(expect.objectContaining({ name: "Rust pair" })));
  expect(fetch).toHaveBeenCalledOnce();
  expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toEqual({ name: "Rust pair", notes: "Weathered steel" });
});

it("disables edit and delete for a processing planter", () => {
  render(<PlanterActions asset={{ ...asset, status: "processing" }} onUpdated={vi.fn()} onDeleted={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Edit planter Garden pair" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Delete planter Garden pair" })).toBeDisabled();
});
