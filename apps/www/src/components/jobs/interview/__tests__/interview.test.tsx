/**
 * @vitest-environment jsdom
 *
 * The interview week's pages (IW5, IW8; #2936, #3175), each a route, on the
 * simulated microphone and the real take pattern: the Interview page leads
 * with today's question; a question's page offers its rungs at equal weight;
 * the study page shows the ready answer with its notes, another good answer
 * and a poor one, citing the body of work only on a `work` question; a take
 * said from cues shows as said from cues;
 * a read has its own page, counts down, and records with the script still on
 * screen; the look over sends the week home. Nothing on a page answers a take
 * or says what wasn't done.
 */
import { inMemoryStorage } from "@some-ui/core-utils"
import { takeButton } from "@some-ui/voice-capture/testing"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fakePorts, WEEK, WEEK_2 } from "@/lib/interview-week/__tests__/fixture"
import { CUE_SECONDS } from "@/lib/interview-week/cue"
import { INTERVIEW_WORDS as WORDS } from "@/lib/interview-week/words"
import { RoutedInterview } from "@/components/jobs/interview/__tests__/routed"

// The pages are the Android app's alone (AUDIENCES.md A3); tests run another profile.
vi.mock("@/lib/build-profile", () => ({ hasAudience: (): boolean => true }))

const settle = async (ms = 0): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const follow = async (name: string | RegExp): Promise<void> => {
  fireEvent.click(screen.getByRole("link", { name }))
  await settle()
}

const press = async (name: string | RegExp): Promise<void> => {
  fireEvent.click(screen.getByRole("button", { name }))
  await settle()
}

/** Records a take on the page's take button: a tap, talk, a tap. */
async function say(ms = 2_000): Promise<void> {
  const card = document.querySelector<HTMLElement>("[data-card]")
  if (card === null) throw new Error("no take on this page")
  fireEvent.click(takeButton(card))
  await settle(ms)
  fireEvent.click(takeButton(card))
  await settle()
}

beforeEach(() => {
  // jsdom has no scrolling; the router scrolls to the top of each page.
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined)
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-17T18:00:00Z"))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function open(week = WEEK_2, path?: string): void {
  const { ports } = fakePorts({
    storage: inMemoryStorage(),
    week: { week, sha256: "a".repeat(64) },
  })
  render(<RoutedInterview ports={() => ports} path={path} />)
}

const conflict = WEEK_2.questions[1]

