// @vitest-environment node
/**
 * The machine alone, in node: no DOM, no React, no ports. What used to be
 * rules each async path in the component had to keep (#1636's review
 * rounds) is pinned here as transitions.
 */
import { bite } from "@soundbites/lib/__tests__/fixture"
import type {
  SoundbitesEvent,
  SoundbitesState,
  Step,
} from "@soundbites/lib/machine"
import { initialState, NOTICES, step } from "@soundbites/lib/machine"
import type { Take } from "@soundbites/lib/recorder"
import { describe, expect, it } from "vitest"

function run(
  state: SoundbitesState,
  ...events: ReadonlyArray<SoundbitesEvent>
): Step {
  let last: Step = { state, effects: [] }
  for (const event of events) last = step(last.state, event)
  return last
}

const take = (durationMs = 5_000): Take => ({
  blob: new Blob(["voice"], { type: "audio/webm" }),
  mimeType: "audio/webm",
  durationMs,
})

const SITUATION = {
  lastSessionAt: null,
  openSessions: 0,
  timeZone: "UTC",
}

/** Arrived, list read with `kept`, idle. */
function here(kept = [bite("a", 5), bite("b", 10)]): SoundbitesState {
  return run(
    initialState("direct"),
    { type: "arrived", autoStart: false },
    { type: "listed", seq: 1, kept }
  ).state
}

/** Recording, started at t=0. */
function recording(state = here()): SoundbitesState {
  return run(state, { type: "recordPressed" }, { type: "micOpened", at: 0 })
    .state
}

