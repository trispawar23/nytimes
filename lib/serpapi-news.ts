import { createHash } from "crypto";
import type { Article } from "./types";
import { dedupeArticlesByUrlAndTitle } from "./newsapi-org";

/** Default Google News searches to blend into one feed (US-focused). */
export const SERPAPI_DEFAULT_NEWS_QUERIES = [
  "United States top stories",
  "technology news",
  "business news",
  "science news",
  "health news",
  "entertainment news",
] as const;

function stableIdFromUrl(url: string): string {
  const u = url.trim().toLowerCase();
  return createHash("sha256").update(u).digest("hex").slice(0, 20);
}

function safeIso(iso: string | undefined, fallbackDate?: string): string {
  if (iso?.trim()) {
    const t = new Date(iso).getTime();
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  if (fallbackDate?.trim()) {
    const t = new Date(fallbackDate).getTime();
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return new Date().toISOString();
}

function sourceName(obj: unknown): string {
  if (!obj || typeof obj !== "object") return "Unknown source";
  const name = (obj as { name?: string }).name;
  return typeof name === "string" && name.trim() ? name.trim() : "Unknown source";
}

/** Map one Google News result row (or nested highlight/story) to `Article`. */
export function articleFromSerpGoogleNewsRow(
  row: Record<string, unknown>,
  categoryLabel: string,
): Article | null {
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const link = typeof row.link === "string" ? row.link.trim() : "";
  if (!title || !link) return null;

  const src = sourceName(row.source);
  const snippet =
    typeof row.snippet === "string"
      ? row.snippet.trim()
      : typeof row.summary === "string"
        ? row.summary.trim()
        : "";
  const thumb =
    typeof row.thumbnail === "string"
      ? row.thumbnail.trim()
      : typeof row.thumbnail_small === "string"
        ? row.thumbnail_small.trim()
        : "";
  const iso =
    typeof row.iso_date === "string"
      ? row.iso_date
      : typeof row.isoDate === "string"
        ? row.isoDate
        : undefined;
  const dateStr = typeof row.date === "string" ? row.date : undefined;

  const authors = row.source;
  let author: string | null = null;
  if (authors && typeof authors === "object") {
    const a = (authors as { authors?: string[] }).authors;
    if (Array.isArray(a) && a.length > 0 && typeof a[0] === "string") {
      author = a[0].trim() || null;
    }
  }

  const fallbackBlurb = `${title} — ${src}.`;
  const description = snippet || fallbackBlurb.slice(0, 280);
  const content = snippet.length >= 40 ? snippet : fallbackBlurb;

  return {
    id: stableIdFromUrl(link),
    title,
    description,
    content,
    source: src,
    author,
    url: link,
    imageUrl: thumb.length > 0 ? thumb : null,
    publishedAt: safeIso(iso, dateStr),
    category: categoryLabel,
  };
}

/** Flatten Google News `news_results` (handles highlight + stories clusters). */
export function articlesFromSerpNewsResults(
  newsResults: unknown[],
  categoryLabel: string,
): Article[] {
  const out: Article[] = [];

  for (const raw of newsResults) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;

    if (typeof item.link === "string" && typeof item.title === "string") {
      const a = articleFromSerpGoogleNewsRow(item, categoryLabel);
      if (a) out.push(a);
    }

    const highlight = item.highlight;
    if (highlight && typeof highlight === "object") {
      const a = articleFromSerpGoogleNewsRow(
        highlight as Record<string, unknown>,
        categoryLabel,
      );
      if (a) out.push(a);
    }

    const stories = item.stories;
    if (Array.isArray(stories)) {
      for (const s of stories) {
        if (s && typeof s === "object") {
          const a = articleFromSerpGoogleNewsRow(
            s as Record<string, unknown>,
            categoryLabel,
          );
          if (a) out.push(a);
        }
      }
    }
  }

  return out;
}

/** Google organic result → Article (engine `google`). */
export function articleFromSerpOrganic(
  row: Record<string, unknown>,
  categoryLabel: string,
): Article | null {
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const link = typeof row.link === "string" ? row.link.trim() : "";
  if (!title || !link) return null;

  const snippet = typeof row.snippet === "string" ? row.snippet.trim() : "";
  const displayed =
    typeof row.displayed_link === "string"
      ? row.displayed_link.trim()
      : typeof row.source === "string"
        ? row.source.trim()
        : "Web";
  const fallbackBlurb = `${title} — ${displayed}.`;
  const description = snippet || fallbackBlurb.slice(0, 280);
  const content = snippet.length >= 40 ? snippet : fallbackBlurb;

  return {
    id: stableIdFromUrl(link),
    title,
    description,
    content,
    source: displayed,
    author: null,
    url: link,
    imageUrl: null,
    publishedAt: new Date().toISOString(),
    category: categoryLabel,
  };
}

export function articlesFromSerpOrganicResults(
  organic: unknown[],
  categoryLabel: string,
): Article[] {
  const out: Article[] = [];
  for (const raw of organic) {
    if (!raw || typeof raw !== "object") continue;
    const a = articleFromSerpOrganic(raw as Record<string, unknown>, categoryLabel);
    if (a) out.push(a);
  }
  return out;
}

export type SerpApiSearchJson = {
  error?: string;
  search_metadata?: { status?: string };
  news_results?: unknown[];
  organic_results?: unknown[];
};

export function mergeDedupeSortSerpArticles(
  buckets: Article[][],
  cap: number,
): Article[] {
  const merged = buckets.flat();
  const deduped = dedupeArticlesByUrlAndTitle(merged);
  deduped.sort(
    (x, y) =>
      new Date(y.publishedAt).getTime() - new Date(x.publishedAt).getTime(),
  );
  return deduped.slice(0, cap);
}
