// Presentation order only: this does not feed or override discovery decisions.
// Thirst passed automatic assessment, but the owner subsequently chose another
// frame. That image must not inherit the earlier frame's automatic approval.
export const submissionExamples = [
  { projectId: "google-ChIJPcrSINMEdkgR4zCRoOaXzuA", selection: "Automatically discovered" },
  { projectId: "google-ChIJsVA9Dg0bdkgRUI0y1Fj9BNI", selection: "Automatically discovered" },
  { projectId: "google-ChIJwWd7z9IEdkgRvydq6aA4MOc", selection: "Named venue · Automatically assessed", manualFrontageReason: "Owner-selected cocktail bar with visible THIRST signage and bare pavement beneath the frontage window. The selected view leaves the entrances visible and provides room for the cream planter pair. This frame was chosen manually." },
] as const;
