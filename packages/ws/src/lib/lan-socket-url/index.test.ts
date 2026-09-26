/**
 * @vitest-environment jsdom
 *
 * `resolveLanSocketUrl` reads `window.location`, so it needs a DOM - and the
 * cases worth pinning are the ones where the old inline
 * `ws://${hostname}:3000/ws` was wrong without saying so.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { resolveLanSocketUrl } from "."

afterEach(() => {
  vi.unstubAllGlobals()
})

function servePageOver(protocol: string, hostname: string): void {
  vi.stubGlobal("location", { ...window.location, hostname, protocol })
}

describe("resolveLanSocketUrl", () => {
  it("builds a ws:// URL from the page's own host on plain HTTP", () => {
    servePageOver("http:", "nixos.local")

    expect(resolveLanSocketUrl(3000, "/ws")).toBe("ws://nixos.local:3000/ws")
  })

  it("refuses an HTTPS page, where ws:// is blocked as mixed content", () => {
    // No server-side change can fix this one - the handshake never leaves
    // the browser - so returning a URL here would only produce a socket that
    // reconnects forever against a block.
    servePageOver("https:", "study.example.com")

    expect(resolveLanSocketUrl(3000, "/ws")).toBeUndefined()
  })

  it("refuses a WebView origin, which is HTTPS at localhost", () => {
    // apps/mobile: `https://localhost` is syntactically a fine host and
    // resolves to the device itself, so the old literal dialed a port on the
    // phone and retried on a timer - a background battery drain with no
    // visible symptom.
    servePageOver("https:", "localhost")

    expect(resolveLanSocketUrl(3000, "/ws")).toBeUndefined()
  })

  it("refuses when there is no window at all", () => {
    vi.stubGlobal("window", undefined)

    expect(resolveLanSocketUrl(3000, "/ws")).toBeUndefined()
  })

  it("tolerates a path given without its leading slash", () => {
    servePageOver("http:", "nixos.local")

    expect(resolveLanSocketUrl(3000, "ws")).toBe("ws://nixos.local:3000/ws")
  })
})
