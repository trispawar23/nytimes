import { NextResponse } from "next/server";
import { MOCK_ARTICLES } from "@/lib/mock-news";
import {
  articleFromNewsApiOrg,
  dedupeArticlesByUrlAndTitle,
  type NewsApiOrgRawArticle,
} from "@/lib/newsapi-org";
import {
  articlesFromSerpNewsResults,
  articlesFromSerpOrganicResults,
  mergeDedupeSortSerpArticles,
  type SerpApiSearchJson,
} from "@/lib/serpapi-news";
import { isTnaSectionParam } from "@/lib/news-query";
import {
  articlesFromAllNewsArray,
  mergeHeadlinesBuckets,
} from "@/lib/the-news-api";
import { tagsToTnaSections, type TnaSection } from "@/lib/tna-sections";
import { filterArticlesByTitlePolicy } from "@/lib/article-title-filter";
import {
  filterArticlesFoxNewsOnly,
  FOX_NEWS_SERP_DEFAULT_QUERIES,
} from "@/lib/fox-news-feed";
import { shuffleArticlesWithSeed } from "@/lib/feed-rotate";
import type { Article, NewsFeedResult } from "@/lib/types";

export const dynamic = "force-dynamic";

type HeadlinesJson = {
  data?: Record<string, unknown>;
  meta?: unknown;
  message?: string;
  error?: { message?: string } | string;
};

type NewsApiOrgListJson = {
  status?: string;
  code?: string;
  message?: string;
  articles?: NewsApiOrgRawArticle[];
};

/** In-memory feed cache per feed key; bypass with `?refresh=1` or `?nocache=1`. */
const feedCacheMap = new Map<
  string,
  { payload: NewsFeedResult; expiresAt: number }
>();

function feedCacheKey(categoryParam: string | null, tags: string | null): string {
  if (categoryParam && isTnaSectionParam(categoryParam)) {
    return `category:${categoryParam}`;
  }
  return `tags:${tags ?? ""}`;
}

function logNewsError(message: string, context?: Record<string, string>) {
  console.error("[api/news]", message, context ?? {});
}

function cacheTtlMs(): number {
  const raw = process.env.NEWS_FEED_CACHE_SECONDS;
  if (raw) {
    const s = Number(raw);
    if (Number.isFinite(s)) {
      const clamped = Math.min(1800, Math.max(600, s));
      return clamped * 1000;
    }
  }
  return 15 * 60 * 1000;
}

function trimEnvKey(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let t = value.trim();
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1).trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim();
  }
  return t.length > 0 ? t : undefined;
}

/** SerpApi.com — https://serpapi.com/manage-api-key */
function readSerpApiKey(): string | undefined {
  return trimEnvKey(process.env.SERPAPI_API_KEY);
}

/** https://newsapi.org — developer key from their dashboard. */
function readNewsApiOrgKey(): string | undefined {
  return trimEnvKey(
    process.env.NEWSAPI_ORG_KEY ?? process.env.NEWSAPI_KEY,
  );
}

/** TheNewsAPI (`api.thenewsapi.com`) token (legacy path). */
function readTheNewsApiToken(): string | undefined {
  return trimEnvKey(
    process.env.THENEWSAPI_API_TOKEN ??
      process.env.THENEWS_API_TOKEN ??
      process.env.NEWS_API_KEY,
  );
}

function parseTheNewsApiErrorJson(text: string): {
  code?: string;
  message?: string;
} {
  try {
    const j = JSON.parse(text) as {
      error?: { code?: string; message?: string } | string;
    };
    if (j && typeof j.error === "object" && j.error) {
      return { code: j.error.code, message: j.error.message };
    }
    return {};
  } catch {
    return {};
  }
}

function describeTheNewsApiFailure(
  status: number,
  bodyText: string,
): string | null {
  const { code, message } = parseTheNewsApiErrorJson(bodyText);
  if (code === "invalid_api_token") {
    return "The News API rejected this token (invalid_api_token). Check credentials and restart the server.";
  }
  if (code === "usage_limit_reached") {
    return "The News API plan usage limit was reached. Showing sample stories.";
  }
  if (code === "endpoint_access_restricted") {
    return "This News API subscription cannot use the headlines endpoint. Showing sample stories.";
  }
  if (code === "rate_limit_reached") {
    return "The News API rate limit was hit; try again shortly. Showing sample stories.";
  }
  if (code === "malformed_parameters" && message) {
    return `News API: ${message}`;
  }
  if (message && message.length > 0 && message.length < 240) {
    return `Live news unavailable: ${message}`;
  }
  if (status >= 500) {
    return "The News API returned a server error. Showing sample stories.";
  }
  return null;
}

