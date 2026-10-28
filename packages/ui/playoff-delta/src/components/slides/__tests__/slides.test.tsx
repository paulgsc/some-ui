/**
 * Every slide of every week of the bundled season renders, so a bye, the
 * exit week and the weeks after it are drawn, and so does a week the team
 * goes out (the bundled season has none, so one is made from its first), and
 * every slide of the legend.
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

  it("says the week out is a dead end, marked as a proof", () => {
    const [week] = OUT.weeks
    if (!week) throw new Error("no week")
    render(<SLIDES.verdict season={OUT} week={week} />)
    expect(screen.getByText("Dead end.").className).toContain("pd-proof")
    screen.getByText(/No way in is left\./)
  })

  it("says a week past the exit was not followed", () => {
    const after = SAMPLE_SEASON.weeks.at(-1)
    if (!after) throw new Error("no weeks")
    render(<SLIDES.verdict season={SAMPLE_SEASON} week={after} />)
    screen.getByText(/We stopped watching after week 15/)
  })
})

describe("the podium", () => {
  it("lists tied medalists a line each, and still says our place", () => {
    const tied = SAMPLE_SEASON.weeks.find((w) => w.podium.medals.length > 3)
    if (!tied) throw new Error("the bundled season has no tied podium")
    render(<SLIDES.podium season={SAMPLE_SEASON} week={tied} />)
    for (const m of tied.podium.medals) screen.getByText(m.team)
    screen.getByText(/^SF$/)
  })
})

describe("the legend", () => {
  it.each(LEGEND_SLIDES)("%s renders, with a voiceover line", (id) => {
    const Slide = LEGEND[id]
    render(<Slide />).unmount()
    expect(legendLine(id)).not.toBe("")
  })
})
