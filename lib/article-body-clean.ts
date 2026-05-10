/**
 * Reader-facing article body: applies headline-aware filtering on top of
 * {@link cleanArticleContent}.
 */

import {
  cleanArticleContent,
  cleanArticleContentLenient,
  decodeHtmlEntities,
} from "./clean-article-content";

export { decodeHtmlEntities };

function normalizeCompare(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[''`´]/g, "'")
    .replace(/[^\w\s']/g, "");
}

function isBoilerplateParagraph(para: string, title: string): boolean {
  const p = para.trim();
  if (!p) return true;
  const nt = normalizeCompare(title);
  const np = normalizeCompare(p);
  if (nt.length > 15 && (np === nt || np.startsWith(`${nt} `))) return true;
  if (nt.length > 15 && p.length <= nt.length + 8 && np.includes(nt)) return true;

  if (
    /logo\.?\s*\w+/i.test(p) &&
    /nonprofit|newsroom covering|photo courtesy/i.test(p) &&
    p.length < 420
  ) {
    return true;
  }
  if (/nonprofit newsroom covering/i.test(p) && p.length < 360) return true;

  if (/via bay city news/i.test(p) && p.length < 200) return true;

  const standalonePub = /^(san jose spotlight|sfgate|bay city news)(\.com)?$/i;
  if (standalonePub.test(p)) return true;

  return false;
}

function filterTitleDupes(text: string, title: string): string {
  return text
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter((b) => b && !isBoilerplateParagraph(b, title))
    .join("\n\n")
    .trim();
}

/**
 * Removes extraction noise so the reader shows narrative paragraphs only.
 */
export function cleanArticleBodyForReader(raw: string, title: string): string {
  const rawTrim = raw.trim();
  if (!rawTrim) return "";

  let joined = filterTitleDupes(cleanArticleContent(rawTrim), title);

  if (joined.length < 80 && rawTrim.length > 240) {
    joined = filterTitleDupes(cleanArticleContentLenient(rawTrim), title);
  }

  return joined;
}
