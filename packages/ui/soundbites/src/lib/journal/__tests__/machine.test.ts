import type { Take } from "@some-ui/voice-capture"
import { NOON, plan, take } from "@soundbites/lib/journal/__tests__/fixture"
import type {
  JournalEffect,
  JournalEvent,
  JournalState,
} from "@soundbites/lib/journal/machine"
import {
  initialJournalState,
  JOURNAL_NOTICES,
  step,
} from "@soundbites/lib/journal/machine"
import type { JournalPlan, JournalTake } from "@soundbites/lib/journal/plan"
import { describe, expect, it } from "vitest"

/** The fixture plan's `openedAt`: the episode its writes name. */
const EPISODE = new Date(NOON).toISOString()

/** Every event in turn; the state after, and every effect asked for. */
function run(
  state: JournalState,
  ...events: Array<JournalEvent>
): { state: JournalState; effects: Array<JournalEffect> } {
  const effects: Array<JournalEffect> = []
  let current = state
  for (const event of events) {
    const next = step(current, event)
    current = next.state
    effects.push(...next.effects)
  }
  return { state: current, effects }
}

/** Arrived, and the shelf read as `p` with `takes`. */
function arrived(
  p: JournalPlan | null = plan(),
  takes: ReadonlyArray<JournalTake> = []
): JournalState {
  return run(
    initialJournalState(),
    { type: "arrived" },
    { type: "listed", seq: 1, shelf: { plan: p, takes } }
  ).state
}

const spoken = (durationMs: number): Take => ({
  blob: new Blob(["voice"]),
  mimeType: "audio/webm;codecs=opus",
  durationMs,
})

