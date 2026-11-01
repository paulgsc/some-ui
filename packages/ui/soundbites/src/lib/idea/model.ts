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
 * - **Claude asks back at most three times** (ST19). A question Claude
 *   asks about an idea is kept on it (`asked`, `ask-1` to `ask-3`, at most
 *   `FOLLOW_UPS.length` in its life) and answered as the idea's own
 *   questions are, so its answer is the owner's words too.
 * - **What Claude made of it is kept beside it** (`drafts`, newest last),
 *   and setting it aside is a mark that can be taken back (`shelved`):
 *   nothing about an idea is let go.
 * - **A new idea is one bundle** (ST26): what it is (`about`: its title,
 *   topic, keywords and format) and its answers, each said as a take
 *   (`takes`) or, only when voice didn't work, typed. It is kept here only
 *   once it is sent (`sent`), whole; until then it is a draft
 *   (`./draft`), which nothing reads but its screen.
 */
import { canonicalJson } from "@some-ui/core-utils"
import type { Primer } from "@soundbites/lib/journal/primer"

/** The questions' version: bump it, and add the new set, to change them. */
const IDEA_QUESTIONS_VERSION = 1

export const IDEA_QUESTIONS = ["what", "takeaway", "spark", "picture"] as const

export type QuestionId = (typeof IDEA_QUESTIONS)[number]

/** Claude's questions back about an idea (ST19), in the order asked. */
export const FOLLOW_UPS = ["ask-1", "ask-2", "ask-3"] as const

type FollowUpId = (typeof FOLLOW_UPS)[number]

/** Anything an idea's answer answers: one of its questions, or Claude's. */
export const ANSWER_TO = [...IDEA_QUESTIONS, ...FOLLOW_UPS] as const

export type AnswerTo = (typeof ANSWER_TO)[number]

export function isFollowUp(question: AnswerTo): question is FollowUpId {
  return FOLLOW_UPS.some((each) => each === question)
}

export function isRequired(question: AnswerTo): boolean {
  return question === IDEA_QUESTIONS[0]
}

/** How a version of an answer's words came to be. */
export const WORDS_HOW = ["heard", "typed", "fixed"] as const

type WordsHow = (typeof WORDS_HOW)[number]

export type AnswerWords = {
  /** ISO time it was kept. */
  readonly at: string
  readonly how: WordsHow
  readonly words: string
}

/** A take said for an answer (ST26): its id on this phone's desk of takes. */
export type AnswerTake = {
  /** ISO time it was recorded. */
  readonly at: string
  readonly take: string
}

type Answer = {
  readonly question: AnswerTo
  /**
   * Oldest first; the last is the answer's words now. Empty only for an
   * answer said as a take whose words home hasn't given back (ST26).
   */
  readonly versions: ReadonlyArray<AnswerWords>
  /** The takes said for it, oldest first; the last is its take now (ST26). */
  readonly takes?: ReadonlyArray<AnswerTake>
}

/** What a video is made for (ST26): a Short (vertical) or a Video (wide). */
export const IDEA_FORMATS = ["short", "video"] as const

export type IdeaFormat = (typeof IDEA_FORMATS)[number]

/** The longest title, on this phone as on home (the owner, #2453). */
export const TITLE_MAX = 80

/** The longest typed answer, on this phone as on home. */
export const TYPED_MAX = 1_000

/** What an idea is (ST26), as its owner said before sending it. */
export type IdeaAbout = {
  /** One to `TITLE_MAX` characters, trimmed. */
  readonly title: string
  /** One of the topics kept on home (the owner's word is "subject"). */
  readonly topic: string | null
  /** Picked from the keywords kept on home, each once. */
  readonly keywords: ReadonlyArray<string>
  readonly format: IdeaFormat
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
  readonly passed: ReadonlyArray<AnswerTo>
  /** Claude's questions back (ST19), in the order asked; absent until one is. */
  readonly asked?: ReadonlyArray<FollowUp>
  /** What Claude made of it, oldest first; absent until it made something. */
  readonly drafts?: ReadonlyArray<Draft>
  /** Each time it was set aside or brought back, in order. */
  readonly shelved?: ReadonlyArray<Shelving>
  /** What it is (ST26), once it was sent as one bundle. */
  readonly about?: IdeaAbout
  /** Each time it was sent as one bundle (ST26), as ISO times, in order. */
  readonly sent?: ReadonlyArray<string>
}

/** A question Claude asked back about an idea. */
type FollowUp = {
  readonly id: FollowUpId
  /** ISO time it reached the phone. */
  readonly at: string
  readonly words: string
}

/** The scenes Claude fleshed an idea out into: a primer naming the idea. */
export type Draft = {
  /** ISO time it reached the phone. */
  readonly at: string
  readonly primer: Primer
}

type Shelving = {
  readonly at: string
  readonly aside: boolean
}

