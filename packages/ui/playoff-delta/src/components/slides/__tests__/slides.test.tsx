/**
 * Every slide of every week of the bundled season renders, so a bye, the
 * exit week and the weeks after it are drawn, and so does a week the team
 * goes out (the bundled season has none, so one is made from its first).
 */
import { SLIDES } from "@playoff-delta/components/slides"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { narration, slidesFor } from "@playoff-delta/lib/slides"
import type { StorySeason } from "@playoff-delta/lib/story"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

const first = SAMPLE_SEASON.weeks[0]
if (!first) throw new Error("no weeks")
const OUT: StorySeason = {
  ...SAMPLE_SEASON,
  weeks: [
    {
      ...first,
      paths: { ...first.paths, after: first.paths.after.map(() => null) },
      share: { ...first.share, after: 0 },
    },
  ],
}

const CASES = [
  ...SAMPLE_SEASON.weeks.map((w) => [w.week, SAMPLE_SEASON, w] as const),
  [0, OUT, OUT.weeks[0] ?? first] as const,
]

describe("every slide of the bundled season", () => {
  it.each(CASES)(
    "week %i renders, with a voiceover line",
    (_, season, week) => {
      for (const id of slidesFor(week)) {
        const Slide = SLIDES[id]
        render(<Slide season={season} week={week} />).unmount()
        expect(narration(season, week, id), id).not.toBe("")
      }
    }
  )

  it("says the week out is the exit", () => {
    const [week] = OUT.weeks
    if (!week) throw new Error("no week")
    render(<SLIDES.verdict season={OUT} week={week} />)
    screen.getByText("Exit.")
    screen.getByText(/No way in is left\./)
  })

  it("says a week past the exit was not followed", () => {
    const after = SAMPLE_SEASON.weeks.at(-1)
    if (!after) throw new Error("no weeks")
    render(<SLIDES.verdict season={SAMPLE_SEASON} week={after} />)
    screen.getByText(/We stopped following after week 15/)
  })
})
