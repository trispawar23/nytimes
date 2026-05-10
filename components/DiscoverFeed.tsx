"use client";

import { ChevronRight, Plus } from "lucide-react";
import { articleDragProps } from "@/lib/article-dnd";
import { articleBodyReadingMinutesForLayout } from "@/lib/reading-stats";
import type { Article } from "@/lib/types";
import { FeedListenPlayButton } from "./FeedListenPlayButton";
import { SafeArticleImage } from "./SafeArticleImage";

const CARD_SHADOW =
  "shadow-[1px_1px_7.3px_rgba(121,121,121,0.25)]" as const;

function formatArticlesForYouDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortMonthDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function topicLabel(category: string): string {
  const t = category.trim().replace(/[-_]+/g, " ");
  if (!t) return "News";
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
}

function snippetForCard(a: Article): string {
  const d = a.description.trim();
  if (d.length >= 40) return d;
  const c = a.content.trim();
  if (c.length >= 40) return c.slice(0, 280).trim();
  return d || c || a.title;
}

/** Articles For You teaser + em dash outlet when not already present (Variant4 reference). */
function snippetForAfyCard(a: Article): string {
  const base = snippetForCard(a).trim();
  const src = a.source.trim();
  if (!src) return base;
  const lower = base.toLowerCase();
  const srcL = src.toLowerCase();
  if (
    lower.endsWith(srcL) ||
    lower.includes(`— ${srcL}`) ||
    lower.includes(`– ${srcL}`) ||
    lower.includes(`- ${srcL}`)
  ) {
    return base;
  }
  return `${base} — ${src}`;
}