function answerTo(idea: Idea, question: AnswerTo): Answer | undefined {
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

/**
 * The first of Claude's questions about the idea neither answered nor passed
 * over, or null when none waits.
 */
export function openFollowUp(idea: Idea): FollowUpId | null {
  return (
    (idea.asked ?? []).find(
      (asked) =>
        answerTo(idea, asked.id) === undefined &&
        !idea.passed.includes(asked.id)
    )?.id ?? null
  )
}

/**
 * Claude's questions still waiting on an answer: neither answered nor
 * skipped. A skipped one waits on nothing, as a skipped question of the
 * idea's own doesn't (`skippedAsks`).
 */
export function waiting(idea: Idea): number {
  return (idea.asked ?? []).filter(
    (asked) =>
      answerTo(idea, asked.id) === undefined && !idea.passed.includes(asked.id)
  ).length
}

/** Claude's questions skipped and still unanswered, in the order asked. */
export function skippedAsks(idea: Idea): ReadonlyArray<FollowUpId> {
  return (idea.asked ?? []).flatMap((asked) =>
    answerTo(idea, asked.id) === undefined && idea.passed.includes(asked.id)
      ? [asked.id]
      : []
  )
}

/** The words of the idea's answer to `question` now, if it has one. */
export function wordsFor(idea: Idea, question: AnswerTo): string | null {
  return answerTo(idea, question)?.versions.at(-1)?.words ?? null
}

/** The idea's first answer now: what the video is. */
function firstWords(idea: Idea): string {
  return idea.answers[0]?.versions.at(-1)?.words ?? ""
}

/** What the idea is called: its title (ST26), or else its first answer. */
export function ideaName(idea: Idea): string {
  return idea.about?.title ?? firstWords(idea)
}

/** What Claude made of the idea last, if it made anything. */
export function latestDraft(idea: Idea): Draft | null {
  return idea.drafts?.at(-1) ?? null
}

export function isAside(idea: Idea): boolean {
  return idea.shelved?.at(-1)?.aside === true
}

/**
 * Where an idea is, in the owner's terms: just the idea, fleshed out (Claude
 * made scenes of it), a video (a project was started from it, by the ids in
 * `videos`), or set aside, which outranks the rest and is only ever a mark.
 */
export type IdeaStage = "idea" | "fleshed" | "video" | "aside"

export function stageOf(idea: Idea, videos: ReadonlySet<string>): IdeaStage {
  if (isAside(idea)) return "aside"
  if (videos.has(idea.id)) return "video"
  return latestDraft(idea) === null ? "idea" : "fleshed"
}

/**
 * `idea` with what Claude sent added: its scenes as the newest draft, and
 * its questions after any asked before. A question in words already asked,
 * and scenes the same as the latest draft, are kept already, so they add
 * nothing. Null when that would take Claude past three questions, or when
 * nothing is new.
 */
export function withReply(
  idea: Idea,
  reply: {
    readonly primer: Primer | null
    readonly ask: ReadonlyArray<string>
  },
  at: string
): Idea | null {
  const asked = idea.asked ?? []
  const fresh = newAsks(idea, reply.ask)
  const more = fresh.flatMap((words, i): ReadonlyArray<FollowUp> => {
    const id = FOLLOW_UPS[asked.length + i]
    return id === undefined ? [] : [{ id, at, words }]
  })
  if (more.length < fresh.length) return null
  const primer =
    reply.primer === null ? null : { ...reply.primer, idea: idea.id }
  const draft =
    primer === null || isLatestDraft(idea, primer) ? [] : [{ at, primer }]
  if (draft.length === 0 && more.length === 0) return null
  return {
    ...idea,
    ...(more.length === 0 ? {} : { asked: [...asked, ...more] }),
    ...(draft.length === 0
      ? {}
      : { drafts: [...(idea.drafts ?? []), ...draft] }),
  }
}

/** The questions in `ask` not asked about `idea` yet, each once. */
export function newAsks(
  idea: Idea,
  ask: ReadonlyArray<string>
): ReadonlyArray<string> {
  const known = new Set((idea.asked ?? []).map((each) => each.words.trim()))
  return ask.filter((words) => {
    const trimmed = words.trim()
    if (known.has(trimmed)) return false
    known.add(trimmed)
    return true
  })
}

/** Whether `primer` is the idea's latest draft, read the same. */
function isLatestDraft(idea: Idea, primer: Primer): boolean {
  const latest = latestDraft(idea)
  return (
    latest !== null && canonicalJson(latest.primer) === canonicalJson(primer)
  )
}

/** `idea` set aside, or brought back; unchanged when it already is. */
export function withAside(idea: Idea, aside: boolean, at: string): Idea {
  return isAside(idea) === aside
    ? idea
    : { ...idea, shelved: [...(idea.shelved ?? []), { at, aside }] }
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
  question: AnswerTo,
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
  question: AnswerTo,
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
export function withPassed(idea: Idea, question: AnswerTo): Idea {
  return idea.passed.includes(question)
    ? idea
    : { ...idea, passed: [...idea.passed, question] }
}

function sameWords(a: AnswerWords, b: AnswerWords): boolean {
  return a.at === b.at && a.how === b.how && a.words === b.words
}

/** Whether `after` starts with every entry of `before`, each as it was. */
function keepsAll<T>(
  before: ReadonlyArray<T> | undefined,
  after: ReadonlyArray<T> | undefined
): boolean {
  return (before ?? []).every(
    (each, i) =>
      after?.[i] !== undefined &&
      canonicalJson(after[i]) === canonicalJson(each)
  )
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
  if (
    !keepsAll(before.asked, after.asked) ||
    !keepsAll(before.drafts, after.drafts) ||
    !keepsAll(before.shelved, after.shelved) ||
    !keepsAll(before.sent, after.sent) ||
    (after.asked?.length ?? 0) > FOLLOW_UPS.length
  ) {
    return false
  }
  // What an idea is stays as it was sent.
  if (
    before.about !== undefined &&
    (after.about === undefined ||
      canonicalJson(before.about) !== canonicalJson(after.about))
  ) {
    return false
  }
  return before.answers.every((answer, i) => {
    const kept = after.answers[i]
    return (
      kept?.question === answer.question &&
      keepsAll(answer.takes, kept.takes) &&
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
