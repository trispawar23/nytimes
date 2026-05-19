"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Article, FeedMode, NewsFeedResult, SummarizeApiResult } from "@/lib/types";
import type { SummaryResponse } from "@/lib/types";
import {
  askBriefCacheKey,
  defaultBriefCacheKey,
  readerDisplayBriefCacheKey,
} from "@/lib/summary-cache-key";
import { modeToTags } from "@/lib/news-query";
import { replacePlaybackKeyIfMatch } from "@/lib/puter-tts";
import {
  articleWordCount,
  orderArticlesForLongReadSections,
  readingMinutesFromWordCount,
} from "@/lib/reading-stats";
import { BottomNav } from "./BottomNav";
import type { PanelStatus } from "./CatchMeUpPanel";
import { CatchMeUpPanel } from "./CatchMeUpPanel";
import { ArticleReaderScreen } from "./ArticleReaderScreen";
import { CatchupFeed } from "./CatchupFeed";
import { RelaxFeed } from "./RelaxFeed";
import { DiscoverFeed } from "./DiscoverFeed";
import { ForYouFeed } from "./ForYouFeed";
import { ForYouHeader } from "./ForYouHeader";
import { ListenNowPlayingChip } from "./ListenNowPlayingChip";
import { PhoneFrame } from "./PhoneFrame";
import { PullToRefresh } from "./PullToRefresh";

type BriefCacheEntry = {
  data: SummaryResponse | null;
  status: PanelStatus;
  error?: string;
};

function mapSummarizeStatus(
  result: SummarizeApiResult,
): { panel: PanelStatus; data?: SummaryResponse | null; error?: string } {
  if (!result.ok) {
    if (result.code === "INSUFFICIENT_SOURCE") {
      return { panel: "insufficient_source", data: null, error: result.error };
    }
    return { panel: "error", data: null, error: result.error };
  }
  const d = result.data;
  const low = d.confidence < 0.45;
  return {
    panel: low ? "low_confidence" : "success",
    data: d,
  };
}

