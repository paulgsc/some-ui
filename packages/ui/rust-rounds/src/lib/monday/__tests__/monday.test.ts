import ROUTINE from "@rust-rounds-root/ROUTINE.md?raw"
import { recordOf } from "@rust-rounds/lib/decay"
import type { RustcRun } from "@rust-rounds/lib/formats"
import { RustcRunSchema } from "@rust-rounds/lib/formats"
import type { ForkOption } from "@rust-rounds/lib/formats/week"
import { WeekV2Schema } from "@rust-rounds/lib/formats/week"
import type { MailboxFile, Prepared } from "@rust-rounds/lib/monday/bundle"
import {
  ESSAYS_MOST,
  judgedWeek,
  openingOf,
  prepare,
} from "@rust-rounds/lib/monday/bundle"
import {
  DIVE_WORDS_LEAST,
  DIVE_WORDS_MOST,
  finish,
  seedLine,
} from "@rust-rounds/lib/monday/finish"
import { notesNamed } from "@rust-rounds/lib/monday/mailbox"
import {
  heardByNote,
  TranscriptSchema,
  WeekRecordSchema,
} from "@rust-rounds/lib/monday/record"
import type { WeekRecord } from "@rust-rounds/lib/monday/record"
import {
  SAMPLE_BRIEF,
  SAMPLE_NOW,
  SAMPLE_RECORDS,
  SAMPLE_TRANSCRIPTS,
  SAMPLE_VALUES,
} from "@rust-rounds/lib/monday/sample"
import sampleRuns from "@rust-rounds/lib/monday/sample/runs.json"
import type { Values } from "@rust-rounds/lib/monday/values"
import { ValuesSchema } from "@rust-rounds/lib/monday/values"
import { STANDING_OPENING } from "@rust-rounds/lib/opening"
import {
  QUILLMOSS_WEEK,
  QUILLMOSS_WEEK_FILE,
} from "@rust-rounds/lib/sample-week"
import { readWeek, WEEK_V2_MAX_BYTES } from "@rust-rounds/lib/week-check"
import { isRecord } from "@some-ui/core-utils"
import { ESSAY_VOICES_VERSION, parseEssay } from "@some-ui/video-render"
import { describe, expect, it } from "vitest"
import { z } from "zod"

const RUNS: Record<string, RustcRun> = z
  .record(z.string(), RustcRunSchema)
  .parse(sampleRuns)

const samplePrepared = (
  overrides: Partial<Parameters<typeof prepare>[0]> = {}
): Prepared =>
  prepare({
    now: SAMPLE_NOW,
    brief: SAMPLE_BRIEF,
    records: SAMPLE_RECORDS,
    transcripts: SAMPLE_TRANSCRIPTS,
    ...overrides,
  })

const values = (): Values => ValuesSchema.parse(structuredClone(SAMPLE_VALUES))

const record = (): WeekRecord => WeekRecordSchema.parse(SAMPLE_RECORDS[0])

describe("the Monday routine, on the sample week", () => {
  it("turns week 46's record and transcripts into its essay and week 47, both readable", () => {
    const { bundle, history } = samplePrepared()
    expect(bundle.essays.map((e) => e.week)).toEqual(["2026-w46"])
    expect(bundle.waiting).toEqual([])
    expect(bundle.next?.id).toBe("2026-w47")

    const done = finish({ bundle, history, values: SAMPLE_VALUES, runs: RUNS })
    if (!done.ok) throw new Error(done.problems.join("\n"))
    expect(done.files.map((f) => f.name)).toEqual([
      "rust-essay-2026-w46.json",
      "rust-week-2026-w47.json",
    ])
    const [essayFile, weekFile] = done.files
    const essay = parseEssay(JSON.parse(JSON.stringify(essayFile?.body)))
    const week = readWeek(JSON.parse(JSON.stringify(weekFile?.body)))
    if (!essay.ok) throw new Error(essay.problems.join("\n"))
    if (!week.ok) throw new Error(JSON.stringify(week.problems))

    // What home's rust_essays holds the essay to (`essay::against`): a take
    // for each ticket the final answered, a silence for each it didn't.
    expect(essay.value.tickets.map((t) => [t.id, t.answer.kind])).toEqual([
      ["QM-311", "take"],
      ["QM-312", "take"],
      ["QM-313", "silence"],
    ])
    const silence = essay.value.tickets[2]?.answer
    expect(silence?.kind === "silence" && silence.opened).toBe(2)
    expect(essay.value.next.week).toBe("2026-w47")
    // One week of answers: the role line waits for three (RR19, C269).
    expect(essay.value.weeks.role.fits).toBe("Not worked out yet")
    // Every essay takes the voices' version (C841).
    expect(essay.value.template.version).toBe(ESSAY_VOICES_VERSION)
    expect(essay.value.weeks.concepts.map((c) => c.cells)).toEqual([
      [4],
      [4],
      [3],
      ["silent"],
    ])

    expect(week.week.opens).toBe("2026-11-16T00:00:00-08:00")
    expect(week.week.due).toBe("2026-11-22T23:59:00-08:00")
    expect(week.week.references).toEqual([
      "rustonomicon",
      "ownership-inventory",
    ])
    expect(week.week.tickets[2]?.spec).toContain(
      seedLine("2026-11-12T17:04:00.000Z")
    )
    expect(week.week.schema).toBe("some-ui.rust-week/2")
    // The standing set, copied as it stands (C737).
    expect(week.week.opening).toEqual(STANDING_OPENING)
  })

  it("restates what home heard, never words the model wrote, in each answer", () => {
    const { bundle, history } = samplePrepared()
    const done = finish({ bundle, history, values: SAMPLE_VALUES, runs: RUNS })
    if (!done.ok) throw new Error(done.problems.join("\n"))
    const essay = parseEssay(done.files[0]?.body)
    const take = essay.ok ? essay.value.tickets[0]?.answer : undefined
    expect(take?.kind === "take" && take.transcript).toMatch(
      /^Every field becomes its own String/
    )
  })

  it("writes no week home would drop for its size (C700)", () => {
    const { bundle, history } = samplePrepared()
    const big = values()
    if (big.week === null) throw new Error("the sample writes a next week")
    big.week.story = `${big.week.story} ${"x".repeat(WEEK_V2_MAX_BYTES)}`
    const done = finish({ bundle, history, values: big, runs: RUNS })
    expect(done.ok).toBe(false)
    expect(done.ok ? [] : done.problems).toContainEqual(
      expect.stringMatching(
        /^week: the week's file is \d+ bytes; home keeps a some-ui\.rust-week\/2 week of at most 131072/
      )
    )
  })
})

