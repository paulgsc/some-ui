/**
 * @module adapters/types
 *
 * The one interface every speech backend implements, and the only speech
 * vocabulary a consumer ever sees.
 *
 * Nothing outside this package should branch on *how* a phrase gets spoken.
 * A page in the Docker/dev deployment reaches an `openai-edge-tts` container
 * over HTTP; the same page on GitHub Pages has no backend at all and falls
 * back to the browser's own `speechSynthesis`. Both are `SpeechAdapter`s,
 * both are selected by configuration (see `./registry`), and a caller that
 * wanted to tell them apart would have to go looking for `adapter.id` -
 * which exists for diagnostics, the way `DataSource.mode` does in
 * `@some-ui/fetch-kit`, and not for branching.
 */

import type { SpokenLanguage } from "@speech/lib/language"

export type SpeechAdapterId = "http" | "native" | "web-speech"

/**
 * Whether a platform can speak a language, as far as it has said. The
 * platform's own answer is its business (a catalogue lookup, a voice list
 * that loads late, a probe over a native bridge); this is what the adapter
 * makes of it, and all anything outside an adapter switches on.
 *
 * - `"available"` - it has a voice for the language.
 * - `"missing"` - it has said it has none: a hosted provider with no voice
 *   for it, a browser whose loaded voices include none, a phone without the
 *   voice data.
 * - `"checking"` - it has not said yet: a browser's voices still loading, a
 *   phone's probe still out.
 * - `"unverifiable"` - asking failed, so nothing is known; a line is tried
 *   anyway, and the platform's own error says what went wrong.
 */
export type VoiceAvailability =
  | "available"
  | "missing"
  | "checking"
  | "unverifiable"

/**
 * Who would speak a line in a given language, as a person would want to
 * know it: the platform, the voice by name, and whether it has one.
 *
 * - `"hosted"` - this site's voice service; `voice` is the catalogue voice
 *   `hostedVoiceFor` picks for the language.
 * - `"browser"` - the browser's own synthesizer; `voice` is the browser
 *   voice the adapter hands the line to.
 * - `"phone"` - the phone's text-to-speech (the Android app).
 *
 * When `availability` is `"missing"`, a hosted line fails and a browser
 * reads it in `voice` anyway, another language's voice, which is what an
 * un-Korean Korean line sounds like. `voice` is a name to show a person,
 * null when there is none to show; nothing branches on it.
 */
export type VoiceReport = {
  readonly platform: "hosted" | "browser" | "phone"
  readonly voice: string | null
  readonly availability: VoiceAvailability
}

/**
 * A device voice named for one line: the engine's own default for the
 * line's language, or one of the engine's voices by its opaque id. Two
 * arms, not an optional id, so "the engine's default" cannot be mistaken
 * for "nothing named, use the person's choice".
 */
export type DeviceVoiceChoice =
  | { readonly kind: "engine-default" }
  | { readonly kind: "voice"; readonly id: string }

/**
 * What a line asks for: its language, never a voice. Which voice speaks it
 * is the backend's business - the person's hosted choice (`lib/voices`), or
 * whatever the device's synthesizer has for that language - so no caller
 * can override the person's choice by naming a voice of its own.
 */
export type SpeakOptions = {
  /** The text's language. Omitted, the backend's default language. */
  language?: SpokenLanguage
  /**
   * A device voice for this one line, named by the session only (Settings'
   * sample of a phone voice); absent, the voice the person chose. An applet
   * cannot set it: `SayOptions` leaves it out. Adapters with no device
   * voices to name ignore it.
   */
  voice?: DeviceVoiceChoice
  /** Aborting this rejects the returned promise with an `AbortError`. */
  signal?: AbortSignal
  volume?: number
  playbackRate?: number
  onStart?: () => void
  onEnd?: () => void
  onError?: (error: Error) => void
  onProgress?: (currentTime: number, duration: number) => void
  /**
   * Word-boundary progress. Only the browser adapter can report it; the
   * HTTP adapter receives opaque audio bytes and never calls it.
   */
  onBoundary?: (charIndex: number, charLength: number) => void
}

/**
 * ## The settlement laws
 *
 * Every implementation must satisfy all four. They are not documentation:
 * `adapter-contract.test.ts` runs the same suite against each adapter, and
 * a new backend is expected to be added to that list.
 *
 * 1. **Exactly once.** A `speak()` promise settles once and only once.
 * 2. **Cancellation is an `AbortError`.** Aborting the caller's signal, or
 *    calling `stop()`/`dispose()`, rejects with `name === "AbortError"`.
 *    Real failures reject with the underlying error. The queue relies on
 *    that split to decide between dropping an utterance and retrying it.
 * 3. **Teardown flushes.** When `stop()` or `dispose()` returns,
 *    `pending === 0`: no caller is still waiting on work that will never
 *    happen. This is the law the previous implementation broke, and the
 *    reason a finished session could keep the next one wedged.
 * 4. **Disposal is terminal.** After `dispose()`, `speak()` rejects
 *    immediately with an `AbortError` rather than starting new work.
 */
export type SpeechAdapter = {
  readonly id: SpeechAdapterId
  /** False when the runtime can't do speech at all - callers may show UI. */
  readonly supported: boolean
  /**
   * Who would speak a line in `language` right now. A snapshot: a
   * browser's or phone's voices load asynchronously, so read it when it is
   * shown, and again when `subscribe` says it may have changed.
   */
  describe: (language: SpokenLanguage) => VoiceReport
  /**
   * Calls `listener` when what `describe` would say may have changed: a
   * browser's or phone's voices finished loading, voice data was found
   * missing. Returns the unsubscribe.
   */
  subscribe: (listener: () => void) => () => void
  /** Outstanding `speak()` promises. Diagnostics and tests only. */
  readonly pending: number
  speak: (text: string, options?: SpeakOptions) => Promise<void>
  stop: () => void
  pause: () => void
  resume: () => void
  setVolume: (volume: number) => void
  setPlaybackRate: (rate: number) => void
  dispose: () => void
}
