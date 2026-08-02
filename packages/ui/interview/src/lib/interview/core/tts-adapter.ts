import type { InterviewTTSAdapter } from "@interview/lib/interview/core/interview-types"
import { createWebSpeechAdapter } from "@some-ui/speech"

/**
 * Question playback, delegated to `@some-ui/speech`.
 *
 * This file used to carry its own `SpeechSynthesisUtterance` plumbing. Two
 * of its promises were wrong in ways that only showed up as "the interview
 * stopped talking": `onerror` resolved as though the question had been read
 * in full, and the `speechSynthesis.cancel()` at the top of every `speak`
 * silently finished the previous utterance the same way. The speech
 * workspace owns that plumbing now, and gets those cases right - see
 * `adapters/web-speech`, and the settlement laws its contract test runs.
 *
 * The browser adapter specifically, not `createSpeechAdapter`: question
 * playback highlights the word being spoken, and word boundaries are
 * something only the browser's synthesizer reports. A caller that wants a
 * backend-driven voice passes its own adapter through
 * `InterviewSessionConfig.ttsAdapter` - any `SpeechAdapter` satisfies the
 * interview's port.
 */
export const createWebSpeechTTSAdapter = (): InterviewTTSAdapter =>
  createWebSpeechAdapter()
