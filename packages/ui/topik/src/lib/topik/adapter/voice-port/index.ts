/**
 * The drama's voice port over the page's speech session: makjang's
 * `VoicePort` (`media.ts`), adapted from `@some-ui/speech`'s `Speaker`.
 *
 * Every character speaks in the voice the person chose in Settings, since a
 * `Speaker` cannot name one (docs/makjang/README.md, "3. Media"). What
 * became of a line is translated once, here: a muted, failed or ended line
 * was not presented, and the beat stays readable as text. A failed one is
 * also reported (`reportFailure`), which release builds keep. A line is
 * audible unless the person muted voice or the device has no Korean voice;
 * one still being checked counts as audible.
 */

import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import type { Presented, VoicePort } from "@some-ui/makjang"
import type { Speaker, SpeechOutcome } from "@some-ui/speech"
import { SPOKEN_LANGUAGE } from "@topik/lib/topik/core/spoken-language"

const PRESENTED: Readonly<Record<SpeechOutcome["kind"], Presented>> = {
  heard: "presented",
  muted: "unavailable",
  failed: "unavailable",
  ended: "unavailable",
  preempted: "cancelled",
  cancelled: "cancelled",
}

/** What became of `outcome`, reporting it when the line failed. */
export function presented(outcome: SpeechOutcome): Presented {
  if (outcome.kind === "failed") {
    reportFailure({
      port: "speech session",
      error: toIntentError(outcome.error),
    })
  }
  return PRESENTED[outcome.kind]
}

/** A voice port, or `null` when nothing here can speak at all. */
export function speakerVoice(speaker: Speaker | null): VoicePort | null {
  if (!speaker?.available) return null
  return {
    voice: (request, signal) =>
      speaker
        .say(request.text, {
          language: SPOKEN_LANGUAGE,
          urgency: request.interrupt ? "now" : "next",
          signal,
          onStart: request.onStart,
        })
        .then(presented),
    audible: () =>
      !speaker.muted &&
      speaker.describe(SPOKEN_LANGUAGE).availability !== "missing",
    subscribe: (listener) => speaker.subscribe(listener),
  }
}
