/**
 * @vitest-environment jsdom
 *
 * This module reads `window.location` - the whole point of it is that the
 * default endpoint follows whatever host is serving the page - so it needs
 * a DOM. The rest of this app's unit tests run in the default node
 * environment.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  DEFAULT_TTS_PORT,
  describeTTSEndpoint,
  resolveTTSEndpoint,
  TTS_PROXY_PATH,
} from "."

/**
 * Worth pinning for the same reason `data-mode` is: getting this wrong
 * fails silently and asymmetrically. Point it at the wrong host and every
 * utterance 404s with nothing in the UI to say so; hardcode a host and it
 * works on exactly one machine - which is the bug this module replaced.
 *
 * The scheme split below is the second half of that: an absolute
 * `http://host:5050` URL from an HTTPS page is mixed content, which the
 * browser blocks before the request is ever made. That failure is
 * invisible in the same way - the applet simply never speaks - so it gets
 * pinned rather than rediscovered.
 */
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
    // The override is the escape hatch for deployments that front the
    // service somewhere else; the proxy default must not quietly win.
    servePageOver("https:", "nixos.local")
    vi.stubEnv("VITE_TTS_ENDPOINT", "https://tts.example.com/v1/audio/speech")

    expect(resolveTTSEndpoint()).toBe("https://tts.example.com/v1/audio/speech")
  })

  it("defaults to the compose service beside whatever host serves the page", () => {
    vi.stubEnv("VITE_TTS_ENDPOINT", undefined)

    // jsdom serves from localhost over HTTP; the rule is "same hostname,
    // TTS port", which is what makes this work unchanged on a LAN mDNS
    // name too.
    expect(resolveTTSEndpoint()).toBe(
      `http://${window.location.hostname}:${DEFAULT_TTS_PORT}/v1/audio/speech`
    )
  })

  it("stays on plain HTTP for an HTTP page, proxy or no proxy", () => {
    // Storybook and cert-less `vite dev` land here, and neither has a
    // same-origin proxy in front of it - this is the case that must not
    // move when the HTTPS one does.
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
    // Same-origin means relative: an absolute http:// URL here is the
    // mixed-content block, and an absolute https:// one would need a TLS
    // front-end the compose service does not have.
    expect(endpoint).not.toMatch(/^https?:/)
  })

  it("ignores an empty override rather than building an empty URL", () => {
    vi.stubEnv("VITE_TTS_ENDPOINT", "")

    expect(resolveTTSEndpoint() ?? "").toContain(String(DEFAULT_TTS_PORT))
  })
})

/**
 * The provenance exists for one failure in particular: an override that
 * points somewhere nothing is served looks identical, from the browser, to
 * a default that does - a 404 either way. Which rule won is the fact that
 * separates them, so it is reported rather than guessed at.
 */
describe("describeTTSEndpoint", () => {
  it("names an override as the reason, whatever it points at", () => {
    servePageOver("https:", "nixos.local")
    // A root-relative override with no proxy behind it: the case that
    // costs an afternoon, because the request looks perfectly ordinary.
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