describe("step", () => {
  it("cannot play while the microphone opens or records (#1636, finding 11)", () => {
    const opening = step(here(), { type: "recordPressed" }).state
    expect(opening.activity.kind).toBe("opening")
    expect(step(opening, { type: "playPressed", id: "a" })).toEqual({
      state: opening,
      effects: [],
    })

    const rec = recording()
    expect(step(rec, { type: "playPressed", id: "a" }).effects).toEqual([])
  })

  it("stops playback in the same step that starts the microphone", () => {
    const playing = step(here(), { type: "playPressed", id: "a" }).state
    expect(step(playing, { type: "recordPressed" }).effects).toEqual([
      { type: "stopPlayback" },
      { type: "openMic" },
    ])
  })

  it("drops a late result for a play that was overtaken", () => {
    const first = step(here(), { type: "playPressed", id: "a" })
    expect(first.effects).toEqual([{ type: "loadAudio", id: "a", seq: 1 }])
    const second = step(first.state, { type: "playPressed", id: "b" })

    const audio = new Blob(["x"])
    // a's audio, and then a's failure, arriving after b was asked for.
    expect(
      step(second.state, { type: "audioLoaded", seq: 1, audio }).effects
    ).toEqual([])
    expect(step(second.state, { type: "playbackEnded", seq: 1 }).state).toBe(
      second.state
    )
    expect(
      step(second.state, { type: "audioLoaded", seq: 2, audio }).effects
    ).toEqual([{ type: "startPlayback", audio, seq: 2 }])
  })

  it("never shows a list it did not read: a failed read is unknown", () => {
    const failed = run(
      initialState("direct"),
      { type: "arrived", autoStart: false },
      { type: "listFailed", seq: 1 }
    ).state
    expect(failed.library).toEqual({ kind: "unreadable" })

    const retried = step(failed, { type: "retryRead" })
    expect(retried.state.library).toEqual({ kind: "reading" })
    expect(retried.effects).toEqual([{ type: "read", seq: 2 }])
  })

  it("drops a read overtaken by a newer one", () => {
    const state = run(
      initialState("direct"),
      { type: "arrived", autoStart: false },
      { type: "retryRead" }
    ).state
    expect(step(state, { type: "listed", seq: 1, kept: [] }).state).toBe(state)
  })

  it("keeps the way in until a take is stored", () => {
    const start = run(
      initialState("reminder"),
      { type: "arrived", autoStart: true },
      { type: "listed", seq: 1, kept: [] },
      { type: "micOpened", at: 0 },
      { type: "recordPressed" },
      {
        type: "taken",
        take: take(),
        id: "t1",
        at: "2026-10-02T00:00:00.000Z",
        situation: SITUATION,
      }
    )
    const save = start.effects[0]
    if (save?.type !== "save") throw new Error("a save")
    expect(save.bite.context.source).toBe("reminder")

    // A failed save leaves it for the retry ...
    const failed = step(start.state, { type: "saveFailed" }).state
    expect(failed.source).toBe("reminder")
    expect(failed.notice).toBe(NOTICES.notKept)
    // ... and a stored one ends it.
    const saved = step(start.state, { type: "saved", bite: save.bite }).state
    expect(saved.source).toBe("direct")
  })

  it("says kept even when the re-read after a save fails, with the list unknown", () => {
    const saving = step(recording(), { type: "recordPressed" }).state
    const save = step(saving, {
      type: "taken",
      take: take(),
      id: "t1",
      at: "2026-10-02T00:00:00.000Z",
      situation: SITUATION,
    }).effects[0]
    if (save?.type !== "save") throw new Error("a save")
    const saved = step(saving, { type: "saved", bite: save.bite })
    expect(saved.effects).toEqual([{ type: "read", seq: 2 }])

    const unread = step(saved.state, { type: "listFailed", seq: 2 }).state
    expect(unread.notice).toBe("Kept, 0:05.")
    expect(unread.library).toEqual({ kind: "unreadable" })

    const read = step(saved.state, {
      type: "listed",
      seq: 2,
      kept: [save.bite],
    }).state
    expect(read.notice).toBe("Kept, 0:05. 1 of 6 on this phone.")
  })

  it("keeps nothing shorter than a second", () => {
    const saving = step(recording(), { type: "recordPressed" }).state
    const next = step(saving, {
      type: "taken",
      take: take(300),
      id: "t1",
      at: "2026-10-02T00:00:00.000Z",
      situation: SITUATION,
    })
    expect(next.effects).toEqual([])
    expect(next.state.notice).toBe(NOTICES.tooShort)
    expect(next.state.activity.kind).toBe("idle")
  })

  it("stops itself at one minute", () => {
    const rec = recording()
    expect(
      step(rec, { type: "ticked", now: 59_900, level: 0.2 }).effects
    ).toEqual([])
    expect(
      step(rec, { type: "ticked", now: 60_000, level: 0.2 }).effects
    ).toEqual([{ type: "stopClock" }, { type: "finishTake" }])
  })

  it("keeps a take when the page is hidden or left mid-take", () => {
    const rec = recording()
    for (const type of ["hidden", "left"] as const)
      expect(step(rec, { type }).effects).toEqual([
        { type: "stopClock" },
        { type: "finishTake" },
      ])
  })

  it("lets the microphone go if the page was left while it opened", () => {
    const opening = step(here(), { type: "recordPressed" }).state
    const gone = step(opening, { type: "left" }).state
    expect(step(gone, { type: "micOpened", at: 0 }).effects).toEqual([
      { type: "discardTake" },
    ])
  })

  it("resumes, not restarts, when it arrives again after leaving (StrictMode)", () => {
    const first = step(initialState("sessions"), {
      type: "arrived",
      autoStart: true,
    })
    expect(first.effects).toEqual([
      { type: "read", seq: 1 },
      { type: "announceAutoStart" },
      { type: "openMic" },
    ])
    const again = run(
      first.state,
      { type: "left" },
      { type: "arrived", autoStart: true }
    )
    expect(again.effects).toEqual([])
    // The microphone that was opening is used, not discarded.
    expect(step(again.state, { type: "micOpened", at: 0 }).effects).toEqual([
      { type: "startClock" },
    ])
  })

  it("replaces the picked one with the next save, and forgets the pick after", () => {
    const picked = step(here(), { type: "replacePicked", id: "a" }).state
    const saving = step(recording(picked), { type: "recordPressed" }).state
    const save = step(saving, {
      type: "taken",
      take: take(),
      id: "t1",
      at: "2026-10-02T00:00:00.000Z",
      situation: SITUATION,
    }).effects[0]
    expect(save).toMatchObject({ type: "save", replace: "a" })
    if (save?.type !== "save") throw new Error("a save")
    expect(step(saving, { type: "saved", bite: save.bite }).state.choice).toBe(
      null
    )
  })

  it("does not delete while recording, and stops a recording it deletes from playing", () => {
    expect(
      step(recording(), { type: "deleteConfirmed", id: "a" }).effects
    ).toEqual([])
    const playing = step(here(), { type: "playPressed", id: "a" }).state
    expect(step(playing, { type: "deleteConfirmed", id: "a" }).effects).toEqual(
      [{ type: "stopPlayback" }, { type: "remove", id: "a" }]
    )
  })
})
