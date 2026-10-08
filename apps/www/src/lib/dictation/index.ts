/**
 * Speech to text on the Android app, for LeetType's margin notes
 * (`@some-ui/leetype`'s `Dictation` port; canon Rem. 3.7).
 *
 * A WebView has no Web Speech recognizer, so this uses the phone's own
 * `SpeechRecognizer` via `@capacitor-community/speech-recognition`. It returns
 * text only; no audio is written. The recognizer may send audio to its vendor
 * (Google, on most), and the composer says so before first use.
 *
 * One utterance per `listen`, ending on a pause or `stop`. Final results only
 * (`partialResults: false`): with partial results `start` resolves at once
 * and a later error, or silence, reaches JavaScript as nothing. So words
 * appear when the learner stops speaking.
 *
 * Asking for the microphone, and the utterance itself, each go through
 * `callForeign` (F1) by their own deadline.
 *
 * The permission is RECORD_AUDIO, as for soundbites (apps/mobile's manifest,
 * `review/policy.json`). The plugin loads on the first `listen`, and only the
 * device build passes this in (`components/player/session-viewport.tsx`).
 */
import type { SpeechRecognitionPlugin } from "@capacitor-community/speech-recognition"
import type { ForeignCall, ForeignVerdict } from "@some-ui/intent-kit"
import {
  callForeign,
  ForeignDeadlineError,
  reportFailure,
} from "@some-ui/intent-kit"
// Types only: erased at build, so the activity stays out of the main bundle
// (the reason `lib/leetype-content` imports nothing from the package).
import type { Dictation, Listening } from "@some-ui/leetype"

import { isMissingPlugin } from "@/lib/intent/foreign"

/** The learner said no to the microphone (or Android did, for them). */
class MicrophoneDeniedError extends Error {
  constructor() {
    super("RECORD_AUDIO not granted")
    this.name = "MicrophoneDeniedError"
  }
}

/** A permission prompt waits on a person: long enough for one. */
const PERMISSION_DEADLINE_MS = 120_000
/**
 * One utterance: the recognizer ends on a pause, so this only ends one that
 * never answers. The composer ends an unanswered Stop sooner.
 */
const LISTEN_DEADLINE_MS = 60_000

/**
 * What the recognizer says when it heard nothing: silence, not a failure.
 * "No match" is `ERROR_NO_MATCH`, "No speech input" `ERROR_SPEECH_TIMEOUT`.
 */
const SILENCE = new Set(["No match", "No speech input"])

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const BLOCKED: ForeignVerdict = {
  kind: "rejected",
  retryable: false,
  summary: "The microphone is blocked for this app.",
}

const NO_RECOGNIZER: ForeignVerdict = {
  kind: "unavailable",
  retryable: false,
  summary: "This phone has no speech recognizer this app can use.",
}

const UNREACHABLE: ForeignVerdict = {
  kind: "unreachable",
  retryable: true,
  summary: "Your phone's speech service couldn't be reached.",
}

const COULD_NOT_START: ForeignVerdict = {
  kind: "rejected",
  retryable: true,
  summary: "Your phone's speech service couldn't start listening.",
}

/**
 * What each message the plugin rejects with means here: its `Constants`
 * (`NOT_AVAILABLE`, `MISSING_PERMISSION`) and `getErrorText`. The test reads
 * that source and fails on any message missing here, but one: the plugin's
 * own catch-all, "Didn't understand, please try again.", its text for every
 * code it does not name (Android 12's language, server and rate-limit errors
 * among them), which stays unknown so two in a row withdraw the microphone.
 */
const PLUGIN_VERDICTS: Readonly<Record<string, ForeignVerdict>> = {
  "Speech recognition service is not available.": NO_RECOGNIZER,
  "Missing permission": BLOCKED,
  "Insufficient permissions": BLOCKED,
  "Network error": UNREACHABLE,
  "Network timeout": UNREACHABLE,
  "error from server": UNREACHABLE,
  "RecognitionService busy": COULD_NOT_START,
  "Audio recording error": COULD_NOT_START,
  "Client side error": COULD_NOT_START,
}

const UNRECOGNIZED: ForeignVerdict = {
  kind: "unknown",
  retryable: true,
  summary: "Your phone's speech service couldn't listen.",
}

