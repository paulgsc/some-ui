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
 *   phone's browser has (Chrome on Android, Safari on iOS) and an Android
 *   WebView does not.
 * - The Android app's, over the phone's own `SpeechRecognizer`: a native
 *   plugin, so it lives in the host (`apps/www`, `lib/dictation`) and is
 *   passed in as `Leetype`'s `dictation`.
 *
 * One utterance per `listen`: the recognizer ends on a pause, and the
 * composer appends each transcript to the note, so tapping the microphone
 * again adds more rather than replacing what was said.
 */

/** Why listening ended without a transcript. */
export type DictationFailure =
  /** The learner, or the platform, refused the microphone. */
  | "denied"
  /** The recognizer heard no words. */
  | "silent"
  /** Anything else: no network for a cloud recognizer, a busy service. */
  | "failed"

export class DictationError extends Error {
  constructor(readonly reason: DictationFailure) {
    super(`dictation ${reason}`)
    this.name = "DictationError"
  }
}

const FAILURES: ReadonlyArray<DictationFailure> = ["denied", "silent", "failed"]

/**
 * Why a `Listening`'s `done` rejected. The contract is structural: any
 * rejection carrying a `reason` that is a `DictationFailure` says which, so
 * a host's port (`apps/www`'s) need not import this class, and with it this
 * package, into its main bundle. Anything else is `"failed"`.
 */
export function dictationFailureOf(error: unknown): DictationFailure {
  if (typeof error !== "object" || error === null || !("reason" in error)) {
    return "failed"
  }
  const { reason } = error
  return FAILURES.find((failure) => failure === reason) ?? "failed"
}

/** One utterance being listened to. */
export type Listening = {
  /**
   * The transcript once the recognizer is done, or a rejection carrying a
   * `reason` (`DictationError`, or any object `dictationFailureOf` reads).
   * Never settles with empty text: hearing nothing rejects with `"silent"`.
   */
  readonly done: Promise<string>
  /** Asks the recognizer to finish now; `done` settles with what it heard. */
  stop(): void
  /** Abandons the utterance; whatever `done` does afterwards is ignored. */
  cancel(): void
}

export type Dictation = {
  /** Whose recognizer turns speech into text, for the disclosure. */
  readonly recognizer: "browser" | "phone"
  /** Starts listening; `onHeard` gets the words so far, as they change. */
  listen(onHeard: (heard: string) => void): Listening
}

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

/** A Web Speech error code, as this port's failure. */
function failureOf(error: string): DictationFailure {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "denied"
  }
  if (error === "no-speech") return "silent"
  return "failed"
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
      let heard = ""
      let failure: DictationFailure | null = null
      let cancelled = false
      let recognition: Recognition | null = null
      const done = new Promise<string>((resolve, reject) => {
        try {
          recognition = new Constructor()
          recognition.lang = lang
          recognition.interimResults = true
          recognition.continuous = false
          recognition.maxAlternatives = 1
          recognition.onresult = (event): void => {
            heard = transcriptOf(event.results)
            if (!cancelled) onHeard(heard)
          }
          recognition.onerror = (event): void => {
            // `aborted` is our own `cancel`; `no-speech` after some words
            // is not silence.
            if (event.error === "aborted") return
            if (event.error === "no-speech" && heard !== "") return
            failure = failureOf(event.error)
          }
          recognition.onend = (): void => {
            if (failure !== null) reject(new DictationError(failure))
            else if (heard === "") reject(new DictationError("silent"))
            else resolve(heard)
          }
          recognition.start()
        } catch {
          reject(new DictationError("failed"))
        }
      })
      // Settled by `cancel` as often as by the recognizer; nobody may be
      // listening by then, and an unhandled rejection is not a failure.
      done.catch(() => undefined)
      return {
        done,
        stop: (): void => {
          try {
            recognition?.stop()
          } catch {
            // Already ended: `onend` has settled `done`.
          }
        },
        cancel: (): void => {
          cancelled = true
          try {
            recognition?.abort()
          } catch {
            // Already ended.
          }
        },
      }
    },
  }
}
