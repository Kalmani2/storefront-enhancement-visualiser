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
  } | {
    provider: "mapillary";
    imageId: string;
    url: string;
    sourceUrl: string;
    creator: string;
  };
  configuration?: {
    planter: "classic" | "trough" | "cylinder";
    quantity: number;
    placement: "left" | "right" | "both";
  };
};

// Requested library reset: discard the old demo records, then retain new projects normally.
const key = "storefront-visualiser-projects-v2";
const legacyKey = "storefront-visualiser-projects-v1";

export function readProjects(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    localStorage.removeItem(legacyKey);
    const saved = JSON.parse(localStorage.getItem(key) || "[]") as unknown;
    if (!Array.isArray(saved)) return [];
    const projects = saved.filter((item): item is Project => Boolean(item && typeof item === "object" && "id" in item && "title" in item && "venueId" in item && "source" in item));
    return projects;
  } catch {
    return [];
  }
}

export function saveProject(project: Project) {
  const projects = readProjects();
  const index = projects.findIndex((item) => item.id === project.id);
  if (index >= 0) projects[index] = project;
  else projects.unshift(project);
  localStorage.setItem(key, JSON.stringify(projects));
}

export function findProject(id: string) {
  return readProjects().find((project) => project.id === id);
}
