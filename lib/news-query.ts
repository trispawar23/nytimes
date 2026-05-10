import { TNA_SECTIONS, type TnaSection } from "./tna-sections";

/** Default section mix per feed mode (`tags` query sent to `/api/news`). */
export function modeToTags(mode: "discover" | "relax" | "catchup"): string {
  switch (mode) {
    case "discover":
      return "tech,science,general";
    case "relax":
      return "health,general";
    case "catchup":
      return "general,business";
    default:
      return "general";
  }
}

/** Optional: explicit single section override from `?category=tech` etc. */
export function isTnaSectionParam(value: string): value is TnaSection {
  return (TNA_SECTIONS as readonly string[]).includes(value);
}
