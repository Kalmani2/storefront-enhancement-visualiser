export const planterOptions = [
  { id: "classic", title: "Classic urn" },
  { id: "trough", title: "Low trough" },
  { id: "cylinder", title: "Tall cylinder" },
] as const;

export type PlanterId = (typeof planterOptions)[number]["id"];