async function fetchTheNewsApiHeadlines(sections: TnaSection[]): Promise<{
  articles: Article[];
  ok: boolean;
  failureReason?: string;
}> {
  const token = readTheNewsApiToken();
  if (!token) {
    logNewsError("Legacy TheNewsAPI: no token");
    return {
      articles: [],
      ok: false,
      failureReason:
        "No NewsAPI.org key and no TheNewsAPI token. Set NEWSAPI_ORG_KEY or THENEWSAPI_API_TOKEN / NEWS_API_KEY in .env.local.",
    };
  }

  const categories = sections.join(",");
  const url = new URL("https://api.thenewsapi.com/v1/news/all");
  url.searchParams.set("api_token", token);
  url.searchParams.set("language", "en");
  url.searchParams.set("categories", categories);
  url.searchParams.set("limit", "40");
  url.searchParams.set("page", "1");

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "nyt-for-you-next/1.0",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "network_error";
    logNewsError("TheNewsAPI fetch failed", { reason: msg });
    return {
      articles: [],
      ok: false,
      failureReason: `Could not reach The News API (${msg}). Showing sample stories.`,
    };
  }

  const bodyText = await res.text();

  if (!res.ok) {
    const { code, message } = parseTheNewsApiErrorJson(bodyText);
    logNewsError("TheNewsAPI upstream non-OK", {
      status: String(res.status),
      code: code ?? "",
      message: (message ?? bodyText).slice(0, 300),
    });
    const described = describeTheNewsApiFailure(res.status, bodyText);
    return { articles: [], ok: false, failureReason: described ?? undefined };
  }

  let json: HeadlinesJson;
  try {
    json = JSON.parse(bodyText) as HeadlinesJson;
  } catch {
    logNewsError("TheNewsAPI invalid JSON");
    return {
      articles: [],
      ok: false,
      failureReason:
        "The News API returned invalid JSON. Showing sample stories.",
    };
  }

  const rawData = json.data;

  let articles: Article[] = [];
  if (Array.isArray(rawData)) {
    articles = articlesFromAllNewsArray(rawData, sections[0] ?? "general");
  } else if (rawData && typeof rawData === "object") {
    articles = mergeHeadlinesBuckets(
      rawData as Record<string, unknown>,
      sections,
    );
  }

  if (articles.length === 0) {
    logNewsError("TheNewsAPI no articles after normalize", {
      sections: sections.join(","),
    });
    return {
      articles: [],
      ok: false,
      failureReason:
        "No articles returned for the selected categories; showing sample stories.",
    };
  }

  return { articles, ok: true };
}

async function fetchNewsApiOrgHeadlinesBatch(
  apiKey: string,
  category: string | null,
  pageSize: number,
  /** Stored on `Article.category` for debugging / UI. */
  label: string,
  /** When set, NewsAPI.org uses `sources` (mutually exclusive with country/category). */
  sources?: string,
): Promise<Article[]> {
  const url = new URL("https://newsapi.org/v2/top-headlines");
  if (sources?.trim()) {
    url.searchParams.set("sources", sources.trim());
  } else {
    url.searchParams.set("country", "us");
    if (category) url.searchParams.set("category", category);
  }
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("apiKey", apiKey);

  const logScope = sources?.trim() ?? category ?? "broad";

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "nyt-for-you-next/1.0",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "network_error";
    logNewsError("NewsAPI.org fetch failed", {
      category: logScope,
      reason: msg,
    });
    return [];
  }

  const text = await res.text();
  let json: NewsApiOrgListJson;
  try {
    json = JSON.parse(text) as NewsApiOrgListJson;
  } catch {
    logNewsError("NewsAPI.org invalid JSON", {
      category: logScope,
    });
    return [];
  }

  if (json.status !== "ok") {
    logNewsError("NewsAPI.org non-ok", {
      category: logScope,
      code: json.code ?? "",
      message: (json.message ?? text).slice(0, 200),
    });
    return [];
  }

  const rawList = Array.isArray(json.articles) ? json.articles : [];
  const mapped: Article[] = [];
  for (const raw of rawList) {
    const a = articleFromNewsApiOrg(raw, label);
    if (a) mapped.push(a);
  }
  return mapped;
}

