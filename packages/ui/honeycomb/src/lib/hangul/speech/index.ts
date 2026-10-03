// `Speech` stimuli (ADR 0001 §2(a), #762's Prompt/Concept Station), said by the page's speech
// session (`useSpeaker()` from `@some-ui/speech`): in the voice the person chose, and not at all
// while they have muted it. TTS-generated at runtime carries no bundling/licensing obligation
// (ADR 0001 §5), unlike a prerecorded asset - this is the whole reason the seed word list
// (`@honeycomb/data`) ships `ttsText` instead of an audio file per word.
//
// This file used to build its own browser voice at module level, outside any session, so a word
// prompt ignored the chosen voice, ignored mute, and failed without a notice. Honeycomb has no
// voice of its own now: it names the word's language and the session does the rest.

import type { Speaker } from "@some-ui/speech"

const WORD_LANGUAGE = "ko-KR"

/**
 * Says `text` through the page's speaker. A no-op (never throws) without one - a story, a test,
 * a host with no speech session - so callers need no feature-detection branch, and #762's UI
 * shows the word's Hangul spelling either way.
 */
export function sayWord(speaker: Speaker | null, text: string): void {
  if (!speaker || text.length === 0) return

  // Fire and forget, by design: a challenge advances on the learner's answer, not on the audio
  // finishing. The rejection still has to be consumed - a superseded, stopped or muted line
  // rejects as a cancellation instead of pretending it was spoken, and an unhandled rejection is
  // a poor way to find that out.
  void speaker.say(text, { lang: WORD_LANGUAGE }).catch(() => undefined)
}
