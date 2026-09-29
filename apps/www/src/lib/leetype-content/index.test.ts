/**
 * @vitest-environment jsdom
 *
 * The mode gate and the fail-open read (H1, #1231). `@vitest-environment
 * jsdom` because the locators resolve against `window.location`, as
 * `lib/topik-content`'s do.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type * as LeetypeContent from "."

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

const httpBase = (): string =>
  `http://${window.location.hostname}:3000/api/v1/leetype/rounds`

async function loadModule(): Promise<typeof LeetypeContent> {
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

describe("loadLeetypeRounds - static builds", () => {
  it("resolves empty without issuing a single request", async () => {
    vi.stubEnv("VITE_STATIC_DATA", "true")
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)

    const { loadLeetypeRounds } = await loadModule()

    await expect(loadLeetypeRounds()).resolves.toEqual([])
    // The Pages build has no file_host; `Leetype` plays its bundled rounds.
    expect(fetchSpy).toHaveBeenCalledTimes(0)
  })
})

describe("loadLeetypeRounds - builds with a file_host", () => {
  it("fetches the manifest, then each listed round's verbatim body", async () => {
    vi.stubEnv("VITE_STATIC_DATA", undefined)
    const bodies: Record<string, unknown> = {
      a: { id: "a", marker: 1 },
      b: { id: "b", marker: 2 },
    }
    const fetchSpy = vi.fn((url: URL) => {
      if (url.href === httpBase()) {
        return Promise.resolve(
          jsonResponse({
            version: "v",
            rounds: [
              { id: "a", version: 1, witnesses: [] },
              { id: "b", version: 1, witnesses: [] },
            ],
          })
        )
      }
      const id = url.pathname.split("/").pop() ?? ""
      return Promise.resolve(jsonResponse(bodies[id]))
    })
    vi.stubGlobal("fetch", fetchSpy)

    const { loadLeetypeRounds } = await loadModule()
    const rounds = await loadLeetypeRounds()

    expect(rounds).toHaveLength(2)
    expect(rounds).toEqual(expect.arrayContaining([bodies.a, bodies.b]))
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it("fetches at most MAX_FETCHED_ROUNDS bodies from a large corpus", async () => {
    vi.stubEnv("VITE_STATIC_DATA", undefined)
    const { MAX_FETCHED_ROUNDS } = await loadModule()
    const listed = Array.from({ length: MAX_FETCHED_ROUNDS + 10 }, (_, i) => ({
      id: `round-${i}`,
    }))
    const fetchSpy = vi.fn((url: URL) =>
      Promise.resolve(
        url.href === httpBase()
          ? jsonResponse({ version: "v", rounds: listed })
          : jsonResponse({ id: url.pathname.split("/").pop() })
      )
    )
    vi.stubGlobal("fetch", fetchSpy)

    const { loadLeetypeRounds } = await loadModule()

    await expect(loadLeetypeRounds()).resolves.toHaveLength(MAX_FETCHED_ROUNDS)
    expect(fetchSpy).toHaveBeenCalledTimes(MAX_FETCHED_ROUNDS + 1)
  })

  it("skips a body that fails to arrive instead of failing the whole load", async () => {
    vi.stubEnv("VITE_STATIC_DATA", undefined)
    const fetchSpy = vi.fn((url: URL) => {
      if (url.href === httpBase()) {
        return Promise.resolve(
          jsonResponse({ version: "v", rounds: [{ id: "a" }, { id: "gone" }] })
        )
      }
      return Promise.resolve(
        url.pathname.endsWith("/gone")
          ? new Response(null, { status: 404, statusText: "Not Found" })
          : jsonResponse({ id: "a" })
      )
    })
    vi.stubGlobal("fetch", fetchSpy)

    const { loadLeetypeRounds } = await loadModule()

    await expect(loadLeetypeRounds()).resolves.toEqual([{ id: "a" }])
  })

  it("rejects when the manifest is not one, so Leetype plays its bundled rounds", async () => {
    vi.stubEnv("VITE_STATIC_DATA", undefined)
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response("<!doctype html><html></html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          })
        )
      )
    )

    const { loadLeetypeRounds } = await loadModule()

    await expect(loadLeetypeRounds()).rejects.toBeDefined()
  })
})
