/**
 * @vitest-environment jsdom
 *
 * The desktop web's reading of the Jobs wing: one morning's run from the
 * sample digest, each pick with its scores and résumé, the postings set
 * aside, and the source a click away.
 */

import { sampleDigest } from "@some-ui/job-desk/sample"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { JobRun } from "@/components/job-run"

const SAMPLE = sampleDigest()

afterEach(cleanup)

describe("JobRun", () => {
  it("reads every pick, every posting set aside and every scout", () => {
    render(<JobRun />)
    for (const pick of SAMPLE.picks) {
      expect(
        screen.getByText(new RegExp(`^${pick.posting.company} · `))
      ).toBeTruthy()
      expect(screen.getAllByText(pick.scores.fitWhy).length).toBeGreaterThan(0)
    }
    for (const aside of SAMPLE.setAside) {
      expect(screen.getByText(aside.why)).toBeTruthy()
    }
    for (const scout of SAMPLE.scouts) {
      expect(screen.getByText(scout.note)).toBeTruthy()
    }
  })

  it("says what a patch would change, and what goes out until it lands", () => {
    render(<JobRun />)
    for (const { resume } of SAMPLE.picks) {
      if (resume.kind !== "patch") continue
      expect(
        screen.getByText(
          `${resume.change} Until it lands, it sends ${resume.fallback} · ${resume.template}.`
        )
      ).toBeTruthy()
    }
    expect(SAMPLE.picks.some((pick) => pick.resume.kind === "patch")).toBe(true)
  })

  it("links each part of the run to its source", () => {
    render(<JobRun />)
    const link = screen.getByRole("link", { name: /ROUTINE\.md/ })
    expect(link.getAttribute("href")).toBe(
      "https://github.com/paulgsc/some-ui/blob/main/packages/job-desk/ROUTINE.md"
    )
  })
})
