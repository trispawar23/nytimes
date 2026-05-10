import type { DragEvent } from "react";

/** Payload for HTML5 drag — drop target accepts only this (not arbitrary text/plain). */
export const ARTICLE_DRAG_MIME = "application/x-nytimes-article-id";

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
} {
  return {
    draggable: true,
    onDragStart: (e) => {
      setArticleDragData(e.dataTransfer, articleId);
      e.stopPropagation();
    },
  };
}
