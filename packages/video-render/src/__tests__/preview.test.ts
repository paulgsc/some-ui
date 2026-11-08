/** A template's preview (SFEED12, #2757), cut from the call's sample. */
import { sampleWeek } from "@video-render/__tests__/sample-week"
import { callCutList, callScenes } from "@video-render/call"
import type { CallWeek } from "@video-render/call"
import type { CutList } from "@video-render/cut-list"
import { PREVIEW_SHOT_LEAST_MS, previewOf } from "@video-render/preview"
import type { StillTake } from "@video-render/stills"
import { describe, expect, it } from "vitest"

/** A take for each said scene, a word every `each` ms, as the speaker gives them. */
function takesOf(week: CallWeek, each = 400): ReadonlyArray<StillTake | null> {
  return callScenes(week).map(({ said }) => {
    if (said === "") return null
    const words = said.split(/\s+/).map((text, i) => ({
      text,
      startMs: i * each,
      endMs: i * each + each - 50,
    }))
    return { ms: words.length * each, words }
  })
}

function preview(cut: CutList): CutList {
  const made = previewOf(cut)
  if (!made.ok) throw new Error(made.problems.join("; "))
  return made.value
}

describe("a template's preview", () => {
  it.each([
    ["before anything is said", null],
    ["with every take said", takesOf],
  ] as const)("the call's sample, %s: its opening, in order", (_, takes) => {
    const week = sampleWeek()
    const made = preview(
      callCutList(week, takes ? takes(week) : callScenes(week).map(() => null))
    )
    expect(made.shots.map((s) => s.id)).toEqual([
      "intro",
      "brand-in",
      "chapter-board",
      "board",
      "brand-out",
    ])
    expect(made.title.startsWith("Preview, sample data: ")).toBe(true)
  })

  it("shows sections of the first chapter only, never the next without its slide", () => {
    const week = sampleWeek()
    // Short takes, so a second section would fit.
    const made = preview(callCutList(week, takesOf(week, 150)))
    expect(made.shots.map((s) => s.id)).not.toContain("moved-1")
  })

  it("trims a said scene on the last word heard whole", () => {
    const week = sampleWeek()
    const cut = callCutList(week, takesOf(week))
    const made = preview(cut)
    for (const shot of made.shots) {
      const whole = cut.shots.find((s) => s.id === shot.id)
      expect(shot.durationMs).toBeLessThanOrEqual(whole?.durationMs ?? 0)
      if (shot.durationMs === whole?.durationMs) continue
      const take = shot.take
      if (take?.words === undefined) continue
      expect(take.words.at(-1)?.endMs).toBe(take.outMs)
    }
    const intro = made.shots[0]
    expect(intro?.durationMs).toBeLessThan(cut.shots[0]?.durationMs ?? 0)
    expect(intro?.durationMs).toBeGreaterThanOrEqual(PREVIEW_SHOT_LEAST_MS)
  })

  it("refuses a cut that doesn't open with the locked intro", () => {
    const week = sampleWeek()
    const cut = callCutList(
      week,
      callScenes(week).map(() => null)
    )
    expect(previewOf({ ...cut, shots: cut.shots.slice(1) }).ok).toBe(false)
  })
})
