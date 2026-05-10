/** Puter default (AWS Polly) rejects text longer than 3000 characters. */
export const PUTER_TTS_MAX_CHARS = 3000;
export const PUTER_SAFE_SLICE = 2950;

export type PuterPlaybackPhase = "idle" | "loading" | "playing" | "error";

type PuterTxt2Speech = NonNullable<
  NonNullable<NonNullable<Window["puter"]>["ai"]>["txt2speech"]
>;

function getTxt2Speech(): PuterTxt2Speech | undefined {
  return typeof window !== "undefined"
    ? window.puter?.ai?.txt2speech
    : undefined;
}

export async function waitForTxt2Speech(maxMs: number): Promise<PuterTxt2Speech> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const fn = getTxt2Speech();
    if (fn) return fn;
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error("Listen is still loading. Try again in a moment.");
}

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
let activeAudio: HTMLAudioElement | null = null;
let activeMeta: PuterListenMeta | null = null;

export type PuterPlaybackSnapshot = {
  key: string | null;
  phase: PuterPlaybackPhase;
  meta: PuterListenMeta | null;
  /** Audio loaded but user paused mid-playback */
  paused: boolean;
};

/** Snapshot reference updates only in `notify` for useSyncExternalStore. */
let snapshot: PuterPlaybackSnapshot = {
  key: null,
  phase: "idle",
  meta: null,
  paused: false,
};

function computePaused(): boolean {
  return (
    !!activeKey &&
    !!activeAudio &&
    activeAudio.paused &&
    activePhase === "idle"
  );
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

export function stopPuterPlayback(): void {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio = null;
  }
  activeKey = null;
  activePhase = "idle";
  activeMeta = null;
  notify();
}

/** Mini-player pause / resume (same session). */
export function togglePuterPlaybackPause(): void {
  if (activePhase === "playing" && activeAudio && !activeAudio.paused) {
    activeAudio.pause();
    activePhase = "idle";
    notify();
    return;
  }
  if (
    activeKey &&
    activeAudio &&
    activeAudio.paused &&
    activeAudio.currentTime > 0 &&
    !activeAudio.ended
  ) {
    void activeAudio.play();
    activePhase = "playing";
    notify();
  }
}

export type RunPuterListenResult = {
  /** True when a new synthesis request ran (not pause/resume only). */
  didStartNewPlayback: boolean;
};

/**
 * One global Puter listen session (reader or any feed). Same key toggles pause/resume.
 */
export async function runPuterListen(options: {
  key: string;
  speechText: string;
  meta?: PuterListenMeta | null;
}): Promise<RunPuterListenResult> {
  const { key, speechText, meta } = options;
  const raw = speechText.trim();
  if (!raw) {
    throw new Error("No article text to read.");
  }

  if (
    activeKey === key &&
    activePhase === "playing" &&
    activeAudio &&
    !activeAudio.paused
  ) {
    activeAudio.pause();
    activePhase = "idle";
    notify();
    return { didStartNewPlayback: false };
  }

  if (
    activeKey === key &&
    activeAudio &&
    activeAudio.paused &&
    activeAudio.currentTime > 0 &&
    !activeAudio.ended
  ) {
    await activeAudio.play();
    activePhase = "playing";
    notify();
    return { didStartNewPlayback: false };
  }

  stopPuterPlayback();

  const truncated = raw.length > PUTER_TTS_MAX_CHARS;
  const textForApi = truncated
    ? `${raw.slice(0, PUTER_SAFE_SLICE).trim()}…`
    : raw;

  activeKey = key;
  activePhase = "loading";
  activeMeta = meta ?? null;
  notify();

  try {
    const tts = await waitForTxt2Speech(12_000);
    const audio = await tts(textForApi);
    activeAudio = audio;
    activeKey = key;
    audio.onended = () => {
      if (activeAudio === audio) {
        activeAudio = null;
        activeKey = null;
        activePhase = "idle";
        activeMeta = null;
        notify();
      }
    };
    await audio.play();
    activePhase = "playing";
    notify();
    return { didStartNewPlayback: true };
  } catch {
    activeAudio = null;
    activeKey = null;
    activeMeta = null;
    activePhase = "error";
    notify();
    window.setTimeout(() => {
      activePhase = "idle";
      notify();
    }, 4000);
    throw new Error(
      "Could not start audio. If a window opened, complete sign-in there.",
    );
  }
}
