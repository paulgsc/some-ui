/**
 * A standing send (LA11): only what its person keeps sending, only what
 * changed since home last held it, nothing read back or let go, and home
 * being busy said as such.
 */
import { sessionRecord } from "@/test-support/session-record"
import { describe, expect, it } from "vitest"

import type { HomeAnswer } from "@/lib/device-backend/native-http"
import type { Scope } from "@/lib/home-link/consent-model"
import type { HomeSend } from "@/lib/home-link/runtime"
import { readSent, SENT_KEY } from "@/lib/home-link/sent"
import type { StandingPorts } from "@/lib/home-link/standing"
import { sendStanding } from "@/lib/home-link/standing"
import type { CopyResult } from "@/lib/tenant/sessions-copy"
import type { SessionRecord } from "@/lib/tenant/types"

const session = (id: string, updatedAt: string): SessionRecord =>
  sessionRecord({ id, updatedAt })

const KEPT = [
  { activity: "topik", key: "a", body: '{"a":1}' },
  { activity: "leetype", key: "b", body: "[]" },
]

function memory(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  }
}

const copied = (n: number): CopyResult => ({
  outcome: { kind: "copied", copied: n },
  alreadyThere: 0,
})

function setup(
  over: {
    scopes?: ReadonlyArray<Scope>
    local?: ReadonlyArray<SessionRecord>
    answers?: Array<HomeAnswer>
    copy?: StandingPorts["copy"]
  } = {}
): {
  ports: StandingPorts
  send: HomeSend
  puts: Array<string>
  copies: Array<Array<string>>
} {
  const puts: Array<string> = []
  const copies: Array<Array<string>> = []
  const answers = over.answers ?? []
  const send: HomeSend = (method, path) => {
    expect(method).toBe("PUT")
    puts.push(path)
    return Promise.resolve(
      answers.shift() ?? { status: 200, body: '{"change":"kept"}' }
    )
  }
  const ports: StandingPorts = {
    read: () =>
      Promise.resolve({
        local: over.local ?? [session("s1", "t1"), session("s2", "t1")],
        kept: KEPT,
      }),
    shared: () => new Set(over.scopes ?? ["sessions", "shelf"]),
    storage: memory(),
    copy:
      over.copy ??
      ((_, local): Promise<CopyResult> => {
        copies.push(local.map((s) => s.id))
        return Promise.resolve(copied(local.length))
      }),
  }
  return { ports, send, puts, copies }
}

describe("a standing send", () => {
  it("sends nothing when nothing is kept on home", async () => {
    const { ports, send, puts, copies } = setup({ scopes: [] })
    await expect(sendStanding(send, ports)).resolves.toEqual({ kind: "synced" })
    expect(puts).toEqual([])
    expect(copies).toEqual([])
  })

  it("sends everything once, then only what changed", async () => {
    const { ports, send, puts, copies } = setup()
    await expect(sendStanding(send, ports)).resolves.toEqual({ kind: "synced" })
    expect(copies).toEqual([["s1", "s2"]])
    expect(puts).toEqual(["/shelf/topik/a", "/shelf/leetype/b"])

    await sendStanding(send, ports)
    expect(copies).toHaveLength(1)
    expect(puts).toHaveLength(2)

    ports.read = (): ReturnType<StandingPorts["read"]> =>
      Promise.resolve({
        local: [session("s1", "t2"), session("s2", "t1")],
        kept: [KEPT[0], { ...KEPT[1], body: "[1]" }],
      })
    await sendStanding(send, ports)
    expect(copies.at(-1)).toEqual(["s1"])
    expect(puts.at(-1)).toBe("/shelf/leetype/b")
  })

  it("sends only the scopes its person keeps", async () => {
    const { ports, send, puts, copies } = setup({ scopes: ["shelf"] })
    await sendStanding(send, ports)
    expect(copies).toEqual([])
    expect(puts).toHaveLength(2)
  })

  it("says home was busy, and sends the busy items again next time", async () => {
    const busy = { status: 429, body: "" }
    const { ports, send, puts } = setup({
      scopes: ["shelf"],
      answers: [busy, busy],
    })
    await expect(sendStanding(send, ports)).resolves.toEqual({
      kind: "failed",
      why: "busy",
    })
    expect(readSent(ports.storage).shelf).toEqual({})
    await sendStanding(send, ports)
    expect(puts).toHaveLength(4)
  })

  it("keeps what home took when a later item is turned away", async () => {
    const { ports, send } = setup({
      scopes: ["shelf"],
      answers: [
        { status: 200, body: '{"change":"kept"}' },
        { status: 409, body: "" },
      ],
    })
    await expect(sendStanding(send, ports)).resolves.toEqual({
      kind: "failed",
      why: "full",
    })
    expect(Object.keys(readSent(ports.storage).shelf)).toEqual(["topik/a"])
  })

  it("ends forgotten when home no longer knows this phone", async () => {
    const { ports, send } = setup({
      scopes: ["shelf"],
      answers: [{ status: 401, body: "" }],
    })
    await expect(sendStanding(send, ports)).resolves.toEqual({
      kind: "forgotten",
    })
  })

  it("throws when home stops answering a copy, keeping nothing as held", async () => {
    const { ports, send } = setup({
      scopes: ["sessions"],
      copy: () =>
        Promise.resolve({
          outcome: {
            kind: "partial",
            copied: 1,
            remaining: 1,
            error: new Error("no answer"),
          },
          alreadyThere: 0,
        }),
    })
    await expect(sendStanding(send, ports)).rejects.toThrow("no answer")
    expect(ports.storage?.getItem(SENT_KEY) ?? null).toBeNull()
  })
})
