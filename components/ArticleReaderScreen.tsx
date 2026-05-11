"use client";

import {
  ArrowUpRight,
  BatteryFull,
  ChevronLeft,
  Loader2,
  Mic,
  Wifi,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cleanArticleBodyForReader } from "@/lib/article-body-clean";
import {
  articleDisplayBody,
  articleReadRailStops,
  bodyParagraphs,
  readerBodyWordCount,
  readingMinutesFromWordCount,
  shouldTryFetchFullArticleText,
  trimRedundantOpenTitle,
} from "@/lib/reading-stats";
import type { Article, SummaryResponse } from "@/lib/types";
import type { PanelStatus } from "./CatchMeUpPanel";
import { ArticleReadTimeRail } from "./ArticleReadTimeRail";
import {
  buildArticleSpeechText,
  ListenToArticleBar,
} from "./ListenToArticleBar";
import { BottomNav } from "./BottomNav";
import { SafeArticleImage } from "./SafeArticleImage";

function StatusSignalBars() {
  const heightsPx = [3.5, 5.5, 8, 10.5];
  return (
    <span
      className="flex h-[13px] shrink-0 items-end gap-[2.5px] pb-px"
      aria-hidden
    >
      {heightsPx.map((h, i) => (
        <span
          key={i}
          className="w-[2.5px] shrink-0 rounded-[0.5px] bg-black"
          style={{ height: `${h}px` }}
        />
      ))}
    </span>
  );
}

