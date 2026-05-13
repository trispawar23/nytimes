/** Global listen session backed by the server-side OpenAI Speech endpoint. */

/** Keep request sizes bounded for article-length playback. */
export const PUTER_TTS_MAX_CHARS = 6000;
export const PUTER_SAFE_SLICE = 5900;
const OPENAI_TTS_FIRST_CHUNK_CHARS = 650;
const OPENAI_TTS_FIRST_SAFE_SLICE = 580;
const OPENAI_TTS_CHUNK_CHARS = 1400;
const OPENAI_TTS_SAFE_CHUNK_SLICE = 1320;
const TTS_AUDIO_CACHE_MAX_ENTRIES = 24;
const TTS_RESPONSE_FORMAT = "aac";

export type PuterPlaybackPhase =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "error";

export function buildArticleSpeechText(title: string, body: string): string {
  const t = title.trim();
  const b = body.trim();
  return b ? `${t}.\n\n${b}` : `${t}.`;
}

type Listener = () => void;
const listeners = new Set<Listener>();

export type PuterListenMeta = {
  articleId: string;
  imageUrl: string | null;
};

let activeKey: string | null = null;
let activePhase: PuterPlaybackPhase = "idle";
let activeMeta: PuterListenMeta | null = null;
let activeAudio: HTMLAudioElement | null = null;
let activeRequest: AbortController | null = null;
let activeRunId = 0;

type CachedAudioEntry = {
  url: string;
  bytes: number;
  contentType: string;
  lastUsed: number;
};

const audioCache = new Map<string, Promise<CachedAudioEntry>>();

/**
 * A tiny silent WAV. Playing this immediately inside the user's tap primes
 * Safari/iOS/PWA audio permission before the async OpenAI request resolves.
 */
const SILENT_AUDIO_DATA_URI =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQQAAAAAAA==";

export type PuterPlaybackSnapshot = {
  key: string | null;
  phase: PuterPlaybackPhase;
  meta: PuterListenMeta | null;
  paused: boolean;
};

let snapshot: PuterPlaybackSnapshot = {
  key: null,
  phase: "idle",
  meta: null,
  paused: false,
};

function computePaused(): boolean {
  return activePhase === "paused";
}

function notify() {
  snapshot = {
    key: activeKey,
    phase: activePhase,
    meta: activeMeta,
    paused: computePaused(),
  };
  listeners.forEach((l) => l());
}

export function subscribePuterPlayback(onStoreChange: Listener): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function getPuterPlaybackSnapshot(): PuterPlaybackSnapshot {
  return snapshot;
}

/** Same listen session, new key (e.g. feed dock → reader UI). */
export function replacePlaybackKeyIfMatch(fromKey: string, toKey: string): void {
  if (activeKey !== fromKey) return;
  activeKey = toKey;
  notify();
}

function finishPlayback() {
  releaseAudio();
  activeKey = null;
  activePhase = "idle";
  activeMeta = null;
  notify();
}

function releaseAudio(): void {
  if (activeRequest) {
    activeRequest.abort();
    activeRequest = null;
  }
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.removeAttribute("src");
    activeAudio.load();
    activeAudio = null;
  }
}

export function stopPuterPlayback(): void {
  activeRunId += 1;
  releaseAudio();
  activeKey = null;
  activePhase = "idle";
  activeMeta = null;
  notify();
}

export function togglePuterPlaybackPause(): void {
  if (!activeAudio || !activeKey) return;

  if (!activeAudio.paused && activePhase === "playing") {
    activeAudio.pause();
    activePhase = "paused";
    notify();
    return;
  }

  if (activePhase === "paused") {
    void activeAudio
      .play()
      .then(() => {
        activePhase = "playing";
        notify();
      })
      .catch((e: unknown) => {
        console.error("[tts/client] Resume failed", {
          key: activeKey,
          error: describeError(e),
        });
      });
  }
}

function isAbortLike(e: unknown): boolean {
  return (
    (e instanceof DOMException && e.name === "AbortError") ||
    (e instanceof Error && e.name === "AbortError")
  );
}

function describeError(e: unknown): Record<string, unknown> {
  if (e instanceof Error) {
    return {
      name: e.name,
      message: e.message,
      stack: e.stack,
    };
  }
  if (e && typeof e === "object") {
    return {
      type: Object.prototype.toString.call(e),
      value: e,
    };
  }
  return {
    type: typeof e,
    value: e,
  };
}

