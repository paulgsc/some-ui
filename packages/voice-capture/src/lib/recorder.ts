/**
 * The microphone, as one take at a time. Used by the soundbites page and by
 * voice reflections, each passing its own bitrate.
 *
 * In the Android app, `getUserMedia` is the WebView's: Capacitor's
 * `BridgeWebChromeClient` turns its audio-capture request into Android's
 * RECORD_AUDIO prompt the first time, which is why the APK's manifest
 * declares that permission (apps/mobile). The page must be a secure context,
 * which the app's `https://localhost` is.
 */
import type { IntentErrorKind } from "@some-ui/intent-kit"
import { reportFailure } from "@some-ui/intent-kit"

export type RecordingFailure =
  /** The person, or Android settings, said no to the microphone. */
  | "denied"
  /** This WebView cannot record at all. */
  | "unsupported"
  /** Another app holds the microphone (a call, say). */
  | "busy"
  /** Another screen of this app is recording (`owner.ts`). */
  | "elsewhere"
  | "failed"

/** What to tell the person when the microphone refuses, in their words. */
export const RECORDING_FAILURE_COPY: Record<RecordingFailure, string> = {
  denied:
    "The microphone is off for Some UI. Turn it on under Android Settings → Apps → Some UI → Permissions → Microphone, then try again.",
  busy: "Another app is using the microphone. Try again once it lets go.",
  elsewhere: "Another screen is recording. Stop that one, then try again.",
  unsupported: "This phone's web view can't record audio.",
  failed: "The microphone didn't start. Try again.",
}

const PORT = "microphone (getUserMedia, MediaRecorder)"

const KIND: Record<RecordingFailure, IntentErrorKind> = {
  denied: "rejected",
  busy: "unreachable",
  elsewhere: "unreachable",
  unsupported: "unavailable",
  failed: "unknown",
}

export class RecordingError extends Error {
  readonly reason: RecordingFailure

  constructor(reason: RecordingFailure, options?: { cause?: unknown }) {
    super(`recording failed: ${reason}`, options)
    this.name = "RecordingError"
    this.reason = reason
  }
}

/** What a finished recording hands back. */
export type Take = { blob: Blob; mimeType: string; durationMs: number }

/** A recording in progress. */
export type Recording = {
  /** How loud the input is right now, 0 (silence) to 1. */
  level: () => number
  /** Stops, releases the microphone, and resolves with what was said. */
  finish: () => Promise<Take>
  /** Stops and releases the microphone, keeping nothing. */
  discard: () => void
}

export type StartRecording = () => Promise<Recording>

/**
 * Opus in WebM is what Android's WebView records natively. At 32 kbps a full
 * minute is about a quarter of a megabyte.
 */
const PREFERRED_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
]

function pickMimeType(): string {
  return (
    PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? ""
  )
}

function failureOf(error: unknown): RecordingFailure {
  if (!(error instanceof DOMException)) return "failed"
  if (error.name === "NotAllowedError" || error.name === "SecurityError")
    return "denied"
  if (error.name === "NotReadableError" || error.name === "AbortError")
    return "busy"
  if (error.name === "NotFoundError") return "unsupported"
  return "failed"
}

/**
 * A level meter over `stream`, or a flat zero where Web Audio is missing or
 * the context cannot start without a gesture (a cold start from the
 * reminder). The meter is decoration; recording never depends on it.
 */
function meter(stream: MediaStream): {
  level: () => number
  close: () => void
} {
  try {
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    context.createMediaStreamSource(stream).connect(analyser)
    // Ignored: a context that will not resume leaves the meter at zero; the
    // recording does not depend on it.
    void context.resume().catch(() => undefined)
    const samples = new Uint8Array(analyser.fftSize)
    return {
      level: (): number => {
        analyser.getByteTimeDomainData(samples)
        let sum = 0
        for (const sample of samples) {
          const centred = (sample - 128) / 128
          sum += centred * centred
        }
        // Speech sits around 0.05-0.2 RMS; stretch it across the meter.
        return Math.min(1, Math.sqrt(sum / samples.length) * 4)
      },
      // Ignored: the meter is done either way.
      close: () => void context.close().catch(() => undefined),
    }
  } catch {
    return { level: () => 0, close: () => undefined }
  }
}

/**
 * Takes on the device's microphone at `bitsPerSecond`: a speech bitrate, not
 * Chromium's default (about 128 kbps), which would make each take four times
 * the size. The caller's cap on what it keeps is in the same units.
 */
export function micRecorder({
  bitsPerSecond,
}: {
  bitsPerSecond: number
}): StartRecording {
  return () => startMicRecording(bitsPerSecond)
}

/**
 * The microphone said no: reported (`reportFailure`, which survives release
 * builds and reaches logcat), then thrown for the caller to tell the person.
 */
function refused(reason: RecordingFailure, cause?: unknown): RecordingError {
  reportFailure({
    port: PORT,
    error: {
      kind: KIND[reason],
      retryable: reason !== "unsupported",
      summary: RECORDING_FAILURE_COPY[reason],
      cause,
    },
  })
  return new RecordingError(reason, { cause })
}

async function startMicRecording(bitsPerSecond: number): Promise<Recording> {
  if (
    !window.isSecureContext ||
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- feature detection: lib.dom assumes both exist, an old WebView may have neither
    !navigator.mediaDevices?.getUserMedia ||
    typeof MediaRecorder === "undefined"
  ) {
    throw refused("unsupported")
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    })
  } catch (error) {
    throw refused(failureOf(error), error)
  }

  const release = (): void => {
    for (const track of stream.getTracks()) track.stop()
  }

  let recorder: MediaRecorder
  try {
    const mimeType = pickMimeType()
    recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: bitsPerSecond,
    })
  } catch (error) {
    release()
    throw refused("unsupported", error)
  }

  const chunks: Array<Blob> = []
  recorder.ondataavailable = (event: BlobEvent): void => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  const levels = meter(stream)
  const startedAt = performance.now()
  try {
    // A timeslice, so what was said is already in `chunks` if the WebView
    // is torn down before `stop` delivers the last of it.
    recorder.start(1_000)
  } catch (error) {
    // Let go of what was acquired: the caller offers a retry, which would
    // otherwise find the microphone still held by this failed attempt.
    levels.close()
    release()
    throw refused("failed", error)
  }

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = (): void => resolve()
  })
  const stop = (): void => {
    if (recorder.state !== "inactive") recorder.stop()
    levels.close()
    release()
  }

  return {
    level: levels.level,
    async finish(): Promise<Take> {
      const durationMs = performance.now() - startedAt
      stop()
      await stopped
      const mimeType = recorder.mimeType || chunks[0]?.type || "audio/webm"
      return {
        blob: new Blob(chunks, { type: mimeType }),
        mimeType,
        durationMs,
      }
    },
    discard(): void {
      chunks.length = 0
      stop()
    },
  }
}