describe("the next Monday, after the sample run (RR19)", () => {
  it("takes next week's topics first from what the decay record marks due", () => {
    const { bundle, history } = samplePrepared()
    const done = finish({ bundle, history, values: SAMPLE_VALUES, runs: RUNS })
    if (!done.ok) throw new Error(done.problems.join("\n"))
    // Week 47 has ended with no record from home yet, so its essay waits.
    const after = samplePrepared({
      now: new Date("2026-11-23T12:00:00Z"),
      brief: [...SAMPLE_BRIEF, ...done.files],
      records: [],
    })
    expect(after.bundle.waiting.map((w) => w.week)).toEqual(["2026-w47"])
    expect(after.bundle.next?.id).toBe("2026-w48")
    expect(after.bundle.due.map((d) => [d.id, d.why])).toEqual([
      // Relational in week 46: box 2, so due again two weeks on.
      ["allocation-on-the-hot-path", "faded"],
      ["lifetime-elision", "faded"],
      // Silent, or below relational: box 1, due the next week it can be.
      ["static-and-threads", "not-answered"],
      ["borrows-into-a-reused-buffer", "not-yet-known"],
    ])
    const topics = after.bundle.next?.topics ?? []
    const room = topics.length
    expect(topics.map((t) => [t.id, t.why])).toEqual(
      after.bundle.due.slice(0, room).map((d) => [d.id, "due"])
    )
  })
})

describe("a week that ended without an essay", () => {
  it("keeps what it asked off the due list only while a run can still write it", () => {
    const { bundle, history } = samplePrepared()
    const done = finish({ bundle, history, values: SAMPLE_VALUES, runs: RUNS })
    if (!done.ok) throw new Error(done.problems.join("\n"))
    // Week 47 asks 'static and threads again, and home never makes it final.
    const brief = done.files.map((file) => {
      if (file.name !== "rust-week-2026-w47.json") return file
      // The file as written (`/2`), edited as a routine would write it.
      const week = WeekV2Schema.parse(file.body)
      const [first, ...rest] = week.tickets
      if (first === undefined) throw new Error("week 47 has no tickets")
      const again = { id: "static-and-threads", name: "'static and threads" }
      return {
        ...file,
        body: {
          ...week,
          tickets: [
            { ...first, concepts: [...first.concepts, again] },
            ...rest,
          ],
        },
      }
    })
    const dueAt = (
      now: string,
      records: ReadonlyArray<unknown> = []
    ): Array<string> =>
      samplePrepared({
        now: new Date(now),
        brief: [...SAMPLE_BRIEF, ...brief],
        records,
      }).bundle.due.map((d) => d.id)
    expect(dueAt("2026-11-23T12:00:00Z")).not.toContain("static-and-threads")
    // Still waiting three weeks on, it no longer holds them.
    expect(dueAt("2026-12-07T12:00:00Z")).toContain("static-and-threads")
    // Written in this very run, however late, its answers are being read.
    const w47 = readWeek(brief.find((f) => f.name.includes("w47"))?.body)
    if (!w47.ok) throw new Error("week 47 isn't readable")
    const final47 = {
      ...record(),
      week: "2026-w47",
      opens: w47.week.opens,
      due: w47.week.due,
      sent: null,
      tickets: w47.week.tickets.map((t) => ({
        ticket: t.id,
        answered: false,
        take: null,
        recordedAt: null,
        opens: 1,
      })),
      unanswered: w47.week.tickets.map((t) => t.id),
      pastes: [],
    }
    const late = samplePrepared({
      now: new Date("2026-12-07T12:00:00Z"),
      brief: [...SAMPLE_BRIEF, ...brief],
      records: [final47],
    })
    expect(late.bundle.essays.map((e) => e.week)).toEqual(["2026-w47"])
    expect(dueAt("2026-12-07T12:00:00Z", [final47])).not.toContain(
      "static-and-threads"
    )
  })
})

