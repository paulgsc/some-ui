/**
 * The essay half of the routine (IW6, #2937): a final week with its takes'
 * words is owed an essay whose measured faults and chart are code's; a week
 * whose takes home heard without words waits, and a take home couldn't make
 * out is read as a silence and never waited on (HEARD2); the verbatim decode is read
 * over a plain one; and `finish` builds an essay the format's parser takes,
 * refusing a real employer and words that grade.
 */
import { prepareEssays } from "@interview-week/lib/essay/bundle"
import type { EssayBundle } from "@interview-week/lib/essay/bundle"
import { finishEssays, judgedFaults } from "@interview-week/lib/essay/finish"
import { heardByNote } from "@interview-week/lib/essay/record"
import { ESSAY_VALUES_SCHEMA } from "@interview-week/lib/essay/values"
import type { EssaysValues } from "@interview-week/lib/essay/values"
import { corpus, valuesFor } from "@interview-week/lib/monday/__tests__/fixture"
import { prepare } from "@interview-week/lib/monday/bundle"
import { finish } from "@interview-week/lib/monday/finish"
import type { InterviewWeek } from "@interview-week/lib/week"
import { isRecord } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

/** The week the Monday routine writes from the fixture on Monday `now`. */
function week(now = "2026-11-16T11:41:00Z"): InterviewWeek {
  const { bundle } = prepare({
    now: new Date(now),
    brief: [],
    corpus,
  })
  const done = finish({
    bundle,
    values: valuesFor(bundle),
    resumeEmployers: [],
  })
  if (!done.ok || done.files[0] === undefined)
    throw new Error(done.ok ? "no week" : done.problems.join("\n"))
  return done.files[0].body
}

const W = week()
const [Q1, Q2] = W.questions
const [C1] = W.cards
if (Q1 === undefined || Q2 === undefined || C1 === undefined)
  throw new Error("the fixture's week changed")

/** Words said one a third of a second apart, an "um" among them. */
const said = (
  text: string
): Array<{
  text: string
  startMs: number
  endMs: number
  p: number
}> =>
  text.split(" ").map((word, i) => ({
    text: word,
    startMs: 500 + i * 330,
    endMs: 500 + i * 330 + 250,
    p: 0.9,
  }))

const transcript = (
  note: string,
  text: string,
  model = "whisper+verbatim-1",
  words: unknown = said(text)
): { name: string; body: unknown } => ({
  name: `transcript-${note}-1.json`,
  body: {
    schema: "some-ui.voice-transcript/1",
    note,
    of: "interview",
    at: "2026-11-21T20:12:40.000Z",
    text,
    model,
    words,
  },
})

const record = (
  overrides: Record<string, unknown> = {}
): { weeks: Array<Record<string, unknown>> } & Record<string, unknown> => ({
  schema: "some-ui.routine-index/1",
  routine: "interview",
  asOf: "2026-11-22T23:59:00.000-08:00",
  weeks: [
    {
      week: W.id,
      opens: W.opens,
      due: W.due,
      closed: true,
      sent: null,
      questions: W.questions.map((q, i) => ({
        question: q.id,
        answered: i === 0,
        take: i === 0 ? "note-1" : null,
        recordedAt: i === 0 ? "2026-11-21T20:12:40.000Z" : null,
      })),
      cards: W.cards.map((c, i) => ({
        card: c.id,
        read: i === 0,
        take: i === 0 ? "note-2" : null,
        recordedAt: i === 0 ? "2026-11-21T20:20:00.000Z" : null,
      })),
      unanswered: W.questions.slice(1).map((q) => q.id),
      unread: W.cards.slice(1).map((c) => c.id),
      ...overrides,
    },
  ],
})

const ANSWER = "So um I fixed the take that was lost and it stayed fixed"

const prepared = (
  transcripts = [
    transcript("note-1", ANSWER),
    transcript("note-2", C1.script.replaceAll("\n", " ")),
  ]
): EssayBundle =>
  prepareEssays({
    now: new Date("2026-11-23T11:41:00Z"),
    brief: [{ name: `interview-week-${W.id}.json`, body: W }],
    index: record(),
    transcripts,
  }).bundle

const PART = { mark: "covered" as const, quote: "I fixed the take" }

