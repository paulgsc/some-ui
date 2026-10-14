import {
  createSessionIndex,
  type SessionIndexOptions,
} from "@common/observability/session-index"
import { fakeStorage, type FakeStorage } from "@common/testing/fake-storage"
import { afterEach, describe, expect, it, vi } from "vitest"

const NOW = 1_700_000_000_000
const GRACE = 60_000

type Entry = { sessionId: string; updatedAt: number }

function isEntry(value: unknown): value is Entry {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "sessionId") === "string" &&
    typeof Reflect.get(value, "updatedAt") === "number"
  )
}

function newIndex(
  fake: FakeStorage | undefined,
  options: Partial<SessionIndexOptions<Entry>> = {}
): ReturnType<typeof createSessionIndex<Entry>> {
  return createSessionIndex<Entry>({
    namespace: "t.obs",
    payload: { prefix: "t.obs.session.", suffix: ".v1" },
    isEntry,
    area: () => fake?.area,
    cap: 3,
    unflushedGraceMs: GRACE,
    now: () => NOW,
    ...options,
  })
}

const entry = (sessionId: string, updatedAt = NOW): Entry => ({
  sessionId,
  updatedAt,
})

/** A listed session with its payload, as a tab leaves it after a flush. */
async function record(
  fake: FakeStorage,
  index: ReturnType<typeof newIndex>,
  sessionId: string,
  updatedAt = NOW
): Promise<void> {
  fake.store.set(index.payloadKey(sessionId), { version: 1 })
  await index.touch(entry(sessionId, updatedAt))
}

const ids = (entries: ReadonlyArray<Entry>): Array<string> =>
  entries.map((e) => e.sessionId)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("touch", () => {
  it("writes one key of its own and reads nothing, so a competing tab's write cannot drop it", async () => {
    const reads: Array<unknown> = []
    const fake = fakeStorage({ onGet: (keys) => reads.push(keys) })
    const index = newIndex(fake)

    await index.touch(entry("mine"))

    expect(reads).toEqual([])
    expect([...fake.store.keys()]).toEqual([index.indexKey("mine")])
  })
})

describe("compact", () => {
  it("lists newest first, and evicts past the cap with the payload", async () => {
    const fake = fakeStorage()
    const index = newIndex(fake)
    for (let i = 0; i < 4; i++)
      await record(fake, index, `s${String(i)}`, NOW + i)

    const result = await index.compact()

    expect(ids(result.entries)).toEqual(["s3", "s2", "s1"])
    expect(result.evicted).toEqual(["s0"])
    expect(result.failure).toBeUndefined()
    expect(fake.store.has(index.indexKey("s0"))).toBe(false)
    expect(fake.store.has(index.payloadKey("s0"))).toBe(false)
    expect(fake.store.size).toBe(6)
  })

  it("sweeps a payload no entry lists, and counts it once", async () => {
    const fake = fakeStorage()
    const index = newIndex(fake)
    await record(fake, index, "s1")
    fake.store.set(index.payloadKey("ghost"), { version: 1 })

    const result = await index.compact()

    expect(result.orphaned).toEqual(["ghost"])
    expect(result.evicted).toEqual([])
    expect(fake.store.has(index.payloadKey("ghost"))).toBe(false)
    expect(fake.store.has(index.payloadKey("s1"))).toBe(true)
  })

  it("keeps an entry not yet flushed within the grace, and drops one past it", async () => {
    const fake = fakeStorage()
    const index = newIndex(fake)
    await index.touch(entry("fresh", NOW - GRACE + 1))
    await index.touch(entry("killed", NOW - GRACE - 1))

    const result = await index.compact()

    expect(ids(result.entries)).toEqual(["fresh"])
    expect(result.discarded).toEqual(["killed"])
    expect(fake.store.has(index.indexKey("fresh"))).toBe(true)
    expect(fake.store.has(index.indexKey("killed"))).toBe(false)
  })

  it("removes an index key whose value is not an entry, and the payload it left unlisted", async () => {
    const fake = fakeStorage()
    const index = newIndex(fake)
    fake.store.set(index.indexKey("bad"), { sessionId: 7 })
    fake.store.set(index.payloadKey("bad"), { version: 1 })

    const result = await index.compact()

    expect(result.entries).toEqual([])
    expect(result.discarded).toEqual(["bad"])
    expect(result.orphaned).toEqual(["bad"])
    expect(fake.store.size).toBe(0)
  })

  it("still lists when the removal fails, reporting no deletions", async () => {
    const fake = fakeStorage({ failRemove: () => true })
    const index = newIndex(fake)
    for (let i = 0; i < 4; i++)
      await record(fake, index, `s${String(i)}`, NOW + i)

    const result = await index.compact()

    expect(ids(result.entries)).toEqual(["s3", "s2", "s1"])
    expect(result.evicted).toEqual([])
    expect(result.orphaned).toEqual([])
    expect(result.discarded).toEqual([])
    expect(result.failure).toEqual({
      stage: "removal",
      message: "storage remove failed",
    })
    expect(fake.store.has(index.payloadKey("s0"))).toBe(true)
  })

  it("reports a survey failure with nothing listed", async () => {
    const fake = fakeStorage({ fail: () => true })
    const result = await newIndex(fake).compact()

    expect(result.entries).toEqual([])
    expect(result.failure?.stage).toBe("survey")
  })

  it("does not evict a session that touched its key after the survey", async () => {
    let holdOnce = true
    let index: ReturnType<typeof newIndex> | undefined
    const fake = fakeStorage({
      hold: (key) => {
        if (!holdOnce || key !== index?.indexKey("s0")) return false
        holdOnce = false
        return true
      },
    })
    index = newIndex(fake)
    for (let i = 0; i < 4; i++)
      await record(fake, index, `s${String(i)}`, NOW + i)

    const compacting = index.compact()
    await vi.waitFor(() => {
      expect(fake.held).toHaveLength(1)
    })
    // The survey read s0 as the oldest; it flushes and touches meanwhile.
    await index.touch(entry("s0", NOW + 10))
    fake.held[0]?.release()
    const result = await compacting

    expect(result.evicted).toEqual(["s1"])
    expect(ids(result.entries)).toEqual(["s0", "s3", "s2"])
    expect(fake.store.has(index.indexKey("s0"))).toBe(true)
    expect(fake.store.has(index.payloadKey("s0"))).toBe(true)
  })

  it("does not sweep a payload whose index key landed after the enumeration", async () => {
    let holdOnce = true
    const fake = fakeStorage({
      hold: (key) => {
        if (key !== "*" || !holdOnce) return false
        holdOnce = false
        return true
      },
    })
    const index = newIndex(fake)
    // Flushed before its first touch: briefly unlisted.
    fake.store.set(index.payloadKey("late"), { version: 1 })

    const compacting = index.compact()
    await vi.waitFor(() => {
      expect(fake.held).toHaveLength(1)
    })
    await index.touch(entry("late"))
    fake.held[0]?.release()
    const result = await compacting

    expect(result.orphaned).toEqual([])
    expect(fake.store.has(index.payloadKey("late"))).toBe(true)
  })
})

