/**
 * The phone session over its ports (#2235): the worked example plays end to
 * end with every step skippable, leaving at any card and coming back lands
 * on it with nothing lost, and no state is an end.
 */
import type { CardEvent } from "@rust-rounds/lib/formats"
import { RoundLogSchema } from "@rust-rounds/lib/formats"
import type { PlayState } from "@rust-rounds/lib/play/machine"
import { lineOf } from "@rust-rounds/lib/play/machine"
import type { RustRoundsRuntime } from "@rust-rounds/lib/play/runtime"
import { createRustRounds } from "@rust-rounds/lib/play/runtime"
import { keptRounds, LOG_KEY, PLACE_KEY } from "@rust-rounds/lib/play/store"
import {
  INDEXING_01,
  INDEXING_01_NOTES,
  INDEXING_01_RUNS,
} from "@rust-rounds/lib/worked-example"
import { inMemoryStorage } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import type { FakePorts } from "./fakes"
import { fakeNotes, fakePorts, fullLog } from "./fakes"

function opened(ports: FakePorts): RustRoundsRuntime {
  const runtime = createRustRounds(ports)
  runtime.attach()
  return runtime
}

const visitOf = (state: PlayState): string =>
  state.place === null
    ? "none"
    : `${state.place.visit.card}:${state.place.visit.stage}`

const storedLog = (storage: Storage): Array<CardEvent> =>
  keptRounds(storage)
    .open()
    .log.sessions.flatMap((session) => session.cards)