/** Values for every slot of `bundle`, answered or not. */
function valuesFor_(bundle: EssayBundle): EssaysValues {
  return {
    schema: ESSAY_VALUES_SCHEMA,
    essays: bundle.essays.map((essay) => ({
      week: essay.week,
      open: "The week's company and role were invented.",
      questions: essay.questions.map((q) => ({
        id: q.id,
        question: "The question, said.",
        model: "One way to answer it, made apart from yours.",
        beside: "The model answer beside yours.",
        ...(q.answer.kind === "unheard"
          ? {}
          : {
              answer:
                q.answer.kind === "take"
                  ? {
                      judged: {
                        star: {
                          situation: PART,
                          task: PART,
                          action: PART,
                          result: { mark: "missing", quote: null },
                        },
                        hedges: [],
                        decision: null,
                      },
                      marks: q.guidelines.map(() => ({ mark: "partly" })),
                      said: "Here is what was counted, and what was judged.",
                    }
                  : { guess: "A guess: the week ran out." },
            }),
      })),
      reads: essay.reads.map((r) => ({
        id: r.id,
        card: "Where the read is given.",
        ...(r.answer.kind === "unheard"
          ? {}
          : {
              answer:
                r.answer.kind === "take"
                  ? { change: "Slow the last line.", said: "What was counted." }
                  : { guess: "A guess: not reached." },
            }),
      })),
      weeks: "These are counts, week by week.",
      next: { said: "Next week comes back to results.", topics: ["Results"] },
    })),
  }
}

describe("the essays owed", () => {
  it("restate a final week, with its takes measured by code and its chart drawn", () => {
    const bundle = prepared()
    expect(bundle.waiting).toEqual([])
    const [essay] = bundle.essays
    expect(essay?.week).toBe(W.id)
    expect(essay?.next).toBe("2026-w48")
    const first = essay?.questions[0]
    expect(
      first?.answer.kind === "take" && first.answer.measured.fillers.count
    ).toBe(1)
    expect(essay?.questions[1]?.answer.kind).toBe("silence")
    const read = essay?.reads[0]
    expect(
      read?.answer.kind === "take" && read.answer.measured.misread.skipped
    ).toBe(0)
    expect(essay?.chart.weeks).toEqual([W.id])
    expect(
      essay?.chart.rows.find((r) => r.name === "Fillers a minute")?.cells.length
    ).toBe(1)
  })

  it("are not owed for a week brief already names an essay of, read or not", () => {
    const bundle = prepareEssays({
      now: new Date("2026-11-23T11:41:00Z"),
      brief: [
        { name: `interview-week-${W.id}.json`, body: W },
        { name: `interview-essay-${W.id}.json`, body: { schema: "other" } },
      ],
      index: record(),
      transcripts: [transcript("note-1", ANSWER)],
    }).bundle
    expect([bundle.essays, bundle.waiting]).toEqual([[], []])
  })

  it("chart a week prepared earlier in the same run", () => {
    const next = week("2026-11-23T11:41:00Z")
    const index = record()
    const [first] = index.weeks
    const bundle = prepareEssays({
      now: new Date("2026-11-30T11:41:00Z"),
      brief: [
        { name: `interview-week-${W.id}.json`, body: W },
        { name: `interview-week-${next.id}.json`, body: next },
      ],
      index: {
        ...index,
        weeks: [
          first,
          {
            ...first,
            week: next.id,
            opens: next.opens,
            due: next.due,
            questions: next.questions.map((q) => ({
              question: q.id,
              answered: false,
              take: null,
              recordedAt: null,
            })),
            cards: next.cards.map((c) => ({
              card: c.id,
              read: false,
              take: null,
              recordedAt: null,
            })),
          },
        ],
      },
      transcripts: [
        transcript("note-1", ANSWER),
        transcript("note-2", C1.script.replaceAll("\n", " ")),
      ],
    }).bundle
    expect(bundle.essays.map((e) => e.chart.weeks)).toEqual([
      [W.id],
      [W.id, next.id],
    ])
  })

  it("wait while a take was heard without its words", () => {
    const bundle = prepared([
      transcript("note-1", ANSWER, "whisper", []),
      transcript("note-2", "read"),
    ])
    expect(bundle.essays).toEqual([])
    expect(bundle.waiting[0]?.why).toMatch(/without its words/)
  })

  it("read the verbatim decode over a plain one, whatever its number", () => {
    const heard = heardByNote([
      transcript("n", "verbatim um text"),
      {
        ...transcript("n", "plain text", "whisper"),
        name: "transcript-n-2.json",
      },
    ])
    const got = heard.get("n")
    expect(got?.hearing === "heard" ? got.text : null).toBe("verbatim um text")
  })
})

/** A transcript home judged when it made it (HEARD1, paulgsc/server#908). */
const judged = (
  note: string,
  text: string,
  verdict: unknown
): { name: string; body: unknown } => {
  const file = transcript(note, text)
  return {
    ...file,
    body: { ...(isRecord(file.body) ? file.body : {}), verdict },
  }
}

/** Home's verdict as HEARD1 files it. */
const verdictOf = (kind: string): unknown => ({
  kind,
  reasons: kind === "garbled" ? ["low_confidence"] : [],
  rule: "heard-1",
  signals: null,
})

const GARBLE = "the the borrow um sh sh the the the the"

