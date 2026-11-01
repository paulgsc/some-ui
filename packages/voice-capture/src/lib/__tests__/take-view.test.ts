/**
 * What the take pattern's parts show for one item (`lib/take-view.ts`), and
 * its one words table (`lib/take-words.ts`): every view and every line said
 * reads in the person's terms, with no machinery behind it (CLAUDE.md,
 * "State in the person's terms").
 */
import type { RecordingFailure } from "@voice-capture/lib/recorder"
import type { TakeEnded } from "@voice-capture/lib/take-kit"
import type {
  PatternTake,
  TakeKept,
  TakePatternOptions,
  TakePatternSnapshot,
} from "@voice-capture/lib/take-pattern"
import type { TakeButtonView, TakeSaid } from "@voice-capture/lib/take-view"
import { takeItemView } from "@voice-capture/lib/take-view"
import {
  buttonLabel,
  buttonSaid,
  keptSaid,
  TAKE_WORDS,
  takeSaid,
} from "@voice-capture/lib/take-words"
import type { TakeEnding } from "@voice-capture/lib/voice-note"
import { describe, expect, it } from "vitest"

const ONE: TakePatternOptions = {
  takes: { per: "one" },
  limits: { minMs: 500, maxMs: 60_000 },
  redo: "supersede",
  letGo: "set-aside",
  play: "each",
  clock: "elapsed",
}

const MANY: TakePatternOptions = {
  ...ONE,
  takes: { per: "many", max: 2, full: "refuse" },
  play: "latest",
}

const IDLE: TakePatternSnapshot = {
  take: { kind: "idle" },
  answers: null,
  supersedes: null,
  ended: null,
  blocked: null,
  playback: { kind: "quiet" },
  unplayable: null,
  setAside: null,
  discarded: null,
}

const taken = (
  id: string,
  at: string,
  over: Partial<PatternTake> = {}
): PatternTake => ({
  id,
  answers: "card-1",
  durationMs: 7_000,
  recordedAt: `2026-10-31T10:${at}:00.000Z`,
  standing: "current",
  kept: { place: "phone" },
  ...over,
})

const ended = (ending: TakeEnding, answers = "card-1"): TakeEnded => ({
  seq: 1,
  answers,
  ending,
  id: ending === "kept" ? "t9" : null,
  reason: ending === "blocked" ? "denied" : null,
  unheard: false,
})

