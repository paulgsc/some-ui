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
import { TAKE_WORDS } from "@some-ui/voice-capture"
import { takeButton } from "@some-ui/voice-capture/testing"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  fakePorts,
  OPENING_CARD_OF_WEEK,
  WEEK,
  WEEK_2,
  WEEK_2_OPENED,
} from "@/lib/interview-week/__tests__/fixture"
import { CUE_SECONDS } from "@/lib/interview-week/cue"
import { pastWeeks } from "@/lib/interview-week/past"
import { DEFAULT_PACE_WPM, PACE_STEP_WPM } from "@/lib/interview-week/prompter"
import type { InterviewWeekPorts } from "@/lib/interview-week/runtime"
import type { InterviewSent } from "@/lib/interview-week/spec"
import { readItem } from "@/lib/interview-week/spec"
import { interviewSent } from "@/lib/interview-week/store"
import { INTERVIEW_WORDS as WORDS } from "@/lib/interview-week/words"
import { RoutedInterview } from "@/components/jobs/interview/__tests__/routed"
import type { PastWeeksProps } from "@/components/jobs/interview/past"
import { labelOf } from "@/components/jobs/interview/run"

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
  path?: string,
  past?: PastWeeksProps,
  homeSent?: InterviewWeekPorts["homeSent"]
): void {
  const { ports } = fakePorts({
    storage: inMemoryStorage(),
    week: { week, sha256: "a".repeat(64) },
  })
  render(
    <RoutedInterview
      ports={() => ({ ...ports, homeSent })}
      path={path}
      past={past}
    />
  )
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
    // Today's question carries the number the look over gives it.
    const todayIs = WORDS.questionLabel(2)
    await follow(new RegExp(`^${WORDS.today(todayIs)}`))

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
    // The button it starts from counts in, so the two never disagree.
    expect(takeButton(card).textContent).toBe(
      TAKE_WORDS.button.counting(CUE_SECONDS)
    )
    // The line under the script shows it too, where a retry replaces the button.
    expect(card.textContent).toContain(
      `${TAKE_WORDS.button.counting(CUE_SECONDS)}. ${WORDS.cueLine}`
    )
    await settle(CUE_SECONDS * 1000)
    await settle(2_000)
    expect(document.querySelector('[data-script="epic-2931"]')).toBe(script)
    // The band moves while the take hears you, and Pause holds it (IW9).
    const lit = (): string | null | undefined =>
      script?.querySelector('[aria-current="true"]')?.getAttribute("data-line")
    expect(lit()).toBe("0")
    // The first line's eleven words take about 4 s at the band's pace.
    await settle(6_000)
    expect(lit()).not.toBe("0")
    fireEvent.click(screen.getByRole("button", { name: WORDS.band.pause }))
    screen.getByText(WORDS.band.paused)
    const held = lit()
    await settle(3_000)
    expect(lit()).toBe(held)
    fireEvent.click(screen.getByRole("button", { name: WORDS.band.goOn }))
    screen.getByRole("button", { name: WORDS.band.pause })
    // Faster sets the band's pace a step up, and says it (C734).
    screen.getByText(WORDS.band.pace(DEFAULT_PACE_WPM))
    fireEvent.click(screen.getByRole("button", { name: WORDS.band.faster }))
    screen.getByText(WORDS.band.pace(DEFAULT_PACE_WPM + PACE_STEP_WPM))
    // Ending the take leaves the script where the band left it, and where a
    // hand scrolled it ahead of the band (PB1).
    const read = lit()
    const view = script?.querySelector("[data-scroll-intent]")
    if (!(view instanceof HTMLElement)) throw new Error("no script window")
    view.scrollTop = 500
    fireEvent.click(takeButton(card))
    await settle()
    expect(lit()).toBe(read)
    expect(view.scrollTop).toBe(500)
    // Nor does turning the phone after it.
    fireEvent(window, new Event("resize"))
    expect(view.scrollTop).toBe(500)

    await follow(WORDS.reads)
    screen.getByText(
      new RegExp(WORDS.done(WORDS.past.aloud, "2026-11-17T18:00:00Z"))
    )
    await follow(WORDS.toInterview)
    await press(WORDS.toReview)
    // The look over names today's question as its card did, and the read by its kind.
    screen.getByText(todayIs)
    screen.getByText(WORDS.readLabel(1))
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

  it("lists past weeks with where each essay is (IW17)", async () => {
    const week = (n: number): typeof WEEK => ({ ...WEEK, id: `2026-w${n}` })
    const askAgain = vi.fn()
    open(WEEK_2, "/jobs/interview", {
      weeks: [
        {
          week: week(46),
          sent: {
            week: "2026-w46",
            at: "2026-11-14T18:00:00Z",
            answers: [
              {
                question: "conflict",
                take: "t1",
                recordedAt: "2026-11-14T18:00:00Z",
              },
            ],
            reads: [],
            passed: [],
            passedReads: [],
          },
          essay: { kind: "ready", key: "2026-w46" },
        },
        { week: week(45), sent: null, essay: { kind: "failed" } },
        { week: week(44), sent: null, essay: { kind: "making" } },
        {
          week: week(43),
          sent: null,
          essay: { kind: "expected" },
        },
        { week: week(42), sent: null, essay: { kind: "unknown" } },
      ],
      askAgain,
    })
    await settle()
    // The first page, before anything is said, opens Past weeks.
    await follow(new RegExp(`^${WORDS.weeks.title}`))
    screen.getByText(WORDS.weeks.sent(1, "2026-11-14T18:00:00Z"))
    const watch = screen.getByRole("link", { name: /^Watch its essay/ })
    expect(watch.getAttribute("href")).toBe(
      "/journal/episodes/interview-essay/2026-w46"
    )
    const renders = screen.getByRole("link", { name: /^Open Renders/ })
    expect(renders.getAttribute("href")).toBe("/journal/renders")
    screen.getByText(WORDS.weeks.essay.making)
    screen.getByText(WORDS.weeks.essay.expected)
    screen.getByText(WORDS.weeks.essay.unknown)
    expect(screen.getAllByText(WORDS.weeks.noSend)).toHaveLength(4)
    // Each week's takes, in Studio's one Takes.
    const takes = screen.getAllByRole("link", { name: /^Hear your takes/ })
    expect(takes[1]?.getAttribute("href")).toContain(
      "about=interview%3A2026-w45"
    )
    await press(WORDS.weeks.tryAgain)
    expect(askAgain).toHaveBeenCalledOnce()
  })

  it("says so when no week has closed yet (IW17)", async () => {
    // The week open now is no past week.
    const weeks = pastWeeks(
      [{ week: WEEK_2, sha256: "a" }],
      [],
      "2026-11-17T18:00:00Z",
      { kind: "read", episodes: [] },
      null
    )
    expect(weeks).toEqual([])
    open(WEEK_2, "/jobs/interview/past", { weeks, askAgain: null })
    await settle()
    screen.getByText(WORDS.weeks.none)
  })

  it("cites the body of work on a question about it", async () => {
    open(WEEK_2, "/jobs/interview/q/decision-c266/study")
    await settle()
    screen.getByText(WORDS.study.work)
    expect(screen.getAllByText("some-ui#3170").length).toBeGreaterThan(0)
  })

  it("lists the essay's opening first in Read aloud, and reads it as any card (IW10)", async () => {
    open(WEEK_2_OPENED, "/jobs/interview/reads")
    await settle()
    const links = screen.getAllByRole("link").map((link) => link.textContent)
    const first = links.findIndex((text) => text.startsWith(WORDS.opening))
    const read = links.findIndex((text) =>
      text.startsWith(WEEK_2.cards[0].situation)
    )
    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThan(read)
    screen.getByText("I'm paulgsc.")
    await follow(new RegExp(`^${WORDS.opening}`))
    const script = document.querySelector(
      `[data-script="${OPENING_CARD_OF_WEEK.id}"]`
    )
    expect(script?.textContent).toContain("one more week of it")
    expect(labelOf(WEEK_2_OPENED, readItem(OPENING_CARD_OF_WEEK.id))).toBe(
      WORDS.opening
    )
    expect(labelOf(WEEK_2_OPENED, readItem(WEEK_2.cards[0].id))).toBe(
      WORDS.readLabel(1)
    )
  })

  it("gives a week written before ready answers its cues from what to cover", async () => {
    open(WEEK, "/jobs/interview/q/conflict/say?rung=cues")
    await settle()
    for (const line of WEEK.questions[1].guidelines) screen.getByText(line)
  })

  it("reads a closed week back, saying when home had no send (IWC1)", async () => {
    vi.setSystemTime(new Date("2026-11-23T12:00:00Z"))
    open(WEEK_2, undefined, undefined, () =>
      Promise.resolve({ kind: "none" as const })
    )
    await settle()
    screen.getByText(WORDS.closed.title(WEEK_2))
    screen.getByText(WORDS.closed.line(WEEK_2))
    screen.getByText(WORDS.closed.noSend)
  })

  it("says nothing of what home had when its record can't be read (RR30)", async () => {
    // A reinstalled phone keeps no send of its own: only home can say.
    vi.setSystemTime(new Date("2026-11-23T12:00:00Z"))
    open(WEEK_2, undefined, undefined, () =>
      Promise.resolve({ kind: "unknown" as const })
    )
    await settle()
    screen.getByText(WORDS.closed.title(WEEK_2))
    expect(screen.queryByText(WORDS.closed.noSend)).toBeNull()
  })
})

