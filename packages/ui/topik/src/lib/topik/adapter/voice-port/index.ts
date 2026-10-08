/**
 * The drama's voice port over the page's speech session: makjang's
 * `VoicePort` (`media.ts`), adapted from `@some-ui/speech`'s `Speaker`.
 *
 * Every character speaks in the voice the person chose in Settings, since a
 * `Speaker` cannot name one (docs/makjang/README.md, "3. Media"). What
 * became of a line is translated once, here: a muted, failed or ended line
 * was not presented, and the beat stays readable as text. A line is audible
 * unless the person muted voice or the device has no Korean voice; one still
 * being checked counts as audible.
 */

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
        .then((outcome) => PRESENTED[outcome.kind]),
    audible: () =>
      !speaker.muted &&
      speaker.describe(SPOKEN_LANGUAGE).availability !== "missing",
    subscribe: (listener) => speaker.subscribe(listener),
  }
}
