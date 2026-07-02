import type {
  InterviewTTSAdapter,
  SpeakOptions,
} from "@chat/lib/interview/core/interview-types"

/**
 * Real (non-mocked) question playback using the browser's SpeechSynthesis
 * API. This is an interim implementation - the shape matches what a
 * backend-driven TTS adapter (e.g. `some-ui-utils`'s `useAudioTTS`) would
 * expose, so swapping in real audio later doesn't touch call sites.
 */
export const createWebSpeechTTSAdapter = (): InterviewTTSAdapter => {
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window

  const speak = (text: string, opts?: SpeakOptions): Promise<void> => {
    if (!supported) {
      return Promise.resolve()
    }

    window.speechSynthesis.cancel()

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.98
      utterance.pitch = 1

      utterance.onboundary = (event): void => {
        opts?.onBoundary?.(event.charIndex, event.charLength)
      }
      utterance.onend = (): void => resolve()
      utterance.onerror = (): void => resolve()

      window.speechSynthesis.speak(utterance)
    })
  }

  const stop = (): void => {
    if (!supported) return
    window.speechSynthesis.cancel()
  }

  return { supported, speak, stop }
}
