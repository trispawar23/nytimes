/**
 * Title-agnostic cleanup for scraped article text: truncate syndicated footers,
 * drop rails (“Read More”, trending, puzzles), ads, and mega-nav blobs before
 * APIs (gist, summarize) or reader-specific title filtering.
 */

function normalizeInvisible(s: string): string {
  return s.replace(/[\u200b-\u200d\ufeff\u2060]/g, "");
}

function wordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

/** Cut from first strong footer / sidebar marker (newline-aligned). */
function truncateAtFooterMarkers(s: string): string {
  const markerRes = [
    /\n\s*(?:CONNECT US ON|Connect us on)\b/i,
    /\n\s*Subscribe to our Newsletter\b/i,
    /\n\s*TRENDING\s+\d+\s+/i,
    /\n\s*POST\s*\/\s*READ COMMENTS\b/i,
    /\n\s*READ MORE ON\s*:/i,
    /\n\s*©\s*Copyright\s+\d{4}\b/i,
    /\n\s*VisionRI\s*\|\s*Disclaimer\b/i,
    /\n\s*Email:\s*info@devdiscourse\.com\b/i,
    /\n\s*DEVSHOTS\b/i,
    /\n\s*LATEST NEWS\b/i,
    /\n\s*OTHER LINKS\b/i,
    /\n\s*OTHER PRODUCTS\b/i,
    /\n\s*\bOPINION\s*\/\s*BLOG\s*\/\s*INTERVIEW\b/i,
    /\n\s*Knowledge\s+Partnership\b/i,
    /\n\s*Write for us\b/i,
    /\n\s*Sponsored Stories(?:\s+You May Like)?\b/i,
    /\n\s*More From Fox News\b/i,
    /\n\s*Related Topics\b/i,
    /\n\s*Fox News First\b/i,
    /\n\s*Get all the stories you need-to-know\b/i,
    /\n\s*By entering your email\b/i,
    /\n\s*Arrives Weekdays\b/i,
    /\n\s*Terms of Use\s*Privacy Policy\b/i,
    /\n\s*Terms of Use\b/i,
    /\n\s*Closed Caption Policy\b/i,
    /\n\s*Accessibility Statement\b/i,
    /\n\s*News Sitemap\b/i,
    /\n\s*Video Sitemap\b/i,
    /\n\s*Watch Live\b/i,
    /\n\s*FOX News Shows\b/i,
    /\n\s*Programming Schedule\b/i,
    /\n\s*Advertise With Us\b/i,
    /\n\s*Corporate Information\b/i,
    /\n\s*Scattergories Daily\b/i,
    /\n\s*FOX News Podcasts\b/i,
    /\n\s*FOX Nation Coverage\b/i,
    /\n\s*Your Privacy Choices\b/i,
    // Times of India / similar portals
    /\n\s*Also\s+Read\b/i,
    /\n\s*Also\s+See\b/i,
    /\n\s*End of Article\b/i,
    /\n\s*End of Story\b/i,
    /\n\s*\bREAD MORE\b/i,
    /\n\s*More\s+Stories\b/i,
    /\n\s*Trending\s+Stories\b/i,
    /\n\s*Latest\s+Mobiles\b/i,
    /\n\s*Photostories\b/i,
    /\n\s*Photo\s+Stories\b/i,
    /\n\s*Hot\s+Picks\b/i,
    /\n\s*Daily\s+Puzzles\b/i,
    /\n\s*\bTOI\s+Tech\s+Desk\b/i,
    /\n\s*\bTOI\s+\w+\s+Desk\b/i,
    /\n\s*Visual\s+Stories\b/i,
    /\n\s*Web\s+Stories\b/i,
    /\n\s*Recommended\s+For\s+You\b/i,
    /\n\s*You\s+May\s+Also\s+Like\b/i,
    /\n\s*Latest\s+Videos\b/i,
    /\n\s*Download\s+(?:the\s+)?(?:TOI|Times of India)\s+app\b/i,
    /\n\s*Get\s+the\s+app\b/i,
  ];
  let end = s.length;
  for (const re of markerRes) {
    const idx = s.search(re);
    if (idx >= 0 && idx < end) end = idx;
  }
  return s.slice(0, end).trim();
}

function looksLikeShowRailLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 16 || t.length > 220) return false;
  if (/\|\s*.+\s+w\/\s+\w+/i.test(t)) return true;
  if (/\|\s*Don'?t\s+@\s+Me\b/i.test(t)) return true;
  if (/\|\s*Tomi Lahren\b/i.test(t)) return true;
  if (/\|\s*Planet Tyrus\b/i.test(t)) return true;
  return false;
}

