import type { FeedMode } from "./types";

/** Default briefing: one cached result per article × mode × reading time. */
export function defaultBriefCacheKey(
  articleId: string,
  mode: FeedMode,
  readingTimeMinutes: number,
): string {
  return `${articleId}-${mode}-${readingTimeMinutes}`;
}

/**
 * Reader inline brief uses on-screen body (often full fetch), not feed excerpt — separate cache so
 * we don’t reuse an insufficient-source hit after longer text arrives.
 */
export function readerDisplayBriefCacheKey(
  articleId: string,
  mode: FeedMode,
  readingTimeMinutes: number,
  bodyForSummary: string,
): string {
  const t = bodyForSummary.trim();
  const len = t.length;
  let h = 0;
  const sample = t.slice(0, 96);
  for (let i = 0; i < sample.length; i++) {
    h = Math.imul(31, h) + sample.charCodeAt(i)! | 0;
  }
  return `${articleId}-${mode}-${readingTimeMinutes}__rb_${len}_${h}`;
}

/** “Ask / Update briefing” with a custom question — separate cache entry. */
export function askBriefCacheKey(
  articleId: string,
  mode: FeedMode,
  readingTimeMinutes: number,
  question: string,
): string {
  const q = question.trim();
  const tail = q.length > 160 ? `${q.slice(0, 160)}…` : q;
  return `${articleId}-${mode}-${readingTimeMinutes}__q__${tail}`;
}
