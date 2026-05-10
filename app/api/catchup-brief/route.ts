import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { CatchupBriefApiResult, CatchupBriefResponse } from "@/lib/types";
import { cleanArticleContentWithFallback } from "@/lib/clean-article-content";

export const runtime = "nodejs";
export const maxDuration = 45;

const RULES_PATH = path.join(
  process.cwd(),
  "lib",
  "editorial-rules-catchup.md",
);

function stripCodeFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "");
    s = s.replace(/\s*```$/i, "");
  }
  return s.trim();
}

function coerceCatchupBrief(obj: unknown): CatchupBriefResponse | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const one_liner =
    typeof o.one_liner === "string" ? o.one_liner.trim() : "";
  const limitations =
    typeof o.limitations === "string" ? o.limitations.trim() : "";
  const confRaw =
    typeof o.confidence === "string" ? o.confidence.trim().toLowerCase() : "";

  let key_points = Array.isArray(o.key_points)
    ? o.key_points
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  if (key_points.length === 0) return null;
  if (key_points.length === 1) {
    key_points = [key_points[0]!, key_points[0]!];
  } else {
    key_points = key_points.slice(0, 2);
  }

  const confidence =
    confRaw === "high" || confRaw === "medium" || confRaw === "low"
      ? confRaw
      : "medium";

  return {
    one_liner: one_liner || "Why this story matters now.",
    key_points: [key_points[0]!, key_points[1]!],
    confidence,
    limitations:
      limitations || "Limitations were not specified in the model output.",
  };
}

export async function POST(
  req: Request,
): Promise<NextResponse<CatchupBriefApiResult>> {
  let payload: { title?: string; body?: string };
  try {
    payload = (await req.json()) as { title?: string; body?: string };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body.", code: "VALIDATION" },
      { status: 400 },
    );
  }

  const title =
    typeof payload.title === "string" ? payload.title.trim() : "";
  const rawBody =
    typeof payload.body === "string" ? payload.body.trim() : "";
  const articleBody = cleanArticleContentWithFallback(rawBody);

  if (!title || !rawBody) {
    return NextResponse.json(
      { ok: false, error: "Title and body are required.", code: "VALIDATION" },
      { status: 400 },
    );
  }

  if (articleBody.length < 120) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "The article text available is too short for a reliable catchup brief.",
        code: "INSUFFICIENT_SOURCE",
      },
      { status: 422 },
    );
  }

  let editorialRules: string;
  try {
    editorialRules = await readFile(RULES_PATH, "utf8");
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Catchup editorial rules are unavailable.",
        code: "INTERNAL",
      },
      { status: 500 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
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

  const system = [
    "You are an editorial assistant for a catchup news feed.",
    "Follow the editorial rules exactly.",
    "Output JSON only — no markdown fences, no prose outside the JSON object.",
    "Required keys: one_liner (string, one sentence, 8–12 words), key_points (array of EXACTLY 2 strings), confidence (string: high, medium, or low), limitations (string).",
    "",
    "## Editorial rules (authoritative)",
    editorialRules,
  ].join("\n");

  const user = [
    "Article title:",
    title,
    "",
    "Article body (cleaned):",
    articleBody.slice(0, 12_000),
  ].join("\n");

  let completion: OpenAI.Chat.Completions.ChatCompletion;
  try {
    completion = await client.chat.completions.create({
      model: process.env.OPENAI_SUMMARY_MODEL ?? "gpt-4o-mini",
      temperature: 0.28,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Catchup brief generation failed. Please try again.",
        code: "OPENAI_ERROR",
      },
      { status: 502 },
    );
  }

  const rawText = completion.choices[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(rawText)) as unknown;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Model returned invalid JSON.", code: "PARSE_ERROR" },
      { status: 502 },
    );
  }

  const data = coerceCatchupBrief(parsed);
  if (!data) {
    return NextResponse.json(
      {
        ok: false,
        error: "Model output did not match the expected schema.",
        code: "PARSE_ERROR",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, data });
}
