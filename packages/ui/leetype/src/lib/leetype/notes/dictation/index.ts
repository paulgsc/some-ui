/**
 * Speech to text for a margin note (canon Rem. 3.7): the port the note
 * composer's runtime (`../runtime`) listens through, and the browser's own
 * implementation of it.
 *
 * # Text, never audio
 *
 * A port hands back words. Nothing here, and nothing behind a port, writes
 * audio anywhere: the recognizer the platform provides hears the
 * microphone, and what this package keeps is its transcript. That
 * recognizer may send the audio to its vendor to recognize it (Chrome's
 * does), which this package cannot prevent; `recognizer` says whose it is,
 * so the composer can say so before the learner speaks (Rem. 3.7).
 *
 * # Two implementations
 *
 * - `webSpeechDictation`: the Web Speech API (`SpeechRecognition`), which a
 *   phone's browser has (Chrome on Android, prefixed) and an Android
 *   WebView does not.
 * - The Android app's, over the phone's own `SpeechRecognizer`: a native
 *   plugin, so it lives in the host (`apps/www`, `lib/dictation`) and is
 *   passed in as `Leetype`'s `dictation`.
 *
 * One utterance per `listen`: the recognizer ends on a pause, and the
 * composer appends each transcript to the note, so tapping the microphone
 * again adds more rather than replacing what was said.
 *
 * Each implementation runs its recognizer through `callForeign` (F1), so
 * the composer gets a `ForeignOutcome`. Hearing nothing is `succeeded` with
 * empty text, not a failure.
 */

import type { ForeignOutcome, ForeignVerdict } from "@some-ui/intent-kit"
import {
  callForeign,
  ForeignDeadlineError,
  reportFailure,
} from "@some-ui/intent-kit"

/** One utterance being listened to. */
export type Listening = {
  /**
   * What became of it, from `callForeign`: never rejects. `succeeded` with
   * the transcript, empty when nothing was heard; `failed` with why, in
   * `IntentError`'s words; `abandoned` after `cancel`.
   */
  readonly outcome: Promise<ForeignOutcome<string>>
  /** Asks the recognizer to finish now; `outcome` settles with what it heard. */
  stop(): void
  /** Abandons the utterance: `outcome` settles `abandoned`, and nothing after counts. */
  cancel(): void
}

export type Dictation = {
  /** Whose recognizer turns speech into text, for the disclosure. */
  readonly recognizer: "browser" | "phone"
  /** Starts listening; `onHeard` gets the words so far, as they change. */
  listen(onHeard: (heard: string) => void): Listening
}

/**
 * How long one utterance may take. The recognizer ends on a pause, so this
 * only ends one that never does (another app took the microphone, the
 * service died); the composer's own `FINISH_TIMEOUT_MS` ends a Stop sooner.
 */
const LISTEN_DEADLINE_MS = 60_000

/** The part of the Web Speech API this uses. */
type RecognitionResultList = ArrayLike<
  ArrayLike<{ readonly transcript: string }> & { readonly isFinal: boolean }
