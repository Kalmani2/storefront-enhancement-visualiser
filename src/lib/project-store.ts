import { randomUUID } from "node:crypto";
import type { Project } from "./projects";
import { storageClient, putFile } from "./storage";
import { PlanterError } from "./planters/validation";
import { normaliseSource } from "./planters/images";

export function projectId(value: string) {
  if (!/^[a-zA-Z0-9_-]{1,220}$/.test(value)) throw new PlanterError("Invalid project ID.");
  return value;
}

export function parseProject(value: unknown): Project {
  if (!value || typeof value !== "object") throw new PlanterError("Project details are required.");
  const p = value as Project;
  if (typeof p.id !== "string" || typeof p.title !== "string" || !p.title.trim() || p.title.length > 160 || typeof p.venueId !== "string" || p.venueId.length > 220 || !["google", "openstreetmap"].includes(p.source) || !Number.isFinite(Date.parse(p.createdAt))) throw new PlanterError("Invalid project details.");
  projectId(p.id);
  if (typeof p.sourceUrl !== "string" || !/^https:\/\//.test(p.sourceUrl) || p.sourceUrl.length > 2000) throw new PlanterError("Invalid venue source link.");
  for (const field of [p.address, p.category]) if (field !== undefined && (typeof field !== "string" || field.length > 1000)) throw new PlanterError("Invalid venue information.");
  if (p.notes !== undefined && (typeof p.notes !== "string" || p.notes.length > 2000)) throw new PlanterError("Use notes of 2,000 characters or fewer.");
  if (p.frontageReview && (typeof p.frontageReview.assessmentId !== "string" || !/^[a-f0-9]{64}$/.test(p.frontageReview.assessmentId) || !Number.isFinite(Date.parse(p.frontageReview.checkedAt)) || typeof p.frontageReview.reason !== "string" || p.frontageReview.reason.length > 1500 || !["streetview", "places-photo"].includes(p.frontageReview.source) || typeof p.frontageReview.attribution !== "string" || p.frontageReview.attribution.length > 2000)) throw new PlanterError("Invalid frontage assessment reference.");
  if (p.configuration && (!["classic", "trough", "cylinder"].includes(p.configuration.planter) || !Number.isInteger(p.configuration.quantity) || p.configuration.quantity < 1 || p.configuration.quantity > 4 || !["left", "right", "both"].includes(p.configuration.placement))) throw new PlanterError("Invalid planter configuration.");
  if (p.image) {
    const image = p.image;
    if (image.provider === "google-street-view") {
      if ((image.heading !== undefined && (!Number.isFinite(image.heading) || image.heading < 0 || image.heading >= 360)) || (image.pitch !== undefined && (!Number.isFinite(image.pitch) || image.pitch < -90 || image.pitch > 90))) throw new PlanterError("Invalid absolute camera framing.");
      if (typeof image.panoId !== "string" || image.panoId.length > 300 || !Number.isFinite(image.headingOffset) || (image.fov !== undefined && (!Number.isFinite(image.fov) || image.fov < 10 || image.fov > 120))) throw new PlanterError("Invalid Street View framing.");
      if (image.storagePath !== undefined && (typeof image.storagePath !== "string" || !image.storagePath.startsWith(`storefronts/${p.id}/`) || image.storagePath.includes(".."))) throw new PlanterError("Invalid saved Street View image.");
    } else if (image.provider === "mapillary") {
      if (![image.imageId, image.url, image.sourceUrl, image.creator].every(v => typeof v === "string" && v.length <= 4000) || !image.url.startsWith("https://") || !image.sourceUrl.startsWith("https://")) throw new PlanterError("Invalid image reference.");
    } else if (image.provider === "uploaded") {
      if (typeof image.storagePath !== "string" || !image.storagePath.startsWith(`storefronts/${p.id}/`) || image.storagePath.includes("..") || typeof image.originalFilename !== "string" || !Number.isFinite(image.width) || !Number.isFinite(image.height)) throw new PlanterError("Invalid saved image.");
    } else throw new PlanterError("Unknown image provider.");
  }
  // Explicit fields prevent untrusted request data being persisted accidentally.
  return { id: p.id, title: p.title.trim(), venueId: p.venueId, source: p.source, sourceUrl: p.sourceUrl, createdAt: p.createdAt, address: p.address, category: p.category, notes: p.notes, image: p.image, configuration: p.configuration, frontageReview: p.frontageReview };
}

export async function updateProjectDetails(id: string, value: unknown): Promise<Project> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PlanterError("Project details are required.");
  const body = value as Record<string, unknown>;
  const fields = ["title", "address", "category", "notes"] as const;
  if (!Object.keys(body).length || Object.keys(body).some(key => !fields.includes(key as typeof fields[number]))) throw new PlanterError("Only the project name, address, category and notes can be edited here.");
  const client = storageClient();
  const { data: row, error } = await client.from("projects").select("data,updated_at").eq("id", projectId(id)).maybeSingle();
  if (error) throw new PlanterError("The project could not be loaded.", 502);
  if (!row) throw new PlanterError("Project not found.", 404);
  const updated = parseProject({ ...row.data, ...body });
  const result = await client.from("projects").update({ title: updated.title, data: updated, updated_at: new Date().toISOString() }).eq("id", id).eq("updated_at", row.updated_at).select("data").maybeSingle();
  if (result.error) throw new PlanterError("The project could not be updated.", 502);
  if (!result.data) throw new PlanterError("This project changed in another session. Reload before trying again.", 409);
  return result.data.data as Project;
}

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await storageClient().from("projects").select("data").order("created_at", { ascending: false });
  if (error) throw new PlanterError("The saved project library could not be loaded.", 502);
  return data.map(row => row.data as Project);
}