export default function ForYouClient() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsMessage, setNewsMessage] = useState<string | null>(null);

  const [mode, setMode] = useState<FeedMode>("discover");
  /** Discover-only: carousel layout vs classic Great Read / Daily feed. Toggled by tapping Discover again. */
  const [discoverLayoutActive, setDiscoverLayoutActive] = useState(false);
  const [selected, setSelected] = useState<Article | null>(null);
  const [readerArticle, setReaderArticle] = useState<Article | null>(null);
  const prevReaderArticleRef = useRef<Article | null>(null);

  const [panelOpen, setPanelOpen] = useState(false);
  const [readingTime, setReadingTime] = useState(3);
  const [question, setQuestion] = useState("");
  const [voiceActive, setVoiceActive] = useState(false);
  const [assistantRecommendations, setAssistantRecommendations] = useState<Article[]>([]);
  const [assistantRecommendationsTitle, setAssistantRecommendationsTitle] =
    useState<string | null>(null);

  const [panelStatus, setPanelStatus] = useState<PanelStatus>("idle");
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [summaryError, setSummaryError] = useState<string | undefined>();

  /** Half-length (3 min) brief shown inline in the article reader — not the Catch Me Up sheet. */
  const [readerMediumBrief, setReaderMediumBrief] = useState<{
    status: PanelStatus;
    data: SummaryResponse | null;
    error?: string;
  }>({ status: "idle", data: null });

  /** One-minute (1 min) brief — inline reader layout with takeaway + author row. */
  const [readerShortBrief, setReaderShortBrief] = useState<{
    status: PanelStatus;
    data: SummaryResponse | null;
    error?: string;
  }>({ status: "idle", data: null });

  const modeRef = useRef(mode);
  const readingTimeRef = useRef(readingTime);
  modeRef.current = mode;
  readingTimeRef.current = readingTime;

  const briefCacheRef = useRef<Record<string, BriefCacheEntry>>({});
  /** Bumps when a new `/api/news` payload loads so stale read-meta responses are ignored. */
  const feedGenerationRef = useRef(0);
  /**
   * Per-mode article snapshot. Avoids re-shuffling on every mode toggle —
   * the wire pays only on first visit + explicit refresh (pull-to-refresh,
   * long-absence wake, or page reload).
   */
  const articlesByModeRef = useRef<Map<FeedMode, Article[]>>(new Map());
  /** Wall-clock for the last successful load; visibility wake refresh uses this. */
  const lastLoadAtRef = useRef<number>(0);
  /**
   * First `loadNews` of this React tree's lifetime is implicitly a refresh
   * so that a fresh tab / page reload / "reopen the app" pulls a new shuffle
   * past the server's in-memory feed cache.
   */
  const firstLoadRef = useRef(true);

  /**
   * Articles arrive already long-read-ordered from `loadNews`, so the layout
   * stays stable when later read-meta updates patch in real minute counts.
   * (Re-sorting on every read-meta tick was the source of "discover is glitchy".)
   */
  const feedLayoutArticles = articles;

  const loadNews = useCallback(async (opts?: { force?: boolean }) => {
    const wasFirstLoad = firstLoadRef.current;
    firstLoadRef.current = false;
    /**
     * Cold start (reload / new tab / "reopen the app") implicitly forces a
     * fresh shuffle. After that, only explicit refresh actions force.
     */
    const force = opts?.force ?? wasFirstLoad;
    const currentMode = modeRef.current;

    feedGenerationRef.current += 1;
    setNewsMessage(null);

    if (!force) {
      const cached = articlesByModeRef.current.get(currentMode);
      if (cached && cached.length > 0) {
        setArticles(cached);
        setNewsLoading(false);
        return;
      }
    }

    if (force) {
      // Only an explicit user-driven refresh wipes derived state for the panel/reader.
      briefCacheRef.current = {};
      setSummary(null);
      setPanelStatus("idle");
      setSummaryError(undefined);
      setReaderMediumBrief({ status: "idle", data: null, error: undefined });
      setReaderShortBrief({ status: "idle", data: null, error: undefined });
    }

    setNewsLoading(true);

    const params = new URLSearchParams();
    params.set("tags", modeToTags(currentMode));
    if (force) {
      // Bypass server feed cache + reshuffle only on explicit refresh.
      params.set("refresh", "1");
      params.set(
        "rot",
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
      );
    }

    try {
      const res = await fetch(`/api/news?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as NewsFeedResult;
      const ordered =
        Array.isArray(json.articles) && json.articles.length > 0
          ? orderArticlesForLongReadSections(json.articles)
          : json.articles;
      articlesByModeRef.current.set(currentMode, ordered);
      lastLoadAtRef.current = Date.now();
      setArticles(ordered);
      if (!json.ok) {
        setNewsMessage(json.error);
      } else {
        setNewsMessage(null);
      }
    } catch {
      setArticles([]);
      setNewsMessage("Could not load the feed.");
    } finally {
      setNewsLoading(false);
    }
  }, []);

  /**
   * Load on mount; on mode change, prefer the per-mode snapshot.
   * Articles only re-shuffle on explicit refresh (pull-to-refresh, long-absence
   * wake, or full page reload — each starts with an empty `articlesByModeRef`).
   */
  useEffect(() => {
    void loadNews();
  }, [mode, loadNews]);

  /**
   * If the app was hidden for a while and the user returns, treat it like
   * "opened the app after closing it" and pull a fresh shuffle. 5 min was
   * chosen to match the perceived freshness of a typical news app.
   */
  useEffect(() => {
    if (typeof document === "undefined") return;
    const STALE_MS = 5 * 60 * 1000;
    const hiddenAtRef = { current: 0 };
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }
      if (document.visibilityState !== "visible") return;
      const hiddenFor = hiddenAtRef.current
        ? Date.now() - hiddenAtRef.current
        : 0;
      hiddenAtRef.current = 0;
      const ageSinceLastLoad = lastLoadAtRef.current
        ? Date.now() - lastLoadAtRef.current
        : Number.POSITIVE_INFINITY;
      if (hiddenFor >= STALE_MS || ageSinceLastLoad >= STALE_MS) {
        articlesByModeRef.current.clear();
        void loadNews({ force: true });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [loadNews]);


  /** Measure full-page read length for the top of feed so ~7 min ranking uses real text, not snippets. */
  useEffect(() => {
    if (newsLoading || articles.length === 0) return;

    const candidates = articles
      .filter(
        (a) =>
          a.readMinutesFromFetch === undefined &&
          /^https?:\/\//i.test(a.url.trim()),
      )
      .slice(0, 18);

    if (candidates.length === 0) return;

    const gen = feedGenerationRef.current;
    const ac = new AbortController();

    void (async () => {
      try {
        const res = await fetch("/api/articles-read-meta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            articles: candidates.map((a) => ({
              id: a.id,
              url: a.url.trim(),
              title: a.title,
            })),
          }),
          signal: ac.signal,
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          results?: Array<
            | { id: string; ok: true; minutes: number }
            | { id: string; ok: false }
          >;
        };
        if (feedGenerationRef.current !== gen) return;
        const rows = json.results ?? [];
        const map = new Map(rows.map((r) => [r.id, r]));
        setArticles((prev) => {
          if (feedGenerationRef.current !== gen) return prev;
          let mutated = false;
          const next = prev.map((a) => {
            const hit = map.get(a.id);
            if (!hit) return a;
            if (hit.ok && typeof hit.minutes === "number" && hit.minutes > 0) {
              mutated = true;
              return { ...a, readMinutesFromFetch: hit.minutes };
            }
            if (a.readMinutesFromFetch !== null) {
              mutated = true;
              return { ...a, readMinutesFromFetch: null };
            }
            return a;
          });
          if (!mutated) return prev;
          // Persist the better minute labels into the per-mode cache so
          // re-entering this mode within the session keeps them.
          articlesByModeRef.current.set(modeRef.current, next);
          return next;
        });
      } catch {
        /* aborted or network */
      }
    })();

    return () => ac.abort();
  }, [articles, newsLoading]);

  useEffect(() => {
    if (articles.length === 0) {
      setSelected(null);
      return;
    }
    setSelected((prev) => {
      if (prev && articles.some((a) => a.id === prev.id)) return prev;
      return feedLayoutArticles[0] ?? null;
    });
  }, [articles, feedLayoutArticles]);

  useEffect(() => {
    setReaderMediumBrief({ status: "idle", data: null, error: undefined });
    setReaderShortBrief({ status: "idle", data: null, error: undefined });
  }, [readerArticle?.id]);

  /** Dock listen key: reader → feed only when leaving the article view (not Strict Mode child remounts). */
  useEffect(() => {
    const prev = prevReaderArticleRef.current;
    prevReaderArticleRef.current = readerArticle;

    if (prev && readerArticle === null) {
      replacePlaybackKeyIfMatch(`reader:${prev.id}`, `feed:${prev.id}`);
    }
  }, [readerArticle]);

  /**
   * When panel is open, sync from **default** brief cache for article × mode × current
   * reading time (ref). Does not re-run when only `readingTime` changes so the slider
   * stays local UI until the user explicitly generates again.
   */
  useEffect(() => {
    if (!panelOpen || !selected) return;
    const rt = readingTimeRef.current;
    const k = defaultBriefCacheKey(selected.id, mode, rt);
    const hit = briefCacheRef.current[k];
    if (
      hit?.data &&
      (hit.status === "success" ||
        hit.status === "low_confidence" ||
        hit.status === "insufficient_source")
    ) {
      setSummary(hit.data);
      setPanelStatus(hit.status);
      setSummaryError(hit.error);
    } else if (hit?.status === "error") {
      setSummary(null);
      setPanelStatus("error");
      setSummaryError(hit.error);
    } else {
      setSummary(null);
      setPanelStatus("idle");
      setSummaryError(undefined);
    }
  }, [panelOpen, selected, mode]);

  const summarize = useCallback(
    async (opts: {
      userQuery?: string;
      articleOverride?: Article;
      intent: "default" | "ask";
      force?: boolean;
      /** Use when parent state/ref may not reflect the rail yet (e.g. Medium / 3 min). */
      readingTimeOverride?: number;
      /** Inline reader vs Catch Me Up panel (panel remains default). */
      applyTo?: "panel" | "reader_medium_inline" | "reader_short_inline";
      /** Same text the reader shows (full fetch when available); avoids feed excerpt “too short”. */
      bodyOverride?: string;
    }) => {
      const applyTo = opts.applyTo ?? "panel";
      const art = opts.articleOverride ?? selected;
      if (!art) return;
      const m = modeRef.current;
      const rt =
        typeof opts.readingTimeOverride === "number"
          ? opts.readingTimeOverride
          : readingTimeRef.current;
      const bodyRaw =
        typeof opts.bodyOverride === "string"
          ? opts.bodyOverride.trim()
          : art.content.trim();
      const qRaw = (opts.userQuery ?? "").trim();
      const defaultCatchQuery =
        "Produce a fresh briefing aligned to the selected mode and reading time.";
      const askFallback = "Answer succinctly using only the article text.";
      const requestQuery =
        opts.intent === "ask" ? (qRaw || askFallback) : defaultCatchQuery;
      const cacheKey =
        opts.intent === "ask"
          ? askBriefCacheKey(art.id, m, rt, requestQuery)
          : typeof opts.bodyOverride === "string"
            ? readerDisplayBriefCacheKey(art.id, m, rt, bodyRaw)
            : defaultBriefCacheKey(art.id, m, rt);

      const applyFromCache = (hit: BriefCacheEntry) => {
        if (applyTo === "reader_medium_inline") {
          setReaderMediumBrief({
            status: hit.status,
            data: hit.data,
            error: hit.error,
          });
        } else if (applyTo === "reader_short_inline") {
          setReaderShortBrief({
            status: hit.status,
            data: hit.data,
            error: hit.error,
          });
        } else {
          setPanelStatus(hit.status);
          setSummary(hit.data);
          setSummaryError(hit.error);
        }
      };

      const setLoading = () => {
        if (applyTo === "reader_medium_inline") {
          setReaderMediumBrief((prev) => ({
            ...prev,
            status: "loading",
            error: undefined,
          }));
        } else if (applyTo === "reader_short_inline") {
          setReaderShortBrief((prev) => ({
            ...prev,
            status: "loading",
            error: undefined,
          }));
        } else {
          setPanelStatus("loading");
          setSummaryError(undefined);
        }
      };

      const applyMapped = (mapped: {
        panel: PanelStatus;
        data?: SummaryResponse | null;
        error?: string;
      }) => {
        const entry: BriefCacheEntry = {
          data: mapped.data ?? null,
          status: mapped.panel,
          error: mapped.error,
        };
        briefCacheRef.current[cacheKey] = entry;
        if (applyTo === "reader_medium_inline") {
          setReaderMediumBrief({
            status: mapped.panel,
            data: mapped.data ?? null,
            error: mapped.error,
          });
        } else if (applyTo === "reader_short_inline") {
          setReaderShortBrief({
            status: mapped.panel,
            data: mapped.data ?? null,
            error: mapped.error,
          });
        } else {
          setPanelStatus(mapped.panel);
          setSummary(mapped.data ?? null);
          setSummaryError(mapped.error);
        }
      };

      if (!opts.force) {
        const hit = briefCacheRef.current[cacheKey];
        if (
          hit?.data &&
          (hit.status === "success" || hit.status === "low_confidence")
        ) {
          applyFromCache(hit);
          return;
        }
        if (hit?.status === "insufficient_source") {
          applyFromCache(hit);
          return;
        }
        if (hit?.status === "error" && hit.error) {
          applyFromCache(hit);
          return;
        }
      }

      console.log("[OPENAI API CALLED]", { cacheKey, applyTo });
      setLoading();
      try {
        const res = await fetch("/api/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: art.title,
            body: bodyRaw,
            mode: m,
            readingTimeMinutes: rt,
            userQuery: requestQuery,
          }),
        });
        const json = (await res.json()) as SummarizeApiResult;
        const mapped = mapSummarizeStatus(json);
        applyMapped(mapped);
      } catch {
        const entry: BriefCacheEntry = {
          data: null,
          status: "error",
          error: "Network error while summarizing.",
        };
        briefCacheRef.current[cacheKey] = entry;
        if (applyTo === "reader_medium_inline") {
          setReaderMediumBrief({
            status: "error",
            data: null,
            error: entry.error,
          });
        } else if (applyTo === "reader_short_inline") {
          setReaderShortBrief({
            status: "error",
            data: null,
            error: entry.error,
          });
        } else {
          setPanelStatus("error");
          setSummary(null);
          setSummaryError(entry.error);
        }
      }
    },
    [selected],
  );

  const handleModeChange = useCallback(
    (next: FeedMode) => {
      if (next === "discover" && mode === "discover") {
        setDiscoverLayoutActive((v) => !v);
        return;
      }
      if (
        (next === "relax" && mode === "relax") ||
        (next === "catchup" && mode === "catchup")
      ) {
        setMode("discover");
        setDiscoverLayoutActive(false);
        return;
      }
      setMode(next);
      if (next === "discover") {
        setDiscoverLayoutActive(true);
      }
    },
    [mode],
  );

  const handleHeaderVoice = useCallback(() => {
    const art = selected ?? feedLayoutArticles[0];
    if (!art) return;
    if (!selected || selected.id !== art.id) {
      setSelected(art);
    }
    if (!panelOpen) {
      setQuestion("");
      setSummary(null);
      setSummaryError(undefined);
      setPanelStatus("idle");
      setAssistantRecommendations([]);
      setAssistantRecommendationsTitle(null);
    }
    setPanelOpen(true);
    setVoiceActive(true);
  }, [feedLayoutArticles, panelOpen, selected]);

  const briefingArticle = readerArticle ?? selected;

  const extractVoiceReadingMinutes = useCallback((text: string): number | null => {
    const t = text.toLowerCase();
    const match = t.match(
      /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:min|mins|minute|minutes)\b/,
    );
    if (!match) return null;
    const wordToNumber: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
      eleven: 11,
      twelve: 12,
    };
    const raw = match[1]!;
    const n = wordToNumber[raw] ?? Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.min(12, Math.max(1, Math.round(n)));
  }, []);

  const isFeedBriefingCommand = useCallback((text: string): boolean => {
    const t = text.toLowerCase();
    return (
      /\b(today|today's|todays|latest|top|current|news|headlines|highlights|briefing|catch me up)\b/.test(
        t,
      ) ||
      /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:min|mins|minute|minutes)\b/.test(
        t,
      )
    );
  }, []);

  const isArticleRecommendationCommand = useCallback((text: string): boolean => {
    const t = text.toLowerCase();
    return /\b(article|articles|story|stories|recommend|recommendations|suggest|suggested|interesting|related)\b/.test(
      t,
    );
  }, []);

  const pickRecommendedArticles = useCallback((command: string): Article[] => {
    const t = command.toLowerCase();
    const selectedId = selected?.id ?? readerArticle?.id ?? null;
    const haystackFor = (article: Article) =>
      `${article.title} ${article.description} ${article.category}`.toLowerCase();

    const queryWords = t
      .split(/\W+/)
      .map((w) => w.trim())
      .filter(
        (w) =>
          w.length > 3 &&
          !["article", "articles", "story", "stories", "recommend", "recommendations", "suggest", "suggested", "interesting", "related", "please", "me", "show", "give", "find", "more", "some", "find"].includes(
            w,
          ),
      );

    const scored = feedLayoutArticles
      .filter((article) => selectedId ? article.id !== selectedId : true)
      .map((article) => {
        const haystack = haystackFor(article);
        let score = 0;
        for (const word of queryWords) {
          if (haystack.includes(word)) score += 3;
        }
        if (t.includes("related") && selected) {
          const selectedWords = selected.title
            .toLowerCase()
            .split(/\W+/)
            .filter((w) => w.length > 4);
          score += selectedWords.reduce(
            (sum, word) => sum + (haystack.includes(word) ? 2 : 0),
            0,
          );
        }
        if (t.includes("interesting")) {
          score += 1;
        }
        return { article, score };
      })
      .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title));

    if (queryWords.length > 0) {
      const weighted = scored.filter((entry) => entry.score > 0).map((entry) => entry.article);
      if (weighted.length > 0) return weighted.slice(0, 4);
    }

    // Fall back to the first non-selected articles so suggestions are stable,
    // but not always the same if the feed changes.
    return scored.slice(0, 4).map((entry) => entry.article);
  }, [feedLayoutArticles, readerArticle?.id, selected]);

  const buildFeedHighlightsArticle = useCallback((): Article | null => {
    const sourceArticles = feedLayoutArticles.slice(0, 8);
    if (sourceArticles.length === 0) return null;

    const body = sourceArticles
      .map((article, index) => {
        const parts = [
          `${index + 1}. ${article.title}`,
          article.description,
          article.content,
          article.source ? `Source: ${article.source}` : "",
          article.publishedAt ? `Published: ${article.publishedAt}` : "",
        ]
          .map((x) => x.trim())
          .filter(Boolean);
        return parts.join("\n");
      })
      .join("\n\n");

    return {
      id: `voice-feed-highlights:${sourceArticles.map((a) => a.id).join("|")}`,
      title: "Today's highlights",
      description: "A voice-requested briefing from the current news feed.",
      content: body,
      source: "Current feed",
      author: null,
      url: "",
      imageUrl: sourceArticles[0]?.imageUrl ?? null,
      publishedAt: new Date().toISOString(),
      category: "briefing",
    };
  }, [feedLayoutArticles]);

  const handleVoiceCommand = useCallback(
    (text: string) => {
      const command = text.trim();
      if (!command) return;

      setQuestion(command);
      setVoiceActive(false);
      setPanelOpen(true);
      setAssistantRecommendations([]);
      setAssistantRecommendationsTitle(null);

      const requestedMinutes = extractVoiceReadingMinutes(command);
      if (requestedMinutes !== null) {
        setReadingTime(requestedMinutes);
        readingTimeRef.current = requestedMinutes;
      }

      if (isArticleRecommendationCommand(command)) {
        const recs = pickRecommendedArticles(command);
        if (recs.length > 0) {
          setAssistantRecommendations(recs);
          setAssistantRecommendationsTitle(
            isFeedBriefingCommand(command)
              ? "Related articles to today's highlights"
              : "Recommended articles",
          );
          setPanelStatus("idle");
          setSummary(null);
          setSummaryError(undefined);
          return;
        }

        setPanelStatus("idle");
        setSummary(null);
        setSummaryError(undefined);
        return;
      }

      const art = isFeedBriefingCommand(command)
        ? buildFeedHighlightsArticle()
        : (briefingArticle ?? feedLayoutArticles[0]);
      if (!art) {
        setPanelStatus("error");
        setSummary(null);
        setSummaryError("No stories are loaded yet for a voice briefing.");
        return;
      }

      if (!art.id.startsWith("voice-feed-highlights:") && (!selected || selected.id !== art.id)) {
        setSelected(art);
      }

      void summarize({
        intent: "ask",
        userQuery: command,
        articleOverride: art,
        readingTimeOverride: requestedMinutes ?? readingTimeRef.current,
        force: true,
      });
    },
    [
      briefingArticle,
      buildFeedHighlightsArticle,
      extractVoiceReadingMinutes,
      feedLayoutArticles,
      isArticleRecommendationCommand,
      isFeedBriefingCommand,
      pickRecommendedArticles,
      selected,
      summarize,
    ],
  );

  /**
   * Catch Me Up panel rail's Full stop snaps to the briefing article's
   * actual full read time (instead of the hardcoded 8 min default).
   */
  const briefingArticleFullMinutes = briefingArticle
    ? readingMinutesFromWordCount(articleWordCount(briefingArticle))
    : undefined;

  return (
    <PhoneFrame>
      <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {readerArticle ? (
          <ArticleReaderScreen
            article={readerArticle}
            feedArticles={articles}
            readingTimeMinutes={readingTime}
            readerMediumBrief={readerMediumBrief}
            readerShortBrief={readerShortBrief}
            onReadingTimeChange={setReadingTime}
            onShortReadSelected={(displayBodyForSummary) => {
              const art = readerArticle;
              if (!art) return;
              setSelected(art);
              void summarize({
                intent: "default",
                force: false,
                articleOverride: art,
                readingTimeOverride: 1,
                applyTo: "reader_short_inline",
                bodyOverride: displayBodyForSummary,
              });
            }}
            onMediumReadSelected={(displayBodyForSummary) => {
              const art = readerArticle;
              if (!art) return;
              setSelected(art);
              void summarize({
                intent: "default",
                force: false,
                articleOverride: art,
                readingTimeOverride: 3,
                applyTo: "reader_medium_inline",
                bodyOverride: displayBodyForSummary,
              });
            }}
            onClose={() => setReaderArticle(null)}
            onMicPress={() => {
              setSelected(readerArticle);
              setPanelOpen(true);
              setVoiceActive(true);
            }}
            onSelectRelated={(a) => {
              setReaderArticle(a);
              setSelected(a);
            }}
          />
        ) : (
          <>
            <ForYouHeader
              mode={mode}
              onModeChange={handleModeChange}
              discoverHighlighted={
                mode !== "discover" || discoverLayoutActive
              }
              greetingName={
                typeof process.env.NEXT_PUBLIC_GREETING_NAME === "string" &&
                process.env.NEXT_PUBLIC_GREETING_NAME.trim() !== ""
                  ? process.env.NEXT_PUBLIC_GREETING_NAME.trim()
                  : "there"
              }
              onVoicePress={handleHeaderVoice}
              voiceDisabled={newsLoading || articles.length === 0}
            />

            <PullToRefresh
              onRefresh={async () => {
                await loadNews({ force: true });
              }}
              scrollDataAttr="data-feed-scroll"
              className={`relative min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain ${
                mode === "catchup" ||
                mode === "relax" ||
                (mode === "discover" && discoverLayoutActive)
                  ? "bg-[#F8F8F8]"
                  : ""
              }`}
            >
              {newsMessage ? (
                <div className="mx-[16.44px] mb-2 mt-2 rounded-[10px] border border-amber-200 bg-amber-50/90 px-3 py-2 font-sans text-[11px] text-amber-950">
                  {newsMessage}
                </div>
              ) : null}
              {mode === "discover" && discoverLayoutActive ? (
                <DiscoverFeed
                  articles={feedLayoutArticles}
                  selectedId={selected?.id ?? null}
                  onSelect={(art) => {
                    setSelected(art);
                    setReaderArticle(art);
                    setPanelOpen(false);
                  }}
                  loading={newsLoading}
                />
              ) : mode === "catchup" ? (
                <CatchupFeed
                  articles={feedLayoutArticles}
                  selectedId={selected?.id ?? null}
                  onSelect={(art) => {
                    setSelected(art);
                    setReaderArticle(art);
                    setPanelOpen(false);
                  }}
                  loading={newsLoading}
                />
              ) : mode === "relax" ? (
                <RelaxFeed
                  articles={feedLayoutArticles}
                  selectedId={selected?.id ?? null}
                  onSelect={(art) => {
                    setSelected(art);
                    setReaderArticle(art);
                    setPanelOpen(false);
                  }}
                  loading={newsLoading}
                />
              ) : (
                <ForYouFeed
                  articles={feedLayoutArticles}
                  selectedId={selected?.id ?? null}
                  onSelect={(art) => {
                    setSelected(art);
                    setReaderArticle(art);
                    setPanelOpen(false);
                  }}
                  loading={newsLoading}
                />
              )}
            </PullToRefresh>

            <BottomNav active="you" />
          </>
        )}

        <ListenNowPlayingChip
          articles={articles}
          onOpenArticle={(art) => {
            setSelected(art);
            setReaderArticle(art);
            setPanelOpen(false);
          }}
        />

        <CatchMeUpPanel
          open={panelOpen}
          onClose={() => {
            setPanelOpen(false);
            setVoiceActive(false);
          }}
          mode={mode}
          status={panelStatus}
          errorMessage={summaryError}
          data={summary}
          readingTimeMinutes={readingTime}
          onReadingTimeChange={setReadingTime}
          articleFullMinutes={briefingArticleFullMinutes}
          question={question}
          onQuestionChange={setQuestion}
          voiceActive={voiceActive}
          onVoiceActiveChange={(active) => {
            setVoiceActive(active);
            setPanelOpen(true);
          }}
          onVoiceTranscript={handleVoiceCommand}
          recommendations={assistantRecommendations}
          recommendationsTitle={assistantRecommendationsTitle}
          onOpenRecommendation={(art) => {
            setSelected(art);
            setReaderArticle(art);
            setPanelOpen(false);
            setVoiceActive(false);
          }}
        />
      </div>
    </PhoneFrame>
  );
}