function looksLikeAllCapsPromoHeadline(line: string): boolean {
  const t = line.trim();
  if (t.length < 32 || t.length > 200) return false;
  const letters = t.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 28) return false;
  const lower = (t.match(/[a-z]/g) ?? []).length;
  return lower === 0 && wordCount(t) >= 5;
}

function looksLikeNavMegaLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 72) return false;
  const letters = t.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 36) return false;
  const lower = (t.match(/[a-z]/g) ?? []).length;
  const wc = wordCount(t);
  if (wc >= 14 && lower < Math.max(6, wc * 0.18)) return true;
  const pipes = (t.match(/\|/g) ?? []).length;
  if (pipes >= 4 && wc >= 10 && lower < wc * 0.25) return true;
  return false;
}

function isSectorTaxonomyBlob(p: string): boolean {
  const t = p.trim();
  if (t.length < 120 || t.length > 3500) return false;
  const hits = [
    /\bAGRO[- ]FORESTRY\b/i,
    /\bURBAN DEVELOPMENT\b/i,
    /\bLAW & GOVERNANCE\b/i,
    /\bSCIENCE & ENVIRONMENT\b/i,
    /\bEast Africa\b/i,
    /\bMiddle East and North Africa\b/i,
  ].filter((re) => re.test(t)).length;
  return hits >= 3 && wordCount(t) > 25;
}

function isPublisherFooterGridParagraph(p: string): boolean {
  const lines = p.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 14) return false;
  const short = lines.filter((l) => l.length <= 54).length;
  return short / lines.length > 0.82;
}

function isThinHeadlineStubParagraph(p: string): boolean {
  const t = p.trim();
  if (t.length < 22 || t.length > 130) return false;
  if (/[.!?]/.test(t)) return false;
  const wc = wordCount(t);
  return wc >= 5 && wc <= 17;
}

/** Short staff bio / desk attribution blocks common after Indian English portals. */
function isLikelyStaffBylineBlob(p: string): boolean {
  const t = p.trim();
  if (t.length < 24 || t.length > 520) return false;
  if (/\|\s*(?:TOI|ANI|PTI|IANS)\b/i.test(t)) return true;
  if (
    /^(?:Written by|Edited by|Reviewed by)\s+.+/i.test(t) &&
    wordCount(t) < 40
  ) {
    return true;
  }
  if (
    /^\w[\w\s,'’.-]{4,120}\s+is\s+(?:a|an)\s+(?:senior\s+)?(?:staff\s+)?(?:writer|reporter|correspondent|editor)\b/i.test(
      t,
    ) &&
    wordCount(t) < 55
  ) {
    return true;
  }
  return false;
}

function shouldStopReaderBodyBeforeParagraph(p: string): boolean {
  const t = p.trim();
  if (!t) return false;
  if (/^Sponsored Stories\b/i.test(t)) return true;
  if (/^More From Fox News\b/i.test(t)) return true;
  if (/^Related Topics\b/i.test(t)) return true;
  if (/^Fox News First\b/i.test(t)) return true;
  if (/^Also Read\b/i.test(t)) return true;
  if (/^Also See\b/i.test(t)) return true;
  if (/^Trending Stories\b/i.test(t)) return true;
  if (/^Latest Mobiles\b/i.test(t)) return true;
  if (/^Photostories\b/i.test(t)) return true;
  if (/^Photo Stories\b/i.test(t)) return true;
  if (/^Hot Picks\b/i.test(t)) return true;
  if (/^Daily Puzzles\b/i.test(t)) return true;
  if (/^Visual Stories\b/i.test(t)) return true;
  if (/^Web Stories\b/i.test(t)) return true;
  if (/^READ MORE\b/i.test(t)) return true;
  if (/^End of Article\b/i.test(t)) return true;
  return false;
}

