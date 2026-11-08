/**
 * A template's preview (SFEED12, #2757): the call's sample, cut by code to
 * 15–30 s, the same every time, and each trimmed take's words only those
 * heard before it ends.
 */
import { callCutList, callScenes, sampleCallWeek } from "@video-render/call"
import type { CallWeek } from "@video-render/call"
import type { CutList } from "@video-render/cut-list"
import {
  PREVIEW_SHOT_LEAST_MS,
  PREVIEW_TITLE,
  PREVIEW_WINDOW,
  previewOf,
} from "@video-render/preview"
import type { StillTake } from "@video-render/stills"
import { describe, expect, it } from "vitest"

function sample(): CallWeek {
  const week = sampleCallWeek()
  if (!week.ok) throw new Error(week.problems.join("; "))
  return week.value
}

/** A take for each said scene, a word every 400 ms, as the speaker gives them. */
function takesOf(week: CallWeek): ReadonlyArray<StillTake | null> {
  return callScenes(week).map(({ said }) => {
    if (said === "") return null
    const words = said.split(/\s+/).map((text, i) => ({
      text,
      startMs: i * 400,
      endMs: i * 400 + 350,
    }))
    return { ms: words.length * 400, words }
  })
}

function preview(cut: CutList): CutList {
  const made = previewOf(cut)
  if (!made.ok) throw new Error(made.problems.join("; "))
  return made.value
}

const total = (cut: CutList): number =>
  cut.shots.reduce((ms, s) => ms + s.durationMs, 0)

describe("a template's preview", () => {
  it.each([
    ["before anything is said", null],
    ["with every take said", takesOf],
  ] as const)("the call's sample, %s: in the window, in order", (_, takes) => {
    const week = sample()
    const cut = callCutList(
      week,
      takes ? takes(week) : callScenes(week).map(() => null)
    )
    const made = preview(cut)
    expect(total(made)).toBeGreaterThanOrEqual(PREVIEW_WINDOW.leastMs)
    expect(total(made)).toBeLessThanOrEqual(PREVIEW_WINDOW.mostMs)
    const ids = made.shots.map((s) => s.id)
    expect(ids.slice(0, 3)).toEqual(["intro", "brand-in", "chapter-board"])
    expect(ids[3]).toBe("board")
    expect(ids.at(-1)).toBe("brand-out")
    expect(made.title).toBe(PREVIEW_TITLE(cut.title))
    expect(made.burnIns).toEqual(cut.burnIns)
    // The same cut list, the same preview.
    expect(preview(cut)).toEqual(made)
  })

  it("trims a said scene at its end, its take and words with it", () => {
    const week = sample()
    const cut = callCutList(week, takesOf(week))
    const made = preview(cut)
    for (const shot of made.shots) {
      const whole = cut.shots.find((s) => s.id === shot.id)
      expect(shot.durationMs).toBeLessThanOrEqual(whole?.durationMs ?? 0)
      const take = shot.take
      if (take === undefined) continue
      expect(shot.voiceInMs + take.outMs - take.inMs).toBeLessThanOrEqual(
        shot.durationMs
      )
      for (const word of take.words ?? [])
        expect(word.endMs).toBeLessThanOrEqual(take.outMs)
    }
    const intro = made.shots[0]
    expect(intro?.durationMs).toBeLessThan(cut.shots[0]?.durationMs ?? 0)
    expect(intro?.durationMs).toBeGreaterThanOrEqual(PREVIEW_SHOT_LEAST_MS)
  })

  it("refuses a cut that doesn't open with the locked intro", () => {
    const week = sample()
    const cut = callCutList(
      week,
      callScenes(week).map(() => null)
    )
    const made = previewOf({ ...cut, shots: cut.shots.slice(1) })
    expect(made.ok).toBe(false)
  })
})
