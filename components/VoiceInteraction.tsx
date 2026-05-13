"use client";

import { Mic, Square } from "lucide-react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  active: boolean;
  busy: boolean;
  onActiveChange: (active: boolean) => void;
  onTranscript: (text: string) => void;
  hidden?: boolean;
};

type TranscribeResponse =
  | { ok: true; text: string }
  | { ok: false; error?: string };

type WebkitAudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type));
}

export function VoiceInteraction({
  active,
  busy,
  onActiveChange,
  onTranscript,
  hidden = false,
}: Props) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const monitorFrameRef = useRef<number | null>(null);
  const maxRecordingTimerRef = useRef<number | null>(null);
  const heardSpeechRef = useRef(false);
  const chunksRef = useRef<BlobPart[]>([]);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const clearRecordingTimers = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (monitorFrameRef.current !== null) {
      window.cancelAnimationFrame(monitorFrameRef.current);
      monitorFrameRef.current = null;
    }
    if (maxRecordingTimerRef.current !== null) {
      window.clearTimeout(maxRecordingTimerRef.current);
      maxRecordingTimerRef.current = null;
    }
  }, []);

  const closeAudioContext = useCallback(() => {
    const ctx = audioContextRef.current;
    audioContextRef.current = null;
    if (ctx && ctx.state !== "closed") {
      void ctx.close().catch(() => {});
    }
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    clearRecordingTimers();
    closeAudioContext();
    if (!recorder) {
      if (active) onActiveChange(false);
      stopStream();
      return;
    }
    if (recorder.state !== "inactive") {
      console.log("[stt/client] Recording stopped");
      recorder.stop();
    }
    onActiveChange(false);
  }, [active, clearRecordingTimers, closeAudioContext, onActiveChange]);

  const startSilenceDetection = useCallback(
    (stream: MediaStream) => {
      const AudioContextCtor =
        window.AudioContext || (window as WebkitAudioWindow).webkitAudioContext;
      if (!AudioContextCtor) return;

      const ctx = new AudioContextCtor();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      audioContextRef.current = ctx;

      const data = new Uint8Array(analyser.fftSize);
      const speechThreshold = 18;
      const silenceMs = 1050;

      const monitor = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) {
          const centered = value - 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / data.length);

        if (rms > speechThreshold) {
          heardSpeechRef.current = true;
          if (silenceTimerRef.current !== null) {
            window.clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else if (heardSpeechRef.current && silenceTimerRef.current === null) {
          silenceTimerRef.current = window.setTimeout(() => {
            console.log("[stt/client] Silence detected; auto-stopping recording");
            stopRecording();
          }, silenceMs);
        }

        monitorFrameRef.current = window.requestAnimationFrame(monitor);
      };

      void ctx.resume().catch(() => {});
      monitor();
    },
    [stopRecording],
  );

  const transcribeBlob = useCallback(async (blob: Blob) => {
    setTranscribing(true);
    setError(null);
    console.log("[stt/client] Sending recording for transcription", {
      bytes: blob.size,
      type: blob.type,
    });
    try {
      const form = new FormData();
      form.append("audio", blob, `question.${blob.type.includes("mp4") ? "m4a" : "webm"}`);
      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as TranscribeResponse;
      if (!res.ok || !json.ok) {
        throw new Error(
          !json.ok && json.error ? json.error : "Could not transcribe recording.",
        );
      }
      console.log("[stt/client] Transcription received", {
        chars: json.text.length,
      });
      onTranscript(json.text);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not transcribe recording.";
      console.error("[stt/client] Transcription failed", { message });
      setError(message);
      window.setTimeout(() => setError(null), 5000);
    } finally {
      setTranscribing(false);
    }
  }, [onTranscript]);

  const startRecording = useCallback(async () => {
    if (mediaRecorderRef.current || transcribing || busy) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone recording is not available in this browser.");
      return;
    }

    try {
      setError(null);
      heardSpeechRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const mimeType = pickRecorderMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        clearRecordingTimers();
        closeAudioContext();
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        mediaRecorderRef.current = null;
        stopStream();
        void transcribeBlob(blob);
      };
      recorder.onerror = () => {
        clearRecordingTimers();
        closeAudioContext();
        mediaRecorderRef.current = null;
        stopStream();
        setError("Microphone recording failed. Try again.");
        onActiveChange(false);
      };

      recorder.start();
      startSilenceDetection(stream);
      maxRecordingTimerRef.current = window.setTimeout(() => {
        console.log("[stt/client] Max recording length reached; auto-stopping");
        stopRecording();
      }, 15_000);
      console.log("[stt/client] Recording started", {
        mimeType: recorder.mimeType,
      });
      onActiveChange(true);
    } catch (e) {
      const message =
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone permission was denied."
          : e instanceof Error
            ? e.message
            : "Could not start microphone recording.";
      console.error("[stt/client] Recording could not start", { message });
      setError(message);
      stopStream();
      onActiveChange(false);
    }
  }, [
    busy,
    clearRecordingTimers,
    closeAudioContext,
    onActiveChange,
    startSilenceDetection,
    stopRecording,
    transcribing,
  ]);

  useEffect(() => {
    if (!active || mediaRecorderRef.current || transcribing || busy) return;
    void startRecording();
  }, [active, busy, startRecording, transcribing]);

  useEffect(() => {
    return () => {
      clearRecordingTimers();
      closeAudioContext();
      stopStream();
    };
  }, [clearRecordingTimers, closeAudioContext]);

  const onPress = () => {
    if (busy || transcribing) return;
    if (active) {
      stopRecording();
      return;
    }
    void startRecording();
  };

  const label = transcribing
    ? "Transcribing..."
    : active
      ? "Listening..."
      : "Tap to ask with your voice";

  const node = (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-rule bg-white/80 px-3 py-2">
      <div>
        <p className="font-sans text-[12px] font-semibold text-ink">
          Voice mode
        </p>
        <p className="font-sans text-[11px] text-ink-muted">
          {error ?? label}
        </p>
      </div>
      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        disabled={busy || transcribing}
        onClick={onPress}
        className={`relative flex h-12 w-12 items-center justify-center rounded-full border text-paper shadow-sm transition ${
          active
            ? "border-ink bg-ink"
            : "border-rule bg-ink text-paper hover:bg-ink/90"
        } disabled:opacity-40`}
        aria-pressed={active}
        aria-label={active ? "Stop recording" : "Start voice command"}
      >
        {active ? (
          <Square className="h-4 w-4 fill-current" />
        ) : (
          <Mic className="h-5 w-5" />
        )}
        {active ? (
          <span className="absolute -bottom-1 h-2 w-2 rounded-full bg-accent" />
        ) : null}
      </motion.button>
    </div>
  );

  if (hidden) {
    return <div className="sr-only">{node}</div>;
  }

  return node;
}
