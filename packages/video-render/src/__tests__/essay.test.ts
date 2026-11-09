/**
 * The Rust Rounds essay (RR15, #2690): every pinned version of its format
 * parses and the newest is the code's; the sample essay parses and says its
 * scenes in the essay's order, the same for an answered ticket as for one
 * left unanswered, the owner's bubble lit only for a take; and an essay that
 * contradicts itself is refused with every reason.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  cellsOf,
  ESSAY_DIVES,
  ESSAY_ID,
  ESSAY_VERSION,
  essayFormat,
  essayIntro,
  essayScenes,
  essayVersionRefusal,
  isPast,
  parseEssay,
  sampleEssay,
} from "@video-render/essay"
import type { Essay, EssayTicket } from "@video-render/essay"
import { parseFormat } from "@video-render/format"
import { versionOfFile } from "@video-render/series"
import { describe, expect, it } from "vitest"

const DIR = join(import.meta.dirname, "../templates", ESSAY_ID)

function sample(): Essay {
  const parsed = sampleEssay()
  if (!parsed.ok) throw new Error(parsed.problems.join("; "))
  return parsed.value
}

/** `ticket`, left unanswered. */
const silent = (ticket: EssayTicket): EssayTicket => ({
  ...ticket,
  answer: { kind: "silence", opened: 0, guess: "You didn't open it." },
})

/** `ticket`, answered with every point covered. */
const covered = (ticket: EssayTicket): EssayTicket => ({
  ...ticket,
  answer: {
    kind: "take",
    transcript: "All of it.",
    marks: ticket.points.map(() => ({ mark: "covered" as const })),
    solo: { level: 4, why: "One reason." },
  },
})

/** A ticket's scenes, in order, for ticket `n` from 1 whose dives start at `d` from 1. */
const ticketIds = (n: number, d: number): Array<string> => [
  `chapter-question-${n}`,
  `question-${n}`,
  `answer-${n}`,
  `best-${n}`,
  `beside-${n}`,
  ...Array.from({ length: ESSAY_DIVES }, (_, k) => `dive-${d + k}`),
]

describe("the essay's format", () => {
  it("every pinned version parses, and the newest is the code's", () => {
    const pinned = readdirSync(DIR)
      .map((file) => ({ file, version: versionOfFile(file) }))
      .filter((f): f is { file: string; version: number } => f.version !== null)
      .sort((a, b) => a.version - b.version)
    expect(pinned.map((p) => p.version)).toEqual(
      Array.from({ length: ESSAY_VERSION }, (_, i) => i + 1)
    )
    for (const { file, version } of pinned) {
      const raw: unknown = JSON.parse(readFileSync(join(DIR, file), "utf8"))
      expect(parseFormat(raw).ok).toBe(true)
      expect(raw).toEqual(essayFormat(version))
    }
  })

  it("refuses a version newer than the newest (VS1)", () => {
    expect(essayVersionRefusal(ESSAY_VERSION)).toBe(null)
    expect(() => essayFormat(ESSAY_VERSION + 1)).toThrow(
      essayVersionRefusal(ESSAY_VERSION + 1) ?? ""
    )
    const parsed = parseEssay({
      ...sample(),
      template: { id: ESSAY_ID, version: ESSAY_VERSION + 1 },
    })
    expect(parsed.ok ? [] : parsed.problems).toEqual([
      `template.version: newer than this build knows: it draws up to version ${String(ESSAY_VERSION)}, so publish a newer stage first`,
    ])
  })
})

