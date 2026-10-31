import type { FileDiscovery, ResourceLoader } from "@some-ui/fetch-kit"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import type { LibraryConfig } from "@/lib/library/load"
import { loadLibrary } from "@/lib/library/load"

const discovery = (files: Array<string>): FileDiscovery => ({
  listFiles: () => Promise.resolve(files),
})

const loader = (byPath: Record<string, unknown>): ResourceLoader => ({
  load: (path) =>
    path in byPath
      ? Promise.resolve(byPath[path])
      : Promise.reject(new Error(`missing ${path}`)),
})

function config(
  overrides: Partial<LibraryConfig<{ n: number }, number>> = {}
): LibraryConfig<{ n: number }, number> {
  return {
    rootPath: "/lib",
    extension: ".json",
    discovery: discovery(["/lib/a.json", "/lib/b.json"]),
    loader: loader({ "/lib/a.json": { n: 1 }, "/lib/b.json": { n: 2 } }),
    rawSchema: z.object({ n: z.number() }),
    normalize: (_key, raw) => raw.n * 10,
    deriveKey: (path) => path.replace(/^\/lib\/|\.json$/g, ""),
    ...overrides,
  }
}

describe("loadLibrary", () => {
  it("loads every normalized file", async () => {
    const outcome = await loadLibrary(config())

    expect(outcome.kind).toBe("loaded")
    if (outcome.kind !== "loaded") return
    expect(Array.from(outcome.library.entries())).toEqual([
      ["a", 10],
      ["b", 20],
    ])
    expect(outcome.fileErrors).toEqual([])
  })

  it("keeps a file's error beside its fallback value", async () => {
    const outcome = await loadLibrary(
      config({
        loader: loader({ "/lib/a.json": { n: 1 } }),
        fallback: () => -1,
      })
    )

    expect(outcome.kind).toBe("loaded")
    if (outcome.kind !== "loaded") return
    expect(outcome.library.get("b")).toBe(-1)
    expect(outcome.fileErrors.map((e) => e.id)).toEqual(["load:/lib/b.json"])
  })

  it("turns any file error fatal in strict mode", async () => {
    const outcome = await loadLibrary(
      config({ loader: loader({ "/lib/a.json": { n: 1 } }), strict: true })
    )

    expect(outcome.kind).toBe("fatal")
    if (outcome.kind !== "fatal") return
    expect(outcome.error.stage).toBe("discovery")
  })

  it("resolves a failed discovery as fatal, never rejecting", async () => {
    const outcome = await loadLibrary(
      config({
        discovery: { listFiles: () => Promise.reject(new Error("404")) },
      })
    )

    expect(outcome.kind).toBe("fatal")
  })
})
