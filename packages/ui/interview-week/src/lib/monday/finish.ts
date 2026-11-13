/**
 * The interview week's `finish` (IW4, #2935): builds next week from the
 * bundle's choices and the model's words, then checks it. It checks the
 * schema (`readWeek`), every slot filled once, each text's length, and that
 * no real employer is named (`employers.ts`). It answers the file to put, or
 * every problem, so the model fixes exactly those in its values.
 */
import type { Bundle } from "@interview-week/lib/monday/bundle"
import {
  READ_WORDS_PER_MINUTE,
  SCRIPT_WORDS,
  weekFileName,
} from "@interview-week/lib/monday/bundle"
import {
  EMPLOYERS,
  employersIn,
  PLATFORMS,
} from "@interview-week/lib/monday/employers"
import { ValuesSchema } from "@interview-week/lib/monday/values"
import type { WeekValues } from "@interview-week/lib/monday/values"
import type { InterviewWeek } from "@interview-week/lib/week"
import {
  CARD_MIN_SECONDS,
  INTERVIEW_WEEK_SCHEMA,
  readWeek,
  TAKE_MAX_SECONDS,
} from "@interview-week/lib/week"

/** Which routine wrote the week. */
const BY = "claude-routine"

/**
 * Each text's bounds in words: short enough to say or read on a phone, long
 * enough to say something. A script's are `SCRIPT_WORDS`.
 */
const WORDS = {
  name: { min: 1, max: 4 },
  about: { min: 8, max: 60 },
  title: { min: 1, max: 8 },
  prompt: { min: 4, max: 50 },
  guideline: { min: 4, max: 40 },
  guidelines: { min: 2, max: 5 },
  /** A script's line: one breath. */
  line: { min: 1, max: 30 },
} as const

/** The words of `text`, as a reader counts them. */
const wordCount = (text: string): number =>
  text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length

function within(
  problems: Array<string>,
  at: string,
  text: string,
  bounds: { readonly min: number; readonly max: number }
): void {
  const n = wordCount(text)
  if (n < bounds.min || n > bounds.max) {
    problems.push(`${at}: ${n} words; write ${bounds.min} to ${bounds.max}`)
  }
}

export type Finished =
  | { ok: true; files: Array<{ name: string; body: InterviewWeek }> }
  | { ok: false; problems: Array<string> }

/** A card's target: its script's words at the read pace, 60 to 120 seconds. */
const cardSeconds = (script: string): number =>
  Math.min(
    TAKE_MAX_SECONDS,
    Math.max(
      CARD_MIN_SECONDS,
      Math.round((wordCount(script) / READ_WORDS_PER_MINUTE) * 60)
    )
  )

function checkWords(
  values: WeekValues,
  problems: Array<string>,
  employers: ReadonlyArray<string>,
  earlierCompanies: ReadonlyArray<string>
): void {
  within(problems, "week.company.name", values.company.name, WORDS.name)
  within(problems, "week.company.about", values.company.about, WORDS.about)
  within(problems, "week.role.title", values.role.title, WORDS.title)
  within(problems, "week.role.about", values.role.about, WORDS.about)
  if (
    earlierCompanies.some(
      (c) => c.toLowerCase() === values.company.name.trim().toLowerCase()
    )
  ) {
    problems.push(
      `week.company.name: "${values.company.name}" was an earlier week's; invent a new one`
    )
  }
  const employer: Array<[string, string]> = [
    ["week.company.name", values.company.name],
    ["week.company.about", values.company.about],
    ["week.role.title", values.role.title],
    ["week.role.about", values.role.about],
  ]
  values.questions.forEach((q, i) => {
    const at = `week.questions[${i}] ("${q.id}")`
    within(problems, `${at}.prompt`, q.prompt, WORDS.prompt)
    const n = q.guidelines.length
    if (n < WORDS.guidelines.min || n > WORDS.guidelines.max) {
      problems.push(
        `${at}.guidelines: ${n}; write ${WORDS.guidelines.min} to ${WORDS.guidelines.max}`
      )
    }
    q.guidelines.forEach((g, j) =>
      within(problems, `${at}.guidelines[${j}]`, g, WORDS.guideline)
    )
    employer.push([`${at}.prompt`, q.prompt])
    q.guidelines.forEach((g, j) => employer.push([`${at}.guidelines[${j}]`, g]))
  })
  for (const [at, text] of employer) {
    for (const name of employersIn(text, [...employers, ...PLATFORMS])) {
      problems.push(
        `${at}: names ${name}, a real employer; the interview is for an invented one`
      )
    }
  }
  values.cards.forEach((card, i) => {
    const at = `week.cards[${i}] ("${card.id}").script`
    within(problems, at, card.script, SCRIPT_WORDS)
    card.script.split("\n").forEach((line, j) => {
      if (wordCount(line) > WORDS.line.max) {
        problems.push(
          `${at}, line ${j + 1}: ${wordCount(line)} words; break a line where a breath belongs, at most ${WORDS.line.max} words`
        )
      }
    })
    for (const name of employersIn(card.script, employers)) {
      problems.push(`${at}: names ${name}, a real employer`)
    }
  })
}