/** Enough items after index 5 for The Daily (≥4) plus Great Read hero + strip. */
const FEED_ARTICLE_CAP = 56;

function finalizeFeedArticles(articles: Article[]): Article[] {
  const fox = filterArticlesFoxNewsOnly(articles);
  const filtered = filterArticlesByTitlePolicy(fox);
  const capped = filtered.slice(0, FEED_ARTICLE_CAP);
  if (capped.length > 0) return capped;
  return fox.slice(0, FEED_ARTICLE_CAP);
}

function serpApiSearchQueries(): string[] {
  const single = trimEnvKey(process.env.SERPAPI_Q);
  if (single) return [single];
  const raw = process.env.SERPAPI_NEWS_QUERIES;
  if (raw?.trim()) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [...FOX_NEWS_SERP_DEFAULT_QUERIES];
}

async function fetchSerpApiSearch(
  apiKey: string,
  params: Record<string, string>,
): Promise<SerpApiSearchJson | null> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "nyt-for-you-next/1.0",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "network_error";
    logNewsError("SerpAPI fetch failed", { reason: msg });
    return null;
  }
  const text = await res.text();
  try {
    return JSON.parse(text) as SerpApiSearchJson;
  } catch {
    logNewsError("SerpAPI invalid JSON", {});
    return null;
  }
}

async function fetchSerpApiBlended(apiKey: string): Promise<{
  articles: Article[];
  ok: boolean;
  failureReason?: string;
}> {
  console.log("[NEWS API CALLED] SerpAPI blended search");
  const engineRaw = trimEnvKey(process.env.SERPAPI_ENGINE)?.toLowerCase();
  const engine =
    engineRaw === "google" || engineRaw === "google_news"
      ? engineRaw
      : "google_news";
  const hl = process.env.SERPAPI_HL ?? "en";
  const gl = process.env.SERPAPI_GL ?? "us";
  const googleDomain = process.env.SERPAPI_GOOGLE_DOMAIN ?? "google.com";
  const location = trimEnvKey(process.env.SERPAPI_LOCATION);

  const queries = serpApiSearchQueries();
  const tasks = queries.map(async (q, idx) => {
    const base: Record<string, string> = {
      engine,
      q,
      hl,
      gl,
    };
    if (engine === "google") {
      base.google_domain = googleDomain;
      if (location) base.location = location;
    }

    const json = await fetchSerpApiSearch(apiKey, base);
    if (!json) return [] as Article[];
    if (json.error) {
      logNewsError("SerpAPI response error", {
        q: q.slice(0, 48),
        message: json.error.slice(0, 200),
      });
      return [];
    }

    const label =
      q
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9-]/g, "")
        .slice(0, 40) || `serp-${idx}`;

    if (engine === "google_news") {
      const list = Array.isArray(json.news_results) ? json.news_results : [];
      return articlesFromSerpNewsResults(list, label);
    }

    const organic = Array.isArray(json.organic_results)
      ? json.organic_results
      : [];
    return articlesFromSerpOrganicResults(organic, label);
  });

  const buckets = await Promise.all(tasks);
  const limited = mergeDedupeSortSerpArticles(buckets, FEED_ARTICLE_CAP);

  if (limited.length === 0) {
    return {
      articles: [],
      ok: false,
      failureReason:
        "SerpAPI returned no usable results. Check SERPAPI_API_KEY, SERPAPI_ENGINE, and queries in .env.local.",
    };
  }

  return { articles: limited, ok: true };
}

async function fetchNewsApiOrgFoxNews(apiKey: string): Promise<{
  articles: Article[];
  ok: boolean;
  failureReason?: string;
}> {
  console.log("[NEWS API CALLED] newsapi.org Fox News (sources=fox-news)");
  const merged = await fetchNewsApiOrgHeadlinesBatch(
    apiKey,
    null,
    100,
    "fox-news",
    "fox-news",
  );
  const deduped = dedupeArticlesByUrlAndTitle(merged);
  deduped.sort(
    (x, y) =>
      new Date(y.publishedAt).getTime() - new Date(x.publishedAt).getTime(),
  );
  const limited = deduped.slice(0, FEED_ARTICLE_CAP);

  if (limited.length === 0) {
    return {
      articles: [],
      ok: false,
      failureReason:
        "NewsAPI.org returned no Fox News headlines. Showing sample stories.",
    };
  }

  return { articles: limited, ok: true };
}

