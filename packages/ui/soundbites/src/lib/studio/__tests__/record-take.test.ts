// @vitest-environment node
/**
 * `recordTake` alone: the scene's take as the take pattern's parts draw it,
 * over where the take is kept and what the machine is doing.
 */
import type { TakeKept } from "@some-ui/voice-capture"
import type { ProjectTake } from "@soundbites/lib/project/model"
import { recordTake } from "@soundbites/lib/studio/view"
import { describe, expect, it } from "vitest"

const IDLE = { activity: { kind: "idle" } } as const

function take(over: Partial<ProjectTake> = {}): ProjectTake {
  return {
    id: "t1",
    shot: "s1",
    recordedAt: "2026-10-30T09:00:00.000Z",
    durationMs: 4_000,
    mimeType: "audio/webm",
    keptBy: [],
    onPhone: true,
    ...over,
  }
}

describe("recordTake", () => {
  it("says where the chosen take is kept: home, going home, or no place", () => {
    const kept = (over: Partial<ProjectTake>): TakeKept | null | undefined =>
      recordTake(IDLE, { take: take(over) }).row?.take.kept
    expect(kept({ keptBy: ["home"], onPhone: true })).toEqual({
      place: "home",
      since: null,
    })
    expect(kept({ keptBy: ["home"], onPhone: false })).toEqual({
      place: "home",
      since: null,
    })
    expect(kept({ keptBy: [], onPhone: true })).toEqual({ place: "going" })
    // Carried in without its audio, and home doesn't hold it.
    expect(kept({ keptBy: [], onPhone: false })).toBeNull()
    expect(kept({ keptBy: ["drive"], onPhone: false })).toBeNull()
  })

  it("plays only a take whose audio is on this phone, and only while settled", () => {
    expect(recordTake(IDLE, { take: take() }).row?.canPlay).toBe(true)
    expect(
      recordTake(IDLE, { take: take({ onPhone: false }) }).row?.canPlay
    ).toBe(false)
    const playing = {
      activity: { kind: "playing", take: "t1", seq: 1 },
    } as const
    expect(recordTake(playing, { take: take() }).row).toMatchObject({
      playing: true,
      canPlay: true,
      canRedo: false,
      canLetGo: false,
    })
  })

  it("records the scene, or records it again once it has a take", () => {
    expect(recordTake(IDLE, { take: null })).toEqual({
      button: { kind: "ready", again: false },
      row: null,
    })
    expect(recordTake(IDLE, { take: take() }).button).toEqual({
      kind: "ready",
      again: true,
    })
    const recording = {
      activity: {
        kind: "recording",
        startedAt: 0,
        elapsed: 52_000,
        level: 0.4,
        shot: "s1",
        capMs: 60_000,
        project: "p",
      },
    } as const
    expect(recordTake(recording, { take: null }).button).toEqual({
      kind: "recording",
      elapsedMs: 52_000,
      capMs: 60_000,
      level: 0.4,
      nearlyUp: true,
      clock: "elapsed",
    })
  })
})
