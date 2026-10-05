// `Speech` stimuli (ADR 0001 §2(a)), said by the page's speech session (`useSpeaker()` from
// `@some-ui/speech`) in the chosen voice, and not at all while muted. Runtime TTS carries no
// licensing obligation (ADR 0001 §5), which is why the seed ships `ttsText`, not audio files.
// Honeycomb has no voice of its own: it names the word's language and the session does the rest.

import type { Speaker, SpokenLanguage, Urgency } from "@some-ui/speech"

const WORD_LANGUAGE: SpokenLanguage = "korean"

/**
 * Says `text` through the page's speaker; a no-op (never throws) without one, and the UI shows
 * the Hangul spelling either way.

 *
 * `urgency` says who asked: `"now"` for the learner's tap, which interrupts whatever else is
 * speaking on the page (a lesson line there is said again after it); `"next"` for a prompt the
 * page plays on its own (a hint tier escalating on a timer), which waits its turn.
 *
 * A word replaces this speaker's own earlier one, playing or waiting: a "next" hint a tap cut
 * off would otherwise be said again after the tap, as the session does for an interrupted
 * "next" line.
 */
export function sayWord(
  speaker: Speaker | null,
  text: string,
  urgency: Urgency
): void {
  if (!speaker || text.length === 0) return

  // Fire and forget, by design: a challenge advances on the learner's answer, not on the audio
  // finishing, so the line's outcome is not needed.
  speaker.stop()
  void speaker.say(text, { language: WORD_LANGUAGE, urgency })
}