describe("the worked example", () => {
  it("plays every card with Skip and Next alone, and never ends", () => {
    const ports = fakePorts()
    const runtime = opened(ports)
    expect(runtime.getSnapshot().screen.kind).toBe("menu")

    runtime.dispatch({ type: "continue" })
    const seen: Array<string> = []
    for (let n = 0; n < INDEXING_01.cards.length; n += 1) {
      seen.push(visitOf(runtime.getSnapshot()))
      runtime.dispatch({ type: "showRustc" })
      expect(runtime.getSnapshot().place?.visit.stage).toBe("see")
      runtime.dispatch({ type: "next" })
    }
    expect(seen).toEqual(["a:choose", "b:choose", "c:choose", "d:choose"])
    // There is no last card: Next comes back round to the first.
    expect(runtime.getSnapshot().screen.kind).toBe("card")
    expect(visitOf(runtime.getSnapshot())).toBe("a:choose")

    const events = storedLog(ports.storage)
    expect(events.map((event) => event.card)).toEqual(["a", "b", "c", "d"])
    expect(events.every((event) => !event.skipped)).toBe(true)
    // Each card's recorded run, as rustc 1.97 printed it.
    expect(events.map((event) => event.rustc)).toEqual(
      ["a", "b", "c", "d"].map((card) => INDEXING_01_RUNS[card])
    )
    expect(
      RoundLogSchema.safeParse(keptRounds(ports.storage).open().log).success
    ).toBe(true)
  })

  it("logs a card left with Next before rustc's result as skipped", () => {
    const ports = fakePorts()
    const runtime = opened(ports)
    runtime.dispatch({ type: "continue" })
    runtime.dispatch({ type: "next" })
    const [event] = storedLog(ports.storage)
    expect(event).toMatchObject({
      card: "a",
      picked: null,
      note: null,
      skipped: true,
      rustc: INDEXING_01_RUNS.a,
    })
  })

  it("asks the picked choice's sentence, and keeps the note said to it", () => {
    const ports = fakePorts()
    const runtime = opened(ports)
    runtime.dispatch({ type: "continue" })
    const [first] = INDEXING_01.cards
    if (first?.kind !== "read") throw new Error("the example opens on a read")
    const choice = first.choices[1]!
    runtime.dispatch({ type: "pick", pick: choice.pick })
    expect(runtime.getSnapshot().place?.visit).toMatchObject({
      stage: "speak",
      picked: choice.pick,
    })

    runtime.dispatch({ type: "holdToSpeak" })
    ports.notes.open()
    expect(ports.notes.started).toEqual([
      lineOf({ round: INDEXING_01.id, card: "a" }),
    ])
    runtime.dispatch({ type: "letGo" })
    ports.notes.land("note-1")
    expect(runtime.getSnapshot().place?.visit.note).toBe("note-1")

    // One note a card: holding again starts nothing.
    runtime.dispatch({ type: "holdToSpeak" })
    ports.notes.open()
    expect(ports.notes.started).toHaveLength(1)

    runtime.dispatch({ type: "showRustc" })
    runtime.dispatch({ type: "next" })
    expect(storedLog(ports.storage)[0]).toMatchObject({
      card: "a",
      picked: choice.pick,
      note: "note-1",
      skipped: false,
    })
  })

  it("logs a card left mid-take once its note lands", () => {
    const ports = fakePorts()
    const runtime = opened(ports)
    runtime.dispatch({ type: "continue" })
    runtime.dispatch({ type: "pick", pick: "Prints z" })
    runtime.dispatch({ type: "holdToSpeak" })
    ports.notes.open()
    runtime.dispatch({ type: "next" })
    // Moved on at once; the card waits for its note.
    expect(visitOf(runtime.getSnapshot())).toBe("b:choose")
    expect(storedLog(ports.storage)).toEqual([])
    ports.notes.land("note-late")
    expect(storedLog(ports.storage)).toEqual([
      expect.objectContaining({ card: "a", note: "note-late", skipped: true }),
    ])
    // The note is the card it was said on's, not the one now on screen.
    expect(runtime.getSnapshot().place?.visit.note).toBeNull()
  })

  it("logs a card left mid-take as it stands when the take keeps nothing", () => {
    const ports = fakePorts()
    const runtime = opened(ports)
    runtime.dispatch({ type: "continue" })
    runtime.dispatch({ type: "pick", pick: "Prints z" })
    runtime.dispatch({ type: "holdToSpeak" })
    ports.notes.open()
    runtime.dispatch({ type: "next" })
    ports.notes.land(null)
    expect(storedLog(ports.storage)).toEqual([
      expect.objectContaining({ card: "a", note: null }),
    ])
    // Too short is not lost: nothing to say about it once moved on.
    expect(runtime.getSnapshot().lost).toBeNull()
  })

  it("says a note lost after moving on, on whatever card is on screen", () => {
    const ports = fakePorts()
    const runtime = opened(ports)
    runtime.dispatch({ type: "continue" })
    runtime.dispatch({ type: "pick", pick: "Prints z" })
    runtime.dispatch({ type: "holdToSpeak" })
    ports.notes.open()
    runtime.dispatch({ type: "next" })
    ports.notes.lose("failed")
    expect(runtime.getSnapshot().lost).toEqual({
      concept: "indexing",
      number: 1,
    })
    expect(storedLog(ports.storage)).toEqual([
      expect.objectContaining({ card: "a", note: null }),
    ])
  })

  it("never serves a card waiting on its note as a new one", () => {
    const ports = fakePorts()
    const runtime = opened(ports)
    runtime.dispatch({ type: "play", concept: "indexing" })
    runtime.dispatch({ type: "pick", pick: "Prints z" })
    runtime.dispatch({ type: "holdToSpeak" })
    ports.notes.open()
    for (let n = 0; n < 4; n += 1) runtime.dispatch({ type: "next" })
    // a waits on its note: b, c, d were new, then a again only as played.
    expect(runtime.getSnapshot().place?.visit).toMatchObject({
      card: "a",
      again: "played",
    })
  })

  it("says when the card was had before, and when it is the only one", () => {
    const storage = inMemoryStorage()
    const [first] = INDEXING_01.cards
    keptRounds(storage).hold({
      rounds: [
        {
          ...INDEXING_01,
          id: "borrowing-01",
          concept: "borrowing",
          cards: first === undefined ? [] : [first],
        },
      ],
      runs: {},
      notes: [],
      notesMissing: false,
    })
    const runtime = opened(fakePorts(storage))
    runtime.dispatch({ type: "play", concept: "borrowing" })
    expect(runtime.getSnapshot().place?.visit.again).toBe("fresh")
    runtime.dispatch({ type: "next" })
    expect(runtime.getSnapshot().place?.visit.again).toBe("same")
  })

  it("logs where the tutor's guess differed from rustc's recorded run", () => {
    const storage = inMemoryStorage()
    // A round whose first card rustc refuses, guessed to panic.
    const [first] = INDEXING_01.cards
    if (first?.kind !== "read") throw new Error("the example opens on a read")
    const round = {
      ...INDEXING_01,
      id: "indexing-02",
      cards: [{ ...first, expect: { outcome: "panics" as const } }],
    }
    keptRounds(storage).hold({
      rounds: [round],
      runs: { "indexing-02/a": INDEXING_01_RUNS.a! },
      notes: [],
      notesMissing: false,
    })
    const runtime = opened(fakePorts(storage))
    runtime.dispatch({ type: "continue" })
    for (let n = 0; n < 4; n += 1) runtime.dispatch({ type: "next" })
    expect(runtime.getSnapshot().place?.visit.round).toBe("indexing-02")
    runtime.dispatch({ type: "showRustc" })
    runtime.dispatch({ type: "next" })
    const [session] = keptRounds(storage).open().log.sessions
    expect(session?.tutorGuessedWrong).toEqual([
      { round: "indexing-02", card: "a" },
    ])
  })

  it("plays a pasted round's cards with no run on the phone yet", () => {
    const ports = fakePorts()
    const runtime = opened(ports)
    const round = { ...INDEXING_01, id: "indexing-02" }
    runtime.dispatch({ type: "tutor" })
    runtime.dispatch({
      type: "reply",
      text: `\`\`\`json\n${JSON.stringify(round)}\n\`\`\``,
    })
    runtime.dispatch({ type: "takeReply" })
    expect(runtime.getSnapshot().screen).toMatchObject({
      answer: { kind: "taken", concept: "indexing", cards: 4 },
    })
    expect(keptRounds(ports.storage).open().held.notesMissing).toBe(true)
    runtime.dispatch({ type: "continue" })
    for (let n = 0; n < 4; n += 1) runtime.dispatch({ type: "next" })
    expect(runtime.getSnapshot().place?.visit.round).toBe("indexing-02")
    runtime.dispatch({ type: "showRustc" })
    runtime.dispatch({ type: "next" })
    const pasted = storedLog(ports.storage).find(
      (event) => event.round === "indexing-02"
    )
    expect(pasted?.rustc).toBeNull()
  })

  it("pins a card once, from any stage", () => {
    const ports = fakePorts()
    const runtime = opened(ports)
    runtime.dispatch({ type: "continue" })
    runtime.dispatch({ type: "pin" })
    runtime.dispatch({ type: "pin" })
    expect(runtime.getSnapshot().place?.visit.pinned).toBe(true)
    expect(keptRounds(ports.storage).open().log.sessions[0]?.pinned).toEqual([
      { round: INDEXING_01.id, card: "a" },
    ])
  })
})