describe("one item's takes", () => {
  it("shows the newest current take as the item's, and every other apart (D2)", () => {
    const view = takeItemView(
      IDLE,
      [
        taken("t1", "01", { standing: "earlier" }),
        taken("t3", "03"),
        taken("t2", "02"),
        taken("t4", "04", { standing: "set-aside" }),
        taken("x1", "05", { answers: "card-2" }),
      ],
      "card-1",
      ONE
    )
    expect(view.current.map((row) => row.take.id)).toEqual(["t3"])
    expect(view.earlier.map((row) => row.take.id)).toEqual(["t2", "t1"])
    expect(view.button).toEqual({ kind: "ready", again: true })
    expect(view.supersedes).toBe("t3")
    expect(view.current[0]).toMatchObject({
      canPlay: true,
      canRedo: true,
      canLetGo: true,
      unsent: false,
    })
    expect(view.earlier[0]).toMatchObject({
      canPlay: true,
      canRedo: false,
      canLetGo: false,
      unsent: false,
    })
  })

  it('marks a take that never left the phone under `send: "on-confirm"`, and only that one (ST26)', () => {
    const held: TakePatternOptions = { ...ONE, send: "on-confirm" }
    const takes = [
      taken("t1", "01", { standing: "earlier", kept: { place: "going" } }),
      taken("t2", "02"),
    ]
    const view = takeItemView(IDLE, takes, "card-1", held)
    expect(view.current[0]?.unsent).toBe(true)
    expect(view.earlier[0]?.unsent).toBe(false)
    expect(takeItemView(IDLE, takes, "card-1", ONE).current[0]?.unsent).toBe(
      false
    )
    expect(TAKE_WORDS.discard).toBe("Delete")
    expect(TAKE_WORDS.place.unsent).toMatch(/Nothing has been sent/)
  })

  it("adds beside under `many`, up to its max, and plays only the newest under `latest`", () => {
    const takes = [taken("t1", "01"), taken("t2", "02")]
    const view = takeItemView(IDLE, takes, "card-1", MANY)
    expect(view.button).toEqual({ kind: "full", max: 2 })
    expect(view.supersedes).toBeNull()
    expect(view.current.map((row) => [row.take.id, row.canPlay])).toEqual([
      ["t2", true],
      ["t1", false],
    ])
    expect(takeItemView(IDLE, takes.slice(1), "card-1", MANY).button).toEqual({
      kind: "ready",
      again: false,
    })
  })

  it("stays ready at its max under `make-room`, for the store to make room (Soundbites)", () => {
    const takes = [taken("t1", "01"), taken("t2", "02")]
    const roomy: TakePatternOptions = {
      ...MANY,
      takes: { per: "many", max: 2, full: "make-room" },
    }
    expect(takeItemView(IDLE, takes, "card-1", roomy).button).toEqual({
      kind: "ready",
      again: false,
    })
  })

  it('counts the time left under `clock: "left"` (Soundbites\' countdown)', () => {
    const recording: TakePatternSnapshot = {
      ...IDLE,
      take: { kind: "recording", elapsedMs: 12_000, capMs: 60_000, level: 0.3 },
      answers: "card-1",
    }
    const left = { ...ONE, clock: "left" } as const
    expect(takeItemView(recording, [], "card-1", left).button).toMatchObject({
      kind: "recording",
      clock: "left",
    })
    expect(TAKE_WORDS.left(60_000 - 12_000)).toBe("0:48 left")
    expect(TAKE_WORDS.left(47_100)).toBe("0:48 left")
    expect(TAKE_WORDS.left(0)).toBe("0:00 left")
  })

  it("waits every row while a take is under way, and says another item's take", () => {
    const recording: TakePatternSnapshot = {
      ...IDLE,
      take: { kind: "recording", elapsedMs: 52_000, capMs: 60_000, level: 0.4 },
      answers: "card-2",
    }
    const view = takeItemView(recording, [taken("t1", "01")], "card-1", ONE)
    expect(view.button).toEqual({ kind: "elsewhere" })
    expect(view.current[0]).toMatchObject({
      canPlay: false,
      canRedo: false,
      canLetGo: false,
      unsent: false,
    })
    expect(takeItemView(recording, [], "card-2", ONE).button).toEqual({
      kind: "recording",
      elapsedMs: 52_000,
      capMs: 60_000,
      level: 0.4,
      nearlyUp: true,
      clock: "elapsed",
    })
  })

  it("says an ending beside the item it answered, once its take is over", () => {
    const snapshot = { ...IDLE, ended: ended("short") }
    expect(takeItemView(snapshot, [], "card-1", ONE).said).toEqual({
      kind: "ended",
      ended: ended("short"),
    })
    expect(takeItemView(snapshot, [], "card-2", ONE).said).toBeNull()
    expect(
      takeItemView(
        { ...snapshot, take: { kind: "opening" }, answers: "card-1" },
        [],
        "card-1",
        ONE
      ).said
    ).toBeNull()
  })

  it("says a take set aside, or one that couldn't play, beside its own item", () => {
    const takes = [
      taken("t1", "01", {
        standing: "set-aside",
        kept: { place: "home", since: null },
      }),
    ]
    const aside = { ...IDLE, setAside: { id: "t1", place: "home" as const } }
    expect(takeItemView(aside, takes, "card-1", ONE).said).toEqual({
      kind: "setAside",
      place: "home",
    })
    expect(takeItemView(aside, takes, "card-2", ONE).said).toBeNull()
    expect(
      takeItemView({ ...IDLE, unplayable: "t1" }, takes, "card-1", ONE).said
    ).toEqual({ kind: "unplayable" })
  })

  it("marks the take that plays", () => {
    const view = takeItemView(
      { ...IDLE, playback: { kind: "loading", id: "t1" } },
      [taken("t1", "01")],
      "card-1",
      ONE
    )
    expect(view.current[0]?.playing).toBe(true)
  })
})