describe("journal machine", () => {
  it("selects the first cut without a take once the shelf is read", () => {
    expect(arrived(plan(), [take("gap", 9_000)]).selected).toBe("flow")
    expect(arrived(null).selected).toBeNull()
  })

  it("caps a take at what the budget leaves, and keeps it past its target", () => {
    const state = arrived(plan(), [take("gap", 100_000)])
    const opened = run(state, { type: "recordPressed" })
    expect(opened.state.activity).toEqual({
      kind: "opening",
      cutId: "flow",
      capMs: 80_000,
      episode: EPISODE,
    })
    const recording = run(
      opened.state,
      { type: "micOpened", at: 1_000 },
      { type: "ticked", now: 70_000, level: 0.2 }
    )
    // Past flow's 60 s target, still recording: the target is soft.
    expect(recording.state.activity).toMatchObject({
      kind: "recording",
      elapsed: 69_000,
    })
    const capped = run(recording.state, {
      type: "ticked",
      now: 81_000,
      level: 0.2,
    })
    // At the cap the take finishes itself and is kept.
    expect(capped.state.activity).toEqual({
      kind: "saving",
      cutId: "flow",
      capMs: 80_000,
      episode: EPISODE,
    })
    expect(capped.effects).toContainEqual({ type: "finishTake" })
  })

  it("counts a take stopped a tick past its cap as the cap", () => {
    const saving = run(
      arrived(plan(), [take("gap", 100_000)]),
      { type: "recordPressed" },
      { type: "micOpened", at: 0 },
      { type: "ticked", now: 80_050, level: 0.2 }
    ).state
    expect(saving.activity).toEqual({
      kind: "saving",
      cutId: "flow",
      capMs: 80_000,
      episode: EPISODE,
    })
    const taken = run(saving, {
      type: "taken",
      take: spoken(80_090),
      at: "2026-10-12T12:01:00.000Z",
    })
    expect(taken.effects).toContainEqual(
      expect.objectContaining({
        type: "saveTake",
        take: expect.objectContaining({ cutId: "flow", durationMs: 80_000 }),
      })
    )
  })

  it("refuses a take with the budget spent", () => {
    const state = arrived(plan(), [take("gap", 120_000), take("flow", 59_500)])
    const pressed = run(state, { type: "recordPressed" })
    expect(pressed.effects).toEqual([])
    expect(pressed.state.notice).toBe(JOURNAL_NOTICES.spent)
  })

  it("saves a kept take for its cut and brings up the next open cut", () => {
    const state = arrived()
    const saved = run(
      state,
      { type: "recordPressed" },
      { type: "micOpened", at: 0 },
      { type: "recordPressed" },
      { type: "taken", take: spoken(21_000), at: "2026-10-12T12:01:00.000Z" }
    )
    expect(saved.effects).toContainEqual(
      expect.objectContaining({
        type: "saveTake",
        take: expect.objectContaining({ cutId: "gap", durationMs: 21_000 }),
      })
    )
    const landed = run(saved.state, {
      type: "takeSaved",
      take: take("gap", 21_000),
    })
    expect(landed.state.activity).toEqual({ kind: "idle" })
    expect(landed.state.selected).toBe("flow")
    expect(landed.state.notice).toBe("Kept 0:21. Next cut is up.")
    // The last write out reads the shelf again.
    expect(landed.effects).toEqual([
      { type: "read", seq: landed.state.readSeq },
    ])
  })

  it("keeps a take cut short by the page going away", () => {
    const recording = run(
      arrived(),
      { type: "recordPressed" },
      { type: "micOpened", at: 0 }
    ).state
    const hidden = run(recording, { type: "hidden" })
    expect(hidden.state.activity).toEqual({
      kind: "saving",
      cutId: "gap",
      capMs: 180_000,
      episode: EPISODE,
    })
    expect(hidden.effects).toContainEqual({ type: "finishTake" })
  })

  it("lets go of a microphone that opens after the page left", () => {
    const opening = run(arrived(), { type: "recordPressed" }).state
    const after = run(opening, { type: "left" }, { type: "micOpened", at: 0 })
    expect(after.state.activity).toEqual({ kind: "idle" })
    expect(after.effects).toContainEqual({ type: "discardTake" })
  })

  it("never lets a read from before a write paint over it", () => {
    const state = arrived()
    // A read goes out (another page's write, say), then a target moves.
    const reading = run(state, { type: "storeChanged" })
    const staleSeq = reading.state.readSeq
    const moved = run(reading.state, { type: "nudged", deltaMs: 5_000 })
    expect(moved.effects).toEqual([
      { type: "setTargets", targets: { gap: 35_000 }, episode: EPISODE },
    ])
    const stale = run(moved.state, {
      type: "listed",
      seq: staleSeq,
      shelf: { plan: plan(), takes: [] },
    })
    expect(stale.state).toBe(moved.state)
  })

  it("opens a primer that keeps every take at once", () => {
    const state = arrived(plan(), [take("gap", 5_000)])
    const picked = run(state, {
      type: "primerPicked",
      file: new Blob(["{}"]),
    })
    const read = run(picked.state, {
      type: "primerRead",
      seq: picked.state.pickSeq,
      text: JSON.stringify({
        version: 1,
        title: "Revised",
        cuts: [
          { id: "gap", artifact: "A", prompt: "B", targetSec: 10 },
          { id: "new", artifact: "C", prompt: "D", targetSec: 10 },
        ],
      }),
      at: "2026-10-13T09:00:00.000Z",
    })
    expect(read.state.pending).toBeNull()
    expect(read.effects).toEqual([
      expect.objectContaining({ type: "openPlan" }),
    ])
    expect(read.state.selected).toBe("new")
  })

  it("asks before a primer lets takes go, and opens it on yes", () => {
    const state = arrived(plan(), [take("gap", 5_000), take("flow", 5_000)])
    const picked = run(state, { type: "primerPicked", file: new Blob([]) })
    const read = run(picked.state, {
      type: "primerRead",
      seq: picked.state.pickSeq,
      text: JSON.stringify({
        version: 1,
        title: "Other",
        cuts: [{ id: "flow", artifact: "A", prompt: "B", targetSec: 10 }],
      }),
      at: "2026-10-13T09:00:00.000Z",
    })
    expect(read.effects).toEqual([])
    expect(read.state.pending?.drops).toEqual(["gap"])
    const yes = run(read.state, { type: "replaceConfirmed" })
    expect(yes.effects).toEqual([expect.objectContaining({ type: "openPlan" })])
    expect(yes.state.shelf).toMatchObject({ takes: [take("flow", 5_000)] })
  })

  it("names the episode a take began in when it saves, whatever was read since", () => {
    const recording = run(
      arrived(),
      { type: "recordPressed" },
      { type: "micOpened", at: 0 }
    ).state
    // Another instance of the page opened another primer meanwhile.
    const other = plan({ openedAt: "2026-10-12T12:30:00.000Z" })
    const reread = run(recording, {
      type: "listed",
      seq: recording.readSeq,
      shelf: { plan: other, takes: [] },
    }).state
    const saved = run(
      reread,
      { type: "recordPressed" },
      { type: "taken", take: spoken(5_000), at: "2026-10-12T12:31:00.000Z" }
    )
    expect(saved.effects).toContainEqual(
      expect.objectContaining({ type: "saveTake", episode: EPISODE })
    )
  })

  it("says so when a primer is read while a take is under way", () => {
    const picked = run(arrived(), {
      type: "primerPicked",
      file: new Blob([]),
    }).state
    const recording = run(
      picked,
      { type: "recordPressed" },
      { type: "micOpened", at: 0 }
    ).state
    const read = run(recording, {
      type: "primerRead",
      seq: picked.pickSeq,
      text: JSON.stringify({
        version: 1,
        title: "Other",
        cuts: [{ id: "flow", artifact: "A", prompt: "B", targetSec: 10 }],
      }),
      at: "2026-10-13T09:00:00.000Z",
    })
    expect(read.effects).toEqual([])
    expect(read.state.primerProblem).toBe(JOURNAL_NOTICES.primerMidTake)
  })

  it("says what is wrong with a primer and keeps the episode", () => {
    const state = arrived()
    const picked = run(state, { type: "primerPicked", file: new Blob([]) })
    const read = run(picked.state, {
      type: "primerRead",
      seq: picked.state.pickSeq,
      text: "not json",
      at: "2026-10-13T09:00:00.000Z",
    })
    expect(read.state.primerProblem).toBe("That file isn't JSON.")
    expect(read.state.shelf).toBe(state.shelf)
  })

  it("keeps an episode however long it waits on its next take", () => {
    const touched = plan({ touchedAt: "2025-01-01T00:00:00.000Z" })
    const later = run(
      initialJournalState(),
      { type: "arrived" },
      {
        type: "listed",
        seq: 1,
        shelf: { plan: touched, takes: [take("gap", 5_000)] },
      }
    )
    expect(later.effects).toEqual([{ type: "read", seq: 1 }])
    expect(later.state.shelf).toMatchObject({ plan: touched })
    expect(later.state.notice).toBe("")
  })

  it("discards the episode on the person's say", () => {
    const discarded = run(arrived(plan(), [take("gap", 5_000)]), {
      type: "episodeDiscarded",
    })
    expect(discarded.effects).toEqual([{ type: "clear", episode: EPISODE }])
    expect(discarded.state.shelf).toEqual({
      kind: "read",
      plan: null,
      takes: [],
    })
  })

  it("plays the selected cut's take, dropping a late result for an old play", () => {
    const state = arrived(plan(), [take("gap", 5_000)])
    const selected = run(state, { type: "cutSelected", cutId: "gap" })
    const first = run(selected.state, { type: "playPressed" })
    expect(first.effects).toEqual([{ type: "loadAudio", cutId: "gap", seq: 1 }])
    const stopped = run(first.state, { type: "playPressed" })
    const late = run(stopped.state, {
      type: "audioLoaded",
      seq: 1,
      audio: new Blob(["x"]),
    })
    expect(late.effects).toEqual([])
  })

  it("names why a take was not stored", () => {
    const saving = run(
      arrived(),
      { type: "recordPressed" },
      { type: "micOpened", at: 0 },
      { type: "recordPressed" },
      { type: "taken", take: spoken(5_000), at: "2026-10-12T12:01:00.000Z" }
    ).state
    const full = run(saving, {
      type: "writeFailed",
      kind: "take",
      reason: "full",
    })
    expect(full.state.activity).toEqual({ kind: "idle" })
    expect(full.state.notice).toBe(JOURNAL_NOTICES.full)
  })
})
