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
        <div className="no-scrollbar -mx-1 flex min-w-0 w-full max-w-full touch-manipulation items-stretch gap-[10px] overflow-x-auto overscroll-x-contain px-1 pb-1">
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
              className={`flex h-[229px] w-[360px] max-w-full shrink-0 cursor-grab flex-col gap-[10px] overflow-hidden rounded-sm bg-white p-[10px] text-left ${CARD_SHADOW} focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 active:cursor-grabbing`}
            >
              {/* Header: title row + date (alignSelf stretch in spec) */}
              <div className="flex w-full min-w-0 shrink-0 flex-col items-start justify-end gap-[10px]">
                <div className="flex w-full min-w-0 items-start gap-[10px]">
                  <p className="min-w-0 flex-1 break-words text-left font-serif text-[clamp(15.5px,4.3vw,18px)] font-normal leading-snug text-black">
                    {a.title}
                  </p>
                  <SaveChip />
                </div>
                <p className="w-full text-left font-sans text-[8px] font-normal leading-normal text-[#7F7F7F]">
                  {formatArticlesForYouDate(a.publishedAt)}
                </p>
              </div>
              {/* Body: 120×120 image | column summary + read row, gap 10 */}
              <div className="flex min-h-0 w-full min-w-0 flex-1 items-stretch gap-[10px] overflow-hidden">
                <div className="flex min-h-0 min-w-0 shrink-0 basis-[120px] items-center justify-center">
                  <SafeArticleImage
                    remoteUrl={a.imageUrl}
                    alt=""
                    className="relative size-[120px] max-h-[120px] max-w-[120px] overflow-hidden bg-[#eee]"
                    imgClassName="h-full w-full max-h-full max-w-full object-cover"
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
          <div className="no-scrollbar -mx-1 flex min-w-0 w-full max-w-full snap-x snap-mandatory touch-manipulation gap-2.5 overflow-x-auto overscroll-x-contain px-1 pb-1 pr-3 [-webkit-overflow-scrolling:touch]">
            {trending.map((a) => (
              <button
                key={a.id}
                type="button"
                {...articleDragProps(a.id)}
                onClick={() => onSelect(a)}
                aria-current={selectedId === a.id ? "true" : undefined}
                className={`flex h-[318px] cursor-grab snap-start flex-col justify-between overflow-hidden bg-white p-[10px] text-left ${CARD_SHADOW} focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 active:cursor-grabbing ${
                  trending.length === 1
                    ? "w-full min-w-0 max-w-full shrink-0"
                    : "w-[248px] max-w-full shrink-0"
                }`}
              >
                {/* Image + title/date */}
                <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col items-center gap-[10px] overflow-hidden">
                  <div className="flex w-full min-w-0 shrink-0 justify-center overflow-hidden">
                    <SafeArticleImage
                      remoteUrl={a.imageUrl}
                      alt=""
                      className="relative aspect-square size-[180px] max-h-[180px] min-w-0 max-w-full shrink-0 overflow-hidden bg-[#eee]"
                      imgClassName="h-full w-full max-h-full max-w-full object-cover"
                    />
                  </div>
                  <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col justify-start gap-[10px]">
                    <div className="flex w-full min-w-0 items-start gap-[10px]">
                      <p className="min-w-0 flex-1 break-words text-left font-serif text-sm font-normal leading-snug text-black line-clamp-6">
                        {a.title}
                      </p>
                      <SaveChip />
                    </div>
                    <p className="w-full shrink-0 text-left font-sans text-[8px] font-normal leading-normal text-[#7F7F7F]">
                      {formatArticlesForYouDate(a.publishedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex w-full min-w-0 shrink-0 items-center justify-between pt-1">
                  <span className="min-w-0 truncate font-sans text-xs font-medium text-black">
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
          <div className="no-scrollbar -mx-1 flex min-w-0 w-full max-w-full touch-manipulation items-stretch gap-4 overflow-x-auto overscroll-x-contain px-1 pb-1">
            {opinions.map((a) => {
              const minutes = Math.max(
                1,
                Math.round(articleBodyReadingMinutesForLayout(a)),
              );
              return (
                <div
                  key={a.id}
                  {...articleDragProps(a.id)}
                  className={`flex w-[285px] max-w-full shrink-0 cursor-grab flex-col items-start gap-[10px] overflow-hidden bg-white p-[10px] text-left ${CARD_SHADOW} active:cursor-grabbing`}
                >
                  <div className="flex w-full min-w-0 items-start gap-[10px] overflow-hidden">
                    <div className="relative h-[107px] min-h-0 min-w-0 w-[105px] shrink-0 basis-[105px] overflow-hidden bg-[#eee]">
                      <SafeArticleImage
                        remoteUrl={a.imageUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full overflow-hidden"
                        imgClassName="h-full w-full max-h-full max-w-full object-cover"
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
                      className="flex min-h-[107px] min-w-0 flex-1 flex-col justify-between gap-[10px] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
                    >
                      <div className="flex w-full min-w-0 items-start gap-[10px]">
                        <p className="min-w-0 flex-1 break-words text-left font-serif text-[clamp(14px,3.95vw,16.5px)] font-normal leading-snug text-black">
                          {a.title}
                        </p>
                        <SaveChip />
                      </div>
                      <div className="flex w-full min-w-0 shrink-0 items-center justify-between font-sans text-[8px] font-normal leading-normal">
                        <span className="shrink-0 text-[#7F7F7F]">
                          {formatShortMonthDay(a.publishedAt)}
                        </span>
                        <span className="shrink-0 uppercase text-black">
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
          <div className="no-scrollbar -mx-1 flex min-w-0 w-full max-w-full touch-manipulation gap-2.5 overflow-x-auto overscroll-x-contain px-1 pb-1">
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
                  <p className="max-w-[233px] break-words font-serif text-[clamp(15.5px,4.3vw,18px)] font-normal leading-snug text-white">
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
