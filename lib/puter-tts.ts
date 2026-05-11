/**
 * Global “listen” session using the Web Speech API (`speechSynthesis`).
 * No third-party accounts — works offline-capable per browser/OS voices.
 */

/** Very long text can stall some engines; trim with ellipsis for playback. */
export const PUTER_TTS_MAX_CHARS = 6000;
export const PUTER_SAFE_SLICE = 5900;

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
/** Tracks the utterance we attached handlers to (for stale onend guard). */
let activeUtterance: SpeechSynthesisUtterance | null = null;
let activeMeta: PuterListenMeta | null = null;

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

function getSynth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? null;
}

function computePaused(): boolean {
  return activePhase === "paused";
}

/**
 * iOS Safari and some desktop builds silently stop `speechSynthesis` after
 * ~15 s and fire `onend` even though the utterance is unfinished. A periodic
 * pause+resume keeps the engine awake long enough to finish article-length
 * passages without the dock disappearing mid-listen.
 */
let keepAliveTimer: number | null = null;

function startKeepAlive() {
  const syn = getSynth();
  if (!syn) return;
  if (keepAliveTimer !== null) return;
  keepAliveTimer = window.setInterval(() => {
    const s = getSynth();
    if (!s) return;
    if (!s.speaking) return;
    if (s.paused) return;
    // pause+resume is the documented WebKit workaround for the 15 s cutoff.
    s.pause();
    s.resume();
  }, 12_000);
}

function stopKeepAlive() {
  if (keepAliveTimer === null) return;
  window.clearInterval(keepAliveTimer);
  keepAliveTimer = null;
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
  stopKeepAlive();
  activeUtterance = null;
  activeKey = null;
  activePhase = "idle";
  activeMeta = null;
  notify();
}

export function stopPuterPlayback(): void {
  stopKeepAlive();
  const syn = getSynth();
  if (syn) {
    syn.cancel();
  }
  activeUtterance = null;
  activeKey = null;
  activePhase = "idle";
  activeMeta = null;
  notify();
}

export function togglePuterPlaybackPause(): void {
  const syn = getSynth();
  if (!syn || !activeKey) return;

  if (syn.speaking && !syn.paused) {
    syn.pause();
    stopKeepAlive();
    activePhase = "paused";
    notify();
    return;
  }

  if (syn.paused || activePhase === "paused") {
    syn.resume();
    startKeepAlive();
    activePhase = "playing";
    notify();
  }
}

/** Wait briefly for voices (iOS/Safari often populate after `voiceschanged`). */
async function waitForVoices(maxMs: number): Promise<void> {
  const syn = getSynth();
  if (!syn) throw new Error("Speech synthesis is not available.");
  const synthesis: SpeechSynthesis = syn;
  if (synthesis.getVoices().length > 0) return;

  await new Promise<void>((resolve) => {
    const deadline = Date.now() + maxMs;
    const tick = () => {
      if (synthesis.getVoices().length > 0 || Date.now() >= deadline) {
        cleanup();
        resolve();
      }
    };
    const id = window.setInterval(tick, 80);
    synthesis.addEventListener("voiceschanged", tick);
    function cleanup() {
      window.clearInterval(id);
      synthesis.removeEventListener("voiceschanged", tick);
    }
    tick();
  });
}

export type RunPuterListenResult = {
  didStartNewPlayback: boolean;
};

/**
 * One global listen session (reader or feed). Same key toggles pause/resume.
 * Uses browser text-to-speech — no Puter or other sign-in.
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

  const syn = getSynth();
  if (!syn) {
    throw new Error("Speech synthesis is not available in this environment.");
  }

  if (
    activeKey === key &&
    activePhase === "playing" &&
    syn.speaking &&
    !syn.paused
  ) {
    syn.pause();
    activePhase = "paused";
    notify();
    return { didStartNewPlayback: false };
  }

  if (activeKey === key && activePhase === "paused") {
    syn.resume();
    activePhase = "playing";
    notify();
    return { didStartNewPlayback: false };
  }

  stopPuterPlayback();

  const truncated = raw.length > PUTER_TTS_MAX_CHARS;
  const textForSpeech = truncated
    ? `${raw.slice(0, PUTER_SAFE_SLICE).trim()}…`
    : raw;

  activeKey = key;
  activePhase = "loading";
  activeMeta = meta ?? null;
  notify();

  try {
    await waitForVoices(4000);

    const utterance = new SpeechSynthesisUtterance(textForSpeech);
    utterance.rate = 1;
    utterance.pitch = 1;

    const voices = syn.getVoices();
    const en =
      voices.find((v) => v.lang.startsWith("en-US")) ??
      voices.find((v) => v.lang.startsWith("en")) ??
      voices[0];
    if (en) utterance.voice = en;

    activeUtterance = utterance;

    /**
     * `phase` stays "loading" until the engine reports it actually started
     * speaking — that's what keeps the dock's spinner up until audio is
     * audible (iOS in particular has a noticeable warm-up between speak()
     * and the first sample).
     */
    utterance.onstart = () => {
      if (activeUtterance !== utterance) return;
      activePhase = "playing";
      startKeepAlive();
      notify();
    };

    utterance.onend = () => {
      if (activeUtterance !== utterance) return;
      stopKeepAlive();
      finishPlayback();
    };

    utterance.onerror = () => {
      if (activeUtterance !== utterance) return;
      stopKeepAlive();
      activeUtterance = null;
      activeKey = null;
      activePhase = "error";
      // Intentionally keep `activeMeta` so the dock doesn't blank out — the
      // user can see which article failed and tap to retry.
      notify();
      window.setTimeout(() => {
        activePhase = "idle";
        activeMeta = null;
        notify();
      }, 4000);
    };

    syn.speak(utterance);

    /**
     * Some engines never fire `onstart`. After a short grace period, flip
     * to playing anyway so the spinner doesn't get stuck.
     */
    window.setTimeout(() => {
      if (activeUtterance !== utterance) return;
      if (activePhase !== "loading") return;
      activePhase = "playing";
      startKeepAlive();
      notify();
    }, 1500);

    return { didStartNewPlayback: true };
  } catch {
    stopKeepAlive();
    activeUtterance = null;
    activeKey = null;
    activePhase = "error";
    notify();
    window.setTimeout(() => {
      activePhase = "idle";
      activeMeta = null;
      notify();
    }, 4000);
    throw new Error(
      "Could not start text-to-speech. Try another browser or device.",
    );
  }
}