describe("prepare", () => {
  it("waits on a week whose record home hasn't made final", () => {
    const draft = { ...record(), closed: false }
    const { bundle } = samplePrepared({ records: [draft] })
    expect(bundle.essays).toEqual([])
    expect(bundle.waiting).toEqual([
      { week: "2026-w46", why: "home's final record of it isn't here" },
    ])
  })

  it("waits on a week whose take home hasn't heard", () => {
    const { bundle } = samplePrepared({
      transcripts: SAMPLE_TRANSCRIPTS.slice(1),
    })
    expect(bundle.waiting).toEqual([
      { week: "2026-w46", why: "home hasn't heard the take on QM-311 yet" },
    ])
    // Next week still goes out, with no seed from a week not yet written up.
    expect(bundle.next?.id).toBe("2026-w47")
    expect(bundle.next?.seeds).toEqual([])
  })

  it("plays each opening answer home resolved and heard, of the week's version, and waits until then (#3269)", () => {
    const asks: readonly [string, string, string] = [
      "What is it?",
      "Why weekly?",
      "Why watch?",
    ]
    const week = {
      ...QUILLMOSS_WEEK,
      opening: {
        version: 2,
        exchanges: asks.map((ask) => ({ ask, script: "paulgsc here." })),
      },
    }
    // Question 1's answer is a take from an earlier week, question 2's from
    // this week, question 3's of the set's older version: it doesn't play.
    const take = (
      n: number,
      from: string,
      version = 2
    ): WeekRecord["opening"][number] => ({
      n,
      take: `note-open-${n}`,
      recordedAt: "2026-11-01T20:00:00.000Z",
      week: from,
      version,
    })
    const opened: WeekRecord = {
      ...record(),
      opening: [
        take(1, "2026-w44"),
        take(2, "2026-w46"),
        take(3, "2026-w46", 1),
      ],
    }
    const heardAnswer = (
      n: number,
      text: string,
      verdict?: unknown
    ): MailboxFile => ({
      name: `transcript-note-open-${n}-1.json`,
      body: {
        ...TranscriptSchema.parse(SAMPLE_TRANSCRIPTS[0]?.body),
        note: `note-open-${n}`,
        ref: `2026-w46:opening:${n}`,
        text,
        ...(verdict === undefined ? {} : { verdict }),
      },
    })
    const said: readonly [string, string] = [
      "paulgsc here. It is a weekly Rust program.",
      "To practise deciding.",
    ]
    const of = (
      files: ReadonlyArray<MailboxFile>,
      held: WeekRecord = opened
    ): ReturnType<typeof openingOf> => openingOf(week, held, heardByNote(files))
    expect(of([heardAnswer(1, said[0])])).toEqual({
      ok: false,
      why: "home hasn't heard the take on the opening's question 2 yet",
    })
    const exchanges = [
      { n: 1, ask: asks[0], transcript: said[0], take: "note-open-1" },
      { n: 2, ask: asks[1], transcript: said[1], take: "note-open-2" },
    ]
    const heard = [heardAnswer(1, said[0]), heardAnswer(2, said[1])]
    expect(of(heard)).toEqual({ ok: true, exchanges })
    // Nothing said in an answer, or nothing made out: it is left out.
    for (const kind of ["nothing_said", "garbled"])
      expect(
        of([heardAnswer(2, "", { kind })], {
          ...opened,
          opening: [take(2, "2026-w46")],
        })
      ).toEqual({ ok: true, exchanges: [] })
    // A week with no opening plays none, whatever home resolved.
    expect(openingOf(QUILLMOSS_WEEK, opened, heardByNote(heard))).toEqual({
      ok: true,
      exchanges: [],
    })
    // The routine pulls every answer's transcript, from any week.
    expect(notesNamed([opened])).toEqual(
      new Set([
        "note-311",
        "note-312",
        "note-p1",
        "note-open-1",
        "note-open-2",
        "note-open-3",
      ])
    )
    // With none to play the essay opens as before; with some, the essay is
    // version 5 and opens on them.
    expect(samplePrepared().bundle.essays[0]?.opening).toBeUndefined()
    const prepared = samplePrepared()
    const ended = prepared.bundle.essays[0]
    if (ended === undefined) throw new Error("no essay owed")
    const done = finish({
      ...prepared,
      bundle: {
        ...prepared.bundle,
        essays: [{ ...ended, opening: { exchanges } }],
      },
      values: SAMPLE_VALUES,
      runs: RUNS,
    })
    if (!done.ok) throw new Error(done.problems.join("\n"))
    const essay = parseEssay(done.files[0]?.body)
    if (!essay.ok) throw new Error(essay.problems.join("\n"))
    expect(essay.value.opening).toEqual({ exchanges })
  })

  it("reads the newest transcript of a note", () => {
    const better = {
      name: "transcript-note-311-2.json",
      body: {
        ...TranscriptSchema.parse(SAMPLE_TRANSCRIPTS[0]?.body),
        text: "Heard again by a better model.",
      },
    }
    const { bundle } = samplePrepared({
      transcripts: [better, ...SAMPLE_TRANSCRIPTS],
    })
    const answer = bundle.essays[0]?.tickets[0]?.answer
    expect(answer?.kind === "take" && answer.transcript).toBe(
      "Heard again by a better model."
    )
  })

  it("owes no essay before the deadline, nor one the mailbox holds", () => {
    const early = samplePrepared({ now: new Date("2026-11-15T12:00:00Z") })
    expect(early.bundle.essays).toEqual([])
    const held = samplePrepared({
      brief: [...SAMPLE_BRIEF, { name: "rust-essay-2026-w46.json", body: {} }],
    })
    expect(held.bundle.essays).toEqual([])
    expect(held.bundle.unread.map((u) => u.name)).toEqual([
      "rust-essay-2026-w46.json",
    ])
  })

  it("writes no next week the mailbox already holds", () => {
    const w47 = {
      ...QUILLMOSS_WEEK_FILE,
      id: "2026-w47",
      opens: "2026-11-16T00:00:00-08:00",
      due: "2026-11-22T23:59:00-08:00",
    }
    const { bundle } = samplePrepared({
      brief: [...SAMPLE_BRIEF, { name: "rust-week-2026-w47.json", body: w47 }],
    })
    expect(bundle.next).toBeNull()
  })

  it(`writes at most ${ESSAYS_MOST} essays a run, oldest first`, () => {
    const weekFile = (
      id: string,
      opens: string,
      due: string
    ): { name: string; body: unknown } => ({
      name: `rust-week-${id}.json`,
      body: { ...QUILLMOSS_WEEK_FILE, id, opens, due },
    })
    const { bundle } = samplePrepared({
      now: new Date("2026-11-30T12:00:00Z"),
      brief: [
        weekFile(
          "2026-w47",
          "2026-11-16T00:00:00-08:00",
          "2026-11-22T23:59:00-08:00"
        ),
        ...SAMPLE_BRIEF,
        weekFile(
          "2026-w48",
          "2026-11-23T00:00:00-08:00",
          "2026-11-29T23:59:00-08:00"
        ),
      ],
    })
    expect([
      ...bundle.essays.map((e) => e.week),
      ...bundle.waiting.map((w) => w.week),
    ]).toEqual(["2026-w46", "2026-w47"])
  })
})

