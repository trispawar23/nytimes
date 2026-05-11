"use client";

import { ArrowRight, ChevronRight } from "lucide-react";
import { articleDragProps } from "@/lib/article-dnd";
import type { Article } from "@/lib/types";
import { SafeArticleImage } from "./SafeArticleImage";

const CARD_SHADOW =
  "shadow-[1px_1px_7.3px_rgba(121,121,121,0.25)]" as const;

function formatQuizDate(): string {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

function pickWordLabel(): string {
  const pool = [
    "piquancy",
    "epoch",
    "liminal",
    "sonorous",
    "ephemeral",
    "verdant",
  ];
  return pool[Math.floor(Date.now() / 86400000) % pool.length]!;
}

type Props = {
  articles: Article[];
  selectedId: string | null;
  onSelect: (a: Article) => void;
  loading: boolean;
};

export function RelaxFeed({
  articles,
  selectedId,
  onSelect,
  loading,
}: Props) {
  const shell = "w-full min-w-0 px-4";

  const hero = articles[0];
  const quizArt = articles[1];
  const spellingArt = articles[2];
  const wordArt = articles[3];
  const wordLabel = pickWordLabel();

  if (loading) {
    return (
      <div className={`${shell} flex flex-col gap-[10px] pb-28 pt-[10px]`}>
        <div className="mx-auto aspect-[370/677] w-full max-w-[370px] animate-pulse bg-[#e4e4e4]" />
        <div className="mx-auto h-64 w-full max-w-[370px] animate-pulse rounded-sm bg-white shadow-[1px_1px_7.3px_rgba(121,121,121,0.25)]" />
        <div className="mx-auto h-48 w-full max-w-[370px] animate-pulse rounded-sm bg-white shadow-[1px_1px_7.3px_rgba(121,121,121,0.25)]" />
        <div className="mx-auto h-96 w-full max-w-[370px] animate-pulse rounded-sm bg-white shadow-[1px_1px_7.3px_rgba(121,121,121,0.25)]" />
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

  return (
    <div
      className={`${shell} mx-auto flex max-w-[370px] flex-col gap-[10px] pb-28 pt-[10px]`}
    >
      {/* Tall hero — interview-style */}
      <button
        type="button"
        {...articleDragProps(hero.id)}
        onClick={() => onSelect(hero)}
        aria-current={selectedId === hero.id ? "true" : undefined}
        className="relative w-full shrink-0 cursor-grab overflow-hidden bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30 active:cursor-grabbing"
      >
        <div className="relative aspect-[370/677] w-full">
          <SafeArticleImage
            remoteUrl={hero.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full bg-[#1a1a1a]"
            imgClassName="h-full w-full object-cover"
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent"
            aria-hidden
          />
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-5 pt-16 text-left text-white">
            <p className="font-serif text-[15px] font-normal italic leading-snug text-white/95">
              The Interview
            </p>
            <p className="mt-1 line-clamp-4 font-serif text-[clamp(14px,3.95vw,16.5px)] font-normal leading-snug">
              {hero.title}
            </p>
          </div>
        </div>
      </button>

      {/* News Quiz */}
      <article
        {...articleDragProps((quizArt ?? hero).id)}
        className={`flex w-full cursor-grab flex-col gap-[13px] bg-white p-[10px] ${CARD_SHADOW} active:cursor-grabbing`}
      >
        <div className="flex flex-col gap-0.5">
          <h2 className="font-sans text-[14px] font-bold leading-snug text-black">
            News Quiz
          </h2>
          <p className="font-sans text-[12px] font-normal text-[#7F7F7F]">
            {formatQuizDate()}
          </p>
        </div>
        <div className="flex flex-col items-center gap-[14px]">
          <SafeArticleImage
            remoteUrl={quizArt?.imageUrl ?? null}
            alt=""
            className="aspect-[350/233] w-full max-w-[350px] overflow-hidden bg-[#eee]"
            imgClassName="h-full w-full object-cover"
          />
          <div className="flex flex-col items-center gap-[10px]">
            <p className="max-w-[330px] text-center font-serif text-[clamp(15.5px,4.3vw,18px)] font-normal leading-snug text-black">
              Did you follow the news this week?
              <br />
              Test your knowledge.
            </p>
            <button
              type="button"
              onClick={() => onSelect(quizArt ?? hero)}
              className="inline-flex items-center gap-2 border border-black px-[10px] py-[10px] font-sans text-[14px] font-bold text-black transition-colors hover:bg-black hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
            >
              Begin
              <ArrowRight className="size-4 shrink-0" strokeWidth={2} />
            </button>
          </div>
        </div>
      </article>

      {/* Spelling Bee */}
      <button
        type="button"
        {...articleDragProps((spellingArt ?? hero).id)}
        onClick={() => onSelect(spellingArt ?? hero)}
        aria-current={
          spellingArt && selectedId === spellingArt.id ? "true" : undefined
        }
        className={`flex w-full cursor-grab flex-col items-center gap-[5px] bg-white p-[10px] text-left ${CARD_SHADOW} focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 active:cursor-grabbing`}
      >
        <div className="flex w-full flex-col gap-0.5">
          <p className="font-sans text-[14px] font-bold leading-snug text-black">
            NOW TIME TO PLAY
          </p>
          <p className="font-sans text-[12px] font-normal text-[#7F7F7F]">
            Today&apos;s Spelling Bee
          </p>
        </div>
        <div className="inline-flex w-full items-center justify-center gap-3">
          <SafeArticleImage
            remoteUrl={spellingArt?.imageUrl ?? null}
            alt=""
            className="h-[157px] w-[187px] shrink-0 overflow-hidden bg-[#eee]"
            imgClassName="h-full w-full object-cover"
          />
          <ChevronRight
            className="size-8 shrink-0 text-black"
            strokeWidth={2}
            aria-hidden
          />
        </div>
      </button>

      {/* Word of the Day */}
      <button
        type="button"
        {...articleDragProps((wordArt ?? hero).id)}
        onClick={() => onSelect(wordArt ?? hero)}
        aria-current={
          wordArt && selectedId === wordArt.id ? "true" : undefined
        }
        className={`flex w-full cursor-grab flex-col gap-[13px] bg-white p-[10px] text-left ${CARD_SHADOW} focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 active:cursor-grabbing`}
      >
        <div className="flex flex-col gap-0.5">
          <span className="font-sans text-[14px] font-bold leading-snug text-black">
            Word of the Day
          </span>
        </div>
        <div className="flex w-full max-w-[350px] flex-col items-center gap-[14px] self-center">
          <SafeArticleImage
            remoteUrl={wordArt?.imageUrl ?? null}
            alt=""
            className="aspect-square w-full max-w-[330px] overflow-hidden bg-[#eee]"
            imgClassName="h-full w-full object-cover"
          />
          <p className="max-w-[330px] text-center font-serif text-[clamp(15.5px,4.3vw,18px)] font-normal leading-snug text-black">
            Word of the Day: {wordLabel}
          </p>
        </div>
      </button>
    </div>
  );
}
