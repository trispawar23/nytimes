import type { DragEvent } from "react";

/** Payload for HTML5 drag — drop target accepts only this (not arbitrary text/plain). */
export const ARTICLE_DRAG_MIME = "application/x-nytimes-article-id";

/** Marker on feed cards for touch “drag” → listen dock (mobile has no HTML5 DnD). */
export const NYTIMES_ARTICLE_CARD_ATTR = "data-nytimes-article-id";

export function setArticleDragData(dt: DataTransfer, articleId: string): void {
  dt.setData(ARTICLE_DRAG_MIME, articleId);
  dt.effectAllowed = "copy";
}

export function getArticleIdFromDrag(dt: DataTransfer): string | null {
  const id = dt.getData(ARTICLE_DRAG_MIME).trim();
  return id || null;
}

export function dragEventCarriesArticle(e: DragEvent<Element>): boolean {
  return Array.from(e.dataTransfer.types).includes(ARTICLE_DRAG_MIME);
}

export function articleDragProps(articleId: string): {
  draggable: true;
  onDragStart: (e: DragEvent<Element>) => void;
  "data-nytimes-article-id": string;
} {
  return {
    draggable: true,
    "data-nytimes-article-id": articleId,
    onDragStart: (e) => {
      setArticleDragData(e.dataTransfer, articleId);
      e.stopPropagation();
    },
  };
}
