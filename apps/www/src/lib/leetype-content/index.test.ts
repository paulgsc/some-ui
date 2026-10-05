/**
 * @vitest-environment jsdom
 *
 * The mode gate and the fail-open read (H1, #1231). jsdom because the
 * locators resolve against `window.location`.
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

/** Stubs `fetch` and the build's mode, before `loadModule`. */
function serve(fetchImpl: unknown, mode: "static" | "server" = "server"): void {
  vi.stubEnv("VITE_STATIC_DATA", mode === "static" ? "true" : undefined)
  vi.stubGlobal("fetch", fetchImpl)
}

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
    const fetchSpy = vi.fn()
    serve(fetchSpy, "static")

    const { loadLeetypeRounds } = await loadModule()

    await expect(loadLeetypeRounds()).resolves.toEqual([])
    expect(fetchSpy).toHaveBeenCalledTimes(0)
  })
})

describe("loadLeetypeRounds - builds with a file_host", () => {
  it("fetches the manifest, then each listed round's verbatim body", async () => {
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
    serve(fetchSpy)

    const { loadLeetypeRounds } = await loadModule()
    const rounds = await loadLeetypeRounds()

    expect(rounds).toHaveLength(2)
    expect(rounds).toEqual(expect.arrayContaining([bodies.a, bodies.b]))
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it("reads the corpus with no credentials, so no account cookie rides on it", async () => {
    const fetchSpy = vi.fn((url: URL) =>
      Promise.resolve(
        url.href === httpBase()
          ? jsonResponse({
              version: "v",
              rounds: [{ id: "a", version: 1, witnesses: [] }],
            })
          : jsonResponse({ id: "a" })
      )
    )
    serve(fetchSpy)

    const { loadLeetypeRounds } = await loadModule()
    await loadLeetypeRounds()

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const calls: ReadonlyArray<ReadonlyArray<unknown>> = fetchSpy.mock.calls
    for (const call of calls) {
      expect(call[1]).toMatchObject({ credentials: "omit" })
    }
  })

  it("fetches at most MAX_FETCHED_ROUNDS bodies from a large corpus", async () => {
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
    serve(fetchSpy)

    const { loadLeetypeRounds } = await loadModule()

    await expect(loadLeetypeRounds()).resolves.toHaveLength(MAX_FETCHED_ROUNDS)
    expect(fetchSpy).toHaveBeenCalledTimes(MAX_FETCHED_ROUNDS + 1)
  })

  it("skips a body that fails to arrive instead of failing the whole load", async () => {
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
    serve(fetchSpy)

    const { loadLeetypeRounds } = await loadModule()

    await expect(loadLeetypeRounds()).resolves.toEqual([{ id: "a" }])
  })

  it("rejects when the manifest is not one, so Leetype plays its bundled rounds", async () => {
    serve(
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

describe("loadLeetypeRoundRuns - a round's recorded runs (X2, X5)", () => {
  const runsUrl = (id: string): string => `${httpBase()}/${id}/runs`

  it("resolves null in a static build without issuing a single request", async () => {
    const fetchSpy = vi.fn()
    serve(fetchSpy, "static")

    const { loadLeetypeRoundRuns } = await loadModule()

    // The package shows its bundled transcript instead.
    await expect(loadLeetypeRoundRuns("a")).resolves.toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(0)
  })

  it("fetches the round's runs route once and hands back its body unparsed", async () => {
    const body = { roundId: "a", contentHash: "0".repeat(64), runs: [] }
    const fetchSpy = vi.fn((url: URL) =>
      Promise.resolve(
        url.href === runsUrl("a")
          ? jsonResponse(body)
          : new Response(null, { status: 500 })
      )
    )
    serve(fetchSpy)

    const { loadLeetypeRoundRuns } = await loadModule()

    await expect(loadLeetypeRoundRuns("a")).resolves.toEqual(body)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("rejects, once and without retrying, when the route is absent or the round unknown", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        })
      )
    )
    serve(fetchSpy)

    const { loadLeetypeRoundRuns } = await loadModule()

    // `Leetype` then falls back to the bundled transcript, or shows none.
    await expect(loadLeetypeRoundRuns("gone")).rejects.toMatchObject({
      status: 404,
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
