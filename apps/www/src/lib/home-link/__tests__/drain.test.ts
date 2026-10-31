/**
 * The drain (LA15): only finished sessions and what changed since this home
 * last held it, nothing of home's taken in or let go, each part in order
 * (sessions, the shelf, LeetType, Studio), and a stop honoured before the
 * next request.
 */
import { noAnswer } from "@/test-support/no-answer"
import { sessionRecord } from "@/test-support/session-record"
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { describe, expect, it } from "vitest"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import { FileHostUnreachableError } from "@/lib/file-host-config"
import { FileHostResponseError } from "@/lib/file-host-config/client"
import type { DrainPorts } from "@/lib/home-link/drain"
import { drainHome } from "@/lib/home-link/drain"
import { digestOf, readSent, SENT_KEY } from "@/lib/home-link/sent"
import { HomeUnansweredError } from "@/lib/home-link/shelf"
import type { CopyResult } from "@/lib/tenant/sessions-copy"
import { SessionNotFoundError } from "@/lib/tenant/sessions-repository"
import type { SessionRecord } from "@/lib/tenant/types"

import { home as leetypeHome, session as leetypeSession } from "./fake-home"

const PAIRING = "pairing-1"

const session = (
  id: string,
  updatedAt: string,
  status: SessionRecord["status"] = "completed"
): SessionRecord => sessionRecord({ id, updatedAt, status })

const KEPT = [
  { activity: "topik", key: "a", body: '{"a":1}' },
  { activity: "leetype", key: "b", body: "[]" },
]

/** One sitting of Studio's time log, just opened, and its answer. */
const SITTING = {
  name: "s1-20261030T100000000Z",
  events: [
    {
      id: "e1",
      at: "2026-10-30T10:00:00.000Z",
      sitting: "s1-20261030T100000000Z",
      kind: "record" as const,
      type: "sitting_opened" as const,
      screen: null,
    },
  ],
}
const REPORT = {
  id: "s1-20261030T100000000Z",
  at: "2026-10-30T10:05:00.000Z",
  sitting: "s1-20261030T100000000Z",
  kind: "record" as const,
  how: "some_snags" as const,
  cause: "The microphone",
  shot: "path",
}

const copied = (n: number): CopyResult => ({
  outcome: { kind: "copied", copied: n },
  alreadyThere: 0,
})

function setup(
  over: {
    local?: ReadonlyArray<SessionRecord>
    kept?: ReadonlyArray<{ activity: string; key: string; body: string }>
    answers?: Array<HomeAnswer>
    copy?: DrainPorts["copy"]
    log?: DrainPorts["logGoing"]
    studio?: DrainPorts["studioGoing"]
  } = {}
): {
  ports: DrainPorts
  send: HomeCall
  puts: Array<string>
  copies: Array<Array<string>>
} {
  const puts: Array<string> = []
  const copies: Array<Array<string>> = []
  const answers = over.answers ?? []
  const send: HomeCall = (method, path) => {
    expect(method).toBe("PUT")
    puts.push(path)
    return Promise.resolve(
      answers.shift() ?? { status: 200, body: '{"change":"kept"}' }
    )
  }
  const ports: DrainPorts = {
    read: () =>
      Promise.resolve({
        local: over.local ?? [session("s1", "t1"), session("s2", "t1")],
        kept: over.kept ?? KEPT,
      }),
    logGoing: over.log ?? ((): Promise<Array<never>> => Promise.resolve([])),
    studioGoing:
      over.studio ??
      ((): Promise<{ sittings: []; reports: [] }> =>
        Promise.resolve({ sittings: [], reports: [] })),
    pairing: PAIRING,
    storage: memoryStorage(),
    copy:
      over.copy ??
      ((_, local): Promise<CopyResult> => {
        copies.push(local.map((s) => s.id))
        return Promise.resolve(copied(local.length))
      }),
  }
  return { ports, send, puts, copies }
}

