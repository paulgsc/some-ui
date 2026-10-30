/**
 * @module engine/tts-client
 *
 * Turns text into audio bytes over HTTP. Formerly `useTTSFetch`; it is a
 * plain client now because nothing about issuing a POST needs React, and
 * the HTTP adapter has to be constructible outside a component tree
 * (honeycomb's call site holds an adapter, not a hook).
 *
 * The per-provider request shapes are unchanged. The default provider,
 * `openai`, is the one `infra/compose/tts.yml` serves: `openai-edge-tts`
 * exposes an OpenAI-compatible `/v1/audio/speech`, which is why the
 * localhost:5050 default below is an OpenAI-shaped request.
 *
 * SP1: one request in flight per line and voice, owned by the client (README,
 * "A line asked for twice is fetched once").
 */

import { LANGUAGE_TAG } from "@speech/lib/language"
import {
  createAbortError,
  linkSignals,
  toError,
} from "@speech/lib/promise/abort"
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
        voice: { languageCode: LANGUAGE_TAG[voice.language], name: voice.id },
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
    // SSML is XML: the text is escaped, so a line with `&` or `<` is read
    // rather than breaking the request, and the namespace is SSML's own.
    body: (text, voice) =>
      `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${LANGUAGE_TAG[voice.language]}">
        <voice name="${escapeXml(voice.id)}">${escapeXml(text)}</voice>
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
  /** Forgets every cached line and ends every request still in flight. */
  clearCache: () => void
}

const DEFAULT_CACHE_SIZE = 32

/**
 * The whole text: a hash would let two lines share audio. JSON keeps the
 * fields apart whatever they contain.
 */
export function createCacheKey(
  text: string,
  voice: VoiceConfig,
  config: TTSServiceConfig
): string {
  return JSON.stringify([
    config.provider,
    voice.id,
    text,
    config.format ?? "mp3",
    config.quality ?? "medium",
  ])
}

type InFlight = {
  readonly audio: Promise<ArrayBuffer>
  readonly controller: AbortController
}

/**
 * One requester's view of a shared request: its own copy of the audio, or an
 * `AbortError` once its own signal aborts. Leaving never touches the request.
 */
function join(
  shared: Promise<ArrayBuffer>,
  signal: AbortSignal | undefined
): Promise<ArrayBuffer> {
  // Hand back a copy: `decodeAudioData` detaches whatever it is given, and
  // the next requester, or the cache, still needs the bytes.
  const copy = shared.then((audio) => audio.slice(0))
  if (!signal) return copy
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const leave = (): void => reject(createAbortError("Speech aborted"))
    signal.addEventListener("abort", leave, { once: true })
    copy
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", leave))
  })
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

  // SP1: the client owns each request, so a requester's cancel cannot end
  // it; why that differs from FK1 is in the README.
  const inFlight = new Map<string, InFlight>()

  const request = (
    key: string,
    apiConfig: TTSAPIConfig,
    text: string,
    voice: VoiceConfig
  ): InFlight => {
    const controller = new AbortController()
    const timeout = service.timeout ?? DEFAULT_TTS_TIMEOUT_MS
    const linked = linkSignals([controller.signal], timeout)

    const fetchAudio = async (): Promise<ArrayBuffer> => {
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
        return audio
      } catch (error) {
        // `fetch` reports an aborted request with its own generic AbortError,
        // losing which of the two reasons fired. `linked.signal.reason` still
        // has the specific one - a `clearCache` (drop the utterance) or a
        // timeout (a backend failure the queue is allowed to retry).
        if (linked.signal.aborted && linked.signal.reason instanceof Error) {
          throw linked.signal.reason
        }
        throw toError(error)
      } finally {
        linked.release()
      }
    }

    const entry: InFlight = { audio: fetchAudio(), controller }
    inFlight.set(key, entry)
    // Cleared by a callback, not inside `fetchAudio`, whose `finally` can
    // run before the entry is set.
    void entry.audio
      // Ignored: the failure reaches each requester through its own joined
      // promise; this chain only clears the map, and may outlive them all.
      .catch(() => undefined)
      .finally(() => {
        if (inFlight.get(key) === entry) inFlight.delete(key)
      })
    return entry
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
    // A copy, for the same reason `join` makes one.
    if (cached) return cached.slice(0)

    const { signal } = synthesizeOptions
    if (signal?.aborted) {
      throw createAbortError("Speech aborted before it started")
    }

    const pending = inFlight.get(key) ?? request(key, apiConfig, text, voice)
    return join(pending.audio, signal)
  }

  return {
    synthesize,
    clearCache: (): void => {
      cache.clear()
      const ending = [...inFlight.values()]
      inFlight.clear()
      for (const { controller } of ending) controller.abort()
    },
  }
}

const XML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
}

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => XML_ESCAPES[char] ?? char)
}
