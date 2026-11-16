/**
 * @vitest-environment jsdom
 *
 * The interview week's screen (IW5, #2936), on the simulated microphone and
 * the real take pattern: the brief names the invented role and says to answer
 * for it; a question's card shows its target length; a read's card shows its
 * script, counts down, then records with the script still on screen; the look
 * over sends the week home. Nothing on the screen answers.
 */
import { inMemoryStorage } from "@some-ui/core-utils"
import { takeButton } from "@some-ui/voice-capture/testing"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fakePorts, WEEK } from "@/lib/interview-week/__tests__/fixture"
import { CUE_SECONDS } from "@/lib/interview-week/cue"
import { INTERVIEW_WORDS as WORDS } from "@/lib/interview-week/words"
import { InterviewWeekScreen } from "@/components/jobs/interview"

const press = (name: string | RegExp): void => {
  fireEvent.click(screen.getByRole("button", { name }))
}

const settle = async (ms = 0): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-17T18:00:00Z"))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("the interview week on the phone (IW5)", () => {
  it("answers a question, reads a card after its cue, and sends the week home", async () => {
    const storage = inMemoryStorage()
    render(<InterviewWeekScreen ports={fakePorts({ storage }).ports} />)
    await settle()

    // The brief: the invented role, and the note to answer for it.
    screen.getByText(WORDS.role(WEEK.role.title, WEEK.company.name))
    screen.getByText(WORDS.invented)

    // A question: its target length, and one take.
    press(/^Tell me about a time you disagreed/)
    const asked = screen.getByRole("region", { name: WORDS.cardOf(2, 6) })
    expect(asked.textContent).toContain(WORDS.aim(120))
    fireEvent.click(takeButton(asked))
    await settle(2_000)
    fireEvent.click(takeButton(asked))
    await settle()

    // A read: its script, a cue, then a take with the script still there.
    fireEvent.click(screen.getByRole("button", { name: WORDS.dot.open(5) }))
    const read = screen.getByRole("region", { name: WORDS.cardOf(5, 6) })
    const script = read.querySelector('[data-script="epic-2931"]')
    expect(script?.textContent).toContain("So I built a week that asks them")
    fireEvent.click(takeButton(read))
    expect(read.textContent).toContain(WORDS.cue(CUE_SECONDS))
    await settle(CUE_SECONDS * 1000)
    await settle(2_000)
    expect(read.querySelector('[data-script="epic-2931"]')).toBe(script)
    fireEvent.click(takeButton(read))
    await settle()

    press(WORDS.toReview)
    press(WORDS.send(2))
    await settle()
    screen.getByText(WORDS.sent.title(2))
  })
})
