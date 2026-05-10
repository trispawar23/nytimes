import { isFoxNewsArticleHostname } from "./fox-news-feed";

/**
 * Basic SSRF guard for server-side fetches of user-supplied article URLs.
 * Only Fox News publisher hosts are allowed (feed is Fox-only).
 */
export function isAllowedArticleReadUrl(urlStr: string): boolean {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (!isFoxNewsArticleHostname(host)) return false;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "[::1]"
  ) {
    return false;
  }
  if (host === "127.0.0.1" || host.startsWith("127.")) return false;
  if (host.startsWith("10.")) return false;
  if (host.startsWith("192.168.")) return false;
  if (host.startsWith("169.254.")) return false;
  const m = /^172\.(\d+)\./.exec(host);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return false;
  }
  return true;
}
