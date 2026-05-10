import { createHash } from "crypto";
import type { Article } from "./types";

/** NewsAPI.org `v2/top-headlines` categories used for the blended feed. */
export const NEWSAPI_ORG_TOP_HEADLINE_CATEGORIES = [
  "general",
  "technology",
  "business",
  "science",
  "health",
  "entertainment",
] as const;

export type NewsApiOrgCategory =
  (typeof NEWSAPI_ORG_TOP_HEADLINE_CATEGORIES)[number];

export type NewsApiOrgRawArticle = {
  source?: { id?: string | null; name?: string | null };
  author?: string | null;
  title?: string | null;
  description?: string | null;
  url?: string | null;
  urlToImage?: string | null;
  publishedAt?: string | null;
  content?: string | null;
};

function normalizeUrlKey(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.href.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/** Normalize for dedupe and title-based filtering. */
export function normalizeTitleKey(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function stableIdFromUrl(url: string): string {
  const key = normalizeUrlKey(url);
  return createHash("sha256").update(key).digest("hex").slice(0, 20);
}

/** NewsAPI.org often appends `... [+593 chars]` when content is truncated. */
function stripNewsApiTruncation(raw: string): string {
  return raw
    .replace(/\s*\[\+\s*\d+\s*chars?\]\s*$/i, "")
    .replace(/\s*\[\+\d+\s*chars?\]\s*$/i, "")
    .trim();
}

function safeIso(publishedAt: string | undefined): string {
  if (!publishedAt?.trim()) return new Date().toISOString();
  const t = new Date(publishedAt).getTime();
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
}

/**
 * Maps a NewsAPI.org article to `Article`. Only requires `title` + `url`.
 * Missing description/content → fallback from title + source name.
 */
export function articleFromNewsApiOrg(
  raw: NewsApiOrgRawArticle,
  category: string,
): Article | null {
  const title = (raw.title ?? "").trim();
  const url = (raw.url ?? "").trim();
  if (!title || !url) return null;

  const sourceName = (raw.source?.name ?? "").trim() || "Unknown source";
  const description = (raw.description ?? "").trim();
  const contentBody = (raw.content ?? "").trim();
  const imageRaw = (raw.urlToImage ?? "").trim();
  const imageUrl = imageRaw.length > 0 ? imageRaw : null;

  const fallbackBlurb = `${title} — reported by ${sourceName}.`;
  const descriptionOut =
    description ||
    (fallbackBlurb.length > 280 ? `${fallbackBlurb.slice(0, 277)}…` : fallbackBlurb);
  const contentStripped = stripNewsApiTruncation(contentBody);
  const contentOut =
    contentStripped.length > 0
      ? contentStripped
      : description.trim().length > 0
        ? description
        : fallbackBlurb;

  const authorRaw = raw.author?.trim();
  const author =
    authorRaw && authorRaw.length > 0 && authorRaw !== "null"
      ? authorRaw
      : null;

  return {
    id: stableIdFromUrl(url),
    title,
    description: descriptionOut,
    content: contentOut,
    source: sourceName,
    author,
    url,
    imageUrl,
    publishedAt: safeIso(raw.publishedAt ?? undefined),
    category,
  };
}

export function dedupeArticlesByUrlAndTitle(articles: Article[]): Article[] {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const out: Article[] = [];
  for (const a of articles) {
    const uk = normalizeUrlKey(a.url);
    const tk = normalizeTitleKey(a.title);
    if (seenUrl.has(uk) || seenTitle.has(tk)) continue;
    seenUrl.add(uk);
    seenTitle.add(tk);
    out.push(a);
  }
  return out;
}
