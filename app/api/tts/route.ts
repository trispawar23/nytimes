import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";
const DEFAULT_TTS_VOICE = "coral";
const OPENAI_TTS_FORMAT_VALUES = ["mp3", "opus", "aac", "flac", "wav", "pcm"] as const;
type OpenAITtsFormat = (typeof OPENAI_TTS_FORMAT_VALUES)[number];

const DEFAULT_TTS_FORMAT: OpenAITtsFormat = "aac";
const MAX_TTS_INPUT_CHARS = 6000;

const OPENAI_TTS_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
]);

const OPENAI_TTS_FORMATS = new Set<string>(OPENAI_TTS_FORMAT_VALUES);

const TTS_CONTENT_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  opus: "audio/ogg",
  aac: "audio/aac",
  flac: "audio/flac",
  wav: "audio/wav",
  pcm: "audio/pcm",
};

type TtsRequestBody = {
  text?: unknown;
  voice?: unknown;
  format?: unknown;
};

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function getErrorStatus(e: unknown): number | null {
  if (!e || typeof e !== "object" || !("status" in e)) return null;
  const status = (e as { status?: unknown }).status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}

function isTtsFormat(value: string): value is OpenAITtsFormat {
  return OPENAI_TTS_FORMATS.has(value);
}

export async function POST(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();
  console.log(`[api/tts:${requestId}] Request received`);

  let payload: TtsRequestBody;
  try {
    payload = (await req.json()) as TtsRequestBody;
  } catch {
    console.error(`[api/tts:${requestId}] Invalid JSON body`);
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const rawText = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!rawText) {
    console.error(`[api/tts:${requestId}] Missing article text`);
    return NextResponse.json(
      { ok: false, error: "Article text is required." },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(`[api/tts:${requestId}] OPENAI_API_KEY is not configured`);
    return NextResponse.json(
      { ok: false, error: "OpenAI is not configured on the server." },
      { status: 503 },
    );
  }

  const requestedVoice =
    typeof payload.voice === "string" ? payload.voice.trim() : "";
  const configuredVoice = process.env.OPENAI_TTS_VOICE?.trim() ?? "";
  const voice = OPENAI_TTS_VOICES.has(requestedVoice)
    ? requestedVoice
    : OPENAI_TTS_VOICES.has(configuredVoice)
      ? configuredVoice
      : DEFAULT_TTS_VOICE;

  const requestedFormat =
    typeof payload.format === "string" ? payload.format.trim() : "";
  const configuredFormat = process.env.OPENAI_TTS_FORMAT?.trim() ?? "";
  const responseFormat = isTtsFormat(requestedFormat)
    ? requestedFormat
    : isTtsFormat(configuredFormat)
      ? configuredFormat
      : DEFAULT_TTS_FORMAT;

  const clippedText =
    rawText.length > MAX_TTS_INPUT_CHARS
      ? `${rawText.slice(0, MAX_TTS_INPUT_CHARS - 1).trim()}...`
      : rawText;
  const model = process.env.OPENAI_TTS_MODEL ?? DEFAULT_TTS_MODEL;

  console.log(`[api/tts:${requestId}] Generating speech`, {
    model,
    voice,
    responseFormat,
    chars: clippedText.length,
    truncated: clippedText.length !== rawText.length,
  });

  try {
    const client = new OpenAI({ apiKey });
    const audio = await client.audio.speech.create({
      model,
      voice,
      input: clippedText,
      instructions: oneLine("Read this news article clearly and neutrally."),
      response_format: responseFormat,
    });

    const audioBuffer = await audio.arrayBuffer();
    console.log(`[api/tts:${requestId}] Speech generated`, {
      bytes: audioBuffer.byteLength,
      ms: Date.now() - startedAt,
    });
    return new Response(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": TTS_CONTENT_TYPES[responseFormat] ?? "audio/aac",
        "Cache-Control": "no-store",
        "X-OpenAI-TTS-Format": responseFormat,
        "X-OpenAI-TTS-Voice": voice,
      },
    });
  } catch (e) {
    const status = getErrorStatus(e) ?? 502;
    console.error(`[api/tts:${requestId}] OpenAI speech request failed`, {
      status,
      ms: Date.now() - startedAt,
      message: e instanceof Error ? e.message : "Unknown error",
    });
    const message =
      status === 401
        ? "OpenAI rejected the configured API key."
        : status === 429
          ? "OpenAI text-to-speech is rate limited. Try again shortly."
          : "Could not generate article audio. Try again later.";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
