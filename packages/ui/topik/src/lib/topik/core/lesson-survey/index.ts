/**
 * The learner's verdict on a lesson - an evaluation report (adaptive-learning
 * canon Def. 3.3).
 *
 * Its object is the teaching, not the learner's competence. Nothing here
 * claims a lesson taught anything: the claim the system holds is the weaker
 * one, that persistence is how learning happens, so what a lesson owes the
 * learner is a reason to come back. The report asks whether it did - was it
 * worthwhile, how keen are they for the next, how hard it felt, what was
 * blocking, what they feel it is making them into. It never enters a belief
 * (Prop. 3.4); it steers the authoring-time generator that writes the next
 * lessons (Rem. 3.3). Nothing here reads or writes an outcome.
 */

import type { ConversationBatch } from "@topik/lib/topik"
import { anchorOf } from "@topik/lib/topik/core/lesson-track"

export const WORTHWHILE = ["yes", "somewhat", "no"] as const
export type Worthwhile = (typeof WORTHWHILE)[number]

export const ENTHUSIASM = ["keen", "neutral", "drained"] as const
export type Enthusiasm = (typeof ENTHUSIASM)[number]

export const DIFFICULTY = ["too-easy", "right", "too-hard"] as const
export type Difficulty = (typeof DIFFICULTY)[number]

/** A probe the learner may say was blocking them. */
export type StuckCandidate = {
  batchId: number
  probeId: string
  prompt: string
  /** The Korean the probe was about. */
  source: string
}

export type LessonSurvey = {
  worthwhile?: Worthwhile
  /** How keen they are for the next lesson. */
  enthusiasm?: Enthusiasm
  difficulty?: Difficulty
  /** Chosen from the candidates; a miss not chosen is not a report. */
  stuck: Array<{ batchId: number; probeId: string }>
  /** Free text: what they feel these lessons are making them into. */
  becoming?: string
}

/** A phone's dock holds this many chips above its button. */
export const MAX_STUCK_CANDIDATES = 4

export const MAX_BECOMING_LENGTH = 280

/**
 * The probes missed on first presentation, as stuck candidates (canon
 * Cor. 3.4): offered, never presumed. In lesson order, the most recent kept
 * when there are more than a dock can hold.
 */
export function stuckCandidates(
  batches: Array<ConversationBatch>,
  missed: Record<number, Array<string>>
): Array<StuckCandidate> {
  const candidates = batches.flatMap((batch) => {
    const ids = new Set(missed[batch.id] ?? [])
    return (batch.probes ?? []).flatMap((probe): Array<StuckCandidate> => {
      if (!ids.has(probe.id)) return []
      const anchor =
        batch.messages[
          anchorOf(
            { anchorMessageId: probe.anchorMessageId, excerpt: probe.source },
            batch.messages
          )
        ]
      return [
        {
          batchId: batch.id,
          probeId: probe.id,
          prompt: probe.prompt,
          source: probe.source ?? anchor?.korean ?? anchor?.content ?? "",
        },
      ]
    })
  })
  return candidates.slice(-MAX_STUCK_CANDIDATES)
}

/** A report with nothing in it is a skip, and is not kept. */
export function isBlank(survey: LessonSurvey): boolean {
  return (
    survey.worthwhile === undefined &&
    survey.enthusiasm === undefined &&
    survey.difficulty === undefined &&
    survey.stuck.length === 0 &&
    (survey.becoming ?? "").trim() === ""
  )
}
