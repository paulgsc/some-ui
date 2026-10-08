import type { DramaSession, SessionEvent } from "@topik/lib/topik/core/drama"
import {
  canGoBack,
  openSession,
  panelsOf,
  rungOf,
  stepSession,
} from "@topik/lib/topik/core/drama"
import { workedLesson } from "@topik/lib/topik/generation/tree-intake/worked-example"
import { describe, expect, it } from "vitest"

const lesson = workedLesson()

const play = (events: Array<SessionEvent>, audio = true): DramaSession =>
  events.reduce(
    (session, event) => stepSession(lesson, session, event).session,
    openSession(lesson, audio).session
  )

const advance: SessionEvent = { type: "advance" }

describe("the ladder", () => {
  it("climbs a heard line from audio to Hangul to gloss, and stops there", () => {
    const reveal: SessionEvent = { type: "reveal", id: "s1-l1" }
    expect(rungOf(lesson, play([]), "s1-l1")).toBe(0)
    expect(rungOf(lesson, play([reveal]), "s1-l1")).toBe(1)
    expect(rungOf(lesson, play([reveal, reveal]), "s1-l1")).toBe(2)
    expect(rungOf(lesson, play([reveal, reveal, reveal]), "s1-l1")).toBe(2)
  })

  it("starts at Hangul without audio, and for a prompt or a caption", () => {
    expect(rungOf(lesson, play([], false), "s1-l1")).toBe(1)
    expect(rungOf(lesson, play([]), "c1")).toBe(1)
    expect(rungOf(lesson, play([]), "s1")).toBe(1)
  })

  it("keeps every gloss one rung away while a choice is open (Rem. 4.12)", () => {
    const atChoice = play([advance, advance, { type: "reveal", id: "s1-l1" }])
    expect(atChoice.drama.at).toEqual({ kind: "choice" })
    const glossed = stepSession(lesson, atChoice, {
      type: "reveal",
      id: "s1-l1",
    }).session
    expect(rungOf(lesson, glossed, "s1-l1")).toBe(2)
  })
})

describe("panelsOf", () => {
  it("opens the root on its cover, then its beats as they are reached", () => {
    expect(panelsOf(lesson, play([])).map(({ kind }) => kind)).toEqual([
      "cover",
      "narration",
    ])
    expect(
      panelsOf(lesson, play([advance, advance])).map(({ kind }) => kind)
    ).toEqual(["cover", "narration", "line", "choice"])
  })

  it("puts the chosen line, as the POV's, before the child's cover", () => {
    const session = play([advance, advance, { type: "choose", option: "b" }])
    const [chosen, cover] = panelsOf(lesson, session)
    expect(chosen).toMatchObject({
      kind: "chosen",
      speaker: "seoyeon",
      chosen: { choice: "c1", candidate: { id: "b", text: "응, 마실래." } },
    })
    expect(cover).toMatchObject({ kind: "cover", feeling: "chill" })
  })

  it("closes a leaf on its ending, in the leaf's feeling", () => {
    const session = play([
      advance,
      advance,
      { type: "choose", option: "c" },
      advance,
      advance,
    ])
    expect(panelsOf(lesson, session).at(-1)).toMatchObject({
      kind: "ending",
      feeling: "cringe",
    })
  })
})

describe("canGoBack", () => {
  it("is false at a scene's first beat, so back never crosses a choice", () => {
    expect(canGoBack(lesson, play([]))).toBe(false)
    expect(canGoBack(lesson, play([advance]))).toBe(true)
    const child = play([advance, advance, { type: "choose", option: "a" }])
    expect(canGoBack(lesson, child)).toBe(false)
    expect(stepSession(lesson, child, { type: "back" }).session).toBe(child)
  })
})

describe("openSession", () => {
  it("resumes a point that resolves, and opens the root otherwise", () => {
    const left = play([advance, advance, { type: "choose", option: "b" }])
    expect(openSession(lesson, true, left.drama).session.drama).toEqual(
      left.drama
    )
    expect(
      openSession(lesson, true, { ...left.drama, route: ["nope"] }).session
        .drama.route
    ).toEqual([])
  })
})
