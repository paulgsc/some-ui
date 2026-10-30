/**
 * A video idea, caught the moment it comes (STUDIO ST18): the same few
 * questions every time, each answered in the owner's own words and kept as
 * text, never as sound.
 *
 * - **The questions are data.** `IDEA_QUESTIONS` is versioned; every idea
 *   names the version it answered, so a change to the questions is a new
 *   version and an older idea still reads. Their words are Studio's
 *   (`../studio/words.ts`, `idea.questions`).
 * - **An idea only grows.** An answer is a list of versions of the words:
 *   what was heard, then any fix, so the first words heard stay beside the
 *   fix. A question passed over is noted, and can still be answered later.
 *   `grows` is the check a write must pass.
 */

/** The questions' version: bump it, and add the new set, to change them. */
export const IDEA_QUESTIONS_VERSION = 1

export const IDEA_QUESTIONS = ["what", "takeaway", "spark", "picture"] as const

export type QuestionId = (typeof IDEA_QUESTIONS)[number]

export function isRequired(question: QuestionId): boolean {
  return question === IDEA_QUESTIONS[0]
}

/** How a version of an answer's words came to be. */
export const WORDS_HOW = ["heard", "typed", "fixed"] as const

export type WordsHow = (typeof WORDS_HOW)[number]

export type AnswerWords = {
  /** ISO time it was kept. */
  readonly at: string
  readonly how: WordsHow
  readonly words: string
}

export type Answer = {
  readonly question: QuestionId
  /** Oldest first; the last is the answer now. Never empty. */
  readonly versions: ReadonlyArray<AnswerWords>
}

export type Idea = {
  /** Letters, digits, underscores and dashes. */
  readonly id: string
  /** ISO time its first answer was kept. */
  readonly at: string
  /** The version of the questions it answers (`IDEA_QUESTIONS_VERSION`). */
  readonly questions: number
  /** In the order they were first kept. */
  readonly answers: ReadonlyArray<Answer>
  /** Questions passed over while it was being caught, in that order. */
  readonly passed: ReadonlyArray<QuestionId>
}

export function answerTo(idea: Idea, question: QuestionId): Answer | undefined {
  return idea.answers.find((answer) => answer.question === question)
}

/**
 * The question the idea is open at: the first neither answered nor passed
 * over, or null once every question has been met.
 */
export function openQuestion(idea: Idea): QuestionId | null {
  return (
    IDEA_QUESTIONS.find(
      (question) =>
        answerTo(idea, question) === undefined &&
        !idea.passed.includes(question)
    ) ?? null
  )
}

/** Questions passed over and still unanswered, in the questions' order. */
export function unanswered(idea: Idea): ReadonlyArray<QuestionId> {
  return IDEA_QUESTIONS.filter(
    (question) =>
      answerTo(idea, question) === undefined && idea.passed.includes(question)
  )
}

/** A new idea, with its first answer. */
export function newIdea(
  id: string,
  at: string,
  question: QuestionId,
  versions: ReadonlyArray<AnswerWords>
): Idea {
  return {
    id,
    at,
    questions: IDEA_QUESTIONS_VERSION,
    answers: [{ question, versions }],
    passed: [],
  }
}

/**
 * `idea` with `versions` added to its answer to `question`: a new answer,
 * or more versions after the ones it holds.
 */
export function withWords(
  idea: Idea,
  question: QuestionId,
  versions: ReadonlyArray<AnswerWords>
): Idea {
  const held = answerTo(idea, question)
  return {
    ...idea,
    answers:
      held === undefined
        ? [...idea.answers, { question, versions }]
        : idea.answers.map((answer) =>
            answer === held
              ? { question, versions: [...answer.versions, ...versions] }
              : answer
          ),
  }
}

/** `idea` with `question` passed over (once). */
export function withPassed(idea: Idea, question: QuestionId): Idea {
  return idea.passed.includes(question)
    ? idea
    : { ...idea, passed: [...idea.passed, question] }
}

function sameWords(a: AnswerWords, b: AnswerWords): boolean {
  return a.at === b.at && a.how === b.how && a.words === b.words
}

/** Whether `after` keeps everything `before` holds, in the same order. */
function ideaGrows(before: Idea, after: Idea): boolean {
  if (
    before.id !== after.id ||
    before.at !== after.at ||
    before.questions !== after.questions
  ) {
    return false
  }
  if (!before.passed.every((question, i) => after.passed[i] === question)) {
    return false
  }
  return before.answers.every((answer, i) => {
    const kept = after.answers[i]
    return (
      kept?.question === answer.question &&
      answer.versions.every((version, j) => {
        const same = kept.versions[j]
        return same !== undefined && sameWords(version, same)
      })
    )
  })
}

/**
 * Whether a write of `after` over `before` only adds: every idea kept, in
 * its place, and each one holding all it held.
 */
export function grows(
  before: ReadonlyArray<Idea>,
  after: ReadonlyArray<Idea>
): boolean {
  return before.every((idea, i) => {
    const kept = after[i]
    return kept !== undefined && ideaGrows(idea, kept)
  })
}
