import { NextResponse } from "next/server";
import OpenAI from "openai";
import { cleanArticleContentWithFallback } from "@/lib/clean-article-content";

export const runtime = "nodejs";
export const maxDuration = 30;

type OkBody = { ok: true; gist: string };
type ErrBody = { ok: false; error: string };

function logGist(message: string, context?: Record<string, string>) {
  console.error("[api/article-gist]", message, context ?? {});
}

function stripCodeFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "");
    s = s.replace(/\s*```$/i, "");
  }
  return s.trim();
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export async function POST(req: Request): Promise<NextResponse<OkBody | ErrBody>> {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const o = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const title = typeof o.title === "string" ? o.title.trim() : "";
  const body = typeof o.body === "string" ? o.body.trim() : "";

  if (!title || !body) {
    return NextResponse.json(
      { ok: false, error: "Title and body are required." },
      { status: 400 },
    );
  }

  const cleanedBody = cleanArticleContentWithFallback(body);

  if (cleanedBody.length < 80) {
    return NextResponse.json(
      { ok: false, error: "Article text is too short for a reliable gist." },
      { status: 422 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logGist("OPENAI_API_KEY is not set");
    return NextResponse.json(
      { ok: false, error: "OpenAI is not configured on the server." },
      { status: 503 },
    );
  }

  const client = new OpenAI({ apiKey });
  const model =
    process.env.OPENAI_GIST_MODEL ??
    process.env.OPENAI_SUMMARY_MODEL ??
    "gpt-4o-mini";

    const system = [
      "You write a single-sentence editorial deck (subtitle) for a modern AI-native news reader.",
      "Your goal is to psychologically attract curiosity and encourage deeper reading while preserving editorial credibility.",
      "Rules:",
      "- Output JSON only with shape: {\"gist\":\"...\"}",
      "- Exactly one sentence; maximum 10-12 words for the gist string.",
      "- Do not repeat or lightly rephrase the headline.",
      "- Add emotional, contextual, behavioral, political, social, or human stakes from the article body.",
      "- Create curiosity through tension, implication, contrast, consequence, or unanswered context.",
      "- The reader should feel: Why did this happen? What does this mean? What happens next?",
      "- Prefer implications over summaries.",
      "- Sound intelligent, modern, and editorially sharp.",
      "- Avoid sensationalism, clickbait, fearmongering, outrage framing, partisan framing, or exaggeration.",
      "- Use only information supported by the article text.",
      "- If the article text is thin, generate a subtle contextual hook instead of fabricating specifics.",
      "- Preserve the original meaning and emotional tone of the reporting.",
      "- Never distort facts to increase engagement.",
      "- Curiosity should come from implication and context, not manipulation.",
      "- Make complex stories approachable without oversimplifying them.",
      "- Maintain clarity about uncertainty, nuance, and evolving information.",
      "- Respect the intelligence of the reader.",
      "- The goal is to help broader audiences engage with journalism without compromising editorial standards.",
      "- No markdown, no quotes around the whole sentence, no source name unless contextually necessary.",
    ].join("\n");

  const user = [
    "Headline:",
    title,
    "",
    "Article text:",
    cleanedBody.slice(0, 14_000),
  ].join("\n");

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const rawText = completion.choices[0]?.message?.content ?? "";
    const jsonText = stripCodeFences(rawText);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText) as unknown;
    } catch {
      logGist("JSON parse failed", { snippet: jsonText.slice(0, 120) });
      return NextResponse.json(
        { ok: false, error: "Model returned invalid JSON." },
        { status: 502 },
      );
    }

    const rec = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const gistRaw = typeof rec.gist === "string" ? rec.gist.trim() : "";
    const gist = oneLine(gistRaw);

    if (!gist || gist.length < 12) {
      return NextResponse.json(
        { ok: false, error: "Model returned an empty gist." },
        { status: 502 },
      );
    }

    const clipped = gist.length > 280 ? `${gist.slice(0, 277)}…` : gist;
    return NextResponse.json({ ok: true, gist: clipped });
  } catch (e) {
    const err = e as { message?: string };
    logGist("OpenAI request failed", {
      message: err?.message ? err.message.slice(0, 200) : "error",
    });
    return NextResponse.json(
      { ok: false, error: "Could not generate gist. Try again later." },
      { status: 502 },
    );
  }
}
