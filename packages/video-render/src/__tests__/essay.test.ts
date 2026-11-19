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
  citeOf,
  ESSAY_DIVES,
  ESSAY_ID,
  ESSAY_POINT_VERSION,
  ESSAY_VERSION,
  essayChapterMarks,
  essayCutList,
  essayFormat,
  essayIntro,
  essayScenes,
  essayTakeFiles,
  essayTakeOf,
  essayVersionRefusal,
  isPast,
  markOf,
  parseEssay,
  pointAnsweredBy,
  sampleEssay,
} from "@video-render/essay"
import type {
  Essay,
  EssayFork,
  EssayPointAnswer,
  EssayTicket,
} from "@video-render/essay"
import { parseFormat } from "@video-render/format"
import { versionOfFile } from "@video-render/series"
import { spreadWords } from "@video-render/stills"
import { hearingOf, UNHEARD_SAID } from "@video-render/verdict"
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
        "Borrows into a reused buffer: in 2026-w40 it came back lower than 2026-w41, which isn't earlier",
        "Short: it has 1 cells for 6 weeks",
        "next: 2026-w45 doesn't come after 2026-w46",
      ],
    })
  })
})

describe("the chart's cells", () => {
  const weeks = [
    "2026-w41",
    "2026-w42",
    "2026-w43",
    "2026-w44",
    "2026-w45",
    "2026-w46",
  ]

  it("mark a plain level below an earlier column's as decay, as a version 1 essay draws it", () => {
    expect(cellsOf(["unmet", 4, "unmet", 3, "silent", 5], weeks, 1)).toEqual([
      { kind: "unmet", since: false },
      { kind: "level", level: 4, known: true, decayed: null },
      { kind: "unmet", since: true },
      { kind: "level", level: 3, known: false, decayed: "2026-w42" },
      { kind: "silent" },
      { kind: "level", level: 5, known: true, decayed: null },
    ])
  })

  it("say an empty week after a silence wasn't checked, not that it isn't met", () => {
    expect(cellsOf(["silent", "unmet"], weeks, 2)).toEqual([
      { kind: "silent" },
      { kind: "unmet", since: true },
    ])
  })

  it("draw the record's decay and fading as it names them (RR19)", () => {
    expect(
      cellsOf(
        [4, "faded", "faded", { level: 3, below: "2026-w41" }, 2],
        weeks,
        2
      )
    ).toEqual([
      { kind: "level", level: 4, known: true, decayed: null },
      { kind: "faded" },
      { kind: "faded" },
      { kind: "level", level: 3, known: false, decayed: "2026-w41" },
      // In version 2 only the record names decay.
      { kind: "level", level: 2, known: false, decayed: null },
    ])
  })

  it("are refused where only version 2 draws them, or name a week that isn't earlier", () => {
    const essay = sample()
    const concepts = [
      {
        name: "Drop order",
        cells: [
          4,
          "faded",
          "unmet",
          "unmet",
          "unmet",
          { level: 2, below: "2026-w46" },
        ],
      },
    ]
    const v1 = parseEssay({
      ...essay,
      template: { ...essay.template, version: 1 },
      weeks: { ...essay.weeks, concepts },
    })
    expect(v1.ok ? [] : v1.problems).toEqual([
      "Drop order: decay and fading are drawn from version 2 of the template",
      "Drop order: in 2026-w46 it came back lower than 2026-w46, which isn't earlier",
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
        "QM-399.m4a: names no ticket or point the essay answers",
        "QM-400.words.json: word times with no take",
      ],
    })
  })

  it("set aside, unplayed, a take home couldn't make out (HEARD2)", () => {
    const [first, ...rest] = essay.tickets
    if (first === undefined) throw new Error("a ticket")
    const unheard: Essay = {
      ...essay,
      tickets: [{ ...first, answer: UNHEARD }, ...rest],
    }
    expect(
      essayTakeFiles(unheard, [
        "QM-311.m4a",
        "QM-311.words.json",
        "QM-312.webm",
      ])
    ).toEqual({
      ok: true,
      value: { "QM-312": { audio: "QM-312.webm", words: null } },
    })
  })
})

/** A ticket's take home couldn't make out (HEARD2): a silence that says so. */
const UNHEARD: EssayTicket["answer"] = {
  kind: "silence",
  opened: 1,
  unheard: true,
}

