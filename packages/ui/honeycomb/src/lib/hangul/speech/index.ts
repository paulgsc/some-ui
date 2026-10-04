// `Speech` stimuli (ADR 0001 §2(a), #762's Prompt/Concept Station), said by the page's speech
// session (`useSpeaker()` from `@some-ui/speech`): in the voice the person chose, and not at all
// while they have muted it. TTS-generated at runtime carries no bundling/licensing obligation
// (ADR 0001 §5), unlike a prerecorded asset - this is the whole reason the seed word list
// (`@honeycomb/data`) ships `ttsText` instead of an audio file per word.
//
// This file used to build its own browser voice at module level, outside any session, so a word
// prompt ignored the chosen voice, ignored mute, and failed without a notice. Honeycomb has no
// voice of its own now: it names the word's language and the session does the rest.

import type { Speaker, SpokenLanguage, Urgency } from "@some-ui/speech"

const WORD_LANGUAGE: SpokenLanguage = "korean"

/**
 * Says `text` through the page's speaker. A no-op (never throws) without one - a story, a test,
 * a host with no speech session - so callers need no feature-detection branch, and #762's UI
 * shows the word's Hangul spelling either way.
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