>
type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult:
    | ((event: { readonly results: RecognitionResultList }) => void)
    | null
  onerror: ((event: { readonly error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionConstructor = new () => Recognition

/** Where the recognizer is looked up: `window`, or a test's stand-in. */
type SpeechHost = {
  readonly SpeechRecognition?: RecognitionConstructor
  readonly webkitSpeechRecognition?: RecognitionConstructor
  readonly navigator?: { readonly language?: string }
}

/** The words in `results` so far, final and interim, in order. */
function transcriptOf(results: RecognitionResultList): string {
  let text = ""
  for (let index = 0; index < results.length; index += 1) {
    text += results[index]?.[0]?.transcript ?? ""
  }
  return text.trim()
}

/** The browser's recognizer ended on an error: Web Speech's code. */
class WebSpeechError extends Error {
  constructor(readonly code: string) {
    super(`speech recognition error: ${code}`)
    this.name = "WebSpeechError"
  }
}

const BLOCKED: ForeignVerdict = {
  kind: "rejected",
  retryable: false,
  summary: "The microphone is blocked for this page.",
}

/**
 * What each Web Speech error code means here
 * (`SpeechRecognitionErrorEvent.error`). `no-speech` and `aborted` never
 * get here: they are silence and our own cancel.
 */
const WEB_SPEECH_VERDICTS: Readonly<Record<string, ForeignVerdict>> = {
  "not-allowed": BLOCKED,
  "service-not-allowed": BLOCKED,
  "audio-capture": {
    kind: "unavailable",
    retryable: false,
    summary: "The browser can't find a microphone.",
  },
  "language-not-supported": {
    kind: "unavailable",
    retryable: false,
    summary: "The browser can't recognize speech in your language.",
  },
  network: {
    kind: "unreachable",
    retryable: true,
    summary: "The browser's speech service couldn't be reached.",
  },
}

const NO_ANSWER: ForeignVerdict = {
  kind: "unreachable",
  retryable: true,
  summary: "The browser's speech service didn't answer.",
}

const UNRECOGNIZED: ForeignVerdict = {
  kind: "unknown",
  retryable: true,
  summary: "The browser's speech service couldn't listen.",
}

function classifyWebSpeech(error: unknown): ForeignVerdict {
  if (error instanceof ForeignDeadlineError) return NO_ANSWER
  if (!(error instanceof WebSpeechError)) return UNRECOGNIZED
  return Object.hasOwn(WEB_SPEECH_VERDICTS, error.code)
    ? (WEB_SPEECH_VERDICTS[error.code] ?? UNRECOGNIZED)
    : UNRECOGNIZED
}

const WEB_SPEECH_PORT = {
  name: "browser speech recognizer",
  classify: classifyWebSpeech,
  report: reportFailure,
}

/**
 * The browser's recognizer, or null where there is none (Firefox, an
 * Android WebView, a test's jsdom): the composer then offers typing only.
 */
export function webSpeechDictation(
  host: SpeechHost | undefined = typeof window === "undefined"
    ? undefined
    : window
): Dictation | null {
  const Constructor = host?.SpeechRecognition ?? host?.webkitSpeechRecognition
  if (Constructor === undefined) return null
  const lang = host?.navigator?.language ?? "en-US"
  return {
    recognizer: "browser",
    listen(onHeard): Listening {
      let cancelled = false
      let recognition: Recognition | null = null
      const call = callForeign<string>({
        port: WEB_SPEECH_PORT,
        deadlineMs: LISTEN_DEADLINE_MS,
        start: (signal) =>
          new Promise<string>((resolve, reject) => {
            let heard = ""
            let failure: string | null = null
            const created = new Constructor()
            recognition = created
            created.lang = lang
            created.interimResults = true
            created.continuous = false
            created.maxAlternatives = 1
            created.onresult = (event): void => {
              heard = transcriptOf(event.results)
              if (!cancelled) onHeard(heard)
            }
            created.onerror = (event): void => {
              // `aborted` is our own `cancel`; `no-speech` is silence, which
              // is not a failure, and after some words is not even silence.
              if (event.error === "aborted" || event.error === "no-speech")
                return
              failure = event.error
            }
            created.onend = (): void => {
              if (failure !== null) reject(new WebSpeechError(failure))
              else resolve(heard)
            }
            signal.addEventListener("abort", () => {
              try {
                created.abort()
              } catch {
                // Already ended: `onend` has settled.
              }
            })
            created.start()
          }),
      })
      return {
        outcome: call.outcome,
        stop: (): void => {
          try {
            recognition?.stop()
          } catch {
            // Already ended: `onend` has settled.
          }
        },
        cancel: (): void => {
          cancelled = true
          call.abandon()
        },
      }
    },
  }
}
