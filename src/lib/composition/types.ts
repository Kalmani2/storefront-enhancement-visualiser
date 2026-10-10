export type Point = { x: number; y: number };
export type ScaleEstimate = {
  assetId: string; revisionId: string; method: "vision" | "heuristic";
  confidence: "low" | "medium"; reason: string;
  reference: { top: Point; bottom: Point; heightMetres: number };
  containerHeightMetres: number; containerFraction: number;
  height: number; ground: Point; horizon: number;
  usage?: unknown;
};
export type Placement = {
  id: string; assetId: string; revisionId: string;
  x: number; y: number; height: number; perspective: boolean; shadow: number;
};
export type CompositionVersion = {
  id: string; createdAt: string; placements: Placement[];
  basicFile: string; enhancedFile?: string; maskFile?: string; foregroundFile?: string;
  width: number; height: number; model?: string; quality?: "medium"; usage?: unknown;
};
export type CompositionState = {
  sourceKey: string; draft: Placement[]; calibrations: Record<string, ScaleEstimate>;
  versions: CompositionVersion[];
  job?: { id: string; versionId: string; startedAt: string };
  error?: string;
};
export const estimateKey = (assetId: string, revisionId: string) => `${assetId}:${revisionId}`;
export const compositionFileUrl = (projectId: string, file: string, download = false) => `/api/projects/${encodeURIComponent(projectId)}/composition/files/${encodeURIComponent(file)}${download ? "?download=1" : ""}`;
