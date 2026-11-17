/**
 * @vitest-environment jsdom
 *
 * The interview week's pages (IW5, IW8; #2936, #3175), each a route, on the
 * simulated microphone and the real take pattern: the Interview page leads
 * with today's question; a question's page offers its rungs at equal weight;
 * the study page shows the ready answer with its notes, another good answer
 * and a poor one, citing the body of work only on a `work` question; a take
 * said from cues is marked with its rung and its first goes home on its own;
 * a read has its own page, counts down, and records with the script still on
 * screen; the look over sends the week home. A week written before ready
 * answers offers the last two rungs only. Nothing on a page answers a take
 * or says what wasn't done.
 */
import { inMemoryStorage } from "@some-ui/core-utils"
import { takeButton } from "@some-ui/voice-capture/testing"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fakePorts, WEEK, WEEK_2 } from "@/lib/interview-week/__tests__/fixture"
import { CUE_SECONDS } from "@/lib/interview-week/cue"
import type { InterviewWeekPorts } from "@/lib/interview-week/runtime"
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

function open(
  week = WEEK_2,
  path?: string
): { release: ReturnType<typeof vi.fn>; ports: InterviewWeekPorts } {
  const { ports } = fakePorts({
    storage: inMemoryStorage(),
    week: { week, sha256: "a".repeat(64) },
  })
  const release = vi.fn(ports.takes.release)
  const wired = { ...ports, takes: { ...ports.takes, release } }
  render(<RoutedInterview ports={() => wired} path={path} />)
  return { release, ports: wired }
}

const conflict = WEEK_2.questions[1]

describe("the interview week's pages on the phone (IW8)", () => {
  it("climbs today's question, then reads a card and sends the week home", async () => {
    const { release } = open()
    await settle()

    // The Interview page: the invented role, and today's question as one tap.
    screen.getByText(WORDS.role(WEEK.role.title, WEEK.company.name))
    screen.getByText(WORDS.invented)
    expect(document.body.textContent).not.toMatch(/not said/i)
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

    // From cues: the cue words, a take marked with its rung, gone home first.
    await follow(WORDS.toQuestion)
    await follow(new RegExp(WORDS.step.cues.name))
    for (const cue of conflict.ready?.cues ?? []) screen.getByText(cue)
    await say()
    expect(release).toHaveBeenCalledTimes(1)

    await follow(WORDS.toQuestion)
    screen.getByText(WORDS.inItsPlace)
    screen.getByText(
      new RegExp(WORDS.done(WORDS.past.cues, "2026-11-17T18:00:00Z"))
    )

    // A read on its own page: the script, its cue, then a take.
    await follow(WORDS.toInterview)
    await follow(WORDS.reads)
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
    fireEvent.click(takeButton(card))
    await settle()
    // A read's take waits for Send.
    expect(release).toHaveBeenCalledTimes(1)

    await follow(WORDS.toReads)
    await follow(WORDS.toInterview)
    await press(WORDS.toReview)
    await press(WORDS.send(2))
    screen.getByText(WORDS.sent.title(2))
  })

  it("cites the body of work on a question about it", async () => {
    open(WEEK_2, "/jobs/interview/q/decision-c266/study")
    await settle()
    screen.getByText(WORDS.study.work)
    expect(screen.getAllByText("some-ui#3170").length).toBeGreaterThan(0)
  })

  it("offers a week written before ready answers its last two rungs only", async () => {
    open(WEEK, "/jobs/interview/q/conflict")
    await settle()
    expect(
      screen
        .getAllByRole("link")
        .map((link) => link.textContent)
        .filter((text) =>
          Object.values(WORDS.step).some(({ name }) => text.includes(name))
        )
    ).toEqual([
      expect.stringContaining(WORDS.step.cues.name),
      expect.stringContaining(WORDS.step.own.name),
    ])
  })
})