describe("a take home couldn't make out (HEARD2; EH1)", () => {
  const essay = sample()
  const [first, ...rest] = essay.tickets
  if (first === undefined) throw new Error("a ticket")
  const withAnswer = (answer: unknown): ReturnType<typeof parseEssay> =>
    parseEssay({ ...essay, tickets: [{ ...first, answer }, ...rest] })

  it("is a silence that says so in code's words, with no guess", () => {
    const parsed = withAnswer(UNHEARD)
    if (!parsed.ok) throw new Error(parsed.problems.join("; "))
    const said = essayScenes(parsed.value).find(
      (scene) => scene.section === "answer" && scene.ticket === first.id
    )
    expect(said).toMatchObject({ speaker: "tutor", said: UNHEARD_SAID })
  })

  it("carries a guess or says it couldn't be made out, never both or neither", () => {
    for (const answer of [
      { kind: "silence", opened: 1, unheard: true, guess: "A guess." },
      { kind: "silence", opened: 1 },
    ])
      expect(withAnswer(answer).ok).toBe(false)
  })
})

describe("home's verdict on a transcript (HEARD1)", () => {
  const of = (kind: unknown): ReturnType<typeof hearingOf> =>
    hearingOf({
      verdict: { kind, reasons: [], rule: "heard-1", signals: null },
    })

  it("is heard, a silence, or couldn't be made out, by its kind", () => {
    expect(of("heard")).toBe("heard")
    expect(of("nothing_said")).toBe("silent")
    for (const kind of ["garbled", "failed", "a-kind-from-later"])
      expect(of(kind)).toBe("unheard")
  })

  it("reads as heard when the transcript carries none, as before HEARD1", () => {
    expect(hearingOf({ text: "words" })).toBe("heard")
    expect(hearingOf({ verdict: null })).toBe("heard")
  })
})

/**
 * RR24 (#3248): a speak-to point answered by a take of its own. A week of
 * whole-ticket takes renders as before; a mixed week cites each point's own
 * take where there is one; a point's take with no file is refused.
 */
