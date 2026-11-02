/**
 * The phone's copy names each create's id (`copySessionsTo`), so a create
 * whose answer was lost is found by that id, or sent again under it, and
 * makes one session on a home that creates once per id
 * (paulgsc/server#432); a home that mints its own still gets no duplicate,
 * by the content match the browser's transfer uses. A copy is dated by when
 * the phone made it (paulgsc/server#630).
 */
import { inMemoryStorage } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import { FileHostResponseError } from "@/lib/file-host-config/client"
import {
  confirmHeld,
  copySessionsTo,
  emptyHeldReport,
} from "@/lib/tenant/sessions-copy"
import type {
  CreateSessionInput,
  SessionsStore,
  UpdateSessionInput,
} from "@/lib/tenant/sessions-repository"
import type { SessionRecord } from "@/lib/tenant/types"

const SESSION = {
  id: "local-1",
  name: "Korean review",
  status: "scheduled",
  activities: [],
  scenes: [],
  layoutMode: "basic",
  totalDurationMs: 600_000,
  createdAt: "2026-10-14T09:00:00.000Z",
  updatedAt: "2026-10-14T09:00:00.000Z",
} satisfies SessionRecord

type Home = SessionsStore & {
  held: Map<string, SessionRecord>
  creates: Array<string | undefined>
  lists: number
}

/** The moment a home that dates its own copies made them. */
const ARRIVED = "2026-11-01T12:00:00+00:00"

/**
 * Home's sessions. `named` takes the create's id as file_host does since
 * #432 (once per id); otherwise home mints its own, as before it. `lose`
 * answers nothing to the next `lose` creates, after making them; `drop`
 * answers nothing to the next `drop`, and makes none. `dates` keeps the
 * create's `createdAt`, as file_host does since #630; otherwise a copy is
 * dated `ARRIVED`.
 */
function home({
  named,
  lose = 0,
  drop = 0,
  dates = true,
}: {
  named: boolean
  lose?: number
  drop?: number
  dates?: boolean
}): Home {
  const held = new Map<string, SessionRecord>()
  const creates: Array<string | undefined> = []
  let minted = 0
  let losing = lose
  let dropping = drop
  const store: Home = {
    held,
    creates,
    lists: 0,
    list: () => {
      store.lists += 1
      return Promise.resolve([...held.values()])
    },
    get: (id) => Promise.resolve(held.get(id) ?? null),
    create: (input: CreateSessionInput) => {
      creates.push(input.id)
      if (dropping > 0) {
        dropping -= 1
        return Promise.reject(new TypeError("Failed to fetch"))
      }
      const id = named && input.id !== undefined ? input.id : `home-${++minted}`
      const record = held.get(id) ?? {
        ...SESSION,
        ...input,
        id,
        status: "draft" as const,
        createdAt: dates ? (input.createdAt ?? ARRIVED) : ARRIVED,
      }
      held.set(id, record)
      if (losing > 0) {
        losing -= 1
        return Promise.reject(new TypeError("Failed to fetch"))
      }
      return Promise.resolve(record)
    },
    update: (id: string, patch: UpdateSessionInput) => {
      const record = { ...(held.get(id) ?? SESSION), ...patch, id }
      held.set(id, record)
      return Promise.resolve(record)
    },
    remove: () => Promise.resolve(),
    removeMany: () => Promise.resolve(),
    updateStatusMany: () => Promise.resolve([]),
    duplicate: () => Promise.reject(new Error("not in a copy")),
  }
  return store
}