describe("a take home couldn't make out (HEARD2; EH1)", () => {
  const unheard = (): EssayBundle =>
    prepared([
      judged("note-1", GARBLE, verdictOf("garbled")),
      transcript("note-2", C1.script.replaceAll("\n", " ")),
    ])

  it("never waits: the essay is owed, the take read as a silence", () => {
    const bundle = unheard()
    expect(bundle.waiting).toEqual([])
    expect(bundle.essays[0]?.questions[0]?.answer).toEqual({
      kind: "unheard",
    })
  })

  it("is never read as an answer: its words reach neither bundle nor essay", () => {
    const bundle = unheard()
    expect(JSON.stringify(bundle)).not.toContain(GARBLE)
    const done = finishEssays({
      bundle,
      values: valuesFor_(bundle),
      resumeEmployers: [],
    })
    if (!done.ok) throw new Error(done.problems.join("\n"))
    const essay = done.files[0]?.body
    expect(essay?.questions[0]?.answer).toEqual({
      kind: "silence",
      unheard: true,
    })
    expect(JSON.stringify(essay)).not.toContain(GARBLE)
  })

  it("takes no reading and no guess", () => {
    const bundle = unheard()
    const values = valuesFor_(bundle)
    const question = values.essays[0]?.questions[0]
    if (question === undefined) throw new Error("no question")
    question.answer = { guess: "A guess." }
    const done = finishEssays({ bundle, values, resumeEmployers: [] })
    expect(done.ok ? [] : done.problems).toEqual([
      `essays["${W.id}"].questions["${Q1.id}"].answer: home couldn't make out the take, so leave answer out`,
    ])
  })

  it("is garbled or failed; nothing said is a silence, and no verdict reads as heard", () => {
    const of = (verdict: unknown): unknown =>
      heardByNote([judged("n", "words", verdict)]).get("n")?.hearing
    expect(of(verdictOf("heard"))).toBe("heard")
    expect(of(null)).toBe("heard")
    expect(of(verdictOf("nothing_said"))).toBe("silent")
    for (const kind of ["garbled", "failed"])
      expect(of(verdictOf(kind))).toBe("unheard")
  })

  it("leaves a take home heard nothing in a plain silence, with a guess", () => {
    const bundle = prepared([
      judged("note-1", "", verdictOf("nothing_said")),
      transcript("note-2", C1.script.replaceAll("\n", " ")),
    ])
    expect(bundle.waiting).toEqual([])
    expect(bundle.essays[0]?.questions[0]?.answer).toEqual({ kind: "silence" })
  })
})

describe("the essays finished", () => {
  it("build an essay the format takes, its faults code's", () => {
    const bundle = prepared()
    const done = finishEssays({
      bundle,
      values: valuesFor_(bundle),
      resumeEmployers: [],
    })
    if (!done.ok) throw new Error(done.problems.join("\n"))
    const [file] = done.files
    expect(file?.name).toBe(`interview-essay-${W.id}.json`)
    const answer = file?.body.questions[0]?.answer
    const faults = answer?.kind === "take" ? answer.faults : []
    expect(
      faults.filter((f) => f.by === "measured").map((f) => f.what)
    ).toContain("Fillers")
  })

  it("refuse a real employer, and words that grade", () => {
    const bundle = prepared()
    const values = valuesFor_(bundle)
    const [essay] = values.essays
    if (essay === undefined) throw new Error("no essay")
    essay.open = "A week at Amazon."
    essay.weeks = "You scored well."
    const done = finishEssays({ bundle, values, resumeEmployers: [] })
    expect(done.ok ? [] : done.problems).toEqual([
      `essays["${W.id}"].open: names Amazon, a real employer; the essay names none`,
      `essays["${W.id}"].weeks: reads as a score or a grade; say what was there and what was missing instead`,
    ])
  })
})

describe("a judged quote", () => {
  it("is refused unless the take said it", () => {
    const bundle = prepared()
    const values = valuesFor_(bundle)
    const answer = values.essays[0]?.questions[0]?.answer
    if (answer === undefined || "guess" in answer) throw new Error("no take")
    answer.judged.hedges = ["I worked at a big company"]
    const done = finishEssays({ bundle, values, resumeEmployers: [] })
    expect(done.ok ? [] : done.problems).toEqual([
      `essays["${W.id}"].questions["${Q1.id}"].answer.judged: "I worked at a big company" isn't in the transcript; quote the answer as heard`,
    ])
  })
})

describe("judged faults", () => {
  it("list a missing part before a partial one, STAR only for a time-you question", () => {
    const judged = {
      star: {
        situation: { mark: "partly" as const, quote: "so" },
        task: PART,
        action: PART,
        result: { mark: "missing" as const, quote: null },
      },
      hedges: ["I think"],
      decision: null,
    }
    expect(judgedFaults("a-time-you", judged).map((f) => f.what)).toEqual([
      "Result missing",
      "Hedges",
      "Situation only in part",
    ])
    expect(judgedFaults("why-this-role", judged).map((f) => f.what)).toEqual([
      "Hedges",
    ])
  })
})
