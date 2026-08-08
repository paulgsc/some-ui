/**
 * @vitest-environment jsdom
 *
 * Like `lib/tts-config`'s suite, this module reads `window.location` - the
 * base URL follows whatever host is serving the page - so it needs a DOM.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  DEFAULT_FILE_HOST_PORT,
  describeFileHost,
  FILE_HOST_PROXY_PATH,
  fileHostUrl,
  resolveFileHostBase,
} from "."

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

/** jsdom's own location is HTTP; the HTTPS cases substitute their own. */
function servePageOver(protocol: "http:" | "https:", hostname: string): void {
  vi.stubGlobal("location", { ...window.location, hostname, protocol })
}

describe("resolveFileHostBase", () => {
  it("prefers an explicitly configured endpoint", () => {
    vi.stubEnv("VITE_FILE_HOST_ENDPOINT", "https://study.example.com/api/v1")

    expect(resolveFileHostBase()).toBe("https://study.example.com/api/v1")
  })

  it("keeps an explicit endpoint even on an HTTPS page", () => {
    servePageOver("https:", "nixos.local")
    vi.stubEnv("VITE_FILE_HOST_ENDPOINT", "https://study.example.com/api/v1")

    expect(resolveFileHostBase()).toBe("https://study.example.com/api/v1")
  })

  it("follows the page's own host on plain HTTP", () => {
    servePageOver("http:", "nixos.local")
    vi.stubEnv("VITE_FILE_HOST_ENDPOINT", undefined)

    expect(resolveFileHostBase()).toBe(
      `http://nixos.local:${DEFAULT_FILE_HOST_PORT}/api/v1`
    )
  })

  /**
   * The case the whole module exists for. A service worker only exists on
   * a secure context, so this - not the HTTP branch - is the study origin,
   * and an absolute `http://` URL here is a mixed-content block that no
   * server-side CORS change can lift.
   */
  it("routes an HTTPS page through the same-origin proxy path", () => {
    servePageOver("https:", "nixos.local")
    vi.stubEnv("VITE_FILE_HOST_ENDPOINT", undefined)

    const base = resolveFileHostBase()

    expect(base).toBe(`${FILE_HOST_PROXY_PATH}/api/v1`)
    expect(base).not.toMatch(/^https?:/)
  })

  it("ignores an empty override rather than building an empty URL", () => {
    vi.stubEnv("VITE_FILE_HOST_ENDPOINT", "")

    expect(resolveFileHostBase() ?? "").toContain(
      String(DEFAULT_FILE_HOST_PORT)
    )
  })
})

describe("describeFileHost", () => {
  it("names an override as the reason, whatever it points at", () => {
    servePageOver("https:", "nixos.local")
    vi.stubEnv("VITE_FILE_HOST_ENDPOINT", "/api/v1")

    expect(describeFileHost()).toEqual({
      baseUrl: "/api/v1",
      source: "override",
    })
  })

  it("distinguishes the two derived bases by scheme", () => {
    vi.stubEnv("VITE_FILE_HOST_ENDPOINT", undefined)

    servePageOver("https:", "nixos.local")
    expect(describeFileHost().source).toBe("same-origin-proxy")

    servePageOver("http:", "nixos.local")
    expect(describeFileHost().source).toBe("published-port")
  })
})

describe("fileHostUrl", () => {
  it("joins without doubling a slash on either side", () => {
    vi.stubEnv("VITE_FILE_HOST_ENDPOINT", "https://study.example.com/api/v1/")

    expect(fileHostUrl("/sessions")).toBe(
      "https://study.example.com/api/v1/sessions"
    )
    expect(fileHostUrl("sessions")).toBe(
      "https://study.example.com/api/v1/sessions"
    )
  })
})
