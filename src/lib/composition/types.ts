export type Point = { x: number; y: number };
export type GroundContact = Point & { width: number };
export type ProductProfile = {
  description: string; containerCount: number; shape: "round" | "rectangular" | "mixed";
  baseSlope: number; contacts: GroundContact[];
};
export type SceneProfile = {
  referenceName: string; groundSlope: number; light: string; perspective: string;
  entrance: { x: number; y: number; width: number; height: number };
};
export type ScaleEstimate = {
  assetId: string; revisionId: string; method: "vision" | "heuristic";
  confidence: "low" | "medium"; reason: string;
  reference: { top: Point; bottom: Point; heightMetres: number };
  containerHeightMetres: number; containerFraction: number;
  height: number; ground: Point; horizon: number;
  usage?: unknown;
  analysisVersion?: number; product?: ProductProfile; scene?: SceneProfile;
};
export type Placement = {
  id: string; assetId: string; revisionId: string;
  x: number; y: number; height: number; perspective: boolean; shadow: number;
  yaw?: number; flip?: boolean;
};
export type RenderReview = {
  status: "passed" | "review" | "rejected";
  product: number; grounding: number; scene: number;
  summary: string; issues: string[]; usage?: unknown; manual?: boolean;
};
export type CompositionVersion = {
  id: string; createdAt: string; placements: Placement[];
  basicFile: string; enhancedFile?: string; maskFile?: string; foregroundFile?: string;
  width: number; height: number; model?: string; quality?: "medium"; usage?: unknown;
  engine?: number; fingerprint?: string; sourceFile?: string; review?: RenderReview;
  estimatedCostUsd?: number; alignment?: { dx: number; dy: number; error: number };
  installationFile?: string; rawFile?: string;
};
export type CompositionState = {
  sourceKey: string; draft: Placement[]; calibrations: Record<string, ScaleEstimate>;
  versions: CompositionVersion[];
  job?: { id: string; versionId: string; startedAt: string; stage?: "rendering" | "checking"; claimedAt?: string };
  error?: string;
  resultVersionId?: string;
};
export const estimateKey = (assetId: string, revisionId: string) => `${assetId}:${revisionId}`;
export const compositionFileUrl = (projectId: string, file: string, download = false) => `/api/projects/${encodeURIComponent(projectId)}/composition/files/${encodeURIComponent(file)}${download ? "?download=1" : ""}`;
