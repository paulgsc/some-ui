import { describe, expect, it, vi } from "vitest"

import {
  createShelfKeeper,
  createShelfList,
  INITIAL_SHELF_LIST,
  stepShelfList,
} from "."
import type { ShelfItem, ShelfPort } from ".."

const ITEM = (key: string): ShelfItem => ({
  key,
  contentHash: "",
  savedAt: "2026-09-29T00:00:00.000Z",
})

/** A promise the test settles by hand, to put results in any order. */
function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

const settled = (): Promise<void> => new Promise((done) => setTimeout(done))

/** A runtime as a mounted component holds it: started. */
function started<R extends { start(): () => void }>(runtime: R): R {
  runtime.start()
  return runtime
}

function shelfOf(overrides: Partial<ShelfPort> = {}): ShelfPort {
  return {
    list: vi.fn(() =>
      Promise.resolve({ items: [ITEM("a"), ITEM("b")], cap: 3 })
    ),
    read: vi.fn(() => Promise.resolve({})),
    keep: vi.fn(),
    remove: vi.fn(() => Promise.resolve()),
    ...overrides,
  }
}

describe("stepShelfList", () => {
  it("drops a removed row and marks an unreadable one, freeing the rows", () => {
    let state = stepShelfList(INITIAL_SHELF_LIST, {
      type: "listed",
      items: [ITEM("a"), ITEM("b")],
      cap: 3,
    })
    state = stepShelfList(state, { type: "rowStarted", key: "a" })
    expect(state.busy).toBe("a")
    state = stepShelfList(state, { type: "removed", key: "a" })
    expect(state.busy).toBeNull()
    expect(state.listing).toEqual({
      status: "ready",
      items: [ITEM("b")],
      cap: 3,
    })
    state = stepShelfList(state, { type: "unreadable", key: "b" })
    expect([...state.unreadable]).toEqual(["b"])
  })

  it("says which row call failed, and clears it on the next one", () => {
    let state = stepShelfList(INITIAL_SHELF_LIST, {
      type: "rowFailed",
      key: "a",
      action: "read",
    })
    expect(state.rowError).toEqual({ key: "a", action: "read" })
    state = stepShelfList(state, { type: "rowStarted", key: "b" })
    expect(state.rowError).toBeNull()
  })
})

describe("createShelfList", () => {
  it("lists once on creation, and again only on a retry", async () => {
    const list = vi
      .fn<ShelfPort["list"]>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [ITEM("a")], cap: 3 })
    const shelf = shelfOf({ list })
    const runtime = started(createShelfList(shelf))
    await settled()
    expect(runtime.getSnapshot().listing).toEqual({
      status: "failed",
      failure: "failed",
    })
    runtime.retry()
    expect(runtime.getSnapshot().listing.status).toBe("loading")
    await settled()
    expect(runtime.getSnapshot().listing).toEqual({
      status: "ready",
      items: [ITEM("a")],
      cap: 3,
    })
    expect(list).toHaveBeenCalledTimes(2)
  })

  it("keeps the newer listing when an older one lands after it", async () => {
    const first = deferred<{ items: Array<ShelfItem>; cap: number }>()
    const list = vi
      .fn<ShelfPort["list"]>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ items: [ITEM("new")], cap: 3 })
    const runtime = started(createShelfList(shelfOf({ list })))
    runtime.retry()
    await settled()
    first.resolve({ items: [ITEM("old")], cap: 3 })
    await settled()
    expect(runtime.getSnapshot().listing).toEqual({
      status: "ready",
      items: [ITEM("new")],
      cap: 3,
    })
  })

  it("never plays a replay the learner walked away from", async () => {
    const body = deferred<unknown>()
    const runtime = createShelfList(shelfOf({ read: () => body.promise }))
    const stop = runtime.start()
    await settled()
    const open = vi.fn(() => true)
    runtime.replay("a", open)
    stop()
    body.resolve({})
    await settled()
    expect(open).not.toHaveBeenCalled()
  })

  it("marks a body the activity refuses as unreadable", async () => {
    const runtime = started(createShelfList(shelfOf()))
    await settled()
    runtime.replay("a", () => false)
    expect(runtime.getSnapshot().busy).toBe("a")
    await settled()
    expect(runtime.getSnapshot().busy).toBeNull()
    expect(runtime.getSnapshot().unreadable.has("a")).toBe(true)
  })

  it("runs one row call at a time, and says which one failed", async () => {
    const remove = vi.fn(() => Promise.reject(new Error("offline")))
    const runtime = started(createShelfList(shelfOf({ remove })))
    await settled()
    runtime.remove("a")
    runtime.remove("b")
    await settled()
    expect(remove).toHaveBeenCalledTimes(1)
    expect(runtime.getSnapshot().rowError).toEqual({
      key: "a",
      action: "remove",
    })
  })

  it("lists nothing until started, and again on a restart (StrictMode)", async () => {
    const list = vi.fn(() => Promise.resolve({ items: [ITEM("a")], cap: 3 }))
    const runtime = createShelfList(shelfOf({ list }))
    expect(list).not.toHaveBeenCalled()
    const stop = runtime.start()
    stop()
    runtime.retry()
    expect(list).toHaveBeenCalledTimes(1)
    runtime.start()
    expect(runtime.getSnapshot().listing.status).toBe("loading")
    await settled()
    expect(list).toHaveBeenCalledTimes(2)
    expect(runtime.getSnapshot().listing.status).toBe("ready")
  })

  it("drops a listing that lands after a stop", async () => {
    const pending = deferred<{ items: Array<ShelfItem>; cap: number }>()
    const runtime = createShelfList(shelfOf({ list: () => pending.promise }))
    const listener = vi.fn()
    runtime.subscribe(listener)
    runtime.start()()
    listener.mockClear()
    pending.resolve({ items: [ITEM("a")], cap: 3 })
    await settled()
    expect(listener).not.toHaveBeenCalled()
    expect(runtime.getSnapshot().listing.status).toBe("loading")
  })
})

describe("createShelfKeeper", () => {
  it("keeps once per tap, and reports where it landed", async () => {
    const keep = vi.fn((key: string) =>
      Promise.resolve({ change: "kept" as const, item: ITEM(key) })
    )
    const keeper = started(
      createShelfKeeper(
        shelfOf({ list: () => Promise.resolve({ items: [], cap: 3 }), keep })
      )
    )
    keeper.keep("k", "{}")
    keeper.keep("k", "{}")
    expect(keeper.getSnapshot()).toEqual({ status: "keeping" })
    await settled()
    expect(keep).toHaveBeenCalledTimes(1)
    expect(keeper.getSnapshot()).toEqual({
      status: "kept",
      unchanged: false,
      key: "k",
    })
  })

  it("reports the host's refusal", async () => {
    const keeper = started(
      createShelfKeeper(
        shelfOf({
          list: () => Promise.resolve({ items: [], cap: 0 }),
          keep: () =>
            Promise.reject(Object.assign(new Error(), { reason: "full" })),
        })
      )
    )
    keeper.keep("k", "{}")
    await settled()
    expect(keeper.getSnapshot()).toEqual({ status: "failed", failure: "full" })
  })

  it("asks again when a stop cut a keep off", async () => {
    const keeper = createShelfKeeper(
      shelfOf({ list: () => Promise.resolve({ items: [], cap: 3 }) })
    )
    const stop = keeper.start()
    keeper.keep("k", "{}")
    stop()
    expect(keeper.getSnapshot()).toEqual({ status: "idle" })
    keeper.start()
    await settled()
    expect(keeper.getSnapshot()).toEqual({ status: "idle" })
  })
})
