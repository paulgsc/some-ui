/**
 * Every slide of every week of the bundled season renders, so a bye, the
 * week the team is out, a boundary and a week without one are all drawn.
 *
 * PDS3: the path slide says what its field is: one way in, among possibly
 * others, with the rest of the league as that way has it; a team the way
 * lets finish above is shown with no record required; no line claims a best
 * or worst case. Family: every week of the bundled season (a path, none, and
 * free teams), slide and voiceover.
 */
import { SLIDES } from "@playoff-delta/components/slides"
import { Path } from "@playoff-delta/components/slides/week"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { narration, slidesFor } from "@playoff-delta/lib/slides"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

const OVERCLAIMS = /as bad as (they|it) could|worst possible|best possible/i

describe("every slide of the bundled season", () => {
  it.each(SAMPLE_SEASON.weeks.map((w) => [w.week, w] as const))(
    "week %i renders",
    (_, week) => {
      for (const id of slidesFor(week)) {
        const Slide = SLIDES[id]
        const view = render(<Slide season={SAMPLE_SEASON} week={week} />)
        expect(view.container.textContent, id).not.toBe("")
        expect(narration(SAMPLE_SEASON, week, id), id).not.toBe("")
        view.unmount()
      }
    }
  )
})

describe("the path's words (PDS3)", () => {
  it.each(SAMPLE_SEASON.weeks.map((w) => [w.week, w] as const))(
    "week %i",
    (_, week) => {
      const view = render(<Path season={SAMPLE_SEASON} week={week} />)
      expect(view.container.textContent).not.toMatch(OVERCLAIMS)
      if (week.path) screen.getByText(/One way:/)
      const free = week.path?.needs.filter((n) => n.free).length ?? 0
      expect(screen.queryAllByText(/can finish above us/)).toHaveLength(free)
      view.unmount()
      expect(narration(SAMPLE_SEASON, week, "path")).not.toMatch(OVERCLAIMS)
    }
  )
})