function isSiteChromeParagraph(p: string): boolean {
  const t = p.trim();
  if (!t) return true;

  if (isPublisherFooterGridParagraph(t)) return true;

  if (isSectorTaxonomyBlob(t)) return true;

  if (/^about\s+career\s+advertisement\s+team\b/i.test(t)) return true;
  if (/\bHOME\s+NEWS\s+Science\b/i.test(t) && t.length < 2500) return true;
  if (/^NEWS\s+RESEARCH\s+LIVE\s+DISCOURSE\b/i.test(t)) return true;

  if (/^KEY TAKEAWAYS\b/i.test(t) && wordCount(t) < 30) return true;
  if (/^AI SUMMARY\b/i.test(t) && wordCount(t) < 12) return true;
  if (/^Analyzing article\.{0,3}\s*$/i.test(t)) return true;
  if (/^ARTICLE\s+\w+/i.test(t) && wordCount(t) < 22 && !/[.!?]\s/.test(t))
    return true;

  if (/^watch the full interview\b/i.test(t) && wordCount(t) < 36) return true;

  const letters = t.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 50) {
    const lower = (t.match(/[a-z]/g) ?? []).length;
    const wc = wordCount(t);
    if (wc >= 18 && lower / letters.length < 0.11) return true;
  }

  return false;
}

