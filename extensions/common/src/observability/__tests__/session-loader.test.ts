import type { CompactionFailure } from "@common/observability/session-index"
import {
  createSessionLoader,
  type SessionLoader,
} from "@common/observability/session-loader"
import { describe, expect, it } from "vitest"

type Entry = { sessionId: string; updatedAt: number }
type Bundle = { marker: string }
type Painted = {
  selected: string | undefined
  bundle: string | undefined
  loadError: string | undefined
}

type Pending = { release: () => void }

/**
 * A loader over ports a test steers: reads can be held (and released in any
 * order) or failed, and every render records what it would have painted.
 */
function harness(initial: Array<Entry>): {
  loader: SessionLoader<Entry, Bundle>
  setIndex: (next: Array<Entry>) => void
  setFailure: (next: CompactionFailure | undefined) => void
  hold: { lists: boolean; reads: boolean }
  failReads: { on: boolean }
  /** Sessions listed with no bundle stored. */
  absent: Set<string>
  pendingLists: Array<Pending>
  pendingReads: Array<Pending & { sessionId: string }>
  renders: Array<Painted>
} {
  let index = initial
  let failure: CompactionFailure | undefined
  const hold = { lists: false, reads: false }
  const failReads = { on: false }
  const absent = new Set<string>()
  const pendingLists: Array<Pending> = []
  const pendingReads: Array<Pending & { sessionId: string }> = []
  const renders: Array<Painted> = []

  const loader: SessionLoader<Entry, Bundle> = createSessionLoader<
    Entry,
    Bundle
  >({
    list: () => {
      // Captured when the read is issued, as storage would.
      const value = { entries: index, failure }
      if (!hold.lists) return Promise.resolve(value)
      return new Promise((resolve) => {
        pendingLists.push({ release: () => resolve(value) })
      })
    },
    loadBundle: (sessionId) => {
      if (failReads.on) return Promise.reject(new Error("storage unavailable"))
      const value = absent.has(sessionId)
        ? undefined
        : { marker: `bundle-${sessionId}` }
      if (!hold.reads) return Promise.resolve(value)
      return new Promise((resolve) => {
        pendingReads.push({ sessionId, release: () => resolve(value) })
      })
    },
    render: () => {
      renders.push({
        selected: loader.selectedSessionId,
        bundle: loader.bundle?.marker,
        loadError: loader.loadError,
      })
    },
  })

  return {
    loader,
    setIndex: (next): void => {
      index = next
    },
    setFailure: (next): void => {
      failure = next
    },
    hold,
    failReads,
    absent,
    pendingLists,
    pendingReads,
    renders,
  }
}

const entries = (...ids: Array<string>): Array<Entry> =>
  ids.map((sessionId, i) => ({ sessionId, updatedAt: 100 - i }))

/** Let every settled promise's continuations run. */
const drain = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

describe("load", () => {
  it("selects the newest session and commits its bundle", async () => {
    const { loader, renders } = harness(entries("s1", "s2"))
    await loader.load()

    expect(loader.sessions.map((s) => s.sessionId)).toEqual(["s1", "s2"])
    expect(loader.selectedSessionId).toBe("s1")
    expect(loader.bundle?.marker).toBe("bundle-s1")
    expect(loader.settled).toBe(true)
    expect(renders.at(-1)).toEqual({
      selected: "s1",
      bundle: "bundle-s1",
      loadError: undefined,
    })
  })

  it("keeps the selection unless asked for the newest, or it is gone", async () => {
    const h = harness(entries("s1", "s2"))
    await h.loader.load()
    await h.loader.select("s2")

    h.setIndex(entries("s3", "s1", "s2"))
    await h.loader.load()
    expect(h.loader.selectedSessionId).toBe("s2")

    await h.loader.load(true)
    expect(h.loader.selectedSessionId).toBe("s3")
    expect(h.loader.bundle?.marker).toBe("bundle-s3")

    h.setIndex(entries("s1", "s2"))
    await h.loader.load()
    expect(h.loader.selectedSessionId).toBe("s1")
  })

  it("is settled with no bundle when the session has none stored", async () => {
    const h = harness(entries("s1"))
    h.absent.add("s1")
    await h.loader.load()
    expect(h.loader.settled).toBe(true)
    expect(h.loader.bundle).toBeUndefined()

    const empty = harness([])
    await empty.loader.load()
    expect(empty.loader.settled).toBe(false)
  })
})

