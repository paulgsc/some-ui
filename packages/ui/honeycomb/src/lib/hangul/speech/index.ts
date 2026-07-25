// Thin wrapper over the Web Speech API's SpeechSynthesis, for `Speech` stimuli (ADR 0001 §2(a),
// #762's Prompt/Concept Station). TTS-generated at runtime carries no bundling/licensing
// obligation (ADR 0001 §5), unlike a prerecorded asset - this is the whole reason the seed word
// list (`@honeycomb/data`) ships `ttsText` instead of an audio file per word.
//
// No-ops (never throws) when `speechSynthesis` isn't available, so callers don't need their own
// feature-detection branch - #762's UI must fall back to the romanization caption either way.

export function isSpeechSynthesisAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window
}

export function speak(text: string, lang = "ko-KR"): void {
  if (!isSpeechSynthesisAvailable() || text.length === 0) return

  window.speechSynthesis.cancel() // don't queue behind a stale utterance from a prior challenge
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang
  window.speechSynthesis.speak(utterance)
}

export function cancelSpeech(): void {
  if (!isSpeechSynthesisAvailable()) return
  window.speechSynthesis.cancel()
}
