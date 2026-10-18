/**
 * @vitest-environment jsdom
 *
 * The desktop web's reading of the Jobs wing: one morning's run from the
 * sample digest, each pick with its scores and résumé, the postings set
 * aside, and the source a click away.
 */

import { SAMPLE_DIGEST } from "@some-ui/job-desk"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { JobRun } from "@/components/job-run"

afterEach(cleanup)

describe("JobRun", () => {
  it("reads every pick, every posting set aside and every scout", () => {
    render(<JobRun />)
    for (const pick of SAMPLE_DIGEST.picks) {
      expect(
        screen.getByText(new RegExp(`^${pick.posting.company} · `))
      ).toBeTruthy()
      expect(screen.getAllByText(pick.scores.fitWhy).length).toBeGreaterThan(0)
    }
    for (const aside of SAMPLE_DIGEST.setAside) {
      expect(screen.getByText(aside.why)).toBeTruthy()
    }
    for (const scout of SAMPLE_DIGEST.scouts) {
      expect(screen.getByText(scout.note)).toBeTruthy()
    }
  })

  it("links each part of the run to its source", () => {
    render(<JobRun />)
    const link = screen.getByRole("link", { name: /ROUTINE\.md/ })
    expect(link.getAttribute("href")).toBe(
      "https://github.com/paulgsc/some-ui/blob/main/packages/job-desk/ROUTINE.md"
    )
  })
})
