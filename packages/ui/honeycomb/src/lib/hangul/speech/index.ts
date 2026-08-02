// `Speech` stimuli (ADR 0001 §2(a), #762's Prompt/Concept Station), spoken through
// `@some-ui/speech`'s browser adapter. TTS-generated at runtime carries no bundling/licensing
// obligation (ADR 0001 §5), unlike a prerecorded asset - this is the whole reason the seed word
// list (`@honeycomb/data`) ships `ttsText` instead of an audio file per word.
//
// The `speechSynthesis` calls this file used to make by hand now live in one place for the whole
// repo, which is the point: three workspaces were each re-deriving the same cancel/settle
// handling, and getting it wrong differently. The exported shape is unchanged - no-ops (never
// throws) when speech isn't available, so callers don't need their own feature-detection branch,
// and #762's UI shows the word's Hangul spelling either way.

import type { SpeechAdapter } from "@some-ui/speech"
import { createWebSpeechAdapter } from "@some-ui/speech"

const DEFAULT_LANG = "ko-KR"

// One adapter for the page, built on first use: constructing it reads `window`, and this module
// gets imported by code that runs before there is one.
let adapter: SpeechAdapter | null = null

function getAdapter(): SpeechAdapter {
  adapter ??= createWebSpeechAdapter({ lang: DEFAULT_LANG })
  return adapter
}

export function isSpeechSynthesisAvailable(): boolean {
  return getAdapter().supported
}

export function speak(text: string, lang = DEFAULT_LANG): void {
  if (text.length === 0) return
  const speech = getAdapter()
  if (!speech.supported) return

  // Fire and forget, by design: a challenge advances on the learner's answer, not on the audio
  // finishing. The rejection still has to be consumed - the adapter rejects a superseded or
  // cancelled utterance now instead of pretending it was spoken, and an unhandled rejection is a
  // poor way to find that out.
  void speech
    .speak(text, {
      voice: { id: lang, name: lang, provider: "custom", language: lang },
    })
    .catch(() => undefined)
}

export function cancelSpeech(): void {
  getAdapter().stop()
}