/** The sample's take on QM-311, as home judged it when it made it (HEARD1, paulgsc/server#908). */
const GARBLE = "the the field field sh sh string the the the"
const judged311 = (verdict: unknown, text = GARBLE): MailboxFile => ({
  name: "transcript-note-311-1.json",
  body: {
    ...TranscriptSchema.parse(SAMPLE_TRANSCRIPTS[0]?.body),
    text,
    verdict,
  },
})

/**
 * EH1 (#3072): an essay never reads a take home couldn't make out as an
 * answer, and never waits on one. It is restated as a silence marked
 * unheard, said in code's words, and the decay record counts it as no check.
 * Family: home's verdict (heard, garbled, failed, a kind this build doesn't
 * know, none; nothing said, which is a plain silence); the essay (Rust Rounds here, the interview essay
 * in its own `essay.test.ts`); the item (ticket, pasted error; question,
 * read); and what the routine writes for it (a reading, a guess, nothing).
 * Tolerance: a transcript with no verdict, as every one before HEARD1, reads
 * as heard, garbled or not.
 */
describe("a take home couldn't make out (HEARD2, #3072; EH1)", () => {
  const unheard = (verdict: unknown = { kind: "garbled" }): Prepared =>
    samplePrepared({
      transcripts: [judged311(verdict), ...SAMPLE_TRANSCRIPTS.slice(1)],
    })
  /** The sample's values, with no answer for QM-311: code says what is said over it. */
  const unheardValues = (): Values => {
    const given = values()
    const first = given.essays[0]?.tickets[0]
    if (first === undefined) throw new Error("the sample changed shape")
    delete first.answer
    return given
  }

  it("never holds the essay back, even failed with no words at all", () => {
    const { bundle } = samplePrepared({
      transcripts: [
        judged311({ kind: "failed", reasons: ["engine"] }, ""),
        ...SAMPLE_TRANSCRIPTS.slice(1),
      ],
    })
    expect(bundle.waiting).toEqual([])
    expect(bundle.essays[0]?.tickets[0]?.answer).toEqual({
      kind: "unheard",
      opened: record().tickets[0]?.opens,
    })
  })

  it("never becomes a reading: its words never reach the bundle the essay is built from", () => {
    const prepared = unheard()
    expect(JSON.stringify(prepared.bundle)).not.toContain(GARBLE)
    const done = finish({ ...prepared, values: unheardValues(), runs: RUNS })
    if (!done.ok) throw new Error(done.problems.join("\n"))
    const essay = parseEssay(done.files[0]?.body)
    if (!essay.ok) throw new Error(essay.problems.join("\n"))
    expect(essay.value.tickets[0]?.answer).toEqual({
      kind: "silence",
      opened: record().tickets[0]?.opens,
      unheard: true,
    })
  })

  it("takes no marks, no SOLO level and no guess", () => {
    const prepared = unheard()
    const reading = values()
    const guess = values()
    const silence = guess.essays[0]?.tickets[2]?.answer
    const first = guess.essays[0]?.tickets[0]
    if (first === undefined || silence === undefined) throw new Error("shape")
    first.answer = silence
    const problems = (given: Values): ReadonlyArray<string> => {
      const done = finish({ ...prepared, values: given, runs: RUNS })
      return done.ok ? [] : done.problems
    }
    const why = "QM-311: home couldn't make out the take, so leave answer out"
    expect(problems(reading)).toEqual([why])
    expect(problems(guess)).toEqual([why])
  })

  it("counts in the decay record as neither shown, silent nor decayed (RR19)", () => {
    const prepared = unheard()
    const done = finish({ ...prepared, values: unheardValues(), runs: RUNS })
    if (!done.ok) throw new Error(done.problems.join("\n"))
    const essay = parseEssay(done.files[0]?.body)
    if (!essay.ok) throw new Error(essay.problems.join("\n"))
    const week = prepared.bundle.essays[0]
    if (week === undefined) throw new Error("no essay owed")
    const checked = recordOf([
      judgedWeek(week.week, week.tickets, essay.value.tickets),
    ]).map((concept) => concept.id)
    // QM-311's concepts were checked by nothing that week.
    expect(checked).toEqual([
      "borrows-into-a-reused-buffer",
      "static-and-threads",
    ])
  })

  it("seeds a pasted error without words home couldn't make out", () => {
    const paste = SAMPLE_TRANSCRIPTS[2]
    if (paste === undefined) throw new Error("shape")
    const { bundle } = samplePrepared({
      transcripts: [
        ...SAMPLE_TRANSCRIPTS.slice(0, 2),
        {
          ...paste,
          body: {
            ...TranscriptSchema.parse(paste.body),
            verdict: { kind: "garbled" },
          },
        },
      ],
    })
    expect(bundle.next?.seeds.map((seed) => seed.said)).toEqual([null])
  })

  it("reads as before when home gave no verdict (EH1's tolerance)", () => {
    const { bundle } = unheard(null)
    const answer = bundle.essays[0]?.tickets[0]?.answer
    expect(answer?.kind === "take" && answer.transcript).toBe(GARBLE)
  })

  it("leaves a take home heard nothing in a plain silence, as one left unanswered", () => {
    const { bundle } = samplePrepared({
      transcripts: [
        judged311({ kind: "nothing_said", reasons: [] }, ""),
        ...SAMPLE_TRANSCRIPTS.slice(1),
      ],
    })
    expect(bundle.waiting).toEqual([])
    expect(bundle.essays[0]?.tickets[0]?.answer).toEqual({
      kind: "silence",
      opened: record().tickets[0]?.opens,
    })
  })
})

