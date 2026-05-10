import type { Article } from "./types";
import { normalizeTitleKey } from "./newsapi-org";

function readIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw?.trim()) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Junk / non-headline titles often returned by aggregators. */
const TITLE_BLOCKLIST = new Set([
  "untitled",
  "no title",
  "home",
  "news",
  "latest news",
  "top stories",
  "sign in",
  "subscribe",
  "cookie policy",
  "privacy policy",
  "page not found",
  "404",
  "access denied",
  "forbidden",
]);

function isAcceptableHeadlineTitle(raw: string): boolean {
  const t = raw.trim();
  const minL = readIntEnv("NEWS_TITLE_MIN_LENGTH", 12, 4, 200);
  const maxL = readIntEnv("NEWS_TITLE_MAX_LENGTH", 280, 80, 500);
  if (t.length < minL || t.length > maxL) return false;
  if (!/[a-zA-Z\u00C0-\u024F]/.test(t)) return false;
  const collapsed = normalizeTitleKey(t);
  if (TITLE_BLOCKLIST.has(collapsed)) return false;
  if (/^[\d\s\-–—:|.,/]+$/.test(t)) return false;
  return true;
}

/**
 * Drops low-quality headlines and collapses duplicates that share the same
 * normalized title (first occurrence wins; URLs may still differ).
 */
export function filterArticlesByTitlePolicy(articles: Article[]): Article[] {
  const seenTitles = new Set<string>();
  const out: Article[] = [];
  for (const a of articles) {
    const title = (a.title ?? "").trim();
    if (!isAcceptableHeadlineTitle(title)) continue;
    const key = normalizeTitleKey(title);
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    if (title !== a.title) {
      out.push({ ...a, title });
    } else {
      out.push(a);
    }
  }
  return out;
}
