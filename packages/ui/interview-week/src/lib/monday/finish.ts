/**
 * The interview week's `finish` (IW4, #2935): builds next week from the
 * bundle's choices and the model's words, and answers the file to put or
 * every problem, so the model fixes exactly those in its values.
 */
import type { Bundle, WorkEntry } from "@interview-week/lib/monday/bundle"
import {
  MONIKER,
  OPENING_WORDS,
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
import type { InterviewWeek, Ready, WorkSource } from "@interview-week/lib/week"
import {
  CARD_MIN_SECONDS,
  GROUND,
  INTERVIEW_WEEK_SCHEMA,
  OPENING_CARD,
  OPENING_SECONDS,
  readWeek,
  TAKE_MAX_SECONDS,
  workSourceKey,
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
  /** A ready answer's part: a sentence or a few (IW8). */
  part: { min: 6, max: 80 },
  /** The label over a part, like "The options". */
  label: { min: 1, max: 5 },
  /** A note on why a part works, or why a poor answer is poor. */
  note: { min: 4, max: 40 },
  poor: { min: 15, max: 120 },
  /** A cue: a few words to lean on (rung 3). */
  cue: { min: 1, max: 6 },
} as const

/**
 * The most a week's file may weigh as the routine writes it: home refuses a
 * week over 64 KiB (paulgsc/server `interview.rs`, `WEEK_CEILING`).
 */
const WEEK_BYTES_MOST = 64 * 1024

/**
 * How fast an answer is said, for its length against the question's target
 * (IW8): 140 words a minute, a little slower than a read.
 */
export const SAY_WORDS_PER_MINUTE = 140

/**
 * A ready answer's length against its question's target: at least 60% of
 * it, so the answer says enough, and at most all of it, so reading it aloud
 * never runs past (#2931: running past the target is a fault). Another
 * good answer, a different shape, runs from 40% to all of it.
 */
const ANSWER_SHARE = { min: 0.6, max: 1 } as const
const ANOTHER_SHARE = { min: 0.4, max: 1 } as const

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

/**
 * A card's target: its script's words at the read pace (150 to 300 words is
 * 60 to 120 seconds; the opening's 25 to 90, 10 to 36), within its bounds.
 */
const cardSeconds = (script: string, opening: boolean): number => {
  const [min, max] = opening
    ? [OPENING_SECONDS.min, OPENING_SECONDS.max]
    : [CARD_MIN_SECONDS, TAKE_MAX_SECONDS]
  const seconds = Math.round((wordCount(script) / READ_WORDS_PER_MINUTE) * 60)
  return Math.min(Math.max(seconds, min), max)
}

/**
 * What the essay's opening never says (owner, 2026-11-17): no
 * self-assessment, no rating, no "how ready", no end to the practice
 * (C619).
 */
const ASSESSING =
  /\b(?:score[ds]?|scoring|rat(?:e|ed|ing)|grade[ds]?|grading|assess\w*|ready|readiness|pass(?:ed)?|fail(?:ed)?|level|finish(?:ed)? line|the end of|graduat\w*)\b/giu

function checkWords(
  values: WeekValues,
  problems: Array<string>,
  employers: ReadonlyArray<string>,
  next: NonNullable<Bundle["next"]>
): void {
  const { earlierCompanies } = next
  const work = new Map(next.sources.map((s) => [s.key, s]))
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
    const slot = next.questions.find((s) => s.id === q.id)
    if (slot !== undefined) {
      checkReady(
        at,
        q.ready,
        slot.targetSeconds,
        work,
        next.commit,
        problems,
        employer
      )
    }
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
    const opening = card.id === OPENING_CARD
    within(problems, at, card.script, opening ? OPENING_WORDS : SCRIPT_WORDS)
    if (opening) {
      if (!(card.script.split("\n")[0] ?? "").includes(MONIKER)) {
        problems.push(`${at}: the opening says "${MONIKER}" in its first line`)
      }
      for (const [word] of card.script.matchAll(ASSESSING)) {
        problems.push(
          `${at}: "${word}" assesses; the opening says what the week trains, with no rating and no finish line`
        )
      }
    }
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

/**
 * A question's ready answer (IW8): each text's words, its length against the
 * target, and every source in the week's body of work at its commit. A claim
 * with no source is the schema's to refuse (`ReadySchema`).
 */
function checkReady(
  at: string,
  ready: Ready,
  targetSeconds: number,
  work: ReadonlyMap<string, WorkEntry>,
  commit: string,
  problems: Array<string>,
  employer: Array<[string, string]>
): void {
  const sourced = (where: string, sources: ReadonlyArray<WorkSource>): void => {
    sources.forEach((source, k) => {
      const key = workSourceKey(source)
      const entry = work.get(key)
      if (entry === undefined) {
        problems.push(
          `${where}.sources[${k}]: ${key} isn't in the body of work at ${commit.slice(0, 12)}; cite one the bundle's sources list`
        )
      } else if ("path" in source && source.path !== entry.path) {
        problems.push(
          `${where}.sources[${k}]: ${key} is in ${entry.path ?? "no file"}, not ${source.path}`
        )
      }
    })
  }
  const target = (targetSeconds / 60) * SAY_WORDS_PER_MINUTE
  const share = (
    where: string,
    n: number,
    bounds: { readonly min: number; readonly max: number }
  ): void => {
    const min = Math.ceil(target * bounds.min)
    const max = Math.floor(target * bounds.max)
    if (n < min || n > max) {
      problems.push(
        `${where}: ${n} words; at ${SAY_WORDS_PER_MINUTE} a minute against a ${targetSeconds}-second target, write ${min} to ${max}`
      )
    }
  }
  ready.answer.forEach((part, k) => {
    const where = `${at}.ready.answer[${k}]`
    within(problems, `${where}.label`, part.label, WORDS.label)
    within(problems, `${where}.text`, part.text, WORDS.part)
    within(problems, `${where}.note`, part.note, WORDS.note)
    sourced(where, part.sources)
    employer.push(
      [`${where}.label`, part.label],
      [`${where}.text`, part.text],
      [`${where}.note`, part.note]
    )
  })
  share(
    `${at}.ready.answer`,
    ready.answer.reduce((n, part) => n + wordCount(part.text), 0),
    ANSWER_SHARE
  )
  share(
    `${at}.ready.another.text`,
    wordCount(ready.another.text),
    ANOTHER_SHARE
  )
  within(problems, `${at}.ready.another.note`, ready.another.note, WORDS.note)
  sourced(`${at}.ready.another`, ready.another.sources)
  within(problems, `${at}.ready.poor.text`, ready.poor.text, WORDS.poor)
  ready.poor.notes.forEach((note, k) =>
    within(problems, `${at}.ready.poor.notes[${k}]`, note, WORDS.note)
  )
  sourced(`${at}.ready.poor`, ready.poor.sources)
  ready.cues.forEach((cue, k) =>
    within(problems, `${at}.ready.cues[${k}]`, cue, WORDS.cue)
  )
  employer.push(
    [`${at}.ready.another.text`, ready.another.text],
    [`${at}.ready.another.note`, ready.another.note],
    [`${at}.ready.poor.text`, ready.poor.text],
    ...ready.poor.notes.map((note, k): [string, string] => [
      `${at}.ready.poor.notes[${k}]`,
      note,
    ]),
    ...ready.cues.map((cue, k): [string, string] => [
      `${at}.ready.cues[${k}]`,
      cue,
    ])
  )
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
  checkWords(values, problems, [...EMPLOYERS, ...input.resumeEmployers], next)
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
      ground: GROUND[q.family],
      ...(words(q.id) === undefined ? {} : { ready: words(q.id)?.ready }),
      ...(q.call === undefined
        ? {}
        : { source: { kind: "call", id: q.call.id } as const }),
    })),
    cards: next.cards.map((c) => ({
      id: c.id,
      source: c.source,
      situation: c.situation,
      script: scripts(c.id),
      targetSeconds: cardSeconds(scripts(c.id), c.source.kind === "opening"),
    })),
  }
  const read = readWeek(week)
  if (!read.ok) return { ok: false, problems: read.problems }
  // As `jsonText` writes it: two-space indent and a trailing newline.
  const bytes = new TextEncoder().encode(
    `${JSON.stringify(read.week, null, 2)}\n`
  ).length
  if (bytes > WEEK_BYTES_MOST) {
    return {
      ok: false,
      problems: [
        `the week is ${bytes} bytes, and home keeps one of at most ${WEEK_BYTES_MOST}: shorten the ready answers' notes and the poor answers first`,
      ],
    }
  }
  return { ok: true, files: [{ name: weekFileName(week.id), body: read.week }] }
}