describe("finish", () => {
  const prepared = samplePrepared()
  const problemsOf = (
    given: unknown,
    runs: Record<string, RustcRun> = RUNS
  ): ReadonlyArray<string> => {
    const done = finish({ ...prepared, values: given, runs })
    return done.ok ? [] : done.problems
  }

  it("refuses a deep dive under two minutes", () => {
    const given = values()
    const dive = given.essays[0]?.tickets[0]?.dives[0]
    if (dive === undefined) throw new Error("the sample changed shape")
    dive.said = "Too short."
    expect(problemsOf(given)).toEqual([
      `QM-311: deep dive 1 is 2 words; a deep dive is ${DIVE_WORDS_LEAST} to 750 (2 to 5 minutes)`,
    ])
  })

  it("refuses a deep dive the essay's frame can't hold, before the put (EF1)", () => {
    const given = values()
    const dive = given.essays[0]?.tickets[0]?.dives[1]
    if (dive === undefined) throw new Error("the sample changed shape")
    // 2026-w46's QM-311 dive 2, which home's recorder refused (#2231).
    dive.shows = [
      "Return `&str` slices: no bytes copied.",
      "Elision ties the slices to `line`.",
      "The caller passes one `Vec`; `clear` keeps its capacity.",
      "Copy out only what must outlive the line.",
    ]
    dive.code = [
      "fn fields<'a>(",
      "    line: &'a str,",
      "    out: &mut Vec<&'a str>,",
      ") {",
      "    out.clear();",
      "    out.extend(",
      "        line.split(',').map(str::trim),",
      "    );",
      "}",
    ].join("\n")
    expect(problemsOf(given)).toEqual([
      expect.stringMatching(
        /^\d{4}-w\d{2} essay: QM-311 deep dive 2 \(dive-2\) runs about \d+ px past the frame: shorten its title, shows or code$/
      ),
    ])
  })

  it("refuses a guess on an answered ticket, and marks on a silence", () => {
    const given = values()
    const [first, , third] = given.essays[0]?.tickets ?? []
    if (first === undefined || third === undefined) throw new Error("shape")
    const reading = first.answer
    first.answer = third.answer
    third.answer = reading
    expect(problemsOf(given)).toEqual([
      "QM-311: answered, so it takes marks and a SOLO level, not a guess",
      "QM-313: left unanswered, so it takes a guess at why, not marks",
    ])
  })

  it("refuses a program whose expect isn't what rustc did", () => {
    const given = values()
    const ticket = given.week?.tickets[1]
    if (ticket === undefined) throw new Error("shape")
    ticket.expect = { outcome: "prints", stdout: "[8, 7]\n" }
    expect(problemsOf(given)).toEqual([
      'week: TB-102\'s program expects {"outcome":"prints","stdout":"[8, 7]\\n"}, and rustc 1.97.0 gave a panic',
    ])
  })

  it("refuses a week whose programs or starters weren't run", () => {
    expect(problemsOf(SAMPLE_VALUES, {})).toEqual([
      "week: TB-101's program hasn't been run with rustc",
      "week: TB-101's exercise 1 (\"A struct of plain fields still moves\") hasn't been run with rustc",
      "week: TB-101's exercise 2 (\"A String field can't be Copy\") hasn't been run with rustc",
      "week: TB-101's exercise 3 (\"Count what a clone costs\") hasn't been run with rustc",
      "week: TB-102's program hasn't been run with rustc",
      "week: TB-102's exercise 1 (\"Two borrows of one RefCell\") hasn't been run with rustc",
      "week: TB-103's program hasn't been run with rustc",
      "week: TB-103's exercise 1 (\"What may cross a thread\") hasn't been run with rustc",
    ])
  })

  it("refuses a starter whose expect isn't what rustc did (#3249)", () => {
    const given = values()
    const exercise = given.week?.tickets[0]?.academy[2]
    if (exercise === undefined) throw new Error("shape")
    exercise.expect = { outcome: "compile-error", code: "E0382" }
    expect(problemsOf(given)).toEqual([
      'week: TB-101\'s exercise 3 ("Count what a clone costs") expects {"outcome":"compile-error","code":"E0382"}, and rustc 1.97.0 gave a run printing "3890 bytes read, 1000 allocations\\n"',
    ])
  })

  it("refuses forks whose questions alone run past the essay's frame", () => {
    const given = values()
    const ticket = given.week?.tickets[1]
    const [fork] = ticket?.forks ?? []
    if (ticket === undefined || fork === undefined) throw new Error("shape")
    const question =
      "How should print and reprint share the log, given a jam can reprint any order while the first print still holds its borrow of it?"
    ticket.forks = Array.from({ length: 6 }, () => ({ ...fork, question }))
    expect(
      problemsOf(given).map((p) => p.replace(/about \d+ px/, "about N px"))
    ).toEqual([
      ...["best", "beside"].map(
        (scene) =>
          `week: TB-102: its 6 speak-to points alone run about N px past the essay's ${scene} scene: shorten them, or ask fewer`
      ),
      "week: TB-102: its question scene runs about N px past the frame: shorten its title, spec, figures or speak-to points",
    ])
    // Four one-line questions leave the essay its room.
    ticket.forks = Array.from({ length: 4 }, () => ({
      ...fork,
      question: "Borrow, clone or take the address?",
    }))
    expect(problemsOf(given)).toEqual([])
  })

  it("refuses next week on readWeek's /2 rules", () => {
    const given = values()
    const fork = given.week?.tickets[0]?.forks[0]
    if (fork === undefined) throw new Error("shape")
    fork.options[1]?.cites.push("F3")
    expect(problemsOf(given)).toEqual([
      'week: tickets[0] ("TB-101").forks[0].options[1] ("B").cites[1]: "F3" is not a constraint this week states for this ticket: cite the SLA\'s rows or the ticket\'s own figures',
    ])
  })

  it("holds every seed and topic to a ticket", () => {
    const given = values()
    const tickets = given.week?.tickets ?? []
    const seeded = tickets[2]
    const topical = tickets[0]
    if (seeded === undefined || topical === undefined) throw new Error("shape")
    delete seeded.seed
    topical.concepts = [
      { id: "drop-order", name: "Drop order and destructors" },
    ]
    expect(problemsOf(given)).toEqual([
      "week: the error pasted at 2026-11-12T17:04:00.000Z seeds 0 tickets; it seeds one",
      "week: no ticket names the topic moves-out-of-collections in its concepts",
    ])
  })

  it("leaves the shape to code: values with a field of the essay's are refused", () => {
    const sample = values()
    const given = {
      ...sample,
      essays: [
        { ...sample.essays[0], company: { name: "Somewhere", about: "x" } },
      ],
    }
    expect(problemsOf(given)).toEqual([
      'values.essays.0: Unrecognized key: "company"',
    ])
  })

  it("leaves the opening to code: values that write one are refused (C737)", () => {
    const sample = values()
    if (sample.week === null) throw new Error("the sample writes a next week")
    const given = {
      ...sample,
      week: { ...sample.week, opening: STANDING_OPENING },
    }
    expect(problemsOf(given)).toEqual([
      'values.week: Unrecognized key: "opening"',
    ])
  })
})