/** 24×24 tap target; 21×21 #EAEAEA circle + plus (Figma Variant4). */
function SaveChip() {
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

/** Articles For You — black square play (listen) + grey “N MIN”. */
function AfyReadTimeRow({
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
      <span className="font-sans text-[8px] font-normal uppercase leading-normal tracking-normal text-[#7F7F7F]">
        {m} min
      </span>
    </div>
  );
}

type Props = {
  articles: Article[];
  selectedId: string | null;
  onSelect: (a: Article) => void;
  loading: boolean;
};

export function DiscoverFeed({
  articles,
  selectedId,
  onSelect,
  loading,
}: Props) {
  const shell = "w-full min-w-0 px-4";

  if (loading) {
    return (
      <div className={`${shell} space-y-5 pb-8 pt-3`}>
        <div className="h-4 w-40 animate-pulse rounded bg-[#e4e4e4]" />
        <div className="h-[229px] w-[360px] max-w-full animate-pulse rounded bg-[#e4e4e4]" />
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className={`${shell} pb-8 pt-6 text-center`}>
        <p className="font-sans text-sm font-bold text-black">
          Nothing in this feed yet
        </p>
        <p className="mt-2 font-sans text-xs text-[#7F7F7F]">
          Pull to refresh or check your connection.
        </p>
      </div>
    );
  }

  const afy = articles.slice(0, 8);
  const trending = articles.slice(8, 10);
  const opinions = articles.slice(10, 12);
  const others = articles.slice(12, 14);

  return (
    <div className={`flex min-w-0 flex-col gap-5 pb-28 pt-3 ${shell}`}>
      {/* Articles For You — 360×229 cards: headline row + date, then 120×120 image | summary + play row */}
      <section className="flex w-full min-w-0 flex-col gap-[10px]">
        <h2 className="font-sans text-[14px] font-bold leading-normal text-black">
          Articles For You
        </h2>
        <div className="no-scrollbar -mx-1 flex items-stretch gap-[10px] overflow-x-auto px-1 pb-1">
          {afy.map((a) => (
            <div
              key={a.id}
              role="button"
              tabIndex={0}
              {...articleDragProps(a.id)}
              onClick={() => onSelect(a)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(a);
                }
              }}
              aria-current={selectedId === a.id ? "true" : undefined}
              className={`flex h-[229px] w-[360px] max-w-[calc(100vw-48px)] shrink-0 cursor-grab flex-col gap-[10px] rounded-sm bg-white p-[10px] text-left ${CARD_SHADOW} focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 active:cursor-grabbing`}
            >
              {/* Header: title row + date (alignSelf stretch in spec) */}
              <div className="flex w-full shrink-0 flex-col items-start justify-end gap-[10px]">
                <div className="inline-flex w-full items-start gap-[10px]">
                  <p className="min-w-0 flex-1 break-words text-left font-serif text-[20px] font-normal leading-snug text-black">
                    {a.title}
                  </p>
                  <SaveChip />
                </div>
                <p className="w-full text-left font-sans text-[8px] font-normal leading-normal text-[#7F7F7F]">
                  {formatArticlesForYouDate(a.publishedAt)}
                </p>
              </div>
              {/* Body: 120×120 image | column summary + read row, gap 10 */}
              <div className="inline-flex min-h-0 w-full flex-1 items-stretch gap-[10px]">
                <div className="flex shrink-0 items-center justify-center">
                  <SafeArticleImage
                    remoteUrl={a.imageUrl}
                    alt=""
                    className="relative size-[120px] shrink-0 overflow-hidden bg-[#eee]"
                    imgClassName="h-full w-full object-cover"
                  />
                </div>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col items-start justify-between gap-[10px]">
                  <p className="w-full break-words text-left font-serif text-[12px] font-normal leading-snug text-[#5F5E5E] line-clamp-5">
                    {snippetForAfyCard(a)}
                  </p>
                  <AfyReadTimeRow
                    article={a}
                    minutes={articleBodyReadingMinutesForLayout(a)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Trending topics */}
      {trending.length > 0 ? (
        <section className="flex w-full min-w-0 flex-col gap-2.5">
          <h2 className="font-sans text-sm font-bold leading-normal text-black">
            Trending topics
          </h2>
          <div className="flex w-full gap-2.5">
            {trending.map((a) => (
              <button
                key={a.id}
                type="button"
                {...articleDragProps(a.id)}
                onClick={() => onSelect(a)}
                aria-current={selectedId === a.id ? "true" : undefined}
                className={`flex min-h-[318px] min-w-0 cursor-grab flex-col justify-between bg-white p-2.5 text-left ${CARD_SHADOW} focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 active:cursor-grabbing ${
                  trending.length === 1 ? "w-full flex-none" : "flex-1"
                }`}
              >
                <div className="flex flex-col gap-2.5">
                  <SafeArticleImage
                    remoteUrl={a.imageUrl}
                    alt=""
                    className="relative mx-auto size-[180px] shrink-0 overflow-hidden bg-[#eee]"
                    imgClassName="h-full w-full object-cover"
                  />
                  <div className="flex w-full flex-col gap-2.5">
                    <div className="flex w-full items-start justify-end gap-2.5">
                      <p className="min-w-0 flex-1 break-words font-serif text-sm font-normal leading-snug text-black">
                        {a.title}
                      </p>
                      <SaveChip />
                    </div>
                    <p className="font-sans text-[8px] font-normal text-[#7F7F7F]">
                      {formatArticlesForYouDate(a.publishedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex w-full items-center justify-between pt-1">
                  <span className="font-sans text-xs font-medium text-black">
                    {topicLabel(a.category)}
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-black"
                    strokeWidth={2}
                    aria-hidden
                  />
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Find opinions — horizontal strip: 105×107 thumb + centered play, 150px text column, 16px between cards */}
      {opinions.length > 0 ? (
        <section className="flex w-full min-w-0 flex-col gap-[10px]">
          <h2 className="font-sans text-[14px] font-bold leading-normal text-black">
            Find opinions
          </h2>
          <div className="no-scrollbar -mx-1 flex items-stretch gap-4 overflow-x-auto px-1 pb-1">
            {opinions.map((a) => {
              const minutes = Math.max(
                1,
                Math.round(articleBodyReadingMinutesForLayout(a)),
              );
              return (
                <div
                  key={a.id}
                  {...articleDragProps(a.id)}
                  className={`w-[285px] shrink-0 cursor-grab bg-white p-[10px] text-left ${CARD_SHADOW} active:cursor-grabbing`}
                >
                  <div className="flex items-stretch gap-[10px]">
                    <div className="relative h-[107px] w-[105px] shrink-0 overflow-hidden bg-[#eee]">
                      <SafeArticleImage
                        remoteUrl={a.imageUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full"
                        imgClassName="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => onSelect(a)}
                        aria-current={
                          selectedId === a.id ? "true" : undefined
                        }
                        aria-label="Open article"
                        className="absolute inset-0 z-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
                      />
                      <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
                        <FeedListenPlayButton
                          article={a}
                          tone="dark"
                          className="pointer-events-auto"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelect(a)}
                      aria-current={
                        selectedId === a.id ? "true" : undefined
                      }
                      className="flex w-[150px] min-w-0 flex-col justify-between gap-1 self-stretch text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
                    >
                      <p className="break-words text-left font-serif text-[18px] font-normal leading-snug text-black">
                        {a.title}
                      </p>
                      <div className="flex w-full items-center justify-between font-sans text-[8px] font-normal leading-normal">
                        <span className="text-[#7F7F7F]">
                          {formatShortMonthDay(a.publishedAt)}
                        </span>
                        <span className="uppercase text-[#7F7F7F]">
                          {minutes} min
                        </span>
                      </div>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Discover what others are reading */}
      {others.length > 0 ? (
        <section className="flex w-full min-w-0 flex-col gap-2.5">
          <h2 className="font-sans text-sm font-bold text-black">
            Discover what others are reading
          </h2>
          <div className="no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
            {others.map((a) => (
              <button
                key={a.id}
                type="button"
                {...articleDragProps(a.id)}
                onClick={() => onSelect(a)}
                aria-current={selectedId === a.id ? "true" : undefined}
                className={`relative h-[296px] w-[246px] shrink-0 cursor-grab overflow-hidden bg-neutral-300 text-left ${CARD_SHADOW} focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:cursor-grabbing`}
              >
                <SafeArticleImage
                  remoteUrl={a.imageUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full"
                  imgClassName="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-2.5">
                  <p className="max-w-[233px] break-words font-serif text-[20px] font-normal leading-snug text-white">
                    {a.title}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
