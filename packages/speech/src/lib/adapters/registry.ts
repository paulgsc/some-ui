/**
 * @module adapters/registry
 *
 * Which backend speaks, decided by configuration.
 *
 * This mirrors `createDataSource` in `@some-ui/fetch-kit`: one entry per
 * `RuntimeMode`, resolved once, and the caller never branches on - or is
 * told - which entry answered. The mapping it defaults to is the
 * deployment reality of this repo:
 *
 * - **`"server"`** - `vite dev`, `vite preview` and the Docker/nginx image
 *   all have `infra/compose/tts.yml`'s `openai-edge-tts` reachable, so they
 *   get the HTTP adapter pointed at it.
 * - **`"static"`** - the GitHub Pages build ships no services, so it gets
 *   the browser's `speechSynthesis`.
 *
 * Both halves are overridable. `adapters` swaps a factory per mode (a test
 * fake, a future backend), `mode` pins the choice outright, and every knob
 * the default factories read - endpoint, credentials, provider, voice - is
 * a config field. There is no hardcoded host or key anywhere in this
 * package's runtime path; `DEFAULT_OPENAI_EDGE_ENDPOINT` is a documented
 * default that any consumer can replace.
 */

import type { RuntimeMode, RuntimeModeOptions } from "@some-ui/fetch-kit"
import { resolveRuntimeMode } from "@some-ui/fetch-kit"
import type { FetchImpl } from "@speech/lib/engine/tts-client"
import { DEFAULT_OPENAI_EDGE_ENDPOINT } from "@speech/lib/engine/tts-client"
import type { AudioFormat, TTSServiceConfig } from "@speech/lib/types/tts-types"
import type { HostedVoiceChoice } from "@speech/lib/voices"
import { hostedVoiceFor } from "@speech/lib/voices"

import { createHttpSpeechAdapter } from "./http"
import type { SpeechAdapter } from "./types"
import { createWebSpeechAdapter } from "./web-speech"

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
  /** BCP-47 tag for lines that don't say what language they are in. */
  lang?: string
  /** Per-mode factory overrides. Anything omitted keeps the default. */
  adapters?: Partial<SpeechAdapterRegistry>
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

/** Everything a factory needs, with the defaults already applied. */
export type ResolvedSpeechConfig = SpeechConfig & {
  mode: RuntimeMode
  service: TTSServiceConfig
  hosted: HostedVoiceChoice
}

export type SpeechAdapterFactory = (
  config: ResolvedSpeechConfig
) => SpeechAdapter

export type SpeechAdapterRegistry = Readonly<
  Record<RuntimeMode, SpeechAdapterFactory>
>

const DEFAULT_SPEECH_ADAPTERS: SpeechAdapterRegistry = {
  server: (config) =>
    createHttpSpeechAdapter({
      service: config.service,
      voiceFor: (lang) => hostedVoiceFor(config.hosted, lang ?? config.lang),
      fetchImpl: config.fetchImpl,
    }),
  static: (config) => createWebSpeechAdapter({ lang: config.lang }),
}

const DEFAULT_HOSTED_CHOICE: HostedVoiceChoice = {
  provider: "openai",
  voiceId: null,
}

const OTHER_MODE: Readonly<Record<RuntimeMode, RuntimeMode>> = {
  server: "static",
  static: "server",
}

export function resolveSpeechConfig(
  config: SpeechConfig = {}
): ResolvedSpeechConfig {
  const hosted = config.hosted ?? DEFAULT_HOSTED_CHOICE
  const service: TTSServiceConfig = {
    provider: hosted.provider,
    apiUrl: config.endpoint ?? DEFAULT_OPENAI_EDGE_ENDPOINT,
    apiKey: config.apiKey,
    format: config.format ?? "mp3",
    timeout: config.timeoutMs,
  }

  return {
    ...config,
    mode: resolveRuntimeMode(config),
    service,
    hosted,
  }
}

/**
 * The package's front door. Hand it configuration, get back something that
 * speaks - or, in a runtime where nothing can, something whose `supported`
 * is false and whose `speak()` rejects honestly.
 */
export function createSpeechAdapter(config: SpeechConfig = {}): SpeechAdapter {
  const resolved = resolveSpeechConfig(config)
  const registry: SpeechAdapterRegistry = {
    ...DEFAULT_SPEECH_ADAPTERS,
    ...config.adapters,
  }

  const primary = registry[resolved.mode](resolved)
  if (primary.supported || config.fallbackWhenUnsupported === false) {
    return primary
  }

  const fallbackMode = OTHER_MODE[resolved.mode]
  const fallback = registry[fallbackMode]({ ...resolved, mode: fallbackMode })
  if (!fallback.supported) {
    // Neither can speak. Keep the mode's own adapter so diagnostics still
    // report the deployment's intent rather than the fallback's.
    fallback.dispose()
    return primary
  }

  primary.dispose()
  return fallback
}