/** How the app must never talk to the person: how it works, not what it does. */
const MACHINERY =
  /\b(idle|phase|state|blob|stream|mime\w*|webm|kit|seq|supersed\w*|set-aside|standing|null|undefined|error|status|request|retry|sync\w*|server|api|token|queue|owner|lease|effect|dispatch|answers)\b/i

const REASONS: ReadonlyArray<RecordingFailure> = [
  "denied",
  "busy",
  "unsupported",
  "failed",
  "elsewhere",
]

const ENDINGS: ReadonlyArray<TakeEnding> = [
  "kept",
  "short",
  "full",
  "failed",
  "early",
  "blocked",
]

/** Every place a take can be kept (MIC3). */
const KEPT: ReadonlyArray<TakeKept> = [
  { place: "phone" },
  { place: "going" },
  { place: "home", since: "2026-11-01T09:15:00.000Z" },
  { place: "home", since: null },
]

function everyLine(): Array<string> {
  const buttons: Array<TakeButtonView> = [
    { kind: "ready", again: false },
    { kind: "ready", again: true },
    { kind: "opening" },
    {
      kind: "recording",
      elapsedMs: 12_000,
      capMs: 60_000,
      level: 0.3,
      nearlyUp: false,
      clock: "elapsed",
    },
    { kind: "keeping" },
    { kind: "elsewhere" },
    { kind: "full", max: 5 },
  ]
  const said: Array<TakeSaid> = [
    ...ENDINGS.map(
      (ending): TakeSaid => ({ kind: "ended", ended: ended(ending) })
    ),
    { kind: "setAside", place: "phone" },
    { kind: "setAside", place: "going" },
    { kind: "setAside", place: "home" },
    { kind: "unplayable" },
  ]
  const w = TAKE_WORDS
  return [
    ...buttons.flatMap((view) => [buttonSaid(w, view), buttonLabel(w, view)]),
    ...said.map((line) => takeSaid(w, line)),
    ...REASONS.map((reason) => w.ended.blocked(reason)),
    w.elapsed(12_000, 60_000),
    w.left(48_000),
    w.nearlyUp(9_100),
    w.nearlyUp(1_000),
    w.length(7_400),
    ...KEPT.map((kept) => keptSaid(w, kept)),
    w.play,
    w.stop,
    w.redo,
    w.letGo,
    w.rowLabel(w.play, 7_000),
    w.earlier(1),
    w.earlier(3),
  ]
}

describe("the take pattern's words", () => {
  it("say every line in the person's terms", () => {
    const lines = everyLine()
    expect(lines.filter((line) => line.trim() === "")).toEqual([])
    expect(lines.filter((line) => MACHINERY.test(line))).toEqual([])
  })

  it("say where each take is kept, and since when only once the phone noted it (MIC3)", () => {
    const w = TAKE_WORDS
    const since = "2026-11-01T09:15:00.000Z"
    expect(KEPT.map((kept) => keptSaid(w, kept))).toEqual([
      "Kept on this phone",
      "On this phone, going home",
      `On home since ${w.when(since)}`,
      "On home",
    ])
    // Its day and time, never the stored form.
    expect(w.when(since)).not.toContain("2026-11-01")
    expect(w.when(since)).toMatch(/\d/)
  })

  it("read a length as a recording's clock, and the time left in whole seconds", () => {
    expect(TAKE_WORDS.elapsed(12_400, 60_000)).toBe("0:12 / 1:00")
    expect(TAKE_WORDS.length(67_000)).toBe("1:07")
    expect(TAKE_WORDS.nearlyUp(9_100)).toBe("10 seconds left")
    expect(TAKE_WORDS.nearlyUp(400)).toBe("1 second left")
  })
})
