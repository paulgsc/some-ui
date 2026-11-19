/**
 * The interview essays from the bundle and the model's values (IW6, #2937),
 * checked by the format's own parser (`parseInterviewEssay`). Code writes
 * every measured fault from IW3's measures and turns the model's judged
 * schema into faults; the model's words are only the prose. No essay names a
 * real employer, and none carries a score or a grade.
 */
import type {
  EssayBundle,
  EssayOwed,
  QuestionOwed,
} from "@interview-week/lib/essay/bundle"
import type { EssayValues } from "@interview-week/lib/essay/values"
import { EssaysValuesSchema } from "@interview-week/lib/essay/values"
import { ANSWER_PAUSE_MS } from "@interview-week/lib/faults"
import type {
  AnswerFaults,
  JudgedAnswer,
  JudgedPart,
  ReadFaults,
} from "@interview-week/lib/faults"
import { essayFileName } from "@interview-week/lib/monday/bundle"
import { EMPLOYERS, employersIn } from "@interview-week/lib/monday/employers"
import {
  INTERVIEW_ESSAY_ID,
  INTERVIEW_ESSAY_SCHEMA,
  INTERVIEW_ESSAY_VERSION,
  INTERVIEW_FAULTS_MOST,
  parseInterviewEssay,
} from "@some-ui/video-render"
import type { InterviewEssay, InterviewFault } from "@some-ui/video-render"

/** The most judged faults a take lists; the rest of the frame is the measured ones. */
const JUDGED_MOST = 3

const seconds = (ms: number): string => `${Math.round(ms / 100) / 10}`

/** An answer's measured faults, as code says them. */
function answerFaults(f: AnswerFaults): Array<InterviewFault> {
  const faults: Array<InterviewFault> = [
    {
      by: "measured",
      what: "Fillers",
      // At least: the verbatim decode can miss fillers, until the owner checks it on real takes (#2937).
      shows:
        f.fillers.perMinute === null
          ? `at least ${f.fillers.count}`
          : `at least ${f.fillers.count}, or ${f.fillers.perMinute.toFixed(1)} a minute`,
    },
    {
      by: "measured",
      what: "Length",
      shows: `${seconds(f.length.spokenMs)} seconds of a ${seconds(f.length.targetMs)}-second target${f.length.over ? `, ${seconds(f.length.overMs)} over` : ""}`,
    },
  ]
  if (f.pace.wpm !== null)
    faults.push({
      by: "measured",
      what: "Pace",
      shows: `${Math.round(f.pace.wpm)} words a minute`,
    })
  if (f.pauses.count > 0)
    faults.push({
      by: "measured",
      what: "Pauses",
      shows: `${f.pauses.count} of ${seconds(ANSWER_PAUSE_MS)} seconds or more, the longest ${seconds(f.pauses.longestMs ?? 0)}`,
    })
  if (f.mumbled.count > 0)
    faults.push({
      by: "measured",
      what: "Mumbled",
      shows: `${f.mumbled.count} words heard unsure`,
    })
  return faults
}

/** A read's measured faults, as code says them. */
function readFaults(f: ReadFaults): Array<InterviewFault> {
  const { skipped, substituted, repeated, inserted } = f.misread
  const faults: Array<InterviewFault> = []
  if (skipped + substituted + repeated + inserted > 0)
    faults.push({
      by: "measured",
      what: "Misreads",
      shows: `${skipped} skipped, ${substituted} said as another word, ${repeated} repeated, ${inserted} added`,
    })
  faults.push({
    by: "measured",
    what: "Pauses",
    shows: `${f.pauses.midPhrase} mid-phrase, ${f.pauses.atBreak} at a break`,
  })
  if (f.pace.variation !== null)
    faults.push({
      by: "measured",
      what: "Pace variation",
      shows: `${f.pace.variation.toFixed(2)} across ${f.pace.phrases} phrases: the lower, the flatter`,
    })
  if (f.pace.wpm !== null)
    faults.push({
      by: "measured",
      what: "Pace",
      shows: `${Math.round(f.pace.wpm)} words a minute`,
    })
  if (f.leadInMs !== null)
    faults.push({
      by: "measured",
      what: "Lead-in",
      shows: `${seconds(f.leadInMs)} seconds from the cue to the first word`,
    })
  return faults
}

