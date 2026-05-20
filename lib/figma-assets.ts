/**
 * Short-lived Figma MCP asset URLs (≈7 days). Replace with exported SVGs/PNGs
 * from the file for production.
 * @see https://www.figma.com/design/CyD68V9WtVkrFKWS9VTPy5/Screens
 */
export const FIGMA_MODE_ICONS = {
  discover:
    "https://www.figma.com/api/mcp/asset/da68ac40-5563-49c9-84bb-f904820d419a",
  relax: "https://www.figma.com/api/mcp/asset/42292e3b-a93a-4b7d-a25c-aa5cc5fc118c",
  catchup: "https://www.figma.com/api/mcp/asset/0cbf8f35-c493-47eb-9888-5c9ac8fecb8d",
} as const;

/** Bottom nav icons live in `public/nav/` — see `lib/nav-assets.ts`. */
