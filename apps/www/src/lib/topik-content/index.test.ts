/**
 * @vitest-environment jsdom
 *
 * The mode gate, which is the only interesting thing this module does.
 *
 * Getting it wrong fails the way every content shim in this app fails:
 * quietly. Fetching on GitHub Pages means a failed request per session
 * against a server that build does not have; not fetching elsewhere means
 * the lessons `file_host` holds are invisible with nothing to say why.
 *
 * `@vitest-environment jsdom` because the locators resolve against
 * `window.location`, same as `lib/file-host-config`'s.
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

/** `file_host`'s envelope for every failure (its `error.rs`). */
function serverErrorResponse(status: number, code: string): Response {
  return new Response(
    JSON.stringify({ error: { code, message: code.replaceAll("_", " ") } }),
    { status, headers: { "content-type": "application/json" } }
  )
}

/**
 * What a static host's `try_files $uri $uri/ /index.html` serves for a path
 * it has no file for: the app shell, at HTTP 200. `file_host` never answers
 * like this, but a `VITE_FILE_HOST_ENDPOINT` pointed at the wrong host would.
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
/** jsdom serves the page over HTTP; the HTTPS case substitutes its own. */
function servePageOver(protocol: "http:" | "https:"): void {
  vi.stubGlobal("location", { ...window.location, protocol })
}

const httpBase = (): string =>
  `http://${window.location.hostname}:3000/api/v1/curriculum`

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

describe("locateTopikFileUrl", () => {
  it("names a lesson by key under file_host's curriculum route", async () => {
    const { locateTopikFileUrl } = await loadModule()

    expect(locateTopikFileUrl("topik-1").href).toBe(`${httpBase()}/topik-1`)
  })

  it("goes through the same-origin proxy on an HTTPS page", async () => {
    servePageOver("https:")
    const { locateTopikFileUrl } = await loadModule()

    // A cross-origin http://host:3000 request from an HTTPS page is mixed
    // content; see lib/file-host-config.
    expect(locateTopikFileUrl("topik-1").pathname).toBe(
      "/api/file-host/api/v1/curriculum/topik-1"
    )
  })

  it("encodes a key rather than letting it add path segments", async () => {
    const { locateTopikFileUrl } = await loadModule()

    // A key is an identity on the server, not a path (some-ui#1048).
    expect(locateTopikFileUrl("a b/../c").href).toBe(
      `${httpBase()}/a%20b%2F..%2Fc`
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
    // The Pages build has no file_host; a request here could only fail.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("refuses a topik load loudly rather than resolving to nothing", async () => {
    vi.stubEnv("VITE_STATIC_DATA", "true")
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    const { loadTopikFile } = await loadModule()

    await expect(loadTopikFile("topik-1")).rejects.toThrow(/no topik material/i)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("loadTopikManifest - builds with a file_host", () => {
  it("fetches the manifest from file_host's curriculum route", async () => {
    vi.stubEnv("VITE_STATIC_DATA", undefined)
    const manifest = { version: "1", topiks: [] }
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(manifest))
    vi.stubGlobal("fetch", fetchSpy)

    const { loadTopikManifest } = await loadModule()

    await expect(loadTopikManifest()).resolves.toEqual(manifest)
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL(`${httpBase()}/manifest.json`),
      expect.anything()
    )
  })

  it("treats a server with no curriculum route as an empty catalogue", async () => {
    vi.stubEnv("VITE_STATIC_DATA", undefined)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(serverErrorResponse(404, "not_found"))
    )

    const { loadTopikManifest, EMPTY_TOPIK_MANIFEST } = await loadModule()

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
    // or a 200 that isn't shaped like a manifest, reads as "nothing to study."
    await expect(loadTopikManifest()).rejects.toThrow(/500/)
  })

  it("surfaces the server refusing an oversized corpus, though it is a 400", async () => {
    vi.stubEnv("VITE_STATIC_DATA", undefined)
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          serverErrorResponse(400, "max_record_limit_exceeded")
        )
    )

    const { loadTopikManifest } = await loadModule()

    // The fetch client reports a body that fails `manifestShapeSchema` as a
    // 400 too; only that one means "not a manifest". This one means the
    // material exists and the server will not list it - empty would be a lie.
    await expect(loadTopikManifest()).rejects.toMatchObject({ status: 400 })
  })

  it("treats an SPA-fallback response as an empty catalogue, not a crash", async () => {
    vi.stubEnv("VITE_STATIC_DATA", undefined)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(spaFallbackResponse()))

    const { loadTopikManifest, EMPTY_TOPIK_MANIFEST } = await loadModule()

    // Must resolve the way a 404 does, not hand `index.html`'s markup to the
    // applet as if it were a manifest.
    await expect(loadTopikManifest()).resolves.toEqual(EMPTY_TOPIK_MANIFEST)
  })

  it("fetches a selected topik's batches by key", async () => {
    vi.stubEnv("VITE_STATIC_DATA", undefined)
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse([]))
    vi.stubGlobal("fetch", fetchSpy)

    const { loadTopikFile } = await loadModule()

    await loadTopikFile("topik-1")
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL(`${httpBase()}/topik-1`),
      expect.anything()
    )
  })

  it("surfaces a lesson the server no longer has rather than swallowing it", async () => {
    vi.stubEnv("VITE_STATIC_DATA", undefined)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(serverErrorResponse(404, "not_found"))
    )

    const { loadTopikFile } = await loadModule()

    // Unlike a missing manifest, a chosen topik that won't load is a real
    // failure: the person picked it and expects it.
    await expect(loadTopikFile("topik-1")).rejects.toMatchObject({
      status: 404,
    })
  })

  it("surfaces a failed topik load rather than swallowing it", async () => {
    vi.stubEnv("VITE_STATIC_DATA", undefined)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(statusResponse(500, "Boom"))
    )

    const { loadTopikFile } = await loadModule()

    await expect(loadTopikFile("topik-1")).rejects.toThrow(/500/)
  })
})
