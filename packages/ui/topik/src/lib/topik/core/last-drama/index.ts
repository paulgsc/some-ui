/**
 * The last session: a drama played to an ending, as the phone keeps it, and
 * the learner's optional review of it (docs/makjang/README.md, "The last
 * session, and its review"). Pure and total.
 *
 * The record is preference input for the next drama and nothing more. It
 * carries what happened (the scenes reached and the first try at each choice
 * reached) and what the learner said, as text, because the drama is gone by
 * the time the next prompt is read. Nothing here infers a level, and no
 * answer is a claim about the learner: the learner's own model weighs the
 * first tries as the average and the review over them (canon Rem. 4.14).
 */

import { fnv1a } from "@some-ui/core-utils"
import type { DramaState } from "@some-ui/makjang"
import { scenesOf } from "@some-ui/makjang"
import type { DramaLesson } from "@topik/lib/topik/core/drama"
import { isCorrectChoice } from "@topik/lib/topik/core/probe"

export const ENJOYED = ["loved", "fine", "not-for-me"] as const
export type Enjoyed = (typeof ENJOYED)[number]

/** How much Korean the learner is comfortable following next time. */
export const KOREAN = ["easier", "right", "stretch"] as const
export type KoreanNext = (typeof KOREAN)[number]

export const NEXT_MAX = 200

export type DramaReview = {
  enjoyed?: Enjoyed
  korean?: KoreanNext
  /** Scenes to amplify, by id: their feeling and their trope. */
  more?: Array<string>
  /** Free text: where the drama should go (a genre, a trope, a character). */
  next?: string
}

/** A scene the learner reached, as its cover showed it. */
type SceneReached = { id: string; place: string; feeling: string }

/** The first try at a choice reached. */
type FirstTry = {
  choice: string
  /** The choice's prompt, in Korean. */
  prompt: string
  /** The candidate first chosen, as written. */
  chosen: string
  /** Whether that candidate answered the choice. */
  answered: boolean
}

export type LastDrama = {
  lessonId: string
  /**
   * The tree's content, hashed: a model picks the id, so two dramas, or a
   * served one and its reload, can share one.
   */
  content: string
  level: number
  /** The root scene's place: the drama's title. */
  title: string
  /** Epoch ms of the ending, or of the last review change. */
  at: number
  /** Every scene reached on any play, in the tree's order. */
  scenes: Array<SceneReached>
  /** The first try at each choice reached on any play, in the tree's order. */
  tries: Array<FirstTry>
  review?: DramaReview
}

const hashes = new WeakMap<DramaLesson, string>()

const contentOf = (lesson: DramaLesson): string => {
  let hash = hashes.get(lesson)
  if (hash === undefined) {
    hash = fnv1a(JSON.stringify(lesson)).toString(36)
    hashes.set(lesson, hash)
  }
  return hash
}

/** Whether `record` is this drama's, as written now. */
export const isRecordOf = (
  record: LastDrama | null,
  lesson: DramaLesson
): record is LastDrama =>
  record?.lessonId === lesson.id && record.content === contentOf(lesson)

/**
 * The record of `lesson` at its ending. A replay of the same drama keeps
 * what the record already held (the scenes, the first tries, the review),
 * whether or not this play's state still carries it, and adds what this
 * play reached; any other drama's record is replaced.
 */
export function lastDramaOf(
  lesson: DramaLesson,
  drama: DramaState,
  previous: LastDrama | null,
  at: number
): LastDrama {
  const same = isRecordOf(previous, lesson) ? previous : null
  const scenes = scenesOf(lesson.root)
  const reached = new Set(same?.scenes.map(({ id }) => id))
  return {
    lessonId: lesson.id,
    content: contentOf(lesson),
    level: lesson.level,
    title: lesson.root.place,
    at,
    scenes: scenes
      .filter(
        ({ route, scene }) =>
          reached.has(scene.id) ||
          route.every((option, depth) => drama.route[depth] === option)
      )
      .map(({ scene: { id, place, feeling } }) => ({ id, place, feeling })),
    tries: scenes.flatMap(({ scene: { choice } }): Array<FirstTry> => {
      if (choice === undefined) return []
      const kept = same?.tries.find((tried) => tried.choice === choice.id)
      if (kept) return [kept]
      const option = drama.first[choice.id]
      const candidate = choice.check.options.find(({ id }) => id === option)
      return candidate
        ? [
            {
              choice: choice.id,
              prompt: choice.prompt,
              chosen: candidate.text,
              answered: isCorrectChoice(choice.check, candidate),
            },
          ]
        : []
    }),
    ...(same?.review ? { review: same.review } : {}),
  }
}

/**
 * `record` with `change` applied: a field set to `undefined`, an empty list or
 * empty text is cleared, so a learner can take an answer back. Free text is
 * kept as typed.
 */
export function withReview(
  record: LastDrama,
  change: DramaReview,
  at: number
): LastDrama {
  const { enjoyed, korean, more, next } = { ...record.review, ...change }
  const text = next?.slice(0, NEXT_MAX)
  const review: DramaReview = {
    ...(enjoyed ? { enjoyed } : {}),
    ...(korean ? { korean } : {}),
    ...(more && more.length > 0 ? { more } : {}),
    ...(text ? { next: text } : {}),
  }
  const { review: _old, ...rest } = record
  return Object.keys(review).length > 0
    ? { ...rest, at, review }
    : { ...rest, at }
}
