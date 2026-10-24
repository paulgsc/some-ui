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
import { ROUTINE_TELLS_OPENED } from "@/lib/home-link/words"

const FILES = { files: [{ folder: "drama", name: "d.json", file: {} }] }
const NO_FILES = { files: [] }
const SAID = "Show them? It sends nothing of yours."

type Home = {
  /** Every request sent, as `METHOD path`. */
  sent: Array<string>
  /** Each request's body, in the same order. */
  bodies: Array<string | undefined>
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
    bodies: [],
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
    const send: HomeCall = (method, path, body) => {
      home.sent.push(`${method} ${path}`)
      home.bodies.push(body)
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
    // Each is one look, never tried again.
    expect(home.sent).toHaveLength(7)
    expect(reported).toEqual(["home server (routine)"])

    // This phone's link busy with another send is not home's to answer for:
    // nothing is said of it, nothing is sent, and what was held answers.
    home.busy = true
    home.answer = (): Promise<HomeAnswer> => ok(FILES)
    await expect(reads.list()).resolves.toEqual(FILES)
    expect(reads.getSnapshot().read).toMatchObject({
      reading: false,
      last: { kind: "failed" },
    })
    expect(home.sent).toHaveLength(7)
    unsink()
  })

  it("shares a look on its way only with a call under the same choice", async () => {
    const lands: Array<(answer: HomeAnswer) => void> = []
    const home = homeOf({
      answer: () =>
        new Promise((resolve) => {
          lands.push(resolve)
        }),
    })
    let clock = 10
    const reads = readsOf(home, memoryStorage(), () => clock)
    reads.choose("shown", SAID)
    const old = reads.list()
    await Promise.resolve()
    reads.choose("hidden", SAID)
    clock = 20
    reads.choose("shown", SAID)
    // Not the stopped choice's look: nothing yet, and no second request
    // while one is on its way.
    await expect(reads.list()).resolves.toEqual(NO_FILES)
    expect(home.sent).toEqual(["GET /routine/files"])
    for (const land of lands) land({ status: 200, body: JSON.stringify(FILES) })
    await expect(old).resolves.toEqual(NO_FILES)
    // The next look, under the choice shown now, asks home itself.
    home.answer = (): Promise<HomeAnswer> => ok(FILES)
    await expect(reads.list()).resolves.toEqual(FILES)
    expect(home.sent).toHaveLength(2)
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

  it("tells home which lessons were opened only under a choice whose words say so, in front, one at a time", async () => {
    const home = homeOf()
    const reads = readsOf(home)
    reads.choose("shown", SAID)
    expect(reads.tells()).toBe(false)
    reads.tellOpened(["scene/a.json"])
    expect(home.sent).toEqual([])

    // Chosen again, with the words that say home is told.
    reads.choose("hidden", "Stop?")
    reads.choose("shown", `Show them? ${ROUTINE_TELLS_OPENED}`)
    expect(reads.tells()).toBe(true)
    home.visible = false
    reads.tellOpened(["scene/a.json"])
    expect(home.sent).toEqual([])
    home.visible = true
    reads.tellOpened([])
    reads.tellOpened(["scene/a.json"])
    reads.tellOpened(["scene/a.json", "drama/b.json"])
    reads.tellOpened(["scene/a.json", "drama/b.json", "drama/c.json"])
    // One at a time; the newest asked meanwhile is told once, after it.
    expect(home.sent).toEqual(["PUT /routine/opened"])
    await vi.waitFor(() => expect(home.sent).toHaveLength(2))
    expect(home.bodies.at(-1)).toBe(
      JSON.stringify({
        opened: ["scene/a.json", "drama/b.json", "drama/c.json"],
      })
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(home.sent).toHaveLength(2)

    // Home's silence is never a rejection.
    home.answer = (): Promise<HomeAnswer> => Promise.reject(noAnswer())
    reads.tellOpened(["scene/a.json"])
    expect(home.sent).toHaveLength(3)
    relink(home, null)
    expect(reads.tells()).toBe(false)
  })

  it("tells what was opened once a look on its way settles, and what the link turned away once the next look does", async () => {
    let answer: (value: HomeAnswer) => void = () => {}
    const home = homeOf({
      answer: () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    })
    const reads = readsOf(home)
    reads.choose("shown", `Show them? ${ROUTINE_TELLS_OPENED}`)
    const looking = reads.list()
    reads.tellOpened(["scene/a.json"])
    expect(home.sent).toEqual(["GET /routine/files"])
    answer({ status: 200, body: JSON.stringify(FILES) })
    await looking
    await vi.waitFor(() =>
      expect(home.sent).toEqual(["GET /routine/files", "PUT /routine/opened"])
    )

    // Turned away by another send: held, and told when the next look settles.
    home.busy = true
    answer({ status: 200, body: "{}" })
    reads.tellOpened(["scene/a.json", "drama/b.json"])
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(home.sent).toHaveLength(2)
    home.busy = false
    home.answer = (): Promise<HomeAnswer> => ok(FILES)
    await reads.list()
    await vi.waitFor(() => expect(home.sent).toHaveLength(4))
    expect(home.sent.at(-1)).toBe("PUT /routine/opened")
  })

  it("never tells one home of what was opened under another", async () => {
    const home = homeOf({ busy: true })
    const reads = readsOf(home)
    reads.choose("shown", `Show them? ${ROUTINE_TELLS_OPENED}`)
    reads.tellOpened(["scene/a.json"])
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(home.sent).toEqual([])

    // Turned away, then paired with another home and shown there.
    home.busy = false
    relink(home, "pairing-2")
    reads.choose("shown", `Show them? ${ROUTINE_TELLS_OPENED}`)
    await reads.list()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(home.sent).toEqual(["GET /routine/files"])
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
