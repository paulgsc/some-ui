/**
 * Every slide of every week of the bundled season renders, so a bye, a
 * boundary and a week without one are drawn, and so does a week the team
 * goes out (the bundled season has none, so one is made from its last).
 *
 * PDS3: the path slide says what its field is: one way in, among possibly
 * others, with the rest of the league as that way has it; a team the way
 * lets finish above is shown with no record required; no line claims a best
 * or worst case. Family: every week of the bundled season (free teams and
 * not) and the week out (no path), slide and voiceover.
 */
import { SLIDES } from "@playoff-delta/components/slides"
import { Path } from "@playoff-delta/components/slides/week"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { narration, slidesFor } from "@playoff-delta/lib/slides"
import type { StoryWeek } from "@playoff-delta/lib/story"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

const OVERCLAIMS = /as bad as (they|it) could|worst possible|best possible/i

const last = SAMPLE_SEASON.weeks.at(-1)
if (!last) throw new Error("no weeks")
const OUT: StoryWeek = {
  ...last,
  paths: { ...last.paths, after: last.paths.after.map(() => null) },
  path: null,
  boundary: null,
}
const WEEKS = [
  ...SAMPLE_SEASON.weeks.map((w) => [w.week, w] as const),
  [0, OUT] as const,
]

describe("every slide of the bundled season", () => {
  it.each(WEEKS)("week %i renders, with a voiceover line", (_, week) => {
    for (const id of slidesFor(week)) {
      const Slide = SLIDES[id]
      render(<Slide season={SAMPLE_SEASON} week={week} />).unmount()
      expect(narration(SAMPLE_SEASON, week, id), id).not.toBe("")
    }
  })

  it("says the week out is over", () => {
    render(<SLIDES.after season={SAMPLE_SEASON} week={OUT} />)
    screen.getByText("Absorbed.")
  })
})

describe("the path's words (PDS3)", () => {
  it.each(WEEKS)("week %i", (_, week) => {
    const view = render(<Path season={SAMPLE_SEASON} week={week} />)
    expect(view.container.textContent).not.toMatch(OVERCLAIMS)
    screen.getByText(week.path ? /One way:/ : /No path left/)
    const free = week.path?.needs.filter((n) => n.free).length ?? 0
    expect(screen.queryAllByText(/can finish above us/)).toHaveLength(free)
    view.unmount()
    expect(narration(SAMPLE_SEASON, week, "path")).not.toMatch(OVERCLAIMS)
  })
})