describe("the sample essay", () => {
  it("says its scenes in the essay's order, a group per ticket", () => {
    expect(essayScenes(sample()).map((s) => s.id)).toEqual([
      "intro",
      "brand-in",
      "open",
      ...ticketIds(1, 1),
      ...ticketIds(2, 3),
      ...ticketIds(3, 5),
      "chapter-weeks",
      "weeks",
      "next",
      "brand-out",
    ])
  })

  it("keeps that order for answered and unanswered tickets alike", () => {
    const essay = sample()
    const order = essayScenes(essay).map((s) => s.id)
    for (const each of [silent, covered]) {
      const changed = { ...essay, tickets: essay.tickets.map(each) }
      expect(parseEssay(changed).ok).toBe(true)
      expect(essayScenes(changed).map((s) => s.id)).toEqual(order)
    }
  })

  it("plays the owner's take as its transcript, and says the guess over a silence", () => {
    const essay = sample()
    const answers = essayScenes(essay).filter((s) => s.section === "answer")
    expect(answers.map((s) => [s.speaker, s.said])).toEqual(
      essay.tickets.map((t) =>
        t.answer.kind === "take"
          ? ["you", t.answer.transcript]
          : ["tutor", t.answer.guess]
      )
    )
    expect(
      essayScenes(essay)
        .filter((s) => s.section !== "answer")
        .every((s) => s.speaker === "tutor")
    ).toBe(true)
  })

  it("goes past the ticket only on a point the answer covered", () => {
    const [first, second, third] = sample().tickets
    expect(first?.dives.map((d) => isPast(first, d))).toEqual([false, true])
    expect(second?.dives.map((d) => isPast(second, d))).toEqual([false, false])
    expect(third?.dives.map((d) => isPast(third, d))).toEqual([false, false])
  })

  it("opens on the locked intro, filled by code from the essay alone", () => {
    const intro = essayIntro(sample())
    expect(intro.rows.at(-1)?.says).toBe("2 of 3 tickets")
    expect(intro.said).toContain("the other voice is the owner's own")
  })
})

describe("an essay that contradicts itself", () => {
  it("is refused, with every reason", () => {
    const essay = sample()
    const [first, second, third] = essay.tickets
    if (!first || !second || !third) throw new Error("three tickets")
    const bad = {
      ...essay,
      week: { ...essay.week, from: "2026-11-16" },
      tickets: [
        first,
        {
          ...second,
          id: first.id,
          // The covered point 1 gets a dive while point 3, missing, gets none.
          answer:
            second.answer.kind === "take"
              ? {
                  ...second.answer,
                  marks: [
                    { mark: "partly" },
                    { mark: "covered" },
                    { mark: "missing" },
                  ],
                }
              : second.answer,
          dives: [
            { ...second.dives[0]!, point: 0 },
            { ...second.dives[1]!, point: 1 },
          ],
        },
        {
          ...third,
          dives: [third.dives[0]!, { ...third.dives[1]!, point: 0 }],
        },
        {
          ...first,
          id: "QM-314",
          answer: {
            kind: "take",
            transcript: "All of it.",
            marks: [{ mark: "covered" }],
            solo: { level: 4, why: "One reason." },
          },
          dives: [first.dives[0]!, { ...first.dives[1]!, point: 5 }],
        },
      ],
      weeks: {
        ...essay.weeks,
        weeks: [...essay.weeks.weeks.slice(0, -1), "2026-w40"],
        concepts: [...essay.weeks.concepts, { name: "Short", cells: [1] }],
      },
      next: { ...essay.next, week: "2026-w45" },
    }
    expect(parseEssay(bad)).toEqual({
      ok: false,
      problems: [
        "week: it ends before it starts",
        "tickets: two share an id",
        "QM-311: point 3 has a bigger gap than a deep dive's, and no deep dive",
        "QM-313: two deep dives go into the same point",
        "QM-314: its answer marks 1 points, and it has 3",
        "QM-314: a deep dive goes into a point it doesn't have",
        "weeks: the chart doesn't end on 2026-w46",
        "weeks: they aren't oldest first, each once",
        "Short: it has 1 cells for 6 weeks",
        "next: 2026-w45 doesn't come after 2026-w46",
      ],
    })
  })
})

describe("the chart's cells", () => {
  it("mark decay where a level comes back lower than an earlier one", () => {
    expect(cellsOf([4, "unmet", 3, "silent", 5, 4])).toEqual([
      { kind: "level", level: 4, decayed: false },
      { kind: "unmet" },
      { kind: "level", level: 3, decayed: true },
      { kind: "silent" },
      { kind: "level", level: 5, decayed: false },
      { kind: "level", level: 4, decayed: true },
    ])
  })
})
