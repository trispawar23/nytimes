"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { articleDragProps } from "@/lib/article-dnd";
import {
  articleBodyReadingMinutesForLayout,
  articleDisplayBody,
} from "@/lib/reading-stats";
import type {
  Article,
  CatchupBriefApiResult,
  CatchupBriefResponse,
} from "@/lib/types";
import { FeedListenPlayButton } from "./FeedListenPlayButton";
import { SafeArticleImage } from "./SafeArticleImage";

const CARD_SHADOW =
  "shadow-[1px_1px_7.3px_rgba(121,121,121,0.25)]" as const;

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function heroSnippet(a: Article): string {
  const d = a.description.trim();
  if (d.length >= 40) return d;
  const c = a.content.trim();
  if (c.length >= 40) return c.slice(0, 420).trim();
  return d || c || a.title;
}

function useCatchupBrief(article: Article | null, enabled: boolean) {
  const [brief, setBrief] = useState<CatchupBriefResponse | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  useEffect(() => {
    if (!article || !enabled) {
      setBrief(null);
      setBriefError(null);
      setBriefLoading(false);
      return;
    }

    const body = articleDisplayBody(article);
    if (body.length < 120) {
      setBrief(null);
      setBriefError(null);
      setBriefLoading(false);
      return;
    }

    const ac = new AbortController();
    setBriefLoading(true);
    setBriefError(null);

    void (async () => {
      try {
        const res = await fetch("/api/catchup-brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: article.title,
            body: body.slice(0, 14_000),
          }),
          signal: ac.signal,
        });
        const json = (await res.json()) as CatchupBriefApiResult;
        if (ac.signal.aborted) return;
        if (!json.ok) {
          setBrief(null);
          setBriefError(json.error ?? "Could not load highlights.");
          return;
        }
        setBrief(json.data);
      } catch {
        if (ac.signal.aborted) return;
        setBrief(null);
        setBriefError("Network error while loading highlights.");
      } finally {
        if (!ac.signal.aborted) setBriefLoading(false);
      }
    })();

    return () => ac.abort();
  }, [article, enabled]);

  return { brief, briefLoading, briefError };
}

function CatchupSaveChip() {
  return (
    <span
      className="flex size-6 shrink-0 items-center justify-center"
      aria-hidden
    >
      <span className="flex size-[21px] items-center justify-center rounded-full bg-[#EAEAEA]">
        <Plus className="size-3 text-black" strokeWidth={2.5} />
      </span>
    </span>
  );
}

function CatchupReadRow({
  article,
  minutes,
}: {
  article: Article;
  minutes: number;
}) {
  const m = Math.max(1, Math.round(minutes));
  return (
    <div className="inline-flex items-center gap-[9px]">
      <FeedListenPlayButton article={article} tone="afy" />
      <span className="font-sans text-[8px] font-normal uppercase leading-normal text-[#7F7F7F]">
        {m} MIN READ
      </span>
    </div>
  );
}

/** Key Highlights: title + two visually separated blocks (reference uses &lt;br/&gt; between points). */
function KeyHighlightsBlock({
  brief,
  loading,
  error,
}: {
  brief: CatchupBriefResponse | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <p className="font-sans text-[11px] text-[#7F7F7F]">
        Generating highlights…
      </p>
    );
  }
  if (error) {
    return (
      <p className="font-sans text-[11px] leading-snug text-amber-900">
        {error}
      </p>
    );
  }
  if (!brief) return null;

  return (
    <div className="flex w-full flex-col gap-[5px]">
      {brief.one_liner.trim() ? (
        <p className="w-full font-serif text-[12px] font-normal italic leading-relaxed text-[#5F5E5E]">
          {brief.one_liner.trim()}
        </p>
      ) : null}
      <p className="w-full font-sans text-[14px] font-medium leading-snug text-black">
        Key Highlights
      </p>
      <div className="flex w-full flex-col gap-4">
        {brief.key_points.map((point, i) => (
          <p
            key={i}
            className="w-full whitespace-pre-line font-serif text-[12px] font-normal leading-relaxed text-[#5F5E5E]"
          >
            {point.trim()}
          </p>
        ))}
      </div>
      {brief.limitations.trim() ? (
        <p className="mt-1 font-sans text-[10px] leading-snug text-[#9a9a9a]">
          {brief.limitations.trim()}
        </p>
      ) : null}
    </div>
  );
}

