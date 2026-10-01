/**
 * The microphone, as one take at a time.
 *
 * In the Android app, `getUserMedia` is the WebView's: Capacitor's
 * `BridgeWebChromeClient` turns its audio-capture request into Android's
 * RECORD_AUDIO prompt the first time, which is why the APK's manifest
 * declares that permission (apps/mobile). The page must be a secure context,
 * which the app's `https://localhost` is.
 */

export type RecordingFailure =
  /** The person, or Android settings, said no to the microphone. */
  | "denied"
  /** This WebView cannot record at all. */
  | "unsupported"
  /** Another app holds the microphone (a call, say). */
  | "busy"
  | "failed"

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
 * Opus in WebM is what Android's WebView records natively. At
 * `BITS_PER_SECOND` a full minute is about a quarter of a megabyte.
 */
const PREFERRED_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
]

/**
 * Speech, not music: Opus is clear for a voice at 32 kbps, and Chromium's
 * default (about 128 kbps) would make each soundbite four times the size.
 */
const BITS_PER_SECOND = 32_000

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
      close: () => void context.close().catch(() => undefined),
    }
  } catch {
    return { level: () => 0, close: () => undefined }
  }
}

/** Starts a take on the device's microphone. */
export const startMicRecording: StartRecording = async () => {
  if (
    !window.isSecureContext ||
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- feature detection: lib.dom assumes both exist, an old WebView may have neither
    !navigator.mediaDevices?.getUserMedia ||
    typeof MediaRecorder === "undefined"
  ) {
    throw new RecordingError("unsupported")
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    })
  } catch (error) {
    throw new RecordingError(failureOf(error), { cause: error })
  }

  const release = (): void => {
    for (const track of stream.getTracks()) track.stop()
  }

  let recorder: MediaRecorder
  try {
    const mimeType = pickMimeType()
    recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: BITS_PER_SECOND,
    })
  } catch (error) {
    release()
    throw new RecordingError("unsupported", { cause: error })
  }

  const chunks: Array<Blob> = []
  recorder.ondataavailable = (event: BlobEvent): void => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  const levels = meter(stream)
  const startedAt = performance.now()
  // A timeslice, so what was said is already in `chunks` if the WebView is
  // torn down before `stop` delivers the last of it.
  recorder.start(1_000)

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