/** Every property name a JSON schema declares, at any depth. */
function keysIn(schema: unknown, names: Set<string>): Set<string> {
  if (Array.isArray(schema)) {
    schema.forEach((item: unknown) => keysIn(item, names))
  } else if (isRecord(schema)) {
    for (const [key, value] of Object.entries(schema)) {
      if (key === "properties" && isRecord(value))
        for (const name of Object.keys(value)) names.add(name)
      keysIn(value, names)
    }
  }
  return names
}

/**
 * RR24 (#3248): a week answered point by point. QM-311 keeps one old take of
 * the whole ticket; QM-312 has none, and every point a take of its own (point
 * 3's home couldn't make out); QM-313 has none, and point 2 alone a take of
 * its own. Each point's take is restated from what home heard in it, and the
 * essay judges each point from the take named for it.
 */
describe("a week answered point by point (RR24)", () => {
  const heard = (
    note: string,
    text: string,
    verdict?: unknown
  ): MailboxFile => ({
    name: `transcript-${note}-1.json`,
    body: {
      ...TranscriptSchema.parse(SAMPLE_TRANSCRIPTS[0]?.body),
      note,
      ref: null,
      text,
      ...(verdict === undefined ? {} : { verdict }),
    },
  })
  const point = (
    n: number,
    take: string
  ): WeekRecord["tickets"][number]["points"][number] => ({
    point: n,
    take,
    recordedAt: "2026-11-14T20:30:00.000Z",
  })
  function byPoints(): Prepared {
    const base = record()
    const [first, second, third] = base.tickets
    if (!first || !second || !third) throw new Error("three tickets")
    return samplePrepared({
      records: [
        {
          ...base,
          tickets: [
            first,
            {
              ...second,
              take: null,
              recordedAt: null,
              points: [
                point(1, "note-312-1"),
                point(2, "note-312-2"),
                point(3, "note-312-3"),
              ],
            },
            { ...third, answered: true, points: [point(2, "note-313-2")] },
          ],
          unanswered: [],
        },
      ],
      transcripts: [
        ...SAMPLE_TRANSCRIPTS,
        heard("note-312-1", "The parse borrows buf, so clear can't run."),
        heard("note-312-2", "An arena keeps the bytes alive."),
        heard("note-312-3", GARBLE, { kind: "garbled" }),
        heard("note-313-2", "scope joins every thread before it returns."),
      ],
    })
  }
  const solo = { level: 3, why: "One reason, joined to the bytes." }
  function pointValues(): Values {
    const given = values()
    const [, second, third] = given.essays[0]?.tickets ?? []
    if (!second || !third) throw new Error("the sample changed shape")
    delete second.answer
    second.points = [
      {
        point: 1,
        mark: "partly",
        note: "Named the borrow, not the clear.",
        solo,
      },
      { point: 2, mark: "partly", solo },
    ]
    third.points = [{ point: 2, mark: "covered", solo: { ...solo, level: 4 } }]
    return given
  }

  it("restates each point's take from what home heard in it", () => {
    const { bundle } = byPoints()
    expect(bundle.waiting).toEqual([])
    const tickets = bundle.essays[0]?.tickets ?? []
    expect(tickets.map((t) => [t.id, t.answer.kind])).toEqual([
      ["QM-311", "take"],
      ["QM-312", "by-points"],
      ["QM-313", "by-points"],
    ])
    expect(tickets[1]?.points).toEqual([
      {
        point: 1,
        answer: {
          kind: "take",
          transcript: "The parse borrows buf, so clear can't run.",
        },
      },
      {
        point: 2,
        answer: { kind: "take", transcript: "An arena keeps the bytes alive." },
      },
      { point: 3, answer: { kind: "unheard", opened: 2 } },
    ])
    expect(JSON.stringify(bundle)).not.toContain(GARBLE)
  })

  it("waits on a point's take home hasn't heard yet", () => {
    const prepared = byPoints()
    const { bundle } = samplePrepared({
      records: [
        WeekRecordSchema.parse({
          ...record(),
          tickets: record().tickets.map((t, i) =>
            i === 2
              ? { ...t, answered: true, points: [point(1, "note-unheard-yet")] }
              : t
          ),
          unanswered: [],
        }),
      ],
    })
    expect(prepared.bundle.waiting).toEqual([])
    expect(bundle.waiting).toEqual([
      {
        week: "2026-w46",
        why: "home hasn't heard the take on point 1 of QM-313 yet",
      },
    ])
  })

  it("writes an essay that judges each point from its own take", () => {
    const done = finish({ ...byPoints(), values: pointValues(), runs: RUNS })
    if (!done.ok) throw new Error(done.problems.join("\n"))
    const essay = parseEssay(done.files[0]?.body)
    if (!essay.ok) throw new Error(essay.problems.join("\n"))
    const [first, second, third] = essay.value.tickets
    expect(first?.answer.kind).toBe("take")
    expect(first?.points.some((p) => p.answer)).toBe(false)
    expect(second?.answer).toEqual({ kind: "silence", opened: 2 })
    expect(second?.points.map((p) => p.answer)).toEqual([
      {
        kind: "take",
        transcript: "The parse borrows buf, so clear can't run.",
        mark: { mark: "partly", note: "Named the borrow, not the clear." },
        solo,
      },
      {
        kind: "take",
        transcript: "An arena keeps the bytes alive.",
        mark: { mark: "partly" },
        solo,
      },
      { kind: "silence", opened: 2, unheard: true },
    ])
    expect(third?.answer.kind === "silence" && third.answer.guess).toBeTruthy()
    expect(third?.points.map((p) => p.answer?.kind)).toEqual([
      undefined,
      "take",
    ])
    // QM-312's concepts at the lowest of its points' levels; QM-313's at point 2's (C685).
    expect(essay.value.weeks.concepts.map((c) => c.cells)).toEqual([
      [4],
      [4],
      [3],
      [4],
    ])
  })

  it("counts a ticket whose every point take home couldn't make out as no check (C431)", () => {
    const silence = { kind: "silence" as const, opened: 1 }
    const unheard = { ...silence, unheard: true as const }
    const guessed = { ...silence, guess: "A guess." }
    const ticket = { id: "QM-1", concepts: [{ id: "a", name: "A" }] }
    const judged = (
      answer: typeof silence | typeof unheard | typeof guessed,
      points: ReadonlyArray<typeof unheard | undefined>
    ): ReadonlyArray<unknown> =>
      judgedWeek(
        "2026-w46",
        [ticket],
        [
          {
            id: "QM-1",
            answer,
            points: points.map((own) => ({
              to: "x",
              best: "y",
              ...(own === undefined ? {} : { answer: own }),
            })),
          },
        ]
      ).tickets
    expect(judged(silence, [unheard, unheard])).toEqual([])
    expect(judged(unheard, [unheard, undefined])).toEqual([])
    // A point left with no take of its own is a silence, not an unheard take.
    expect(judged(guessed, [unheard, undefined])).toHaveLength(1)
  })

  it("refuses a reading that doesn't fit each point's take", () => {
    const problemsOf = (
      change: (given: Values) => void
    ): ReadonlyArray<string> => {
      const given = pointValues()
      change(given)
      const done = finish({ ...byPoints(), values: given, runs: RUNS })
      return done.ok ? [] : done.problems
    }
    const ticket = (
      given: Values,
      i: number
    ): Values["essays"][number]["tickets"][number] => {
      const found = given.essays[0]?.tickets[i]
      if (!found) throw new Error("shape")
      return found
    }
    expect(
      problemsOf((given) => {
        ticket(given, 1).answer = { guess: "A guess." }
        ticket(given, 2).points = []
      })
    ).toEqual([
      "QM-312: every point was answered by a take of its own, so leave answer out",
      "QM-313 point 2: answered by its own take, so it takes a mark and a SOLO level, not nothing",
    ])
    expect(
      problemsOf((given) => {
        ticket(given, 1).points?.push({ point: 3, guess: "A guess." })
        ticket(given, 0).points = [{ point: 1, guess: "A guess." }]
        delete ticket(given, 2).answer
      })
    ).toEqual([
      "QM-311: point 1 wasn't answered by a take of its own, so leave it out of points",
      "QM-312 point 3: home couldn't make out its own take, so leave it out of points",
      "QM-313: some points were left unanswered, so it takes a guess at why, not nothing",
    ])
  })
})

