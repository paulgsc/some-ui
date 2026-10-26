/**
 * PDS3: the path and rivals slides say what their fields are. The path is
 * one way in, among possibly others, with the rest of the league as that way
 * has it; a rival's third claim is each break it got reversed together; no
 * line claims a best case, a worst case or a percentage. Family: every week
 * of the bundled season, so a path and none, rivals whose breaks mattered
 * and whose did not.
 */
import { Rivals } from "@playoff-delta/components/slides/close"
import { Path } from "@playoff-delta/components/slides/week"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { narration } from "@playoff-delta/lib/slides"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

const OVERCLAIMS = /as bad as (they|it) could|worst possible|%/i

describe("the path and rivals words (PDS3)", () => {
  it.each(SAMPLE_SEASON.weeks.map((w) => [w.week, w] as const))(
    "week %i",
    (_, week) => {
      const path = render(<Path season={SAMPLE_SEASON} week={week} />)
      expect(path.container.textContent).not.toMatch(OVERCLAIMS)
      if (week.path) screen.getByText(/One way:/)
      path.unmount()

      const rivals = render(<Rivals season={SAMPLE_SEASON} week={week} />)
      expect(rivals.container.textContent).not.toMatch(OVERCLAIMS)
      expect(screen.queryAllByText("each break reversed")).toHaveLength(
        week.rivals.length
      )
      rivals.unmount()

      expect(narration(SAMPLE_SEASON, week, "path")).not.toMatch(OVERCLAIMS)
    }
  )
})
