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
 * (Prop. 3.4). Nothing here reads or writes an outcome.
 */

export const WORTHWHILE = ["yes", "somewhat", "no"] as const
export type Worthwhile = (typeof WORTHWHILE)[number]

export const ENTHUSIASM = ["keen", "neutral", "drained"] as const
export type Enthusiasm = (typeof ENTHUSIASM)[number]

export const DIFFICULTY = ["too-easy", "right", "too-hard"] as const
export type Difficulty = (typeof DIFFICULTY)[number]

/**
 * A probe the report names. Its text rides along: lessons are ephemeral, so an
 * id alone would mean nothing to the model that reads the digest next week.
 */
export type SurveyItem = {
  batchId: number
  probeId: string
  source?: string
  prompt?: string
}

type LessonSurvey = {
  worthwhile?: Worthwhile
  /** How keen they are for the next lesson. */
  enthusiasm?: Enthusiasm
  difficulty?: Difficulty
  /** Chosen from the candidates; a miss not chosen is not a report. */
  stuck: Array<SurveyItem>
  /** Answers the learner thinks were keyed wrong - the one check on authoring
   * that lives inside the learner's own loop (canon Rem. 4.7). */
  flagged?: Array<SurveyItem>
  /** Free text: what they feel these lessons are making them into. */
  becoming?: string
}

/** A kept report: the survey, which lesson it was about, and when. */
export type SurveyReport = LessonSurvey & {
  topikKey: string
  /** The lesson's name, for a digest read after the lesson is gone. */
  displayName?: string
  /** The lesson's TOPIK level: the level the learner held when reporting. */
  level?: number
  /** Epoch ms. */
  at: number
}
