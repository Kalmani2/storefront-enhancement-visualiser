export type ExtractionMode = "extract" | "reconstruct";
export type ExtractionQuality = "medium";
export type SelectionBox = { x: number; y: number; width: number; height: number };
export type ContactPoint = { x: number; y: number };

export type ExtractionSettings = {
  target: string;
  mode: ExtractionMode;
  quality: ExtractionQuality;
  selection?: SelectionBox;
};

export type PlanterRevision = {
  id: string;
  createdAt: string;
  kind: "ai" | "manual";
  parentId?: string;
  settings: ExtractionSettings;
  model: string;
  prompt: string;
  width: number;
  height: number;
  contactPoint: ContactPoint;
  transparency: number;
  warnings: string[];
  usage?: unknown;
};

export type PlanterAsset = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  originalFilename: string;
  originalFile: string;
  source: { width: number; height: number };
  status: "uploaded" | "processing" | "review" | "approved" | "error";
  error?: string;
  lastSettings?: ExtractionSettings;
  job?: { id: string; owner: string; processId?: number; startedAt: string; settings: ExtractionSettings };
  approvedRevisionId?: string;
  revisions: PlanterRevision[];
};

export type PlanterLibraryResult = {
  assets: PlanterAsset[];
  configured: boolean;
  uploadsAvailable?: boolean;
  message?: string;
  model: string;
  outputDirectory: string;
};

export function planterFileUrl(id: string, file: string, download = false) {
  return `/api/planters/${encodeURIComponent(id)}/files/${encodeURIComponent(file)}${download ? "?download=1" : ""}`;
}

export function revisionFile(id: string, kind: "asset" | "mask" | "raw" = "asset") {
  return `v-${id}${kind === "asset" ? "" : `-${kind}`}.png`;
}
