// @vitest-environment node
/**
 * The page's machine alone, in node: no DOM, no React, no ports. A take's
 * own rules are the take pattern's, proved in `@some-ui/voice-capture`;
 * what the page keeps beside them is pinned here as transitions.
 */
import type { Take } from "@some-ui/voice-capture"
import { bite } from "@soundbites/lib/__tests__/fixture"
import type {
  SoundbitesEvent,
  SoundbitesState,
  Step,
} from "@soundbites/lib/machine"
import { initialState, keptBite, NOTICES, step } from "@soundbites/lib/machine"
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

const kept = (
  state: SoundbitesState,
  durationMs?: number
): ReturnType<typeof keptBite> =>
  keptBite(state, take(durationMs), {
    id: "n",
    at: "2026-10-01T12:00:00.000Z",
    situation: SITUATION,
  })

/** Arrived, list read with `bites`. */
function here(bites = [bite("a", 5), bite("b", 10)]): SoundbitesState {
  return run(
    initialState("direct"),
    { type: "arrived", autoStart: false },
    { type: "listed", seq: 1, kept: bites }
  ).state
}

describe("step", () => {
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
    const twice = run(
      here(),
      { type: "storeChanged" },
      { type: "storeChanged" }
    )
    const stale = step(twice.state, { type: "listed", seq: 2, kept: [] })
    expect(stale.state).toBe(twice.state)
    const fresh = step(twice.state, { type: "listed", seq: 3, kept: [] })
    expect(fresh.state.library).toEqual({ kind: "read", kept: [] })
  })

  it("keeps the way in until a take is stored", () => {
    const from = run(initialState("reminder"), {
      type: "arrived",
      autoStart: false,
    }).state
    expect(kept(from).bite.context.source).toBe("reminder")
    // A save that failed stores nothing, so the way in stays.
    const stored = step(from, { type: "saved" }).state
    expect(kept(stored).bite.context.source).toBe("direct")
  })

  it("keeps a take's length within the minute", () => {
    expect(kept(here(), 61_000).bite.durationMs).toBe(60_000)
  })

  it("lets the take go when the page is hidden or left", () => {
    expect(step(here(), { type: "hidden" }).effects).toEqual([
      { type: "leaveTake" },
    ])
    const left = step(here(), { type: "left" })
    expect(left.state.page).toBe("left")
    expect(left.effects).toEqual([{ type: "leaveTake" }])
  })

  it("starts a take on arrival when asked, once", () => {
    const arrived = step(initialState("sessions"), {
      type: "arrived",
      autoStart: true,
    })
    expect(arrived.effects).toEqual([
      { type: "read", seq: 1 },
      { type: "announceAutoStart" },
      { type: "startTake" },
    ])
    // StrictMode's remount, or a return: what was in flight carries on.
    const again = run(
      arrived.state,
      { type: "left" },
      { type: "arrived", autoStart: true }
    )
    expect(again.effects).toEqual([])
    expect(again.state.page).toBe("here")
  })

  it("waits to auto-start until a page that arrived hidden is shown", () => {
    const hidden = run(
      initialState("sessions"),
      { type: "hidden" },
      { type: "arrived", autoStart: true }
    )
    expect(hidden.effects).toEqual([{ type: "read", seq: 1 }])
    expect(hidden.state.autoStartPending).toBe(true)
    const shown = step(hidden.state, { type: "shown" })
    expect(shown.effects).toEqual([
      { type: "announceAutoStart" },
      { type: "startTake" },
    ])
    expect(step(shown.state, { type: "shown" }).effects).toEqual([])
  })

  it("re-reads the list when the store changes, only while the page is here", () => {
    expect(step(here(), { type: "storeChanged" }).effects).toEqual([
      { type: "read", seq: 2 },
    ])
    const left = step(here(), { type: "left" }).state
    expect(step(left, { type: "storeChanged" }).effects).toEqual([])
  })

  it("replaces the picked one with the next save, and forgets the pick after", () => {
    const picked = step(here(), { type: "replacePicked", id: "b" }).state
    expect(kept(picked).replace).toBe("b")
    const saved = step(picked, { type: "saved" }).state
    expect(saved.choice).toBeNull()
    expect(kept(saved).replace).toBeNull()
  })

  it("forgets a pick the list no longer holds", () => {
    const picked = step(here(), { type: "replacePicked", id: "b" }).state
    const read = run(
      picked,
      { type: "storeChanged" },
      { type: "listed", seq: 2, kept: [bite("a", 5)] }
    ).state
    expect(read.choice).toBeNull()
  })

  it("says a Let go that wasn't stored, until a later write lands", () => {
    const failed = step(here(), { type: "setAsideFailed" }).state
    expect(failed.notice).toBe(NOTICES.notSetAside)
    expect(step(failed, { type: "storeChanged" }).state.notice).toBe("")
  })
})