describe("a point answered by a take of its own (RR24)", () => {
  const v3 = (essay: Essay): Essay => ({
    ...essay,
    template: { ...essay.template, version: ESSAY_POINT_VERSION },
  })

  /** The sample at version 3: QM-311 one old whole take, QM-312 answered only point by point, QM-313 a silence with point 2 its own take. */
  function mixed(): unknown {
    const essay = v3(sample())
    const [first, second, third] = essay.tickets
    if (!first || !second || !third) throw new Error("three tickets")
    const take = (
      mark: "covered" | "partly",
      level: number
    ): EssayPointAnswer => ({
      kind: "take" as const,
      transcript: `Point said at ${mark}.`,
      mark: { mark },
      solo: { level, why: "One reason." },
    })
    return {
      ...essay,
      tickets: [
        first,
        {
          ...second,
          answer: { kind: "silence", opened: 2 },
          points: [
            { ...second.points[0]!, answer: take("partly", 3) },
            { ...second.points[1]!, answer: take("partly", 2) },
            {
              ...second.points[2]!,
              answer: { kind: "silence", opened: 2, unheard: true },
            },
          ],
        },
        {
          ...third,
          points: [
            third.points[0]!,
            { ...third.points[1]!, answer: take("covered", 4) },
          ],
        },
      ],
    }
  }

  function parsed(raw: unknown): Essay {
    const read = parseEssay(raw)
    if (!read.ok) throw new Error(read.problems.join("; "))
    return read.value
  }

  it("leaves a week of whole-ticket takes as it was, at any version", () => {
    const essay = sample()
    for (const each of [essay, v3(essay)]) {
      const scenes = essayScenes(each)
      expect(scenes.map((s) => s.id)).toEqual(
        essayScenes(essay).map((s) => s.id)
      )
      expect(scenes.map(essayTakeOf).filter(Boolean)).toEqual([
        "QM-311",
        "QM-312",
      ])
    }
  })

  it("plays each point's own take after the ticket's, citing the right take per point", () => {
    const essay = parsed(mixed())
    const answers = essayScenes(essay).filter((s) => s.section === "answer")
    expect(
      answers.map((s) => [
        s.id,
        s.ticket,
        "point" in s ? s.point : undefined,
        s.speaker,
        essayTakeOf(s),
      ])
    ).toEqual([
      ["answer-1", "QM-311", undefined, "you", "QM-311"],
      ["answer-2", "QM-312", 0, "you", "QM-312.1"],
      ["answer-3", "QM-312", 1, "you", "QM-312.2"],
      ["answer-4", "QM-312", 2, "tutor", null],
      ["answer-5", "QM-313", undefined, "tutor", null],
      ["answer-6", "QM-313", 1, "you", "QM-313.2"],
    ])
    expect(answers[3]?.said).toBe(UNHEARD_SAID)
    const [first, second, third] = essay.tickets
    if (!first || !second || !third) throw new Error("three tickets")
    expect([0, 1, 2].map((i) => pointAnsweredBy(first, i).by)).toEqual([
      "whole",
      "whole",
      "whole",
    ])
    expect([0, 1, 2].map((i) => markOf(second, i)?.mark)).toEqual([
      "partly",
      "partly",
      undefined,
    ])
    expect([0, 1].map((i) => pointAnsweredBy(third, i).by)).toEqual([
      "whole",
      "own",
    ])
    expect(essayIntro(essay).rows.at(-1)?.says).toBe("3 of 3 tickets")
    // The beside table cites the take each point was judged from.
    expect([0, 1, 2].map((i) => citeOf(first, i))).toEqual([null, null, null])
    expect([0, 1, 2].map((i) => citeOf(second, i))).toEqual([
      "own",
      "own",
      "own",
    ])
    expect([0, 1].map((i) => citeOf(third, i))).toEqual([null, "own"])
    expect(
      essayTakeFiles(essay, [
        "QM-311.m4a",
        "QM-312.1.webm",
        "QM-312.1.words.json",
        "QM-312.2.ogg",
        "QM-312.3.m4a",
        "QM-313.2.m4a",
      ])
    ).toEqual({
      ok: true,
      value: {
        "QM-311": { audio: "QM-311.m4a", words: null },
        "QM-312.1": {
          audio: "QM-312.1.webm",
          words: "QM-312.1.words.json",
        },
        "QM-312.2": { audio: "QM-312.2.ogg", words: null },
        "QM-313.2": { audio: "QM-313.2.m4a", words: null },
      },
    })
  })

  it("refuses a point's take with no file, and a take of a point that answers nothing on its own", () => {
    expect(
      essayTakeFiles(parsed(mixed()), [
        "QM-311.m4a",
        "QM-311.2.m4a",
        "QM-312.1.webm",
        "QM-313.m4a",
        "QM-313.2.m4a",
      ])
    ).toEqual({
      ok: false,
      problems: [
        "QM-312.2: answered, and there is no take of it",
        "QM-311.2.m4a: names no ticket or point the essay answers",
        "QM-313.m4a: QM-313 was left silent",
      ],
    })
  })

  it("is drawn from version 3, and a ticket answered only by points answers every point", () => {
    const raw = parsed(mixed())
    const old = parseEssay({
      ...raw,
      template: { ...raw.template, version: 2 },
    })
    expect(old.ok ? [] : old.problems).toEqual([
      "QM-312: a point answered by a take of its own is drawn from version 3 of the template",
      "QM-313: a point answered by a take of its own is drawn from version 3 of the template",
    ])
    const [first, second, third] = raw.tickets
    if (!first || !second || !third) throw new Error("three tickets")
    const short = parseEssay({
      ...raw,
      tickets: [
        first,
        {
          ...second,
          points: [
            second.points[0]!,
            second.points[1]!,
            { to: "x", best: "y" },
          ],
        },
        third,
      ],
    })
    expect(short.ok ? [] : short.problems).toEqual([
      "QM-312: its silence carries no guess at why, and a point has no answer of its own",
    ])
  })
})

/**
 * RR29 (#3257): a point as a fork. Every option, and a hidden best, set
 * against the week's stated constraints by id; a judgement placed between A
 * and A′. Each way a fork can move a goalpost is refused.
 */