describe("select", () => {
  it("drops the old bundle and repaints before the new read resolves", async () => {
    const h = harness(entries("s1", "s2"))
    await h.loader.load()
    h.hold.reads = true

    const selecting = h.loader.select("s2")

    expect(h.loader.bundle).toBeUndefined()
    expect(h.loader.settled).toBe(false)
    expect(h.renders.at(-1)).toEqual({
      selected: "s2",
      bundle: undefined,
      loadError: undefined,
    })

    await drain()
    expect(h.pendingReads.map((r) => r.sessionId)).toEqual(["s2"])
    h.pendingReads[0]?.release()
    await selecting
    expect(h.loader.bundle?.marker).toBe("bundle-s2")
  })
})

describe("overlapping loads", () => {
  it("commits the last selection when two reads settle out of order", async () => {
    const h = harness(entries("s1", "s2"))
    h.hold.reads = true
    const first = h.loader.load()
    await drain()
    const second = h.loader.select("s2")
    await drain()
    expect(h.pendingReads.map((r) => r.sessionId)).toEqual(["s1", "s2"])

    h.pendingReads[1]?.release()
    await second
    expect(h.loader.bundle?.marker).toBe("bundle-s2")

    const rendersBefore = h.renders.length
    h.pendingReads[0]?.release()
    await first

    expect(h.loader.selectedSessionId).toBe("s2")
    expect(h.loader.bundle?.marker).toBe("bundle-s2")
    expect(h.renders).toHaveLength(rendersBefore)
  })

  it("leaves the state untouched when a superseded load's list lands", async () => {
    const h = harness(entries("s1", "s2"))
    await h.loader.load()

    // "Refresh sessions" with a newer recording listed, whose list hangs...
    h.setIndex(entries("s3", "s1", "s2"))
    h.hold.lists = true
    const stale = h.loader.load(true)
    await drain()
    expect(h.pendingLists).toHaveLength(1)

    // ...overtaken by the user picking s2 from the old list.
    h.hold.lists = false
    h.setIndex(entries("s1", "s2"))
    await h.loader.select("s2")
    const sessions = h.loader.sessions
    const rendersBefore = h.renders.length

    h.pendingLists[0]?.release()
    await stale

    expect(h.loader.sessions).toBe(sessions)
    expect(h.loader.selectedSessionId).toBe("s2")
    expect(h.loader.bundle?.marker).toBe("bundle-s2")
    expect(h.renders).toHaveLength(rendersBefore)
  })

  it("does not let a superseded load's failure raise an error", async () => {
    const h = harness(entries("s1", "s2"))
    h.hold.lists = true
    const stale = h.loader.load()
    await drain()
    h.hold.lists = false
    await h.loader.select("s2")

    h.failReads.on = true
    h.pendingLists[0]?.release()
    await stale

    expect(h.loader.loadError).toBeUndefined()
    expect(h.loader.bundle?.marker).toBe("bundle-s2")
  })
})

describe("errors", () => {
  it("clears the error panel as soon as the retry starts, not when it lands", async () => {
    const h = harness(entries("s1"))
    await h.loader.load()
    h.failReads.on = true
    await h.loader.load()
    expect(h.loader.loadError).toBe("storage unavailable")
    expect(h.renders.at(-1)?.loadError).toBe("storage unavailable")

    h.failReads.on = false
    h.hold.reads = true
    const retry = h.loader.load()

    expect(h.loader.loadError).toBeUndefined()
    expect(h.renders.at(-1)?.loadError).toBeUndefined()

    await drain()
    h.pendingReads[0]?.release()
    await retry
    expect(h.loader.bundle?.marker).toBe("bundle-s1")
  })

  it("shows a survey failure as an error, and still lists on a removal failure", async () => {
    const h = harness(entries("s1"))
    h.setFailure({ stage: "survey", message: "enumeration failed" })
    await h.loader.load()
    expect(h.loader.loadError).toContain("enumeration failed")

    h.setFailure({ stage: "removal", message: "remove failed" })
    await h.loader.load()
    expect(h.loader.loadError).toBeUndefined()
    expect(h.loader.bundle?.marker).toBe("bundle-s1")
  })
})