/**
 * RR29 (#3257): the after-deadline best fit of a `/2` week's forks
 * (`some-ui.rust-monday-values/2`). Each listed option is set against the
 * week's stated constraints by id, the best is named, listed or hidden,
 * and nothing rests on a constraint the week didn't state.
 */
describe("a fork's best fit (RR29)", () => {
  /** The sample with QM-311's first point a fork of two options, A recommended. */
  function forked(): Prepared {
    const prepared = structuredClone(samplePrepared())
    const ticket = prepared.bundle.essays[0]?.tickets[0]
    const fork = ticket?.forks[0]
    if (ticket === undefined || fork === undefined) throw new Error("shape")
    const option = (
      id: string,
      recommended: boolean,
      decision: string
    ): ForkOption => ({
      id,
      recommended,
      decision,
      why: "It is argued honestly.",
      model: { id: `model-${id.toLowerCase()}`, name: `Model ${id}` },
      cites: ["S1"],
    })
    Object.assign(fork, {
      options: [
        option("A", true, "Clone each field into a String."),
        option("B", false, "Borrow slices and reuse the buffer."),
      ],
    })
    return prepared
  }
  const figure = (): string => {
    const id = forked().bundle.essays[0]?.tickets[0]?.figures[0]?.id
    if (id === undefined) throw new Error("the sample states a figure")
    return id
  }
  function forkValues(
    best: unknown = { option: "B" }
  ): Record<string, unknown> {
    const given = values()
    const first = given.essays[0]?.tickets[0]
    if (first === undefined) throw new Error("shape")
    return {
      ...given,
      schema: "some-ui.rust-monday-values/2",
      essays: [
        {
          ...given.essays[0],
          tickets: [
            {
              ...first,
              forks: [
                {
                  fork: 1,
                  best,
                  options: [
                    {
                      id: "A",
                      meets: [figure()],
                      breaks: ["S1"],
                      because: "In a few words.",
                    },
                    {
                      id: "B",
                      meets: ["S1"],
                      breaks: [],
                      because: "In a few words.",
                    },
                  ],
                  said: "B meets the SLA; A breaks it.",
                },
              ],
            },
            ...(given.essays[0]?.tickets.slice(1) ?? []),
          ],
        },
      ],
    }
  }
  const problemsOf = (given: unknown): ReadonlyArray<string> => {
    const done = finish({ ...forked(), values: given, runs: RUNS })
    return done.ok ? [] : done.problems
  }

  it("writes the fork into an essay, against the week's stated ids", () => {
    const done = finish({ ...forked(), values: forkValues(), runs: RUNS })
    if (!done.ok) throw new Error(done.problems.join("\n"))
    const essay = parseEssay(done.files[0]?.body)
    if (!essay.ok) throw new Error(essay.problems.join("\n"))
    const [first] = essay.value.tickets
    expect(first?.points[0]?.fork?.best).toEqual({
      kind: "option",
      option: "B",
    })
    expect(
      first?.points[0]?.fork?.options.map((o) => [o.id, o.meets, o.breaks])
    ).toEqual([
      ["A", [figure()], ["S1"]],
      ["B", ["S1"], []],
    ])
    expect(first?.stated?.map((row) => row.id)).toContain("S1")
    expect(first?.stated?.map((row) => row.id)).toContain(figure())
  })

  it("refuses a best fit that moves a goalpost, or names no best", () => {
    const hidden = (meets: Array<string>): unknown => ({
      hidden: {
        decision: "Parse in place with an arena per batch.",
        why: "It meets every stated constraint.",
        model: { id: "arena", name: "An arena per batch" },
        meets,
        breaks: [],
        because: "In a few words.",
      },
    })
    expect(problemsOf(forkValues(hidden(["S1", figure()])))).toEqual([])
    expect(problemsOf(forkValues(null))).not.toEqual([])
    // A /2 week's ticket may have 1 to 6 forks, so 1 to 6 best fits.
    const four = structuredClone(values())
    const first = four.essays[0]?.tickets[0]
    if (first === undefined) throw new Error("shape")
    first.bests = ["One.", "Two.", "Three.", "Four."]
    expect(ValuesSchema.safeParse(four).success).toBe(true)
    expect(problemsOf(values())).toEqual([
      "QM-311 fork 1: it lists options, so it takes a best fit: the best decision and each option's trade",
    ])
    expect(
      problemsOf({ ...forkValues(), schema: "some-ui.rust-monday-values/1" })
    ).not.toEqual([])
  })
})