/** Each judged part: its key, its name on the frame, and what it is in a sentence. */
const STAR = [
  ["situation", "Situation", "the situation"],
  ["task", "Task", "the task"],
  ["action", "Action", "the action taken"],
  ["result", "Result", "the result"],
] as const
const DECISION = [
  ["why", "Why", "why this one was chosen"],
  ["tradeOff", "Trade-off", "the trade-off"],
  ["undo", "Undo", "what would undo it"],
] as const

const partFault = (
  part: JudgedPart,
  name: string,
  says: string
): InterviewFault => ({
  by: "judged",
  what: `${name} ${part.mark === "missing" ? "missing" : "only in part"}`,
  shows:
    part.mark === "missing"
      ? `The answer leaves out ${says}`
      : `The answer gives ${says} only in part`,
  ...(part.quote === null ? {} : { quote: part.quote }),
})

/**
 * An answer's judged faults, missing parts before partial ones: STAR's parts
 * for a "time you" question, a decision's parts for a decision question, and
 * the hedges. At most `JUDGED_MOST`.
 */
export function judgedFaults(
  family: QuestionOwed["family"],
  judged: JudgedAnswer
): Array<InterviewFault> {
  const parts: Array<[JudgedPart, string, string]> = []
  if (family === "a-time-you")
    for (const [key, name, says] of STAR)
      parts.push([judged.star[key], name, says])
  if (judged.decision !== null)
    for (const [key, name, says] of DECISION)
      parts.push([judged.decision[key], name, says])
  const gaps = (mark: string): Array<InterviewFault> =>
    parts
      .filter(([p]) => p.mark === mark)
      .map(([p, name, says]) => partFault(p, name, says))
  const faults = [...gaps("missing")]
  if (judged.decision !== null && judged.decision.options.length < 2)
    faults.push({
      by: "judged",
      what: "Options",
      shows: `${judged.decision.options.length} option named; the choice reads as the only one`,
      ...(judged.decision.options[0] === undefined
        ? {}
        : { quote: judged.decision.options[0] }),
    })
  const [hedge] = judged.hedges
  if (hedge !== undefined)
    faults.push({
      by: "judged",
      what: "Hedges",
      shows: `${judged.hedges.length} in the answer`,
      quote: hedge,
    })
  faults.push(...gaps("partly"))
  return faults.slice(0, JUDGED_MOST)
}

const take = (
  measured: Array<InterviewFault>,
  judged: Array<InterviewFault>
): Array<InterviewFault> => [
  ...measured.slice(0, INTERVIEW_FAULTS_MOST - judged.length),
  ...judged,
]

export type FinishedEssays =
  | {
      readonly ok: true
      readonly files: ReadonlyArray<{ name: string; body: InterviewEssay }>
    }
  | { readonly ok: false; readonly problems: ReadonlyArray<string> }

/** Every quote the judged schema holds: its parts', the hedges and a decision's options. */
const quotesOf = (judged: JudgedAnswer): Array<string> => [
  ...Object.values(judged.star).flatMap((p) => p.quote ?? []),
  ...judged.hedges,
  ...(judged.decision === null
    ? []
    : [
        ...judged.decision.options,
        ...[
          judged.decision.why,
          judged.decision.tradeOff,
          judged.decision.undo,
        ].flatMap((p) => p.quote ?? []),
      ]),
]

/** Words only, lower case: a quote matches the transcript whatever its punctuation. */
const plain = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

/**
 * Whether `quote` is the owner's words: a judged quote is shown in the
 * essay, so it must be found in the transcript, never the model's own
 * words, which the employer check reads instead.
 */
const saidIn = (transcript: string, quote: string): boolean =>
  ` ${plain(transcript)} `.includes(` ${plain(quote)} `)

