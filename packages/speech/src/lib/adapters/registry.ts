/**
 * @module adapters/registry
 *
 * Which backend speaks, decided by configuration.
 *
 * This mirrors `createDataSource` in `@some-ui/fetch-kit`: one entry per
 * `RuntimeMode`, resolved once, and the caller never branches on - or is
 * told - which entry answered. The deployment reality of this repo:
 *
 * - **`"server"`** - `vite dev`, `vite preview` and the Docker/nginx image
 *   all have `infra/compose/tts.yml`'s `openai-edge-tts` reachable, so they
 *   pass `httpSpeech` pointed at it.
 * - **`"static"`** - the GitHub Pages build ships no services, so it passes
 *   the device's own voice: the browser's `speechSynthesis`
 *   (`webSpeech`), or the phone's text-to-speech (`nativeSpeech`, the
 *   Android app).
 *
 * There are no defaults. Each backend is its own package entry
 * (`@some-ui/speech/http`, `/web-speech`, `/native`) and the app passes the
 * ones it runs in `adapters`, so a build carries no backend it never uses
 * (`./backend`). Every knob a backend reads - endpoint, credentials,
 * provider, voice - is a config field. There is no hardcoded host or key
 * anywhere in this package's runtime path; `DEFAULT_OPENAI_EDGE_ENDPOINT` is
 * a documented default that any consumer can replace.
 */

import type { RuntimeMode, RuntimeModeOptions } from "@some-ui/fetch-kit"
import { resolveRuntimeMode } from "@some-ui/fetch-kit"
import type { FetchImpl } from "@speech/lib/engine/tts-client"
import type { SpokenLanguage } from "@speech/lib/language"
import type { AudioFormat } from "@speech/lib/types/tts-types"
import type { HostedVoiceChoice } from "@speech/lib/voices"

import type { SpeechBackend } from "./backend"
import { factoryOf } from "./backend"
import type { NativeSpeechEngine } from "./native"
import type { SpeechAdapter } from "./types"

export type SpeechConfig = RuntimeModeOptions & {
  /**
   * Where the HTTP backend lives. Defaults to the `openai-edge-tts`
   * endpoint published by `infra/compose/tts.yml`. Apps with a build-time
   * signal (an env var, a tenant setting) should pass it explicitly.
   */
  endpoint?: string
  apiKey?: string
  /**
   * The hosted voice: the provider (the HTTP adapter's request shape;
   * `openai` is edge-tts-compatible) and the voice the person chose from it,
   * typed so a voice of another provider does not compile. Defaults to
   * `openai` with nothing chosen. The device's own voice ignores it: it
   * takes a language, never one of our voices (`lib/voices`).
   */
  hosted?: HostedVoiceChoice
  format?: AudioFormat
  timeoutMs?: number
  /** The language of lines that don't say their own. */
  language?: SpokenLanguage
  /**
   * The phone's own text-to-speech, for an app that has one (the Android
   * app, whose WebView has no working `speechSynthesis`). What
   * `nativeSpeech` speaks through; nothing else reads it.
   */
  native?: NativeSpeechBackend
  /**
   * What speaks in each mode: a backend from one of this package's entries,
   * or a factory of the caller's own (a test fake, a future backend). A
   * mode left out has nothing to speak with, and falls through to the other
   * mode's entry as an unsupported one would.
   */
  adapters: SpeechAdapterRegistry
  /** Injected in tests. */
  fetchImpl?: FetchImpl
  /**
   * When the mode's adapter reports `supported === false`, fall through to
   * the other mode's adapter instead of handing back one that cannot
   * speak. On by default: a runtime without `AudioContext` is a fact about
   * the browser, not about the deployment, and the caller has no business
   * discovering it. Set false to make an unsupported runtime observable.
   */
  fallbackWhenUnsupported?: boolean
}

export type NativeSpeechBackend = {
  /** A stable object, like `adapters`: not part of the session's identity. */
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

/** Everything a factory needs: the config, with the mode decided. */
type ResolvedSpeechConfig = SpeechConfig & {
  mode: RuntimeMode
}

export type SpeechAdapterFactory = (
  config: ResolvedSpeechConfig
) => SpeechAdapter

export type SpeechAdapterRegistry = Readonly<
  Partial<Record<RuntimeMode, SpeechBackend | SpeechAdapterFactory>>
>

const OTHER_MODE: Readonly<Record<RuntimeMode, RuntimeMode>> = {
  server: "static",
  static: "server",
}

function buildAdapter(
  config: ResolvedSpeechConfig,
  mode: RuntimeMode
): SpeechAdapter | null {
  const entry = config.adapters[mode]
  if (!entry) return null
  const factory = typeof entry === "function" ? entry : factoryOf(entry)
  return factory({ ...config, mode })
}

/**
 * The package's front door. Hand it configuration, get back something that
 * speaks - or, in a runtime where nothing can, something whose `supported`
 * is false and whose `speak()` rejects honestly.
 */
export function createSpeechAdapter(config: SpeechConfig): SpeechAdapter {
  const resolved: ResolvedSpeechConfig = {
    ...config,
    mode: resolveRuntimeMode(config),
  }
  const fallbackMode = OTHER_MODE[resolved.mode]

  const primary = buildAdapter(resolved, resolved.mode)
  if (primary?.supported || config.fallbackWhenUnsupported === false) {
    if (primary) return primary
    throw new Error(
      `No speech backend for "${resolved.mode}" mode: pass one in SpeechConfig.adapters.`
    )
  }

  const fallback = buildAdapter(resolved, fallbackMode)
  if (!fallback) {
    if (primary) return primary
    throw new Error(
      `No speech backend for "${resolved.mode}" or "${fallbackMode}" mode: pass one in SpeechConfig.adapters.`
    )
  }
  if (primary && !fallback.supported) {
    // Neither can speak. Keep the mode's own adapter so diagnostics still
    // report the deployment's intent rather than the fallback's.
    fallback.dispose()
    return primary
  }

  primary?.dispose()
  return fallback
}
