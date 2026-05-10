import { NextResponse } from "next/server";
import { fetchArticlePlainText } from "@/lib/article-read-fetch";
import { isAllowedArticleReadUrl } from "@/lib/article-read-url";

export const dynamic = "force-dynamic";

/**
 * Fetches readable article text for a public URL (used when the feed only
 * has a short snippet). Tries Jina Reader (`r.jina.ai`), then a simple HTML
 * extraction fallback. Optional `JINA_API_KEY` improves Jina reliability.
 * Disable all outbound fetches with `ARTICLE_READ_FETCH=0`.
 */
export async function GET(req: Request): Promise<NextResponse> {
  if (process.env.ARTICLE_READ_FETCH === "0") {
    return NextResponse.json(
      { ok: false, error: "disabled", hint: "Full-text fetch is turned off." },
      { status: 403 },
    );
  }

  const url = new URL(req.url).searchParams.get("url")?.trim() ?? "";
  if (!url || !isAllowedArticleReadUrl(url)) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_url",
        hint: "Missing or disallowed URL.",
      },
      { status: 400 },
    );
  }

  const result = await fetchArticlePlainText(url);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, hint: result.hint },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    text: result.text,
    source: result.source,
  });
}