describe("a point as a fork (RR29)", () => {
  const stated = [
    { id: "S1", says: "p99 under 2 ms per record" },
    { id: "F1", says: "40,000 records a second" },
    { id: "F2", says: "one core" },
  ]
  const fork = (): EssayFork => ({
    options: [
      {
        id: "A",
        recommended: true,
        decision: "Clone each field into a String.",
        model: { id: "owned-is-safe", name: "Owning is always safe" },
        meets: ["F2"],
        breaks: ["S1"],
      },
      {
        id: "B",
        recommended: false,
        decision: "Borrow slices of the buffer and reuse it.",
        model: { id: "borrow-reuse", name: "Borrow, then reuse" },
        meets: ["S1", "F1"],
        breaks: [],
      },
    ],
    best: { kind: "option", option: "B" },
    said: "Two options; the second meets the SLA.",
  })
  const withFork = (each: unknown, version = 4): unknown => {
    const essay = sample()
    const [first, ...rest] = essay.tickets
    if (first === undefined) throw new Error("a ticket")
    return {
      ...essay,
      template: { ...essay.template, version },
      tickets: [
        {
          ...first,
          stated,
          points: first.points.map((point, i) =>
            i === 0 ? { ...point, fork: each } : point
          ),
        },
        ...rest,
      ],
    }
  }
  const problems = (raw: unknown): ReadonlyArray<string> => {
    const read = parseEssay(raw)
    return read.ok ? [] : read.problems
  }

  it("is drawn in a fork scene after the beside scene, from version 4", () => {
    const read = parseEssay(withFork(fork()))
    if (!read.ok) throw new Error(read.problems.join("; "))
    const ids = essayScenes(read.value).map((s) => s.id)
    expect(
      ids.slice(ids.indexOf("beside-1"), ids.indexOf("beside-1") + 3)
    ).toEqual(["beside-1", "fork-1", "dive-1"])
    expect(problems(withFork(fork(), 3))).toEqual([
      "QM-311: a fork, or 1 to 6 points, is drawn from version 4 of the template",
    ])
  })

  it("takes a hidden best whose advantage is a stated constraint", () => {
    const hidden: EssayFork = {
      ...fork(),
      best: {
        kind: "hidden",
        decision: "Parse in place with an arena per batch.",
        why: "It meets the rate on one core too.",
        model: { id: "arena", name: "An arena per batch" },
        meets: ["S1", "F1", "F2"],
        breaks: [],
      },
    }
    expect(problems(withFork(hidden))).toEqual([])
  })

  it("refuses every way a fork moves a goalpost", () => {
    const [a, b] = fork().options
    if (!a || !b) throw new Error("two options")
    const cases: ReadonlyArray<[EssayFork, string]> = [
      [
        { ...fork(), options: [{ ...a, meets: ["S9"] }, b] },
        "QM-311 fork 1: A names S9, which the week doesn't state",
      ],
      [
        { ...fork(), options: [a, { ...b, recommended: true }] },
        "QM-311 fork 1: 2 options are recommended; exactly one is",
      ],
      [
        { ...fork(), options: [{ ...a, breaks: ["F2"] }, b] },
        "QM-311 fork 1: A both meets and breaks a constraint",
      ],
      [
        {
          ...fork(),
          options: [
            { ...a, refused: { code: "E0204", why: "Label holds a String." } },
            b,
          ],
        },
        "QM-311 fork 1: A doesn't build, so it meets and breaks nothing",
      ],
      [
        { ...fork(), best: { kind: "option", option: "C" } },
        "QM-311 fork 1: the best is C, which isn't listed",
      ],
      [
        {
          ...fork(),
          best: {
            kind: "hidden",
            decision: "Something nobody listed.",
            why: "It is faster, somehow.",
            model: { id: "x", name: "X" },
            meets: ["S1"],
            breaks: [],
          },
        },
        "QM-311 fork 1: the hidden best is no better than B on any stated constraint, so its advantage over B isn't stated",
      ],
      [
        {
          ...fork(),
          judged: {
            decision: { kind: "recommended-by-default" },
            verdict: { kind: "off", why: "A breaks the SLA." },
            placement: "reasoned",
          },
        },
        "QM-311 fork 1: a recommended-by-default decision isn't placed reasoned",
      ],
      [
        {
          ...fork(),
          judged: {
            decision: { kind: "option", option: "B" },
            verdict: { kind: "close", why: "Near." },
            placement: "departed",
          },
        },
        "QM-311 fork 1: the verdict says close, and the decision is the best",
      ],
    ]
    for (const [each, why] of cases)
      expect(problems(withFork(each))).toEqual([why])
    const { best: _, ...nameless } = fork()
    expect(problems(withFork(nameless))).not.toEqual([])
    const read = parseEssay(withFork(fork()))
    if (!read.ok) throw new Error("the fork reads")
    const [first] = read.value.tickets
    if (first === undefined) throw new Error("a ticket")
    const { stated: __, ...unstated } = first
    expect(
      problems({
        ...read.value,
        tickets: [unstated, ...read.value.tickets.slice(1)],
      })
    ).toContain(
      "QM-311: its forks trade on stated constraints, and it names none"
    )
  })

  it("takes an option that doesn't build as one, which a hidden best beats", () => {
    const [a, b] = fork().options
    if (!a || !b) throw new Error("two options")
    const refused: EssayFork = {
      ...fork(),
      options: [
        {
          ...a,
          meets: [],
          breaks: [],
          refused: { code: "E0204", why: "Label holds a String." },
        },
        b,
      ],
      best: {
        kind: "hidden",
        decision: "Borrow, and keep the buffer.",
        why: "It meets the rate too.",
        model: { id: "borrow", name: "Borrow" },
        meets: ["S1", "F1", "F2"],
        breaks: [],
      },
    }
    expect(problems(withFork(refused))).toEqual([])
  })

  it("holds a hidden best and a judgement to the rest of RR29's rules", () => {
    const [a, b] = fork().options
    if (!a || !b) throw new Error("two options")
    const hidden = {
      kind: "hidden" as const,
      decision: "Borrow, and keep the buffer.",
      why: "It breaks nothing.",
      model: { id: "borrow", name: "Borrow" },
      meets: ["S1", "F1"],
      breaks: [],
    }
    // B meets the same ids but breaks F2: avoiding it is a stated advantage.
    const avoids: EssayFork = {
      ...fork(),
      options: [a, { ...b, breaks: ["F2"] }],
      best: { ...hidden, meets: ["S1", "F1", "F2"] },
    }
    expect(problems(withFork(avoids))).toEqual([])
    const breaksLess: EssayFork = {
      ...fork(),
      options: [
        { ...a, meets: [] },
        { ...b, breaks: ["F2"] },
      ],
      best: hidden,
    }
    expect(problems(withFork(breaksLess))).toEqual([])
    const refusedBest: EssayFork = {
      ...avoids,
      best: {
        ...hidden,
        meets: [],
        refused: { code: "E0505", why: "It moves the buffer." },
      },
    }
    expect(problems(withFork(refusedBest))).toContain(
      "QM-311 fork 1: the hidden best is no better than A on any stated constraint, so its advantage over A isn't stated"
    )
    const judged = (
      decision: unknown,
      verdict: string,
      placement: string
    ): ReadonlyArray<string> =>
      problems(
        withFork({
          ...fork(),
          judged: {
            decision,
            verdict: { kind: verdict, why: "Why." },
            placement,
          },
        })
      )
    expect(judged({ kind: "option", option: "A" }, "off", "trusted")).toEqual([
      "QM-311 fork 1: a option decision isn't placed trusted",
    ])
    expect(judged({ kind: "option", option: "A" }, "off", "reasoned")).toEqual(
      []
    )
    expect(judged({ kind: "own", decision: "Mine." }, "best", "own")).toEqual([
      "QM-311 fork 1: the verdict says best, and the best is the listed B, not their own",
    ])
  })

  it("takes a judgement whose decision, verdict and place agree", () => {
    const judged: EssayFork = {
      ...fork(),
      judged: {
        decision: { kind: "recommended-by-default" },
        verdict: { kind: "off", why: "A breaks S1." },
        placement: "trusted",
      },
    }
    expect(problems(withFork(judged))).toEqual([])
  })
})

describe("a ticket of one point (version 4)", () => {
  it("takes one deep dive, not two", () => {
    const essay = sample()
    const [first, ...rest] = essay.tickets
    if (first === undefined) throw new Error("a ticket")
    const one = (dives: EssayTicket["dives"]): unknown => ({
      ...essay,
      template: { ...essay.template, version: 4 },
      tickets: [
        {
          ...first,
          points: first.points.slice(0, 1),
          answer:
            first.answer.kind === "take"
              ? { ...first.answer, marks: first.answer.marks.slice(0, 1) }
              : first.answer,
          dives,
        },
        ...rest,
      ],
    })
    const dive = { ...first.dives[0]!, point: 0 }
    expect(parseEssay(one([dive])).ok).toBe(true)
    const two = parseEssay(one([dive, dive]))
    expect(two.ok ? [] : two.problems).toContain(
      "QM-311: it has 2 deep dives; its points take 1"
    )
  })
})
