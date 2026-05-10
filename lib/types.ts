export type FeedMode = "discover" | "relax" | "catchup";

export type Article = {
  id: string;
  title: string;
  description: string;
  content: string;
  source: string;
  author: string | null;
  url: string;
  imageUrl: string | null;
  publishedAt: string;
  category: string;
  /**
   * Client-only: full-page fetch via `/api/articles-read-meta`.
   * `undefined` = not measured yet; positive = minutes (200 WPM on cleaned text); `null` = fetch failed.
   */
  readMinutesFromFetch?: number | null;
};

export type SummaryRequest = {
  title: string;
  body: string;
  mode: FeedMode;
  readingTimeMinutes: number;
  userQuery?: string;
};

export type SummaryResponse = {
  headline: string;
  summary: string;
  /** Present for 1-minute summaries (`readingTimeMinutes === 1`). */
  key_takeaway?: string;
  key_points: string[];
  why_it_matters: string;
  confidence: number;
  voice_script: string;
  limitations: string;
};

export type SummarizeApiResult =
  | {
      ok: true;
      data: SummaryResponse;
      meta?: { usedMockNews?: boolean };
    }
  | {
      ok: false;
      error: string;
      code?:
        | "PARSE_ERROR"
        | "OPENAI_ERROR"
        | "VALIDATION"
        | "INSUFFICIENT_SOURCE"
        | "INTERNAL";
    };

/** `/api/catchup-brief` — hero card Key Highlights + one-liner. */
export type CatchupBriefResponse = {
  one_liner: string;
  key_points: [string, string];
  confidence: string;
  limitations: string;
};

export type CatchupBriefApiResult =
  | { ok: true; data: CatchupBriefResponse }
  | {
      ok: false;
      error: string;
      code?:
        | "PARSE_ERROR"
        | "OPENAI_ERROR"
        | "VALIDATION"
        | "INSUFFICIENT_SOURCE"
        | "INTERNAL";
    };

export type NewsFeedResult =
  | {
      ok: true;
      articles: Article[];
      source: "live";
    }
  | {
      ok: false;
      error: string;
      articles: Article[];
      source: "mock_fallback";
    };
