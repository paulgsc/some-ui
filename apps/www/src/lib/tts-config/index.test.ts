/**
 * @vitest-environment jsdom
 *
 * The default endpoint follows `window.location`, so this needs a DOM.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  DEFAULT_TTS_PORT,
  describeTTSEndpoint,
  resolveTTSEndpoint,
  TTS_PROXY_PATH,
} from "."

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

/** jsdom's own location is HTTP; the HTTPS cases substitute their own. */
function servePageOver(protocol: "http:" | "https:", hostname: string): void {
  vi.stubGlobal("location", { ...window.location, hostname, protocol })
}

describe("resolveTTSEndpoint", () => {
  it("prefers an explicitly configured endpoint", () => {
    vi.stubEnv("VITE_TTS_ENDPOINT", "https://tts.example.com/v1/audio/speech")

    expect(resolveTTSEndpoint()).toBe("https://tts.example.com/v1/audio/speech")
  })

  it("keeps an explicit endpoint even on an HTTPS page", () => {
    servePageOver("https:", "nixos.local")
    vi.stubEnv("VITE_TTS_ENDPOINT", "https://tts.example.com/v1/audio/speech")

    expect(resolveTTSEndpoint()).toBe("https://tts.example.com/v1/audio/speech")
  })

  it("defaults to the compose service beside whatever host serves the page", () => {
    vi.stubEnv("VITE_TTS_ENDPOINT", undefined)

    // jsdom serves from localhost over HTTP: same hostname, TTS port.
    expect(resolveTTSEndpoint()).toBe(
      `http://${window.location.hostname}:${DEFAULT_TTS_PORT}/v1/audio/speech`
    )
  })

  it("stays on plain HTTP for an HTTP page, proxy or no proxy", () => {
    // Cert-less `vite dev`: no same-origin proxy.
    servePageOver("http:", "nixos.local")
    vi.stubEnv("VITE_TTS_ENDPOINT", undefined)

    expect(resolveTTSEndpoint()).toBe(
      `http://nixos.local:${DEFAULT_TTS_PORT}/v1/audio/speech`
    )
  })

  it("routes an HTTPS page through the same-origin proxy path", () => {
    servePageOver("https:", "nixos.local")
    vi.stubEnv("VITE_TTS_ENDPOINT", undefined)

    const endpoint = resolveTTSEndpoint()

    expect(endpoint).toBe(`${TTS_PROXY_PATH}/v1/audio/speech`)
    // Relative: an absolute http:// URL would be blocked as mixed content.
    expect(endpoint).not.toMatch(/^https?:/)
  })

  it("ignores an empty override rather than building an empty URL", () => {
    vi.stubEnv("VITE_TTS_ENDPOINT", "")

    expect(resolveTTSEndpoint() ?? "").toContain(String(DEFAULT_TTS_PORT))
  })
})

/** Which rule won: a dead override and a default both 404 in the browser. */
describe("describeTTSEndpoint", () => {
  it("names an override as the reason, whatever it points at", () => {
    servePageOver("https:", "nixos.local")
    // A root-relative override with no proxy behind it.
    vi.stubEnv("VITE_TTS_ENDPOINT", "/v1/audio/speech")

    expect(describeTTSEndpoint()).toEqual({
      endpoint: "/v1/audio/speech",
      source: "override",
    })
  })

  it("distinguishes the two derived endpoints by scheme", () => {
    vi.stubEnv("VITE_TTS_ENDPOINT", undefined)

    servePageOver("https:", "nixos.local")
    expect(describeTTSEndpoint().source).toBe("same-origin-proxy")

    servePageOver("http:", "nixos.local")
    expect(describeTTSEndpoint().source).toBe("published-port")
  })

  it("agrees with resolveTTSEndpoint", () => {
    servePageOver("https:", "nixos.local")
    vi.stubEnv("VITE_TTS_ENDPOINT", undefined)

    expect(describeTTSEndpoint().endpoint).toBe(resolveTTSEndpoint())
    expect(resolveTTSEndpoint()).toBe(`${TTS_PROXY_PATH}/v1/audio/speech`)
  })
})
