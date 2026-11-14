/**
 * @module adapters/registry
 *
 * Which backend speaks: the one the app passes.
 *
 * Every voice this package has runs on the device: the browser's
 * `speechSynthesis` (`webSpeech`) on the web, and the phone's text-to-speech
 * (`nativeSpeech`) in the Android app. Each is its own package entry
 * (`@some-ui/speech/web-speech`, `/native`), and the app passes the one it
 * runs as `backend`, so a build carries no backend it never uses
 * (`./backend`). There is no default and no fallback: a runtime where the
 * backend cannot speak gets an adapter whose `supported` is false and whose
 * `speak()` rejects, and the session says so.
 */

import type { SpokenLanguage } from "@speech/lib/language"

import type { SpeechBackend } from "./backend"
import { factoryOf } from "./backend"
import type { NativeSpeechEngine } from "./native"
import type { SpeechAdapter } from "./types"

export type SpeechConfig = {
  /** The language of lines that don't say their own. */
  language?: SpokenLanguage
  /**
   * The phone's own text-to-speech, for an app that has one (the Android
   * app, whose WebView has no working `speechSynthesis`). What
   * `nativeSpeech` speaks through; nothing else reads it.
   */
  native?: NativeSpeechBackend
  /**
   * What speaks: a backend from one of this package's entries, or a factory
   * of the caller's own (a test fake, a future backend).
   */
  backend: SpeechBackend | SpeechAdapterFactory
}

export type NativeSpeechBackend = {
  /** A stable object, like `backend`: not part of the session's identity. */
  readonly engine: NativeSpeechEngine
  /**
   * The voice the person picked from the phone's own list (an opaque id from
   * `engine.getVoices`). The phone's voices are the platform's, not ours, so
   * this is a string from that list rather than a catalogue type.
   */
  readonly voiceId?: string
  /** Called when a line is refused for want of voice data. */
  readonly onMissingVoice?: (language: SpokenLanguage) => void
}

export type SpeechAdapterFactory = (config: SpeechConfig) => SpeechAdapter

/**
 * The package's front door. Hand it configuration, get back something that
 * speaks - or, in a runtime where nothing can, something whose `supported`
 * is false and whose `speak()` rejects honestly.
 */
export function createSpeechAdapter(config: SpeechConfig): SpeechAdapter {
  const factory =
    typeof config.backend === "function"
      ? config.backend
      : factoryOf(config.backend)
  return factory(config)
}