describe("leaving and coming back", () => {
  it("reopens on the card left, as far into it as it was, with its note", () => {
    const storage = inMemoryStorage()
    const first = opened(fakePorts(storage))
    first.dispatch({ type: "continue" })
    first.dispatch({ type: "next" })
    first.dispatch({ type: "pick", pick: "Prints 122" })
    const ports = first.getSnapshot()
    expect(visitOf(ports)).toBe("b:speak")

    // The app is gone; a new opening over the same phone.
    const again = opened(fakePorts(storage))
    const state = again.getSnapshot()
    expect(state.screen.kind).toBe("card")
    expect(visitOf(state)).toBe("b:speak")
    expect(state.place?.visit.picked).toBe("Prints 122")
    // A new session in the log; the old one kept whole.
    again.dispatch({ type: "next" })
    const log = keptRounds(storage).open().log
    expect(log.sessions.map((session) => session.cards.length)).toEqual([1, 1])
  })

  it("hears the microphone no more once the screen is gone, and the next opening logs what waited", () => {
    const storage = inMemoryStorage()
    const notes = fakeNotes()
    const runtime = createRustRounds(fakePorts(storage, notes))
    const detach = runtime.attach()
    runtime.dispatch({ type: "continue" })
    runtime.dispatch({ type: "pick", pick: "Prints z" })
    runtime.dispatch({ type: "holdToSpeak" })
    notes.open()
    runtime.dispatch({ type: "next" })
    detach()
    expect(notes.getSnapshot().take.kind).toBe("keeping")
    notes.land("note-after")
    // Nothing heard it land: the card waits, kept with the place.
    expect(storedLog(storage)).toEqual([])
    expect(keptRounds(storage).open().pending).toHaveLength(1)

    opened(fakePorts(storage, notes))
    expect(storedLog(storage)).toEqual([
      expect.objectContaining({ card: "a", note: "note-after" }),
    ])
    // Settled: what waited is gone from the kept place.
    expect(keptRounds(storage).open().pending).toEqual([])
  })

  it("logs a card waiting on its note once, when a newer opening hears it land", () => {
    const storage = inMemoryStorage()
    const notes = fakeNotes()
    const first = createRustRounds(fakePorts(storage, notes))
    const detach = first.attach()
    first.dispatch({ type: "continue" })
    first.dispatch({ type: "pick", pick: "Prints z" })
    first.dispatch({ type: "holdToSpeak" })
    notes.open()
    first.dispatch({ type: "letGo" })
    first.dispatch({ type: "next" })
    detach()
    // Back again while the note is still being kept: one microphone, one phone.
    const second = opened(fakePorts(storage, notes))
    expect(second.getSnapshot().pending).toHaveLength(1)
    notes.land("note-a")
    expect(storedLog(storage)).toEqual([
      expect.objectContaining({ card: "a", note: "note-a" }),
    ])
    expect(keptRounds(storage).open().pending).toEqual([])
  })

  it("logs a card once when two openings both settle it", () => {
    const storage = inMemoryStorage()
    const notes = fakeNotes()
    const first = opened(fakePorts(storage, notes))
    first.dispatch({ type: "continue" })
    first.dispatch({ type: "pick", pick: "Prints z" })
    first.dispatch({ type: "holdToSpeak" })
    notes.open()
    first.dispatch({ type: "next" })
    // Never detached: both hear the same microphone, both hold the card.
    const second = opened(fakePorts(storage, notes))
    expect(first.getSnapshot().pending).toHaveLength(1)
    expect(second.getSnapshot().pending).toHaveLength(1)
    notes.land("note-a")
    expect(first.getSnapshot().pending).toEqual([])
    expect(second.getSnapshot().pending).toEqual([])
    expect(storedLog(storage)).toEqual([
      expect.objectContaining({ card: "a", note: "note-a" }),
    ])
  })

  it("puts a note that lands after the screen is gone on its card, at the next opening", () => {
    const storage = inMemoryStorage()
    const notes = fakeNotes()
    const first = createRustRounds(fakePorts(storage, notes))
    const detach = first.attach()
    first.dispatch({ type: "continue" })
    first.dispatch({ type: "pick", pick: "Prints z" })
    first.dispatch({ type: "holdToSpeak" })
    notes.open()
    detach()
    notes.land("note-a")

    const again = opened(fakePorts(storage, notes))
    expect(again.getSnapshot()).toMatchObject({
      taking: null,
      place: { visit: { card: "a", note: "note-a" } },
    })
    expect(keptRounds(storage).open()).toMatchObject({
      taking: null,
      place: { visit: { card: "a", note: "note-a" } },
    })
  })

  it("puts a note on its card when it lands after the next opening", () => {
    const storage = inMemoryStorage()
    const notes = fakeNotes()
    const first = createRustRounds(fakePorts(storage, notes))
    const detach = first.attach()
    first.dispatch({ type: "continue" })
    first.dispatch({ type: "pick", pick: "Prints z" })
    first.dispatch({ type: "holdToSpeak" })
    notes.open()
    detach()

    const again = opened(fakePorts(storage, notes))
    // Still being kept: no second take starts over it.
    again.dispatch({ type: "holdToSpeak" })
    notes.open()
    expect(notes.started).toHaveLength(1)
    notes.land("note-a")
    expect(again.getSnapshot()).toMatchObject({
      taking: null,
      place: { visit: { card: "a", note: "note-a" } },
    })
    again.dispatch({ type: "next" })
    expect(storedLog(storage)).toEqual([
      expect.objectContaining({ card: "a", note: "note-a" }),
    ])
  })

  it("settles a card an ended app left waiting, once reopened, from the note the phone holds", () => {
    const storage = inMemoryStorage()
    const notes = fakeNotes()
    const first = opened(fakePorts(storage, notes))
    first.dispatch({ type: "continue" })
    first.dispatch({ type: "pick", pick: "Prints z" })
    first.dispatch({ type: "holdToSpeak" })
    notes.open()
    first.dispatch({ type: "next" })
    // The app is ended before the note's end is heard; the desk kept it.
    expect(keptRounds(storage).open().pending).toHaveLength(1)
    const desk = fakeNotes()
    desk.held.push({
      id: "note-kept",
      line: notes.started[0]!,
      takenAt: Number.MAX_SAFE_INTEGER,
    })

    opened(fakePorts(storage, desk))
    expect(storedLog(storage)).toEqual([
      expect.objectContaining({ card: "a", note: "note-kept" }),
    ])
    expect(keptRounds(storage).open().pending).toEqual([])
  })

  it("logs a card an ended app left waiting as it stood when the phone holds no note", () => {
    const storage = inMemoryStorage()
    const notes = fakeNotes()
    const first = opened(fakePorts(storage, notes))
    first.dispatch({ type: "continue" })
    first.dispatch({ type: "pick", pick: "Prints z" })
    first.dispatch({ type: "holdToSpeak" })
    notes.open()
    first.dispatch({ type: "next" })
    opened(fakePorts(storage))
    expect(storedLog(storage)).toEqual([
      expect.objectContaining({ card: "a", note: null }),
    ])
  })

  it("keeps saying a log write was refused until the log itself is kept", () => {
    const storage = inMemoryStorage()
    const ports = fakePorts(storage)
    // The log cannot be written; the place can.
    const runtime = opened({
      ...ports,
      store: { ...ports.store, append: (): boolean => false },
    })
    runtime.dispatch({ type: "continue" })
    runtime.dispatch({ type: "next" })
    expect(runtime.getSnapshot().notKept).toEqual({
      log: true,
      held: false,
      place: false,
    })
    runtime.dispatch({ type: "pick", pick: "Prints 122" })
    expect(runtime.getSnapshot().notKept.log).toBe(true)
  })

  it("writes a card the log refused with the next one, each once, and says so until then", () => {
    const { storage, full } = fullLog()
    const runtime = opened(fakePorts(storage))
    runtime.dispatch({ type: "continue" })
    runtime.dispatch({ type: "next" })
    expect(storedLog(storage)).toEqual([])
    expect(runtime.getSnapshot().notKept.log).toBe(true)
    // Another refused card, and a place kept, leave the warning on.
    runtime.dispatch({ type: "next" })
    runtime.dispatch({ type: "pick", pick: "Prints 122" })
    expect(runtime.getSnapshot().notKept).toMatchObject({
      log: true,
      place: false,
    })

    full(false)
    runtime.dispatch({ type: "next" })
    expect(storedLog(storage).map((event) => event.card)).toEqual([
      "a",
      "b",
      "c",
    ])
    expect(runtime.getSnapshot().notKept.log).toBe(false)
    expect(keptRounds(storage).open().unlogged).toBe(0)
  })

  it("keeps a card the log refused across a reopen, and logs it once", () => {
    const { storage, full } = fullLog()
    const notes = fakeNotes()
    const first = opened(fakePorts(storage, notes))
    first.dispatch({ type: "continue" })
    first.dispatch({ type: "pick", pick: "Prints z" })
    first.dispatch({ type: "holdToSpeak" })
    notes.open()
    first.dispatch({ type: "next" })
    notes.land("note-a")
    expect(storedLog(storage)).toEqual([])
    expect(keptRounds(storage).open()).toMatchObject({
      unlogged: 1,
      pending: [],
    })

    // The app is ended; room is made.
    full(false)
    const again = opened(fakePorts(storage, notes))
    expect(again.getSnapshot().notKept.log).toBe(false)
    again.dispatch({ type: "next" })
    expect(storedLog(storage)).toEqual([
      expect.objectContaining({ card: "a", note: "note-a" }),
      expect.objectContaining({ card: "b" }),
    ])
  })

  it("says a refused card at the next opening until the log takes it", () => {
    const { storage } = fullLog()
    const first = opened(fakePorts(storage))
    first.dispatch({ type: "continue" })
    first.dispatch({ type: "next" })
    const again = opened(fakePorts(storage))
    expect(again.getSnapshot().notKept.log).toBe(true)
    expect(keptRounds(storage).open().unlogged).toBe(1)
  })

  it("logs a card still waiting at the next opening once, when its settling was refused", () => {
    const { storage, full } = fullLog()
    const notes = fakeNotes()
    const first = opened(fakePorts(storage, notes))
    first.dispatch({ type: "continue" })
    first.dispatch({ type: "pick", pick: "Prints z" })
    first.dispatch({ type: "holdToSpeak" })
    notes.open()
    first.dispatch({ type: "next" })
    const { pending } = keptRounds(storage).open()
    notes.land("note-a")
    // Kept to write again, and still waiting too: the place's last write
    // did not survive the app being ended.
    const { place, taking } = keptRounds(storage).open()
    keptRounds(storage).place({ place, taking, pending })
    expect(keptRounds(storage).open()).toMatchObject({
      unlogged: 1,
      pending: [expect.objectContaining({ line: pending[0]?.line })],
    })

    full(false)
    opened(fakePorts(storage, notes))
    expect(storedLog(storage)).toEqual([
      expect.objectContaining({ card: "a", note: "note-a" }),
    ])
    expect(keptRounds(storage).open()).toMatchObject({
      unlogged: 0,
      pending: [],
    })
  })

  it("reads a place kept before a take under way was kept with it", () => {
    const storage = inMemoryStorage()
    const first = opened(fakePorts(storage))
    first.dispatch({ type: "continue" })
    const { place, pending } = keptRounds(storage).open()
    storage.setItem(PLACE_KEY, JSON.stringify({ v: 1, place, pending }))
    const again = opened(fakePorts(storage))
    expect(visitOf(again.getSnapshot())).toBe("a:choose")
    const copies = Array.from({ length: storage.length }, (_, index) =>
      storage.key(index)
    ).filter((key) => key?.startsWith(`${PLACE_KEY}:unreadable:`))
    expect(copies).toEqual([])
  })

  it("never writes over a log it could not read", () => {
    const storage = inMemoryStorage()
    storage.setItem(LOG_KEY, '{"schema":"something else"}')
    const runtime = opened(fakePorts(storage))
    runtime.dispatch({ type: "continue" })
    runtime.dispatch({ type: "next" })
    const copies = Array.from({ length: storage.length }, (_, index) =>
      storage.key(index)
    ).filter((key) => key?.startsWith(`${LOG_KEY}:unreadable:`))
    expect(copies).toHaveLength(1)
    expect(storage.getItem(copies[0]!)).toBe('{"schema":"something else"}')
  })
})

