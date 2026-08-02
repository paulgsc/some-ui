/**
 * The mode gate, which is the only interesting thing this module does.
 *
 * Getting it wrong fails the way every content shim in this app fails:
 * quietly. Fetching on GitHub Pages means a 404 per session against a file
 * that was never deployed; not fetching locally means the material a person
 * just curated is invisible with nothing to say why.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type * as TopikContent from "."

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
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(manifest),
    })
    vi.stubGlobal("fetch", fetchSpy)

    const { loadTopikManifest } = await loadModule()

    await expect(loadTopikManifest()).resolves.toEqual(manifest)
    expect(fetchSpy).toHaveBeenCalledWith("/topiks/manifest.json")
  })

  it("treats a missing manifest as an empty catalogue, not a failure", async () => {
    vi.stubEnv("VITE_STATIC_DATA", undefined)
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 404, statusText: "Not Found" })
    )

    const { loadTopikManifest, EMPTY_TOPIK_MANIFEST } = await loadModule()

    // The common case on a fresh checkout: the material is curated and
    // gitignored, so "nobody has generated any topiks yet" is expected.
    await expect(loadTopikManifest()).resolves.toEqual(EMPTY_TOPIK_MANIFEST)
  })

  it("fetches a selected topik's batches by key", async () => {
    vi.stubEnv("VITE_STATIC_DATA", undefined)
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })
    vi.stubGlobal("fetch", fetchSpy)

    const { loadTopikFile } = await loadModule()

    await loadTopikFile("topik-1")
    expect(fetchSpy).toHaveBeenCalledWith("/topiks/topik-1.json")
  })

  it("surfaces a failed topik load rather than swallowing it", async () => {
    vi.stubEnv("VITE_STATIC_DATA", undefined)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Boom" })
    )

    const { loadTopikFile } = await loadModule()

    // Unlike a missing manifest, a chosen topik that won't load is a real
    // failure: the person picked it and expects it.
    await expect(loadTopikFile("topik-1")).rejects.toThrow(/500/)
  })
})
