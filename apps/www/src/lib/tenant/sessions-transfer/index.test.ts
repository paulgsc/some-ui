/**
 * @vitest-environment jsdom
 *
 * The transfer from this device to an account: explicit, per account, never
 * duplicating, resumable, and under one authority. Account stores here are the
 * localStorage repository against their own storage, which has the interface,
 * server-side id minting and the 404-for-someone-else's-session `get` that the
 * real one has.
 */

import { beforeEach, describe, expect, it } from "vitest"

import { authority } from "@/lib/authority"
import type {
  CreateSessionInput,
  SessionsStore,
  UpdateSessionInput,
} from "@/lib/tenant/sessions-repository"
import {
  createSessionsRepository,
  STORAGE_KEY,
} from "@/lib/tenant/sessions-repository"
import {
  copyDeviceSessions,
  planTransfer,
  previewDeviceTransfer,
  runTransfer,
} from "@/lib/tenant/sessions-transfer"
import type { StorageAdapter } from "@/lib/tenant/storage"
import { createInMemoryStorage, writeJSON } from "@/lib/tenant/storage"
import type { SessionRecord, SessionStatus } from "@/lib/tenant/types"

let device: StorageAdapter

beforeEach(() => {
  device = createInMemoryStorage()
  window.localStorage.clear()
  authority.resetForTests()
})

function onDevice(
  overrides: Partial<SessionRecord> & { id: string }
): SessionRecord {
  return {
    name: "Korean review",
    status: "scheduled",
    activities: [],
    scenes: [],
    layoutMode: "basic",
    totalDurationMs: 10 * 60_000,
    createdAt: "2026-03-14T09:00:00.000Z",
    updatedAt: "2026-03-14T09:00:00.000Z",
    ...overrides,
  }
}

function seed(sessions: Array<SessionRecord>): void {
  writeJSON(device, STORAGE_KEY, sessions)
}

/** One account's store. Another account is another call. */
function account(): SessionsStore {
  return createSessionsRepository(createInMemoryStorage(), 0)
}

/** A store that delegates to `inner`, with some methods replaced. */
function wrap(
  inner: SessionsStore,
  over: Partial<SessionsStore>
): SessionsStore {
  return {
    list: () => inner.list(),
    get: (id: string) => inner.get(id),
    create: (input: CreateSessionInput) => inner.create(input),
    update: (id: string, patch: UpdateSessionInput) => inner.update(id, patch),
    remove: (id: string) => inner.remove(id),
    removeMany: (ids: ReadonlyArray<string>) => inner.removeMany(ids),
    updateStatusMany: (ids: ReadonlyArray<string>, status: SessionStatus) =>
      inner.updateStatusMany(ids, status),
    duplicate: (id: string) => inner.duplicate(id),
    ...over,
  }
}

async function copy(remote: SessionsStore): ReturnType<typeof runTransfer> {
  return runTransfer(await planTransfer(remote, device), remote, device)
}