describe("the tutor's page", () => {
  it("copies a card just left while its note is still being kept", async () => {
    const ports = fakePorts()
    const runtime = opened(ports)
    runtime.dispatch({ type: "continue" })
    runtime.dispatch({ type: "pick", pick: "Prints z" })
    runtime.dispatch({ type: "holdToSpeak" })
    ports.notes.open()
    runtime.dispatch({ type: "next" })
    runtime.dispatch({ type: "tutor" })
    runtime.dispatch({ type: "copyLog" })
    await Promise.resolve()
    expect(ports.copied[0]).toContain("#### indexing-01, card a (read)")
  })

  it("copies the log with the worked example's notes, for any chat", async () => {
    const ports = fakePorts()
    const runtime = opened(ports)
    runtime.dispatch({ type: "continue" })
    runtime.dispatch({ type: "showRustc" })
    runtime.dispatch({ type: "next" })
    runtime.dispatch({ type: "tutor" })
    runtime.dispatch({ type: "copyLog" })
    expect(runtime.getSnapshot().copy.kind).toBe("copying")
    await Promise.resolve()
    expect(runtime.getSnapshot().copy.kind).toBe("copied")
    const [copy] = ports.copied
    expect(copy).toContain("# Rust Rounds: the log, for a tutor")
    expect(copy).toContain(INDEXING_01_NOTES.concepts[0]!.open[0]!.edge)
    expect(copy).toContain("#### indexing-01, card a (read)")
  })

  it("lets only the latest copy say how it went, across leaving the page", async () => {
    let finish: Array<() => void> = []
    const ports = {
      ...fakePorts(),
      copy: (): Promise<void> =>
        new Promise<void>((resolve) => {
          finish = [...finish, resolve]
        }),
    }
    const runtime = opened(ports)
    runtime.dispatch({ type: "tutor" })
    runtime.dispatch({ type: "copyLog" })
    runtime.dispatch({ type: "tutor" })
    runtime.dispatch({ type: "copyLog" })
    expect(runtime.getSnapshot().copy).toMatchObject({ seq: 2 })
    finish[0]?.()
    await Promise.resolve()
    expect(runtime.getSnapshot().copy.kind).toBe("copying")
    finish[1]?.()
    await Promise.resolve()
    expect(runtime.getSnapshot().copy).toMatchObject({
      kind: "copied",
      seq: 2,
      what: "log",
    })
  })

  it("keeps the text on screen when the clipboard refuses", async () => {
    const ports = {
      ...fakePorts(),
      copy: (): Promise<void> => Promise.reject(new Error("no")),
    }
    const runtime = opened(ports)
    runtime.dispatch({ type: "tutor" })
    runtime.dispatch({ type: "copyLog" })
    await Promise.resolve()
    await Promise.resolve()
    const { copy } = runtime.getSnapshot()
    expect(copy.kind).toBe("failed")
    expect(copy.kind === "failed" && copy.text).toContain("Rust Rounds")
  })

  it("refuses a malformed reply with what to send back, and copies it", async () => {
    const ports = fakePorts()
    const runtime = opened(ports)
    runtime.dispatch({ type: "tutor" })
    runtime.dispatch({ type: "takeReply" })
    expect(runtime.getSnapshot().screen).toMatchObject({
      answer: { kind: "empty" },
    })
    runtime.dispatch({ type: "reply", text: '{"cards": []}' })
    runtime.dispatch({ type: "takeReply" })
    const { screen } = runtime.getSnapshot()
    expect(screen).toMatchObject({ answer: { kind: "refused" } })
    runtime.dispatch({ type: "copyFix" })
    await Promise.resolve()
    expect(ports.copied[0]).toContain("Rust Rounds checked your reply")
    expect(runtime.getSnapshot().copy).toMatchObject({
      kind: "copied",
      what: "fix",
    })
  })

  it("takes a round once, and keeps it and its notes across a reopen", () => {
    const ports = fakePorts()
    const runtime = opened(ports)
    const round = { ...INDEXING_01, id: "indexing-02" }
    const notes = { ...INDEXING_01_NOTES, round: "indexing-02" }
    const reply = [round, notes]
      .map((value) => `\`\`\`json\n${JSON.stringify(value)}\n\`\`\``)
      .join("\n")
    runtime.dispatch({ type: "tutor" })
    runtime.dispatch({ type: "reply", text: reply })
    runtime.dispatch({ type: "takeReply" })
    runtime.dispatch({ type: "reply", text: reply })
    runtime.dispatch({ type: "takeReply" })
    expect(runtime.getSnapshot().screen).toMatchObject({
      answer: { kind: "already-here" },
    })
    const held = keptRounds(ports.storage).open().held
    expect(held.rounds.map((each) => each.id)).toEqual(["indexing-02"])
    expect(held.notes).toEqual([notes])
    expect(held.notesMissing).toBe(false)
  })
})

