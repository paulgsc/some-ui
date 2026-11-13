import ROUTINE from "@rust-rounds-root/ROUTINE.md?raw"
import type { RustcRun } from "@rust-rounds/lib/formats"
import { RustcRunSchema } from "@rust-rounds/lib/formats"
import type { Prepared } from "@rust-rounds/lib/monday/bundle"
import { ESSAYS_MOST, prepare } from "@rust-rounds/lib/monday/bundle"
import {
  DIVE_WORDS_LEAST,
  DIVE_WORDS_MOST,
  finish,
  seedLine,
} from "@rust-rounds/lib/monday/finish"
import {
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
import { QUILLMOSS_WEEK } from "@rust-rounds/lib/sample-week"
import { readWeek } from "@rust-rounds/lib/week-check"
import { isRecord } from "@some-ui/core-utils"
import { parseEssay } from "@some-ui/video-render"
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
    expect(essay.value.template.version).toBe(1)
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
    const w47 = done.files.find((f) => f.name === "rust-week-2026-w47.json")
    const checked = readWeek(w47?.body)
    if (!checked.ok) throw new Error("week 47 isn't readable")
    const pending = new Set(
      checked.week.tickets.flatMap((t) => t.concepts.map((c) => c.id))
    )
    // What week 47 asked waits for its own answer, so isn't due.
    expect(after.bundle.due.map((d) => [d.id, d.why])).toEqual([
      // Relational in week 46: box 2, so due again two weeks on.
      ["allocation-on-the-hot-path", "faded"],
      ["lifetime-elision", "faded"],
      // Below relational, or silent: box 1, due the next week it can be.
      ["borrows-into-a-reused-buffer", "not-yet-known"],
      ["static-and-threads", "not-yet-known"],
    ])
    expect(after.bundle.due.some((d) => pending.has(d.id))).toBe(false)
    const topics = after.bundle.next?.topics ?? []
    const room = topics.length
    expect(topics.map((t) => [t.id, t.why])).toEqual(
      after.bundle.due.slice(0, room).map((d) => [d.id, "due"])
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
      ...QUILLMOSS_WEEK,
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
      body: { ...QUILLMOSS_WEEK, id, opens, due },
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
      'week: TB-102 expects {"outcome":"prints","stdout":"[8, 7]\\n"}, and rustc 1.97.0 gave a panic',
    ])
  })

  it("refuses a week whose programs weren't run", () => {
    expect(problemsOf(SAMPLE_VALUES, {})).toEqual([
      "week: TB-101's program hasn't been run with rustc",
      "week: TB-102's program hasn't been run with rustc",
      "week: TB-103's program hasn't been run with rustc",
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