describe("what is sent", () => {
  it("is every device session, with what the nudge policy reads", async () => {
    seed([
      onDevice({
        id: "local-1",
        name: "Hangul drill",
        status: "paused",
        startedAt: "2026-03-15T09:00:00.000Z",
        finalElapsedMs: 8 * 60_000,
      }),
    ])
    const remote = account()

    expect(await copy(remote)).toEqual({ kind: "copied", copied: 1 })

    const [copied] = await remote.list()
    expect(copied.name).toBe("Hangul drill")
    // `status` and the stamps are exactly what the policy reads; a copied
    // history that lost them looks like someone who never studied.
    expect(copied.status).toBe("paused")
    expect(copied.startedAt).toBe("2026-03-15T09:00:00.000Z")
    expect(copied.finalElapsedMs).toBe(8 * 60_000)
    expect(copied.totalDurationMs).toBe(10 * 60_000)
  })

  it("leaves the device's own copies where they are", async () => {
    seed([onDevice({ id: "local-1" })])
    await copy(account())
    expect(device.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it("has nothing to send when the device has no sessions", async () => {
    const remote = account()
    expect(await planTransfer(remote, device)).toEqual({
      create: [],
      finish: [],
      alreadyThere: 0,
    })
    expect(await copy(remote)).toEqual({ kind: "copied", copied: 0 })
  })
})

describe("per account, without knowing which", () => {
  it("copies nothing the second time for the same account", async () => {
    seed([onDevice({ id: "local-1" }), onDevice({ id: "local-2" })])
    const remote = account()
    await copy(remote)

    const again = await planTransfer(remote, device)
    expect(again).toMatchObject({ create: [], finish: [], alreadyThere: 2 })
    expect(await copy(remote)).toEqual({ kind: "copied", copied: 0 })
    expect(await remote.list()).toHaveLength(2)
  })

  it("offers them again to another account, which is what its person asked for", async () => {
    seed([onDevice({ id: "local-1" })])
    const first = account()
    const second = account()
    await copy(first)

    const plan = await planTransfer(second, device)
    expect(plan.create).toHaveLength(1)
    expect(plan.alreadyThere).toBe(0)
    await runTransfer(plan, second, device)
    expect(await first.list()).toHaveLength(1)
    expect(await second.list()).toHaveLength(1)
  })

  it("copies a session again once the account no longer holds it", async () => {
    seed([onDevice({ id: "local-1" })])
    const remote = account()
    await copy(remote)
    const [copied] = await remote.list()
    await remote.remove(copied.id)

    expect((await planTransfer(remote, device)).create).toHaveLength(1)
  })

  it("only asks the account about sessions it has copied before", async () => {
    seed([onDevice({ id: "local-1" }), onDevice({ id: "local-2" })])
    const asked: Array<string> = []
    const remote = wrap(account(), {
      get: (id: string) => {
        asked.push(id)
        return Promise.resolve(null)
      },
    })
    await planTransfer(remote, device)
    expect(asked).toEqual([])
  })
})

describe("resumable, and never duplicating", () => {
  it("finishes a copy whose second step failed, instead of creating another", async () => {
    seed([onDevice({ id: "local-1", status: "completed" })])
    const inner = account()
    let failUpdates = true
    const remote = wrap(inner, {
      update: (id: string, patch: UpdateSessionInput) =>
        failUpdates
          ? Promise.reject(new Error("file_host went away"))
          : inner.update(id, patch),
    })

    expect(await copy(remote)).toMatchObject({ kind: "partial", copied: 0 })
    expect(await inner.list()).toHaveLength(1)

    failUpdates = false
    const plan = await planTransfer(remote, device)
    expect(plan.create).toHaveLength(0)
    expect(plan.finish).toHaveLength(1)
    expect(await runTransfer(plan, remote, device)).toEqual({
      kind: "copied",
      copied: 1,
    })
    const [finished] = await inner.list()
    expect(finished.status).toBe("completed")
    expect(await inner.list()).toHaveLength(1)
  })

  it("carries on after a backend that went away, without repeating what landed", async () => {
    seed([
      onDevice({ id: "local-1" }),
      onDevice({ id: "local-2" }),
      onDevice({ id: "local-3" }),
    ])
    const inner = account()
    let created = 0
    const remote = wrap(inner, {
      create: (input: CreateSessionInput) => {
        created += 1
        return created > 1
          ? Promise.reject(new Error("file_host went away"))
          : inner.create(input)
      },
    })

    expect(await copy(remote)).toMatchObject({
      kind: "partial",
      copied: 1,
      remaining: 2,
    })
    created = Number.NEGATIVE_INFINITY
    expect(await copy(remote)).toEqual({ kind: "copied", copied: 2 })
    expect(await inner.list()).toHaveLength(3)
  })
})

describe("under one authority", () => {
  const signIn = (): void => {
    authority.dispatch({ type: "session-started", adopt: true })
  }

  it("is not on offer while learning on the device", async () => {
    seed([onDevice({ id: "local-1" })])
    const remote = account()
    expect(
      await copyDeviceSessions({ storage: device, remote: () => remote })
    ).toEqual({ kind: "not-on-account" })
    expect(
      await previewDeviceTransfer({ storage: device, remote: () => remote })
    ).toBeNull()
    expect(await remote.list()).toEqual([])
  })

  it("previews what a press would send, and sends nothing", async () => {
    seed([onDevice({ id: "local-1" }), onDevice({ id: "local-2" })])
    const remote = account()
    signIn()

    expect(
      await previewDeviceTransfer({ storage: device, remote: () => remote })
    ).toEqual({ toCopy: 2, alreadyThere: 0 })
    expect(await remote.list()).toEqual([])
  })

  it("sends to the account in use when told to, and not before", async () => {
    seed([onDevice({ id: "local-1" })])
    const remote = account()
    signIn()
    expect(await remote.list()).toEqual([])

    expect(
      await copyDeviceSessions({ storage: device, remote: () => remote })
    ).toEqual({ kind: "copied", copied: 1 })
    expect(await remote.list()).toHaveLength(1)
  })

  it("stops, with what was done recorded, when another account signs in mid-way", async () => {
    seed([
      onDevice({ id: "local-1" }),
      onDevice({ id: "local-2" }),
      onDevice({ id: "local-3" }),
    ])
    const inner = account()
    let created = 0
    const remote = wrap(inner, {
      create: async (input: CreateSessionInput) => {
        created += 1
        const made = await inner.create(input)
        // The second account signs in while the first account's copy is running.
        if (created === 1) signIn()
        return made
      },
    })
    signIn()

    const outcome = await copyDeviceSessions({
      storage: device,
      remote: () => remote,
    })

    expect(outcome.kind).toBe("stale")
    // The one in flight was created for the first account and nothing after.
    expect(await inner.list()).toHaveLength(1)
    // And it is on record, so a retry under the first account would finish it.
    expect(
      JSON.parse(device.getItem("some-ui.tenant.sessions.transfers.v1") ?? "{}")
    ).toHaveProperty("local-1")
  })
})
