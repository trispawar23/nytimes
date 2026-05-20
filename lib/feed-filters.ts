import { articleBodyReadingMinutesForLayout } from "@/lib/reading-stats";
import type { TnaSection } from "@/lib/tna-sections";
import type { Article } from "@/lib/types";

export type TopicFilter = TnaSection | "all";
export type FeedSortBy = "all" | "length_desc" | "length_asc";

export const TOPIC_FILTER_OPTIONS: {
  value: TopicFilter;
  label: string;
}[] = [
  { value: "all", label: "All topics" },
  { value: "general", label: "General" },
  { value: "business", label: "Business" },
  { value: "sports", label: "Sports" },
  { value: "tech", label: "Technology" },
  { value: "science", label: "Science" },
  { value: "health", label: "Health" },
];

export const FEED_SORT_OPTIONS: {
  value: FeedSortBy;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "length_desc", label: "Longest to shortest" },
  { value: "length_asc", label: "Shortest to longest" },
];

/** Coerce unknown/stale values back to a valid sort. */
export function normalizeFeedSortBy(value: string | undefined): FeedSortBy {
  if (value === "length_desc" || value === "length" || value === "time") {
    return "length_desc";
  }
  if (value === "length_asc") return "length_asc";
  return "all";
}

export function feedSortOption(sortBy: FeedSortBy) {
  return FEED_SORT_OPTIONS.find((o) => o.value === sortBy) ?? FEED_SORT_OPTIONS[0]!;
}

function categoryMatchesTopic(category: string, topic: TnaSection): boolean {
  const c = category.trim().toLowerCase();
  if (!c) return false;
  if (topic === "tech") {
    return c === "tech" || c.includes("tech") || c === "technology";
  }
  return c === topic || c.includes(topic);
}

export function filterArticlesByTopic(
  articles: Article[],
  topic: TopicFilter,
): Article[] {
  if (topic === "all") return articles;
  return articles.filter((a) => categoryMatchesTopic(a.category, topic));
}

export function sortFeedArticles(
  articles: Article[],
  sortBy: FeedSortBy,
): Article[] {
  if (sortBy === "all") return [...articles];

  const copy = [...articles];
  switch (sortBy) {
    case "length_desc":
      return copy.sort(
        (a, b) =>
          articleBodyReadingMinutesForLayout(b) -
          articleBodyReadingMinutesForLayout(a),
      );
    case "length_asc":
      return copy.sort(
        (a, b) =>
          articleBodyReadingMinutesForLayout(a) -
          articleBodyReadingMinutesForLayout(b),
      );
    default:
      return copy;
  }
}

export function applyFeedFilters(
  articles: Article[],
  topic: TopicFilter,
  sortBy: FeedSortBy,
): Article[] {
  return sortFeedArticles(filterArticlesByTopic(articles, topic), sortBy);
}

export function topicFilterToTags(
  topic: TopicFilter,
  modeTags: string,
): string {
  return topic === "all" ? modeTags : topic;
}
