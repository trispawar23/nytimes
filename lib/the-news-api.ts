import { createHash } from "crypto";
import type { TnaSection } from "./tna-sections";
import type { Article } from "./types";

function stableId(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 20);
}

function safeIsoFromPublished(raw: string | undefined): string {
  if (!raw?.trim()) return new Date().toISOString();
  const d = new Date(raw);
  const t = d.getTime();
  return Number.isNaN(t) ? new Date().toISOString() : d.toISOString();
}

export type TnaHeadlineItem = {
  uuid?: string;
  title?: string;
  description?: string;
  snippet?: string;
  url?: string;
  image_url?: string | null;
  published_at?: string;
  source?: string;
  categories?: string[];
};

export function normalizeTnaArticle(
  raw: TnaHeadlineItem,
  bucket: string,
): Article | null {
  const title = (raw.title ?? "").trim();
  const url = (raw.url ?? "").trim();
  if (!title || !url) return null;

  const description = (raw.description ?? "").trim();
  const snippet = (raw.snippet ?? "").trim();
  const content =
    snippet.length > 120
      ? snippet
      : [description, snippet].filter(Boolean).join("\n\n").trim() ||
        description ||
        title;

  const id = (raw.uuid ?? "").trim() || stableId(url);
  const publishedAt = safeIsoFromPublished(raw.published_at);

  const cat =
    Array.isArray(raw.categories) && raw.categories.length > 0
      ? String(raw.categories[0])
      : bucket;

  return {
    id,
    title,
    description: description || content.slice(0, 220),
    content: content || title,
    source: (raw.source ?? "").trim() || "Unknown source",
    author: null,
    url,
    imageUrl: raw.image_url?.trim() ? raw.image_url.trim() : null,
    publishedAt,
    category: cat,
  };
}

/** `/v1/news/all` returns `data` as an array (not bucketed like headlines). */
export function articlesFromAllNewsArray(
  data: unknown,
  fallbackCategory: string,
): Article[] {
  if (!Array.isArray(data)) return [];
  const merged: Article[] = [];
  const seen = new Set<string>();
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const raw = item as TnaHeadlineItem;
    const bucket =
      Array.isArray(raw.categories) && raw.categories.length > 0
        ? String(raw.categories[0])
        : fallbackCategory;
    try {
      const a = normalizeTnaArticle(raw, bucket);
      if (!a) continue;
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      merged.push(a);
    } catch (e) {
      console.error("[the-news-api] skip malformed all-news item", {
        reason: e instanceof Error ? e.message : "unknown",
      });
    }
  }
  merged.sort(
    (x, y) =>
      new Date(y.publishedAt).getTime() - new Date(x.publishedAt).getTime(),
  );
  return merged.slice(0, 40);
}

export function mergeHeadlinesBuckets(
  data: Record<string, unknown>,
  sections: TnaSection[],
): Article[] {
  const merged: Article[] = [];
  const seen = new Set<string>();

  for (const sec of sections) {
    const arr = data[sec];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      try {
        const a = normalizeTnaArticle(item as TnaHeadlineItem, sec);
        if (!a) continue;
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        merged.push(a);
      } catch (e) {
        console.error("[the-news-api] skip malformed item", {
          section: sec,
          reason: e instanceof Error ? e.message : "unknown",
        });
      }
    }
  }

  merged.sort(
    (x, y) =>
      new Date(y.publishedAt).getTime() - new Date(x.publishedAt).getTime(),
  );
  return merged.slice(0, 40);
}
