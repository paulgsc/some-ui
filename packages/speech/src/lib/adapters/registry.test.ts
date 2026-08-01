import { createControllableAdapter } from "@speech/lib/testing"
import type { VoiceConfig } from "@speech/lib/types/tts-types"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { SpeechAdapter, SpeechAdapterRegistry } from "."
import { createSpeechAdapter, resolveSpeechConfig } from "."

/**
 * What this file is really pinning is a boundary, not a lookup table: a
 * consumer names a *deployment* (or nothing at all, and lets the hostname
 * heuristic decide) and gets something that speaks. Which backend that is
 * comes from configuration and nothing else - no hostname string, no port,
 * no API key anywhere but a config field.
 */

function unsupported(id: SpeechAdapter["id"]): SpeechAdapter {
  const adapter = createControllableAdapter()
  return { ...adapter, id, supported: false }
}

function supported(id: SpeechAdapter["id"]): SpeechAdapter {
  const adapter = createControllableAdapter()
  return { ...adapter, id }
}

describe("resolveSpeechConfig", () => {
  it("defaults to the openai-edge endpoint the compose file publishes", () => {
    const resolved = resolveSpeechConfig({ mode: "server" })

    expect(resolved.service.provider).toBe("openai")
    expect(resolved.service.apiUrl).toBe(
      "http://localhost:5050/v1/audio/speech"
    )
  })

  it("takes the endpoint, key, format and timeout from config", () => {
    const resolved = resolveSpeechConfig({
      mode: "server",
      endpoint: "https://tts.internal/v1/audio/speech",
      apiKey: "from-config",
      format: "wav",
      timeoutMs: 5_000,
    })

    expect(resolved.service.apiUrl).toBe("https://tts.internal/v1/audio/speech")
    expect(resolved.service.apiKey).toBe("from-config")
    expect(resolved.service.format).toBe("wav")
    expect(resolved.service.timeout).toBe(5_000)
  })

  it("resolves voiceId against the provider's catalogue, falling back to its first", () => {
    const korean = resolveSpeechConfig({ voiceId: "ko-KR-SunHiNeural" })
    expect(korean.voice?.id).toBe("ko-KR-SunHiNeural")

    const unknown = resolveSpeechConfig({ voiceId: "not-a-voice" })
    expect(unknown.voice?.id).toBe("onyx")
  })
})

describe("createSpeechAdapter - mode-driven selection", () => {
  it("uses the server factory in server mode and the static one in static mode", () => {
    const registry: SpeechAdapterRegistry = {
      server: () => supported("http"),
      static: () => supported("web-speech"),
    }

    expect(createSpeechAdapter({ mode: "server", adapters: registry }).id).toBe(
      "http"
    )
    expect(createSpeechAdapter({ mode: "static", adapters: registry }).id).toBe(
      "web-speech"
    )
  })

  it("hands the resolved service config to the factory it picks", () => {
    let seen: string | undefined
    createSpeechAdapter({
      mode: "server",
      endpoint: "https://tts.internal/v1/audio/speech",
      adapters: {
        server: (config) => {
          seen = config.service.apiUrl
          return supported("http")
        },
      },
    })

    expect(seen).toBe("https://tts.internal/v1/audio/speech")
  })

  it("falls through to the other mode's adapter when the chosen one can't speak", () => {
    const adapter = createSpeechAdapter({
      mode: "server",
      adapters: {
        server: () => unsupported("http"),
        static: () => supported("web-speech"),
      },
    })

    // A runtime without Web Audio is a fact about the browser, not about
    // the deployment - the caller shouldn't have to find out about it.
    expect(adapter.id).toBe("web-speech")
    expect(adapter.supported).toBe(true)
  })

  it("keeps the mode's own adapter when neither can speak", () => {
    const adapter = createSpeechAdapter({
      mode: "server",
      adapters: {
        server: () => unsupported("http"),
        static: () => unsupported("web-speech"),
      },
    })

    expect(adapter.id).toBe("http")
    expect(adapter.supported).toBe(false)
  })

  it("respects an opt-out of the fallback", () => {
    const adapter = createSpeechAdapter({
      mode: "server",
      fallbackWhenUnsupported: false,
      adapters: {
        server: () => unsupported("http"),
        static: () => supported("web-speech"),
      },
    })

    expect(adapter.id).toBe("http")
  })

  it("disposes the adapter it discards, so nothing is left holding promises", () => {
    let disposals = 0
    const adapter = createSpeechAdapter({
      mode: "server",
      adapters: {
        server: () => {
          const base = unsupported("http")
          return {
            ...base,
            dispose: (): void => {
              disposals += 1
            },
          }
        },
        static: () => supported("web-speech"),
      },
    })

    expect(adapter.id).toBe("web-speech")
    expect(disposals).toBe(1)
  })
})

describe("createSpeechAdapter - property: configuration decides, nothing else", () => {
  it("always returns the registry entry for the resolved mode", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("server" as const, "static" as const),
        fc.option(fc.webUrl(), { nil: undefined }),
        fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
        (mode, endpoint, apiKey) => {
          const picked: Array<string> = []
          const adapter = createSpeechAdapter({
            mode,
            endpoint,
            apiKey,
            adapters: {
              server: () => {
                picked.push("server")
                return supported("http")
              },
              static: () => {
                picked.push("static")
                return supported("web-speech")
              },
            },
          })

          expect(picked).toEqual([mode])
          expect(adapter.supported).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("never exposes the endpoint or the key on the adapter it returns", () => {
    fc.assert(
      fc.property(
        fc.webUrl(),
        fc.string({ minLength: 8 }),
        (endpoint, apiKey) => {
          const adapter = createSpeechAdapter({
            mode: "server",
            endpoint,
            apiKey,
          })

          // A consumer holds a `SpeechAdapter` and nothing else: the
          // deployment detail it was built from is not reachable through it.
          const values = Object.values(adapter).filter(
            (value) => typeof value === "string"
          )
          expect(values).not.toContain(endpoint)
          expect(values).not.toContain(apiKey)

          adapter.dispose()
        }
      ),
      { numRuns: 50 }
    )
  })
})

describe("createSpeechAdapter - default registry", () => {
  it("reaches for the browser in static mode, where no backend exists", () => {
    const adapter = createSpeechAdapter({ mode: "static" })
    expect(adapter.id).toBe("web-speech")
  })

  it("reaches for the HTTP backend in server mode", () => {
    // jsdom has no speechSynthesis, so the fallback can't fire and the
    // server choice stands on its own.
    const adapter = createSpeechAdapter({ mode: "server" })
    expect(adapter.id).toBe("http")
    adapter.dispose()
  })

  it("passes the configured voice through as the adapter's default", () => {
    const voices: ReadonlyArray<VoiceConfig> = createSpeechAdapter({
      mode: "server",
    }).voices
    expect(voices.some((voice) => voice.id === "onyx")).toBe(true)
  })
})
