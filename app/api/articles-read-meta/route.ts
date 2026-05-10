import { NextResponse } from "next/server";
import { cleanArticleBodyForReader } from "@/lib/article-body-clean";
import { fetchArticlePlainText } from "@/lib/article-read-fetch";
import { isAllowedArticleReadUrl } from "@/lib/article-read-url";
import { countWords, readingMinutesFromWordCount } from "@/lib/reading-stats";

export const dynamic = "force-dynamic";

const MAX_ITEMS = 18;
const CONCURRENCY = 3;

type InArticle = {
  id?: string;
  url?: string;
  title?: string;
};

type OkRow = { id: string; ok: true; minutes: number; wordCount: number };
type FailRow = { id: string; ok: false; error: string };
type Row = OkRow | FailRow;

function minutesFromExtractedPlainText(text: string, title: string): {
  minutes: number;
  wordCount: number;
} {
  const cleaned = cleanArticleBodyForReader(text, title.trim()).trim();
  const basis = cleaned.length >= 120 ? cleaned : text.trim();
  const wc = countWords(basis);
  return {
    wordCount: wc,
    minutes: readingMinutesFromWordCount(wc),
  };
}

async function measureOne(a: InArticle): Promise<Row> {
  const id = typeof a.id === "string" ? a.id.trim() : "";
  const url = typeof a.url === "string" ? a.url.trim() : "";
  const title = typeof a.title === "string" ? a.title : "";
  if (!id || !url || !isAllowedArticleReadUrl(url)) {
    return { id: id || "unknown", ok: false, error: "invalid_input" };
  }
  try {
    const result = await fetchArticlePlainText(url);
    if (!result.ok) {
      return { id, ok: false, error: result.error };
    }
    const { minutes, wordCount } = minutesFromExtractedPlainText(
      result.text,
      title,
    );
    if (minutes <= 0 || wordCount < 80) {
      return { id, ok: false, error: "too_short" };
    }
    return { id, ok: true, minutes, wordCount };
  } catch {
    return { id, ok: false, error: "fetch_failed" };
  }
}

/**
 * Batch measures reading length from full-page text (same pipeline as
 * `/api/article-read`) for feed ranking. Disabled when `ARTICLE_READ_FETCH=0`.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (process.env.ARTICLE_READ_FETCH === "0") {
    return NextResponse.json(
      { ok: false, error: "disabled", results: [] as Row[] },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const rawList =
    body &&
    typeof body === "object" &&
    "articles" in body &&
    Array.isArray((body as { articles: unknown }).articles)
      ? ((body as { articles: InArticle[] }).articles ?? [])
      : [];

  const items = rawList.filter(
    (x): x is InArticle => x !== null && typeof x === "object",
  );
  if (items.length === 0) {
    return NextResponse.json({ results: [] as Row[] });
  }

  const slice = items.slice(0, MAX_ITEMS);
  const results: Row[] = [];

  for (let i = 0; i < slice.length; i += CONCURRENCY) {
    const chunk = slice.slice(i, i + CONCURRENCY);
    const chunkRows = await Promise.all(chunk.map(measureOne));
    results.push(...chunkRows);
  }

  return NextResponse.json({ ok: true, results });
}