async function resolveNewsFeed(sections: TnaSection[]): Promise<NewsFeedResult> {
  const serpKey = readSerpApiKey();
  if (serpKey) {
    const live = await fetchSerpApiBlended(serpKey);
    if (live.ok && live.articles.length > 0) {
      return {
        ok: true,
        articles: finalizeFeedArticles(live.articles),
        source: "live",
      };
    }
    const errorMessage =
      live.failureReason ??
      "SerpAPI feed unavailable; showing sample stories.";
    return {
      ok: false,
      error: errorMessage,
      articles: finalizeFeedArticles(MOCK_ARTICLES),
      source: "mock_fallback",
    };
  }

  const orgKey = readNewsApiOrgKey();
  if (orgKey) {
    const live = await fetchNewsApiOrgFoxNews(orgKey);
    if (live.ok && live.articles.length > 0) {
      return {
        ok: true,
        articles: finalizeFeedArticles(live.articles),
        source: "live",
      };
    }
    const errorMessage =
      live.failureReason ??
      "Live news temporarily unavailable; showing sample stories.";
    return {
      ok: false,
      error: errorMessage,
      articles: finalizeFeedArticles(MOCK_ARTICLES),
      source: "mock_fallback",
    };
  }

  console.log("[NEWS API CALLED] TheNewsAPI legacy");
  const live = await fetchTheNewsApiHeadlines(sections);
  if (live.ok && live.articles.length > 0) {
    return {
      ok: true,
      articles: finalizeFeedArticles(live.articles),
      source: "live",
    };
  }

  const errorMessage =
    live.failureReason ??
    "Live news temporarily unavailable; showing sample stories.";

  if (!readTheNewsApiToken()) {
    return {
      ok: false,
      error:
        "No SERPAPI_API_KEY, NEWSAPI_ORG_KEY, or TheNewsAPI token. Add SERPAPI_API_KEY to .env.local (recommended), or NEWSAPI_ORG_KEY / NEWS_API_KEY.",
      articles: finalizeFeedArticles(MOCK_ARTICLES),
      source: "mock_fallback",
    };
  }

  return {
    ok: false,
    error: errorMessage,
    articles: finalizeFeedArticles(MOCK_ARTICLES),
    source: "mock_fallback",
  };
}

export async function GET(req: Request): Promise<NextResponse<NewsFeedResult>> {
  try {
    const { searchParams } = new URL(req.url);
    const bypassCache =
      searchParams.get("refresh") === "1" ||
      searchParams.get("nocache") === "1";

    const categoryParam = searchParams.get("category");
    const tags = searchParams.get("tags");
    const cacheKey = feedCacheKey(categoryParam, tags);

    if (!bypassCache) {
      const hit = feedCacheMap.get(cacheKey);
      if (hit && Date.now() < hit.expiresAt) {
        return NextResponse.json(hit.payload, {
          headers: {
            "Cache-Control": "private, no-store, max-age=0",
          },
        });
      }
    }

    let sections: TnaSection[];
    if (categoryParam && isTnaSectionParam(categoryParam)) {
      sections = [categoryParam];
    } else {
      sections = tagsToTnaSections(tags);
    }

    const result = await resolveNewsFeed(sections);

    let payload = result;
    if (bypassCache && result.articles.length > 1) {
      const rotParam = searchParams.get("rot")?.trim() ?? "";
      const seed =
        rotParam.length > 0
          ? rotParam
          : `${Date.now()}-${crypto.randomUUID()}`;
      payload = {
        ...result,
        articles: shuffleArticlesWithSeed(result.articles, seed),
      };
    }

    feedCacheMap.set(cacheKey, {
      payload,
      expiresAt: Date.now() + cacheTtlMs(),
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unexpected_error";
    logNewsError("GET handler failed", { reason: msg });
    const fallback: NewsFeedResult = {
      ok: false,
      error: "Live news temporarily unavailable; showing sample stories.",
      articles: finalizeFeedArticles(MOCK_ARTICLES),
      source: "mock_fallback",
    };
    return NextResponse.json(fallback, { status: 200 });
  }
}