function formatIosStatusTime(d: Date): string {
  let h = d.getHours() % 12;
  if (h === 0) h = 12;
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function useStatusClock() {
  const [label, setLabel] = useState(() => formatIosStatusTime(new Date()));
  useEffect(() => {
    const tick = () => setLabel(formatIosStatusTime(new Date()));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return label;
}

function formatKicker(category: string): string {
  const t = category.trim().replace(/[-_]+/g, " ");
  if (!t) return "NEWS";
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatArticleDate(iso: string): string {
  const d = new Date(iso);
  const dateStr = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
  return `${dateStr}   Updated ${timeStr}`;
}

/** Listen line matches the selected rail bucket (1 / 3 / 8 min → M:00). */
function listenLabelFromRailMinutes(minutes: number): string {
  const m = Math.max(1, Math.min(12, minutes));
  return `${m}:00 min`;
}

/**
 * Half-length reader layout (reference): beside hero image — smaller serif column,
 * then larger semibold serif; below a horizontal rule — full-width body paragraphs.
 */
function splitSummaryForReaderLayout(summary: string): {
  topSmall: string;
  topLarge: string;
  belowDivider: string[];
} {
  const t = summary.trim();
  const paras = t.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (paras.length >= 3) {
    return {
      topSmall: paras[0]!,
      topLarge: paras[1]!,
      belowDivider: paras.slice(2),
    };
  }
  if (paras.length === 2) {
    return {
      topSmall: paras[0]!,
      topLarge: paras[1]!,
      belowDivider: [],
    };
  }
  const sentences = t
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length <= 2) {
    return {
      topSmall: "",
      topLarge: t,
      belowDivider: [],
    };
  }
  if (sentences.length <= 5) {
    const mid = Math.max(1, Math.ceil(sentences.length / 2));
    return {
      topSmall: sentences.slice(0, mid).join(" "),
      topLarge: sentences.slice(mid).join(" "),
      belowDivider: [],
    };
  }
  const a = Math.max(1, Math.floor(sentences.length * 0.3));
  const b = Math.max(a + 1, Math.floor(sentences.length * 0.55));
  const rest = sentences.slice(b).join(" ");
  return {
    topSmall: sentences.slice(0, a).join(" "),
    topLarge: sentences.slice(a, b).join(" "),
    belowDivider: rest ? bodyParagraphs(rest) : [],
  };
}

/**
 * Full article body and inline summaries (1 min + half-length) — same size, color, and measure.
 * Matches `<article>` body paragraphs.
 */
const READER_ARTICLE_SERIF_CLASS =
  "whitespace-pre-wrap font-serif text-[18.49px] font-normal leading-[22.6px] text-[#4D4D4D]";

type Props = {
  article: Article;
  /** Other stories for rail modules (excludes `article` where possible). */
  feedArticles: Article[];
  readingTimeMinutes: number;
  /** Half-length brief when rail is on Medium (3 min); replaces article prose in-place. */
  readerMediumBrief: {
    status: PanelStatus;
    data: SummaryResponse | null;
    error?: string;
  };
  /** One-minute brief when rail is on Short (1 min). */
  readerShortBrief: {
    status: PanelStatus;
    data: SummaryResponse | null;
    error?: string;
  };
  onReadingTimeChange: (minutes: number) => void;
  /** Short (1 min) — same cleaned body as the reader for summarization. */
  onShortReadSelected?: (displayBodyForSummary: string) => void;
  /** Medium (3 min) — pass same cleaned body shown in the reader (includes full fetch when loaded). */
  onMediumReadSelected?: (displayBodyForSummary: string) => void;
  onClose: () => void;
  onMicPress: () => void;
  onSelectRelated: (a: Article) => void;
};

export function ArticleReaderScreen({
  article,
  feedArticles,
  readingTimeMinutes,
  readerMediumBrief,
  readerShortBrief,
  onReadingTimeChange,
  onShortReadSelected,
  onMediumReadSelected,
  onClose,
  onMicPress,
  onSelectRelated,
}: Props) {
  const statusTime = useStatusClock();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [readStop, setReadStop] = useState<number>(readingTimeMinutes);

  const mergedLocalBody = useMemo(() => articleDisplayBody(article), [article]);
  const [fetchedFullText, setFetchedFullText] = useState<string | null>(null);
  const [fullFetchState, setFullFetchState] = useState<
    "idle" | "loading" | "ok" | "error" | "skipped"
  >("idle");
  const [fullFetchHint, setFullFetchHint] = useState<string | null>(null);

  const articleUrl = article.url.trim();

  useEffect(() => {
    setFetchedFullText(null);
    setFullFetchHint(null);
    setFullFetchState("idle");
    if (!shouldTryFetchFullArticleText(articleUrl, mergedLocalBody)) {
      setFullFetchState("skipped");
      return;
    }

    const ac = new AbortController();
    setFullFetchState("loading");
    void (async () => {
      try {
        const res = await fetch(
          `/api/article-read?url=${encodeURIComponent(articleUrl)}`,
          { signal: ac.signal, cache: "no-store" },
        );
        const json = (await res.json()) as {
          ok?: boolean;
          text?: string;
          error?: string;
          hint?: string;
        };
        if (!json.ok || typeof json.text !== "string") {
          setFullFetchHint(
            typeof json.hint === "string" && json.hint.trim()
              ? json.hint.trim()
              : "Could not load full text in-app. Use the link below to read on the publisher’s site.",
          );
          setFullFetchState("error");
          return;
        }
        const t = json.text.trim();
        if (t.length < 120) {
          setFullFetchHint(
            typeof json.hint === "string" && json.hint.trim()
              ? json.hint.trim()
              : "The extracted text was too short—likely a paywall or blocking page.",
          );
          setFullFetchState("error");
          return;
        }
        setFetchedFullText(t);
        setFullFetchState("ok");
      } catch {
        if (ac.signal.aborted) return;
        setFullFetchHint(
          "Network error while fetching the article. Try again or open the publisher link.",
        );
        setFullFetchState("error");
      }
    })();

    return () => ac.abort();
  }, [article.id, articleUrl, mergedLocalBody]);

  const displayBody = useMemo(() => {
    const raw = fetchedFullText ?? mergedLocalBody;
    const trimmed = trimRedundantOpenTitle(raw, article.title);
    let cleaned = cleanArticleBodyForReader(trimmed, article.title);
    if (!cleaned.trim() && trimmed.trim().length >= 60) {
      cleaned = trimmed.trim();
    }
    if (!cleaned.trim()) {
      const snippet = mergedLocalBody.trim() || article.description.trim();
      cleaned = snippet
        ? cleanArticleBodyForReader(snippet, article.title)
        : "";
    }
    if (!cleaned.trim()) {
      cleaned = article.description.trim() || article.title.trim();
    }
    return cleaned;
  }, [
    fetchedFullText,
    mergedLocalBody,
    article.title,
    article.description,
  ]);

  const [articleGist, setArticleGist] = useState<string | null>(null);
  const [gistLoading, setGistLoading] = useState(false);
  const gistRequestGenRef = useRef(0);

  useEffect(() => {
    const gen = ++gistRequestGenRef.current;
    setArticleGist(null);
    const text = displayBody.trim();
    if (readStop === 3 || readStop === 1) {
      setGistLoading(false);
      return;
    }
    if (text.length < 80) {
      setGistLoading(false);
      return;
    }

    setGistLoading(true);
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/article-gist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: article.title,
              body: text.slice(0, 14_000),
            }),
            signal: ac.signal,
          });
          const json = (await res.json()) as {
            ok?: boolean;
            gist?: string;
          };
          if (gistRequestGenRef.current !== gen || ac.signal.aborted) return;
          if (json.ok && typeof json.gist === "string" && json.gist.trim()) {
            setArticleGist(json.gist.trim());
          }
        } catch {
          /* aborted or network */
        } finally {
          if (gistRequestGenRef.current === gen && !ac.signal.aborted) {
            setGistLoading(false);
          }
        }
      })();
    }, 380);

    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [article.id, article.title, displayBody, readStop]);

  const dekSubtitle = articleGist ?? article.description;

  const others = useMemo(
    () => feedArticles.filter((a) => a.id !== article.id),
    [feedArticles, article.id],
  );

  const popPick = others.slice(0, 3);
  const trendPick = others.slice(3, 6);

  const bodyParas = useMemo(() => bodyParagraphs(displayBody), [displayBody]);
  const wordCount = useMemo(
    () => readerBodyWordCount(displayBody),
    [displayBody],
  );

  const speechTextForListen = useMemo(
    () => buildArticleSpeechText(article.title, displayBody),
    [article.title, displayBody],
  );

  /**
   * Rail's Full stop = the actual article's estimated read time (clamped
   * to ≥ 4 min so it stays above the Medium stop, and ≤ summarize cap).
   */
  const fullArticleMinutes = useMemo(
    () => readingMinutesFromWordCount(wordCount),
    [wordCount],
  );
  const railStops = useMemo(
    () => articleReadRailStops(fullArticleMinutes),
    [fullArticleMinutes],
  );

  const fullReadStop = railStops[2];

  /** Open article on the rightmost rail stop (full estimated read), and refresh when body length changes. */
  useLayoutEffect(() => {
    setReadStop(fullReadStop);
    onReadingTimeChange(fullReadStop);
  }, [article.id, fullReadStop, onReadingTimeChange]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
  }, [article.id]);

  const kicker = formatKicker(article.category);
  const authorLine = article.author?.trim() || article.source;
  const listenDur = listenLabelFromRailMinutes(readStop);

  const hl = readStop === 3;
  const oneMin = readStop === 1;
  const mb = readerMediumBrief;
  const om = readerShortBrief;
  const summarySplit = useMemo(() => {
    if (!hl) return null;
    const s = mb.data?.summary?.trim();
    if (!s) return null;
    return splitSummaryForReaderLayout(s);
  }, [hl, mb.data?.summary]);

  const summaryWordCount = useMemo(() => {
    const s = mb.data?.summary?.trim();
    if (!s) return 0;
    return s.split(/\s+/).filter(Boolean).length;
  }, [mb.data?.summary]);

  const omSummaryParas = useMemo(() => {
    const s = om.data?.summary?.trim();
    if (!s) return [];
    return s.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  }, [om.data?.summary]);

  const omSummaryWordCount = useMemo(() => {
    const s = om.data?.summary?.trim();
    if (!s) return 0;
    return s.split(/\s+/).filter(Boolean).length;
  }, [om.data?.summary]);

  const hlSummaryReady =
    hl &&
    summarySplit &&
    (mb.status === "success" || mb.status === "low_confidence");

  const omSummaryReady =
    oneMin &&
    omSummaryParas.length > 0 &&
    (om.status === "success" || om.status === "low_confidence");

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-white">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
      >
        <header className="sticky top-0 z-30 bg-white shadow-[0_1px_0_rgba(0,0,0,0.06)]">
          <div
            className="flex w-full min-w-0 items-center justify-between px-[19.52px] pb-2 text-black"
            style={{
              paddingTop: "max(10px, calc(env(safe-area-inset-top, 0px) + 8px))",
            }}
          >
            <div className="flex min-w-0 shrink-0 items-center gap-[4px]">
              <span className="whitespace-nowrap text-center font-['SF_Pro_Text',system-ui,sans-serif] text-[16.67px] font-semibold leading-none tabular-nums text-black">
                {statusTime}
              </span>
              <ArrowUpRight
                className="h-[12px] w-[12px] shrink-0 stroke-black text-black"
                strokeWidth={2.75}
                aria-hidden
              />
            </div>
            <div className="flex shrink-0 items-center gap-[6px] text-black" aria-hidden>
              <StatusSignalBars />
              <Wifi className="h-[14px] w-[14px] shrink-0" strokeWidth={2} />
              <BatteryFull
                className="h-[12px] w-[22px] shrink-0 fill-black stroke-black"
                strokeWidth={1.25}
              />
            </div>
          </div>
          <div className="flex px-[16.44px] pb-2 pt-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to feed"
              className="flex items-center gap-1 rounded-md font-sans text-[12px] font-medium text-black hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
            >
              <ChevronLeft className="size-5" strokeWidth={2} aria-hidden />
              Back
            </button>
          </div>
        </header>

        <div className="px-[16.44px] pb-6">
          <div className="relative mx-auto flex w-full max-w-[380.12px] flex-col items-start gap-[15.41px]">
            <div className="flex w-full flex-col items-start gap-[15.41px]">
              <p className="font-sans text-[12.33px] font-medium leading-normal text-black">
                {kicker}
              </p>
              <div className="relative w-full self-stretch">
                <h1 className="text-pretty pr-[48px] text-left font-serif text-[24.66px] font-bold italic leading-tight text-black">
                  {article.title}
                </h1>
                <button
                  type="button"
                  onClick={onMicPress}
                  className="absolute right-0 top-0 flex size-[41px] shrink-0 items-center justify-center rounded-[20.55px] bg-black text-white shadow-[2.055px_2.055px_3.596px_rgba(0,0,0,0.21)] focus:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
                  aria-label="Voice briefing"
                >
                  <Mic
                    className="size-[23px] stroke-white text-white"
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>
              </div>
            </div>
            {!(hl || oneMin) ? (
              <p
                className="w-full text-left font-serif text-[18.49px] font-normal leading-[22.6px] text-[#4D4D4D]"
                aria-busy={gistLoading && !articleGist ? true : undefined}
              >
                {dekSubtitle}
                {gistLoading && !articleGist ? (
                  <span className="font-sans text-[12px] font-normal text-[#a3a3a3]">
                    {" "}
                    · Summarizing…
                  </span>
                ) : null}
              </p>
            ) : null}
            <ArticleReadTimeRail
              stops={railStops}
              value={readStop}
              onChange={(m) => {
                setReadStop(m);
                onReadingTimeChange(m);
                if (m === 1) {
                  onShortReadSelected?.(displayBody);
                }
                if (m === 3) {
                  onMediumReadSelected?.(displayBody);
                }
              }}
            />
            <ListenToArticleBar
              playbackKey={article.id}
              thumbnailUrl={article.imageUrl}
              speechText={speechTextForListen}
              durationLabel={listenDur}
            />
          </div>

          {!(hl || oneMin) ? (
            <div className="mx-auto mt-[10px] flex w-full max-w-[380px] flex-col gap-[10px]">
              <div className="w-full overflow-hidden bg-[#f4f4f4]">
                <SafeArticleImage
                  remoteUrl={article.imageUrl}
                  alt=""
                  className="relative aspect-[413/587] w-full"
                  imgClassName="h-full w-full object-cover"
                />
              </div>
              <p className="mt-[10px] font-serif text-[14.38px] font-normal leading-snug text-[#4D4D4D]">
                <span>{article.title}</span>
                {article.source.trim() ? (
                  <>
                    {" "}
                    <span className="font-sans text-[12.33px] text-[#4D4D4D]">
                      {article.source}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
          ) : hl ? (
            <div className="mx-auto mt-[14px] w-full max-w-[380px] space-y-6 px-[10px]">
              <div className="flow-root">
                <div className="float-left mr-[12px] mb-[10px] w-[209px] max-w-[46%]">
                  <div className="overflow-hidden bg-[#f4f4f4]">
                    <SafeArticleImage
                      remoteUrl={article.imageUrl}
                      alt=""
                      className="relative aspect-[209/297] w-full"
                      imgClassName="h-full w-full object-cover"
                    />
                  </div>
                  <p className="mt-[10px] font-serif text-[14.38px] font-normal leading-snug text-[#4D4D4D]">
                    <span>{article.title}</span>
                    {article.source.trim() ? (
                      <>
                        {" "}
                        <span className="font-sans text-[12.33px] text-[#4D4D4D]">
                          {article.source}
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="min-w-0 space-y-6">
                  {hlSummaryReady && summarySplit ? (
                    <>
                      {summarySplit.topSmall.trim() ? (
                        <p className={READER_ARTICLE_SERIF_CLASS}>
                          {summarySplit.topSmall}
                        </p>
                      ) : null}
                      <p className={READER_ARTICLE_SERIF_CLASS}>
                        {summarySplit.topLarge}
                      </p>
                    </>
                  ) : mb.status === "loading" ? (
                    <p className="inline-flex items-center gap-2 font-serif text-[18.49px] text-[#6b6b6b]">
                      <Loader2
                        className="size-4 shrink-0 animate-spin text-neutral-500"
                        aria-hidden
                      />
                      Summarizing…
                    </p>
                  ) : mb.status === "error" ? (
                    <p className="font-sans text-[14px] leading-snug text-red-800">
                      {mb.error ?? "Could not summarize this article."}
                    </p>
                  ) : mb.status === "insufficient_source" ? (
                    <p className="font-sans text-[14px] leading-snug text-amber-950">
                      {mb.error ??
                        "The article text available here is too short for a reliable summary."}
                    </p>
                  ) : (
                    <p className={READER_ARTICLE_SERIF_CLASS}>{dekSubtitle}</p>
                  )}
                </div>
              </div>

              {hlSummaryReady &&
              summarySplit &&
              summarySplit.belowDivider.length > 0 ? (
                <div className="space-y-6">
                  {summarySplit.belowDivider.map((para, i) => (
                    <p key={i} className={READER_ARTICLE_SERIF_CLASS}>
                      {para}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mx-auto mt-[14px] flex w-full max-w-[413px] flex-col items-center gap-[10.27px] px-[10px]">
              <div className="flex w-full max-w-[390px] flex-col items-center gap-[10.27px] p-[10.27px]">
                {omSummaryReady ? (
                  <>
                    {omSummaryParas.map((para, i) => (
                      <p key={i} className={`w-full self-stretch ${READER_ARTICLE_SERIF_CLASS}`}>
                        {para}
                      </p>
                    ))}
                    {om.data?.key_takeaway?.trim() ? (
                      <p
                        className={`w-full self-stretch ${READER_ARTICLE_SERIF_CLASS} mt-[2px]`}
                      >
                        {om.data.key_takeaway.trim()}
                      </p>
                    ) : null}
                  </>
                ) : om.status === "loading" ? (
                  <p className="inline-flex w-full items-center gap-2 font-serif text-[18.49px] text-[#6b6b6b]">
                    <Loader2
                      className="size-4 shrink-0 animate-spin text-neutral-500"
                      aria-hidden
                    />
                    Summarizing…
                  </p>
                ) : om.status === "error" ? (
                  <p className="w-full font-sans text-[14px] leading-snug text-red-800">
                    {om.error ?? "Could not summarize this article."}
                  </p>
                ) : om.status === "insufficient_source" ? (
                  <p className="w-full font-sans text-[14px] leading-snug text-amber-950">
                    {om.error ??
                      "The article text available here is too short for a reliable summary."}
                  </p>
                ) : (
                  <p className={`w-full ${READER_ARTICLE_SERIF_CLASS}`}>{dekSubtitle}</p>
                )}

                <div className="flex w-full max-w-[380.12px] flex-col items-start gap-[10.27px]">
                  <div className="flex w-full items-start justify-center gap-[1.03px]">
                    <div className="size-[50.34px] shrink-0 overflow-hidden rounded-full bg-[#e8e8e8]" />
                    <div className="min-w-0 flex-1 px-[10.27px] py-[10.27px]">
                      <p className="font-sans text-[12.33px] font-bold leading-[18.49px] text-black underline">
                        By {authorLine}
                      </p>
                      <p className="mt-[10.27px] font-sans text-[12.33px] font-normal leading-[18.49px] text-[#4D4D4D]">
                        Coverage from {article.source}. This demo uses aggregated
                        headlines; attributions may differ from the full Times
                        presentation.
                      </p>
                    </div>
                  </div>
                  <p className="w-full font-sans text-[10.27px] font-normal leading-[18.49px] text-[#4D4D4D]">
                    {formatArticleDate(article.publishedAt)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {!(hl || oneMin) ? (
            <div className="mx-auto mt-6 flex w-full max-w-[380px] flex-col gap-[10px]">
              <div className="flex items-start gap-[10px]">
                <div className="size-[50px] shrink-0 overflow-hidden rounded-full bg-[#e8e8e8]" />
                <div className="min-w-0 flex-1 rounded-[10px] p-[10px]">
                  <p className="font-sans text-[12.33px] font-bold leading-[18.49px] text-black underline">
                    By {authorLine}
                  </p>
                  <p className="mt-1 font-sans text-[12.33px] font-normal leading-[18.49px] text-[#4D4D4D]">
                    Coverage from {article.source}. This demo uses aggregated
                    headlines; attributions may differ from the full Times
                    presentation.
                  </p>
                </div>
              </div>
              <p className="font-sans text-[10.27px] font-normal leading-[18.49px] text-[#4D4D4D]">
                {formatArticleDate(article.publishedAt)}
              </p>
            </div>
          ) : null}

          <div className="mx-auto mt-6 w-full max-w-[380px] border-t border-black/10 pt-6">
            {fullFetchState === "loading" ? (
              <p className="mb-4 px-[10px] font-sans text-[12px] text-[#6b6b6b]">
                Loading full article…
              </p>
            ) : null}
            {fullFetchState === "error" ? (
              <p className="mb-4 px-[10px] font-sans text-[12px] leading-snug text-[#6b6b6b]">
                {fullFetchHint ??
                  "Could not load full text in-app. Use the link below to read on the publisher’s site."}
              </p>
            ) : null}
            <article className="space-y-6 px-[10px]">
              {(hl &&
                (mb.status === "error" || mb.status === "insufficient_source")) ||
              (oneMin &&
                (om.status === "error" || om.status === "insufficient_source")) ? (
                <p className="font-serif text-[18.49px] font-normal leading-[22.6px] text-[#6b6b6b]">
                  {oneMin
                    ? "Switch to Medium or Full read to see the original article text."
                    : "Switch to Short or Full read to see the original article text."}
                </p>
              ) : hl &&
                summarySplit &&
                (mb.status === "success" || mb.status === "low_confidence") ? (
                <>
                  {mb.status === "low_confidence" && mb.data ? (
                    <p className="font-sans text-[11px] leading-snug text-amber-900">
                      Low confidence ({Math.round(mb.data.confidence * 100)}
                      %). Treat this summary as directional.
                    </p>
                  ) : null}
                  {mb.data?.limitations ? (
                    <p className="border-t border-black/10 pt-4 font-sans text-[10.27px] leading-relaxed text-[#6b6b6b]">
                      {mb.data.limitations}
                    </p>
                  ) : null}
                </>
              ) : oneMin && omSummaryReady && om.data ? (
                <>
                  {om.status === "low_confidence" ? (
                    <p className="font-sans text-[11px] leading-snug text-amber-900">
                      Low confidence ({Math.round(om.data.confidence * 100)}
                      %). Treat this summary as directional.
                    </p>
                  ) : null}
                  {om.data.limitations ? (
                    <p className="border-t border-black/10 pt-4 font-sans text-[10.27px] leading-relaxed text-[#6b6b6b]">
                      {om.data.limitations}
                    </p>
                  ) : null}
                </>
              ) : bodyParas.length > 0 ? (
                bodyParas.map((para, i) => (
                  <p key={i} className={READER_ARTICLE_SERIF_CLASS}>
                    {para}
                  </p>
                ))
              ) : fullFetchState === "loading" ? (
                <p className="font-serif text-[18.49px] font-normal leading-[22.6px] text-[#a3a3a3]">
                  …
                </p>
              ) : (
                <p className="font-serif text-[18.49px] font-normal leading-[22.6px] text-[#4D4D4D]">
                  No article body is in the feed for this item yet.
                </p>
              )}
            </article>
            {hl && !oneMin ? (
              <div className="mx-auto mt-8 flex w-full max-w-[380px] flex-col gap-[10px] px-[10px]">
                <div className="flex items-start gap-[10px]">
                  <div className="size-[50px] shrink-0 overflow-hidden rounded-full bg-[#e8e8e8]" />
                  <div className="min-w-0 flex-1 rounded-[10px] py-[10px]">
                    <p className="font-sans text-[12.33px] font-bold leading-[18.49px] text-black underline">
                      By {authorLine}
                    </p>
                    <p className="mt-1 font-sans text-[12.33px] font-normal leading-[18.49px] text-[#4D4D4D]">
                      Coverage from {article.source}. This demo uses aggregated
                      headlines; attributions may differ from the full Times
                      presentation.
                    </p>
                  </div>
                </div>
                <p className="font-sans text-[10.27px] font-normal leading-[18.49px] text-[#4D4D4D]">
                  {formatArticleDate(article.publishedAt)}
                </p>
              </div>
            ) : null}
            <p className="mt-6 px-[10px] font-sans text-[12.33px] leading-snug text-[#4D4D4D]">
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-black underline underline-offset-2 hover:opacity-80"
              >
                Read on {article.source}
              </a>
              {hl && summaryWordCount > 0 ? (
                <span className="text-[#6b6b6b]">
                  {" "}
                  · ~{summaryWordCount.toLocaleString()} words (summary)
                </span>
              ) : oneMin && omSummaryWordCount > 0 ? (
                <span className="text-[#6b6b6b]">
                  {" "}
                  · ~{omSummaryWordCount.toLocaleString()} words (summary)
                </span>
              ) : wordCount > 0 ? (
                <span className="text-[#6b6b6b]">
                  {" "}
                  · {wordCount.toLocaleString()} words
                </span>
              ) : null}
            </p>
          </div>

          <section className="mx-auto mt-8 w-full max-w-[380px] border-x-0 border-b-0 border-t border-black pt-[10.27px] [border-top-width:1.027px]">
            <h2 className="border-b border-black/15 pb-3 font-serif text-[20.55px] font-bold text-black [border-bottom-width:1.027px]">
              Discover other articles
            </h2>
            <p className="mt-4 font-sans text-[16.44px] leading-[20.55px] text-[#373737]">
              Keep exploring stories from the feed—tap any headline below to open
              it in the reader.
            </p>
          </section>

          {popPick.length > 0 ? (
            <section className="mx-auto mt-6 w-full max-w-[380px] border-x-0 border-b-0 border-t border-black pt-[10.27px] [border-top-width:1.027px]">
              <h2 className="mb-4 font-sans text-[18.49px] font-bold text-[#121212]">
                Pop Culture
              </h2>
              <ul className="flex flex-col gap-4">
                {popPick.map((a, idx) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-[10px] text-left"
                      onClick={() => onSelectRelated(a)}
                    >
                      <SafeArticleImage
                        remoteUrl={a.imageUrl}
                        alt=""
                        className="relative size-[105px] shrink-0 overflow-hidden bg-[#eee]"
                        imgClassName="h-full w-full object-cover"
                      />
                      <span
                        className={`min-w-0 flex-1 font-serif text-[20.55px] font-normal leading-snug text-black ${
                          idx < 2 ? "underline" : ""
                        }`}
                      >
                        {a.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {trendPick.length > 0 ? (
            <section className="mx-auto mt-6 w-full max-w-[380px] border-x-0 border-b-0 border-t border-black pb-4 pt-[10.27px] [border-top-width:1.027px]">
              <h2 className="mb-4 font-sans text-[18.49px] font-bold text-[#121212]">
                Trending in The Times
              </h2>
              <ul className="flex flex-col gap-4">
                {trendPick.map((a, idx) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-[10px] text-left"
                      onClick={() => onSelectRelated(a)}
                    >
                      <SafeArticleImage
                        remoteUrl={a.imageUrl}
                        alt=""
                        className="relative size-[105px] shrink-0 overflow-hidden bg-[#eee]"
                        imgClassName="h-full w-full object-cover"
                      />
                      <span
                        className={`min-w-0 flex-1 font-serif text-[20.55px] font-normal leading-snug text-black ${
                          idx === 0 ? "underline" : ""
                        }`}
                      >
                        {a.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>

      <BottomNav
        active="you"
        onTabPress={(tab) => {
          if (tab === "home") onClose();
        }}
      />
    </div>
  );
}
