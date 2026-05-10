import type { Article } from "./types";

/** Hostnames treated as Fox News article origins for this demo app. */
export function isFoxNewsArticleHostname(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h === "foxnews.com" || h.endsWith(".foxnews.com");
}

export function isFoxNewsArticleUrl(urlStr: string): boolean {
  try {
    return isFoxNewsArticleHostname(new URL(urlStr).hostname);
  } catch {
    return false;
  }
}

export function filterArticlesFoxNewsOnly(articles: Article[]): Article[] {
  return articles.filter((a) => isFoxNewsArticleUrl(a.url));
}

/** Default SerpAPI Google News blends when `SERPAPI_Q` / `SERPAPI_NEWS_QUERIES` are unset. */
export const FOX_NEWS_SERP_DEFAULT_QUERIES = [
  "site:foxnews.com",
  "Fox News US politics",
  "Fox News world",
  "Fox News opinion",
  "Fox News entertainment",
  "Fox News technology",
] as const;
