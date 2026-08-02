/**
 * @vitest-environment jsdom
 *
 * This module reads `window.location` - the whole point of it is that the
 * default endpoint follows whatever host is serving the page - so it needs
 * a DOM. The rest of this app's unit tests run in the default node
 * environment.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { DEFAULT_TTS_PORT, resolveTTSEndpoint } from "."

/**
 * Worth pinning for the same reason `data-mode` is: getting this wrong
 * fails silently and asymmetrically. Point it at the wrong host and every
 * utterance 404s with nothing in the UI to say so; hardcode a host and it
 * works on exactly one machine - which is the bug this module replaced.
 */
afterEach(() => {
  vi.unstubAllEnvs()
})

describe("resolveTTSEndpoint", () => {
  it("prefers an explicitly configured endpoint", () => {
    vi.stubEnv("VITE_TTS_ENDPOINT", "https://tts.example.com/v1/audio/speech")

    expect(resolveTTSEndpoint()).toBe("https://tts.example.com/v1/audio/speech")
  })

  it("defaults to the compose service beside whatever host serves the page", () => {
    vi.stubEnv("VITE_TTS_ENDPOINT", undefined)

    // jsdom serves from localhost; the rule is "same hostname, TTS port",
    // which is what makes this work unchanged on a LAN mDNS name too.
    expect(resolveTTSEndpoint()).toBe(
      `http://${window.location.hostname}:${DEFAULT_TTS_PORT}/v1/audio/speech`
    )
  })

  it("ignores an empty override rather than building an empty URL", () => {
    vi.stubEnv("VITE_TTS_ENDPOINT", "")

    expect(resolveTTSEndpoint() ?? "").toContain(String(DEFAULT_TTS_PORT))
  })
})
