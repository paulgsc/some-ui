import type { SpeechAdapter, SpeechAdapterRegistry } from "@speech/lib/adapters"
import { createSpeechAdapter, resolveSpeechConfig } from "@speech/lib/adapters"
import { httpSpeech } from "@speech/lib/adapters/http"
import { webSpeech } from "@speech/lib/adapters/web-speech"
import { createControllableAdapter } from "@speech/lib/testing"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

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
  it("decides the mode and leaves the rest of the config as given", () => {
    const adapters: SpeechAdapterRegistry = {}
    const resolved = resolveSpeechConfig({
      mode: "server",
      endpoint: "https://tts.internal/v1/audio/speech",
      adapters,
    })

    expect(resolved.mode).toBe("server")
    expect(resolved.endpoint).toBe("https://tts.internal/v1/audio/speech")
    expect(resolved.adapters).toBe(adapters)
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

  it("hands the config, with the mode it picked, to the factory", () => {
    let seen: [string | undefined, string] | undefined
    createSpeechAdapter({
      mode: "server",
      endpoint: "https://tts.internal/v1/audio/speech",
      adapters: {
        server: (config) => {
          seen = [config.endpoint, config.mode]
          return supported("http")
        },
      },
    })

    expect(seen).toEqual(["https://tts.internal/v1/audio/speech", "server"])
  })

  it("takes a backend token from an entry as readily as a factory", () => {
    const adapter = createSpeechAdapter({
      mode: "static",
      adapters: { static: webSpeech },
    })

    expect(adapter.id).toBe("web-speech")
    adapter.dispose()
  })

  it("falls through to the other mode when the chosen one has no backend", () => {
    // The Android app passes only the phone's voice, and pins its mode, but
    // a host that left the mode to the hostname heuristic still speaks.
    const adapter = createSpeechAdapter({
      mode: "server",
      adapters: { static: () => supported("native") },
    })

    expect(adapter.id).toBe("native")
  })

  it("refuses to start a session with no backend to speak with", () => {
    expect(() => createSpeechAdapter({ mode: "server", adapters: {} })).toThrow(
      'No speech backend for "server" or "static" mode'
    )
    expect(() =>
      createSpeechAdapter({
        mode: "server",
        fallbackWhenUnsupported: false,
        adapters: { static: () => supported("web-speech") },
      })
    ).toThrow('No speech backend for "server" mode')
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
            adapters: { server: httpSpeech },
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
