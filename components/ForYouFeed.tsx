"use client";

import { motion } from "framer-motion";
import { articleDragProps } from "@/lib/article-dnd";
import { articleBodyReadingMinutesForLayout } from "@/lib/reading-stats";
import type { Article } from "@/lib/types";
import { FeedListenPlayButton } from "./FeedListenPlayButton";
import { SafeArticleImage } from "./SafeArticleImage";

/** Hero (1) + strip (4) occupy the first five slots in the feed array; Daily reads from index 5 onward. */
const GREAT_READ_SLOT_COUNT = 5;
const MIN_DAILY_ARTICLES = 4;
const MAX_DAILY_ARTICLES = 8;

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "Just now";
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDailyDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function dedupeIdsKeepOrder(list: Article[]): Article[] {
  const seen = new Set<string>();
  const out: Article[] = [];
  for (const a of list) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
}

/**
 * The Daily: prefer indices ≥5 (disjoint from hero + strip slots), then IDs not in Great Read.
 * Never returns empty when there is more than one article (pads by cycling non-hero pool).
 */
function buildDailyRail(
  articles: Article[],
  hero: Article,
  strip: Article[],
): Article[] {
  const greatReadIds = new Set<string>([hero.id, ...strip.map((a) => a.id)]);

  const byLayout = articles.slice(
    GREAT_READ_SLOT_COUNT,
    GREAT_READ_SLOT_COUNT + MAX_DAILY_ARTICLES,
  );
  if (byLayout.length >= MIN_DAILY_ARTICLES) {
    return byLayout;
  }

  const exclusive = articles.filter((a) => !greatReadIds.has(a.id));
  if (exclusive.length >= MIN_DAILY_ARTICLES) {
    return exclusive.slice(0, MAX_DAILY_ARTICLES);
  }

  const merged = dedupeIdsKeepOrder([
    ...byLayout,
    ...exclusive,
    ...articles.filter((a) => a.id !== hero.id),
  ]);

  if (merged.length >= MIN_DAILY_ARTICLES) {
    return merged.slice(0, MAX_DAILY_ARTICLES);
  }

  if (merged.length > 0) {
    const pool = articles.filter((a) => a.id !== hero.id);
    const fill = pool.length > 0 ? pool : [hero];
    const out = [...merged];
    let i = 0;
    while (out.length < MIN_DAILY_ARTICLES && out.length < MAX_DAILY_ARTICLES) {
      out.push(fill[i % fill.length]);
      i++;
    }
    return out.slice(0, MAX_DAILY_ARTICLES);
  }

  const pool = articles.filter((a) => a.id !== hero.id);
  if (pool.length === 0) {
    return articles.slice(0, Math.min(MAX_DAILY_ARTICLES, articles.length));
  }
  const out: Article[] = [];
  for (let i = 0; i < MIN_DAILY_ARTICLES && i < MAX_DAILY_ARTICLES; i++) {
    out.push(pool[i % pool.length]);
  }
  return out;
}

type Props = {
  articles: Article[];
  selectedId: string | null;
  onSelect: (a: Article) => void;
  loading: boolean;
};

