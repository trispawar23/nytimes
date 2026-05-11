/** Editorial reading speed for rail, listen label, and summarize targets (words per minute). */
export const EDITORIAL_WPM = 200;

const DEFAULT_WPM = EDITORIAL_WPM;

export function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

/** At least 1 minute for any non-empty text; empty → 0. */
export function readingMinutesFromWordCount(
  wordCount: number,
  wpm: number = DEFAULT_WPM,
): number {
  if (wordCount <= 0) return 0;
  return Math.max(1, Math.ceil(wordCount / wpm));
}

/** Matches `/api/summarize` clamp (max 12 min briefing targets). */
export const READ_RAIL_MAX_MINUTES = 12;

/** Default rail when the caller doesn't know the article's true length. */
export const ARTICLE_READ_RAIL_MINUTES = [1, 3, 8] as const;

/**
 * Three stops for the read-time rail.
 *
 * Short (1 min) and Medium (3 min) are anchored because the reader uses
 * those exact values as layout switches for the one-minute / half-length
 * summary modes. The Full stop adapts to the open article's actual reading
 * time, clamped to [4, READ_RAIL_MAX_MINUTES] so the three stops stay
 * strictly increasing.
 */
export function articleReadRailStops(
  fullMinutes?: number,
): readonly [number, number, number] {
  if (
    typeof fullMinutes !== "number" ||
    !Number.isFinite(fullMinutes) ||
    fullMinutes <= 0
  ) {
    return ARTICLE_READ_RAIL_MINUTES;
  }
  const full = Math.min(
    READ_RAIL_MAX_MINUTES,
    Math.max(4, Math.round(fullMinutes)),
  );
  return [1, 3, full];
}

export function nearestArticleReadRailStop(
  minutes: number,
  stops: readonly number[],
): number {
  if (stops.length === 0) return minutes;
  let best = stops[0]!;
  let bestD = Math.abs(minutes - best);
  for (const s of stops) {
    const d = Math.abs(minutes - s);
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

function normKey(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Merge description + content without repeating the headline-only lines
 * feeds often send twice (e.g. SerpAPI snippet == title).
 */
export function articleDisplayBody(article: {
  title: string;
  description: string;
  content: string;
}): string {
  const t = (article.title ?? "").trim();
  let d = (article.description ?? "").trim();
  let c = (article.content ?? "").trim();
  const nt = normKey(t);
  const nd = normKey(d);
  const nc = normKey(c);

  if (c && d && c === d) return c;
  if (nt && nc === nt) c = "";
  if (nt && nd === nt) d = "";
  if (c && d) {
    if (d.length >= 24 && c.startsWith(d)) return c;
    if (c.length >= 24 && d.startsWith(c)) return d;
    return `${d}\n\n${c}`.trim();
  }
  const merged = (c || d).trim();
  if (merged) return merged;
  const descFallback = (article.description ?? "").trim();
  if (descFallback) return descFallback;
  const contentFallback = (article.content ?? "").trim();
  if (contentFallback) return contentFallback;
  return t;
}

/** @deprecated Prefer `articleDisplayBody`; kept for imports. */
export const articleFullBody = articleDisplayBody;

export function articleWordCount(article: {
  title: string;
  content: string;
  description: string;
}): number {
  const body = articleDisplayBody(article);
  const headline = article.title?.trim() ?? "";
  return countWords(`${headline}\n${body}`);
}

/** Word count for reader prose only (headline is shown separately in the UI). */
export function readerBodyWordCount(proseBody: string): number {
  return countWords(proseBody.trim());
}

export function articleReadingMinutes(article: {
  title: string;
  content: string;
  description: string;
}): number {
  return readingMinutesFromWordCount(articleWordCount(article));
}

/**
 * Estimate from merged description/content only (headline excluded). Use this
 * when ranking “long reads” from wire items where the headline is shown elsewhere.
 */
export function articleBodyReadingMinutes(article: {
  title: string;
  content: string;
  description: string;
}): number {
  const body = articleDisplayBody(article);
  return readingMinutesFromWordCount(readerBodyWordCount(body));
}

/** Editorial target for Great Read + The Daily (~7 min body at DEFAULT_WPM). */
export const LONG_READ_TARGET_MINUTES = 7;

type ArticleLike = {
  title: string;
  content: string;
  description: string;
  readMinutesFromFetch?: number | null;
};

/** Prefer server-measured full-page minutes when present (Great Read / Daily ordering + labels). */
export function articleBodyReadingMinutesForLayout(article: ArticleLike): number {
  const f = article.readMinutesFromFetch;
  if (typeof f === "number" && f > 0) return f;
  return articleBodyReadingMinutes(article);
}

function longReadSortTier(bodyMinutes: number): number {
  if (bodyMinutes <= 0) return 4;
  if (bodyMinutes >= 6 && bodyMinutes <= 8) return 0;
  if (bodyMinutes >= 5 && bodyMinutes <= 9) return 1;
  if (bodyMinutes >= 4 && bodyMinutes <= 10) return 2;
  return 3;
}

/**
 * Reorders the feed so Great Read and The Daily can draw ~7 minute reads first:
 * prefers body estimates in 6–8 min, then 5–9, then 4–10, then everything else
 * (closest to target first within each tier).
 */
export function orderArticlesForLongReadSections<T extends ArticleLike>(
  articles: T[],
): T[] {
  return [...articles]
    .map((a, index) => {
      const m = articleBodyReadingMinutesForLayout(a);
      return {
        a,
        index,
        tier: longReadSortTier(m),
        dist: Math.abs(m - LONG_READ_TARGET_MINUTES),
      };
    })
    .sort((x, y) => {
      if (x.tier !== y.tier) return x.tier - y.tier;
      if (x.dist !== y.dist) return x.dist - y.dist;
      return x.index - y.index;
    })
    .map(({ a }) => a);
}

/** Preserve author paragraph breaks; no sentence-level merging. */
export function bodyParagraphs(fullBody: string): string[] {
  const t = fullBody.trim();
  if (!t) return [];
  const parts = t.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 1) {
    const one = parts[0]!;
    const bySingleNl = one
      .split(/\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (bySingleNl.length >= 2) return bySingleNl;
  }
  return parts;
}

/** When local merged text is short, try `/api/article-read` for full page text. */
export function shouldTryFetchFullArticleText(
  articleUrl: string,
  localMergedBody: string,
): boolean {
  const u = articleUrl.trim();
  if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
  return countWords(localMergedBody) < 160;
}

/** Drop a leading line that only repeats the headline (common in reader extractions). */
export function trimRedundantOpenTitle(body: string, title: string): string {
  const lines = body.trim().split("\n");
  if (lines.length === 0) return body.trim();
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const head = (lines[i] ?? "").trim().replace(/^#{1,6}\s*/, "");
  if (head && normKey(head) === normKey(title)) {
    return lines.slice(i + 1).join("\n").trim();
  }
  return body.trim();
}
