import type { DramaSession, SessionEvent } from "@topik/lib/topik/core/drama"
import {
  canGoBack,
  coverShown,
  crossroadsOf,
  momentOf,
  openSession,
  panelsOf,
  rungOf,
  stepSession,
  whyOpen,
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

  it("keeps a beat read while muted at its Hangul once sound returns", () => {
    const muted = play([advance, { type: "back" }], false)
    const unmuted = stepSession(lesson, muted, {
      type: "audible",
      audible: true,
    }).session
    // s1-l1 was reached, then left by going back: it stays read too.
    expect(rungOf(lesson, unmuted, "s1-l1")).toBe(1)
    expect(rungOf(lesson, unmuted, "s1-n1")).toBe(1)
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

describe("why", () => {
  it("is its own state, which no id in the tree can share", () => {
    // A tree may name a beat anything, `c1:why` included.
    const session = play([{ type: "reveal", id: "c1:why" }])
    expect(session.whys).toEqual({})
    const opened = stepSession(lesson, session, {
      type: "why",
      choice: "c1",
      option: "b",
    })
    expect(opened.session.whys).toEqual({ c1: { b: true } })
    expect(rungOf(lesson, opened.session, "c1")).toBe(1)
  })

  it("opens for the candidate asked about, not every candidate at that choice", () => {
    const choose = (option: string): Array<SessionEvent> => [
      advance,
      advance,
      { type: "choose", option },
    ]
    const restart: SessionEvent = { type: "restart" }
    const asked: SessionEvent = { type: "why", choice: "c1", option: "b" }
    const other = play([...choose("b"), asked, restart, ...choose("a")])
    expect(whyOpen(other, "c1", "a")).toBe(false)
    const again = play([...choose("b"), asked, restart, ...choose("b")])
    expect(whyOpen(again, "c1", "b")).toBe(true)
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

  it("opens a child scene on the chosen line, then the answer to it, and only then the cover", () => {
    const chosen = [advance, advance, { type: "choose", option: "b" } as const]
    const entered = play(chosen)
    expect(coverShown(lesson, entered)).toBe(false)
    const [past, line, answer] = panelsOf(lesson, entered)
    expect(past).toMatchObject({ kind: "past", chosen: undefined })
    expect(line).toMatchObject({
      kind: "chosen",
      speaker: "seoyeon",
      chosen: {
        choice: "c1",
        candidate: { id: "b", text: "응, 마실래." },
        swallowed: false,
      },
    })
    expect(answer).toMatchObject({ kind: "line", id: "s3-l1", feeling: null })
    expect(coverShown(lesson, play([...chosen, advance]))).toBe(true)
  })

  it("stops a one-beat leaf on that beat, with no cover before its ending", () => {
    const repaired = play([
      advance,
      advance,
      { type: "choose", option: "b" },
      advance,
      advance,
      { type: "choose", option: "x" },
      advance,
    ])
    expect(
      panelsOf(lesson, repaired)
        .map(({ kind }) => kind)
        .slice(-4)
    ).toEqual(["chosen", "line", "ending", "notes"])
  })

  it("draws an odd-one-out's pick as swallowed, never said", () => {
    const odd = structuredClone(lesson)
    if (odd.root.choice) odd.root.choice.check.kind = "odd-one-out"
    const session = [
      advance,
      advance,
      { type: "choose", option: "b" } as const,
    ].reduce(
      (at, event) => stepSession(odd, at, event).session,
      openSession(odd, true).session
    )
    expect(panelsOf(odd, session)[1]).toMatchObject({
      kind: "chosen",
      chosen: { swallowed: true },
    })
  })

  it("marks where a resumed drama picks up, until it moves", () => {
    const left = play([advance, advance, { type: "choose", option: "b" }])
    const resumed = openSession(lesson, true, left.drama).session
    expect(panelsOf(lesson, resumed).map(({ kind }) => kind)).toContain(
      "resume"
    )
    const moved = stepSession(lesson, resumed, advance).session
    expect(panelsOf(lesson, moved).map(({ kind }) => kind)).not.toContain(
      "resume"
    )
    expect(
      openSession(lesson, true, play([advance]).drama).session.resumed
    ).toBe(false)
  })

  it("closes a leaf on its ending, in the leaf's feeling", () => {
    const session = play([
      advance,
      advance,
      { type: "choose", option: "c" },
      advance,
      advance,
    ])
    expect(panelsOf(lesson, session).at(-2)).toMatchObject({
      kind: "ending",
      feeling: "cringe",
    })
  })

  it("follows the ending with the author's notes: each choice the route made, and why", () => {
    const session = play([
      advance,
      advance,
      { type: "choose", option: "b" },
      advance,
      advance,
      { type: "choose", option: "x" },
      advance,
    ])
    const notes = panelsOf(lesson, session).at(-1)
    expect(notes?.kind).toBe("notes")
    expect(
      notes?.kind === "notes"
        ? notes.notes.map(({ choice, candidate }) => [choice, candidate.id])
        : []
    ).toEqual([
      ["c1", "b"],
      ["c2", "x"],
    ])
    // Each told as what happened: what it answered, and what it led to.
    expect(notes?.kind === "notes" ? notes.notes[1] : undefined).toMatchObject({
      trigger: { id: "s3-l1" },
      reaction: { id: "s4-l1" },
    })
    expect(crossroadsOf(lesson, session).map(({ depth }) => depth)).toEqual([
      0, 1,
    ])
  })

  it("names a scene as its moment, not by its place: its title, else its first words", () => {
    expect(momentOf(lesson, "s3")).toBe("반말")
    const untitled = structuredClone(lesson)
    delete untitled.root.title
    expect(momentOf(untitled, "s1")).toBe(lesson.root.beats[0]?.text)
    expect(momentOf(lesson, "nowhere")).toBeUndefined()
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
