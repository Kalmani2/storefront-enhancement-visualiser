export type ProjectSource = "openstreetmap" | "google";

export type Project = {
  id: string;
  title: string;
  venueId: string;
  source: ProjectSource;
  address?: string;
  category?: string;
  sourceUrl: string;
  createdAt: string;
  image?: {
    provider: "google-street-view";
    panoId: string;
    headingOffset: number;
    fov?: number;
    captureDate?: string;
    storagePath?: string;
    width?: number;
    height?: number;
    copyright?: string;
  } | {
    provider: "mapillary";
    imageId: string;
    url: string;
    sourceUrl: string;
    creator: string;
  } | {
    provider: "uploaded";
    storagePath: string;
    originalFilename: string;
    width: number;
    height: number;
  };
  configuration?: {
    planter: "classic" | "trough" | "cylinder";
    quantity: number;
    placement: "left" | "right" | "both";
  };
};

// Import only the current browser library; never resurrect the discarded v1 demo.
const key = "storefront-visualiser-projects-v2";
const legacyKey = "storefront-visualiser-projects-v1";

async function projectRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The project library could not be loaded.");
  return result;
}

let importing: Promise<void> | undefined;
async function importBrowserProjects() {
  if (typeof window === "undefined") return;
  if (importing) return importing;
  importing = (async () => {
    let saved: unknown;
    try { saved = JSON.parse(localStorage.getItem(key) || "[]"); } catch { return; }
    if (!Array.isArray(saved) || saved.length === 0) return;
    for (const project of saved) {
      if (!project || typeof project !== "object" || !project.id || !project.venueId) continue;
      await projectRequest("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project, migration: true }) });
    }
    // Keep a local backup; mark this exact snapshot migrated only after all writes succeed.
    localStorage.setItem(`${key}-migrated`, JSON.stringify(saved));
    localStorage.removeItem(legacyKey);
  })().finally(() => { importing = undefined; });
  return importing;
}

export async function readProjects(): Promise<Project[]> {
  let needsImport = false;
  try { needsImport = typeof window !== "undefined" && localStorage.getItem(`${key}-migrated`) !== localStorage.getItem(key); } catch { /* Shared storage does not depend on browser storage being enabled. */ }
  if (needsImport) await importBrowserProjects();
  return projectRequest<Project[]>("/api/projects");
}

export async function saveProject(project: Project): Promise<Project> {
  return projectRequest<Project>("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project }) });
}

export async function findProject(id: string): Promise<Project | undefined> {
  return (await readProjects()).find(project => project.id === id);
}

export function projectImageUrl(project: Project) {
  if (project.image?.provider === "uploaded" || (project.image?.provider === "google-street-view" && project.image.storagePath)) return `/api/projects/${encodeURIComponent(project.id)}/image`;
  if (project.image?.provider === "mapillary") return project.image.url;
  return undefined;
}