describe("ROUTINE.md", () => {
  it("names every field the values file has", () => {
    const names = keysIn(
      z.toJSONSchema(ValuesSchema, { io: "input" }),
      new Set()
    )
    expect(names.size).toBeGreaterThan(20)
    const missing = [...names].filter(
      (name) =>
        !ROUTINE.includes(`\`${name}\``) && !ROUTINE.includes(`"${name}"`)
    )
    expect(missing).toEqual([])
  })

  it("names the deep dive's bounds as finish holds them", () => {
    expect(ROUTINE).toContain(`${DIVE_WORDS_LEAST} to ${DIVE_WORDS_MOST} words`)
  })
})

describe("the transcripts monday pull fetches (PN1)", () => {
  /** Every note a record names, found by walking it for its `take` and `note` strings. */
  const named = (value: unknown): Array<string> =>
    Array.isArray(value)
      ? value.flatMap(named)
      : isRecord(value)
        ? Object.entries(value).flatMap(([key, held]) =>
            (key === "take" || key === "note") && typeof held === "string"
              ? [held]
              : named(held)
          )
        : []

  it("names every take and note a record holds: a ticket's, each point's own, a paste's", () => {
    const held = record()
    const [first, ...rest] = held.tickets
    if (first === undefined) throw new Error("no ticket")
    const pointed: WeekRecord = {
      ...held,
      tickets: [
        {
          ...first,
          take: null,
          points: [
            {
              point: 1,
              take: "note-311-1",
              recordedAt: "2026-11-14T20:10:00.000Z",
            },
            {
              point: 2,
              take: "note-311-2",
              recordedAt: "2026-11-14T20:11:00.000Z",
            },
          ],
        },
        ...rest,
      ],
    }
    for (const records of [[held], [pointed], [held, pointed]])
      expect(notesNamed(records)).toEqual(new Set(records.flatMap(named)))
    expect(notesNamed([pointed])).toContain("note-311-2")
  })
})