describe("a phone's copy names each create's id", () => {
  it("creates under an id it names", async () => {
    const there = home({ named: true })
    await copySessionsTo([SESSION], there, inMemoryStorage())
    expect(there.creates).toEqual([expect.stringMatching(/^session-/)])
    expect([...there.held.keys()]).toEqual(there.creates)
  })

  it("finds a create whose answer was lost by its id, and makes one session", async () => {
    const there = home({ named: true, lose: 1 })
    const receipt = inMemoryStorage()
    const lost = await copySessionsTo([SESSION], there, receipt)
    expect(lost.outcome.kind).toBe("partial")
    const again = await copySessionsTo([SESSION], there, receipt)
    expect(again.outcome).toEqual({ kind: "copied", copied: 1 })
    expect(there.creates).toHaveLength(1)
    expect(there.lists).toBe(0)
    expect([...there.held.values()]).toMatchObject([{ status: "scheduled" }])
  })

  it("sends a lost create again under the same id", async () => {
    const there = home({ named: true, lose: 1 })
    const receipt = inMemoryStorage()
    await copySessionsTo([SESSION], there, receipt)
    there.held.clear()
    await copySessionsTo([SESSION], there, receipt)
    expect(there.creates).toHaveLength(2)
    expect(there.creates[1]).toBe(there.creates[0])
    expect(there.held.size).toBe(1)
  })

  it("makes no duplicate on a home that mints its own ids", async () => {
    const there = home({ named: false, lose: 1 })
    const receipt = inMemoryStorage()
    await copySessionsTo([SESSION], there, receipt)
    const again = await copySessionsTo([SESSION], there, receipt)
    expect(again.outcome).toEqual({ kind: "copied", copied: 1 })
    expect(there.creates).toHaveLength(1)
    expect(there.held.size).toBe(1)
  })

  it("never takes another session's named id for its own by content", async () => {
    const there = home({ named: true, lose: 1 })
    const receipt = inMemoryStorage()
    const twin = { ...SESSION, id: "local-2" }
    await copySessionsTo([SESSION], there, receipt)
    // The twin's create never landed: home holds only the first's, by its id.
    const dropping = home({ named: true, drop: 1 })
    await copySessionsTo([twin], { ...there, create: dropping.create }, receipt)
    expect(there.held.size).toBe(1)
    await copySessionsTo([twin, SESSION], there, receipt)
    // The twin made its own, under the id it named; the first kept its own.
    expect(there.held.size).toBe(2)
    expect(there.lists).toBe(1)
  })

  it("names a new id once home refuses one", async () => {
    const there = home({ named: true })
    const taken = there.create
    there.create = (input): Promise<SessionRecord> => {
      there.create = taken
      there.creates.push(input.id)
      return Promise.reject(new FileHostResponseError(409, "/sessions", null))
    }
    const receipt = inMemoryStorage()
    await copySessionsTo([SESSION], there, receipt)
    await copySessionsTo([SESSION], there, receipt)
    expect(there.creates).toHaveLength(2)
    expect(there.creates[1]).not.toBe(there.creates[0])
    expect(there.held.size).toBe(1)
  })
})

describe("a copy is dated by when the phone made it", () => {
  it("sends the phone's createdAt, and home's copy is held as it is", async () => {
    const there = home({ named: true })
    const receipt = inMemoryStorage()
    await copySessionsTo([SESSION], there, receipt)
    expect([...there.held.values()]).toMatchObject([
      { createdAt: SESSION.createdAt },
    ])
    const report = emptyHeldReport()
    await confirmHeld([SESSION], there, report, receipt)
    expect(report.held).toEqual([SESSION.id])
  })

  it("dates a copy home made on arrival, so it is then held", async () => {
    const there = home({ named: true, dates: false })
    const receipt = inMemoryStorage()
    await copySessionsTo([SESSION], there, receipt)
    const before = emptyHeldReport()
    await confirmHeld([SESSION], there, before, receipt)
    expect(before.differs).toEqual([SESSION.id])

    const again = await copySessionsTo([SESSION], there, receipt)
    expect(again.outcome).toEqual({ kind: "copied", copied: 1 })
    expect(there.creates).toHaveLength(1)
    expect([...there.held.values()]).toMatchObject([
      { createdAt: SESSION.createdAt },
    ])
    const after = emptyHeldReport()
    await confirmHeld([SESSION], there, after, receipt)
    expect(after.held).toEqual([SESSION.id])
  })
})