export async function getProject(id: string): Promise<Project> {
  const { data, error } = await storageClient().from("projects").select("data").eq("id", projectId(id)).maybeSingle();
  if (error) throw new PlanterError("The project could not be loaded.", 502);
  if (!data) throw new PlanterError("Project not found.", 404);
  return data.data as Project;
}

export async function storeProject(project: Project, migration = false) {
  project = parseProject(project);
  if (project.image?.provider === "uploaded") {
    const existing = await getProject(project.id);
    if (existing.image?.provider !== "uploaded" || existing.image.storagePath !== project.image.storagePath) throw new PlanterError("Upload frontage images through the project's image endpoint.");
  }
  if (project.image?.provider === "google-street-view" && project.image.storagePath) {
    const existing = await getProject(project.id);
    if (existing.image?.provider !== "google-street-view" || existing.image.storagePath !== project.image.storagePath || existing.image.panoId !== project.image.panoId || existing.image.headingOffset !== project.image.headingOffset || existing.image.fov !== project.image.fov || existing.image.heading !== project.image.heading || existing.image.pitch !== project.image.pitch) throw new PlanterError("Save Street View images through the project's source endpoint.");
  }
  const { data, error } = await storageClient().from("projects").upsert({ id: project.id, title: project.title, data: project, created_at: project.createdAt, updated_at: new Date().toISOString() }, { onConflict: "id", ignoreDuplicates: migration }).select("data").maybeSingle();
  if (error) throw new PlanterError("The project could not be saved.", 502);
  return data ? data.data as Project : getProject(project.id);
}

export async function storeGoogleFrontage(project: Project, bytes: Buffer, copyright: string) {
  if (project.image?.provider !== "google-street-view") throw new PlanterError("Choose a Street View image first.");
  const source = await normaliseSource(bytes);
  const key = `storefronts/${project.id}/${randomUUID()}.png`;
  await putFile(key, source.data);
  const updated: Project = { ...project, image: { ...project.image, storagePath: key, width: source.width, height: source.height, copyright } };
  const { error } = await storageClient().from("projects").update({ data: updated, updated_at: new Date().toISOString() }).eq("id", project.id);
  if (error) throw new PlanterError("The selected Street View image could not be saved.", 502);
  return updated;
}

export async function storeFrontage(id: string, bytes: Buffer, originalFilename: string, frontageReview?: Project["frontageReview"]) {
  const project = await getProject(id);
  const source = await normaliseSource(bytes);
  const key = `storefronts/${project.id}/${randomUUID()}.${source.extension}`;
  // Keep uploaded originals byte-for-byte; do not silently resize the saved source.
  await putFile(key, bytes);
  const updated: Project = { ...project, frontageReview, image: { provider: "uploaded", storagePath: key, originalFilename: originalFilename.slice(0, 200), width: source.originalWidth, height: source.originalHeight } };
  const { error } = await storageClient().from("projects").update({ data: updated, updated_at: new Date().toISOString() }).eq("id", project.id);
  if (error) throw new PlanterError("Image uploaded, but the project could not be updated. Try again.", 502);
  return updated;
}