describe("the legacy shared array", () => {
  it("migrates once, carrying only entries whose payload exists", async () => {
    const fake = fakeStorage()
    const index = newIndex(fake)
    fake.store.set(index.legacyKey, [entry("kept", NOW + 1), entry("gone")])
    fake.store.set(index.payloadKey("kept"), { version: 1 })

    expect(ids((await index.compact()).entries)).toEqual(["kept"])
    expect(fake.store.has(index.legacyKey)).toBe(false)
    expect(fake.store.has(index.indexKey("kept"))).toBe(true)
    expect(fake.store.has(index.indexKey("gone"))).toBe(false)
    expect(ids((await index.compact()).entries)).toEqual(["kept"])
  })

  it("loses nothing when another tab migrates between this tab's enumeration and its own migration", async () => {
    let holdOnce = true
    const fake = fakeStorage({
      hold: (key) => {
        if (key !== "*" || !holdOnce) return false
        holdOnce = false
        return true
      },
    })
    const tabA = newIndex(fake)
    const tabB = newIndex(fake)
    fake.store.set(tabA.legacyKey, [entry("a", NOW + 1), entry("b")])
    fake.store.set(tabA.payloadKey("a"), { version: 1 })
    fake.store.set(tabA.payloadKey("b"), { version: 1 })

    // A enumerates (legacy key and payloads, no per-session keys yet)...
    const compactingA = tabA.compact()
    await vi.waitFor(() => {
      expect(fake.held).toHaveLength(1)
    })
    // ...B migrates in full...
    expect(ids((await tabB.compact()).entries)).toEqual(["a", "b"])
    // ...and A resumes from its stale enumeration.
    fake.held[0]?.release()
    const result = await compactingA

    expect(result.orphaned).toEqual([])
    expect(ids(result.entries)).toEqual(["a", "b"])
    expect(fake.store.has(tabA.payloadKey("a"))).toBe(true)
    expect(fake.store.has(tabA.payloadKey("b"))).toBe(true)
  })
})

describe("enumeration cost", () => {
  it("uses getKeys() where the engine has it, never reading every payload", async () => {
    const wholeAreaReads: Array<unknown> = []
    const fake = fakeStorage({
      getKeys: true,
      onGet: (keys) => {
        if (keys === null) wholeAreaReads.push(keys)
      },
    })
    const index = newIndex(fake)
    await record(fake, index, "s1")

    expect(ids((await index.compact()).entries)).toEqual(["s1"])
    await index.compactIfCheap()
    expect(wholeAreaReads).toEqual([])
  })

  it("compactIfCheap does nothing where only get(null) can enumerate", async () => {
    const reads: Array<unknown> = []
    const fake = fakeStorage({ onGet: (keys) => reads.push(keys) })
    const index = newIndex(fake)
    fake.store.set(index.payloadKey("ghost"), { version: 1 })

    await index.compactIfCheap()

    expect(reads).toEqual([])
    expect(fake.store.has(index.payloadKey("ghost"))).toBe(true)
  })
})

describe("remove", () => {
  it("takes the payload with the index key", async () => {
    const fake = fakeStorage()
    const index = newIndex(fake)
    await record(fake, index, "s1")

    await index.remove("s1")
    expect(fake.store.size).toBe(0)
  })
})

describe("the storage area", () => {
  it("defaults to the WebExtension global's storage.local", async () => {
    const fake = fakeStorage()
    vi.stubGlobal("browser", { storage: { local: fake.area } })
    const index = createSessionIndex<Entry>({
      namespace: "t.obs",
      payload: { prefix: "t.obs.session.", suffix: ".v1" },
      isEntry,
    })

    await index.touch(entry("s1"))
    expect(fake.store.has(index.indexKey("s1"))).toBe(true)
  })

  it("makes every operation a no-op that reports nothing when there is none", async () => {
    const index = newIndex(undefined)
    await expect(index.touch(entry("s1"))).resolves.toBeUndefined()
    await expect(index.remove("s1")).resolves.toBeUndefined()
    await expect(index.compactIfCheap()).resolves.toBeUndefined()
    await expect(index.compact()).resolves.toEqual({
      entries: [],
      evicted: [],
      orphaned: [],
      discarded: [],
    })
  })
})
