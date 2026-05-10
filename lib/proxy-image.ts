/** Wrap remote image URL for same-origin fetch via `/api/image` (hotlink / referrer workarounds). */
export function proxiedImageUrl(remote: string | null | undefined): string | null {
  if (!remote?.trim()) return null;
  try {
    const u = new URL(remote.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `/api/image?url=${encodeURIComponent(u.toString())}`;
  } catch {
    return null;
  }
}