function chooseChunkCut(rest: string, maxChars: number, safeSlice: number): number {
  if (rest.length <= maxChars) return rest.length;
  const slice = rest.slice(0, safeSlice);
  const sentenceBreak = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("? "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("\n\n"),
  );
  const commaBreak = slice.lastIndexOf(", ");
  const spaceBreak = slice.lastIndexOf(" ");
  const sentenceMin = Math.min(420, Math.floor(safeSlice * 0.72));
  const commaMin = Math.min(520, Math.floor(safeSlice * 0.78));
  const spaceMin = Math.min(360, Math.floor(safeSlice * 0.65));

  if (sentenceBreak > sentenceMin) return sentenceBreak + 1;
  if (commaBreak > commaMin) return commaBreak + 1;
  if (spaceBreak > spaceMin) return spaceBreak;
  return safeSlice;
}

function splitSpeechIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  let first = true;

  while (rest.length > (first ? OPENAI_TTS_FIRST_CHUNK_CHARS : OPENAI_TTS_CHUNK_CHARS)) {
    const cut = chooseChunkCut(
      rest,
      first ? OPENAI_TTS_FIRST_CHUNK_CHARS : OPENAI_TTS_CHUNK_CHARS,
      first ? OPENAI_TTS_FIRST_SAFE_SLICE : OPENAI_TTS_SAFE_CHUNK_SLICE,
    );

    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
    first = false;
  }

  if (rest) chunks.push(rest);
  return chunks;
}

function cacheKeyForText(text: string): string {
  return `${TTS_RESPONSE_FORMAT}:${text}`;
}

function trimAudioCache(): void {
  while (audioCache.size > TTS_AUDIO_CACHE_MAX_ENTRIES) {
    const oldestKey = audioCache.keys().next().value as string | undefined;
    if (!oldestKey) return;
    const evicted = audioCache.get(oldestKey);
    audioCache.delete(oldestKey);
    void evicted?.then((entry) => URL.revokeObjectURL(entry.url));
  }
}

async function requestGeneratedAudioEntry(options: {
  key: string;
  runId: number | null;
  text: string;
  chunkIndex: number;
  chunkCount: number;
  reason: "prefetch" | "playback";
}): Promise<CachedAudioEntry> {
  const { key, runId, text, chunkIndex, chunkCount } = options;
  const audioCacheKey = cacheKeyForText(text);
  const cached = audioCache.get(audioCacheKey);

  if (cached) {
    console.log("[tts/client] Audio cache hit", {
      key,
      chunk: chunkIndex + 1,
      chunks: chunkCount,
      reason: options.reason,
    });
    const entry = await cached;
    entry.lastUsed = Date.now();
    return entry;
  }

  const request = runId === null ? null : new AbortController();
  if (request) activeRequest = request;

  console.log("[tts/client] Requesting generated audio chunk", {
    key,
    chunk: chunkIndex + 1,
    chunks: chunkCount,
    chars: text.length,
    reason: options.reason,
  });

  const promise = (async (): Promise<CachedAudioEntry> => {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, format: TTS_RESPONSE_FORMAT }),
      signal: request?.signal,
    });

    if (request && activeRequest === request) {
      activeRequest = null;
    }

    if (runId !== null && activeRunId !== runId) {
      throw new DOMException("Superseded by another listen request.", "AbortError");
    }

    if (!res.ok) {
      console.error("[tts/client] TTS API returned an error", {
        key,
        chunk: chunkIndex + 1,
        status: res.status,
      });
      let message = "Could not generate article audio. Try again later.";
      try {
        const json = (await res.json()) as { error?: unknown };
        if (typeof json.error === "string" && json.error.trim()) {
          message = json.error.trim();
        }
      } catch {
        /* keep generic message */
      }
      throw new Error(message);
    }

    const blob = await res.blob();
    if (runId !== null && activeRunId !== runId) {
      throw new DOMException("Superseded by another listen request.", "AbortError");
    }

    console.log("[tts/client] Received generated audio chunk", {
      key,
      chunk: chunkIndex + 1,
      chunks: chunkCount,
      contentType: blob.type,
      bytes: blob.size,
    });

    const objectUrl = URL.createObjectURL(blob);
    return {
      url: objectUrl,
      bytes: blob.size,
      contentType: blob.type,
      lastUsed: Date.now(),
    };
  })();

  audioCache.set(audioCacheKey, promise);

  try {
    const entry = await promise;
    trimAudioCache();
    return entry;
  } catch (e) {
    audioCache.delete(audioCacheKey);
    if (request && activeRequest === request) {
      activeRequest = null;
    }
    throw e;
  }
}

