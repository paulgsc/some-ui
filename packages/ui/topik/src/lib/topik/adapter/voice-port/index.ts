/**
 * The drama's voice port over the page's speech session: makjang's
 * `VoicePort` (`media.ts`), adapted from `@some-ui/speech`'s `Speaker`.
 *
 * A `Speaker` cannot name a voice (docs/makjang/README.md, "3. Media"), so
 * a character is voiced in a part instead: their gender, when the cast gives
 * one, which the speech session reads in a woman's or a man's voice that
 * keeps the person's choice in Settings (`@some-ui/speech`'s `lib/part`).
 * Narration, and a character the cast gives no gender, speak in the chosen
 * voice as it is. What
 * became of a line is translated once, here: a muted, failed or ended line
 * was not presented, and the beat stays readable as text. A failed one is
 * also reported (`reportFailure`). A line is
 * audible unless the person muted voice or the device has no Korean voice;
 * one still being checked counts as audible.
 */

import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import type { Presented, VoicePort } from "@some-ui/makjang"
import type { SayOptions, Speaker, SpeechOutcome } from "@some-ui/speech"
import { SPOKEN_LANGUAGE } from "@topik/lib/topik/core/spoken-language"

const PRESENTED: Readonly<Record<SpeechOutcome["kind"], Presented>> = {
  heard: "presented",
  muted: "unavailable",
  failed: "unavailable",
  ended: "unavailable",
  preempted: "cancelled",
  cancelled: "cancelled",
}

function presented(outcome: SpeechOutcome): Presented {
  if (outcome.kind === "failed") {
    reportFailure({
      port: "speech session",
      error: toIntentError(outcome.error),
    })
  }
  return PRESENTED[outcome.kind]
}

/** Says `text` in Korean, in the session's voice. Never rejects. */
export const sayKorean = (
  speaker: Speaker,
  text: string,
  options: Omit<SayOptions, "language">
): Promise<Presented> =>
  speaker.say(text, { ...options, language: SPOKEN_LANGUAGE }).then(presented)

/** A voice port, or `null` when nothing here can speak at all. */
export function speakerVoice(speaker: Speaker | null): VoicePort | null {
  if (!speaker?.available) return null
  return {
    voice: (request, signal) =>
      sayKorean(speaker, request.text, {
        urgency: request.interrupt ? "now" : "next",
        signal,
        onStart: request.onStart,
        ...(request.gender === null ? {} : { part: request.gender }),
      }),
    audible: () =>
      !speaker.muted &&
      speaker.describe(SPOKEN_LANGUAGE).availability !== "missing",
    subscribe: (listener) => speaker.subscribe(listener),
  }
}