describe("the drain", () => {
  it("sends everything once, then only what changed", async () => {
    const { ports, send, puts, copies } = setup()
    await expect(drainHome(send, ports)).resolves.toEqual({ kind: "synced" })
    expect(copies).toEqual([["s1", "s2"]])
    expect(puts).toEqual(["/shelf/topik/a", "/shelf/leetype/b"])

    await drainHome(send, ports)
    expect(copies).toHaveLength(1)
    expect(puts).toHaveLength(2)

    ports.read = (): ReturnType<DrainPorts["read"]> =>
      Promise.resolve({
        local: [session("s1", "t2"), session("s2", "t1")],
        kept: [KEPT[0], { ...KEPT[1], body: "[1]" }],
      })
    await drainHome(send, ports)
    expect(copies.at(-1)).toEqual(["s1"])
    expect(puts.at(-1)).toBe("/shelf/leetype/b")
  })

  it("sends an item home was too busy for again next time", async () => {
    const busy = { status: 429, body: "" }
    const { ports, send, puts } = setup({ local: [], answers: [busy, busy] })
    await expect(drainHome(send, ports)).rejects.toBeInstanceOf(
      HomeUnansweredError
    )
    expect(puts).toHaveLength(1)
    expect(readSent(ports.storage, PAIRING).shelf).toEqual({})
    await expect(drainHome(send, ports)).rejects.toBeInstanceOf(
      HomeUnansweredError
    )
    expect(puts).toHaveLength(2)
  })

  it("keeps what home took when a later item is turned away", async () => {
    const { ports, send } = setup({
      local: [],
      answers: [
        { status: 200, body: '{"change":"kept"}' },
        { status: 409, body: "" },
      ],
    })
    await expect(drainHome(send, ports)).resolves.toEqual({
      kind: "failed",
      why: "full",
    })
    expect(Object.keys(readSent(ports.storage, PAIRING).shelf)).toEqual([
      "topik/a",
    ])
  })

  it("sends finished sessions only", async () => {
    const { ports, send, copies } = setup({
      local: [session("s1", "t1"), session("s2", "t1", "active")],
    })
    await drainHome(send, ports)
    expect(copies).toEqual([["s1"]])
  })

  it("offers an item home refused again only once it changes", async () => {
    const { ports, send, puts } = setup({
      local: [],
      answers: [{ status: 422, body: "" }],
    })
    await expect(drainHome(send, ports)).resolves.toEqual({
      kind: "failed",
      why: "refused",
    })
    await drainHome(send, ports)
    expect(puts).toEqual(["/shelf/topik/a", "/shelf/leetype/b"])
    ports.read = (): ReturnType<DrainPorts["read"]> =>
      Promise.resolve({
        local: [],
        kept: [{ ...KEPT[0], body: '{"a":2}' }, KEPT[1]],
      })
    await drainHome(send, ports)
    expect(puts.at(-1)).toBe("/shelf/topik/a")
  })

  it("forgets a refusal once home takes the item, and counts one only while its item is kept", async () => {
    const { ports, send } = setup({
      local: [],
      answers: [{ status: 422, body: "" }],
    })
    await drainHome(send, ports)
    expect(Object.keys(readSent(ports.storage, PAIRING).refused)).toEqual([
      "topik/a",
    ])
    ports.read = (): ReturnType<DrainPorts["read"]> =>
      Promise.resolve({
        local: [],
        kept: [{ ...KEPT[0], body: '{"a":2}' }, KEPT[1]],
      })
    await drainHome(send, ports)
    const sent = readSent(ports.storage, PAIRING)
    expect(sent.refused).toEqual({})
    expect(Object.keys(sent.shelf).sort()).toEqual(["leetype/b", "topik/a"])

    const { ports: again, send: sendAgain } = setup({
      local: [],
      answers: [{ status: 422, body: "" }],
    })
    await drainHome(sendAgain, again)
    again.read = (): ReturnType<DrainPorts["read"]> =>
      Promise.resolve({ local: [], kept: [KEPT[1]] })
    await drainHome(sendAgain, again)
    expect(readSent(again.storage, PAIRING).refused).toEqual({})
  })

  it("sends nothing more once stopped, before the next request", async () => {
    const { ports, send, puts } = setup({ local: [] })
    let stopped = false
    const sendThenStop: HomeCall = (method, path, body) => {
      if (stopped) return Promise.reject(new SyncStoppedError())
      stopped = true
      return send(method, path, body)
    }
    await expect(drainHome(sendThenStop, ports)).rejects.toBeInstanceOf(
      SyncStoppedError
    )
    expect(puts).toEqual(["/shelf/topik/a"])
  })

  it("starts from nothing under another pairing", async () => {
    const { ports, send, copies } = setup({ kept: [] })
    await drainHome(send, ports)
    await drainHome(send, { ...ports, pairing: "pairing-2" })
    expect(copies).toEqual([
      ["s1", "s2"],
      ["s1", "s2"],
    ])
  })

  it("ends forgotten when home no longer knows this phone", async () => {
    const { ports, send } = setup({
      local: [],
      answers: [{ status: 401, body: "" }],
    })
    await expect(drainHome(send, ports)).resolves.toEqual({
      kind: "forgotten",
    })
  })

  it("throws when home stops answering a copy, keeping nothing as held", async () => {
    const lost = new FileHostUnreachableError("/sessions", noAnswer())
    const { ports, send } = setup({
      copy: () =>
        Promise.resolve({
          outcome: { kind: "partial", copied: 1, remaining: 1, error: lost },
          alreadyThere: 0,
        }),
    })
    await expect(drainHome(send, ports)).rejects.toBe(lost)
    expect(ports.storage?.getItem(SENT_KEY) ?? null).toBeNull()
  })

  it("says what home answered a copy with, keeping nothing as held", async () => {
    const { ports, send } = setup({
      copy: () =>
        Promise.reject(new FileHostResponseError(500, "/sessions", null)),
    })
    await expect(drainHome(send, ports)).resolves.toEqual({
      kind: "failed",
      why: "a session: home answered 500",
    })
    ports.copy = (): Promise<CopyResult> =>
      Promise.reject(new SessionNotFoundError("s1"))
    await expect(drainHome(send, ports)).resolves.toEqual({
      kind: "failed",
      why: "a session: home answered 404",
    })
    expect(ports.storage?.getItem(SENT_KEY) ?? null).toBeNull()
  })
})