function getSpeechChunks(raw: string): string[] {
  const truncated = raw.length > PUTER_TTS_MAX_CHARS;
  const textForSpeech = truncated
    ? `${raw.slice(0, PUTER_SAFE_SLICE).trim()}…`
    : raw;
  return splitSpeechIntoChunks(textForSpeech);
}

export function prefetchPuterListen(options: {
  key: string;
  speechText: string;
}): void {
  const raw = options.speechText.trim();
  if (!raw || typeof window === "undefined") return;
  const chunks = getSpeechChunks(raw);
  if (chunks.length === 0) return;

  console.log("[tts/client] Prefetching first audio chunk", {
    key: options.key,
    chars: chunks[0]!.length,
    chunks: chunks.length,
  });

  void requestGeneratedAudioEntry({
    key: options.key,
    runId: null,
    text: chunks[0]!,
    chunkIndex: 0,
    chunkCount: chunks.length,
    reason: "prefetch",
  }).catch((e: unknown) => {
    console.info("[tts/client] Audio prefetch skipped or failed", {
      key: options.key,
      error: describeError(e),
    });
  });
}

function createPlaybackAudio(): HTMLAudioElement {
  const audio = new Audio();
  audio.preload = "auto";
  audio.setAttribute("playsinline", "true");
  return audio;
}

async function primeAudioForSafari(
  audio: HTMLAudioElement,
  key: string,
): Promise<void> {
  const previousMuted = audio.muted;
  audio.muted = true;
  audio.src = SILENT_AUDIO_DATA_URI;
  audio.load();

  try {
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    console.log("[tts/client] Audio element primed", { key });
  } catch (e) {
    console.info("[tts/client] Audio priming was blocked", {
      key,
      error: describeError(e),
    });
  } finally {
    audio.muted = previousMuted;
  }
}

function attachPlaybackHandlers(
  audio: HTMLAudioElement,
  key: string,
  runId: number,
  onEnded: () => void,
): void {
  audio.onplay = () => {
    if (activeAudio !== audio || activeRunId !== runId) return;
    activePhase = "playing";
    notify();
  };
  audio.onpause = () => {
    if (activeAudio !== audio || activeRunId !== runId) return;
    if (activePhase !== "playing") return;
    activePhase = "paused";
    notify();
  };
  audio.onended = () => {
    if (activeAudio !== audio || activeRunId !== runId) return;
    onEnded();
  };
  audio.onerror = () => {
    if (activeAudio !== audio || activeRunId !== runId) return;
    console.error("[tts/client] Audio element error", {
      key,
      networkState: audio.networkState,
      readyState: audio.readyState,
      mediaError: audio.error
        ? {
            code: audio.error.code,
            message: audio.error.message,
          }
        : null,
    });
    releaseAudio();
    activeKey = null;
    activePhase = "error";
    notify();
    window.setTimeout(() => {
      activePhase = "idle";
      activeMeta = null;
      notify();
    }, 4000);
  };
}

export type RunPuterListenResult = {
  didStartNewPlayback: boolean;
};

/**
 * One global listen session (reader or feed). Same key toggles pause/resume.
 */