/**
 * RR30's family on the interview's read-back: the link's memory (held,
 * lost) × home's record (names the phone's send, names another, none,
 * unheard), with sends kept on this phone.
 */
describe("a closed interview week reads back on home's word (RR30)", () => {
  const sentAt = (at: string): InterviewSent => ({
    week: WEEK_2.id,
    at,
    answers: [
      {
        question: WEEK_2.questions[0].id,
        take: `take-${at}`,
        recordedAt: at,
      },
    ],
    reads: [],
    passed: WEEK_2.questions.slice(1).map(({ id }) => id),
    passedReads: [],
  })
  // Saturday's send, then one after it, both before the deadline.
  const SAT = "2026-11-21T19:00:00.000Z"
  const SUN = "2026-11-22T20:00:00.000Z"
  const ELSEWHERE = "2026-11-22T21:00:00.000Z"

  function openClosed(
    remembers: boolean,
    said: Awaited<ReturnType<NonNullable<InterviewWeekPorts["homeSent"]>>>
  ): void {
    vi.setSystemTime(new Date("2026-11-23T12:00:00Z"))
    const storage = inMemoryStorage()
    interviewSent(storage).keep(() => [sentAt(SAT), sentAt(SUN)])
    const { ports } = fakePorts({
      storage,
      week: { week: WEEK_2, sha256: "a".repeat(64) },
      // The link's memory: it held Saturday's send, or forgot both.
      homeHolds: (sent) => remembers && sent.at === SAT,
      homeSent: () => Promise.resolve(said),
    })
    render(<RoutedInterview ports={() => ports} />)
  }

  const text = (): string => document.body.textContent

  for (const remembers of [true, false]) {
    const memory = remembers ? "held" : "lost"

    it(`counts the send home names, and says a later one was late (memory ${memory})`, async () => {
      openClosed(remembers, { kind: "sent", at: SAT })
      await settle()
      screen.getByText(WORDS.closed.held(1))
      screen.getByText(WORDS.closed.late(SUN))
    })

    it(`says home had none on home's word, over the memory (memory ${memory})`, async () => {
      openClosed(remembers, { kind: "none" })
      await settle()
      screen.getByText(WORDS.closed.noSend)
      screen.getByText(WORDS.closed.late(SUN))
    })

    it(`names a send home holds that isn't on this phone, and counts none (memory ${memory})`, async () => {
      openClosed(remembers, { kind: "sent", at: ELSEWHERE })
      await settle()
      screen.getByText(WORDS.closed.elsewhere(ELSEWHERE, SUN))
      expect(text()).not.toContain(WORDS.closed.held(1))
      expect(text()).not.toContain(WORDS.closed.late(SUN))
    })

    it(`says nothing of what home had when unheard (memory ${memory})`, async () => {
      openClosed(remembers, { kind: "unknown" })
      await settle()
      screen.getByText(WORDS.closed.unheard(SUN))
      expect(text()).not.toContain(WORDS.closed.held(1))
      expect(text()).not.toContain(WORDS.closed.noSend)
      expect(text()).not.toContain(WORDS.closed.late(SUN))
    })
  }
})
