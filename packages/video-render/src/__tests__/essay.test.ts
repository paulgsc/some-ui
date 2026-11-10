/**
 * The Rust Rounds essay (RR15, #2690): every pinned version of its format
 * parses and the newest is the code's; the sample essay parses and says its
 * scenes in the essay's order, the same for an answered ticket as for one
 * left unanswered, the owner's bubble lit only for a take; and an essay that
 * contradicts itself is refused with every reason.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parseCutList } from "@video-render/cut-list"
import {
  cellsOf,
  ESSAY_DIVES,
  ESSAY_ID,
  ESSAY_VERSION,
  essayChapterMarks,
  essayCutList,
  essayFormat,
  essayIntro,
  essayScenes,
  essayTakeFiles,
  essayVersionRefusal,
  isPast,
  parseEssay,
  sampleEssay,
} from "@video-render/essay"
import type { Essay, EssayTicket } from "@video-render/essay"
import { parseFormat } from "@video-render/format"
import { versionOfFile } from "@video-render/series"
import { spreadWords } from "@video-render/stills"
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

  it("says, as the sample, that no owner said its answers (C76)", () => {
    const intro = essayIntro(sample(), "sample")
    expect(intro.said).toContain("both voices are synthetic")
    expect(intro.said).not.toContain("the owner's own")
    expect(intro.rows.find((r) => r.label === "Voices")?.says).toContain(
      "a second synthetic voice reads the answers"
    )
    expect(essayScenes(sample(), "sample")[0]?.said).toBe(intro.said)
  })
})

describe("an essay's cut list (RR16)", () => {
  const essay = sample()
  const scenes = essayScenes(essay)
  const takes = scenes.map((scene) =>
    scene.said === ""
      ? null
      : scene.speaker === "you"
        ? { ms: 61_000, owner: true }
        : { ms: 4_000 }
  )
  const cut = essayCutList(essay, takes)

  it("is a cut list the renderer takes, a still per scene", () => {
    expect(parseCutList(cut).ok).toBe(true)
    expect(cut.shots.map((s) => s.id)).toEqual(scenes.map((s) => s.id))
    expect(cut.title).toBe("The Rust Rounds essay, 2026-w46")
  })

  it("plays an owner's take whole, as theirs; every other take is the speaker's", () => {
    for (const [i, shot] of cut.shots.entries()) {
      const scene = scenes[i]
      if (scene?.said === "") continue
      const owner = scene?.speaker === "you"
      expect(shot.take?.outMs).toBe(owner ? 61_000 : 4_000)
      expect(shot.speaker).toBe(owner ? undefined : "kokoro")
    }
    expect(
      cut.shots.filter((s) => s.speaker === undefined && s.take)
    ).toHaveLength(2)
  })

  it("marks a chapter at each ticket and the close's sections", () => {
    expect(essayChapterMarks(essay).map((m) => [m.scene, m.title])).toEqual([
      ...essay.tickets.map((t, i) => [
        `chapter-question-${i + 1}`,
        `${t.id}: ${t.title}`,
      ]),
      ["chapter-weeks", "Over the weeks"],
    ])
  })
})

describe("captions for a take with no word times", () => {
  it("cover the take in order, each word as long as its letters", () => {
    const words = spreadWords("  a borrow   outlives ", 1_700)
    expect(words.map((w) => w.text)).toEqual(["a", "borrow", "outlives"])
    expect(words[0]?.startMs).toBe(0)
    expect(words.at(-1)?.endMs).toBe(1_700)
    for (const [i, word] of words.entries()) {
      expect(word.endMs).toBeGreaterThan(word.startMs)
      if (i > 0) expect(word.startMs).toBe(words[i - 1]?.endMs)
    }
    expect(spreadWords("", 1_000)).toEqual([])
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

describe("the takes home hands the recorder", () => {
  const essay = sample()

  it("are one audio file per answered ticket, with its word times where kept", () => {
    expect(
      essayTakeFiles(essay, [
        "QM-311.m4a",
        "QM-311.words.json",
        "QM-312.webm",
        ".DS_Store",
      ])
    ).toEqual({
      ok: true,
      value: {
        "QM-311": { audio: "QM-311.m4a", words: "QM-311.words.json" },
        "QM-312": { audio: "QM-312.webm", words: null },
      },
    })
  })

  it("are refused with every reason when any is missing, doubled or stray", () => {
    const refused = essayTakeFiles(essay, [
      "QM-311.m4a",
      "QM-311.wav",
      "QM-313.m4a",
      "QM-399.m4a",
      "QM-400.words.json",
    ])
    expect(refused).toEqual({
      ok: false,
      problems: [
        "QM-311: 2 takes (QM-311.m4a, QM-311.wav); one plays",
        "QM-312: answered, and there is no take of it",
        "QM-313.m4a: QM-313 was left silent",
        "QM-399.m4a: names no ticket the essay answers",
        "QM-400.words.json: word times with no take",
      ],
    })
  })
})