export async function runPuterListen(options: {
  key: string;
  speechText: string;
  meta?: PuterListenMeta | null;
}): Promise<RunPuterListenResult> {
  const { key, speechText, meta } = options;
  const raw = speechText.trim();
  console.log("[tts/client] runPuterListen called", {
    key,
    chars: raw.length,
    activeKey,
    activePhase,
  });
  if (!raw) {
    throw new Error("No article text to read.");
  }

  if (typeof window === "undefined") {
    throw new Error("Audio playback is not available in this environment.");
  }

  if (
    activeKey === key &&
    activePhase === "playing" &&
    activeAudio &&
    !activeAudio.paused
  ) {
    console.log("[tts/client] Pausing active playback", { key });
    activeAudio.pause();
    activePhase = "paused";
    notify();
    return { didStartNewPlayback: false };
  }

  if (activeKey === key && activePhase === "paused") {
    if (activeAudio) {
      console.log("[tts/client] Resuming active playback", { key });
      await activeAudio.play();
      activePhase = "playing";
      notify();
    }
    return { didStartNewPlayback: false };
  }

  stopPuterPlayback();
  const runId = activeRunId + 1;
  activeRunId = runId;

  const truncated = raw.length > PUTER_TTS_MAX_CHARS;
  const chunks = getSpeechChunks(raw);
  const speechChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0);

  activeKey = key;
  activePhase = "loading";
  activeMeta = meta ?? null;
  notify();

  try {
    const audio = createPlaybackAudio();
    activeAudio = audio;
    await primeAudioForSafari(audio, key);

    if (activeRunId !== runId || activeAudio !== audio) {
      console.info("[tts/client] Audio priming superseded", {
        key,
        runId,
        activeRunId,
      });
      return { didStartNewPlayback: false };
    }

    console.log("[tts/client] Split speech for progressive playback", {
      key,
      chunks: chunks.length,
      chars: speechChars,
      truncated,
    });

    let chunkIndex = 0;
    let nextChunkIndex = 1;
    let nextChunkPromise: Promise<CachedAudioEntry> | null = null;

    const prefetchNextChunk = () => {
      if (nextChunkPromise || nextChunkIndex >= chunks.length) return;
      const prefetchIndex = nextChunkIndex;
      nextChunkPromise = requestGeneratedAudioEntry({
        key,
        runId,
        text: chunks[prefetchIndex]!,
        chunkIndex: prefetchIndex,
        chunkCount: chunks.length,
        reason: "playback",
      });
    };

    const playEntry = async (entry: CachedAudioEntry, nextIndex: number) => {
      if (activeRunId !== runId || activeAudio !== audio) return;
      chunkIndex = nextIndex;
      audio.src = entry.url;
      audio.load();
      await audio.play();
      if (activeRunId !== runId || activeAudio !== audio) return;
      console.log("[tts/client] Playback chunk started", {
        key,
        chunk: chunkIndex + 1,
        chunks: chunks.length,
      });
      nextChunkIndex = chunkIndex + 1;
      nextChunkPromise = null;
      prefetchNextChunk();
    };

    attachPlaybackHandlers(audio, key, runId, () => {
      void (async () => {
        const nextIndex = chunkIndex + 1;
        if (nextIndex >= chunks.length) {
          finishPlayback();
          return;
        }

        try {
          activePhase = "loading";
          notify();
          const nextEntry =
            nextChunkPromise ??
            requestGeneratedAudioEntry({
              key,
              runId,
              text: chunks[nextIndex]!,
              chunkIndex: nextIndex,
              chunkCount: chunks.length,
              reason: "playback",
            });
          await playEntry(await nextEntry, nextIndex);
        } catch (e) {
          if (isAbortLike(e) || activeRunId !== runId) return;
          console.error("[tts/client] Next audio chunk failed", {
            key,
            chunk: nextIndex + 1,
            error: describeError(e),
          });
          releaseAudio();
          activeKey = null;
          activePhase = "error";
          notify();
        }
      })();
    });

    const firstEntry = await requestGeneratedAudioEntry({
      key,
      runId,
      text: chunks[0]!,
      chunkIndex: 0,
      chunkCount: chunks.length,
      reason: "playback",
    });
    await playEntry(firstEntry, 0);
    if (activeRunId !== runId) {
      console.info("[tts/client] Playback start ignored for stale run", {
        key,
        runId,
        activeRunId,
      });
      return { didStartNewPlayback: false };
    }
    console.log("[tts/client] Playback started", { key });

    return { didStartNewPlayback: true };
  } catch (e) {
    if (isAbortLike(e) || activeRunId !== runId) {
      console.info("[tts/client] TTS request cancelled or superseded", {
        key,
        runId,
        activeRunId,
        error: describeError(e),
      });
      throw new Error("Audio generation was cancelled.");
    }

    releaseAudio();
    console.error("[tts/client] Playback failed", {
      key,
      error: describeError(e),
    });
    activeKey = null;
    activePhase = "error";
    notify();
    window.setTimeout(() => {
      activePhase = "idle";
      activeMeta = null;
      notify();
    }, 4000);
    throw e instanceof Error
      ? e
      : new Error("Could not start article audio. Try again later.");
  }
}
