/**
 * @vitest-environment jsdom
 *
 * The mode gate, which is the only interesting thing this module does.
 *
 * Getting it wrong fails the way every content shim in this app fails:
 * quietly. Fetching on GitHub Pages means a 404 per session against a file
 * that was never deployed; not fetching locally means the material a person
 * just curated is invisible with nothing to say why.
 *
 * `@vitest-environment jsdom` because the data sources' locators resolve
 * against `window.location.origin`, same as `hangul-vocab`'s.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type * as TopikContent from "."

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

function statusResponse(status: number, statusText: string): Response {
  return new Response(null, { status, statusText })
}

/**
 * What nginx's `try_files $uri $uri/ /index.html` (and `vite preview`'s SPA
 * fallback) actually serves for a `/topiks/manifest.json` that doesn't exist
 * on disk: the app shell, at HTTP 200 - not a 404. See this module's header
 * comment.
 */
function spaFallbackResponse(): Response {
  return new Response("<!doctype html><html><body>app shell</body></html>", {
    status: 200,
    headers: { "content-type": "text/html" },
  })
}

/**
 * `FETCHES_CONTENT` is a build-time constant folded at import, so each case
 * re-imports the module under a different env rather than calling a setter.
 */
async function loadModule(): Promise<typeof TopikContent> {
  vi.resetModules()
  return import(".")
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe("locateTopikFile", () => {
  it("resolves a manifest key to a file under the content root", async () => {
    const { locateTopikFile } = await loadModule()

    expect(locateTopikFile("topik-1")).toBe("/topiks/topik-1.json")
  })

  it("passes through a key that is already a path or URL", async () => {
    const { locateTopikFile } = await loadModule()

    // Keys are identifiers by convention, not by enforcement - a manifest
    // that points somewhere else should not be silently rewritten.
    expect(locateTopikFile("/elsewhere/a.json")).toBe("/elsewhere/a.json")
    expect(locateTopikFile("https://cdn.test/a.json")).toBe(
      "https://cdn.test/a.json"
    )
  })
})

describe("loadTopikManifest - static builds", () => {
  it("resolves to an empty catalogue without issuing a request", async () => {
    vi.stubEnv("VITE_STATIC_DATA", "true")
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)

    const { loadTopikManifest, EMPTY_TOPIK_MANIFEST } = await loadModule()

    await expect(loadTopikManifest()).resolves.toEqual(EMPTY_TOPIK_MANIFEST)
    // The Pages build deploys no companion data; a request here is a 404
    // per session against a file that was never going to be there.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("refuses a topik load loudly rather than resolving to nothing", async () => {
    vi.stubEnv("VITE_STATIC_DATA", "true")
    const { loadTopikFile } = await loadModule()

    await expect(loadTopikFile("topik-1")).rejects.toThrow(/no topik material/i)
  })
})

describe("loadTopikManifest - builds that serve public/", () => {
  it("fetches the manifest from the content root", async () => {
    vi.stubEnv("VITE_STATIC_DATA", undefined)
    const manifest = { version: "1", topiks: [] }
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(manifest))
    vi.stubGlobal("fetch", fetchSpy)

    const { loadTopikManifest } = await loadModule()

    await expect(loadTopikManifest()).resolves.toEqual(manifest)
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/topiks/manifest.json", window.location.origin),
      expect.anything()
    )
  })

  it("treats a missing manifest as an empty catalogue, not a failure", async () => {
    vi.stubEnv("VITE_STATIC_DATA", undefined)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(statusResponse(404, "Not Found"))
    )

    const { loadTopikManifest, EMPTY_TOPIK_MANIFEST } = await loadModule()

    // The common case on a fresh checkout: the material is curated and
    // gitignored, so "nobody has generated any topiks yet" is expected.
    await expect(loadTopikManifest()).resolves.toEqual(EMPTY_TOPIK_MANIFEST)
  })

  it("surfaces a non-404 manifest failure instead of masking it as empty", async () => {
    vi.stubEnv("VITE_STATIC_DATA", undefined)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(statusResponse(500, "Boom"))
    )

    const { loadTopikManifest } = await loadModule()

    // A 500 (or a timeout) means something is actually broken - only a 404,
    // or a 200 that isn't shaped like a manifest, reads as "nobody generated
    // this yet."
    await expect(loadTopikManifest()).rejects.toThrow(/500/)
  })

  it("treats an SPA-fallback response as an empty catalogue, not a crash", async () => {
    vi.stubEnv("VITE_STATIC_DATA", undefined)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(spaFallbackResponse()))

    const { loadTopikManifest, EMPTY_TOPIK_MANIFEST } = await loadModule()

    // A missing manifest in server mode (fresh checkout, unmounted
    // WWW_TOPIK_ASSETS_PATH) comes back as index.html at HTTP 200 via
    // nginx's/vite's SPA fallback, not a 404 - this must resolve the same
    // way a 404 does, not hand `index.html`'s markup to the applet as if it
    // were a manifest.
    await expect(loadTopikManifest()).resolves.toEqual(EMPTY_TOPIK_MANIFEST)
  })

  it("fetches a selected topik's batches by key", async () => {
    vi.stubEnv("VITE_STATIC_DATA", undefined)
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse([]))
    vi.stubGlobal("fetch", fetchSpy)

    const { loadTopikFile } = await loadModule()

    await loadTopikFile("topik-1")
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/topiks/topik-1.json", window.location.origin),
      expect.anything()
    )
  })

  it("surfaces a failed topik load rather than swallowing it", async () => {
    vi.stubEnv("VITE_STATIC_DATA", undefined)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(statusResponse(500, "Boom"))
    )

    const { loadTopikFile } = await loadModule()

    // Unlike a missing manifest, a chosen topik that won't load is a real
    // failure: the person picked it and expects it.
    await expect(loadTopikFile("topik-1")).rejects.toThrow(/500/)
  })
})
