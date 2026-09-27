import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { LessonSurvey } from "@topik/lib/topik/core/lesson-survey"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SurveyCard } from "."

afterEach(cleanup)

const candidate = {
  batchId: 1,
  probeId: "c1-request-forms",
  prompt: "Which is NOT a valid transformation?",
  source: "아이스 아메리카노 한 잔 주세요.",
}

const click = (name: string | RegExp): void => {
  fireEvent.click(screen.getByRole("button", { name }))
}

describe("SurveyCard", () => {
  it("leaves out the blocking question when nothing was missed", () => {
    const onSubmit = vi.fn<(survey: LessonSurvey) => void>()
    render(
      <SurveyCard
        candidates={[]}
        short={false}
        onSubmit={onSubmit}
        onSkip={vi.fn()}
      />
    )
    expect(screen.getByText(/1 of 4/)).toBeTruthy()
    click("Somewhat")
    click("About right")
    expect(screen.getByText("How keen are you for the next one?")).toBeTruthy()
    click("Running out of steam")
    click("Done")
    expect(onSubmit).toHaveBeenCalledWith({
      worthwhile: "somewhat",
      difficulty: "right",
      enthusiasm: "drained",
      stuck: [],
    })
  })

  it("skips a question without ending the survey, but 'Not now' ends it", () => {
    const onSkip = vi.fn()
    const onSubmit = vi.fn<(survey: LessonSurvey) => void>()
    render(
      <SurveyCard
        candidates={[candidate]}
        short={false}
        onSubmit={onSubmit}
        onSkip={onSkip}
      />
    )
    click("Yes, worth it")
    click("Skip") // difficulty
    expect(screen.getByText("Was anything blocking you?")).toBeTruthy()
    // Toggling twice leaves nothing chosen.
    click(/아이스 아메리카노/)
    click(/아이스 아메리카노/)
    click("Nothing was blocking")
    click("Skip") // enthusiasm
    click("Done")
    expect(onSubmit).toHaveBeenCalledWith({ worthwhile: "yes", stuck: [] })
    expect(onSkip).not.toHaveBeenCalled()

    cleanup()
    render(
      <SurveyCard
        candidates={[candidate]}
        short={false}
        onSubmit={onSubmit}
        onSkip={onSkip}
      />
    )
    click("Not now")
    expect(onSkip).toHaveBeenCalledOnce()
  })
})