/** The same ids, once each, in any order: what the bundle asks for against what the values fill. */
function checkSlots(
  at: string,
  wanted: ReadonlyArray<string>,
  given: ReadonlyArray<string>,
  problems: Array<string>
): void {
  const seen = new Set<string>()
  for (const id of given) {
    if (!wanted.includes(id))
      problems.push(`${at}: "${id}" isn't one the bundle asks for`)
    else if (seen.has(id)) problems.push(`${at}: "${id}" is written twice`)
    seen.add(id)
  }
  for (const id of wanted) {
    if (!seen.has(id)) problems.push(`${at}: write "${id}", as the bundle asks`)
  }
}

/**
 * Next week from `bundle` and the model's `values`, checked; `employers` are
 * the owner's own (`resumeEmployers`), added to the closed list.
 */
export function finish(input: {
  readonly bundle: Bundle
  readonly values: unknown
  readonly resumeEmployers: ReadonlyArray<string>
}): Finished {
  const parsed = ValuesSchema.safeParse(input.values)
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map(
        (i) => `values.${i.path.join(".")}: ${i.message}`
      ),
    }
  }
  const next = input.bundle.next
  const values = parsed.data.week
  if (next === null || values === null) {
    return next === null && values === null
      ? { ok: true, files: [] }
      : {
          ok: false,
          problems: [
            next === null
              ? "week must be null: the mailbox already holds this week"
              : `week is null, but the bundle asks for ${next.id}`,
          ],
        }
  }
  const problems: Array<string> = []
  checkSlots(
    "week.questions",
    next.questions.map((q) => q.id),
    values.questions.map((q) => q.id),
    problems
  )
  checkSlots(
    "week.cards",
    next.cards.map((c) => c.id),
    values.cards.map((c) => c.id),
    problems
  )
  checkWords(
    values,
    problems,
    [...EMPLOYERS, ...input.resumeEmployers],
    next.earlierCompanies
  )
  if (problems.length > 0) return { ok: false, problems }

  const words = (id: string): WeekValues["questions"][number] | undefined =>
    values.questions.find((q) => q.id === id)
  const scripts = (id: string): string =>
    values.cards.find((c) => c.id === id)?.script ?? ""
  const week: InterviewWeek = {
    schema: INTERVIEW_WEEK_SCHEMA,
    id: next.id,
    by: BY,
    opens: next.opens,
    due: next.due,
    company: values.company,
    role: values.role,
    questions: next.questions.map((q) => ({
      id: q.id,
      family: q.family,
      variant: q.variant,
      prompt: words(q.id)?.prompt ?? "",
      targetSeconds: q.targetSeconds,
      guidelines: words(q.id)?.guidelines ?? [],
      ...(q.call === undefined
        ? {}
        : { source: { kind: "call", id: q.call.id } as const }),
    })),
    cards: next.cards.map((c) => ({
      id: c.id,
      source: c.source,
      situation: c.situation,
      script: scripts(c.id),
      targetSeconds: cardSeconds(scripts(c.id)),
    })),
  }
  const read = readWeek(week)
  if (!read.ok) return { ok: false, problems: read.problems }
  return { ok: true, files: [{ name: weekFileName(week.id), body: read.week }] }
}