function ReadFullArticleLink({
  onPress,
}: {
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onPress();
      }}
      className="group mt-1 w-full border-t border-[#E8E8E8] pt-3 text-left font-sans text-[11px] font-medium tracking-[0.02em] text-[#7F7F7F] transition-colors hover:text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-black/15"
    >
      <span className="border-b border-transparent pb-px group-hover:border-[#7F7F7F] group-hover:text-black">
        Read full article
      </span>
    </button>
  );
}

type Props = {
  articles: Article[];
  selectedId: string | null;
  onSelect: (a: Article) => void;
  loading: boolean;
};

export function CatchupFeed({
  articles,
  selectedId,
  onSelect,
  loading,
}: Props) {
  const shell = "w-full min-w-0 px-4";

  const hero = articles[0];
  /** Show every article the feed returned beyond the hero; one expanded at a time keeps brief fetches bounded. */
  const secondary = articles.slice(1);

  const heroBrief = useCatchupBrief(hero, !!hero && !loading);

  /** Top story uses the same compact ↔ expanded interaction as rows below. */
  const [heroExpanded, setHeroExpanded] = useState(true);

  const [expandedSecondaryId, setExpandedSecondaryId] = useState<
    string | null
  >(null);
  const expandedSecondary =
    secondary.find((a) => a.id === expandedSecondaryId) ?? null;
  const secondaryBrief = useCatchupBrief(
    expandedSecondary,
    !!expandedSecondary,
  );

  if (loading) {
    return (
      <div className={`${shell} space-y-4 pb-28 pt-3`}>
        <div className="mx-auto h-[480px] max-w-[365px] animate-pulse rounded-sm bg-[#e8e8e8]" />
      </div>
    );
  }

  if (!hero) {
    return (
      <div className={`${shell} pb-28 pt-6 text-center`}>
        <p className="font-sans text-sm font-bold text-black">
          Nothing in this feed yet
        </p>
      </div>
    );
  }

  const heroMinutes = articleBodyReadingMinutesForLayout(hero);

  return (
    <div className={`flex min-w-0 flex-col gap-[10px] pb-28 pt-3 ${shell}`}>
      {/* Hero card — tap toggles condensed row vs full card; reader opens via link only */}
      {heroExpanded ? (
        <div
          role="region"
          aria-label={hero.title}
          {...articleDragProps(hero.id)}
          className={`mx-auto flex w-[365px] max-w-full shrink-0 cursor-grab flex-col gap-[10px] rounded-sm bg-white p-[10px] text-left ${CARD_SHADOW} active:cursor-grabbing`}
          onClick={() => setHeroExpanded(false)}
        >
          <div className="flex w-full cursor-pointer flex-col items-start gap-[10px] text-left">
            <div className="inline-flex w-full items-start gap-[10px]">
              <p className="min-w-0 flex-1 break-words font-serif text-[20px] font-normal leading-snug text-black">
                {hero.title}
              </p>
              <CatchupSaveChip />
            </div>
            <p className="w-full font-sans text-[8px] font-normal leading-normal text-[#7F7F7F]">
              {formatLongDate(hero.publishedAt)}
            </p>
          </div>

          <div
            className="flex w-full flex-col items-start gap-[10px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="inline-flex w-full items-center justify-center">
              <SafeArticleImage
                remoteUrl={hero.imageUrl}
                alt=""
                className="aspect-square w-full max-w-[345px] overflow-hidden bg-[#eee]"
                imgClassName="h-full w-full object-cover"
              />
            </div>

            <div className="flex w-full flex-col items-start gap-[10px]">
              <p className="w-full break-words font-serif text-[12px] font-normal leading-relaxed text-[#5F5E5E]">
                {heroSnippet(hero)}
              </p>
              <CatchupReadRow article={hero} minutes={heroMinutes} />
              <KeyHighlightsBlock
                brief={heroBrief.brief}
                loading={heroBrief.briefLoading}
                error={heroBrief.briefError}
              />
            </div>
          </div>

          <div onClick={(e) => e.stopPropagation()}>
            <ReadFullArticleLink onPress={() => onSelect(hero)} />
          </div>
        </div>
      ) : (
        <button
          type="button"
          {...articleDragProps(hero.id)}
          aria-expanded={false}
          aria-current={selectedId === hero.id ? "true" : undefined}
          onClick={() => setHeroExpanded(true)}
          className={`mx-auto inline-flex w-[365px] max-w-full shrink-0 cursor-grab items-center gap-[10px] rounded-sm bg-white p-[10px] text-left ${CARD_SHADOW} focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 active:cursor-grabbing`}
        >
          <div className="flex shrink-0 flex-col gap-[10px]">
            <SafeArticleImage
              remoteUrl={hero.imageUrl}
              alt=""
              className="relative size-[111px] shrink-0 overflow-hidden bg-[#eee]"
              imgClassName="h-full w-full object-cover"
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-start justify-end gap-[10px]">
            <div className="inline-flex w-full items-start gap-[10px]">
              <p className="min-w-0 flex-1 break-words font-serif text-[20px] font-normal leading-snug text-black">
                {hero.title}
              </p>
              <CatchupSaveChip />
            </div>
            <p className="font-sans text-[8px] font-normal leading-normal text-[#7F7F7F]">
              {formatLongDate(hero.publishedAt)}
            </p>
          </div>
        </button>
      )}

      {/* Secondary: compact ↔ expanded */}
      {secondary.length > 0 ? (
        <div className="flex w-full max-w-[365px] flex-col gap-[10px] self-center">
          {secondary.map((a) => {
            const isExpanded = expandedSecondaryId === a.id;
            const minutes = articleBodyReadingMinutesForLayout(a);

            if (!isExpanded) {
              return (
                <button
                  key={a.id}
                  type="button"
                  {...articleDragProps(a.id)}
                  onClick={() => setExpandedSecondaryId(a.id)}
                  aria-expanded={false}
                  className={`inline-flex w-full cursor-grab items-center gap-[10px] rounded-sm bg-white p-[10px] text-left ${CARD_SHADOW} focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 active:cursor-grabbing`}
                >
                  <div className="flex shrink-0 flex-col gap-[10px]">
                    <SafeArticleImage
                      remoteUrl={a.imageUrl}
                      alt=""
                      className="relative size-[111px] shrink-0 overflow-hidden bg-[#eee]"
                      imgClassName="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col items-start justify-end gap-[10px]">
                    <div className="inline-flex w-full items-start gap-[10px]">
                      <p className="min-w-0 flex-1 break-words font-serif text-[20px] font-normal leading-snug text-black">
                        {a.title}
                      </p>
                      <CatchupSaveChip />
                    </div>
                    <p className="font-sans text-[8px] font-normal leading-normal text-[#7F7F7F]">
                      {formatLongDate(a.publishedAt)}
                    </p>
                  </div>
                </button>
              );
            }

            return (
              <div
                key={a.id}
                role="region"
                aria-label={a.title}
                {...articleDragProps(a.id)}
                className={`flex w-full cursor-grab flex-col gap-[10px] rounded-sm bg-white p-[10px] ${CARD_SHADOW} active:cursor-grabbing`}
                onClick={() => setExpandedSecondaryId(null)}
              >
                <div className="flex w-full cursor-pointer flex-col items-start gap-[10px] text-left">
                  <div className="inline-flex w-full items-start gap-[10px]">
                    <p className="min-w-0 flex-1 break-words font-serif text-[20px] font-normal leading-snug text-black">
                      {a.title}
                    </p>
                    <CatchupSaveChip />
                  </div>
                  <p className="w-full font-sans text-[8px] font-normal leading-normal text-[#7F7F7F]">
                    {formatLongDate(a.publishedAt)}
                  </p>
                </div>

                <div
                  className="flex w-full flex-col items-start gap-[10px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="inline-flex w-full items-center justify-center">
                    <SafeArticleImage
                      remoteUrl={a.imageUrl}
                      alt=""
                      className="aspect-square w-full max-w-[345px] overflow-hidden bg-[#eee]"
                      imgClassName="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex w-full flex-col items-start gap-[10px]">
                    <p className="w-full break-words font-serif text-[12px] font-normal leading-relaxed text-[#5F5E5E]">
                      {heroSnippet(a)}
                    </p>
                    <CatchupReadRow article={a} minutes={minutes} />
                    <KeyHighlightsBlock
                      brief={secondaryBrief.brief}
                      loading={secondaryBrief.briefLoading}
                      error={secondaryBrief.briefError}
                    />
                  </div>
                </div>

                <div onClick={(e) => e.stopPropagation()}>
                  <ReadFullArticleLink onPress={() => onSelect(a)} />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