/**
 * What the plugin's failure means here. Its rejections carry
 * `SpeechRecognition.java`'s text, and Capacitor's `code` when the bridge
 * itself refused (`UNAVAILABLE`, `UNIMPLEMENTED`: no recognizer, or no
 * plugin in this build, which no retry changes).
 */
export function classifyPhoneSpeech(error: unknown): ForeignVerdict {
  if (error instanceof ForeignDeadlineError) {
    return {
      kind: "unreachable",
      retryable: true,
      summary: "Your phone's speech service didn't answer.",
    }
  }
  if (error instanceof MicrophoneDeniedError) return BLOCKED
  if (isMissingPlugin(error)) return NO_RECOGNIZER
  const message = messageOf(error)
  return Object.hasOwn(PLUGIN_VERDICTS, message)
    ? (PLUGIN_VERDICTS[message] ?? UNRECOGNIZED)
    : UNRECOGNIZED
}

const PORT = {
  name: "android speech recognizer",
  classify: classifyPhoneSpeech,
  report: reportFailure,
}

/**
 * Whether this page runs inside the native app, read from the
 * `window.Capacitor` the native bridge injects before the page loads,
 * rather than from `@capacitor/core`, which would put the runtime in every
 * build's main bundle to answer one question.
 */
export function runsNatively(host: object = globalThis): boolean {
  const capacitor: unknown = Reflect.get(host, "Capacitor")
  if (typeof capacitor !== "object" || capacitor === null) return false
  const isNative: unknown = Reflect.get(capacitor, "isNativePlatform")
  return (
    typeof isNative === "function" &&
    Reflect.apply(isNative, capacitor, []) === true
  )
}

/** The page's language as BCP 47, which `RecognizerIntent` asks for. */
function languageTag(): string {
  return typeof navigator === "undefined" ? "en-US" : navigator.language
}

export function phoneDictation(): Dictation {
  return {
    recognizer: "phone",
    listen(): Listening {
      // The step in progress, for `cancel`; Stop before the recognizer has
      // started stops it as soon as it has.
      let current: ForeignCall<unknown> | null = null
      let cancelled = false
      let stopRequested = false
      let stop: () => void = () => {
        stopRequested = true
      }
      // Boxed: a Capacitor plugin is a Proxy that answers every property,
      // `then` included, so a promise resolved with the plugin itself calls
      // its native "then" and never settles.
      const permission = callForeign<{ plugin: SpeechRecognitionPlugin }>({
        port: PORT,
        deadlineMs: PERMISSION_DEADLINE_MS,
        start: async (signal) => {
          // Cancelled while loading or checking: never ask for the
          // microphone. What this throws then is ignored (the call is over).
          const { SpeechRecognition } = await import(
            "@capacitor-community/speech-recognition"
          )
          signal.throwIfAborted()
          let { speechRecognition } = await SpeechRecognition.checkPermissions()
          signal.throwIfAborted()
          if (speechRecognition !== "granted") {
            ;({ speechRecognition } =
              await SpeechRecognition.requestPermissions())
          }
          if (speechRecognition !== "granted") throw new MicrophoneDeniedError()
          return { plugin: SpeechRecognition }
        },
      })
      current = permission
      const outcome = permission.outcome.then((granted) => {
        if (granted.status !== "succeeded") return granted
        if (cancelled) return { status: "abandoned" } as const
        const { plugin } = granted.value
        const utterance = callForeign<string>({
          port: PORT,
          deadlineMs: LISTEN_DEADLINE_MS,
          start: async (signal) => {
            // The plugin's `stop` never settles its own call; nothing waits
            // on it. It is also the nearest thing to an abort it has.
            stop = (): void => void plugin.stop().catch(() => undefined)
            signal.addEventListener("abort", stop)
            const pending = plugin.start({
              language: languageTag(),
              partialResults: false,
              popup: false,
              maxResults: 1,
            })
            if (stopRequested) stop()
            try {
              const { matches } = await pending
              return matches?.[0]?.trim() ?? ""
            } catch (error) {
              if (SILENCE.has(messageOf(error))) return ""
              throw error
            }
          },
        })
        current = utterance
        return utterance.outcome
      })
      return {
        outcome,
        stop: (): void => stop(),
        cancel: (): void => {
          cancelled = true
          current?.abandon()
        },
      }
    },
  }
}