export function ForYouFeed({
  articles,
  selectedId,
  onSelect,
  loading,
}: Props) {
  const shell = "w-full min-w-0 max-w-full px-[16.44px]";

  if (loading) {
    return (
      <div className={`${shell} space-y-[10.27px] pb-6 pt-[10px]`}>
        <div className="h-4 w-32 animate-pulse rounded bg-[#e8e8e8]" />
        <div className="h-[280px] animate-pulse rounded bg-[#e8e8e8]" />
        <div className="h-24 animate-pulse rounded bg-[#e8e8e8]" />
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className={`${shell} pb-8 pt-6 text-center`}>
        <p className="font-['Helvetica_Neue',Helvetica,Arial,sans-serif] text-[14.38px] font-bold text-black">
          Nothing in this feed yet
        </p>
        <p className="mt-2 font-['Helvetica_Neue',Helvetica,Arial,sans-serif] text-[12px] text-[#7F7F7F]">
          Pull to refresh or check your connection.
        </p>
      </div>
    );
  }

  const hero = articles[0];
  const strip = articles.slice(1, 5);
  const dailyItems = buildDailyRail(articles, hero, strip);

  return (
    <div className={`flex min-w-0 flex-col gap-[10.27px] pb-6 pt-[10.27px] ${shell}`}>
      <section className="flex w-full min-w-0 flex-col gap-[10.27px]">
        <h2 className="font-['Helvetica_Neue',Helvetica,Arial,sans-serif] text-[14.38px] font-bold leading-normal text-black">
          The Great Read
        </h2>
        <div className="w-full min-w-0">
          <div className="w-full min-w-0 bg-white p-[10.27px]">
            <div className="flex w-full min-w-0 flex-col gap-[10.27px]">
              {/* Native HTML5 drag on wrapper — motion.button reserves onDragStart for Framer drag gestures */}
              <div
                {...articleDragProps(hero.id)}
                className="w-full min-w-0 cursor-grab active:cursor-grabbing"
              >
                <motion.button
                  type="button"
                  layout
                  onClick={() => onSelect(hero)}
                  whileTap={{ scale: 0.995 }}
                  aria-current={selectedId === hero.id ? "true" : undefined}
                  className="flex w-full min-w-0 flex-col gap-[10.27px] text-left focus:outline-none"
                >
                  <div className="relative aspect-[359/351] w-full min-w-0 overflow-hidden bg-[#f0f0f0]">
                    <SafeArticleImage
                      remoteUrl={hero.imageUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full"
                      imgClassName="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex w-full min-w-0 flex-col">
                    <p className="min-w-0 break-words font-['Georgia',serif] text-[clamp(16px,4.4vw,18.5px)] font-normal leading-snug text-black">
                      {hero.title}
                    </p>
                    <p className="mt-[2px] font-['Helvetica_Neue',Helvetica,Arial,sans-serif] text-[8.22px] font-normal leading-normal text-[#7F7F7F]">
                      {formatRelative(hero.publishedAt)}
                    </p>
                  </div>
                </motion.button>
              </div>

              <div className="no-scrollbar flex min-h-[48px] w-full min-w-0 snap-x snap-mandatory items-start gap-[20.55px] overflow-x-auto overflow-y-visible pb-1">
                {strip.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    {...articleDragProps(a.id)}
                    onClick={() => onSelect(a)}
                    aria-current={selectedId === a.id ? "true" : undefined}
                    className="flex w-[205px] shrink-0 snap-start cursor-grab flex-col items-start text-left focus:outline-none active:cursor-grabbing"
                  >
                    <span className="min-w-0 break-words font-['Georgia',serif] text-[clamp(13.5px,3.7vw,15px)] font-normal leading-snug text-black">
                      {a.title}
                    </span>
                    <span className="mt-[2px] font-['Helvetica_Neue',Helvetica,Arial,sans-serif] text-[8.22px] font-normal leading-normal text-[#7F7F7F]">
                      {formatRelative(a.publishedAt)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="flex w-full min-w-0 flex-col gap-[10.27px]">
        <h2 className="font-['Helvetica_Neue',Helvetica,Arial,sans-serif] text-[14.38px] font-bold leading-normal text-black">
          The Daily
        </h2>
        <div className="no-scrollbar flex min-h-[120px] w-full min-w-0 snap-x snap-mandatory items-stretch gap-[10.27px] overflow-x-auto pb-2">
          {dailyItems.map((a, slot) => (
            <div
              key={`daily-slot-${slot}-${a.id}`}
              {...articleDragProps(a.id)}
              className="flex h-[222.938px] w-[148px] shrink-0 snap-start cursor-grab flex-col items-stretch overflow-hidden bg-white p-[10.274px] text-left shadow-[1.027px_1.027px_7.5px_rgba(121,121,121,0.25)] gap-[5.137px] active:cursor-grabbing"
            >
              <button
                type="button"
                onClick={() => onSelect(a)}
                aria-current={selectedId === a.id ? "true" : undefined}
                className="flex min-h-0 flex-1 flex-col gap-[5.137px] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
              >
                <div className="flex shrink-0 justify-center">
                  <SafeArticleImage
                    remoteUrl={a.imageUrl}
                    alt=""
                    className="relative size-[94.52px] shrink-0 overflow-hidden bg-[#eee]"
                    imgClassName="h-full w-full object-cover"
                  />
                </div>
                <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                  <p className="line-clamp-3 min-w-0 break-words text-left font-['Georgia',serif] text-[13.25px] font-normal leading-[1.28] text-black">
                    {a.title}
                  </p>
                  <p className="mt-[3px] text-left font-['Helvetica_Neue',Helvetica,Arial,sans-serif] text-[8.22px] font-normal leading-normal text-[#7F7F7F]">
                    {formatDailyDate(a.publishedAt)}
                  </p>
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-[5.14px]">
                <FeedListenPlayButton article={a} />
                <span className="font-['Helvetica_Neue',Helvetica,Arial,sans-serif] text-[8.22px] font-normal text-black">
                  {Math.max(
                    1,
                    articleBodyReadingMinutesForLayout(a),
                  ).toLocaleString()}{" "}
                  MIN
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
