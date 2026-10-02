/**
 * @vitest-environment jsdom
 *
 * `createSessionsBackend` dispatches each call by the learner's data
 * authority (`lib/authority`). What matters here is where a call goes and,
 * above all, where it never goes: learning on the device sends nothing, and
 * signing in uploads nothing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { authority, StaleAuthorityError } from "@/lib/authority"
import { createSessionsBackend } from "@/lib/tenant/sessions-backend"
import type { SessionsStore } from "@/lib/tenant/sessions-repository"
import {
  createSessionsRepository,
  STORAGE_KEY,
} from "@/lib/tenant/sessions-repository"
import { createInMemoryStorage, writeJSON } from "@/lib/tenant/storage"
import type { SessionRecord } from "@/lib/tenant/types"

const onDevice: SessionRecord = {
  id: "local-1",
  name: "Korean review",
  status: "scheduled",
  activities: [],
  scenes: [],
  layoutMode: "basic",
  totalDurationMs: 10 * 60_000,
  createdAt: "2026-03-14T09:00:00.000Z",
  updatedAt: "2026-03-14T09:00:00.000Z",
}

const input = {
  name: "New session",
  activities: [],
  scenes: [],
  layoutMode: "basic" as const,
  totalDurationMs: 60_000,
}

/** A store that delegates to `inner`, with some methods replaced. */
function wrap(
  inner: SessionsStore,
  over: Partial<SessionsStore>
): SessionsStore {
  return {
    list: () => inner.list(),
    get: (id) => inner.get(id),
    create: (i) => inner.create(i),
    update: (id, patch) => inner.update(id, patch),
    remove: (id) => inner.remove(id),
    removeMany: (ids) => inner.removeMany(ids),
    updateStatusMany: (ids, status) => inner.updateStatusMany(ids, status),
    duplicate: (id) => inner.duplicate(id),
    ...over,
  }
}

/** The account's store, standing in for `file_host`. */
function account(): { store: SessionsStore; calls: Array<string> } {
  const calls: Array<string> = []
  const inner = createSessionsRepository(createInMemoryStorage())
  const store = wrap(inner, {
    list: () => {
      calls.push("list")
      return inner.list()
    },
    create: (i) => {
      calls.push("create")
      return inner.create(i)
    },
  })
  return { store, calls }
}

function onAccount(): void {
  authority.dispatch({ type: "session-started", adopt: true })
}

beforeEach(() => {
  window.localStorage.clear()
  authority.resetForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("learning on the device", () => {
  it("reads and writes this browser's store and never touches the network", async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    const remote = vi.fn(() => null)
    const storage = createInMemoryStorage()
    writeJSON(storage, STORAGE_KEY, [onDevice])
    const store = createSessionsBackend({ storage, remote })

    expect(await store.list()).toEqual([onDevice])
    const created = await store.create(input)
    expect((await store.list()).map((s) => s.id)).toContain(created.id)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(remote).not.toHaveBeenCalled()
  })

  it("needs no session: signed out is the same as never having had one", async () => {
    authority.dispatch({ type: "session-learned", session: "signed-out" })
    const storage = createInMemoryStorage()
    writeJSON(storage, STORAGE_KEY, [onDevice])
    const store = createSessionsBackend({ storage, remote: () => null })
    expect(await store.list()).toEqual([onDevice])
  })
})

describe("signing in uploads nothing", () => {
  it("serves the account's store and leaves this browser's sessions where they are", async () => {
    const storage = createInMemoryStorage()
    writeJSON(storage, STORAGE_KEY, [onDevice])
    const { store: remote, calls } = account()
    const store = createSessionsBackend({ storage, remote: () => remote })

    onAccount()
    expect(await store.list()).toEqual([])
    await store.create(input)

    expect(calls).toEqual(["list", "create"])
    // The account never saw the device's session, and the device still has it.
    expect((await remote.list()).map((s) => s.id)).not.toContain(onDevice.id)
    const back = createSessionsRepository(storage)
    expect(await back.list()).toEqual([onDevice])
  })

  it("leaves the device's sessions alone however many calls follow the sign-in", async () => {
    const storage = createInMemoryStorage()
    writeJSON(storage, STORAGE_KEY, [onDevice])
    const { store: remote } = account()
    const create = vi.spyOn(remote, "create")
    const store = createSessionsBackend({ storage, remote: () => remote })

    onAccount()
    await store.list()
    await store.list()
    await store.get("anything")

    expect(create).not.toHaveBeenCalled()
  })
})

describe("a returning account user", () => {
  it("waits for the undecided authority, then goes where it decided", async () => {
    window.localStorage.setItem(
      "some-ui.authority.v1",
      JSON.stringify({ choice: "account" })
    )
    authority.resetForTests()
    expect(authority.getAuthority().kind).toBe("pending")

    const { store: remote, calls } = account()
    const settle = vi.fn(() => {
      authority.dispatch({ type: "session-learned", session: "signed-in" })
      return Promise.resolve(true)
    })
    const store = createSessionsBackend({
      storage: createInMemoryStorage(),
      settle,
      remote: () => remote,
    })

    await store.list()
    expect(settle).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(["list"])
  })

  it("lands on the device when the session turns out to be gone", async () => {
    window.localStorage.setItem(
      "some-ui.authority.v1",
      JSON.stringify({ choice: "account" })
    )
    authority.resetForTests()
    const storage = createInMemoryStorage()
    writeJSON(storage, STORAGE_KEY, [onDevice])
    const remote = vi.fn(() => null)
    const store = createSessionsBackend({
      storage,
      settle: () => {
        authority.dispatch({ type: "session-learned", session: "signed-out" })
        return Promise.resolve(false)
      },
      remote,
    })

    expect(await store.list()).toEqual([onDevice])
    expect(remote).not.toHaveBeenCalled()
  })
})

describe("when the session ends", () => {
  it("falls back to the device and wipes nothing, then returns to the account", async () => {
    const storage = createInMemoryStorage()
    writeJSON(storage, STORAGE_KEY, [onDevice])
    const { store: remote, calls } = account()
    await remote.create(input)
    const store = createSessionsBackend({ storage, remote: () => remote })

    onAccount()
    expect((await store.list()).length).toBe(1)
    calls.length = 0

    // An expiry: not the person leaving, so the account stays their choice.
    authority.dispatch({ type: "session-ended", forget: false })
    expect(authority.getSnapshot().accountUnavailable).toBe(true)
    expect(await store.list()).toEqual([onDevice])
    expect(calls).toEqual([])

    authority.dispatch({ type: "session-started", adopt: false })
    expect((await store.list()).length).toBe(1)
    expect(calls).toEqual(["list"])
  })
})

describe("a result that outlives its authority", () => {
  it("is dropped, and the write stays where it was made", async () => {
    const storage = createInMemoryStorage()
    const slow = createSessionsRepository(createInMemoryStorage())
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const remote = wrap(slow, {
      create: async (i) => {
        await gate
        return slow.create(i)
      },
    })
    const store = createSessionsBackend({ storage, remote: () => remote })

    onAccount()
    const pending = store.create(input)
    // Another account signs in while the first account's write is in flight.
    authority.dispatch({ type: "session-ended", forget: true })
    onAccount()
    release()

    await expect(pending).rejects.toBeInstanceOf(StaleAuthorityError)
    // The write was made for the first account and is in its store.
    expect((await slow.list()).length).toBe(1)
    // Nothing reached the device store.
    expect(await createSessionsRepository(storage).list()).toEqual([])
  })
})
