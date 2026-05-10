/** Buckets returned by `GET /v1/news/headlines` (TheNewsAPI). No Node-only imports — safe for client bundles. */
export const TNA_SECTIONS = [
  "general",
  "business",
  "sports",
  "tech",
  "science",
  "health",
] as const;

export type TnaSection = (typeof TNA_SECTIONS)[number];

function isTnaSection(value: string): value is TnaSection {
  return (TNA_SECTIONS as readonly string[]).includes(value);
}

/** Map client `tags` tokens (from modes or manual query) to TheNewsAPI `data.*` keys. */
export function tagsToTnaSections(tagsRaw: string | null): TnaSection[] {
  const out = new Set<TnaSection>();
  const parts =
    tagsRaw
      ?.split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean) ?? [];

  const alias = (token: string): TnaSection | null => {
    if (token === "technology" || token === "technologies") return "tech";
    if (token === "entertainment") return "general";
    if (isTnaSection(token)) return token;
    return null;
  };

  for (const p of parts) {
    const sec = alias(p);
    if (sec) out.add(sec);
  }

  if (out.size === 0) return ["general", "tech"];
  return [...out];
}
