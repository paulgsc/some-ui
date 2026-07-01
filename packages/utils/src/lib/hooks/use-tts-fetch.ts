import { useQueryClient } from "@tanstack/react-query"
import type {
  TTSAPIConfig,
  TTSServiceConfig,
  VoiceConfig,
} from "@utils/types/tts-types"

// API configurations for different providers
const TTS_API_CONFIGS: Record<string, TTSAPIConfig> = {
  elevenlabs: {
    url: (_, voice) =>
      `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}`,
    headers: (config) => ({
      Accept: "audio/mpeg",
      "Content-Type": "application/json",
      "xi-api-key": config.apiKey || "",
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
    url: (config) => config.apiUrl || "http://localhost:5050/v1/audio/speech",
    headers: (config) => ({
      Authorization: `Bearer ${config.apiKey || "dummy_key"}`,
      "Content-Type": "application/json",
    }),
    body: (text, voice, config) =>
      JSON.stringify({
        model: "tts-1",
        input: text,
        voice: voice.id,
        response_format: config.format || "mp3",
        speed: 1.0,
      }),
    processResponse: (response) => response.arrayBuffer(),
  },
  google: {
    url: (config) =>
      `${config.apiUrl || "https://texttospeech.googleapis.com/v1/text:synthesize"}?key=${config.apiKey}`,
    headers: () => ({ "Content-Type": "application/json" }),
    body: (text, voice, config) =>
      JSON.stringify({
        input: { text },
        voice: { languageCode: voice.language || "en-US", name: voice.id },
        audioConfig: {
          audioEncoding: config.format?.toUpperCase() || "MP3",
          sampleRateHertz: config.sampleRate || 24000,
        },
      }),
    processResponse: async (response) => {
      const data = await response.json()
      return Uint8Array.from(atob(data.audioContent), (c) => c.charCodeAt(0))
        .buffer
    },
  },
  azure: {
    url: (config) => config.apiUrl || "",
    headers: (config) => ({
      "Ocp-Apim-Subscription-Key": config.apiKey || "",
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
    }),
    body: (text, voice) =>
      `<speak version="1.0" xmlns="https://www.w3.org/2001/10/synthesis" xml:lang="${voice.language || "en-US"}">
        <voice name="${voice.id}">${text}</voice>
      </speak>`,
    processResponse: (response) => response.arrayBuffer(),
  },
  custom: {
    url: (config) => config.apiUrl || "",
    headers: (config) => ({
      "Content-Type": "application/json",
      ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
    }),
    body: (text, voice) => JSON.stringify({ text, voice: voice.id }),
    processResponse: (response) => response.arrayBuffer(),
  },
}

// Simple hash function for cache keys
const createHash = (str: string): string => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

// Generate query key for TanStack Query
const createQueryKey = (
  text: string,
  voice: VoiceConfig,
  config: TTSServiceConfig
): Array<string> => {
  const textHash = createHash(text)
  return [
    "tts",
    config.provider,
    voice.id,
    textHash,
    config.format || "mp3",
    config.quality || "medium",
    (config.timeout || 30000).toString(), // Include timeout in cache key
  ]
}

// TTS synthesis function with timeout support
const synthesizeTTS = async (
  text: string,
  voice: VoiceConfig,
  config: TTSServiceConfig
): Promise<ArrayBuffer> => {
  const apiConfig = TTS_API_CONFIGS[config.provider]
  if (!apiConfig) {
    throw new Error(`Unsupported TTS provider: ${config.provider}`)
  }

  const url = apiConfig.url(config, voice)
  const headers = apiConfig.headers(config)
  const body = apiConfig.body(text, voice, config)
  const timeout = config.timeout || 30000 // Default 30 seconds

  try {
    // Create AbortController for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, timeout)

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      mode: "cors",
      credentials: "omit",
      signal: controller.signal,
    })

    // Clear timeout on successful response
    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")
      throw new Error(
        `${config.provider} TTS API error: ${response.status} ${response.statusText} - ${errorText}`
      )
    }

    return await apiConfig.processResponse(response)
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error(
          `TTS request timeout after ${timeout}ms for provider: ${config.provider}`
        )
      }
      // eslint-disable-next-line no-console
      console.error("TTS synthesis error:", error)
      throw error
    }
    throw new Error("Unknown TTS synthesis error")
  }
}

// Hook for fetching TTS audio data
type TTSFetch = {
  fetchTTS: (
    text: string,
    config: TTSServiceConfig,
    voice?: VoiceConfig
  ) => Promise<ArrayBuffer>
}

export function useTTSFetch(): TTSFetch {
  const queryClient = useQueryClient()

  const fetchTTS = async (
    text: string,
    config: TTSServiceConfig,
    voice?: VoiceConfig
  ): Promise<ArrayBuffer> => {
    if (!text.trim()) {
      throw new Error("Text cannot be empty")
    }
    if (!voice) {
      throw new Error("Voice must be selected")
    }

    const queryKey = createQueryKey(text, voice, config)

    return queryClient.fetchQuery({
      queryKey,
      queryFn: () => synthesizeTTS(text, voice, config),
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes
    })
  }

  return { fetchTTS }
}