function isNarrativeBlock(block: string): boolean {
  const t = block.trim();
  if (t.length < 55) return false;
  if (looksLikeShowRailLine(t)) return false;
  if (looksLikeAllCapsPromoHeadline(t)) return false;
  if (isSiteChromeParagraph(t)) return false;
  if (looksLikeNavMegaLine(t)) return false;
  const wc = wordCount(t);
  const sentenceSplits = t.split(/(?<=[.!?]["»]?)\s+/).filter((s) => s.length > 28);
  if (sentenceSplits.length >= 2) return true;
  if (t.includes(". ") && wc >= 28) return true;
  return false;
}

function dropLeadingUntilNarrative(blocks: string[]): string[] {
  let i = 0;
  while (i < blocks.length && !isNarrativeBlock(blocks[i]!)) i++;
  if (i >= blocks.length) {
    return blocks.filter(
      (b) =>
        !isSiteChromeParagraph(b) &&
        !looksLikeNavMegaLine(b.trim()),
    );
  }
  return blocks.slice(i);
}

function preprocessLineNoise(decoded: string): string {
  const lines = decoded.split(/\n/).map((l) => l.trim());
  const kept: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    if (looksLikeNavMegaLine(line)) continue;
    if (isJunkLine(line)) continue;
    kept.push(line);
  }
  return kept.join("\n\n");
}

export function decodeHtmlEntities(raw: string): string {
  let s = raw;
  s = s.replace(/&#x([0-9a-f]{1,6});?/gi, (_, h: string) => {
    const cp = parseInt(h, 16);
    try {
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
    } catch {
      return _;
    }
  });
  s = s.replace(/&#(\d{1,7});?/g, (_, d: string) => {
    const cp = parseInt(d, 10);
    try {
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
    } catch {
      return _;
    }
  });
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

const JUNK_LINE_RES: RegExp[] = [
  /^advertisement\.?$/i,
  /^advertorial\.?$/i,
  /^sponsored(\s+content)?\.?$/i,
  /article continues below/i,
  /^scroll to continue/i,
  /^continue reading below/i,
  /^related articles:?$/i,
  /^related:?$/i,
  /^related stories:?$/i,
  /^read more:?$/i,
  /^most popular$/i,
  /^trending now$/i,
  /^trending stories\b/i,
  /^sign up for/i,
  /^subscribe (today|now|for)/i,
  /^get unlimited/i,
  /^follow us on/i,
  /^share (this|on)?$/i,
  /^share\s+key takeaways$/i,
  /^key takeaways$/i,
  /^ai summary$/i,
  /^click here/i,
  /^watch:/i,
  /^listen:/i,
  /^following is a summary of\b/i,
  /^analyzing article\.{0,3}\s*$/i,
  /^\(this story has not been edited by\b/i,
  /^updated:\s*\d/i,
  /^created:\s*\d/i,
  /\|\s*updated:\s*\d/i,
  /\|\s*created:\s*\d/i,
  /^reuters\s*\|/i,
  /^by\s+reuters\b$/i,
  /^right arrow$/i,
  /^video$/i,
  /^audio$/i,
  /^media$/i,
  /^facebook$/i,
  /^twitter$/i,
  /^threads$/i,
  /^flipboard$/i,
  /^comments$/i,
  /^print$/i,
  /^email$/i,
  /^slack$/i,
  /^rss$/i,
  /^spotify$/i,
  /^linkedin$/i,
  /^youtube$/i,
  /^instagram$/i,
  /^newsletters$/i,
  /^subscribe\s*$/i,
  /^add\s+.+\s+on google\s*$/i,
  /^published\s+\w+\s+\d{1,2},?\s+\d{4}\b/i,
  /^published\s+\w+\s+\d{1,2}\s+\d{4}\b/i,
  /^by\s+[\w\s.'’-]+\s+Fox News\s*$/i,
  /^also read\b/i,
  /^also see\b/i,
  /^end of article\b/i,
  /^end of story\b/i,
  /^hot picks\b/i,
  /^daily puzzles\b/i,
  /^photostories\b/i,
  /^photo stories\b/i,
  /^visual stories\b/i,
  /^web stories\b/i,
  /^latest mobiles\b/i,
];

function isJunkLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (looksLikeNavMegaLine(t)) return true;
  if (looksLikeShowRailLine(t)) return true;
  if (looksLikeAllCapsPromoHeadline(t)) return true;
  return JUNK_LINE_RES.some((re) => re.test(t));
}

function isCopyrightOrLegalBlock(text: string): boolean {
  return (
    /copyright\s*©|©\s*\d{4}|all rights reserved/i.test(text) ||
    /republication.*prohibited|rebroadcast|redistribution.*without/i.test(
      text,
    ) ||
    /express written consent/i.test(text)
  );
}

function stripCopyrightTail(text: string): string {
  const lines = text.split(/\n/);
  const cut: string[] = [];
  for (const line of lines) {
    if (isCopyrightOrLegalBlock(line)) break;
    cut.push(line);
  }
  return cut.join("\n").trim();
}

function cleanArticleContentStrict(raw: string): string {
  let decoded = normalizeInvisible(decodeHtmlEntities(raw)).trim();
  if (!decoded) return "";

  decoded = truncateAtFooterMarkers(decoded.replace(/\r\n/g, "\n"));
  decoded = preprocessLineNoise(decoded);

  let blocks = decoded.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  blocks = dropLeadingUntilNarrative(blocks);

  const out: string[] = [];

  for (const block of blocks) {
    if (shouldStopReaderBodyBeforeParagraph(block)) break;
    if (isCopyrightOrLegalBlock(block)) break;
    if (isSiteChromeParagraph(block)) continue;

    const lines = block.split(/\r?\n/).map((l) => l.trim());
    const kept = lines.filter((l) => !isJunkLine(l));
    if (kept.length === 0) continue;

    const merged = kept.join(" ").replace(/\s{2,}/g, " ").trim();
    if (!merged) continue;

    if (shouldStopReaderBodyBeforeParagraph(merged)) break;
    if (isSiteChromeParagraph(merged)) continue;
    if (isThinHeadlineStubParagraph(merged)) continue;
    if (isLikelyStaffBylineBlob(merged)) continue;

    out.push(merged);
  }

  return out.join("\n\n").trim();
}

/**
 * Strip unrelated page chrome from scraped article text (rails, footers, bios,
 * topic lists, ads). Safe to run before LLM calls; does not use the headline.
 */
export function cleanArticleContent(rawText: string): string {
  return cleanArticleContentStrict(rawText);
}

/**
 * Softer pass when strict cleaning collapses a long extract (same thresholds as reader fallback).
 */
export function cleanArticleContentLenient(rawText: string): string {
  let decoded = normalizeInvisible(decodeHtmlEntities(rawText)).trim();
  if (!decoded) return "";
  decoded = truncateAtFooterMarkers(decoded.replace(/\r\n/g, "\n"));
  decoded = preprocessLineNoise(decoded);
  decoded = stripCopyrightTail(decoded);
  let blocks = decoded.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  blocks = dropLeadingUntilNarrative(blocks);
  const out: string[] = [];
  for (const block of blocks) {
    if (shouldStopReaderBodyBeforeParagraph(block)) break;
    if (isSiteChromeParagraph(block)) continue;
    const merged = block
      .split(/\r?\n/)
      .filter((l) => !isJunkLine(l))
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!merged || isCopyrightOrLegalBlock(merged)) continue;
    if (shouldStopReaderBodyBeforeParagraph(merged)) break;
    if (isSiteChromeParagraph(merged)) continue;
    if (isThinHeadlineStubParagraph(merged)) continue;
    if (isLikelyStaffBylineBlob(merged)) continue;
    out.push(merged);
  }
  return out.join("\n\n").trim();
}

/** Strict clean, then lenient if the extract was long but collapsed (for API routes). */
export function cleanArticleContentWithFallback(rawText: string): string {
  const raw = rawText.trim();
  if (!raw) return "";
  let t = cleanArticleContent(raw);
  if (t.length < 80 && raw.length > 240) {
    t = cleanArticleContentLenient(raw);
  }
  return t;
}