describe("the microphone", () => {
  it("says a take let go before the microphone opened, and the card can be held again (VC2)", () => {
    const ports = fakePorts()
    const runtime = opened(ports)
    runtime.dispatch({ type: "continue" })
    runtime.dispatch({ type: "pick", pick: "Prints z" })
    runtime.dispatch({ type: "holdToSpeak" })
    expect(ports.notes.getSnapshot().take.kind).toBe("opening")
    runtime.dispatch({ type: "letGo" })
    expect(runtime.getSnapshot()).toMatchObject({ taking: null, said: "early" })
    runtime.dispatch({ type: "holdToSpeak" })
    expect(ports.notes.started).toHaveLength(2)
  })

  it("says a take an earlier opening left on the card on screen, when the phone holds no note from it", () => {
    const storage = inMemoryStorage()
    const notes = fakeNotes()
    const first = opened(fakePorts(storage, notes))
    first.dispatch({ type: "continue" })
    first.dispatch({ type: "pick", pick: "Prints z" })
    first.dispatch({ type: "holdToSpeak" })
    notes.open()
    // The app is ended mid-take, on this card; the phone kept no note.
    const again = opened(fakePorts(storage))
    expect(again.getSnapshot()).toMatchObject({
      taking: null,
      said: "missing",
    })
    expect(again.getSnapshot().place?.visit.card).toBe("a")
  })

  it("lets a take refused by the microphone end with none, and the card moves on", () => {
    const notes = fakeNotes()
    notes.refuse("The microphone is off for this app.")
    const ports = fakePorts(inMemoryStorage(), notes)
    const runtime = opened(ports)
    runtime.dispatch({ type: "continue" })
    runtime.dispatch({ type: "pick", pick: "Prints z" })
    runtime.dispatch({ type: "holdToSpeak" })
    expect(notes.started).toEqual([])
    expect(runtime.getSnapshot()).toMatchObject({
      taking: null,
      said: "blocked",
      notes: { blocked: "The microphone is off for this app." },
    })
    runtime.dispatch({ type: "next" })
    expect(visitOf(runtime.getSnapshot())).toBe("b:choose")
    expect(storedLog(ports.storage)).toHaveLength(1)
  })

  it("says the phone has no room once a take finds none, and tries again on the next card", () => {
    const ports = fakePorts()
    const runtime = opened(ports)
    runtime.dispatch({ type: "continue" })
    runtime.dispatch({ type: "pick", pick: "Prints z" })
    runtime.dispatch({ type: "holdToSpeak" })
    ports.notes.open()
    ports.notes.lose("full")
    expect(runtime.getSnapshot()).toMatchObject({ noRoom: true, taking: null })
    runtime.dispatch({ type: "next" })
    expect(runtime.getSnapshot().noRoom).toBe(false)
    expect(storedLog(ports.storage)).toHaveLength(1)

    // Room was made: the next card's take is kept.
    runtime.dispatch({ type: "pick", pick: "Prints 122" })
    runtime.dispatch({ type: "holdToSpeak" })
    ports.notes.open()
    expect(ports.notes.started).toHaveLength(2)
    ports.notes.land("note-b")
    expect(runtime.getSnapshot()).toMatchObject({
      noRoom: false,
      place: { visit: { card: "b", note: "note-b" } },
    })
  })
})
