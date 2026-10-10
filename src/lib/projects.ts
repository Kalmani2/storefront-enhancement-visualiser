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

const key = "storefront-visualiser-projects-v1";

// Honest starter records: real OSM venues, but no entrance image has passed review.
export const starterProjects: Project[] = [
  {
    id: "starter-andrew-edmunds", title: "Andrew Edmunds", venueId: "way/273697611",
    source: "openstreetmap", address: "46 Lexington Street, W1F 0LP", category: "Restaurant",
    sourceUrl: "https://www.openstreetmap.org/way/273697611",
    createdAt: "2026-10-09",
  },
  {
    id: "starter-antidote", title: "Antidote", venueId: "node/14178744661",
    source: "openstreetmap", address: "12A Newburgh Street, W1F 7RR", category: "Bar",
    sourceUrl: "https://www.openstreetmap.org/node/14178744661",
    createdAt: "2026-10-09",
  },
  {
    id: "starter-flat-white", title: "Flat White", venueId: "node/14178877182",
    source: "openstreetmap", address: "17 Berwick Street, W1F 0PT", category: "Café",
    sourceUrl: "https://www.openstreetmap.org/node/14178877182",
    createdAt: "2026-10-09",
  },
];

export function readProjects(): Project[] {
  if (typeof window === "undefined") return starterProjects;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "[]") as unknown;
    if (!Array.isArray(saved)) return starterProjects;
    const projects = saved.filter((item): item is Project => Boolean(item && typeof item === "object" && "id" in item && "title" in item && "venueId" in item && "source" in item));
    return [...projects, ...starterProjects.filter((starter) => !projects.some((project) => project.id === starter.id))];
  } catch {
    return starterProjects;
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
