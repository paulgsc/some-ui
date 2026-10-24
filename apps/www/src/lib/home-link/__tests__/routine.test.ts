/**
 * LA12: Korean reads what the reflections routine left on the paired home
 * only once its person chose to show it, under the pairing it was chosen
 * for, with the app in front: one `GET /routine/files` per look, shared by
 * every look while one is on its way, never on a timer, never retried, and
 * never rejected; nothing read outlives its choice, and an unreadable
 * choice log is never written over.
 */
import { noAnswer } from "@/test-support/no-answer"
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { addFailureSink } from "@some-ui/intent-kit"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import type { RoutinePorts, RoutineReads } from "@/lib/home-link/routine"
import { createRoutineReads, READS_KEY } from "@/lib/home-link/routine"
import {
  appendedRead,
  parseReadLog,
  shownNow,
} from "@/lib/home-link/routine-model"
import type { HomeLink } from "@/lib/home-link/runtime"

const FILES = { files: [{ folder: "drama", name: "d.json", file: {} }] }
const NO_FILES = { files: [] }
const SAID = "Show them? It sends nothing of yours."

type Home = {
  /** Every request sent, as `METHOD path`. */
  sent: Array<string>
  /** What home answers next; a function answers each in turn. */
  answer: () => Promise<HomeAnswer>
  busy: boolean
  pairing: string | null
  visible: boolean
  linkListeners: Set<() => void>
}

const ok = (body: unknown): Promise<HomeAnswer> =>
  Promise.resolve({ status: 200, body: JSON.stringify(body) })

function homeOf(over: Partial<Home> = {}): Home {
  return {
    sent: [],
    answer: () => ok(FILES),
    busy: false,
    pairing: "pairing-1",
    visible: true,
    linkListeners: new Set(),
    ...over,
  }
}

/** The link's `keep`, as the runtime's `credentialed` runs it. */
function keepOf(home: Home): HomeLink["keep"] {
  return async (run) => {
    if (home.busy || home.pairing === null) return null
    const send: HomeCall = (method, path) => {
      home.sent.push(`${method} ${path}`)
      return home.answer()
    }
    try {
      return { kind: "done", value: await run(send) }
    } catch (error) {
      if (error instanceof SyncStoppedError) return { kind: "stopped" }
      throw error
    }
  }
}

function readsOf(
  home: Home,
  storage: RoutinePorts["storage"] = memoryStorage(),
  now = (): number => 10
): RoutineReads {
  return createRoutineReads({
    keep: keepOf(home),
    pairing: () => home.pairing,
    visible: () => home.visible,
    now,
    storage,
    onLink: (listener) => {
      home.linkListeners.add(listener)
      return () => home.linkListeners.delete(listener)
    },
  })
}

/** Moves the link to `pairing` (null: unpaired), as `homeLink()` would say. */
function relink(home: Home, pairing: string | null): void {
  home.pairing = pairing
  for (const listener of home.linkListeners) listener()
}

afterEach(() => {
  vi.useRealTimers()
})

describe("the choice to show the routine's files", () => {
  it("only appends, and counts for the pairing it was made under alone", () => {
    const shown = appendedRead([], {
      kind: "shown",
      pairing: "a",
      at: 5,
      said: SAID,
    })
    expect(shownNow(shown, "a")).toBe(5)
    expect(shownNow(shown, "b")).toBeNull()
    expect(shownNow(shown, null)).toBeNull()
    expect(
      appendedRead(shown, { kind: "shown", pairing: "a", at: 6, said: SAID })
    ).toBe(shown)
    const hidden = appendedRead(shown, {
      kind: "hidden",
      pairing: "a",
      at: 7,
      said: SAID,
    })
    expect(hidden.slice(0, 1)).toEqual(shown)
    expect(shownNow(hidden, "a")).toBeNull()
    expect(parseReadLog(JSON.stringify(hidden))).toEqual(hidden)
    expect(parseReadLog("{")).toBeNull()
    expect(parseReadLog('[{"kind":"shown"}]')).toBeNull()
  })
})

