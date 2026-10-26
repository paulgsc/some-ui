/**
 * PDS3: the path and rivals slides, slide and voiceover, say what their
 * fields are. The path is one way in, not the only one and not a best case
 * (the rest of the league plays itself, so it cannot all lose); a rival's
 * third claim is each break reversed, not the worst possible, and no
 * percentage divides the claims' sort order. Family: every week of the
 * bundled season, so a path and none, rivals whose breaks mattered and
 * whose did not.
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
      if (week.path) expect(screen.getByText(/One way:/)).toBeInTheDocument()
      path.unmount()

      const rivals = render(<Rivals season={SAMPLE_SEASON} week={week} />)
      expect(rivals.container.textContent).not.toMatch(OVERCLAIMS)
      expect(screen.queryAllByText("each break reversed")).toHaveLength(
        week.rivals.length
      )
      rivals.unmount()

      for (const id of ["path", "rivals"] as const)
        expect(narration(SAMPLE_SEASON, week, id)).not.toMatch(OVERCLAIMS)
    }
  )
})