describe("the interview week's pages on the phone (IW8)", () => {
  it("climbs today's question, then reads a card and sends the week home", async () => {
    open()
    await settle()

    // The Interview page before anything is said: the way in (IW15), each
    // kind one tap away; Questions leads with today's question.
    screen.getByText(WORDS.wayIn.title)
    screen.getByText(WORDS.wayIn.line(WEEK.role.title, WEEK.company.name))
    expect(screen.queryByText(WORDS.wayIn.soFar)).toBeNull()
    expect(document.body.textContent).not.toMatch(/not said/i)
    await follow(new RegExp(`^${WORDS.questions}`))
    // Questions says the invented role every answer is for.
    screen.getByText(WORDS.role(WEEK.role.title, WEEK.company.name))
    screen.getByText(WEEK.company.about)
    screen.getByText(WEEK.role.about)
    screen.getByText(WORDS.invented)
    await follow(new RegExp(`^${WORDS.today}`))

    // Its page: the four rungs at equal weight.
    for (const step of ["study", "aloud", "cues", "own"] as const) {
      screen.getByRole("link", { name: new RegExp(WORDS.step[step].name) })
    }

    // Studying records nothing, and an open question cites nothing.
    await follow(new RegExp(WORDS.step.study.name))
    screen.getByText(WORDS.study.open)
    screen.getByText(WORDS.study.another)
    screen.getByText(WORDS.study.poor)
    for (const part of conflict.ready?.answer ?? []) {
      screen.getByText(part.note)
    }
    expect(screen.queryByText("some-ui#3170")).toBeNull()
    expect(document.querySelector("[data-card]")).toBeNull()

    // From cues: the cue words, and a take shown as said from cues.
    await follow(WORDS.toQuestion)
    await follow(new RegExp(WORDS.step.cues.name))
    for (const cue of conflict.ready?.cues ?? []) screen.getByText(cue)
    await say()

    await follow(WORDS.toQuestion)
    screen.getByText(WORDS.inItsPlace)
    screen.getByText(
      new RegExp(WORDS.done(WORDS.past.cues, "2026-11-17T18:00:00Z"))
    )

    // Once something is said, the first page lists it, where its take is (IW16).
    await follow(WORDS.toQuestions)
    await follow(WORDS.toInterview)
    screen.getByText(WORDS.role(WEEK.role.title, WEEK.company.name))
    screen.getByText(WORDS.wayIn.soFar)
    screen.getByText(conflict.prompt)
    expect(screen.queryByText(WORDS.wayIn.title)).toBeNull()

    // A read on its own page: the script, its cue, then a take.
    await follow(new RegExp(`^${WORDS.reads}`))
    await follow(new RegExp(`^${WEEK.cards[0].situation}`))
    const script = document.querySelector('[data-script="epic-2931"]')
    expect(script?.textContent).toContain("So I built a week that asks them")
    const card = document.querySelector<HTMLElement>("[data-card]")
    if (card === null) throw new Error("no take on the read's page")
    fireEvent.click(takeButton(card))
    expect(card.textContent).toContain(WORDS.cue(CUE_SECONDS))
    await settle(CUE_SECONDS * 1000)
    await settle(2_000)
    expect(document.querySelector('[data-script="epic-2931"]')).toBe(script)
    // The band moves while the take hears you, and Pause holds it (IW9).
    const lit = (): string | null | undefined =>
      script?.querySelector('[aria-current="true"]')?.getAttribute("data-line")
    expect(lit()).toBe("0")
    await settle(3_000)
    expect(lit()).not.toBe("0")
    fireEvent.click(screen.getByRole("button", { name: WORDS.band.pause }))
    screen.getByText(WORDS.band.paused)
    const held = lit()
    await settle(3_000)
    expect(lit()).toBe(held)
    fireEvent.click(screen.getByRole("button", { name: WORDS.band.goOn }))
    screen.getByRole("button", { name: WORDS.band.pause })
    fireEvent.click(takeButton(card))
    await settle()

    await follow(WORDS.reads)
    screen.getByText(
      new RegExp(WORDS.done(WORDS.past.aloud, "2026-11-17T18:00:00Z"))
    )
    await follow(WORDS.toInterview)
    await press(WORDS.toReview)
    await press(WORDS.send(2))
    screen.getByText(WORDS.sent.title(2))

    // Back on the first page, the send is said, and saying again still open (IW16).
    await press(WORDS.backToWeek)
    screen.getByText(WORDS.wayIn.soFar)
    screen.getByText(WORDS.openUntil(WEEK))
  })

  it("says how a week goes, home named once (IW15)", async () => {
    open(WEEK_2, "/jobs/interview/how")
    await settle()
    for (const { name } of WORDS.how.steps) screen.getByText(name)
    screen.getByText(/Home is your own computer/)
    // The week's takes, in Studio's one Takes (TAKES20), filtered to this week.
    const takes = screen.getByRole("link", { name: /^Hear your takes/ })
    expect(takes.getAttribute("href")).toContain(
      "/journal/takes/interview?about=interview%3A2026-w47"
    )
    await follow(WORDS.toInterview)
    screen.getByText(WORDS.wayIn.title)
  })

  it("cites the body of work on a question about it", async () => {
    open(WEEK_2, "/jobs/interview/q/decision-c266/study")
    await settle()
    screen.getByText(WORDS.study.work)
    expect(screen.getAllByText("some-ui#3170").length).toBeGreaterThan(0)
  })

  it("gives a week written before ready answers its cues from what to cover", async () => {
    open(WEEK, "/jobs/interview/q/conflict/say?rung=cues")
    await settle()
    for (const line of WEEK.questions[1].guidelines) screen.getByText(line)
  })

  it("reads a closed week back, saying when home had no send (IWC1)", async () => {
    vi.setSystemTime(new Date("2026-11-23T12:00:00Z"))
    open()
    await settle()
    screen.getByText(WORDS.closed.title(WEEK_2))
    screen.getByText(WORDS.closed.line(WEEK_2))
    screen.getByText(WORDS.closed.noSend)
  })
})