describe("Korean's look at the routine's files", () => {
  it("sends nothing until shown, once hidden, unpaired, or in the background", async () => {
    const home = homeOf()
    const reads = readsOf(home)
    await expect(reads.list()).resolves.toEqual(NO_FILES)

    expect(reads.choose("shown", SAID)).toBe(true)
    home.visible = false
    await expect(reads.list()).resolves.toEqual(NO_FILES)
    home.visible = true
    await expect(reads.list()).resolves.toEqual(FILES)
    expect(home.sent).toEqual(["GET /routine/files"])

    expect(reads.choose("hidden", SAID)).toBe(true)
    await expect(reads.list()).resolves.toEqual(NO_FILES)

    reads.choose("shown", SAID)
    relink(home, null)
    await expect(reads.list()).resolves.toEqual(NO_FILES)
    expect(home.sent).toEqual(["GET /routine/files"])
  })

  it("sends one read per look, and shares one on its way", async () => {
    let land: (answer: HomeAnswer) => void = () => undefined
    const home = homeOf({
      answer: () =>
        new Promise((resolve) => {
          land = resolve
        }),
    })
    const reads = readsOf(home)
    reads.choose("shown", SAID)
    const first = reads.list()
    const second = reads.list()
    expect(reads.getSnapshot().read.reading).toBe(true)
    await Promise.resolve()
    land({ status: 200, body: JSON.stringify(FILES) })
    await expect(first).resolves.toEqual(FILES)
    await expect(second).resolves.toEqual(FILES)
    expect(home.sent).toEqual(["GET /routine/files"])
    expect(reads.getSnapshot().read.last).toEqual({ kind: "read", at: 10 })

    home.answer = (): Promise<HomeAnswer> => ok(FILES)
    await reads.list()
    expect(home.sent).toHaveLength(2)
  })

  it("never rejects: each way a look fails is said, and answers what was read last", async () => {
    const reported: Array<string> = []
    const unsink = addFailureSink((failure) => reported.push(failure.port))
    const home = homeOf()
    const reads = readsOf(home)
    reads.choose("shown", SAID)
    await reads.list()

    const failures: Array<[Partial<Home>, string]> = [
      [
        { answer: () => Promise.resolve({ status: 401, body: "" }) },
        "forgotten",
      ],
      [{ answer: () => Promise.resolve({ status: 429, body: "" }) }, "busy"],
      [{ answer: () => Promise.resolve({ status: 500, body: "" }) }, "failed"],
      [{ answer: () => Promise.resolve({ status: 200, body: "<" }) }, "failed"],
      [{ answer: () => Promise.reject(noAnswer()) }, "unreachable"],
      [{ answer: () => Promise.reject(new Error("keystore")) }, "failed"],
      [{ busy: true }, "busy"],
    ]
    for (const [over, kind] of failures) {
      Object.assign(home, homeOf(over), {
        sent: home.sent,
        linkListeners: home.linkListeners,
      })
      await expect(reads.list()).resolves.toEqual(FILES)
      expect(reads.getSnapshot().read.last?.kind).toBe(kind)
      expect(reads.getSnapshot().read.reading).toBe(false)
    }
    // Each is one look, never tried again: the turned-away one sent nothing.
    expect(home.sent).toHaveLength(7)
    expect(reported).toEqual(["home server (routine)"])
    unsink()
  })

  it("answers no files, not an earlier choice's, when a first look fails", async () => {
    const home = homeOf({
      answer: () => Promise.resolve({ status: 500, body: "" }),
    })
    const reads = readsOf(home)
    reads.choose("shown", SAID)
    await expect(reads.list()).resolves.toEqual(NO_FILES)
  })

  it("sends nothing as time passes", async () => {
    vi.useFakeTimers()
    const home = homeOf()
    const reads = readsOf(home)
    reads.choose("shown", SAID)
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)
    expect(home.sent).toEqual([])
    // A failed look is not tried again later either.
    home.answer = (): Promise<HomeAnswer> => Promise.reject(noAnswer())
    await reads.list()
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)
    expect(home.sent).toEqual(["GET /routine/files"])
  })

  it("holds nothing once stopped, unpaired or paired anew", async () => {
    const home = homeOf()
    let clock = 10
    const reads = readsOf(home, memoryStorage(), () => clock)
    reads.choose("shown", SAID)
    await reads.list()

    reads.choose("hidden", SAID)
    expect(reads.getSnapshot().read).toMatchObject({ answer: null, last: null })
    clock = 20
    reads.choose("shown", SAID)
    home.answer = (): Promise<HomeAnswer> =>
      Promise.resolve({ status: 500, body: "" })
    // Shown again: what the stopped choice read is not shown under this one.
    await expect(reads.list()).resolves.toEqual(NO_FILES)

    home.answer = (): Promise<HomeAnswer> => ok(FILES)
    await reads.list()
    relink(home, null)
    expect(reads.getSnapshot().read.answer).toBeNull()

    relink(home, "pairing-2")
    // A new pairing starts with nothing shown.
    await expect(reads.list()).resolves.toEqual(NO_FILES)
    expect(home.sent).toHaveLength(3)
  })

  it("drops an answer, or a failure, that lands after its choice was stopped", async () => {
    for (const answer of [
      { status: 200, body: JSON.stringify(FILES) },
      { status: 500, body: "" },
    ]) {
      let land: (answer: HomeAnswer) => void = () => undefined
      const home = homeOf({
        answer: () =>
          new Promise((resolve) => {
            land = resolve
          }),
      })
      const reads = readsOf(home)
      reads.choose("shown", SAID)
      const look = reads.list()
      await Promise.resolve()
      reads.choose("hidden", SAID)
      land(answer)
      await expect(look).resolves.toEqual(NO_FILES)
      expect(reads.getSnapshot().read).toEqual({
        answer: null,
        reading: false,
        last: null,
      })
    }
  })

  it("never writes over a choice log it cannot read, and refuses every choice", async () => {
    const storage = memoryStorage()
    storage.setItem(READS_KEY, "not a log")
    const home = homeOf()
    const reads = readsOf(home, storage)
    expect(reads.choose("shown", SAID)).toBe(false)
    expect(storage.getItem(READS_KEY)).toBe("not a log")
    await expect(reads.list()).resolves.toEqual(NO_FILES)
    expect(home.sent).toEqual([])
  })

  it("keeps each choice with the words pressed, under its pairing", () => {
    const storage = memoryStorage()
    const reads = readsOf(homeOf(), storage)
    reads.choose("shown", SAID)
    expect(parseReadLog(storage.getItem(READS_KEY) ?? "")).toEqual([
      { kind: "shown", pairing: "pairing-1", at: 10, said: SAID },
    ])
    expect(
      readsOf(homeOf({ pairing: null }), storage).choose("shown", SAID)
    ).toBe(false)
  })
})
