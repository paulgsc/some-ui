/**
 * Speech to text on the Android app, for LeetType's margin notes
 * (`@some-ui/leetype`'s `Dictation` port; canon Rem. 3.7).
 *
 * An Android WebView has no Web Speech recognizer, so the browser path the
 * web builds use (`webSpeechDictation`, inside the package) finds nothing
 * there. What the phone does have is its own `SpeechRecognizer`, reached
 * through `@capacitor-community/speech-recognition`. It hands back text and
 * nothing else; no audio is written anywhere. The recognizer is the phone's
 * (Google's, on most), which may send the audio to its vendor, and the
 * composer says so before the first use.
 *
 * One utterance per `listen`, ending on a pause or on `stop`. The plugin is
 * asked for final results only (`partialResults: false`): in that mode
 * `start` settles with the transcript or rejects with the recognizer's
 * error, whereas with partial results it resolves at once and a later
 * error, or hearing nothing, reaches JavaScript as nothing at all. So no
 * words appear while the learner speaks; they appear when they stop.
 *
 * The microphone permission is RECORD_AUDIO, the one soundbites already
 * asks for (apps/mobile's manifest and `review/policy.json`).
 *
 * The plugin is imported on the first `listen` only, so no build loads it
 * before a learner taps Speak, and only the device build passes this in
 * (`components/player/session-viewport.tsx`).
 */
// Types only: erased at build, so the activity stays out of the main bundle
// (the reason `lib/leetype-content` imports nothing from the package).
import type { Dictation, DictationFailure, Listening } from "@some-ui/leetype"

/**
 * A rejection the port's consumer reads by its `reason`
 * (`dictationFailureOf`), so it need not be the package's own class, which
 * is a value and would pull the activity into the main bundle.
 */
class PhoneDictationError extends Error {
  constructor(readonly reason: DictationFailure) {
    super(`phone dictation ${reason}`)
    this.name = "PhoneDictationError"
  }
}

/** The Android recognizer's error text, as the port's failure. */
function failureOf(error: unknown): DictationFailure {
  const message = error instanceof Error ? error.message : String(error)
  if (/permission/i.test(message)) return "denied"
  if (/no match|no speech/i.test(message)) return "silent"
  return "failed"
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

export function phoneDictation(): Dictation {
  return {
    recognizer: "phone",
    listen(): Listening {
      // Asked to stop before the plugin had started: stop as soon as it has.
      const early = { stop: false }
      let stop: () => void = () => {
        early.stop = true
      }
      const done = (async (): Promise<string> => {
        try {
          const { SpeechRecognition } = await import(
            "@capacitor-community/speech-recognition"
          )
          let { speechRecognition } = await SpeechRecognition.checkPermissions()
          if (speechRecognition !== "granted") {
            ;({ speechRecognition } =
              await SpeechRecognition.requestPermissions())
          }
          if (speechRecognition !== "granted") {
            throw new PhoneDictationError("denied")
          }
          // The plugin's `stop` never settles its own call; nothing waits on it.
          stop = (): void =>
            void SpeechRecognition.stop().catch(() => undefined)
          const listening = SpeechRecognition.start({
            partialResults: false,
            popup: false,
            maxResults: 1,
          })
          if (early.stop) stop()
          const { matches } = await listening
          const text = matches?.[0]?.trim() ?? ""
          if (text === "") throw new PhoneDictationError("silent")
          return text
        } catch (error) {
          throw error instanceof PhoneDictationError
            ? error
            : new PhoneDictationError(failureOf(error))
        }
      })()
      // Nobody may be listening once the composer cancels.
      done.catch(() => undefined)
      return {
        done,
        stop: (): void => stop(),
        // The plugin has no abort; finishing early is the nearest thing, and
        // the composer drops what lands after a cancel.
        cancel: (): void => stop(),
      }
    },
  }
}
