import type { FileDiscovery, ResourceLoader } from "@some-ui/fetch-kit"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import type { LibraryConfig } from "@/lib/library/runtime"
import { createLibraryRuntime } from "@/lib/library/runtime"

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

describe("createLibraryRuntime", () => {
  it("starts loading, then publishes every normalized file", async () => {
    const runtime = createLibraryRuntime(config())
    expect(runtime.getSnapshot().loading).toBe(true)

    await runtime.load()

    const snapshot = runtime.getSnapshot()
    expect(snapshot.loading).toBe(false)
    expect(snapshot.fatalError).toBeNull()
    expect(Array.from(snapshot.library.entries())).toEqual([
      ["a", 10],
      ["b", 20],
    ])
  })

  it("keeps a file's error beside its fallback value", async () => {
    const runtime = createLibraryRuntime(
      config({
        loader: loader({ "/lib/a.json": { n: 1 } }),
        fallback: () => -1,
      })
    )
    await runtime.load()

    const snapshot = runtime.getSnapshot()
    expect(snapshot.library.get("b")).toBe(-1)
    expect(snapshot.fileErrors.map((e) => e.id)).toEqual(["load:/lib/b.json"])
  })

  it("turns any file error fatal in strict mode", async () => {
    const runtime = createLibraryRuntime(
      config({ loader: loader({ "/lib/a.json": { n: 1 } }), strict: true })
    )
    await runtime.load()

    const snapshot = runtime.getSnapshot()
    expect(snapshot.fatalError?.stage).toBe("discovery")
    expect(snapshot.library.size).toBe(0)
  })

  it("drops a load that a newer one superseded", async () => {
    let release: (files: Array<string>) => void = () => {}
    const slow: FileDiscovery = {
      listFiles: () =>
        new Promise((resolve) => {
          release = resolve
        }),
    }
    const runtime = createLibraryRuntime(config({ discovery: slow }))
    const first = runtime.load()
    const firstRelease = release
    const second = runtime.load()

    release(["/lib/b.json"])
    await second
    firstRelease(["/lib/a.json"])
    await first

    expect(Array.from(runtime.getSnapshot().library.keys())).toEqual(["b"])
  })

  it("notifies subscribers until they unsubscribe", async () => {
    const runtime = createLibraryRuntime(config())
    let calls = 0
    const unsubscribe = runtime.subscribe(() => {
      calls += 1
    })
    await runtime.load()
    const seen = calls
    unsubscribe()
    await runtime.load()

    expect(seen).toBeGreaterThan(0)
    expect(calls).toBe(seen)
  })
})
