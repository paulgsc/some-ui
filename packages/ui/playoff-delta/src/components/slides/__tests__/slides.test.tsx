/**
 * Every slide of every week of the bundled season renders, the bye included,
 * and so does a week with no seat left (the bundled season has none, so one
 * is made from its first), and every slide of the legend.
 */
import { LEGEND, SLIDES } from "@playoff-delta/components/slides"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import {
  LEGEND_SLIDES,
  legendLine,
  narration,
  slidesFor,
} from "@playoff-delta/lib/slides"
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
      poles: {
        ...first.poles,
        after: { ...first.poles.after, seeds: { best: null, worst: null } },
      },
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
      for (const id of slidesFor()) {
        const Slide = SLIDES[id]
        render(<Slide season={season} week={week} />).unmount()
        expect(narration(season, week, id), id).not.toBe("")
      }
    }
  )

  it("says a week with no seat left is a dead end, marked as a proof", () => {
    const [week] = OUT.weeks
    if (!week) throw new Error("no week")
    render(<SLIDES.ladder season={OUT} week={week} />)
    expect(screen.getByText("Dead end").className).toContain("pd-proof")
  })

  it("names the bloc that forces our division's floor", () => {
    render(<SLIDES.division season={SAMPLE_SEASON} week={first} />)
    screen.getByText(/LAR, SEA and ARI: 2 wins banked and 6 games left/)
  })
})

describe("the legend", () => {
  it.each(LEGEND_SLIDES)("%s renders, with a voiceover line", (id) => {
    const Slide = LEGEND[id]
    render(<Slide season={SAMPLE_SEASON} />).unmount()
    expect(legendLine(SAMPLE_SEASON, id)).not.toBe("")
  })
})
