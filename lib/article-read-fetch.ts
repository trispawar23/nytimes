import { isAllowedArticleReadUrl } from "./article-read-url";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const ARTICLE_BODY_CLASS = "article-body";

const VOID_HTML_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function isVoidHtmlTag(tag: string): boolean {
  return VOID_HTML_TAGS.has(tag.toLowerCase());
}

function classAttributeContainsArticleBody(classValue: string): boolean {
  return classValue
    .split(/\s+/)
    .some((c) => c.toLowerCase() === ARTICLE_BODY_CLASS);
}

/**
 * Inner HTML of the deepest/longest element whose class list includes `article-body`.
 */
function extractArticleBodyInnerHtml(html: string): string | null {
  const re =
    /<([a-zA-Z][\w-]*)([^>]*\sclass\s*=\s*["']([^"']*)["'][^>]*)>/gi;
  const candidates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tagName = m[1]!;
    const classVal = m[3]!;
    if (!classAttributeContainsArticleBody(classVal)) continue;
    const openEnd = m.index + m[0].length;
    const inner = extractBalancedInnerHtml(html, openEnd, tagName);
    if (inner && inner.length > 80) candidates.push(inner);
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0]!;
}

function extractBalancedInnerHtml(
  html: string,
  innerStart: number,
  tagName: string,
): string | null {
  const tag = tagName.toLowerCase();
  let depth = 1;
  let i = innerStart;

  while (i < html.length && depth > 0) {
    const lt = html.indexOf("<", i);
    if (lt < 0) return null;

    if (html[lt + 1] === "!") {
      if (html.slice(lt, lt + 4) === "<!--") {
        const ce = html.indexOf("-->", lt + 4);
        i = ce < 0 ? html.length : ce + 3;
        continue;
      }
      i = lt + 2;
      continue;
    }

    if (html[lt + 1] === "/") {
      const closeMatch = /^<\/([a-zA-Z][\w-]*)\s*>/.exec(html.slice(lt));
      if (closeMatch && closeMatch[1]!.toLowerCase() === tag) {
        depth--;
        if (depth === 0) return html.slice(innerStart, lt);
        i = lt + closeMatch[0].length;
        continue;
      }
      i = lt + 1;
      continue;
    }

    const openMatch = /^<([a-zA-Z][\w-]*)([\s\S]*?)>/.exec(html.slice(lt));
    if (!openMatch) {
      i = lt + 1;
      continue;
    }
    const openTag = openMatch[1]!.toLowerCase();
    const rest = openMatch[2] ?? "";
    const fullTag = openMatch[0];
    if (/\s\/\s*$/.test(rest) || rest.trimEnd().endsWith("/")) {
      i = lt + fullTag.length;
      continue;
    }
    if (isVoidHtmlTag(openTag)) {
      i = lt + fullTag.length;
      continue;
    }
    if (openTag === tag) depth++;
    i = lt + fullTag.length;
  }
  return null;
}

/** Drop regions that usually duplicate rails / mega-footers before flattening HTML. */
function stripBoilerplateRegions(html: string): string {
  return html
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, "")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "");
}

/** Plaintext from HTML only inside `.article-body` (no full-page fallback). */
function stripHtmlToText(html: string): string {
  const bodyInner = extractArticleBodyInnerHtml(html);
  if (!bodyInner || bodyInner.length < 120) return "";
  const focused = stripBoilerplateRegions(bodyInner);
  return focused
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikeJinaFailureMessage(text: string): boolean {
  const t = text.slice(0, 600).toLowerCase();
  return (
    t.includes("failed to fetch") ||
    t.includes("access denied") ||
    t.includes("403 forbidden") ||
    t.includes("blocked") ||
    t.includes("rate limit") ||
    t.includes("could not retrieve")
  );
}

/** Follow redirects so Google News / AMP wrappers become the real publisher URL. */
export async function resolveArticleUrlForReading(seedUrl: string): Promise<string> {
  if (!isAllowedArticleReadUrl(seedUrl)) return seedUrl;
  try {
    const res = await fetch(seedUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": BROWSER_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(14_000),
    });
    const finalUrl = res.url?.trim();
    if (finalUrl && isAllowedArticleReadUrl(finalUrl)) return finalUrl;
  } catch {
    /* keep seed */
  }
  return seedUrl;
}

async function fetchViaJinaReader(targetUrl: string): Promise<string | null> {
  const readerUrl = `https://r.jina.ai/${targetUrl}`;
  const headers: Record<string, string> = {
    Accept: "text/plain",
    "X-Return-Format": "text",
    "User-Agent": "nyt-for-you-next/1.0 (article-read)",
  };
  const key = process.env.JINA_API_KEY?.trim();
  if (key) headers.Authorization = `Bearer ${key}`;

  const res = await fetch(readerUrl, {
    headers,
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(35_000),
  });

  if (!res.ok) return null;
  const text = (await res.text()).trim();
  if (text.length < 80 || looksLikeJinaFailureMessage(text)) return null;
  return text;
}

async function fetchViaDirectHtml(targetUrl: string): Promise<string | null> {
  const res = await fetch(targetUrl, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(18_000),
  });
  if (!res.ok) return null;
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("text/html")) return null;
  const html = await res.text();
  const text = stripHtmlToText(html);
  if (text.length < 80) return null;
  return text;
}

export type ArticleReadFailure = {
  ok: false;
  error: string;
  hint: string;
};

export type ArticleReadSuccess = { ok: true; text: string; source: "jina" | "html" };

const MAX_TEXT = 200_000;

export async function fetchArticlePlainText(
  originalUrl: string,
): Promise<ArticleReadSuccess | ArticleReadFailure> {
  const resolved = await resolveArticleUrlForReading(originalUrl);

  if (!isAllowedArticleReadUrl(resolved)) {
    return {
      ok: false,
      error: "invalid_url",
      hint: "That link cannot be loaded safely.",
    };
  }

  try {
    /* Prefer direct HTML so we only flatten `.article-body`. Jina returns whole-page text. */
    let text = await fetchViaDirectHtml(resolved);
    let source: "jina" | "html" = "html";
    if (!text && resolved !== originalUrl) {
      text = await fetchViaDirectHtml(originalUrl);
    }
    if (!text) {
      text = await fetchViaJinaReader(resolved);
      source = "jina";
    }
    if (!text && resolved !== originalUrl) {
      text = await fetchViaJinaReader(originalUrl);
      source = "jina";
    }

    if (!text) {
      let hint =
        "The publisher often blocks automated readers (bot protection, paywall, or consent walls). Open “Read on …” for the full story in your browser.";
      try {
        const h = new URL(originalUrl).hostname.toLowerCase();
        if (h.includes("news.google")) {
          hint =
            "This URL goes through Google News, which usually requires a browser to finish redirecting to the publisher. " +
            hint;
        }
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        error: "extract_failed",
        hint,
      };
    }

    if (text.length > MAX_TEXT) {
      text = `${text.slice(0, MAX_TEXT)}\n\n…`;
    }

    return { ok: true, text, source };
  } catch {
    return {
      ok: false,
      error: "fetch_failed",
      hint:
        "Could not reach the article URL in time. Check your network or open the publisher link below.",
    };
  }
}
