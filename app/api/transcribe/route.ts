import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

function getErrorStatus(e: unknown): number | null {
  if (!e || typeof e !== "object" || !("status" in e)) return null;
  const status = (e as { status?: unknown }).status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}

function extensionFromMime(type: string): string {
  if (type.includes("mp4")) return "m4a";
  if (type.includes("mpeg")) return "mp3";
  if (type.includes("wav")) return "wav";
  if (type.includes("ogg")) return "ogg";
  return "webm";
}

export async function POST(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();
  console.log(`[api/transcribe:${requestId}] Request received`);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(`[api/transcribe:${requestId}] OPENAI_API_KEY is not configured`);
    return NextResponse.json(
      { ok: false, error: "OpenAI is not configured on the server." },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid form data." },
      { status: 400 },
    );
  }

  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "Audio file is required." },
      { status: 400 },
    );
  }

  if (audio.size <= 0) {
    return NextResponse.json(
      { ok: false, error: "Recorded audio is empty." },
      { status: 400 },
    );
  }

  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Recording is too large. Try a shorter question." },
      { status: 413 },
    );
  }

  const type = audio.type || "audio/webm";
  const file = new File([await audio.arrayBuffer()], `question.${extensionFromMime(type)}`, {
    type,
  });

  try {
    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe";
    console.log(`[api/transcribe:${requestId}] Transcribing audio`, {
      model,
      bytes: file.size,
      type: file.type,
    });

    const transcription = await client.audio.transcriptions.create({
      model,
      file,
    });

    const text =
      typeof transcription.text === "string" ? transcription.text.trim() : "";

    console.log(`[api/transcribe:${requestId}] Transcription complete`, {
      chars: text.length,
      ms: Date.now() - startedAt,
    });

    if (!text) {
      return NextResponse.json(
        { ok: false, error: "No speech was detected." },
        { status: 422 },
      );
    }

    return NextResponse.json({ ok: true, text });
  } catch (e) {
    const status = getErrorStatus(e) ?? 502;
    console.error(`[api/transcribe:${requestId}] OpenAI transcription failed`, {
      status,
      ms: Date.now() - startedAt,
      message: e instanceof Error ? e.message : "Unknown error",
    });
    const message =
      status === 401
        ? "OpenAI rejected the configured API key."
        : status === 429
          ? "OpenAI transcription is rate limited. Try again shortly."
          : "Could not transcribe the recording. Try again.";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