function build(
  owed: EssayOwed,
  values: EssayValues,
  problems: Array<string>
): InterviewEssay {
  const at = `essays["${owed.week}"]`
  const questions = owed.questions.map(
    (q): InterviewEssay["questions"][number] => {
      const v = values.questions.find((x) => x.id === q.id)
      if (v === undefined) {
        problems.push(`${at}.questions: write "${q.id}", as the bundle asks`)
        return {
          id: q.id,
          prompt: q.prompt,
          guidelines: [...q.guidelines],
          question: { said: "-" },
          answer: { kind: "silence", guess: "-" },
          model: { said: "-" },
          beside: { said: "-" },
        }
      }
      const base = {
        id: q.id,
        prompt: q.prompt,
        guidelines: [...q.guidelines],
        question: { said: v.question },
        model: { said: v.model },
        beside: { said: v.beside },
      }
      if (q.answer.kind === "unheard") {
        if (v.answer !== undefined)
          problems.push(
            `${at}.questions["${q.id}"].answer: home couldn't make out the take, so leave answer out`
          )
        return { ...base, answer: { kind: "silence", unheard: true } }
      }
      if (q.answer.kind === "silence") {
        if (guessOf(v.answer) === undefined)
          problems.push(
            `${at}.questions["${q.id}"].answer: it was left silent, so write {"guess"}`
          )
        return {
          ...base,
          answer: {
            kind: "silence",
            guess: guessOf(v.answer) ?? "-",
          },
        }
      }
      if (v.answer === undefined || "guess" in v.answer) {
        problems.push(
          `${at}.questions["${q.id}"].answer: it was answered, so write {"judged","marks","said"}`
        )
        return { ...base, answer: { kind: "silence", guess: "-" } }
      }
      for (const quote of quotesOf(v.answer.judged))
        if (!saidIn(q.answer.transcript, quote))
          problems.push(
            `${at}.questions["${q.id}"].answer.judged: "${quote}" isn't in the transcript; quote the answer as heard`
          )
      return {
        ...base,
        answer: {
          kind: "take",
          transcript: q.answer.transcript,
          faults: take(
            answerFaults(q.answer.measured),
            judgedFaults(q.family, v.answer.judged)
          ),
          said: v.answer.said,
          marks: v.answer.marks,
        },
      }
    }
  )
  const reads = owed.reads.map((r): InterviewEssay["reads"][number] => {
    const v = values.reads.find((x) => x.id === r.id)
    const base = {
      id: r.id,
      situation: r.situation,
      script: r.script,
      card: { said: v?.card ?? "-" },
    }
    if (v === undefined) {
      problems.push(`${at}.reads: write "${r.id}", as the bundle asks`)
      return { ...base, answer: { kind: "silence", guess: "-" } }
    }
    if (r.answer.kind === "unheard") {
      if (v.answer !== undefined)
        problems.push(
          `${at}.reads["${r.id}"].answer: home couldn't make out the take, so leave answer out`
        )
      return { ...base, answer: { kind: "silence", unheard: true } }
    }
    if (r.answer.kind === "silence") {
      if (guessOf(v.answer) === undefined)
        problems.push(
          `${at}.reads["${r.id}"].answer: it was left unread, so write {"guess"}`
        )
      return {
        ...base,
        answer: {
          kind: "silence",
          guess: guessOf(v.answer) ?? "-",
        },
      }
    }
    if (v.answer === undefined || "guess" in v.answer) {
      problems.push(
        `${at}.reads["${r.id}"].answer: it was read, so write {"change","said"}`
      )
      return { ...base, answer: { kind: "silence", guess: "-" } }
    }
    return {
      ...base,
      answer: {
        kind: "take",
        transcript: r.answer.transcript,
        faults: readFaults(r.answer.measured).slice(0, INTERVIEW_FAULTS_MOST),
        change: v.answer.change,
        said: v.answer.said,
      },
    }
  })
  for (const [list, wanted, written] of [
    [
      "questions",
      owed.questions.map((q) => q.id),
      values.questions.map((q) => q.id),
    ],
    ["reads", owed.reads.map((r) => r.id), values.reads.map((r) => r.id)],
  ] as const)
    for (const id of written)
      if (!wanted.includes(id))
        problems.push(`${at}.${list}: "${id}" is not one the bundle asks for`)
  return {
    schema: INTERVIEW_ESSAY_SCHEMA,
    // An essay with no opening stays version 1, which every stage draws.
    template: {
      id: INTERVIEW_ESSAY_ID,
      version: owed.opening === null ? 1 : INTERVIEW_ESSAY_VERSION,
    },
    week: { id: owed.week, from: owed.from, to: owed.to },
    company: owed.company,
    role: owed.role,
    ...(owed.opening === null ? {} : { opening: owed.opening }),
    open: { said: values.open },
    questions,
    reads,
    weeks: {
      said: values.weeks,
      weeks: [...owed.chart.weeks],
      rows: owed.chart.rows.map((row) => ({ ...row, cells: [...row.cells] })),
    },
    next: {
      said: values.next.said,
      week: owed.next,
      topics: values.next.topics,
    },
  }
}

