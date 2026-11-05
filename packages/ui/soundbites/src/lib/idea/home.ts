/**
 * A sent idea as home keeps it (ST26 (b), #2453; paulgsc/server
 * `handlers::ideas`, `PUT /ideas/:id`): one bundle of what it is and its
 * answers, each said (the voice note of its take now, by id) or typed. It
 * is the body of the send, built from the idea as the phone keeps it and
 * nothing else, so the same idea is always the same body, and home answers
 * one sent again as unchanged.
 *
 * Only an idea sent whole has one (`sent` and `about`): an idea caught one
 * question at a time (ST18) never goes home as a bundle. Claude's questions
 * about an idea (ST19) are the phone's: the question set home knows is the
 * idea's own.
 */
import type { Idea, IdeaFormat, QuestionId } from "./model"
import { isFollowUp } from "./model"
import type { IdeaStore } from "./store"
import { keptIdeaStore } from "./store"

/** One answer, as home takes it: a voice note's id, or typed words. */
type AnswerForHome =
  | { readonly question: QuestionId; readonly note: string }
  | { readonly question: QuestionId; readonly typed: string }

/** `PUT /ideas/:id`'s body. */
export type IdeaForHome = {
  readonly id: string
  /** When the idea was begun: the date it is known by. */
  readonly createdAt: string
  /** When it was last sent. */
  readonly sentAt: string
  readonly title: string
  readonly topic: string
  readonly format: IdeaFormat
  readonly keywords: ReadonlyArray<string>
  /** The question set's version. */
  readonly questions: number
  readonly answers: ReadonlyArray<AnswerForHome>
}

/**
 * `idea` as home keeps it, or null for one that has no bundle to send: not
 * sent whole, or sent with no topic (the lists were empty), which home would
 * refuse.
 */
export function ideaForHome(idea: Idea): IdeaForHome | null {
  const { about } = idea
  const sentAt = idea.sent?.at(-1)
  if (about === undefined || sentAt === undefined || about.topic === null) {
    return null
  }
  const answers = idea.answers.flatMap(
    (answer): ReadonlyArray<AnswerForHome> => {
      const { question } = answer
      if (isFollowUp(question)) return []
      // Words typed beside a take kept unheard (ST34) are home's answer:
      // home takes a note or typed words, never both, so its answer holds
      // the typed words. The take still goes home, let go with the idea
      // (`./bundle`'s `send`), as a voice note no answer on home names.
      const typed = answer.versions
        .filter((version) => version.how === "typed")
        .at(-1)?.words
      const take = answer.takes?.at(-1)
      if (take !== undefined && typed === undefined) {
        return [{ question, note: take.take }]
      }
      const words = typed ?? answer.versions.at(-1)?.words
      return words === undefined || words.trim() === ""
        ? []
        : [{ question, typed: words }]
    }
  )
  return {
    id: idea.id,
    createdAt: idea.at,
    sentAt,
    title: about.title,
    topic: about.topic,
    format: about.format,
    keywords: about.keywords,
    questions: idea.questions,
    answers,
  }
}

/** Each of `ideas` sent whole, as home keeps it, oldest first. */
export function ideasForHome(
  ideas: ReadonlyArray<Idea>
): ReadonlyArray<IdeaForHome> {
  return ideas.flatMap((idea) => {
    const bundle = ideaForHome(idea)
    return bundle === null ? [] : [bundle]
  })
}

/**
 * The ideas kept in `store`, each sent one as home keeps it, read on each
 * call; null when they can't be read. What an idea route hands www's home
 * link (`lib/idea-keeping`).
 */
export function keptIdeasForHome(
  store: IdeaStore = keptIdeaStore()
): () => ReadonlyArray<IdeaForHome> | null {
  return () => {
    const ideas = store.list()
    return ideas === null ? null : ideasForHome(ideas)
  }
}
