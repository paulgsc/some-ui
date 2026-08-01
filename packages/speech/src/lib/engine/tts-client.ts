/**
 * @module engine/tts-client
 *
 * Turns text into audio bytes over HTTP. Formerly `useTTSFetch`; it is a
 * plain client now because nothing about issuing a POST needs React, and
 * the HTTP adapter has to be constructible outside a component tree (the
 * interview and honeycomb call sites hold an adapter, not a hook).
 *
 * The per-provider request shapes are unchanged. The default provider,
 * `openai`, is the one `infra/compose/tts.yml` serves: `openai-edge-tts`
 * exposes an OpenAI-compatible `/v1/audio/speech`, which is why the
 * localhost:5050 default below is an OpenAI-shaped request.
 */

import { linkSignals, toError } from "@speech/lib/promise/abort"
import type {
  TTSAPIConfig,
  TTSServiceConfig,
  VoiceConfig,
} from "@speech/lib/types/tts-types"

/**
 * Where `openai-edge-tts` listens by default - the port published by
 * `infra/compose/tts.yml`'s nginx front-end. It is a default, not a
 * constant: every consumer can override it through `SpeechConfig.endpoint`,
 * and deployments that front it with another host are expected to.
 */
export const DEFAULT_OPENAI_EDGE_ENDPOINT =
  "http://localhost:5050/v1/audio/speech"

export const DEFAULT_TTS_TIMEOUT_MS = 30_000

const TTS_API_CONFIGS: Record<string, TTSAPIConfig> = {
  elevenlabs: {
    url: (_, voice) =>
      `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}`,
    headers: (config) => ({
      Accept: "audio/mpeg",
      "Content-Type": "application/json",
      "xi-api-key": config.apiKey ?? "",
    }),
    body: (text) =>
      JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: { stability: 0.5, similarity_boost: 0.5 },
      }),
    processResponse: (response) => response.arrayBuffer(),
  },
  openai: {
    url: (config) => config.apiUrl ?? DEFAULT_OPENAI_EDGE_ENDPOINT,
    headers: (config) => ({
      Authorization: `Bearer ${config.apiKey ?? "dummy_key"}`,
      "Content-Type": "application/json",
    }),
    body: (text, voice, config) =>
      JSON.stringify({
        model: "tts-1",
        input: text,
        voice: voice.id,
        response_format: config.format ?? "mp3",
        speed: 1.0,
      }),
    processResponse: (response) => response.arrayBuffer(),
  },
  google: {
    url: (config) =>
      `${config.apiUrl ?? "https://texttospeech.googleapis.com/v1/text:synthesize"}?key=${config.apiKey ?? ""}`,
    headers: () => ({ "Content-Type": "application/json" }),
    body: (text, voice, config) =>
      JSON.stringify({
        input: { text },
        voice: { languageCode: voice.language ?? "en-US", name: voice.id },
        audioConfig: {
          audioEncoding: config.format?.toUpperCase() ?? "MP3",
          sampleRateHertz: config.sampleRate ?? 24000,
        },
      }),
    processResponse: async (response) => {
      const data: { audioContent: string } = await response.json()
      const bytes = Uint8Array.from(atob(data.audioContent), (c) =>
        c.charCodeAt(0)
      )
      // `Uint8Array#buffer` is an ArrayBufferLike; copying into a fresh
      // ArrayBuffer avoids an assertion and any shared-buffer surprise.
      const audio = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(audio).set(bytes)
      return audio
    },
  },
  azure: {
    url: (config) => config.apiUrl ?? "",
    headers: (config) => ({
      "Ocp-Apim-Subscription-Key": config.apiKey ?? "",
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
    }),
    body: (text, voice) =>
      `<speak version="1.0" xmlns="https://www.w3.org/2001/10/synthesis" xml:lang="${voice.language ?? "en-US"}">
        <voice name="${voice.id}">${text}</voice>
      </speak>`,
    processResponse: (response) => response.arrayBuffer(),
  },
  custom: {
    url: (config) => config.apiUrl ?? "",
    headers: (config) => ({
      "Content-Type": "application/json",
      ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
    }),
    body: (text, voice) => JSON.stringify({ text, voice: voice.id }),
    processResponse: (response) => response.arrayBuffer(),
  },
}

export type FetchImpl = typeof fetch

export type TTSClientOptions = {
  service: TTSServiceConfig
  /** Injected in tests. Defaults to the platform `fetch`. */
  fetchImpl?: FetchImpl
  /** Entries kept in the in-memory audio cache. 0 disables caching. */
  cacheSize?: number
}

export type SynthesizeOptions = {
  signal?: AbortSignal
}

export type TTSClient = {
  synthesize: (
    text: string,
    voice: VoiceConfig,
    options?: SynthesizeOptions
  ) => Promise<ArrayBuffer>
  clearCache: () => void
}

const DEFAULT_CACHE_SIZE = 32

function hash(value: string): string {
  let result = 0
  for (let i = 0; i < value.length; i++) {
    result = (result * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(result).toString(36)
}

export function createCacheKey(
  text: string,
  voice: VoiceConfig,
  config: TTSServiceConfig
): string {
  return [
    config.provider,
    voice.id,
    hash(text),
    config.format ?? "mp3",
    config.quality ?? "medium",
  ].join(":")
}

export function createTTSClient(options: TTSClientOptions): TTSClient {
  const { service } = options
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const cacheSize = options.cacheSize ?? DEFAULT_CACHE_SIZE
  const cache = new Map<string, ArrayBuffer>()

  const remember = (key: string, audio: ArrayBuffer): void => {
    if (cacheSize <= 0) return
    cache.set(key, audio)
    while (cache.size > cacheSize) {
      const oldest = cache.keys().next().value
      if (oldest === undefined) break
      cache.delete(oldest)
    }
  }

  const synthesize = async (
    text: string,
    voice: VoiceConfig,
    synthesizeOptions: SynthesizeOptions = {}
  ): Promise<ArrayBuffer> => {
    if (!text.trim()) throw new Error("Text cannot be empty")

    const apiConfig = TTS_API_CONFIGS[service.provider]
    if (!apiConfig) {
      throw new Error(`Unsupported TTS provider: ${service.provider}`)
    }

    const key = createCacheKey(text, voice, service)
    const cached = cache.get(key)
    // Hand back a copy: `decodeAudioData` detaches whatever it is given, and
    // a detached cache entry is worse than no cache entry.
    if (cached) return cached.slice(0)

    const timeout = service.timeout ?? DEFAULT_TTS_TIMEOUT_MS
    const linked = linkSignals([synthesizeOptions.signal], timeout)

    try {
      const response = await doFetch(apiConfig.url(service, voice), {
        method: "POST",
        headers: apiConfig.headers(service),
        body: apiConfig.body(text, voice, service),
        mode: "cors",
        credentials: "omit",
        signal: linked.signal,
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => "Unknown error")
        throw new Error(
          `${service.provider} TTS API error: ${response.status} ${response.statusText} - ${detail}`
        )
      }

      const audio = await apiConfig.processResponse(response)
      remember(key, audio)
      return audio.slice(0)
    } catch (error) {
      // `fetch` reports an aborted request with its own generic AbortError,
      // losing which of the two reasons fired. `linked.signal.reason` still
      // has the specific one - a cancellation (drop the utterance) or a
      // timeout (a backend failure the queue is allowed to retry).
      if (linked.signal.aborted && linked.signal.reason instanceof Error) {
        throw linked.signal.reason
      }
      throw toError(error)
    } finally {
      linked.release()
    }
  }

  return {
    synthesize,
    clearCache: (): void => cache.clear(),
  }
}
