import data from "@/data/snippets.json";

export type Snippet = (typeof data.snippets)[number];

export const snippets: Snippet[] = data.snippets;
export const sources = data.sources;

/** Tabs group the extracted categories; functions and other classes only show under "all". */
export const TABS: Record<string, string[]> = {
  routes: ["route"],
  models: ["pydantic-model", "db-model"],
  queries: ["db-query"],
};