/** A home that answers the shelf, LeetType and Studio as each expects. */
function fullHome(
  put: Array<HomeAnswer | Error> = [],
  back: Array<HomeAnswer> = []
): { send: HomeCall; calls: Array<[string, string]> } {
  const logs = leetypeHome(put, back)
  const calls: Array<[string, string]> = []
  const send: HomeCall = (method, path, body) => {
    calls.push([method, path])
    if (path.startsWith("/shelf/") || path.startsWith("/studio/friction/")) {
      return Promise.resolve({ status: 200, body: '{"change":"kept"}' })
    }
    return logs.send(method, path, body)
  }
  return { send, calls }
}

const logPuts = (calls: Array<[string, string]>): Array<string> =>
  calls
    .filter(
      ([method, path]) =>
        method === "PUT" && path.startsWith("/leetype/sessions/")
    )
    .map(([, path]) => path)

describe("the drain's LeetType and Studio parts", () => {
  it("sends no LeetType or Studio when the sessions copy is partial", async () => {
    const h = fullHome()
    const { ports } = setup({
      log: () => Promise.resolve([leetypeSession("a")]),
      copy: () =>
        Promise.resolve({
          outcome: {
            kind: "partial",
            copied: 0,
            remaining: 1,
            error: new SyncStoppedError(),
          },
          alreadyThere: 0,
        }),
    })
    await expect(drainHome(h.send, ports)).rejects.toBeInstanceOf(
      SyncStoppedError
    )
    expect(logPuts(h.calls)).toEqual([])
  })

  it("sends no LeetType when the shelf ended forgotten or unreachable", async () => {
    for (const answer of [{ status: 401, body: "" }, noAnswer()]) {
      const { ports, send } = setup({
        local: [],
        kept: [KEPT[0]],
        log: () => Promise.resolve([leetypeSession("a")]),
        answers: answer instanceof Error ? [] : [answer],
      })
      const calls: Array<[string, string]> = []
      const through: HomeCall = (method, path, body) => {
        calls.push([method, path])
        return answer instanceof Error
          ? Promise.reject(answer)
          : send(method, path, body)
      }
      const ended = drainHome(through, ports)
      if (answer instanceof Error) {
        await expect(ended).rejects.toBeInstanceOf(HomeUnansweredError)
      } else {
        await expect(ended).resolves.toEqual({ kind: "forgotten" })
      }
      expect(logPuts(calls)).toEqual([])
    }
  })

  it("sends LeetType and Studio when home's shelf is full, then says the shelf was", async () => {
    const h = fullHome()
    const shelfFull: HomeCall = (method, path, body) =>
      path.startsWith("/shelf/")
        ? Promise.resolve({ status: 409, body: "" })
        : h.send(method, path, body)
    const { ports } = setup({
      local: [],
      kept: [KEPT[0]],
      log: () => Promise.resolve([leetypeSession("a")]),
      studio: () => Promise.resolve({ sittings: [SITTING], reports: [REPORT] }),
    })
    await expect(drainHome(shelfFull, ports)).resolves.toEqual({
      kind: "failed",
      why: "full",
    })
    expect(logPuts(h.calls)).toEqual([
      "/leetype/sessions/a/events/a-1",
      "/leetype/sessions/a/events/a-2",
    ])
    const sent = readSent(ports.storage, PAIRING)
    expect(sent.shelf).toEqual({})
    expect(Object.keys(sent.leetype)).toEqual(["a"])
    expect(Object.keys(sent.studio)).toHaveLength(2)
  })

  it("puts LeetType after a clean sessions copy and shelf, and remembers what home read back", async () => {
    const h = fullHome()
    const { ports } = setup({
      local: [],
      kept: [KEPT[0]],
      log: () => Promise.resolve([leetypeSession("a")]),
    })
    await expect(drainHome(h.send, ports)).resolves.toEqual({ kind: "synced" })
    expect(h.calls[0]?.[1]).toBe("/shelf/topik/a")
    expect(logPuts(h.calls)).toEqual([
      "/leetype/sessions/a/events/a-1",
      "/leetype/sessions/a/events/a-2",
    ])
    expect(readSent(ports.storage, PAIRING).leetype["a"]).toBe(
      digestOf(leetypeSession("a"))
    )
  })

  it("puts Studio's sittings, then their answers, after LeetType, and remembers them", async () => {
    const h = fullHome()
    const { ports } = setup({
      local: [],
      kept: [],
      log: () => Promise.resolve([leetypeSession("a")]),
      studio: () => Promise.resolve({ sittings: [SITTING], reports: [REPORT] }),
    })
    await expect(drainHome(h.send, ports)).resolves.toEqual({ kind: "synced" })
    expect(
      h.calls
        .filter(([method]) => method === "PUT")
        .map(([, path]) => path)
        .slice(-2)
    ).toEqual([
      "/studio/sittings/s1-20261030T100000000Z/events/e1",
      "/studio/friction/s1-20261030T100000000Z",
    ])
    expect(readSent(ports.storage, PAIRING).studio).toEqual({
      [SITTING.name]: digestOf(SITTING),
      [`report:${REPORT.id}`]: expect.any(String),
    })
  })

  it("says a LeetType session home refused, and keeps it here for the next run", async () => {
    const h = fullHome([{ status: 422, body: "" }])
    const { ports } = setup({
      local: [],
      kept: [],
      log: () => Promise.resolve([leetypeSession("a")]),
    })
    await expect(drainHome(h.send, ports)).resolves.toEqual({
      kind: "failed",
      why: "refused",
    })
    expect(readSent(ports.storage, PAIRING).leetype).toEqual({})
  })

  it("keeps a LeetType session here when home's read-back differs", async () => {
    const changed = {
      session: "a",
      events: [{ ...leetypeSession("a").events[0], declaredMinutes: 11 }],
    }
    const h = fullHome([], [{ status: 200, body: JSON.stringify(changed) }])
    const { ports } = setup({
      local: [],
      kept: [],
      log: () => Promise.resolve([leetypeSession("a")]),
    })
    await expect(drainHome(h.send, ports)).resolves.toEqual({ kind: "synced" })
    expect(readSent(ports.storage, PAIRING).leetype).toEqual({})
  })
})
