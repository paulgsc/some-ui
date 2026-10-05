/**
 * @vitest-environment jsdom
 *
 * The mode gate and the fetch-vs-empty fallback; both fail quietly. jsdom
 * because the locators resolve against `window.location`.
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

/** A static host's `try_files ... /index.html` answer: the app shell, 200
 * (a `VITE_FILE_HOST_ENDPOINT` pointed at the wrong host). */
function spaFallbackResponse(): Response {
  return new Response("<!doctype html><html><body>app shell</body></html>", {
    status: 200,
    headers: { "content-type": "text/html" },
  })
}

/** jsdom serves the page over HTTP; the HTTPS case substitutes its own. */
function servePageOver(protocol: "http:" | "https:"): void {
  vi.stubGlobal("location", { ...window.location, protocol })
}

const httpBase = (): string =>
  `http://${window.location.hostname}:3000/api/v1/curriculum`

/** `FETCHES_CONTENT` is folded at import, so each case re-imports. */
async function loadModule(): Promise<typeof TopikContent> {
  vi.resetModules()
  return import(".")
}

/** The module in a build with a file_host whose every answer is `response`. */
async function withFileHost(
  response: Response
): Promise<typeof TopikContent & { fetchSpy: ReturnType<typeof vi.fn> }> {
  vi.stubEnv("VITE_STATIC_DATA", undefined)
  const fetchSpy = vi.fn().mockResolvedValue(response)
  vi.stubGlobal("fetch", fetchSpy)
  return { ...(await loadModule()), fetchSpy }
}

/** The module in a static build, with `fetch` spied on. */
async function staticBuild(): Promise<
  typeof TopikContent & { fetchSpy: ReturnType<typeof vi.fn> }
> {
  vi.stubEnv("VITE_STATIC_DATA", "true")
  const fetchSpy = vi.fn()
  vi.stubGlobal("fetch", fetchSpy)
  return { ...(await loadModule()), fetchSpy }
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

    // A direct http://host:3000 request would be mixed content.
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
    const { loadTopikManifest, EMPTY_TOPIK_MANIFEST, fetchSpy } =
      await staticBuild()

    await expect(loadTopikManifest()).resolves.toEqual(EMPTY_TOPIK_MANIFEST)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("refuses a topik load loudly rather than resolving to nothing", async () => {
    const { loadTopikFile, fetchSpy } = await staticBuild()

    await expect(loadTopikFile("topik-1")).rejects.toThrow(/no topik material/i)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("loadTopikManifest - builds with a file_host", () => {
  it("fetches the manifest from file_host's curriculum route", async () => {
    const manifest = { version: "1", topiks: [] }
    const { loadTopikManifest, fetchSpy } = await withFileHost(
      jsonResponse(manifest)
    )

    await expect(loadTopikManifest()).resolves.toEqual(manifest)
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL(`${httpBase()}/manifest.json`),
      expect.anything()
    )
  })

  it("treats a server with no curriculum route as an empty catalogue", async () => {
    const { loadTopikManifest, EMPTY_TOPIK_MANIFEST } = await withFileHost(
      serverErrorResponse(404, "not_found")
    )

    await expect(loadTopikManifest()).resolves.toEqual(EMPTY_TOPIK_MANIFEST)
  })

  it("surfaces a non-404 manifest failure instead of masking it as empty", async () => {
    const { loadTopikManifest } = await withFileHost(
      statusResponse(500, "Boom")
    )

    // Only a 404, or a 200 not shaped like a manifest, is "nothing to study".
    await expect(loadTopikManifest()).rejects.toThrow(/500/)
  })

  it("surfaces the server refusing an oversized corpus, though it is a 400", async () => {
    const { loadTopikManifest } = await withFileHost(
      serverErrorResponse(400, "max_record_limit_exceeded")
    )

    // Unlike the client's own "not a manifest" 400, the material exists.
    await expect(loadTopikManifest()).rejects.toMatchObject({ status: 400 })
  })

  it("treats an SPA-fallback response as an empty catalogue, not a crash", async () => {
    const { loadTopikManifest, EMPTY_TOPIK_MANIFEST } = await withFileHost(
      spaFallbackResponse()
    )

    await expect(loadTopikManifest()).resolves.toEqual(EMPTY_TOPIK_MANIFEST)
  })

  it("fetches a selected topik's batches by key", async () => {
    const { loadTopikFile, fetchSpy } = await withFileHost(jsonResponse([]))

    await loadTopikFile("topik-1")
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL(`${httpBase()}/topik-1`),
      expect.anything()
    )
  })

  it("surfaces a lesson the server no longer has rather than swallowing it", async () => {
    const { loadTopikFile } = await withFileHost(
      serverErrorResponse(404, "not_found")
    )

    // Unlike a missing manifest, a chosen topik is expected to load.
    await expect(loadTopikFile("topik-1")).rejects.toMatchObject({
      status: 404,
    })
  })

  it("surfaces a failed topik load rather than swallowing it", async () => {
    const { loadTopikFile } = await withFileHost(statusResponse(500, "Boom"))

    await expect(loadTopikFile("topik-1")).rejects.toThrow(/500/)
  })
})