/** Every string of `values` the model wrote, by where it is. */
function written(values: EssayValues): Array<[string, string]> {
  const out: Array<[string, string]> = [
    ["open", values.open],
    ["weeks", values.weeks],
    ["next.said", values.next.said],
    ...values.next.topics.map((t, i): [string, string] => [
      `next.topics[${i}]`,
      t,
    ]),
  ]
  for (const q of values.questions) {
    const at = `questions["${q.id}"]`
    out.push(
      [`${at}.question`, q.question],
      [`${at}.model`, q.model],
      [`${at}.beside`, q.beside]
    )
    if (q.answer === undefined) continue
    if ("guess" in q.answer) out.push([`${at}.answer.guess`, q.answer.guess])
    else {
      out.push([`${at}.answer.said`, q.answer.said])
      for (const mark of q.answer.marks)
        if (mark.note !== undefined) out.push([`${at}.answer.marks`, mark.note])
    }
  }
  for (const r of values.reads) {
    const at = `reads["${r.id}"]`
    out.push([`${at}.card`, r.card])
    if (r.answer === undefined) continue
    if ("guess" in r.answer) out.push([`${at}.answer.guess`, r.answer.guess])
    else
      out.push(
        [`${at}.answer.change`, r.answer.change],
        [`${at}.answer.said`, r.answer.said]
      )
  }
  return out
}

/** Words that make an answer read as graded, which the essay never does (owner, 2026-11-13). */
const GRADED =
  /\b(correct answer|the right answer|you scored|a score of|graded?|out of (?:ten|10|five|5))\b/i

/** The guess a silence's values give, if they give one. */
const guessOf = (answer: object | undefined): string | undefined =>
  answer !== undefined && "guess" in answer && typeof answer.guess === "string"
    ? answer.guess
    : undefined

/**
 * The essays the bundle owes, from the model's `values`, checked; `employers`
 * are the owner's own (`resumeEmployers`), added to the closed list.
 */
export function finishEssays(input: {
  readonly bundle: EssayBundle
  readonly values: unknown
  readonly resumeEmployers: ReadonlyArray<string>
}): FinishedEssays {
  const parsed = EssaysValuesSchema.safeParse(input.values)
  if (!parsed.success)
    return {
      ok: false,
      problems: parsed.error.issues.map(
        (i) => `values.${i.path.join(".")}: ${i.message}`
      ),
    }
  const problems: Array<string> = []
  const employers = [...EMPLOYERS, ...input.resumeEmployers]
  const files: Array<{ name: string; body: InterviewEssay }> = []
  for (const owed of input.bundle.essays) {
    const values = parsed.data.essays.find((e) => e.week === owed.week)
    if (values === undefined) {
      problems.push(`essays: write "${owed.week}", as the bundle asks`)
      continue
    }
    const at = `essays["${owed.week}"]`
    for (const [where, text] of written(values)) {
      for (const name of employersIn(text, employers))
        problems.push(
          `${at}.${where}: names ${name}, a real employer; the essay names none`
        )
      if (GRADED.test(text))
        problems.push(
          `${at}.${where}: reads as a score or a grade; say what was there and what was missing instead`
        )
    }
    const essay = build(owed, values, problems)
    const checked = parseInterviewEssay(essay)
    if (!checked.ok)
      problems.push(...checked.problems.map((p) => `${at}: ${p}`))
    else files.push({ name: essayFileName(owed.week), body: checked.value })
  }
  for (const values of parsed.data.essays)
    if (!input.bundle.essays.some((e) => e.week === values.week))
      problems.push(`essays: "${values.week}" is not owed`)
  return problems.length > 0 ? { ok: false, problems } : { ok: true, files }
}
