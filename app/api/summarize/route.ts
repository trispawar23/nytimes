import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import type {
  FeedMode,
  SummarizeApiResult,
  SummaryRequest,
  SummaryResponse,
} from "@/lib/types";
import { cleanArticleContentWithFallback } from "@/lib/clean-article-content";
import { countWords } from "@/lib/reading-stats";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Used when `editorial-rules.md` is missing from the server bundle or unreadable. */
const EDITORIAL_RULES_FALLBACK = `
# Editorial rules (embedded fallback)

- Never invent facts; only use the provided article text.
- Preserve uncertainty; do not turn hedged reporting into certainty.
- If the source text is thin, say so in limitations and lower confidence.
- Output JSON only (no markdown fences) with: headline, summary, key_points (3–5 strings),
  why_it_matters, confidence (0–1), voice_script, limitations.
`.trim();

const RULES_CANDIDATE_PATHS = [
  path.join(process.cwd(), "lib", "editorial-rules.md"),
  path.join(process.cwd(), "editorial-rules.md"),
];

const HALF_LENGTH_RULES_PATH = path.join(
  process.cwd(),
  "lib",
  "editorial-rules-half-length.md",
);

/** Medium rail stop → adaptive half-length summary rules. */
const HALF_LENGTH_READING_MINUTES = 3;

/** Short rail stop → 1-minute compressed summary rules. */
const ONE_MINUTE_READING_MINUTES = 1;

const ONE_MINUTE_RULES_PATH = path.join(
  process.cwd(),
  "lib",
  "editorial-rules-one-minute.md",
);

async function loadEditorialRules(): Promise<string> {
  for (const p of RULES_CANDIDATE_PATHS) {
    try {
      const text = await readFile(p, "utf8");
      if (text.trim().length > 0) return text;
    } catch {
      /* try next */
    }
  }
  logSummarize("Using embedded editorial rules (file not found on disk)", {
    cwd: process.cwd(),
  });
  return EDITORIAL_RULES_FALLBACK;
}

async function loadHalfLengthEditorialRules(): Promise<string> {
  try {
    const text = await readFile(HALF_LENGTH_RULES_PATH, "utf8");
    if (text.trim().length > 0) return text;
  } catch {
    /* fall through */
  }
  logSummarize("Half-length rules file missing; using embedded stub", {});
  return [
    "# Editorial Rules — Adaptive Half-Length Summary",
    "",
    "Return JSON only: {\"summary\":\"...\",\"confidence\":\"high|medium|low\",\"limitations\":\"...\"}",
    "",
    "Summary ~half the article length. Never invent facts. Use only the article body.",
  ].join("\n");
}

async function loadOneMinuteEditorialRules(): Promise<string> {
  try {
    const text = await readFile(ONE_MINUTE_RULES_PATH, "utf8");
    if (text.trim().length > 0) return text;
  } catch {
    /* fall through */
  }
  logSummarize("One-minute rules file missing; using embedded stub", {});
  return [
    "# Editorial Rules — 1 Minute News Summary",
    "",
    "Return JSON only: {\"summary\":\"...\",\"key_takeaway\":\"...\",\"confidence\":\"high|medium|low\",\"limitations\":\"...\"}",
    "",
    "Summary ~80–140 words, one-minute read. Never invent facts.",
  ].join("\n");
}

function logSummarize(message: string, context?: Record<string, string>) {
  console.error("[api/summarize]", message, context ?? {});
}

function isFeedMode(value: unknown): value is FeedMode {
  return value === "discover" || value === "relax" || value === "catchup";
}

function clampReadingTime(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 2;
  return Math.min(12, Math.max(1, Math.round(x)));
}

function stripCodeFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "");
    s = s.replace(/\s*```$/i, "");
  }
  return s.trim();
}

/**
 * Half-length = ~50% of article words. Band keeps models from returning ultra-short “abstracts”.
 */
function halfLengthSummaryWordTargets(articleWords: number): {
  min: number;
  max: number;
  target: number;
} {
  const target = Math.round(articleWords / 2);
  if (articleWords < 200) {
    return {
      target,
      min: Math.max(45, Math.floor(articleWords * 0.35)),
      max: Math.ceil(articleWords * 0.65),
    };
  }
  return {
    target,
    min: Math.max(90, Math.floor(articleWords * 0.44)),
    max: Math.ceil(articleWords * 0.56),
  };
}

/** ~1 minute read at editorial pace — summary field only. */
function oneMinuteSummaryWordBand(): { min: number; max: number; target: number } {
  return { min: 80, max: 140, target: 110 };
}

function deriveKeyPointsFromOneMinute(summary: string, keyTakeaway: string): string[] {
  const kp: string[] = [];
  const t = keyTakeaway.trim();
  if (t) kp.push(t);
  const sentences = summary
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 24);
  for (const s of sentences) {
    if (kp.length >= 5) break;
    const dup = kp.some(
      (x) =>
        s.slice(0, 48).toLowerCase() === x.slice(0, 48).toLowerCase() ||
        s.includes(x) ||
        x.includes(s),
    );
    if (!dup) kp.push(s);
  }
  const sum = summary.trim();
  while (kp.length < 3) {
    kp.push(sum.slice(0, Math.min(160, sum.length)) || "See summary.");
  }
  return kp.slice(0, 5);
}

function coerceSummary(obj: unknown): SummaryResponse | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const headline = typeof o.headline === "string" ? o.headline.trim() : "";
  const summary = typeof o.summary === "string" ? o.summary.trim() : "";
  const why_it_matters =
    typeof o.why_it_matters === "string" ? o.why_it_matters.trim() : "";
  const voice_script =
    typeof o.voice_script === "string" ? o.voice_script.trim() : "";
  const limitations =
    typeof o.limitations === "string" ? o.limitations.trim() : "";

  const key_points = Array.isArray(o.key_points)
    ? o.key_points
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const confidenceRaw = o.confidence;
  const confidence =
    typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
      ? Math.min(1, Math.max(0, confidenceRaw))
      : typeof confidenceRaw === "string" && confidenceRaw.trim() !== ""
        ? Math.min(1, Math.max(0, Number(confidenceRaw)))
        : 0;

  if (!headline || !summary) return null;
  if (key_points.length === 0) return null;

  return {
    headline,
    summary,
    key_points,
    why_it_matters: why_it_matters || "Not specified in model output.",
    confidence: Number.isFinite(confidence) ? confidence : 0,
    voice_script: voice_script || summary,
    limitations: limitations || "See summary; limitations not specified.",
  };
}

function confidenceWordToNumber(word: string): number {
  const w = word.trim().toLowerCase();
  if (!w) return 0.55;
  if (w === "high") return 0.82;
  if (w === "medium") return 0.55;
  if (w === "low") return 0.28;
  const n = Number(w);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
}

function deriveKeyPointsAndWhyFromHalfSummary(summary: string): {
  key_points: string[];
  why_it_matters: string;
} {
  const splitSentences = (s: string) =>
    s
      .split(/(?<=[.!?])\s+/)
      .map((x) => x.trim())
      .filter((x) => x.length > 10);

  let parts = splitSentences(summary);
  if (parts.length < 2) {
    parts = summary
      .split(/\n+/)
      .map((x) => x.trim())
      .filter((x) => x.length > 15);
  }
  if (parts.length < 2) {
    parts = summary
      .split(/;\s+/)
      .map((x) => x.trim())
      .filter((x) => x.length > 15);
  }
  if (parts.length < 3 && summary.includes(",")) {
    const bits = summary
      .split(/,\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 18);
    if (bits.length >= 3) parts = bits;
  }
  if (parts.length === 0) {
    parts = [summary.trim()];
  }

  let key_points = parts.slice(0, 5);
  if (key_points.length < 3) {
    const t = summary.trim();
    const third = Math.max(120, Math.floor(t.length / 3));
    key_points = [
      t.slice(0, third),
      t.slice(third, third * 2),
      t.slice(third * 2),
    ].map((s) => s.trim()).filter(Boolean);
    if (key_points.length < 3) {
      key_points = [t, t.slice(0, Math.min(200, t.length)), t.slice(-200)];
    }
  }

  const why_it_matters =
    parts.length >= 2 ? parts[parts.length - 1]! : summary.trim();

  return {
    key_points: key_points.slice(0, 5).filter(Boolean),
    why_it_matters,
  };
}

function coerceHalfLengthSummary(
  obj: unknown,
  articleTitle: string,
): SummaryResponse | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const summary = typeof o.summary === "string" ? o.summary.trim() : "";
  const limitations =
    typeof o.limitations === "string" ? o.limitations.trim() : "";
  const confRaw =
    typeof o.confidence === "string"
      ? o.confidence.trim()
      : typeof o.confidence === "number"
        ? String(o.confidence)
        : "";

  if (!summary) return null;

  const confidence = confidenceWordToNumber(confRaw);
  const { key_points, why_it_matters } =
    deriveKeyPointsAndWhyFromHalfSummary(summary);

  return {
    headline: articleTitle.trim() || "Brief",
    summary,
    key_points,
    why_it_matters,
    confidence,
    voice_script: summary.slice(0, 1200),
    limitations:
      limitations ||
      "Limitations were not specified in the model output.",
  };
}

function coerceOneMinuteSummary(
  obj: unknown,
  articleTitle: string,
): SummaryResponse | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const summary = typeof o.summary === "string" ? o.summary.trim() : "";
  const key_takeaway =
    typeof o.key_takeaway === "string" ? o.key_takeaway.trim() : "";
  const limitations =
    typeof o.limitations === "string" ? o.limitations.trim() : "";
  const confRaw =
    typeof o.confidence === "string"
      ? o.confidence.trim()
      : typeof o.confidence === "number"
        ? String(o.confidence)
        : "";

  if (!summary || !key_takeaway) return null;

  const confidence = confidenceWordToNumber(confRaw);
  const key_points = deriveKeyPointsFromOneMinute(summary, key_takeaway);

  return {
    headline: articleTitle.trim() || "Brief",
    summary,
    key_takeaway,
    key_points,
    why_it_matters: key_takeaway,
    confidence,
    voice_script: summary.slice(0, 1200),
    limitations:
      limitations ||
      "Limitations were not specified in the model output.",
  };
}

export async function POST(
  req: Request,
): Promise<NextResponse<SummarizeApiResult>> {
  try {
    return await postSummarize(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unexpected_error";
    logSummarize("Unhandled POST error", { reason: msg.slice(0, 200) });
    return NextResponse.json(
      {
        ok: false,
        error: "Summarization hit an unexpected server error.",
        code: "INTERNAL",
      },
      { status: 500 },
    );
  }
}

async function postSummarize(
  req: Request,
): Promise<NextResponse<SummarizeApiResult>> {
  let body: Partial<SummaryRequest>;
  try {
    body = (await req.json()) as Partial<SummaryRequest>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body.", code: "VALIDATION" },
      { status: 400 },
    );
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const articleBodyRaw =
    typeof body.body === "string" ? body.body.trim() : "";
  const articleBody = cleanArticleContentWithFallback(articleBodyRaw);
  const mode = body.mode;
  const readingTimeMinutes = clampReadingTime(body.readingTimeMinutes);
  const userQuery =
    typeof body.userQuery === "string" ? body.userQuery.trim() : "";

  if (!title || !articleBodyRaw) {
    return NextResponse.json(
      {
        ok: false,
        error: "Title and body are required.",
        code: "VALIDATION",
      },
      { status: 400 },
    );
  }

  if (!isFeedMode(mode)) {
    return NextResponse.json(
      { ok: false, error: "Invalid mode.", code: "VALIDATION" },
      { status: 400 },
    );
  }

  if (articleBody.length < 120) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "The article text available for summarization is too short for a reliable brief.",
        code: "INSUFFICIENT_SOURCE",
      },
      { status: 422 },
    );
  }

  const useHalfLengthAdapter =
    readingTimeMinutes === HALF_LENGTH_READING_MINUTES;
  const useOneMinuteAdapter =
    readingTimeMinutes === ONE_MINUTE_READING_MINUTES;
  const editorialRules = useHalfLengthAdapter
    ? await loadHalfLengthEditorialRules()
    : useOneMinuteAdapter
      ? await loadOneMinuteEditorialRules()
      : await loadEditorialRules();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logSummarize("OPENAI_API_KEY is not set");
    return NextResponse.json(
      {
        ok: false,
        error: "Summarization is not configured (missing server credentials).",
        code: "OPENAI_ERROR",
      },
      { status: 503 },
    );
  }

  const client = new OpenAI({ apiKey });

  const wordCount = articleBody.trim()
    ? articleBody.trim().split(/\s+/).filter(Boolean).length
    : 0;
  const halfBand = useHalfLengthAdapter
    ? halfLengthSummaryWordTargets(wordCount)
    : null;
  const oneMinuteBand = useOneMinuteAdapter ? oneMinuteSummaryWordBand() : null;

  const system = useHalfLengthAdapter
    ? [
        "You are an editorial summarization assistant.",
        "Follow the editorial rules exactly.",
        "Output JSON only — no markdown fences, no prose outside the JSON object.",
        "Use only these keys: summary (string), confidence (string: high, medium, or low), limitations (string).",
        "",
        "## Editorial rules (authoritative)",
        editorialRules,
      ].join("\n")
    : useOneMinuteAdapter
      ? [
          "You are an editorial summarization assistant.",
          "Follow the editorial rules exactly.",
          "Output JSON only — no markdown fences, no prose outside the JSON object.",
          "Use only these keys: summary (string), key_takeaway (string, one sentence), confidence (string: high, medium, or low), limitations (string).",
          "",
          "## Editorial rules (authoritative)",
          editorialRules,
        ].join("\n")
      : [
          "You are an editorial tooling assistant for a news reading experience.",
          "Follow the editorial rules exactly. Output JSON only — no markdown, no prose outside JSON.",
          "",
          "## Editorial rules (authoritative)",
          editorialRules,
        ].join("\n");

  const user = useHalfLengthAdapter
    ? [
        `Mode (tone context for prose): ${mode}`,
        "",
        "Article title:",
        title,
        "",
        `Article word count (space-separated, approximate): ${wordCount}.`,
        halfBand
          ? [
              "",
              "Hard length requirement for the `summary` field only:",
              `- Must be between ${halfBand.min} and ${halfBand.max} words inclusive (count words as space-separated tokens).`,
              `- Aim for about ${halfBand.target} words (~50% of the article).`,
              `- Summaries far below the minimum read like a short abstract, not a half-length article — add proportional narrative detail (facts, names, dates, cause-effect) until you are in range.`,
              `- Do not exceed the maximum; tighten wording if needed.`,
            ].join("\n")
          : "",
        "",
        "Article body (already cleaned of unrelated page modules):",
        articleBody.slice(0, 12000),
        "",
        userQuery &&
          userQuery !==
            "Produce a fresh briefing aligned to the selected mode and reading time."
          ? `Reader note (honor if relevant): ${userQuery}`
          : "",
      ]
        .filter((line) => line !== "")
        .join("\n")
    : useOneMinuteAdapter
      ? [
          `Mode (tone context for prose): ${mode}`,
          "",
          "Article title:",
          title,
          "",
          `Article word count (space-separated, approximate): ${wordCount}.`,
          "",
          "Hard length requirement for the `summary` field only:",
          `- Must be between ${oneMinuteBand!.min} and ${oneMinuteBand!.max} words inclusive (count words as space-separated tokens).`,
          `- Aim for about ${oneMinuteBand!.target} words (~one minute of reading).`,
          `- key_takeaway must be exactly one sentence (why it matters / broader implication); do not repeat the headline.`,
          "",
          "Article body (already cleaned of unrelated page modules):",
          articleBody.slice(0, 12000),
          "",
          userQuery &&
            userQuery !==
              "Produce a fresh briefing aligned to the selected mode and reading time."
            ? `Reader note (honor if relevant): ${userQuery}`
            : "",
        ]
          .filter((line) => line !== "")
          .join("\n")
      : [
          `Mode: ${mode}`,
          `Target reading time (minutes): ${readingTimeMinutes}`,
          "",
          "Article title:",
          title,
          "",
          "Article text:",
          articleBody.slice(0, 12000),
          "",
          userQuery
            ? `Reader question / instruction (may be empty; honor if relevant): ${userQuery}`
            : "Reader question / instruction: (none)",
        ].join("\n");

  let completion: OpenAI.Chat.Completions.ChatCompletion;
  try {
    completion = await client.chat.completions.create({
      model: process.env.OPENAI_SUMMARY_MODEL ?? "gpt-4o-mini",
      temperature: useHalfLengthAdapter ? 0.22 : useOneMinuteAdapter ? 0.24 : 0.35,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    logSummarize("OpenAI request failed", {
      status: err?.status != null ? String(err.status) : "unknown",
      message: err?.message ? err.message.slice(0, 200) : "error",
    });
    return NextResponse.json(
      {
        ok: false,
        error: "Summarization failed. Please try again.",
        code: "OPENAI_ERROR",
      },
      { status: 502 },
    );
  }

  const rawText = completion.choices[0]?.message?.content ?? "";
  const jsonText = stripCodeFences(rawText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    logSummarize("JSON parse failed", { snippet: jsonText.slice(0, 120) });
    return NextResponse.json(
      { ok: false, error: "Model returned invalid JSON.", code: "PARSE_ERROR" },
      { status: 502 },
    );
  }

  let data = useHalfLengthAdapter
    ? coerceHalfLengthSummary(parsed, title)
    : useOneMinuteAdapter
      ? coerceOneMinuteSummary(parsed, title)
      : coerceSummary(parsed);
  if (!data) {
    logSummarize("JSON failed validation");
    return NextResponse.json(
      {
        ok: false,
        error: "Model output did not match the expected schema.",
        code: "PARSE_ERROR",
      },
      { status: 502 },
    );
  }

  if (
    useHalfLengthAdapter &&
    halfBand &&
    wordCount >= 200 &&
    data.summary
  ) {
    let summaryWords = countWords(data.summary);
    if (summaryWords < halfBand.min || summaryWords > halfBand.max) {
      logSummarize("Half-length summary outside word band; repair pass", {
        summaryWords: String(summaryWords),
        min: String(halfBand.min),
        max: String(halfBand.max),
        articleWords: String(wordCount),
      });
      const tooShort = summaryWords < halfBand.min;
      const repairUser = [
        "Revision only. Output JSON only with keys: summary (string), confidence (string: high|medium|low), limitations (string).",
        "",
        `Article word count (approximate): ${wordCount}.`,
        `Your previous summary was ${summaryWords} words.`,
        `Required for summary: ${halfBand.min}–${halfBand.max} words inclusive (~half). Aim for ~${halfBand.target}.`,
        tooShort
          ? "Too short: expand with substantive detail from the article (events, quotes, names, dates, stakes, cause-effect) until the summary is in range. Do not add filler or speculation."
          : "Too long: compress by merging sentences and removing repetition while preserving facts; stay in range.",
        "",
        "Article title:",
        title,
        "",
        "Article body:",
        articleBody.slice(0, 12000),
      ].join("\n");
      try {
        const repairCompletion = await client.chat.completions.create({
          model: process.env.OPENAI_SUMMARY_MODEL ?? "gpt-4o-mini",
          temperature: 0.18,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: repairUser },
          ],
        });
        const repairRaw = repairCompletion.choices[0]?.message?.content ?? "";
        const repairParsed = JSON.parse(stripCodeFences(repairRaw)) as unknown;
        const repaired = coerceHalfLengthSummary(repairParsed, title);
        if (repaired) {
          data = repaired;
          summaryWords = countWords(data.summary);
          logSummarize("Half-length repair pass result", {
            summaryWords: String(summaryWords),
          });
        }
      } catch (err) {
        logSummarize("Half-length repair pass failed; keeping first summary", {
          reason:
            err instanceof Error ? err.message.slice(0, 120) : "parse_or_api",
        });
      }
    }
  }

  if (
    useOneMinuteAdapter &&
    oneMinuteBand &&
    wordCount >= 200 &&
    data.summary
  ) {
    let summaryWords = countWords(data.summary);
    if (
      summaryWords < oneMinuteBand.min ||
      summaryWords > oneMinuteBand.max
    ) {
      logSummarize("One-minute summary outside word band; repair pass", {
        summaryWords: String(summaryWords),
        min: String(oneMinuteBand.min),
        max: String(oneMinuteBand.max),
        articleWords: String(wordCount),
      });
      const tooShort = summaryWords < oneMinuteBand.min;
      const repairUser = [
        "Revision only. Output JSON only with keys: summary (string), key_takeaway (string, one sentence), confidence (string: high|medium|low), limitations (string).",
        "",
        `Article word count (approximate): ${wordCount}.`,
        `Your previous summary was ${summaryWords} words.`,
        `Required for summary: ${oneMinuteBand.min}–${oneMinuteBand.max} words inclusive (~one minute). Aim for ~${oneMinuteBand.target}.`,
        tooShort
          ? "Too short: add only high-value facts and context from the article until the summary is in range."
          : "Too long: tighten wording; remove secondary detail; stay in range.",
        "",
        "Preserve key_takeaway as one sentence (refresh if it no longer matches the revised summary).",
        "",
        "Article title:",
        title,
        "",
        "Article body:",
        articleBody.slice(0, 12000),
      ].join("\n");
      try {
        const repairCompletion = await client.chat.completions.create({
          model: process.env.OPENAI_SUMMARY_MODEL ?? "gpt-4o-mini",
          temperature: 0.18,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: repairUser },
          ],
        });
        const repairRaw = repairCompletion.choices[0]?.message?.content ?? "";
        const repairParsed = JSON.parse(stripCodeFences(repairRaw)) as unknown;
        const repaired = coerceOneMinuteSummary(repairParsed, title);
        if (repaired) {
          data = repaired;
          summaryWords = countWords(data.summary);
          logSummarize("One-minute repair pass result", {
            summaryWords: String(summaryWords),
          });
        }
      } catch (err) {
        logSummarize("One-minute repair pass failed; keeping first summary", {
          reason:
            err instanceof Error ? err.message.slice(0, 120) : "parse_or_api",
        });
      }
    }
  }

  return NextResponse.json({ ok: true, data });
}
